Status: BLOCKED

# Plan — PAN-012: Forgot password, reset password and verify-email pages

> **Why BLOCKED.** Three owner decisions change what this plan builds:
> - **Q1:** the reset page sends a password outside `@mmlabs/auth-client`. R3 forbids that as written, and the owner said on 2026-11-15 that "R3 stays as written".
> - **Q2:** the "resend limits" criterion needs a cookie-class call that only auth-client can make. Building it now would be the hand-written auth module the owner rejected.
> - **Q3:** spec §5.1 does not list these pages, and the spec wins on scope.
>
> Everything below the Blocking questions section is the **provisional plan under the recommended answers**. If the owner gives those answers, the orchestrator records them in `ticket.md` (and makes the spec and R3 edits below), sets this first line to `Status: READY`, and the plan can run unchanged. Different answers mean re-planning (see "If the answers differ").

## Spec summary
`docs/spec-v1.md` §5.1 (the only section the ticket cites):
> "Login page using `@mmlabs/auth-client` (app key `admin`); account picker / switch and logout; the `aud=admin` token is kept in memory and refreshed by the library. Shell with navigation filtered by permission, signed-in user, and a clear page for 403 and for "email not verified" / "not a member"."

**Spec conflict (flagged, CLAUDE.md "the spec wins"):** §5.1 does not mention forgot-password, reset-password or verify-email pages. It also gives no endpoints for them (USR-04 and USR-04b are not listed). The ticket's goal ("forgot (always 202), reset with token, verify email and resend, with Turnstile where required") therefore has no spec backing yet. See Q3.

CLAUDE.md R3, as written:
> "Auth through `@mmlabs/auth-client` only. Credentials are posted straight to the API by the library (no own login endpoint, no password handling elsewhere). … Every route except `/login` (and auth flows like verify-email / reset-password) is behind the auth guard."

R3 already names verify-email and reset-password as public auth flows. It does not say who posts their calls.

API contract (org-admin-api `app/modules/auth/router.py`, `schemas.py`, `password_reset.py`, `email_verification.py`; checked against `src/api/schema.d.ts`):
- `POST /api/v1/auth/password/forgot`, body `ForgotPasswordRequest {email, turnstile_token}`:
  - success: **202 for every email** (per-email limits are silent);
  - needs `X-MM-App` and a registered `Origin`, otherwise 403 `app_header_required` / `origin_not_allowed`;
  - other errors: 403 `turnstile_failed`, 422, 429 (per IP).
- `POST /api/v1/auth/password/reset`, body `ResetPasswordRequest {token, new_password ≤128}`:
  - success: **204**;
  - errors: 422 `token_invalid` (one answer for unknown, expired, used or superseded), 422 `weak_password` with `details.reasons ⊂ {too_short, too_common}` (the token is not consumed), 422 `validation_error`, 429;
  - no cookie, no `X-MM-App`, no Turnstile.
- `POST /api/v1/auth/verify-email`, body `VerifyEmailRequest {token}`: 204 (also when already verified), 422 `token_invalid`, 429. Public.
- `POST /api/v1/auth/verify-email/resend`, body `ResendVerificationRequest {account_id}`:
  - success: 202;
  - **cookie class**: needs the `__Host-mm_device` cookie, `X-MM-App` and `account_id` (that is `mm_account_id`, which auth-client keeps);
  - errors: 401, 409 `email_already_verified`, 429.
- Email links have a fixed shape: `{Origin}/reset-password#token=…` (TTL 30 min, single use) and `{Origin}/verify-email#token=…` (TTL 24 h). The token is in the **fragment** and matches `^[A-Za-z0-9_-]{32,128}$`.
- org-admin-api USR-04 and USR-04b are DONE (backlog 2026-11-13). PAN-009 is DONE.
- org-admin-api USR-08 (`@mmlabs/auth-client`) scope is "signup, login, listAccounts, getToken(audience) …, join, logout(one|all), per-origin `mm_account_id`". It does **not** include forgot, reset, verify or resend.

## Acceptance criteria → verification
Under the recommended answers. AC3 is narrowed by Q2, and the verify-email page moves to slice PAN-012b (see Split proposal).

| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Forgot shows the same message for any email | `forgot-password-form.test.tsx › shows the identical confirmation for two different emails`. Also `› never renders the email after submit`: the email is not in the DOM after success, and no toast contains it. |
| 2 | Reset validates the password and handles expired/used tokens | `reset-password-form.test.tsx`: `› requires password and matching confirmation`, `› rejects more than 128 characters`, `› maps weak_password reasons to field errors and keeps the form`, `› token_invalid shows the expired-or-used panel with a link to /forgot-password`, `› 204 shows success with a link to /sign-in`, `› malformed or missing token shows invalid link and sends no request` |
| 3 | Verify-email handles success and expired *(resend and its limits move out; Q2)* | Delivered in **PAN-012b**, not in this slice. |
| 4 | Tests for each state | Every state in the Screens table has a named test (see Tests to write). `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` are green (R8). |
| 5 | *(from R2/R3/R5, required to meet 1–2 safely)* Public auth calls carry no bearer token and keep tokens out of URLs | `client.test.ts › never sends Authorization to /api/v1/auth/* even with a token`, `› does not notify unauthorized for /api/v1/auth/* 401`. `public-auth.test.ts › sends X-MM-App on forgot only`, `› never sets an origin header`. `fragment-token.test.ts › strips the hash after capture`. `reset-password-form.test.tsx › token never appears in DOM or location`. |

## Files to create / modify
Slice 1 (this plan) only.

| File | Change | Required because |
|---|---|---|
| `src/api/client.ts` | In `onRequest`, skip `Authorization` when the path starts with `/api/v1/auth/`. In `onResponse`, skip `notifyUnauthorized` for those paths. | The CORS preflight on `/auth/*` rejects `authorization`, and a bearer token must not go to public endpoints (consults: identity F3, appsec F3/F7). |
| `src/api/client.test.ts` | Tests for the two rules above. | R8 |
| `src/api/config.ts` | Add `parseAppKey(raw)` / `appKey()`: required, `^[a-z][a-z0-9-]*$`, otherwise `ApiError{kind:'config'}`. | Forgot needs `X-MM-App` from `VITE_APP_KEY` (appsec R-2). |
| `src/api/config.test.ts` | Tests for `parseAppKey`. | R8 |
| `src/api/public-auth.ts` | New. `forgotPassword(api, body)` and `resetPassword(api, body)` call `api.POST` and `unwrap`. Forgot sends `X-MM-App` per call. One documented cast drops the generated required `origin` header, because the browser sets it. | R2 keeps HTTP in `src/api/`, and keeping these calls apart makes it clear they are the R3 carve-out from Q1 (appsec F8). |
| `src/api/public-auth.test.ts` | Tests: request body, headers, error mapping. | R8 |
| `src/api/index.ts` | Export `forgotPassword`, `resetPassword`, `appKey`. | Public surface |
| `src/lib/fragment-token.ts` | New. `readFragmentToken(hash)` returns the token or null (regex check). `useFragmentToken(path)` captures the token once (ref-guarded), then strips the hash with `router.history.replace(path)`. | Token handling (appsec R-3, identity R-5) |
| `src/lib/fragment-token.test.ts` | Unit and hook tests. | R8 |
| `src/lib/password-errors.ts` | New. Maps `ApiError` 422 to form errors: `weak_password` (zod-parsed `details.reasons`) → fixed field text; `validation_error` `loc.at(-1)` → field, otherwise a form-level message. Never echoes `msg` or `input`. | AC2, R5 |
| `src/lib/password-errors.test.ts` | Unit tests. | R8 |
| `src/lib/retry-after.ts` | New. `formatRetryAfter(seconds)` returns "N s", "N min" or "N h". | 429 messages on forgot and reset (and later in PAN-012b) |
| `src/lib/retry-after.test.ts` | Unit tests. | R8 |
| `src/components/turnstile.tsx` | New. Hand-rolled explicit-render widget: loads `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` once, through `src/lib/turnstile-loader.ts`. Props `onToken(token \| null)`; ref handle `reset()`. Shows an error and a retry button if the script fails to load. Renders a config error if the site key is missing. | Forgot needs `turnstile_token` (API). No new npm dependency (stack rule). |
| `src/lib/turnstile-loader.ts` | New. A module-level promise that loads the script. This is the seam tests mock. | Testability (appsec R-5) |
| `src/components/turnstile.test.tsx` | Tests with a fake `window.turnstile`. | R8 |
| `src/features/auth/api/mutations.ts` | New. `useForgotPasswordMutation(api = getApi)` and `useResetPasswordMutation(api = getApi)`: `retry: false`, `gcTime: 0`, no `mutationKey` or `meta` holding secrets. | Feature hooks on top of the client (R2), same pattern as `features/organizations/api/queries.ts` |
| `src/features/auth/api/mutations.test.ts` | Hook tests with a stub fetch. | R8 |
| `src/features/auth/forgot-password/components/forgot-password-form.tsx` | Replace the mock (`sleep` and the toast that says "Email sent to …"). Use the real mutation, Turnstile, and one `status` union. After 202, show a fixed in-page confirmation. No navigation, no toast. | AC1, R5 |
| `src/features/auth/forgot-password/components/forgot-password-form.test.tsx` | Rewrite for the real states. | AC4 |
| `src/features/auth/forgot-password/index.tsx` | Only if the description copy must change: keep it neutral, no claim that an email was sent. | AC1 |
| `src/features/auth/reset-password/index.tsx` | New page, inside `AuthLayout`. | AC2 |
| `src/features/auth/reset-password/components/reset-password-form.tsx` | New form and status union. | AC2 |
| `src/features/auth/reset-password/schema.ts` | New zod schema: `new_password` required, length ≤ 128 measured after `normalize('NFKC')`, not trimmed; `confirm` must match. No client minimum length (the API owns it). | AC2 |
| `src/features/auth/reset-password/schema.test.ts` | Unit tests. | R8 |
| `src/features/auth/reset-password/components/reset-password-form.test.tsx` | State tests. | AC4 |
| `src/routes/(auth)/reset-password.tsx` | New thin public route, path fixed by the API. No search schema. | AC2, R3 (outside the guard) |
| `src/routeTree.gen.ts` | Regenerated (do not hand-edit). | New route |
| `.env.example` | Add `VITE_TURNSTILE_SITE_KEY=` with no value. | R5 |
| `src/vite-env.d.ts` | Add `readonly VITE_TURNSTILE_SITE_KEY?: string`. | Types |
| `index.html` | Add `<meta name="referrer" content="no-referrer">`. | Defence in depth until PAN-022's nginx header (appsec R-4) |

No ADR is proposed. The carve-out from R3 is recorded by amending R3 itself (Q1). The hand-rolled Turnstile wrapper is a component, not a cross-cutting decision.

**Outside the implementer's diff:** `docs/spec-v1.md` §5.1 (Q3) and the wording of CLAUDE.md R3 (Q1). The owner edits them, or tells the orchestrator to, when answering. The implementer must not touch them.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `client.test.ts › never sends Authorization to /api/v1/auth/* even with a token` | R2/R3, CORS |
| `client.test.ts › still sends Authorization to admin paths` | no regression |
| `client.test.ts › does not notify unauthorized for /api/v1/auth/* 401` | appsec F7 |
| `client.test.ts › keeps credentials omit for auth paths` | R3 |
| `config.test.ts › parseAppKey accepts admin, rejects empty/invalid` | config |
| `public-auth.test.ts › forgot sends X-MM-App and body {email, turnstile_token}` | API contract |
| `public-auth.test.ts › reset sends only Content-Type/Accept and body {token, new_password}` | API contract |
| `public-auth.test.ts › never sets an origin header` | appsec F8 |
| `public-auth.test.ts › 202/204 resolve; 422/429 throw ApiError with code and retryAfter` | errors |
| `fragment-token.test.ts › readFragmentToken accepts a 43-char token, rejects short/invalid chars/missing` | token regex |
| `fragment-token.test.ts › ignores ?token= in search` | fragment only |
| `fragment-token.test.ts › strips the hash after capture` | R5 |
| `fragment-token.test.ts › captures once under StrictMode` | double mount |
| `password-errors.test.ts › weak_password too_short/too_common → field errors` | AC2 |
| `password-errors.test.ts › validation_error maps loc to field; unknown → form error; never echoes msg` | AC2, R5 |
| `retry-after.test.ts › seconds/minutes/hours/undefined` | 429 text |
| `turnstile.test.tsx › calls onToken when the widget succeeds; null on expire/error` | Turnstile |
| `turnstile.test.tsx › reset() resets the widget; remove on unmount` | single-use token |
| `turnstile.test.tsx › missing site key renders a config error` | R5 |
| `turnstile.test.tsx › script load failure shows retry` | resilience |
| `mutations.test.ts › forgot and reset mutations do not retry and keep no cached variables` | security hygiene |
| `forgot-password-form.test.tsx › submit disabled until Turnstile token` | Turnstile |
| `forgot-password-form.test.tsx › shows the identical confirmation for two different emails` | AC1 |
| `forgot-password-form.test.tsx › never renders the email after submit` | AC1, R5 |
| `forgot-password-form.test.tsx › turnstile_failed resets the widget and asks to retry` | state |
| `forgot-password-form.test.tsx › app_header_required/origin_not_allowed shows generic error` | state |
| `forgot-password-form.test.tsx › 429 shows wait time` | state |
| `forgot-password-form.test.tsx › 422 email shows field error` | state |
| `forgot-password-form.test.tsx › network/timeout keeps input and allows retry` | state |
| `forgot-password-form.test.tsx › resets Turnstile after every submit` | single-use |
| `forgot-password-form.test.tsx › invalid email blocked client-side` | form |
| `schema.test.ts (reset) › required, ≤128 after NFKC, confirm must match, no trimming` | AC2 |
| `reset-password-form.test.tsx › malformed or missing token shows invalid link and sends no request` | AC2 |
| `reset-password-form.test.tsx › requires password and matching confirmation` | AC2 |
| `reset-password-form.test.tsx › rejects more than 128 characters` | AC2 |
| `reset-password-form.test.tsx › maps weak_password reasons to field errors and keeps the form` | AC2 |
| `reset-password-form.test.tsx › token_invalid shows the expired-or-used panel with a link to /forgot-password` | AC2 |
| `reset-password-form.test.tsx › 204 shows success with a link to /sign-in and clears the form` | AC2 |
| `reset-password-form.test.tsx › 429 shows wait time; network error allows retry with same token` | states |
| `reset-password-form.test.tsx › token never appears in DOM or location` | R5 |
| `reset-password-form.test.tsx › inputs are labelled, errors linked, status announced` | R10 |

The network is mocked by injecting `createApiClient({ baseUrl: 'https://api.test', fetch: stub })`, as `queries.test.ts` and `client.test.ts` already do. The tests make no real requests and never load the Turnstile script.

## Approach
1. **Client (R2, R3).**
   - In `client.ts`, add a check `isPublicAuthPath(url)` (`pathname.startsWith('/api/v1/auth/')`). When it matches, do not attach `Authorization` and do not call `notifyUnauthorized`. Keep all forced options (`credentials: 'omit'`, `redirect: 'error'`, `no-store`, `no-referrer`).
   - Add `appKey()` in `config.ts`.
   - `public-auth.ts` wraps the two calls. Forgot passes `headers: {'X-MM-App': appKey()}`. The generated required `origin` header param is removed with one commented cast; a test proves the code never sets `origin`.
2. **Fragment token (R5, R6).**
   - `useFragmentToken('/reset-password')` reads `window.location.hash` once, inside a ref-guarded effect (or the route `beforeLoad`), then calls `router.history.replace(path)`.
   - The token stays in component state only: not in search params, a query key, a store, a toast or logs. Never read `?token=`.
   - A token that fails the regex goes straight to the "invalid link" state and no request is sent.
3. **Turnstile (forgot only; no third-party script on `/reset-password`).**
   - Hand-rolled loader plus component. The site key comes from `VITE_TURNSTILE_SITE_KEY`.
   - Reset the widget after every submit.
   - Submit stays disabled until a token exists.
4. **Forgot form (AC1).**
   - One `status` union: `idle | submitting | sent | error(kind)`.
   - After 202, replace the form with a fixed text: "If an account exists for that address, we've sent a reset link. It expires in 30 minutes."
   - No toast, no navigation, no echo of the email.
   - On error, show fixed text per code (see Screens). The 429 message uses `formatRetryAfter(err.retryAfter)`.
5. **Reset page (AC2).**
   - Route `/(auth)/reset-password`. States: `invalid_link | idle | submitting | success | expired` plus field and form errors.
   - Fields: new password and confirm, `type="password"`, `autoComplete="new-password"`.
   - 422 `weak_password` → field errors, and the form stays open (the token is still valid). 422 `token_invalid` → "This link is invalid, expired or already used" with a link to `/forgot-password`.
   - 204 → "Password changed. All sessions of this account were signed out. Sign in with your new password." with a link to `/sign-in` and no `redirect` param. Clear the form and drop the token.
   - Never sign in automatically.
6. **Accessibility (R10).** Labelled inputs and errors linked through `FormMessage`. Status panels use `role="status"` / `aria-live="polite"`, and focus moves to the new heading after each state change. Every control is reachable by keyboard.
7. **Rules.**
   - R1: only existing API endpoints.
   - R2: HTTP only in `src/api/`.
   - R3: public routes. Reset posts the password through `src/api/` **only under Q1's answer**. No cookie, no token storage.
   - R4: n/a (public endpoints, no `admin:*` permission).
   - R5: no email, token or password in a toast, log or URL. The new env key is listed without a value.
   - R6: no HTML rendering of API data, and API `message` text is not rendered for these flows (fixed copy only).
   - R7: nothing beyond the file list.
   - R8: checks are green.
   - R9: n/a (not an admin mutation). Still no optimistic UI.
   - R10: covered in step 6.
   - R11: these are staff-account recovery flows on admin-pan's own origin, not a hosted login for other apps.
8. Run `pnpm format`, then all checks.

## Specialist input used
- **frontend-developer:**
  - Adopted: token in the fragment, regex pre-check, mutation hooks with an injectable `api`, the `status` union per page, the 422 mapping helper, no echo of pydantic `msg`, the Turnstile loader seam and fake widget, fetch-stub tests.
  - Rejected: a client-side minimum length of 8 as a hint (the API owns the policy, R1/R4). A `useState` initialiser for capturing the token (it breaks under StrictMode, per appsec R-3). A global `X-MM-App` default (adopted per-call on forgot instead, which is smaller and leaves PAN-010 to auth-client).
- **identity-access-engineer:**
  - Adopted: R-1 split by credential type (with Q1 as the owner gate), R-2 resend out of scope (Q2), R-3 no `Authorization` on `/auth/*` and `X-MM-App` on forgot only, R-4 fixed public routes, R-5 strip the token through the router, R-6 reset form rules (`gcTime: 0`, no auto sign-in), R-7 forgot copy and error handling, R-10 test list.
  - Spec drift flagged as Q3.
- **appsec-engineer:**
  - Adopted: R-1 (path rule in the middleware rather than a second client instance; it is smaller and stays one client), R-2 (`parseAppKey`, no fake `origin`, origin-header test), R-3, R-4 (no Turnstile on the reset/verify routes, and the `no-referrer` meta tag), R-5 (hand-rolled loader, no new dependency), R-6, R-7 (except the 12-character client minimum, for the same reason as above), R-9.
  - Deferred to follow-ups: F7 (dropping the hash from the 401 redirect belongs to PAN-010; this slice stops `/auth/*` from triggering that handler), PAN-022 CSP and `Referrer-Policy`.

## Assumptions
- Mock mode (empty `VITE_API_BASE_URL`): these pages show the generic configuration error. They have no mock data, because no endpoint is faked (R1, mock-data rule).
- The production and dev origins (`https://admin.mmlabs.online`, `http://localhost:5173`) are registered on app `admin`, and `TURNSTILE_ALLOWED_HOSTNAMES` includes the admin host. This is ops setup (follow-up), not part of this diff. Tests mock the network.
- UI copy is in English until spec §8 Q3 is answered, which matches the existing screens.
- Signed-in staff who open `/reset-password` are not redirected away. The route sits in `(auth)` and has no guard.
- Browser history may still hold the original `#token` URL. This is inherent, and it is limited by the 30-minute TTL and single use.

## Blocking questions
Answer each in one line. The recommended answer comes first.

1. **R3 and the reset page.** May admin-pan's `/reset-password` page collect `new_password` and POST it to `/api/v1/auth/password/reset` through `src/api/` (public endpoint, no cookie, no token stored)? USR-08 does not cover reset, so without this the page cannot exist until auth-client gains `resetPassword`.
   - **Recommended: Yes.** Amend R3 to: "Sign-in, sign-up, sessions and tokens only through `@mmlabs/auth-client`; the token-credential public flows (forgot, reset, verify-email) may call the API through `src/api/` with `credentials: 'omit'`." Also add an org-admin-api USR-08 follow-up so auth-client may absorb these calls later.
   - Alternative: No. Then reset (and forgot) wait for USR-08.
2. **Resend in PAN-012.** Drop "resend limits" from AC3, and move resend-verification (cookie class, needs `account_id` from auth-client) and the post-verify `/token` refresh to PAN-010 (its "email not verified" page) or to a ticket after USR-08?
   - **Recommended: Yes, move them to PAN-010.** The verify page then says "sign in to request a new link" on failure.
   - Alternative: keep resend in PAN-012, and PAN-012 waits for USR-08.
3. **Spec scope.** Spec §5.1 does not list these pages, and the spec wins. Add a line to §5.1?
   - **Recommended: Yes.** Proposed line: "Public pages at fixed paths `/forgot-password` (Turnstile, same answer for any email), `/reset-password` and `/verify-email` (token from the email link). API: `POST /auth/password/forgot`, `/auth/password/reset`, `/auth/verify-email` — org-admin-api USR-04, USR-04b (done)."

**If the answers differ:**
- Q1 = No: PAN-012 shrinks to verify-email only (no password involved). Forgot and reset move to a ticket that depends on USR-08 plus a scope follow-up there.
- Q2 = keep resend: the whole ticket depends on USR-08 and goes back to BACKLOG.
- Q3 = No: the ticket is out of scope; close or park it.

## Split proposal
The ticket has two new screens (reset, verify-email), rewires a third (forgot), and needs Turnstile and client changes. That is over the one-cycle guide (rule 2). Split it into:
- **PAN-012 (this plan): password recovery.** Client auth-path rules, `X-MM-App`, Turnstile, the forgot rewire, the `/reset-password` page, and the shared helpers (`fragment-token`, `password-errors`, `retry-after`). ACs 1, 2, 4 and 5 for these screens.
- **PAN-012b (new ticket, the orchestrator creates it): verify-email page.**
  - Route `/(auth)/verify-email`, reusing `useFragmentToken` and `retry-after`.
  - An explicit "Confirm my email" button (one POST, safe from link scanners that run JS and from StrictMode double posts).
  - States: invalid link, verifying, 204 success with a link to `/sign-in`, 422 `token_invalid` ("link invalid or expired; sign in to request a new one"), 429 with the wait time, network retry.
  - Depends on PAN-012. AC3 as narrowed by Q2.
- Resend-verification with its 409/429 limits, and the post-verify token refresh, go to **PAN-010** (Q2).

## Screens
No route needs an `admin:*` permission. All of them are public `(auth)` routes outside the guard (R3), so there is no 403 state and no query invalidation (no cached server data is affected).

| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/forgot-password` (existing, rewired) | none (public) | loading: Turnstile loading, then submitting (button disabled, spinner). Empty: n/a. Errors: `turnstile_failed` "Verification failed, try again" plus widget reset; `app_header_required` / `origin_not_allowed` / config "Something went wrong. Please try again later."; 422 field error on email; 429 "Too many requests. Try again in {N}."; network/timeout "Could not reach the server" with input kept; 5xx generic. 403: n/a. Happy: fixed confirmation text, same for any email, email not shown. | Submit email plus Turnstile token → `useForgotPasswordMutation` → `POST /api/v1/auth/password/forgot` | None |
| `/reset-password` (new) | none (public) | Invalid link (no or malformed token): "This link is invalid. Request a new one." plus a link to `/forgot-password`, no request. Submitting: button disabled. Errors: `weak_password` field errors (too short / too common) with the form kept; `validation_error` field or form error; `token_invalid` "This link is invalid, expired or already used." plus a link to `/forgot-password`; 429 wait time; network: retry with the same token. Happy: "Password changed. All sessions were signed out." plus a link to `/sign-in`. | Submit new password and confirm → `useResetPasswordMutation` → `POST /api/v1/auth/password/reset` | None |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/password/forgot` | header `X-MM-App: <VITE_APP_KEY>` (the browser sets `Origin`); body `ForgotPasswordRequest {email, turnstile_token}`; `credentials: 'omit'`, no `Authorization` | 202, no body | 403 `turnstile_failed`, 403 `app_header_required` / `origin_not_allowed`, 422 `validation_error`, 429 (`Retry-After`), network/timeout, 5xx | USR-04b (done) |
| POST | `/api/v1/auth/password/reset` | body `ResetPasswordRequest {token, new_password}`; no `X-MM-App`, no `Authorization`, `credentials: 'omit'` | 204 | 422 `token_invalid`, 422 `weak_password` (`details.reasons`), 422 `validation_error`, 429, network/timeout, 5xx | USR-04b (done) |

Not used in this slice: `POST /api/v1/auth/verify-email` (PAN-012b, USR-04) and `POST /api/v1/auth/verify-email/resend` (cookie class, moves to PAN-010 under Q2).

## Follow-ups (R7, not in this diff)
- **org-admin-api USR-08:** decide whether auth-client also covers forgot, reset, verify and resend, and the post-verify token refresh.
- **org-admin-api docs:** `consumers.md` recommends `credentials: "include"` for forgot, which is not needed. The OpenAPI marks the `origin` header as required, which produces misleading client types.
- **org-admin-api ops:** register the admin origins on app `admin`, and set `TURNSTILE_ALLOWED_HOSTNAMES` to include the admin host.
- **PAN-010:** drop the hash from the 401 `redirect` value (`src/main.tsx:34`), and own resend-verification (Q2).
- **PAN-022:**
  - CSP `script-src` and `frame-src https://challenges.cloudflare.com`;
  - `Referrer-Policy: no-referrer`;
  - SPA fallback for `/reset-password` and `/verify-email` at the origin root;
  - `Cache-Control: no-store` on those paths;
  - self-hosted fonts.
