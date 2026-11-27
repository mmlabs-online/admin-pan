# Implementation log — BUG-003

## Attempt 1

### Files touched
- `src/features/auth/sign-in/components/user-auth-form.tsx` (the fix)
- `src/features/auth/sign-in/components/user-auth-form.test.tsx` (regression + companion tests; one existing test's fake adjusted, see Deviations)
- `src/test-utils/auth.tsx` (`renderWithAuth` gets optional `signInPage` prop; default unchanged)

Out-of-plan files: none.

### Tests added / changed
New `describe('UserAuthForm (behind AuthGate)')` with 6 tests (regression is the first):
1. one sign-in reaches the protected redirect target without bouncing to /sign-in (BUG-003)
2. keeps the button disabled and aria-busy until navigation; a second click does not log in again
3. signed-out after a successful login stays on the form with a generic alert, no navigation
4. accounts error after login opens the target, where the gate shows retry
5. needs-account after login opens the target with the account picker
6. account switch from a ready account lands as the newly signed-in account

**Before the fix** (form restored to HEAD, tests applied), `pnpm vitest run --browser.headless src/features/auth/sign-in`:
```
× one sign-in reaches the protected redirect target without bouncing to /sign-in (BUG-003)
VitestBrowserElementError: Cannot find element with locator: page.getByText('Protected: Users')
  (DOM: the sign-in form is rendered again; gate bounced back to /sign-in)
× keeps the button disabled and aria-busy ... / × signed-out after ... / × accounts error ... / × needs-account ...
× account switch ...: expected token body account_id ACCOUNT_B, received ACCOUNT_A (navigated while still ready as A)
Tests  6 failed | 8 passed (14)
```
**After the fix:** `src/features/auth` 8 files / 76 tests passed; all 14 tests in the form file pass, existing ones included.

### Fix
`mutationFn` awaits `login()` then `reload()`; `onSuccess` sets a `signedIn` flag; an effect navigates once (ref-guarded) via `safeRedirect(redirectTo)` when status is not `signed-out`/`loading`. Signed-out after login shows "Could not start your session. Please try again." and re-enables the button. Button is busy/disabled with `aria-busy` until navigation; `onSubmit` is guarded.

### Deviations from plan
- `sessionError` is derived (`signedIn && status === 'signed-out'`) instead of state set in an effect: lint rule `react-hooks/set-state-in-effect` rejected the planned `setSignedIn(false)/setSessionError(true)` in the effect. Behaviour is the same; `onSubmit` resets `signedIn`.
- The gated harness applies `postLogin` only after login (the planned snippet applied it at mount too, which hid the form).
- Existing test "turnstile_required reveals the widget..." : its custom `ok` login handler did not create a session in the fake, so the new post-login reload (correctly) saw signed-out. I made `ok` set `api.state.accounts` (like a real login does). Assertions unchanged.
- Plan's `tokens.at(-1)` replaced by `tokens[tokens.length - 1]` (TS lib target).

### Checks (CLAUDE.md env: PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium)
- pnpm typecheck: pass
- pnpm lint: pass
- pnpm format:check: All matched files use Prettier code style!
- pnpm test: Test Files 124 passed (124), Tests 1009 passed (1009)
- pnpm build: built in 2.23s

### Follow-ups
- `@mmlabs/auth-client`: `AuthProvider.login` should await `reload()` before resolving.
- Local untracked `__screenshots__` from failed runs are git-ignored (not part of diff).
