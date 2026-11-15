## PAN-012b: identity-access consult, delta only (read-only)

The merged PAN-012 code already covers most of what verify needs. The real delta is how the API's idempotency works and how the success message is worded. There is nothing to refresh before PAN-010.

### Findings

**F1. The API is idempotent beyond "double click"** (`/home/user/org-admin-api/app/modules/auth/email_verification.py:96-112`, `repository.py:181`).
- `verify()` looks the token up with `find_user_id`, which matches the token in any state: used, expired or superseded.
- If the user's email is already verified, it returns 204 for any such token. That covers a second click, a mail-scanner prefetch, a 24 h-expired link, and an old link after a password reset (a reset also marks the email verified).
- It returns `token_invalid` only when:
  - the token is unknown;
  - the user is not active;
  - the email is still unverified and the token is used, expired or superseded.
- So a 204 means "this address is verified now", not "you just verified it". The success copy should say "Your email address is verified". It must not imply that this click did it.

**F2. Signed-in vs signed-out makes no difference here.**
- The API issues no app token without a verified email (org-admin-api R11). Anyone holding an `aud=admin` token in memory is therefore already verified, and their click gets the idempotent 204.
- An unverified staff member cannot be signed in to admin-pan at all. So there is no token to refresh after a 204, and nothing to do before PAN-010.
- The page should not read the auth store. It always shows the same panel with a link to `/sign-in`. It must not redirect signed-in users away; the route stays outside `_authenticated`, like `/reset-password`.

**F3. Merged code that can be reused as-is:**
- `useFragmentToken('/verify-email')` (`src/lib/fragment-token.ts`). It reads the fragment only, uses the same `^[A-Za-z0-9_-]{32,128}$` pattern as `VerifyEmailRequest`, captures once under StrictMode, and strips the hash through `router.history.replace`.
- `formatRetryAfter` (`src/lib/retry-after.ts`).
- `StatusPanel` (`src/features/auth/components/status-panel.tsx`).
- Client behaviour (`src/api/client.ts:12,56,88`). `/api/v1/auth/*` gets no `Authorization` header, no 401 notify, and `credentials: 'omit'`. Verify needs no `X-MM-App` and no extra headers, so its CORS preflight stays within `content-type`.
- The mutation pattern (`src/features/auth/api/mutations.ts`): `retry: false`, `gcTime: 0`, `meta.handlesOwnErrors`.

**F4. Merged code that is wrong for verify:**
- `InvalidLink` in `reset-password-form.tsx:27-36` is hard-wired to reset: "Request a new one" plus a link to `/forgot-password`. Verify's invalid state must say "sign in to request a new one" and link to `/sign-in`. Do not reuse that component directly.
- The `useFragmentToken` test only exercises the path `/reset-password`. Add a verify-path case or a page-level test.
- No verify call exists yet. `src/api/public-auth.ts` has only forgot and reset.

### Recommendations

1. **API function (AC2, R2, R3).** Add `verifyEmail(api, body: components['schemas']['VerifyEmailRequest'])` to `src/api/public-auth.ts`. It is a plain `api.POST('/api/v1/auth/verify-email', { body })` with no header params, and it gets `useVerifyEmailMutation` in `mutations.ts` with the same options as the other two. Test that the request carries no `Authorization` header (even with a token in the provider), no `X-MM-App`, and that `credentials` is `omit`.
2. **Page states (AC3).**
   - **No or malformed token:** "Invalid link", with sign-in copy. Do not send any request.
   - **Idle:** the "Confirm my email" button. An explicit click protects against scanner prefetch, which the API already tolerates.
   - **Pending:** the button is disabled, and a second click cannot send a second POST (AC2: one POST).
   - **204:** "Email address verified", with a link to `/sign-in`.
   - **422 `token_invalid` or `validation_error`:** one shared message: "This link is invalid or has expired. Sign in to request a new one." Link to `/sign-in`.
   - **429:** "Try again in …" via `formatRetryAfter(e.retryAfter)`. Keep the button so the user can retry with the same token.
   - **Network or timeout:** "Could not reach the server", and keep the button. Retrying with the same token is safe: if the first request did reach the server, the retry gets the idempotent 204 (F1).
   - **Anything else, including a CORS failure from an unregistered origin:** a generic error.
3. **Token lifetime (R5).** Keep the token in state only for the life of the page. Never put it in toasts, logs, query keys or the URL. After a 204 or `token_invalid`, drop it from the UI so the button is not shown again.
4. **Tests (AC4, R8).** Mock the network. Cover each state above, plus:
   - the hash is removed after load;
   - `?token=` is ignored;
   - a double click sends exactly one POST;
   - a retry after a network error re-sends the same token;
   - focus moves to the status heading (`StatusPanel`).
5. **Copy for "already verified".** There is no separate state. The 204 copy from F1 covers it.

### Risks

- **Overpromising copy.** Saying "Thanks, you just verified" would be wrong for expired or old links of verified users (F1). It is cosmetic, but the API's real semantics are "the address is verified".
- **Little traffic.** Verify links only land on admin-pan when the email was triggered from admin-pan. After PAN-012, that happens only via resend (PAN-010) or a reset, and a reset already verifies the email. This page will see little use until PAN-010; that is fine.
- **CORS setup.** If the admin origins are not registered on app `admin` (the PAN-012 follow-up), the call fails as a network error. That looks like "retry" forever. Keep the generic message after repeated failures, not an endless spinner.
- **Note for PAN-010, not this ticket.** `isPublicAuthPath` also covers the cookie-class `/auth/verify-email/resend` and `/auth/token`, so a 401 `session_invalid` from them will not reach the global handler. PAN-010 must handle that 401 itself.

### Open questions

1. Should the success copy also mention "If you are already signed in, nothing else is needed"? I recommend not adding it: F2 shows a signed-in user is necessarily already verified, so the extra line only adds confusion.
2. After PAN-010, should the "email not verified" page in PAN-010 be the one to fetch a fresh token after a verify, rather than this public page? I recommend yes, and recording it as a PAN-010 note. No change is needed in PAN-012b.

### Files read

- `/home/user/admin-pan/.claude/agents/identity-access-engineer.md`
- `/home/user/admin-pan/work/tickets/PAN-012b/ticket.md`
- `/home/user/admin-pan/work/tickets/PAN-012/consult-identity-access-engineer.md`
- `/home/user/admin-pan/src/api/{public-auth,client}.ts`
- `/home/user/admin-pan/src/lib/{fragment-token.ts,fragment-token.test.tsx,retry-after.ts}`
- `/home/user/admin-pan/src/features/auth/{api/mutations.ts,components/status-panel.tsx,reset-password/index.tsx,reset-password/components/reset-password-form.tsx}`
- `/home/user/admin-pan/src/routes/(auth)/reset-password.tsx`
- `/home/user/org-admin-api/app/modules/auth/{router.py,email_verification.py,repository.py}`
- `/home/user/org-admin-api/app/core/{rate_limit,config}.py` (the verify limit is 20 per 60 s per IP)
