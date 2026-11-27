# Review — PAN-032

## Attempt 1 — 2026-11-27
Verdict: PASS

### Checks (run by reviewer)
Run on `claude/zealous-turing-4o04h1` with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- pnpm typecheck: ok (`tsc -b`, no errors)
- pnpm lint: ok (eslint, no output)
- pnpm format:check: ok ("All matched files use Prettier code style!")
- pnpm test: 124 files and 1016 tests passed. This matches impl-log.
- pnpm build: ok ("built in 1.08s")
- pnpm e2e: not planned

Mutation checks, run in a throwaway worktree of HEAD and removed afterwards:
- **Guards removed** (form-level early return and the `inFlight`/`busy` check in `onSubmit`): 3 tests fail.
  - "keeps focus on the aria-disabled button while busy … (BUG-003)": LOGIN count 3, expected 1
  - "Enter in the password field while busy …": 2, expected 1
  - "turnstile_required: … Enter submits nothing …": 2, expected 1

  So the single-login and Turnstile tests are not vacuous.
- **Native `disabled={blocked}` re-added on the button:** 3 tests fail on `toHaveFocus` ("keeps focus … while busy", "session error: focus stays …", "turnstile_required: focus stays …"). So the focus tests detect the original a11y defect.

### Acceptance criteria
- [x] **AC1.** The button keeps focus while busy (`aria-disabled`, not native `disabled`), and a second activation starts no second login.
  - Code: `user-auth-form.tsx`. The native `disabled` prop is gone. The button gets `aria-disabled={blocked || undefined}`. There is a form-level early return in `onSubmit` and an `inFlight` ref set synchronously in `onSubmit`.
  - Tests: "keeps focus on the aria-disabled button while busy; a second click or Enter does not log in again (BUG-003)" and "Enter in the password field while busy submits nothing and shows no validation message" both pass, and both fail when the guards are removed (see above).
- [x] **AC2.** After a failed attempt, focus is on the button and the form can be retried from the keyboard.
  - Tests:
    - "invalid_credentials: focus stays on the button, status empties, Enter retries" (LOGIN count goes to 2 on Enter)
    - "rate_limited: focus stays on the button after the alert"
    - "turnstile_required: focus stays on the aria-disabled button; Enter submits nothing until a token arrives"
    - "session error: focus stays on the button; Enter retries"
  - All pass. The session-error and Turnstile tests fail with native `disabled`.
- [x] **AC3.** The `role="status"` region is always rendered, says "Signing in…" while busy and is empty otherwise. The spinner is `aria-hidden`.
  - Code: the `<p role='status' className='sr-only'>` is unconditional, and `aria-hidden='true'` is set on `Loader2` and `LogIn`.
  - Tests: "status region exists empty before submit and says Signing in… while busy" and "spinner is aria-hidden while busy". The invalid_credentials and session-error tests also check that the status is empty after the error. I confirmed that `toHaveTextContent('')` in @vitest/browser 4.1.4 only passes on empty text (it has a `checkingWithEmptyString` guard), so these assertions are real.
- [x] **AC4.** Existing behaviour and tests are unchanged.
  - The BUG-003 regression test "one sign-in reaches the protected redirect target without bouncing to /sign-in (BUG-003)" is untouched and passes.
  - The changed assertions are judged one by one under "Changed assertions" below. None is weakened.
- [x] **AC5.** Vitest browser-mode tests cover focus during and after busy and the status text. See AC1–AC3. All of them run under `pnpm test`.

### Changed assertions: is anything weakened?
- **Turnstile test.**
  - `toBeDisabled()` became `toHaveAttribute('aria-disabled','true')`, and `toBeEnabled()` became `not.toHaveAttribute('aria-disabled')`.
  - This is equivalent for the new contract. The "no submit without a token" rule moved from the DOM to code. A new test covers it with keyboard Enter, and that test fails when the guard is removed.
  - Not weakened.
- **Session-error test.** `toBeEnabled()` is kept and an aria-disabled check is added. This is stricter.
- **Old busy test, replaced.**
  - The old version used `toBeDisabled()` and a forced `userEvent.click`. The new version asserts `aria-disabled="true"`, `not.toHaveAttribute('disabled')`, `aria-busy="true"` and `toHaveFocus()`. It then sends a native `.click()` and a keyboard `{Enter}`, and still requires `count(LOGIN) === 1`.
  - Using native `.click()` instead of a forced userEvent click is fine. It dispatches a real click on the submit button, which submits the form. This is the same approach as confirm-dialog.test.tsx.
  - Stricter, not weaker.

**BUG-003 single-login guarantee:** still holds.
- `inFlight` is set synchronously before `mutation.mutate`.
- It is reset only in `onError` and when `sessionError` becomes true. It is never reset on success, so the form stays guarded until navigation unmounts it.
- The `onSubmit` re-check covers two submits that both get past the outer guard during async zod validation.
- This is proven by the mutation check above.

### Issues
None blocking.

### Rules R1–R11
No violations found.
- R3: login still goes only through `useAuth().login`, and the password goes nowhere new.
- R7: the implementation touches only the two planned files. Commit f6c4714 (ticket files and backlog rows) and the workflow files under `work/` are not counted.
- R8: all checks are green.
- R10: this is the goal of the ticket.

### Security / a11y blockers
None.
- security-review.md: no 🔴. It has two 🟡 items, copied under Nits below.
- a11y-review.md: no 🔴 and no 🟡.

### Nits (do not block)
- 💭 The invalid_credentials and rate_limited focus tests also pass with native `disabled`. The login fails so fast that Chromium never drops focus. AC2 is still met: the code never natively disables the button, and the session-error and Turnstile tests are discriminating. To make the fast-failure tests prove focus retention, use a login handler that delays about 150 ms before the error envelope.
- 💭 (security 🟡 1) `onSubmit` checks `busy || inFlight.current` but not `turnstileMissing`. Today only the form-level guard enforces Turnstile. Adding `turnstileMissing` to the `onSubmit` early return would give defence in depth.
- 💭 (security 🟡 2) In the Turnstile Enter test, `expect(t.api.count(LOGIN)).toBe(1)` runs straight after `{Enter}`, so a late submit could slip past it in theory. My mutation run showed it does catch a missing guard. Re-checking the count after `opts.callback` would make it robust.
- 💭 In "Enter in the password field while busy", the "Please enter your password." check is a single synchronous `query()`, not a retrying or delayed check. The LOGIN count is the real guard.
- 💭 The status test uses a lazy locator, so it does not prove it is the same DOM node before and after the change. The unconditional render is visible in the code, so this is acceptable.

### Follow-ups (out of scope)
- The same aria-disabled and status-region pattern on reset-password, verify-email and the other auth forms.
- An axe/Playwright check of `/sign-in` in the busy and error states once PAN-023 lands.
- BUG-003 a11y 💭 5: the possible stuck `loading` state with no timeout.

## Attempt 2 — 2026-11-27
Verdict: PASS

Scope of this attempt: the owner asked for a rework that fixes only the two 🟡 items in security-review.md Attempt 1. Commits b21505e (ticket/backlog state) and 0386d0a (fix). The later commits 015019b and 86963a3 only add a11y/security review notes under `work/`.

### Checks (run by reviewer)
Run on `claude/zealous-turing-4o04h1` with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- pnpm typecheck: ok
- pnpm lint: ok
- pnpm format:check: ok ("All matched files use Prettier code style!")
- pnpm test: 124 files and 1016 tests passed. This matches impl-log Attempt 2.
- pnpm build: ok ("built in 943ms")
- pnpm e2e: not planned

The flaky run mentioned in the impl-log is in `src/features/roles/components/role-permissions-dialog.test.tsx`. It is unrelated to this change: no commit on the branch touches `src/features/roles/`, nothing in that folder imports the sign-in code, it passed in my full run, and it passed 3 out of 3 isolated reruns (19/19 each time).

### Rework items (security-review.md Attempt 1)
- [x] **🟡 1. `onSubmit` checks for a missing Turnstile token.**
  - Code: `src/features/auth/sign-in/components/user-auth-form.tsx:128` is now `if (busy || inFlight.current || turnstileMissing) return`. `turnstileMissing` is defined at :120, before the function.
  - Mutation check, run in a throwaway worktree that was removed afterwards. I removed only the form-level `blocked` check (:143) and kept the new guard: all 21 sign-in tests still pass. So the `onSubmit` guard alone blocks the Turnstile submit.
- [x] **🟡 2. The Turnstile regression test can no longer pass when the bug returns.**
  - Code: `user-auth-form.test.tsx:216`, `:219` and `:221`. The login count is checked again after the widget callback is registered and after the token arrives. Then Enter is pressed and the test waits for the count to reach 2.
  - Mutation check: with both Turnstile checks removed (form-level and `onSubmit`), "turnstile_required: … Enter submits nothing until a token arrives" fails (1 failed, 20 passed). So the test is not vacuous.

### Acceptance criteria
AC1–AC5 are unchanged from Attempt 1, and their evidence still holds: all 21 sign-in tests pass and the full suite is green. The rework only adds one guard condition and three assertions.

### Scope (R7)
`git diff 1fe1509..HEAD -- src` shows only 2 source files: `user-auth-form.tsx` (one line) and `user-auth-form.test.tsx` (+4 lines). The rest are ticket, backlog, impl-log and review files under `work/`. There are no new dependencies and nothing outside the two 🟡 items.

### Issues
None.

### Rules R1–R11
No violations found.

### Security / a11y blockers
None. security-review.md Attempt 2 reports no 🔴 or 🟡 findings, and a11y-review.md Attempt 2 reports no 🔴 or 🟡 findings.

### Nits (do not block)
- 💭 `user-auth-form.test.tsx:221`: `vi.waitFor(() => count === 2)` passes as soon as the count reaches 2, so it would not catch a late third request. A final `expect(t.api.count(LOGIN)).toBe(2)` after a later await (for example the redirect target) would assert "exactly 2".
- 💭 Security 💭 3 from Attempt 1 (caller `onSubmit` overriding the guard via `{...props}`) remains as optional hardening.

### Follow-ups (out of scope)
- As in Attempt 1.
