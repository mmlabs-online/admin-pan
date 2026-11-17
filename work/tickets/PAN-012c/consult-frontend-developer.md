## Findings

**Turnstile stays. Do not touch component, loader, CSP, env, release.yml, Dockerfile or the Turnstile parts of deploy.md.** Sign-in still uses it on demand (`user-auth-form.tsx`, `turnstile_required`, tested in `user-auth-form.test.tsx`). That makes `src/components/turnstile.tsx`, `src/lib/turnstile-loader.ts`, `VITE_TURNSTILE_SITE_KEY`, the CSP entries (`script-src` and `frame-src https://challenges.cloudflare.com`) and the `smoke-image.sh` assertions all live. Only the `.env.example` comment is stale ("for the forgot-password page").

**Remove:**
- `src/features/auth/forgot-password/components/forgot-password-form.tsx` and `forgot-password-form.test.tsx`.
- `forgotPassword` and the `Forgot` type in `src/api/public-auth.ts`. Also update its header comment ("forgot, reset, verify-email").
- The forgot cases in `src/api/public-auth.test.ts` (lines ~28-60, three tests that call `forgotPassword`) and the import.
- `useForgotPasswordMutation` and its `Forgot` type in `src/features/auth/api/mutations.ts`, plus its test in `mutations.test.tsx` (~lines 9, 70-101).
- The `forgotPassword` export in `src/api/index.ts:12`.
- Leave `isPublicAuthPath` in `client.ts` alone. It is a prefix match on `/api/v1/auth/` and is still needed for reset and verify.
- `schema.d.ts` and `openapi.json` are generated, so leave them.

**Change:**
- `src/features/auth/forgot-password/index.tsx`: keep the route and `AuthLayout` and drop the `ForgotPasswordForm` import. Render a Card with a title such as "Reset your password". The body is text only: "To reset your password, use the password reset in any mmlabs app you use. Then come back here and sign in." Keep the "Sign in" link to `/sign-in`. No form, no `src/api` or mutation import, and no link to a specific app (owner decision). Use `StatusPanel` (`../components/status-panel`) or a plain `<h1>`. The auth pages use a Card with `CardTitle` and `StatusPanel` uses `h2`, so check the heading level is consistent with the sibling pages.
- Add a small test, `forgot-password.test.tsx`, that checks:
  - the notice text is shown;
  - there is no textbox or button;
  - the sign-in link has `href="/sign-in"`;
  - no `fetch` is made (stub it and assert it was not called).
- The route file `src/routes/(auth)/forgot-password.tsx` and `routeTree.gen.ts` do not change. `safe-redirect.ts` and its test also stay.
- `src/features/auth/reset-password/components/reset-password-form.tsx` is not in the ticket's list, but it links to `/forgot-password` in two places: `InvalidLink` ("Request a new one" / "Forgot password") and the expired panel ("Request a new link"). With the notice page these labels promise something that is not there. Minimal fix: keep the links so the notice can explain, but reword to "How to reset your password", and update the assertions at `reset-password-form.test.tsx` ~83, 132-141. The ticket says "stay as they are", so ask the owner (Q1).
- `verify-email-panel.tsx`, in two places (line 23 `InvalidVerifyLink`, lines 86-87 expired panel), plus `verify-email.test.tsx:177`. PAN-010b has not landed, so do not mention a resend button. Suggested copy: "This link is invalid, expired or already used. Sign in with your account; if your email is still unverified, you will be told how to get a new link." Safer and shorter: "...Sign in to continue." Prefer that until PAN-010b ships, then revisit. Keep the `SignInLink`.
- `docs/spec-v1.md:36` (§5.1): `/forgot-password` becomes a text-only notice (no form, no API call, no Turnstile). The sentence ending "...belongs with sign-in (PAN-010)" should note that resend is via the email-unverified gate (USR-12, PAN-010b). Cite ADM-002d.
- `docs/deploy.md`:
  - line 8 (pages talk to the real API);
  - line 118 (smoke check "submit an address you own") should be "page shows the notice";
  - line 133 ("renders the Turnstile widget and submits") should be removed or moved to the sign-in challenge;
  - line 146 (forgot-password 403 `origin_not_allowed` troubleshooting) should be removed;
  - lines 66 and 148-150 still apply to sign-in.
- `.env.example:8` comment: say "sign-in challenge".
- `docs/adr/0003` line 20 already anticipates this. No change.
- `nginx/default.conf:29` and `scripts/smoke-image.sh:100`: the route still exists, so they stay (no-store and 200 checks hold).

**A11y of the notice:**
- Exactly one `h1` or a focused heading. `StatusPanel` focuses its heading on mount, which is reasonable for a navigation target. For a page reached by link, though, auto-focusing is optional. Either is fine, but keep it consistent with verify-email.
- `role='status'` on a static page notice causes a needless announcement. Prefer plain content, and not `StatusPanel`, if the heading is not meant to take focus.
- The sign-in link needs visible focus (reuse `linkClass`) and descriptive text. Contrast is already handled by the existing tokens.

## Recommendations
1. Do the removals and the notice above (AC 1, 2).
2. Change the two verify-email strings and the one test (AC 3).
3. Update spec §5.1, deploy.md and the `.env.example` comment (AC 5).
4. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Typecheck will catch leftover imports of `forgotPassword`.

## Risks
- Reset-password pages would point at a page that explains instead of acting (see Q1). Leaving the "Request a new link" wording is a UX lie.
- Deleting `Turnstile` or CSP entries by mistake would break sign-in's challenge. `smoke-image.sh` would catch the CSP part.
- The verify-email copy must not mention a "Send the link again" button before PAN-010b.

## Open questions
1. Reword the reset-password "Request a new link" and "Forgot password" link labels (and their tests) to point at the notice honestly? Recommended yes, a minimal label change. It is a small, in-scope deviation from "stay as they are".
2. The verify-email wording: the generic "Sign in to continue" (recommended now) versus mentioning resend (wait for PAN-010b)?

Files: /home/user/admin-pan/src/features/auth/forgot-password/index.tsx, /home/user/admin-pan/src/api/public-auth.ts, /home/user/admin-pan/src/api/public-auth.test.ts, /home/user/admin-pan/src/api/index.ts, /home/user/admin-pan/src/features/auth/api/mutations.ts, /home/user/admin-pan/src/features/auth/api/mutations.test.tsx, /home/user/admin-pan/src/features/auth/verify-email/components/verify-email-panel.tsx, /home/user/admin-pan/src/features/auth/verify-email/verify-email.test.tsx, /home/user/admin-pan/src/features/auth/reset-password/components/reset-password-form.tsx, /home/user/admin-pan/docs/spec-v1.md, /home/user/admin-pan/docs/deploy.md, /home/user/admin-pan/.env.example
