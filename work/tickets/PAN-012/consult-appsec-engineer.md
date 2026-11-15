# PAN-012 security consult (PLAN stage, appsec-engineer)

PAN-012 can be done safely, but two scope questions need the owner first (Q1 and Q2 below).
- **Fits the PAN-009 client:** three of the four endpoints (forgot, reset, verify) need no cookie and no admin token, so `credentials: 'omit'` works for them. Two small changes in `src/api/` are needed first: R-1 and R-2.
- **Does not fit:** resend is a cookie-class call that needs `account_id`, which only auth-client provides. It collides with the owner's PAN-010 decision ("no interim hand-written auth module").

## Findings

**F1 — The API's link format is fixed, so the route paths are fixed too.**
- Reset links are `{origin}/reset-password#token=…` (`org-admin-api/app/modules/auth/password_reset.py:32,81`).
- Verify links are `{origin}/verify-email#token=…` (`email_verification.py:32,91`).
- `docs/consumers.md:74-90,128-145` says every registered origin of an app must serve exactly these two paths.
- admin-pan has neither route today (`src/routes/(auth)/` only has `sign-in` and `forgot-password`). Both must sit outside the auth guard (R3 allows this).
- The token travels in the URL fragment. Browsers never send the fragment to a server or put it in `Referer`, so server logs and Referer are already safe. What remains is browser history, any script on the page (including third-party scripts), and our own code copying `location.href` around.

**F2 — Forgot has extra requirements; reset and verify do not.**
- **Forgot** requires `X-MM-App` plus an `Origin` registered on app `admin`. Otherwise it answers 403 `app_header_required` or `origin_not_allowed` (`router.py:329-363`).
- **Forgot** always requires a Turnstile token (`password_reset.py:62`). Its response is always 202 for any email. Only the per-IP limit is visible as a 429; per-email limits are silent.
- **Reset and verify** are public: no cookie, no `X-MM-App`, no Turnstile check. The `verifier` argument on reset is injected but never used.
- **CORS on `/api/v1/auth/*`** (`app/core/cors.py`):
  - The preflight allows only the `content-type` and `x-mm-app` request headers, **not `authorization`**.
  - The allowed origin is echoed back and `Retry-After` is readable from the page.
  - `credentials: 'omit'` works with this setup. `consumers.md` says to use `include` "so CORS answers the preflight", but that is not needed: the preflight is answered either way.

**F3 — Once a token exists, the PAN-009 client will break these calls and leak the token to them.**
- `src/api/client.ts:51-52` attaches `Authorization: Bearer` whenever the token provider returns a token.
- Today the provider returns null, so nothing happens. After PAN-010, a signed-in staff member who opens a verify link (or any `/auth/*` call through this client) would:
  - fail the preflight, because `authorization` is not an allowed header;
  - send the `aud=admin` token to endpoints that do not need it.
- Also, the client never sends `X-MM-App`, which forgot needs.

**F4 — Resend needs a cookie and `account_id`, which only auth-client has.**
- `POST /verify-email/resend` needs the `__Host-mm_device` cookie (`credentials: 'include'`), `X-MM-App`, and `account_id` (the persisted `mm_account_id`) (`router.py:294-324`).
- The PAN-009 client forces `credentials: 'omit'` (`client.ts:29`), on purpose (ADR-0008 §1).
- `consumers.md:91` says that after a verify, a signed-in user should fetch a new `/token`. That is also an auth-client job.
- **USR-08's scope does not include forgot, reset, verify or resend.** It covers signup, login, listAccounts, getToken, join and logout (`org-admin-api/work/tickets/USR-08/ticket.md`).
- So if PAN-012 builds resend or the token refresh now, that is exactly the interim hand-written auth module the owner rejected (PAN-010 notes, 2026-11-15).

**F5 — The reset page conflicts with R3 as written.**
- R3 says "Credentials are posted straight to the API by the library (no own login endpoint, no password handling elsewhere)".
- The reset page collects `new_password` and posts it. That is password handling outside `@mmlabs/auth-client`, and USR-08 will not provide a reset call.
- Technically it is low risk: a public endpoint, no session and no stored credential. But it needs an explicit owner decision or a wording change to R3, not a silent exception.

**F6 — The current mock forgot form has the wrong behaviour.**
- `src/features/auth/forgot-password/components/forgot-password-form.tsx:45`: the toast says `Email sent to ${data.email}`. That claims an account exists and repeats the email back, against the "same message for any email" rule.
- The form also resets and sends the user to `/sign-in`, so the "check your email" state is lost.

**F7 — The 401 redirect could copy the token into a query string.**
- The 401 handler builds `redirect` from `router.history.location.href` (PAN-009 N4, `src/main.tsx:34`). That value includes the hash.
- If the handler ever fires while the hash is still on the reset or verify page, the URL becomes `/sign-in?redirect=/reset-password#token=…`, which turns into a query string and a history entry.
- Today this is unlikely: reset and verify never answer 401, and the token is null.

**F8 — The generated types list `origin` as a required header for forgot and resend.**
- In `src/api/openapi.json`, forgot and resend declare a required `origin` header parameter. Browsers do not let page code set `Origin`, so a typed call will "require" a value the browser silently drops.
- A test fake fetch would see the fake value instead, so a test asserting on it would prove nothing.

**F9 — The Turnstile script can read the page URL.**
- Turnstile runs in our page, so it can read `location.hash`.
- Only forgot needs Turnstile; reset and verify do not.

**F10 — Rate limits.**
- `errors.ts:61-91` already reads `Retry-After` and `details.retry_after`, and CORS exposes the header.
- Showing a forgot 429 is per-IP only, so it does not reveal whether an email exists. A resend 429 is per-email, but it only reaches the signed-in session owner.

## Recommendations

**R-1 — Add a public auth caller in `src/api/` (R2: still one place for HTTP).**
- Use either a second `createApiClient({ baseUrl, anonymous: true })` instance, or a rule in the middleware: never set `Authorization` when the path starts with `/api/v1/auth/`.
- Keep all the forced settings: `credentials: 'omit'`, `redirect: 'error'`, `no-store`, `no-referrer`.
- Skip `notifyUnauthorized` for these paths.
- Tests: with a token provider that returns a token, assert that no `authorization` header reaches `fetchImpl` for `/api/v1/auth/password/reset`. Also assert `credentials === 'omit'`.

**R-2 — Send `X-MM-App` only on forgot.**
- Take the value from `VITE_APP_KEY`. Validate it once, like `parseApiBaseUrl`: non-empty and matching `^[a-z][a-z0-9-]*$`. In production builds, consider failing closed unless it is `admin`.
- Do not pass a fake `origin` header to satisfy the types (F8). Either cast it away in one wrapper, or have the generator drop it. Write an `origin-header` test so nobody "fixes" it later.
- The local dev origin (`http://localhost:5173`) must be in `apps.origins` for `admin`, or forgot answers 403 `origin_not_allowed`. Document this in the README and show it as a configuration error, not "try again".

**R-3 — Read the token from the hash, then strip it, before anything else happens.**
- Do it once per navigation:
  - read it in the route's `beforeLoad`, or in a ref-guarded effect;
  - **not** in a `useState` initializer, which StrictMode runs twice, so the second run can see an already stripped hash;
  - then call `router.history.replace('/reset-password')` (or `navigate({ to, hash: '', replace: true })`). Do this rather than a raw `window.history.replaceState`, so the router does not lose track of the URL.
- Check the token against `^[A-Za-z0-9_-]{32,128}$` (the API's `EMAIL_TOKEN_RE`) before sending it. If it fails, show "invalid link" with no request.
- Keep the token only in component memory:
  - not in search params, router loader data, a TanStack Query key, zustand, storage, a toast or the console;
  - use `useMutation`, never `useQuery`, for these calls;
  - drop the token on unmount and on success.
- Tests:
  - after mount, `window.location.hash === ''` and `location.href` has no token;
  - the token is POSTed in the body and never appears in the URL;
  - a malformed token makes no request;
  - StrictMode does not lose the token and does not POST twice. A double verify answers 204 anyway, but avoid it.

**R-4 — Load no third-party code on `/reset-password` and `/verify-email`.**
- Load Turnstile only inside the forgot component, with explicit render, never from `index.html`.
- Keep the 401-redirect builder from ever copying a hash: drop `hash` from the `redirect` value (F7). Do not install the redirect handler on the `(auth)` pages.
- Add `<meta name="referrer" content="no-referrer">` to `index.html` now, as defence in depth until PAN-022 adds the nginx header.

**R-5 — Turnstile (forgot only).**
- Add `VITE_TURNSTILE_SITE_KEY` to `.env.example` without a value. The site key is public (R5); the secret stays on the API.
- Use Cloudflare's documented test site key only in dev and test, never in production builds.
- Prefer a small loader of our own over a new dependency. If you use a wrapper package, pin it exactly and review its licence and size.
- Each Turnstile token works once. Reset the widget after every submit, success or failure, and on 403 `turnstile_failed`.
- Disable submit until the widget returns a token.
- Never log the Turnstile token or keep it after the request.
- Tests mock the widget at a seam (`getTurnstileToken()`), never the real script.

**R-6 — Make forgot reveal nothing about the account.**
- After 202, always show the same in-page state: "If an account exists for this address, we sent a link. It expires in 30 minutes."
- Do not echo the email in a toast, and never put it in the URL, a search param, navigation state, logs or a query key (R5).
- Only these responses differ from the 202 state: 403 `turnstile_failed` (re-challenge), 403 app or origin errors (configuration error), 422 (invalid email), and 429 (show `Retry-After`).
- Test that the success output is the same for two different emails.

**R-7 — The reset form.**
- One field or two (new + confirm), with `type="password"` and `autoComplete="new-password"`. No `name`/`id` that reuses "email".
- Allow a "show password" toggle, but do not keep the value in any store.
- Client-side check: at least 12 characters (API default, configurable) and at most 128 (`PASSWORD_MAX_LENGTH`), as hints only. The API's 422 `weak_password` `details.reasons` (`too_short`, `too_common`) is what counts. Map them to fixed text, keep the token and let the user try again.
- 422 `token_invalid` → "link expired or already used" with a link to `/forgot-password`.
- After 204: clear the form and route to `/sign-in` with no `redirect` or `next` parameter. Explain that every session of that account was signed out.
- Never log the password: no console, no error toast holding the value, and it never goes into `ApiError`. The API already strips `input` from 422 details.

**R-8 — Verify.**
- POSTing on page load is acceptable; the API treats a repeat as success (204), which covers link scanners and double clicks.
- 204 → "Email verified".
- 422 `token_invalid` → "link expired": tell the user to sign in to get a new link. Do **not** build resend here (see Q1).
- 429 → show `Retry-After`.

**R-9 — Tests (R8).**
- Forgot: 202 gives the same state for any email, plus `turnstile_failed`, 429, 422, and the app/origin 403s.
- Reset: success, `weak_password`, `token_invalid`, 429, and a malformed hash.
- Verify: 204, `token_invalid`, 429.
- Also the hash-strip tests from R-3 and the no-Authorization test from R-1.
- Mock the API at the network layer; mock mode makes no requests.

## Risks (residual)
- The browser's own history list may still hold the original URL with `#token`, even after `replaceState`. This is inherent; the short lifetimes (reset 30 min, verify 24 h) and single use limit it. Say so in the plan rather than claiming zero exposure.
- Google Fonts in `index.html` is a third-party request on every page, including reset. It does not see the fragment, but it is still something to remove under PAN-022 or a follow-up.
- Reset ends the account's sessions, but access tokens already issued stay valid for up to 15 minutes. That is API behaviour; the UI text should not promise more.
- Any registered origin of any active app can trigger a reset email with a link to itself. That is API trust in `apps.origins`, and admin-pan cannot reduce it.

## Open questions (for the owner, before IMPLEMENT)
1. **Resend and the post-verify token refresh:** move both to PAN-010 (auth-client), and drop "resend limits" from PAN-012's acceptance criteria? Or keep them in PAN-012 and wait for USR-08? Building them now by hand contradicts the 2026-11-15 decision.
2. **R3 wording:** may admin-pan's own reset page collect the new password and post it through the PAN-009 public client? Or should forgot, reset and verify be added to `@mmlabs/auth-client`'s scope (an org-admin-api USR-08 follow-up), with PAN-012 waiting for it? I recommend allowing it explicitly: amend R3 to "login/signup only through auth-client; public forgot/reset/verify through `src/api/` with `credentials: 'omit'`".
3. **Turnstile:** confirm the production site key will be issued for the `admin.mmlabs.online` hostname (and dev hostnames for the test key). Confirm that PAN-022's CSP will allow `script-src` and `frame-src https://challenges.cloudflare.com`, and `connect-src` for the API origin.
4. **Registration:** is the local dev origin registered on app `admin` in the dev and staging API? Without it, forgot cannot be tested end to end.

## Follow-ups (out of scope, R7)
- **org-admin-api docs:** `consumers.md` says to use `credentials: "include"` for forgot, which is not needed; `omit` is enough and safer. The OpenAPI also declares the `origin` header as required, which produces misleading client types.
- **org-admin-api USR-08:** decide whether auth-client covers resend, verify and the post-verify token refresh (and optionally forgot and reset).
- **PAN-022:**
  - `Referrer-Policy: no-referrer` on all responses (at least on the `/reset-password` and `/verify-email` locations);
  - a CSP carrying the Turnstile hosts;
  - self-hosted fonts.
- **PAN-010:** remove the hash from the 401 `redirect` value (from PAN-009 N4).
