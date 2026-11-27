## Consult: appsec-engineer, BUG-003 (sign-in needs two clicks)

Files read: `/home/user/admin-pan/work/tickets/BUG-003/ticket.md`, `/home/user/admin-pan/src/features/auth/sign-in/components/user-auth-form.tsx`, `/home/user/admin-pan/src/features/auth/gate/auth-gate.tsx`, `/home/user/admin-pan/src/lib/safe-redirect.ts`, `/home/user/admin-pan/src/routes/(auth)/sign-in.tsx`, `/home/user/admin-pan/src/features/auth/gate/use-return-to.ts`, and the vendored library at `/home/user/admin-pan/node_modules/@mmlabs/auth-client/dist/{client.js,react/index.js}`. I did not write any files.

### Findings

1. **The root cause in the ticket is correct.** `client.login()` calls `selectAccount()`, which emits `onChange`. The provider then starts `reload()` (`listAccounts()`) without awaiting it, and `login()` resolves before that finishes. `onSuccess` (user-auth-form.tsx:87-89) navigates while `status` is still `signed-out`, so `AuthGate` (auth-gate.tsx:22-23) bounces the user back. This is a functional bug, not a security bug. The gate fails closed, which is the right direction.

2. **`reload()` is exposed by `useAuth()` and never throws.** It catches all errors and turns them into `status: 'signed-out' | 'error'`. It also has a sequence guard: if a newer `reload()` starts, for example from a cross-tab broadcast or the `onChange` one, an older call returns **without setting state**. So `await reload()` does not guarantee the snapshot is updated when it resolves. Navigating right after `await reload()` is better than today but can still race.

3. **Before login, `status` is `signed-out`, and `reload()` never sets `loading`.** A "navigate when status changes" effect therefore needs a local "login succeeded" flag. On its own, `status` cannot tell "not signed in yet" from "signed in, reload pending".

4. **Double submission today.** The button has `disabled={mutation.isPending ...}`. If `reload()` is moved inside `mutationFn`, `isPending` covers login and reload. But once the mutation succeeds, the button is enabled again until navigation commits. That gap lets a second click or Enter start a second `POST /auth/login`. `onSubmit` has no guard of its own.

5. **Password clearing.** `onSettled` resets `password` and the Turnstile widget. That still holds if reload is awaited in `mutationFn`, because `onSettled` runs after it. TanStack Query also keeps the password in `mutation.variables` while the form is mounted (`gcTime: 0` clears it only after unmount). A longer pending phase keeps it there a bit longer. This is low risk and only in memory.

6. **Redirect target.** `safeRedirect(redirectTo)` is applied when navigating, and the route also caps `redirect` at 2048 characters. `RedirectToSignIn` builds `redirect` through `useReturnTo()`, which uses `safeRedirect` and never includes the hash. Both are fine today. The fix must keep `safeRedirect` as the only producer of the `href`.

7. **R3 / R5.** Today the token is only in the library's memory cache and the only persisted value is `mm_account_id` (library store). I found no `console.*`, `localStorage` or `sessionStorage` use in `src/` outside tests. `login()` returns `user.email`, and the form ignores it today.

### Recommendations (constraints the fix must keep)

- **R1. Navigate only once the state is right, from an effect on the provider status.** Do not navigate from `onSuccess` directly.
  - `mutationFn: async (v) => { await login(v); await reload() }`. `reload` comes from `useAuth()`, so this stays library-only (R3).
  - `onSuccess` sets a component-state flag, e.g. `const [signedIn, setSignedIn] = useState(false)`.
  - `useEffect(() => { if (signedIn && status !== 'signed-out' && status !== 'loading') void navigate({ href: safeRedirect(redirectTo), replace: true }) }, [signedIn, status, ...])`.
  - Let the gate handle `ready`, `needs-account` and `error` as it does today.
  - This removes the race in Finding 2.
- **R2. Never navigate while the status is `signed-out` after a successful login.** In that case the session cookie did not stick or `listAccounts` returned no accounts. Navigating would bring back the silent loop. Stay on the form and show a generic `role='alert'` message, e.g. "Signed in, but the session could not be loaded. Please try again." The message must not include the email or the error details.
- **R3. Keep `safeRedirect(redirectTo)` at the moment of navigation** and pass its result only as `href`. Do not cache a raw `redirectTo`, read `window.location`, or pass anything from `login()`'s result into the URL. Do not add a marker such as `?signed_in=1` or `#...` to the URL or to Web Storage. The "just signed in" flag must be React state only.
- **R4. Block double submission in two places.**
  - Disable the button with `mutation.isPending || signedIn` (plus the existing Turnstile condition), and keep `aria-busy` true for the same span.
  - Guard at the top of `onSubmit`: `if (mutation.isPending || signedIn) return`. Implicit Enter submission through a disabled default button is blocked by the browser, but do not rely on that alone.
  - The regression test should assert the fake API received **exactly one** login request.
- **R5. Keep password clearing on every attempt.** Keep `form.resetField('password')` and `turnstile.current?.reset()` in `onSettled`. Do not move them to `onError` only. Do not copy the password into any other state or ref.
- **R6. Do not weaken `AuthGate`.** No grace period, debounce or "render children while signed-out after login" change in `auth-gate.tsx`. The gate must keep failing closed. If `auth-gate.tsx` is touched at all, children may render only after `ready` and an `ok` access check. My advice is not to change it.
- **R7. Logs and tests.** Add no `console.*` and no log or toast containing the email, password, account id or token. In the regression test, use fake credentials from `@/test-utils/auth`. Do not snapshot request bodies into test output.

### Risks

- **Effect-based navigation and later status changes.** If a broadcast `onChange` from another tab (e.g. logout) arrives between the flag and navigation, the status can go back to `signed-out`. With R1/R2 the form then waits or shows an error instead of looping. That is acceptable.
- **The form could stay busy forever** if `reload()` resolves but its result is superseded and the state never changes. A newer reload always settles, so this is unlikely. Still, the test should cover `listAccounts` failing (status `error`): the gate should show its retry message, with no infinite spinner on the form.
- **Leaving `onSuccess` navigation alongside the effect** would cause a double navigation and bring the race back. Remove it.
- **Library follow-up.** `login()` resolving before the provider state is updated is a footgun for every consumer, including other mmlabs apps. Record it as a follow-up for `@mmlabs/auth-client`: the provider's `login` could await `reload()`. This is out of scope per the ticket.

### Open questions

1. Is a successful login followed by `signed-out` a case to handle in this ticket, or only a guard (stay on the form, generic error) with the cause recorded as a follow-up? I recommend the guard in this ticket. It is small, and without it the fix can still loop silently.
2. When an already signed-in user (`ready`) opens `/sign-in`, should they be sent to the redirect target? That is out of scope for BUG-003. Note it only so the implementer does not make the effect depend on `status` alone, which would add that behaviour implicitly.

### Follow-ups (out of scope)

- `@mmlabs/auth-client`: the provider's `login` should resolve after the snapshot reflects the new session (or return the new status).
- Make sure TanStack Query devtools, if added later, are excluded from production builds, because `mutation.variables` holds the password while the form is mounted.
