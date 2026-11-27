# BUG-003: First "Sign in" click lands back on the sign-in page; a second click is needed

| Field | Value |
|---|---|
| Type | bug |
| State | DONE |
| Severity | S2 |
| Priority | P1 |
| Areas | ui, auth, security |
| Found in | unknown (owner report 2026-11-27; reproduced on `main` 1f11a9b) |
| Introduced in | PAN-010 (1537e25) |
| Attempts | 0 |
| Created | 2026-11-27 |
| Record PR | — |
| PR | https://github.com/mmlabs-online/admin-pan/pull/37 |

## Report
Owner, 2026-11-27: *"Khi bấm login 1 lần nó không access app mà bấm lần thứ 2 mới access"* — after clicking Sign in once the app is not entered; only the second click gets in. No screenshot.

## Environment
- Where: unknown (owner did not say) · API: real org-admin-api assumed
- Any browser; any signed-in permissions

## Steps to reproduce
1. Signed out, open `/sign-in` (or any protected route, which redirects there).
2. Enter valid staff credentials and click **Sign in** once.
3. The sign-in page shows again (password cleared). Click **Sign in** again → the app opens.

## Expected
- One successful sign-in opens the app at the validated redirect target (or `/`).

## Actual
- The first successful login navigates to the target, which immediately sends the user back to `/sign-in`; the second attempt works.

## Root cause
**Confirmed** (reproduced with a throwaway Vitest browser-mode test, since deleted): the route opened right after one login first renders with `useAuth().status === 'signed-out'`, then `'ready'` (status sequence `["signed-out","ready"]`).

- `src/features/auth/sign-in/components/user-auth-form.tsx:87-89` — `onSuccess` navigates as soon as `login()` resolves.
- The library's `AuthProvider` (`@mmlabs/auth-client/react`) derives `status` from `client.listAccounts()`, which it re-runs asynchronously on the `onChange` event that `login()` emits; that request has not finished when the form navigates, so the snapshot is still `signed-out`.
- `src/features/auth/gate/auth-gate.tsx:22-23` — `AuthGate` sees `signed-out` and renders `RedirectToSignIn`, which navigates back to `/sign-in`.
- On the second click the provider has already reloaded (`ready`), so the navigation sticks.

The cause is in this repo (the form navigates before the auth state is ready). org-admin-api is not involved. The existing `user-auth-form.test.tsx` routes `/` to a stub page without the auth gate, so it never saw this.

## Depends on
None.

## Scope
- Navigate after sign-in only once the auth state reflects the new session (e.g. wait for the provider's `reload()` / `status === 'ready'`), through `@mmlabs/auth-client` only (R3); nothing else (R7).

## Out of scope
- Changes to `@mmlabs/auth-client` itself (vendored library; a library follow-up if `login()` should resolve after the state is updated).
- Account picker / `needs-account` flows other than what the fix needs.

## Acceptance criteria
- [x] A regression test reproduces the bug: it fails on `origin/main` before the fix and passes after (name the test). It signs in once through `UserAuthForm` with the real `AuthProvider` and a protected target guarded like `AuthGate`, and asserts the target is reached without a bounce back to `/sign-in`.
- [x] One successful sign-in opens the validated redirect target (or `/`); the existing redirect, error, Turnstile and rate-limit behaviour is unchanged.
- [x] All checks pass (R8).

## Technical notes
- Files: `src/features/auth/sign-in/components/user-auth-form.tsx` (+ its test); possibly `src/features/auth/gate/auth-gate.tsx`.
- Test level: Vitest browser-mode test next to the form, using `@/test-utils/auth` (`fakeIdentityApi`, `createTestAuthClient`).
- The button should stay busy until navigation happens, so a second click cannot start a second login.

## Notes / answers from owner
None yet.
