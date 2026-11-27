## Findings
- Confirmed from library source (dist/react/index.js): `login` is `client.login(input)` and does not touch the snapshot. State changes only via `client.onChange -> reload()` (async `listAccounts()`), and `reload` is exposed on `useAuth()`. `reload()` never rejects: it catches errors and sets status `signed-out`/`error`. It resolves after `setSnapshot` is called, but not after React has rendered it.
- Reload sequencing: `reload` uses a seq counter, so an extra `reload()` call supersedes the onChange-triggered one (latest wins). That is safe.
- user-auth-form.tsx:87-89 navigates in `onSuccess`, and `AuthGate` (auth-gate.tsx:22) turns the stale `signed-out` into `RedirectToSignIn`. `onSettled` also clears the password, which explains the "password cleared" symptom.
- The sign-in route has no "already ready -> redirect" logic (no `useAuth` use under `src/features/auth/sign-in` except the form), so there is no competing redirect.
- The existing test routes `/` to a stub with no AuthGate. `renderWithAuth` in `@/test-utils/auth` has an AuthGate layout but its `/sign-in` is a stub (`<p>Sign-in page</p>`), so it cannot host the form.

## Recommendations
Fix choice, in order of preference (AC2, AC3, R3, R7):
1. **Effect on status (most robust, recommended).** In the form, read `status` from `useAuth()`. Keep `onSuccess` as `setSignedIn(true)` (a state flag, or `mutation.isSuccess`). Add `useEffect(() => { if (signedIn && status === 'ready') void navigate({ href: safeRedirect(redirectTo), replace: true }) }, [...])`. This guarantees AuthGate sees `ready` on arrival, with no reliance on React flush order.
   - Busy state: `const busy = mutation.isPending || mutation.isSuccess`. Use it for `disabled` and `aria-busy`, so the button stays busy from click until navigation unmounts the form. `gcTime: 0` is fine.
   - Handle non-ready outcomes, or the button spins forever. `needs-account` (the user has several accounts) and `error` are possible after login. For `needs-account`/`error` the form should navigate anyway: AuthGate renders the picker or the error message and carries the redirect, so use `status !== 'loading' && status !== 'signed-out'`. Note that the status may still be `signed-out` before the reload finishes. If login succeeded but the reload yields `signed-out`, the form hangs, so also call `reload()` in `onSuccess`. That forces a fresh list, and `signed-out` after a successful login is then an error case: reset the flag and show the generic error message.
2. **`await reload()` in `mutationFn`/`onSuccess`.** This is simpler (`mutationFn: async v => { await login(v); await reload() }`), and `isPending` stays true until the snapshot is set. Risk: `reload` resolves after `setSnapshot` but before the render commits, and TanStack navigation is async, so it likely works but depends on ordering. It also cannot tell whether the result was `ready`, `needs-account` or `error`, and an error from `reload` is swallowed. It is acceptable only with the extra status check from option 1. If you pick it, put `reload()` in `onSuccess` and await it there (react-query awaits an async `onSuccess` before `isPending` flips).
- No change to AuthGate is needed. Do not touch the library (out of scope).

Regression test (AC1), in `user-auth-form.test.tsx`, name e.g. `'one sign-in lands on the protected target without bouncing back to /sign-in (BUG-003)'`:
- Do not use `renderWithAuth` as is. Build a router the way the existing `setup()` does (real `AuthProvider`, `createTestAuthClient`, `fakeIdentityApi`), but add a layout route `_authenticated` with `component: () => <AuthGate><Outlet/></AuthGate>` and `/` and `/users` under it, plus `/sign-in` rendering `<UserAuthForm redirectTo=.../>` with a `validateSearch` for `redirect` like renderWithAuth. Start at `/users` (or `/sign-in`).
  - Alternatively extend `renderWithAuth` with an optional `signInPage` render prop, with the default stub kept. This is a small test-util change and reuses its QueryClient and `clearOnAuthChange`.
- Steps: signIn once, then `await expect.element(screen.getByText('Protected: Users')).toBeVisible()`.
- Capture the bounce: record every pathname via `router.subscribe('onResolved', ...)` (or `router.history.subscribe`) and assert that after the first successful navigation to the target, no further `/sign-in` entry occurs. Also assert `api.count(LOGIN) === 1`, so a second click was not needed.
- Make it fail on origin/main deterministically. The fake `/auth/accounts` responds right away, so the race may not reproduce (the owner's repro did see `["signed-out","ready"]`, but a fast fake could win). Add a delay to the `GET /api/v1/auth/accounts` route handler, e.g. `async () => { await new Promise(r => setTimeout(r, 50)); return state.accounts.length ? json(200,{items:...}) : envelope(401,'session_invalid') }`. Pass it via `routes` in `fakeIdentityApi`. You need the default behaviour inside the handler, so close over `api.state.accounts` (api.state is returned). Do not delay the first call (the mount-time list when signed out), or the test only slows down.
  - Verify with `git stash`/checkout of origin/main's form: it must fail, then pass after the fix. Keep the delay on all calls to `/auth/accounts` if the pre-login listing is then fine (it just takes longer to leave `loading`; use `vi.waitFor` timeouts).
- Add a busy check: after click, while the delayed reload is pending, the button is `disabled` and `aria-busy="true"`. A second click does not add a login call.
- Keep the existing tests unchanged (redirect, error, Turnstile, rate-limit).

## Risks
- Hang risk in option 1 if the status never reaches a non-`signed-out` value (needs the explicit reload plus an error path as above).
- `needs-account` after login: navigating lets AuthGate show the picker; make sure it keeps the `returnTo`. Verify `useReturnTo` and the `redirect` search param, since the navigation target comes through `safeRedirect`.
- `onSettled` calls `form.resetField('password')` and Turnstile reset on success too. Harmless, but the form stays mounted while waiting, which is fine.
- Test flakiness if the delay is too short or too long. Prefer `vi.waitFor` over fixed sleeps in assertions.
- An unmounted-component navigate: if the effect runs after the form is gone it is a no-op. Guard against double navigation (the effect can re-run if `redirectTo` changes) with `signedIn` reset or a ref.

## Open questions
- Should `needs-account` (multiple accounts after login) navigate to the target and let AuthGate show the picker? I assumed yes, which is the current behaviour.
- Extend `renderWithAuth` (shared util) or build a local router in the test file? I lean toward the shared util option, since other auth-gate tests will likely want the same.

Files: /home/user/admin-pan/src/features/auth/sign-in/components/user-auth-form.tsx, /home/user/admin-pan/src/features/auth/sign-in/components/user-auth-form.test.tsx, /home/user/admin-pan/src/test-utils/auth.tsx, /home/user/admin-pan/src/features/auth/gate/auth-gate.tsx, /home/user/admin-pan/node_modules/@mmlabs/auth-client/dist/react/index.js
