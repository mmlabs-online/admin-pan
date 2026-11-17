## PAN-012c: security consult (appsec-engineer, PLAN)

I checked the admin-pan working tree and org-admin-api `b87f200` (`app/modules/auth/deps.py`, `router.py`). I edited nothing. I didn't run tests.

### Findings
1. **Attack surface removed.** Admin no longer calls the email-taking endpoint `POST /auth/password/forgot`, which needed `X-MM-App` + Turnstile. Four things go with it:
   - the forgot form and its email input;
   - the second Turnstile widget instance;
   - `forgotPassword()` and its `as never` cast that drops the header type (`src/api/public-auth.ts:13-21`);
   - `useForgotPasswordMutation` (`src/features/auth/api/mutations.ts:18-25`).

   The API already refuses this for `admin` (`get_mail_link_app_context`, `deps.py:84`, which returns the same 403 as an unknown app, so there is no oracle). The change is a cleanup with no new exposure.
2. **Links already in mailboxes keep working.** `POST /auth/password/reset` and `POST /auth/verify-email` (`router.py:273`, `router.py:372`) take only a rate limit and the token in the body. They need no `X-MM-App`, `Origin` or cookie. The client paths stay unchanged: `isPublicAuthPath` and the forced `credentials: 'omit'` (`src/api/client.ts:8`, `:40`).
   - **Verify links:** new ones can still point to admin's origin, because USR-12 resend uses `get_resend_link_origin`, which accepts `admin` (`deps.py:115`). `/verify-email` must stay.
   - **Reset links:** new ones can never point to admin, because forgot is refused. Only links mailed before ADM-002d land on admin's `/reset-password`, and they expire with the reset-token TTL. Keeping the page is harmless (see follow-ups).
3. **Two reset-password links point to `/forgot-password`.** `src/features/auth/reset-password/components/reset-password-form.tsx:31` ("Forgot password", invalid link) and `:109` ("Request a new link", expired). Ticket AC4 says "stay as they are", but these labels promise a request flow that no longer exists. Either change the copy, or keep the links and make sure the notice page makes sense when reached from them. Update the tests at `reset-password-form.test.tsx:84` and `:141` to match.
4. **Turnstile and CSP cannot be narrowed.** The sign-in form still renders Turnstile (`src/features/auth/sign-in/components/user-auth-form.tsx:24`, `:65-93`), so keep the following in `nginx/security-headers.conf`:
   - `script-src https://challenges.cloudflare.com`
   - `frame-src https://challenges.cloudflare.com`
   - `VITE_TURNSTILE_SITE_KEY`, `src/components/turnstile.tsx` and `src/lib/turnstile-loader.ts`

   `connect-src` is unchanged. There is nothing to narrow here.
5. **R3 wording should change.** It currently lists "forgot-password, reset-password, verify-email" as flows that may call the API through `src/api/`. Narrowing it to what is actually used is least privilege. Suggested wording: "Exception (owner, 2026-11-15, PAN-012; narrowed PAN-012c): the token-credential public flows reset-password and verify-email may call the API through `src/api/` with `credentials: 'omit'` and no `Authorization` header. `/forgot-password` is a static notice that calls nothing." This is a `CLAUDE.md` edit, so the owner should approve it.

### Recommendations
- **Notice page:**
  - Static text only. No form, no `useMutation`, no `<Turnstile>`, no reads of query params.
  - No link to a specific app, per the owner. A plain `/sign-in` link is fine.
  - Add a test that asserts zero `fetch` calls and no `textbox`.
- **Remove** `ForgotPasswordRequest` usage, the `Forgot` types, the `forgotPassword` export (`src/api/index.ts:12`), its cases in `public-auth.test.ts`, and the "forgot" case in `mutations.test.tsx`. Update the header comment in `public-auth.ts:1`.
- **Do not change** `isPublicAuthPath`. It still covers reset and verify, and the 401-not-a-session-expiry behaviour still applies to them.
- **Keep** `/forgot-password` in `src/lib/safe-redirect.ts:5` `AUTH_PAGES`, so the route still can't be a post-login target. Keep it in nginx `default.conf:29` and in `scripts/smoke-image.sh:100`. A `no-store` header on a static page is harmless, and the smoke check still asserts the full security headers there.
- **Comment fixes:**
  - `.env.example:8` says the Turnstile key is "for the forgot-password page"; it should say "sign-in".
  - Spec §5.1 (`docs/spec-v1.md:36`): drop "(Turnstile, same answer for any email)" and the `/auth/password/forgot` API reference; describe `/forgot-password` as a static notice.
- **PAN-012b copy** (`src/features/auth/verify-email/components/verify-email-panel.tsx:23`, `:86`; test `verify-email.test.tsx:177`): don't name a button that PAN-010b hasn't shipped. Something like "This link is invalid, expired or already used. Sign in to get a new verification email." is true today: signing in reaches the email-unverified gate, and the resend button there arrives with PAN-010b. Avoid the words "Send the link again" until then.

### Risks
- Low. The main one is a dangling flow: users following the reset-password "Request a new link" link to a page that can't do it. This is a UX and trust issue, not a vulnerability.
- If the notice page reused `forgot-password/components/*`, a leftover Turnstile or mutation import could keep dead code in the bundle. Delete the folder's form component and its test entirely.

### Open questions
1. Does the owner want `reset-password-form.tsx:31` and `:109` relabelled (e.g. "How to reset your password", linking to the notice), or left exactly as they are under AC4?
2. Should the R3 exception text in `CLAUDE.md` be narrowed in this PR (my recommendation), or in a separate `/solo` with owner sign-off?

### Follow-ups (out of scope)
- Since no new reset links can target admin's origin, admin's `/reset-password` page only serves mails sent before ADM-002d. Once those tokens have expired it could be retired too. Check the reset-token TTL in org-admin-api before proposing it.
