# BUG-003 — security review

## Attempt 1

## Security review: BUG-003, attempt 1 (appsec-engineer)

I reviewed `git diff origin/main...HEAD -- src/`, which changes three files:
- `/home/user/admin-pan/src/features/auth/sign-in/components/user-auth-form.tsx`
- `/home/user/admin-pan/src/features/auth/sign-in/components/user-auth-form.test.tsx`
- `/home/user/admin-pan/src/test-utils/auth.tsx`

I checked it against `work/tickets/BUG-003/consult-appsec-engineer.md`. I ran `pnpm typecheck` (clean), `pnpm lint` (clean; the only output is a vite config warning that was already there) and `pnpm test src/features/auth` (8 files, 76 tests, all passed). I did not run the full suite, `format:check` or `build`.

### Findings

No 🔴 blockers and no 🟡 should-fix items. Each consult constraint is met:

- **Navigation goes through `safeRedirect` only (consult R1/R3): met.** The only navigation is `user-auth-form.tsx:110`, `navigate({ href: safeRedirect(redirectTo), replace: true })`, run from an effect when the provider status changes (`:106-112`). The old direct navigation in `onSuccess` is gone; `onSuccess` now only sets a flag (`:94-96`). Nothing from `login()`'s result reaches the URL. No marker is added to the URL, the hash or Web Storage: the "just signed in" flag is React state (`:65`) plus a ref (`:66`). The existing `//evil.com` → `/` test still passes (`user-auth-form.test.tsx:97-110`).
- **No double login (consult R4): met.**
  - `busy` covers both the pending login and the time between success and navigation (`:116`).
  - The button is disabled and `aria-busy` for that whole span (`:186-187`).
  - `onSubmit` has its own guard, `if (busy) return` (`:119`).
  - The tests force a second click and assert `api.count(LOGIN) === 1` (`user-auth-form.test.tsx:278-286`).
- **Password cleared on every attempt (consult R5): met.** `form.resetField('password')` and the Turnstile reset are still in `onSettled` (`:97-101`), which now runs after `reload()`. The password is not copied into any other state or ref.
- **Signed-out after a successful login (consult R2): met.** The form shows a generic `role='alert'`, "Could not start your session. Please try again." (`:177-182`), and does not navigate. The test checks that the email is not in the alert and that `/users` is never visited (`user-auth-form.test.tsx:288-302`).
- **No secrets or PII in logs, URLs or storage (R3/R5): met.** The diff adds no `console.*`, `localStorage` or `sessionStorage` use. I grepped `src/`: there are no such calls in non-test code. The token stays inside the library, which `reload()` uses (R3).
- **`AuthGate` not weakened (consult R6): met.** `auth-gate.tsx` is not in the diff, so there is no grace period or debounce. The `error` and `needs-account` cases still go to the target, where the gate shows retry or the account picker (tests at `:304-326`).
- **Test util change: no production impact.** In `test-utils/auth.tsx:199-217`, the optional `signInPage` render prop only replaces the stub inside the test router. Its `validateSearch` passes the raw `redirect` string, but the form under test still applies `safeRedirect`.

### Notes (💭, no action needed for this ticket)

- 💭 `user-auth-form.tsx:106-115`: after the session error, `signedIn` stays `true`. If the status later becomes `ready` without a new submit (for example a sign-in broadcast from another tab), the effect navigates on its own. The target is still `safeRedirect`'d and the gate still guards it, so this carries no security risk. The cleaner fix would be to reset `signedIn` when `sessionError` is first shown.
- 💭 `user-auth-form.tsx:89`: the library ignores the result of a `reload()` that a newer call has overtaken (consult Finding 2). When switching from an account that is already signed in, `status` can still be the previous account's `ready` when `signedIn` flips, so the gate may briefly show the previous account's snapshot. That account is also signed in this browser, so the risk is low. The test at `:328-348` asserts that the last token request was for `ACCOUNT_B`.

### Follow-ups (out of scope)

- `@mmlabs/auth-client`: the provider's `login` should resolve only after the snapshot shows the new session (or return the new status), so other consumers do not hit the same race.
- If TanStack Query devtools are ever added, keep them out of production builds: `mutation.variables` holds the password while the form is mounted.

**Summary:** security PASS. Redirects stay `safeRedirect`-only, login is single-flight, the password is still cleared, no PII is in logs, URLs or storage, and `AuthGate` is unchanged.
