## PAN-012: identity-access consult (read-only)

**Summary.** Forgot, reset and verify-email are public endpoints. They need no device cookie, and they can be built now through the PAN-009 client, with three fixes:
- the client must not send `Authorization` on `/api/v1/auth/*` paths;
- forgot must send `X-MM-App` on that call only;
- forgot needs Turnstile.

Resend is cookie-class. It needs a signed-in device session and the `mm_account_id` value that `@mmlabs/auth-client` keeps, so it is blocked on USR-08 / PAN-010. The AC "verify-email handles … resend limits" cannot be met in this ticket.

The reset page posts a new password outside auth-client. R3 says "no password handling elsewhere", and USR-08's scope does not cover reset. That needs an owner ruling (Open question 1).

### Findings

**F1. Auth class per endpoint** (`/home/user/org-admin-api/app/modules/auth/router.py:273-396`, `docs/consumers.md:58-160`)

| Endpoint | Class | Cookie | `X-MM-App` + registered `Origin` | Turnstile | Body | Success | Errors |
|---|---|---|---|---|---|---|---|
| `POST /auth/password/forgot` | public, with app context (owner 2026-11-13) | no | **required**, else 403 `app_header_required` / `origin_not_allowed` | **always** (`turnstile_token` required) | `{email, turnstile_token}` | 202 for every email | 403 `turnstile_failed`, 422, 429 (per-IP) |
| `POST /auth/password/reset` | public; the token is the credential | no | not needed | none (a verifier is injected but `reset()` never calls it; body has no `turnstile_token`, extra fields are forbidden) | `{token, new_password}` (max 128) | 204 | 422 `weak_password` (`details.reasons`: `too_short`, `too_common`), 422 `token_invalid`, 422 `validation_error`, 429 |
| `POST /auth/verify-email` | public; the token is the credential | no | not needed | none | `{token}` (pattern `^[A-Za-z0-9_-]{32,128}$`) | 204, also when already verified | 422 `token_invalid`, 422 `validation_error`, 429 |
| `POST /auth/verify-email/resend` | **cookie class** | `__Host-mm_device` required, so `credentials: 'include'` | **required** | none | `{account_id}` (the account-session id, not the user id) | 202 | 401 `session_invalid`, 409 `email_already_verified`, 429 (1/min, 5/day per email, plus per-IP and the daily cap; `Retry-After`) |

**F2. "Public" still means CORS-gated from the browser.**
- `DynamicCORSMiddleware` (`/home/user/org-admin-api/app/core/cors.py`) covers every `/api/v1/auth/*` path. A JSON POST triggers a preflight, and that preflight passes only when:
  - the origin is a registered origin of an active app;
  - the requested headers are only `content-type` and `x-mm-app`.
- So verify and reset also need `https://admin.mmlabs.online` set on app `admin` (`set-admin-origins`, ADM-002c runbook `docs/deploy.md:405`). Locally, `http://localhost:5173` must be registered on the local `admin` app. The Vite proxy has no `changeOrigin`, so the browser's `Origin` passes through to the API.

**F3. PAN-009 client conflict.**
- `onRequest` in `/home/user/admin-pan/src/api/client.ts` attaches `Authorization: Bearer …` whenever the provider returns a token.
- `authorization` is not in the `/auth/*` preflight allow-list. If someone with a token in memory opens one of these pages (for example a staff member clicking a verify link), the preflight fails and the call surfaces as a network error (`TypeError: Failed to fetch`).
- The client never sends `X-MM-App`, and forgot needs it.
- `credentials: 'omit'` is correct for all three public calls. Forgot does not need the cookie, even though consumers.md says `include`.

**F4. How the email links are built.**
- Format: `{validated Origin}{fixed path}#token=<43 chars>`.
  - Verify: `/verify-email` (`email_verification.py:32,91`), TTL 24 h.
  - Reset: `/reset-password` (`password_reset.py:32,81`), TTL 30 min, single use, a newer link replaces older ones.
- The origin is the page origin that called forgot (or signup / resend). For staff using admin-pan, that is `https://admin.mmlabs.online`, so the links land in admin-pan.
- A verify link only reaches admin-pan if the verification email was triggered from admin-pan (resend from admin-pan, or a reset, which also marks the email verified). A staff member who signed up in another app gets that app's link.

**F5. Enumeration.**
- Forgot always returns 202. Per-email limits and the daily cap are silent; only the per-IP 429 is visible.
- Reset and verify return one code, `token_invalid`, for unknown, expired, used or superseded tokens.
- The current mock form (`src/features/auth/forgot-password/components/forgot-password-form.tsx:47`) toasts `Email sent to ${data.email}`. That claims a send happened, so it breaks AC1, and it puts a full email in a toast (R5).

**F6. Effects of a reset.**
- It ends every account session of that user on all devices and signs nobody in.
- An already issued `aud=admin` token stays valid for up to 15 min. The next `/token` call returns 401 `session_invalid`.

**F7. USR-08 scope** (`/home/user/org-admin-api/work/tickets/USR-08/ticket.md:16`): signup, login, listAccounts, getToken, join, logout, `mm_account_id`. It does **not** include forgot, reset, verify or resend. `identity-architecture.md` §6 says the same.

**F8. Other notes.**
- No nginx config exists yet (PAN-022), so `Referrer-Policy: no-referrer` is not served today.
- `.env.example` has no `VITE_TURNSTILE_SITE_KEY`.
- The API checks the Turnstile `hostname` against `TURNSTILE_ALLOWED_HOSTNAMES`, which is empty by default.

### Recommendations

**R-1. Split by credential type.** (R3, owner decision of 2026-11-15)
- Forgot and verify carry no password and no session, so they may go through `src/api/` as typed `useMutation` hooks. That is not an "auth module": they do not sign in, hold no token and touch no cookie.
- Reset carries a credential. Use one of these:
  - (a) the owner explicitly rules that reset-through-`src/api/` is allowed under R3, with the constraints in R-6; or
  - (b) ask the API team to add `forgotPassword`, `resetPassword`, `verifyEmail` and `resendVerification` to USR-08, and defer reset.
- I recommend (a) plus a USR-08 follow-up to absorb these calls later.

**R-2. Move resend out of this ticket.** (AC3, R3)
- Resend is cookie-class, needs `account_id` from auth-client, and needs `credentials: 'include'`. PAN-009 deliberately forbids that.
- Building it now would be the hand-written cookie-auth module the owner rejected.
- Narrow AC3 to: success, `token_invalid` (expired / used / replaced) and 429. Add a "sign in to request a new link" pointer for the failure case.
- Resend, with its 409 and 429 limits, moves to PAN-010's "email not verified" page or a follow-up after USR-08. Flag this as a ticket/spec scope change for the owner.

**R-3. Changes to the API layer.** (R2, F3)
- In `onRequest`, never attach `Authorization` for paths under `/api/v1/auth/`.
- Send `X-MM-App: <VITE_APP_KEY>` per call on forgot only (openapi-fetch `headers` option), not globally.
- Keep `credentials: 'omit'`.
- Tests:
  - no `Authorization` header on `/auth/*` calls, even when a token exists;
  - `X-MM-App` present on forgot only;
  - verify and reset send only `Content-Type` and `Accept`.
- A 401 is not expected from these endpoints. Make sure the global 401 handler cannot fire from them anyway.

**R-4. Routes.** (R3, F4)
- Add public `(auth)` routes at exactly `/reset-password` and `/verify-email` (fixed by the API), next to the existing `/forgot-password`.
- They must stay outside `_authenticated` and must not redirect signed-in users away before the token is captured.
- PAN-022 needs an nginx SPA fallback for both paths at the origin root (no Vite `base` prefix). Record this as a follow-up.

**R-5. Token handling in the URL.** (R5, R6, consumers.md steps 1–2)
- Read the token from the fragment only. Never accept `?token=` and never put it in search params, route state or query keys.
- Capture it exactly once, then remove the fragment at once with a replace navigation through the router (`router.history.replace('/verify-email')` or `navigate({..., replace: true})`). A raw `history.replaceState` can desync TanStack Router.
- Capture it outside a re-running effect. A StrictMode double effect would read an already-cleared hash and wrongly show "invalid link". Use a ref or a route `beforeLoad`, and test that the hash is empty afterwards.
- Validate the token against the API pattern before posting. A truncated link should show the same "invalid link" state.
- Do not load Turnstile or any third-party script on `/reset-password` or `/verify-email`.
- Ask PAN-022 for `Referrer-Policy: no-referrer` (already global under R6). A fragment never goes into `Referer` anyway, so the remaining exposures are history, devtools and error reporters.
- Never log the token or put it in toasts.

**R-6. Reset form.** (AC2, R3, R5)
- Fields: new password plus confirm, with `autocomplete="new-password"`.
- Client zod schema: required, at most 128, confirm matches. Do not copy the API's minimum length or common-password list (the API owns the rules, R1/R4).
- On 422 `weak_password`, map `details.reasons` to a field error linked to the input (R10), and keep the form usable because the token is still valid.
- On `token_invalid`, show "This link is invalid or has expired" and link to `/forgot-password`.
- On 204, show "Password changed. Sign in with your new password" and link to `/sign-in`. Do not sign in automatically.
- Keep the password only in react-hook-form state. Reset the form after submit.
- Use a mutation with `gcTime: 0`, or no cached variables, so the password and token do not sit in the MutationCache or React Query Devtools. Suppress the global mutation error toast for these calls.

**R-7. Forgot form.** (AC1, R5, R11)
- On every 202, show one fixed message: "If an account exists for that address, we've sent a reset link." Do not echo the email, and do not put the email in the URL or a toast.
- 403 `turnstile_failed`: reset the widget and ask the user to retry.
- 403 `app_header_required` / `origin_not_allowed`: show a generic "Something went wrong" (it is a configuration bug; never say "account not found").
- 429: show `retryAfter` (`ApiError.retryAfter` already reads `Retry-After` and `details.retry_after`).
- Turnstile tokens are single-use: reset the widget after **every** submit, including failures.

**R-8. Turnstile setup.** (R5)
- Add `VITE_TURNSTILE_SITE_KEY` to `.env.example` (no value).
- Use a small widget wrapper whose script loading can be injected, so tests use a fake widget and never load Cloudflare. Adding an npm Turnstile package is a dependency decision; note it in the plan.
- In dev, use Cloudflare's test site key.
- Follow-ups:
  - org-admin-api deploy: `TURNSTILE_ALLOWED_HOSTNAMES` must include `admin.mmlabs.online`;
  - PAN-022 CSP: `script-src` and `frame-src` for `https://challenges.cloudflare.com`.

**R-9. Verify page.** (AC3)
- On 204, show "Email verified". If PAN-010 is present later, it should fetch a new `/token`. For now, link to `/sign-in`.
- `token_invalid` and `validation_error` show one message: "link invalid or expired; sign in to request a new one".
- 429 shows `retryAfter`.
- Auto-submit on load is acceptable because the API is idempotent for an already-verified user. A "Verify my email" button is optional (protects against mail-scanner prefetch); this is a UX choice.

**R-10. Tests.** (AC4, R8; network mocked)
- Forgot:
  - same message for any 202;
  - 403 `turnstile_failed` resets the widget;
  - 429 shows the wait time;
  - email never appears in the UI or URL;
  - submit is disabled without a Turnstile token.
- Reset:
  - client validation;
  - `weak_password` reasons;
  - `token_invalid` and its link to forgot;
  - 204 and its link to sign in;
  - no token gives the invalid state;
  - hash removed;
  - `?token=` ignored.
- Verify: 204, `token_invalid`, 429, malformed token, hash removed, single capture under StrictMode.
- Client: the header rules in R-3.

### Risks

- **CORS / origin not registered.** If `admin.mmlabs.online` (or the local dev origin) is not on app `admin`, all three calls fail as network errors, not 403s. Show a generic error and document the setup.
- **Spec drift.** spec-v1 §5.1 does not mention these pages, and the ticket's resend AC conflicts with the owner's USR-08 decision. Under CLAUDE.md the spec wins and the conflict must be flagged.
- **Session after reset.** If the staff member resets while signed in on this browser, their in-memory admin token keeps working for up to 15 min. PAN-010 should handle the next 401 `session_invalid`.
- **Turnstile hostname allowlist.** If it is empty in production, Turnstile tokens are accepted from any hostname (weaker). If it is set without the admin host, forgot always fails with `turnstile_failed`.
- **Mail flow outside admin-pan.** Verify links for accounts that signed up elsewhere go to the other app's origin. Admin-pan's verify page mainly serves resend-from-admin (later) and is less critical than reset.
- **Dev leakage.** TanStack Router and React Query devtools show URLs and mutation variables in dev. That is acceptable only if the hash is cleared and `gcTime: 0` is used.

### Open questions (owner)

1. R3: may `/reset-password` post `new_password` through `src/api/` (R-1a), or must it wait until USR-08 gains `resetPassword` (R-1b)? Should forgot and verify also move into USR-08 later?
2. Agree to drop resend (and its limits) from PAN-012's AC and move it to PAN-010 or a post-USR-08 ticket?
3. Turnstile: add a widget npm package (dependency decision), or a hand-rolled loader in `src/lib/`?
4. Verify page: auto-submit on load, or an explicit button (mail-scanner prefetch)?
5. Who registers the admin origins (`https://admin.mmlabs.online` and `http://localhost:5173` on local) and sets `TURNSTILE_ALLOWED_HOSTNAMES` on the API? This needs an org-admin-api ops follow-up.

### Files read

- `/home/user/org-admin-api/app/modules/auth/{router,deps,schemas,errors,password_reset,email_verification,turnstile,service}.py`
- `/home/user/org-admin-api/app/core/{cors,rate_limit,config}.py`
- `/home/user/org-admin-api/app/modules/rbac/origin_registry.py`
- `/home/user/org-admin-api/docs/consumers.md`, `/home/user/org-admin-api/docs/identity-architecture.md` (§6, D4, D21)
- `/home/user/org-admin-api/work/tickets/USR-08/ticket.md`, `/home/user/org-admin-api/work/backlog.md`
- `/home/user/admin-pan/src/api/{client,auth-hooks,config}.ts`
- `/home/user/admin-pan/src/api/errors.ts`, `/home/user/admin-pan/src/api/no-http-outside-api.test.ts` (searched)
- `/home/user/admin-pan/src/features/auth/forgot-password/components/forgot-password-form.tsx`, `/home/user/admin-pan/src/routes/(auth)/forgot-password.tsx`, `/home/user/admin-pan/vite.config.ts`
- `/home/user/admin-pan/work/tickets/{PAN-009/plan.md,PAN-010/ticket.md,PAN-012/ticket.md}`
- `/home/user/admin-pan/docs/spec-v1.md` §5.1
