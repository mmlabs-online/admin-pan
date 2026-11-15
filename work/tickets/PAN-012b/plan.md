Status: READY

# Plan — PAN-012b: Verify-email page

## Spec summary
`docs/spec-v1.md` §5.1 (owner, 2026-11-15):
> Public pages at fixed paths `/forgot-password` (Turnstile, same answer for any email), `/reset-password` and `/verify-email` (token from the email link) (owner, 2026-11-15). API: `POST /auth/password/forgot`, `/auth/password/reset`, `/auth/verify-email` — org-admin-api USR-04, USR-04b (done). Resending the verification email needs a signed-in session and belongs with sign-in (PAN-010).

`CLAUDE.md` R3 (as amended 2026-11-15):
> Exception (owner, 2026-11-15, PAN-012): the token-credential public flows — forgot-password, reset-password, verify-email — may call the API through `src/api/` with `credentials: 'omit'` and no `Authorization` header. … Every route except `/login` (and auth flows like verify-email / reset-password) is behind the auth guard.

API contract (read from org-admin-api, not guessed):
- `app/modules/auth/router.py:273-291`: `POST /api/v1/auth/verify-email`. It is public (R3 class 3) with a per-IP rate limit `verify_email`. Body `VerifyEmailRequest {token}`. Success is `204` with `Cache-Control: no-store`. Declared errors: `422`, `429`. No cookie, no `X-MM-App`, no Turnstile.
- `app/modules/auth/email_verification.py:32,96-112`: the email link is `{origin}/verify-email#token=…`. `verify()` behaves like this:
  - It returns 204 whenever the user's email is verified, including for used, expired or old tokens. So 204 means "the address is verified", not "this click verified it".
  - It raises `token_invalid` (422) for an unknown token, an inactive user, or a used/expired/superseded token on a still-unverified email.
- Generated types: `src/api/schema.d.ts:324` (path) and `:1106` (`VerifyEmailRequest`). The operation's `header?: never` means no header cast is needed.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Route `/verify-email` reads the token from the URL fragment only, validates it, and strips it from the URL | `verify-email.test.tsx` › `no hash / malformed token / ?token= only → invalid link, no request`, and › `valid fragment → button shown, hash stripped once under StrictMode, token not in DOM`. `routeTree.gen.ts` has `'/(auth)/verify-email'` under root, not under `_authenticated`. |
| 2 | An explicit "Confirm my email" button sends one `POST /api/v1/auth/verify-email` | `verify-email.test.tsx` › `no request on mount (StrictMode)`, › `click sends exactly one POST with {token}, no Authorization / X-MM-App, credentials omit`, › `double click sends one request`. `public-auth.test.ts` › `verify sends body {token}, no X-MM-App or Authorization; 204 resolves`. |
| 3 | States: invalid link, verifying, success (link to `/sign-in`), `token_invalid` ("link invalid or expired; sign in to request a new one"), 429 with wait time, network retry | One test per state in `verify-email.test.tsx` (names under Tests). Copy is listed under Screens. |
| 4 | Tests for each state | All tests listed below exist and pass in `pnpm test`. R8: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` and `pnpm build` are green, and `git status` is clean after the build (route tree in sync). |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/api/public-auth.ts` | Add `verifyEmail(api, body: components['schemas']['VerifyEmailRequest'])` as a plain `await api.POST('/api/v1/auth/verify-email', { body })`. No params and no header cast. Update the top comment to name verify. | AC2. R2: only `src/api/` talks HTTP. R3: exception for verify-email. |
| `src/api/public-auth.test.ts` | Add a verify test: URL, body, no `x-mm-app`, no `authorization`, `credentials === 'omit'`, 204 resolves, 422 `token_invalid` rejects with `{status: 422, code}`. | AC2, R8 |
| `src/api/index.ts` | Export `verifyEmail`. | Features import from `@/api`. |
| `src/features/auth/api/mutations.ts` | Add `useVerifyEmailMutation(api = getApi)`. Same options as the other two hooks: `retry: false`, `gcTime: 0`, `meta: { handlesOwnErrors: true }`, no `mutationKey`. | AC2. R5: the token is never cached, keyed or toasted. |
| `src/features/auth/api/mutations.test.tsx` | Add the verify hook to `failures do not trigger the app-wide error toast`. Replace that test's fixed `setTimeout(r, 100)` with `expect.poll`/`vi.waitFor` on all mutations reaching `error` (PAN-012 security-review attempt-2 note on a flaky run). | R5, R8. The flake fix is in a test this ticket must edit anyway. |
| `src/features/auth/verify-email/index.tsx` | New. Page `VerifyEmail`: `AuthLayout` + `Card` (title "Confirm email"), the same shape as `reset-password/index.tsx`. Calls `useFragmentToken('/verify-email')`. Renders `<VerifyEmailPanel token={token} />` when there is a token, otherwise `<InvalidVerifyLink />`. | AC1 |
| `src/features/auth/verify-email/components/verify-email-panel.tsx` | New. Exports `VerifyEmailPanel({ token, api? })` and `InvalidVerifyLink`. Holds the state machine described under Approach. | AC2, AC3 |
| `src/features/auth/verify-email/verify-email.test.tsx` | New. Page and state tests (see Tests). | AC4 |
| `src/routes/(auth)/verify-email.tsx` | New, thin: `createFileRoute('/(auth)/verify-email')({ component: VerifyEmail })`. No search schema. | AC1. R3: outside the auth guard. |
| `src/routeTree.gen.ts` | Regenerated by the TanStack router plugin (`pnpm build`/`pnpm dev`). Do not hand-edit it. | The new route |

No other file. In particular, do not modify `reset-password-form.tsx` (its `InvalidLink` copy is wrong for verify), `status-panel.tsx`, `fragment-token.ts`, `retry-after.ts` or `client.ts`. They are reused as they are (R7).

## Tests to write
All UI tests follow `reset-password-form.test.tsx`:
- Mock `@tanstack/react-router` with `useRouter` → `history.replace`, implemented with `window.history.replaceState`, and `Link` → `<a href>`.
- Inject the API through `createApiClient({ baseUrl: 'https://api.test', fetch: stub })`. There is no real network.
- Page tests render `<StrictMode>` + `QueryClientProvider` + `<VerifyEmail />` after `window.history.replaceState(null, '', '/verify-email' + hash)`. Reset to `/` in `afterEach`.
- The page needs the injected client, so tests mount `<VerifyEmailPanel token api>` directly for request tests. Page tests cover token handling and assert, with a `globalThis.fetch` spy, that nothing is sent. This is the same split the merged reset tests use.
- Wait only with `expect.element`, `expect.poll` or `vi.waitFor`. No fixed sleeps (PAN-012 follow-up).

| Test (file › name) | Covers |
|---|---|
| `public-auth.test.ts › verify sends body {token}, no X-MM-App or Authorization, credentials omit; 204 resolves` | AC2, R2/R3 |
| `public-auth.test.ts › verify 422 token_invalid rejects with ApiError` | AC3 mapping input |
| `mutations.test.tsx › failures do not trigger the app-wide error toast` (verify added, sleep replaced by polling) | R5 |
| `verify-email.test.tsx › page › no hash shows invalid link with /sign-in link and sends no request` | AC1, AC3 invalid link |
| `verify-email.test.tsx › page › malformed token (#token=short) shows invalid link and sends no request` | AC1 |
| `verify-email.test.tsx › page › ?token= in search only shows invalid link and sends no request` | AC1 (fragment only) |
| `verify-email.test.tsx › page › valid fragment shows the button, sends nothing on mount, strips the hash once (replace called once with '/verify-email'), token not in DOM or any href` | AC1, AC2 (no auto-POST), R5 |
| `verify-email.test.tsx › click sends exactly one POST to /api/v1/auth/verify-email with {token}, no Authorization / X-MM-App, credentials omit` | AC2 |
| `verify-email.test.tsx › double click sends one request` | AC2 (one POST) |
| `verify-email.test.tsx › while pending the button is disabled and "Verifying…" is in the status region` (stub returns a promise resolved by the test) | AC3 verifying |
| `verify-email.test.tsx › 204 shows "Email address verified" with focused heading and /sign-in link (no query string); button gone` | AC3 success |
| `verify-email.test.tsx › 422 token_invalid shows "Link invalid or expired" with "Sign in to request a new one", focused heading, /sign-in link; button gone` | AC3 token_invalid |
| `verify-email.test.tsx › any other 422 (validation_error) shows the same invalid-or-expired panel` | AC3 |
| `verify-email.test.tsx › 429 shows role=alert "Try again in 30 s" (Retry-After: 30); button stays enabled; next click resends the same token` | AC3 429 |
| `verify-email.test.tsx › network failure shows "Could not reach the server" alert; retry with the same token then succeeds` | AC3 network retry |
| `verify-email.test.tsx › 500 and 403 show the generic alert and never render the server message` (stub message `'leak'`) | AC3, R5/R6 |
| `verify-email.test.tsx › terminal states clear mutation state` (poll `qc.getMutationCache().getAll()` to length 0 while the panel is still mounted, after 204 and after `token_invalid`) | R5, PAN-012 `mutation.reset()` follow-up |
| `verify-email.test.tsx › keyboard: Tab to the button, Enter sends one request` | R10 |

## Approach
1. **API function (R2, R3).** Add `verifyEmail` to `public-auth.ts` and export it from `src/api/index.ts`. The client already sets `credentials: 'omit'`, skips `Authorization` and skips `notifyUnauthorized` for `/api/v1/auth/*` (`client.ts:12,34,56,88`). Nothing changes there.
2. **Mutation hook.** Add `useVerifyEmailMutation`, a copy of the reset hook with the verify body type. Keep `meta: { handlesOwnErrors: true }`, otherwise `query-client.ts` toasts the server message (PAN-012 security attempt 1).
3. **Panel state machine** (`verify-email-panel.tsx`):
   - `const [status, setStatus] = useState<'idle' | 'verified' | 'invalid'>('idle')`.
   - `const [error, setError] = useState<string | null>(null)` holds the inline alert text for 429, network and other errors.
   - Pending comes from `mutation.isPending`. There are no extra booleans.
   - **Click handler.** It is the only caller of `mutate` (no effect, loader or mount call; appsec V-1).
     - Guard: `if (inFlight.current) return`. `inFlight` is a `useRef(false)`, set to true before `mutate`. A ref is used because a second synchronous click can see a stale `isPending`.
     - Then `setError(null)` and `mutation.mutate({ token }, { onSuccess, onError, onSettled })`.
   - **onSuccess:** `setStatus('verified')`, then `mutation.reset()`.
   - **onError:**
     - `isApiError(e, 422)`, any code → `setStatus('invalid')` and `mutation.reset()`. The body is only the token, which is already regex-checked on the client, so any 422 means the link is unusable. This follows identity rec. 2 and appsec V-5.
     - `isApiError(e, 429)` → `Too many requests. Try again in ${formatRetryAfter(e.retryAfter)}.`
     - `isApiError(e)` with `kind` `network` or `timeout` → `Could not reach the server. Please try again.`
     - Anything else (5xx, 403, `invalid_response`, `config`) → `Something went wrong. Please try again later.`
     - Never render `e.message` or `e.details` (R5, R6).
   - **onSettled:** `inFlight.current = false`.
   - **Token after a terminal state.** The token stays only in the `useFragmentToken` page state. Once `status !== 'idle'`, the panel no longer renders the button, so the token can never be sent again ("consumed", appsec V-4). After a 429 or a network error it stays usable for a manual retry. The API is idempotent after success (identity F1), so a retry that follows a lost 204 is safe.
4. **Idle view:**
   - One line of copy: "Confirm the email address for your mmlabs account."
   - `<Button type='button' onClick disabled={mutation.isPending}>`: "Confirm my email" plus `Loader2` while pending. The container has `aria-busy={mutation.isPending}`.
   - A persistent `<p role='status' className='sr-only'>` that contains "Verifying…" only while pending. It is the one live region on the idle view.
   - The `role='alert'` error paragraph, when set.
   - The button stays mounted, so focus is not lost on error.
5. **Terminal views:** use the existing `StatusPanel` (its heading takes focus on mount). Do not wrap it in another live region (frontend consult; a11y 💭 5 left as is).
6. **Page and route.** `VerifyEmail` mirrors `ResetPassword`. The route file is thin and sits under `(auth)` (root), outside `_authenticated` (R3). Regenerate `routeTree.gen.ts` through the build and commit it.
7. **Rules.**
   - R1: the API is the only backend.
   - R2: HTTP only in `src/api/`, with generated types.
   - R3: public exception, no bearer, outside the guard.
   - R4: no permission. The endpoint is public and declares no `admin:*` permission.
   - R5: the token appears only in the request body. It is not in the DOM, attributes, URL, keys, meta, toasts or logs, and the success link carries no `redirect`.
   - R6: fixed strings only.
   - R7: no edits to reset/forgot.
   - R8: tests above, plus the checks.
   - R9: n/a. This is not an admin mutation, and no queries are affected.
   - R10: focus management, labelled button, alert/status roles.
   - R11: this is staff email confirmation for admin-pan's own app, as the spec scopes it.

## Specialist input used
- **frontend-developer**:
  - Adopted:
    - the `verifyEmail` wrapper, the hook options, and the page/panel split;
    - a separate `InvalidVerifyLink` with a `/sign-in` link, without reusing reset's `InvalidLink`;
    - no auto-POST, the button disabled while pending, and the `role='status'` "Verifying…" region;
    - `mutation.reset()` after terminal states;
    - polling in tests;
    - the "no server message" test.
  - Rejected:
    - 422 `validation_error` → generic text. Instead, all 422s show the invalid panel (identity and appsec: the body is only the token).
    - The "30 seconds" wording. The test asserts the formatter's actual output, "30 s".
  - Its OQ2 (countdown): text only.
  - Its OQ3 (separate copy): yes.
- **identity-access-engineer**:
  - Adopted:
    - F1, so the success copy says "is verified", not "you just verified";
    - F2, so the page never reads the auth store and never redirects;
    - F3/F4 reuse and non-reuse;
    - the state list;
    - test additions (`?token=` ignored, double click, same-token retry, heading focus).
  - OQ1: no extra "already signed in" line.
  - OQ2: recorded as a PAN-010 follow-up.
- **appsec-engineer**:
  - Adopted:
    - V-1, explicit click only, with a ref guard against double clicks;
    - V-2, reuse `useFragmentToken` and check the route tree;
    - V-3, no `mutationKey`, `handlesOwnErrors`, token-not-in-DOM and no-toast tests;
    - V-4, `mutation.reset()` plus no button after a terminal state;
    - V-5, fixed copy and all 422s → invalid;
    - V-6, `/sign-in` with no `redirect`;
    - V-7, header and credentials assertions, and no request on a malformed hash.
  - Partly adopted: V-5's "keep Retry disabled until the wait has passed". The button only re-enables and nothing auto-retries, which is the option the consult allows ("or at least make sure it does not auto-retry").
  - Rejected: the dev-only "check origin registration" hint (OQ2). It is extra scope, and origin registration is an ops follow-up.
  - F5: the verify page does not import Turnstile.

## Assumptions
- The admin origins (`https://admin.mmlabs.online`, `http://localhost:5173`) are registered on app `admin` in `apps.origins`. Without that, the CORS preflight fails and the page shows the network-retry text (appsec F3). This is ops setup, already a PAN-012 follow-up, and does not block this diff because tests mock the network.
- The verify email that reaches admin-pan uses `link_origin` = the admin origin and the fixed path `/verify-email#token=…` (`email_verification.py:32,91`). That matches this route.
- The `/sign-in` link points to the existing (mock) sign-in page. The "request a new one" capability arrives with PAN-010 (owner, 2026-11-15, spec §5.1). The copy is correct for the target state.
- UI copy is English, consistent with the merged PAN-012 pages (spec §8 Q3 has not changed anything for these pages).
- If the user reloads after the hash is stripped, they see the invalid-link panel. This is accepted, as for reset.

## Blocking questions
None.

## Split proposal
None (about 250 changed lines, one screen, one spec item).

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/verify-email` (public, `(auth)` group, outside `_authenticated`) | None. The public endpoint declares no `admin:*` permission (R3 class 3). | **Invalid link** (no or malformed fragment): StatusPanel "Invalid link", "This link is invalid. Sign in to request a new one.", link "Sign in" → `/sign-in`. No request.<br>**Idle:** "Confirm the email address for your mmlabs account." with the button "Confirm my email".<br>**Verifying:** button disabled + spinner, `aria-busy`, status "Verifying…".<br>**Success (204):** StatusPanel "Email address verified", "Your email address is verified. You can now sign in.", link "Sign in" → `/sign-in`.<br>**token_invalid / any 422:** StatusPanel "Link invalid or expired", "This link is invalid, expired or already used. Sign in to request a new one.", link "Sign in" → `/sign-in`.<br>**429:** alert "Too many requests. Try again in {formatRetryAfter}.", button enabled.<br>**Network/timeout:** alert "Could not reach the server. Please try again.", button enabled (retry, same token).<br>**Other (5xx/403/other):** alert "Something went wrong. Please try again later."<br>Empty: n/a. 403: not declared by the endpoint, so it falls under the generic alert. | Click "Confirm my email" → `useVerifyEmailMutation().mutate({ token })`, once per click, guarded against double submit. | None. No cached queries are affected. |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/verify-email` | body `components['schemas']['VerifyEmailRequest']` `{ token }`. No headers beyond the client defaults. `credentials: 'omit'`, no `Authorization`. | `204`, no body | 422 `token_invalid` (and any other 422) → invalid panel; 429 → wait time via `ApiError.retryAfter` (`Retry-After` header or `details.retry_after`); network/timeout → retry; anything else → generic | USR-04 (done) |

## Follow-ups (R7, not in this diff)
- PAN-010: after a verify, the "email not verified" page should fetch a fresh token (identity OQ2). PAN-010 also owns resend, the hash in the 401 `redirect` (`src/main.tsx`), and its own handling of 401 on `/auth/verify-email/resend` and `/auth/token`, because `isPublicAuthPath` skips the global handler.
- Reset/forgot forms: apply the same `mutation.reset()` after terminal states (PAN-012 security note, still open there).
- `public-auth.ts` forgot `as never` header cast: org-admin-api OpenAPI marks `origin` as required (existing PAN-012 follow-up).
- org-admin-api ops: register admin origins on app `admin` (existing).
- PAN-022: SPA fallback and `Cache-Control: no-store` for `/verify-email` as well as `/reset-password`; `Referrer-Policy`; CSP; self-hosted fonts.
- PAN-023: axe run for `/verify-email` (invalid, idle, success, expired, 429).
- a11y 💭 (existing): `StatusPanel` `role='status'` plus a focused heading may double-announce.
