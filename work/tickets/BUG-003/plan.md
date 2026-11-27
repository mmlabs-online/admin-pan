Status: READY

# Plan — BUG-003: First "Sign in" click lands back on the sign-in page; a second click is needed

## Spec summary
This is a bug ticket (ADR 0003). The bug report in `ticket.md` is the reference: one successful sign-in must open the app.

- Expected (ticket.md): "One successful sign-in opens the app at the validated redirect target (or `/`)."
- Spec §5.1: "Login page using `@mmlabs/auth-client` (app key `admin`); account picker / switch and logout; the `aud=admin` token is kept in memory and refreshed by the library."
- R3: "Sign-in, sign-up, sessions and tokens only through the library … Every route except `/login` … is behind the auth guard." The fix keeps the guard (`AuthGate`) as it is and uses only `useAuth()` (`login`, `reload`, `status`).

**Root cause confirmed.** I re-checked it against the code. All three consults confirmed it from the library source.
- `src/features/auth/sign-in/components/user-auth-form.tsx:87-89`: `onSuccess` navigates as soon as `login()` resolves.
- In the vendored `@mmlabs/auth-client`, `client.login()` calls `selectAccount()`, which emits `account-changed`. `AuthProvider` reacts with `void reload()` and does not await it. The provider's `login` is a passthrough, so it resolves while the snapshot is still `signed-out`. In an account switch, the snapshot is still `ready` with the previous account.
- `src/features/auth/gate/auth-gate.tsx:22-23`: the `signed-out` case renders `RedirectToSignIn`, which sends the user back to `/sign-in?redirect=…`. The `redirect` value survives that round trip, so the second click works.
- `onSettled` (`user-auth-form.tsx:90-94`) explains the "password cleared" symptom.

The cause is in this repo. org-admin-api is not involved (R1).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A regression test reproduces the bug: it fails on `origin/main` before the fix and passes after. It signs in once through `UserAuthForm` with the real `AuthProvider` and a protected target guarded like `AuthGate`, and asserts the target is reached without a bounce back to `/sign-in`. | Test `user-auth-form.test.tsx › UserAuthForm (behind AuthGate) › one sign-in reaches the protected redirect target without bouncing to /sign-in (BUG-003)`. `impl-log.md` must show this test **failing** with only the test changes applied (the form as on `origin/main`), then passing after the fix. The reviewer re-runs it on both. |
| 2 | One successful sign-in opens the validated redirect target (or `/`). The existing redirect, error, Turnstile and rate-limit behaviour is unchanged. | The regression test plus the companion tests below. All existing `UserAuthForm` tests pass **unchanged**: posts via login, validated redirect / `//evil.com` → `/`, invalid_credentials, Turnstile, rate_limited, network, no forgot link, validation. `auth-gate.test.tsx` and `access-pages.test.tsx` pass unchanged. `git diff` shows no change to `auth-gate.tsx` or to anything under `node_modules` / `vendor`. |
| 3 | All checks pass (R8). | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` are green. In a cloud sandbox, use `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`. |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/auth/sign-in/components/user-auth-form.tsx` | Await `reload()` after `login()` inside `mutationFn`. Replace the `onSuccess` navigation with a `signedIn` state flag plus an effect that navigates once, on the committed `status`. Handle signed-out after a successful login (inline alert, no navigation). Keep the button busy and disabled until navigation, and guard `onSubmit`. | This is the fix (root cause at lines 87-89). |
| `src/features/auth/sign-in/components/user-auth-form.test.tsx` | Add the BUG-003 regression test and the companion tests in a new `describe('UserAuthForm (behind AuthGate)')` block. The existing `setup()` and tests stay unchanged. | AC 1 and 2 (ADR 0003). |
| `src/test-utils/auth.tsx` | `renderWithAuth` gets an optional `signInPage?: (search: { redirect?: string }) => React.ReactNode` prop. The default stays `<p>Sign-in page</p>`, so the change is backward compatible. The sign-in route reads its validated search with `signIn.useSearch()` and passes it in. | The regression test needs the real form on `/sign-in`, inside the same router, with an `AuthGate` layout and `clearOnAuthChange` wiring, as the frontend-developer and identity-access-engineer consults recommend. |

No other files change. `auth-gate.tsx` is **not** modified (appsec R6), and the vendored `@mmlabs/auth-client` is **not** modified (out of scope).

## Tests to write
All tests are Vitest browser mode (real Chromium) and live in `src/features/auth/sign-in/components/user-auth-form.test.tsx`, inside a new `describe('UserAuthForm (behind AuthGate)')`.

**Shared harness for this block (local `gatedSetup()` helper):**
- `const api = fakeIdentityApi(...)` and `createTestAuthClient(api, { storage: memoryStorage().storage })`.
- Call `renderWithAuth({ client, path, signInPage: ({ redirect }) => <UserAuthForm redirectTo={redirect} /> })`.
- **Deterministic race:** after creating `api`, wrap the accounts route:
  ```ts
  const ACCOUNTS = 'GET /api/v1/auth/accounts'
  const base = api.routes[ACCOUNTS] as Handler
  api.routes[ACCOUNTS] = async (c) => {
    if (api.count(LOGIN) > 0) await new Promise((r) => setTimeout(r, 150))
    return (postLogin ?? base)(c)
  }
  ```
  This delays only the listings made after login. The mount-time listing (signed-out) stays instant. `postLogin` is an optional per-test handler: 401, 500, or a list without the logged-in id.
- Record every resolved pathname: `router.subscribe('onResolved', (e) => paths.push(e.toLocation.pathname))`.
- Use the fake credentials from `@/test-utils/auth` (`PASSWORD`) and the existing `EMAIL` constant. Do not snapshot request bodies (appsec R7).

| Test (file › name) | Covers |
|---|---|
| **1. REGRESSION (write first, must fail on origin/main):** `UserAuthForm (behind AuthGate) › one sign-in reaches the protected redirect target without bouncing to /sign-in (BUG-003)` | Start at `/users`. The gate redirects to `/sign-in?redirect=/users`, and the real form renders. Sign in once. Assert `Protected: Users` is visible (`expect.element`, default timeout ≥ the 150 ms delay), the final `router.state.location.pathname === '/users'`, no `/sign-in` entry in `paths` after the first `/users` entry following submit, and `api.count(LOGIN) === 1`. On `origin/main` the form navigates while the delayed listing is pending, the gate sees `signed-out` and bounces, and the user stays on `/sign-in`, so the test fails. AC 1. |
| 2. `… › keeps the button disabled and aria-busy until navigation; a second click does not log in again` | After the click, while the delayed listing is pending, `submit` is `disabled` and `aria-busy="true"`. A forced second click or Enter adds no call (`api.count(LOGIN) === 1` after landing). AC 2 and the ticket technical note. |
| 3. `… › signed-out after a successful login stays on the form with a generic alert, no navigation` | `postLogin` = `envelope(401, 'session_invalid')`. Assert a `role="alert"` with "Could not start your session. Please try again." that does not contain `EMAIL`. Also assert: the pathname stays `/sign-in`, no navigation to `/users`, `api.count(LOGIN) === 1`, and the button is enabled again. AC 2 (no silent loop, appsec R2). |
| 4. `… › accounts error after login opens the target, where the gate shows retry` | `postLogin` = `envelope(500, 'internal')`. Assert the pathname is `/users`, the text "Could not reach mmlabs Identity" is visible with a Retry button, and no bounce to `/sign-in`. AC 2. |
| 5. `… › needs-account after login opens the target with the account picker` | `postLogin` returns `json(200, { items: [row(ACCOUNT_B, 'b@staff.test')] })`, a list without the logged-in `ACCOUNT_A`. Assert the pathname is `/users`, "Choose an account" is visible, and no bounce. AC 2 (current picker behaviour is kept). |
| 6. `… › account switch from a ready account lands as the newly signed-in account` | Initial `accounts: [row(ACCOUNT_A, …)]`, with storage `mm_account_id: ACCOUNT_A`, start at `/sign-in?redirect=/users`. The `LOGIN` handler sets `api.state.accounts = [A, row(ACCOUNT_B, EMAIL)]` and returns `account_id: ACCOUNT_B`. After one sign-in, `Protected: Users` is visible and the last `POST /api/v1/auth/token` body has `account_id: ACCOUNT_B`. If the library sends the account id elsewhere, assert on that field and record it in impl-log. Covers the stale-`ready` edge case from identity consult R-3. |

The existing tests in `describe('UserAuthForm')` stay as they are. They must still pass. They now see one extra `GET /auth/accounts` per login, which none of them counts.

## Approach
1. **Regression test first (ADR 0003).**
   - Add the `signInPage` prop to `renderWithAuth` and write test 1.
   - Run it against the unchanged form and record the failing output in `impl-log.md`: the command, the failing assertion and the `paths` array showing `/sign-in` again.
   - If it does not fail, raise the delay. The listing must outlast the navigation. Do not remove the delay.
2. **Fix `user-auth-form.tsx`** using only `useAuth()` (R3):
   - `const { login, reload, status } = useAuth()`.
   - `mutationFn: async (v) => { await login(v); await reload() }`. `reload()` never rejects, so login errors still reach `onError` unchanged. Our `reload()` is the latest sequence number, so it is the one that sets the snapshot, and the mutation stays pending through it.
   - `onSuccess: () => { setSessionError(false); setSignedIn(true) }`. Remove the `navigate` call from `onSuccess` entirely (appsec risk: a double navigation would bring the race back).
   - Keep `onError` and `onSettled` (password reset and Turnstile reset on every attempt) as they are (appsec R5).
   - Add an effect on `[signedIn, status, navigate, redirectTo]` with a `navigated = useRef(false)` guard:
     - If `!signedIn`, return.
     - If `status === 'signed-out'`: `setSignedIn(false)`, `setSessionError(true)`. Do not navigate.
     - Else if `status !== 'loading'` and `!navigated.current`: set `navigated.current = true` and call `void navigate({ href: safeRedirect(redirectTo), replace: true })`.
     - The `ready`, `needs-account` and `error` states are left to `AuthGate`, which already renders the target, the picker or the Retry message.
   - The effect depends on the local flag, not on `status` alone. A user who is already `ready` and opens `/sign-in` ("Use another account") is **not** auto-redirected (appsec open question 2: no new behaviour).
   - `onSubmit`: start with `if (mutation.isPending || signedIn) return`, and call `setSessionError(false)` before `mutate` (appsec R4).
   - `const busy = mutation.isPending || signedIn`. Use it for `disabled` (together with the existing Turnstile condition), `aria-busy` and the spinner icon.
   - Alert: show `messageFor(mutation.error)` when `mutation.isError`, else show "Could not start your session. Please try again." when `sessionError`. Use one `role='alert'` element. The message has no email, account id or details (R5).
   - `safeRedirect(redirectTo)` is computed at the moment of navigation and is the only source of `href` (appsec R3). Do not use a URL marker, Web Storage or `console.*`.
3. **Companion tests 2–6.** Run the full check suite (R8).
4. **Rules.**
   - R3: library only. The token is never touched in the form.
   - R5: generic copy.
   - R6: no HTML sinks.
   - R7: only the three files above.
   - R9/R10: the busy state is announced through `aria-busy`, and the error through `role=alert`.
   - R1, R2, R4 and R11 are not affected.

## Specialist input used
- **frontend-developer**
  - Adopted: the effect on committed status, a `busy` that spans until navigation, and the delayed post-login accounts handler for determinism.
  - Adopted: recording paths via `router.subscribe('onResolved')`, and asserting one login.
  - Adopted: extending `renderWithAuth` with a sign-in page prop instead of a second ad-hoc router.
  - Rejected: the consult's option 2 on its own (`await reload()` plus navigating in `onSuccess`). It is ordering-dependent, so it is used only combined with the effect.
- **identity-access-engineer**
  - Adopted: R-1 (await `reload()` in `mutationFn`, a ref-guarded effect, navigating on `ready`, `needs-account` and `error`, no `accountId === signedInAs` match).
  - Adopted: R-2 (no navigation on signed-out after login), R-3 (edge cases → tests 4–6) and R-4 (`clearOnAuthChange` wiring via `renderWithAuth`, plus companion tests).
  - R-5 (one extra listing) is accepted. R-6 (library follow-up) is recorded under Assumptions.
  - Simplification: a boolean `signedIn` instead of `signedInAs: string`, because the account id is not needed.
- **appsec-engineer**
  - Adopted all constraints:
    - R1: effect navigation.
    - R2: generic alert on signed-out.
    - R3: `safeRedirect` at navigation, no URL or storage marker.
    - R4: disable plus an `onSubmit` guard, one login asserted.
    - R5: keep `onSettled` resets.
    - R6: `AuthGate` untouched.
    - R7: no logs, fake credentials.

## Assumptions
- `renderWithAuth`'s `clearOnAuthChange` clears the mutation cache during `login()` (identity consult finding 5). The hook-level `useMutation` callbacks still fire because they are mutation options. The flag is React state, not `mutation.isSuccess`, so it does not depend on the observer. If the implementer sees `isPending` stuck after the cache clear, record it in impl-log. `busy` still covers the time until navigation.
- With `signed-out` after login, the alert is final for that attempt. If a later superseding reload turns the status `ready`, the form does not auto-navigate, and the user signs in again. The effect is not kept "live", which keeps the logic simple. Rare case: an other-tab event inside a sub-second window.
- `setTimeout(150)` in the fake is test-only and deterministic enough: the navigation on `origin/main` happens within one tick of `login()` resolving. Assertions use `expect.element` / `vi.waitFor`, never fixed sleeps.
- Follow-ups, out of scope (R7):
  - `@mmlabs/auth-client`: `AuthProvider.login` should `await reload()` (or return a settled snapshot) before resolving. That would remove the extra listing and this class of bug in other mmlabs apps.
  - Exclude TanStack Query devtools from production builds if they are ever added, because `mutation.variables` holds the password while the form is mounted.
  - The stray git-ignored screenshot `src/features/auth/sign-in/components/__screenshots__/zz-repro.test.tsx/` can be deleted locally. It is not part of the diff.

## Needs owner's decision
Safe defaults were applied. None of these block the fix.
1. **Signed-out after a successful login.** Default: stay on the form with the generic alert "Could not start your session. Please try again.". The alternative is to navigate and let the gate bounce, which repeats the silent loop. Recommended by identity-access and appsec.
2. **`error` (accounts listing failed) after login.** Default: navigate to the target, where `AuthGate` shows "Could not reach mmlabs Identity" with Retry. The alternative is an inline error on the form.
3. **`needs-account` after login.** Default: navigate, and the gate shows the account picker. This is the current behaviour.
4. **Library follow-up for `@mmlabs/auth-client`.** Should it be filed now against the auth-client source repo? Default: recorded here only.

## Blocking questions
None.

## Split proposal
None. The change is about 40 lines of form code plus tests.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/sign-in` (public) | none (public route; the gate guards the target) | **Busy:** from the click until navigation (login plus the accounts reload); button disabled, `aria-busy="true"`, spinner. **Error:** the existing login errors are unchanged; new: signed-out after login shows the generic alert, and the form is enabled again. **Happy:** navigate once to `safeRedirect(redirect)` with `replace`. For the `needs-account` and `error` states, the target's `AuthGate` shows the picker or Retry. | Sign in → `login()` then `reload()` (library) | none (the library's `onChange` → `clearOnAuthChange` clears the cache as today) |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/login` | via `useAuth().login` (unchanged) | library-typed | unchanged (`messageFor`) | USR-03 (done) |
| GET | `/api/v1/auth/accounts` | via `useAuth().reload()` (one explicit call added after login, through the library only) | library-typed | the library maps failures to `status` `signed-out` (→ inline alert) / `error` (→ gate Retry) | USR-03b (done) |
