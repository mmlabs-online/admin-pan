# BUG-002: accessibility review

## Attempt 1

A11y review for BUG-002: no blockers (0 🔴), 1 🟡, 3 💭. Reviewed by reading the code at commit d435635 (`git diff origin/main...HEAD -- src`) plus the host files. I did not run the tests or axe.

**Heads-up on the working tree (🟡 process, not a code defect)**
- `git status` shows STAGED modifications to the four hosts, which put the old `setTimeout(() => setCurrentRow(null), 500)` back:
  - `src/features/roles/components/roles-dialogs.tsx:30`
  - `src/features/apps/components/apps-dialogs.tsx:27`
  - `src/features/organizations/components/organizations-dialogs.tsx:14`
  - `src/features/reports/components/reports-dialogs.tsx`
- My first read of these files, taken before that state appeared, showed the fixed code, and HEAD d435635 contains the fix. Someone or something staged the revert while I was reviewing, probably a "test fails before the fix" check.
- Do not commit or open the PR from this tree until `git restore --staged --worktree src/features/*/components/*-dialogs.tsx` (or the equivalent) puts the fix back. Otherwise the PR would ship the bug.
- My conclusions below are about HEAD (d435635).

**Focus return (WCAG 2.4.3): unchanged and correct**
- The diff does not touch any focus logic. These stay as they were:
  - `focusOpener`
  - the `restoreFor` ref plus effect in `apps-dialogs.tsx` and `roles-dialogs.tsx`
  - the `returnFocus` props
  - the `closeStatus`, `closeConfirm` and `closeDeleted` wrappers
- `closeWithRow` still calls `setOpen(null)` first and then the scheduler, so the focus effect keyed on `open === null` fires exactly as before.
- The row key for focus is captured in `closeStatus` / `closeConfirm` before the row is cleared, and the clear is still 500 ms later. The opener's `Actions for <key>` button is therefore found as before.
- Radix returns focus on its own `onCloseAutoFocus` / `returnFocus` paths. The timer only touches `currentRow`, not those.
- Organizations has no custom focus code (Radix trigger-based). That is unchanged.

**Dialogs no longer vanish under a keyboard or screen-reader user: fixed**
- Cause: a stale 500 ms timer from an earlier Cancel ran `setCurrentRow(null)`. That unmounted the whole `{currentRow && …}` subtree, including a dialog the user had just re-opened. Focus fell to `<body>` and the screen reader lost its context.
- The hook (`src/hooks/use-delayed-row-clear.ts`) fixes this in three ways:
  - It clears the timer in an effect whenever `open !== null`.
  - It re-checks `openRef.current === null` inside the timer callback.
  - It clears the timer on unmount.
- Each close restarts the timer.
- `openRef` is updated in an effect. The remaining race window is one commit between `setOpen(x)` and its effect, and the callback guard plus the effect cleanup cover it.

**Reports**
- `reports-dialogs.tsx` calls `setOpen(type)` in `closeWithRow`. This is not a bug: `useDialogState` toggles, so `setOpen('edit')` while `'edit'` is open sets it to `null`. `scheduleClear` therefore sees `open === null`.
- Create uses `setOpen('create')` the same way and does not schedule a clear (unchanged).

**No regressions found**
- `rg setTimeout` shows no other row-clear timers in `src` beyond these four hosts, all converted at HEAD.
- Other timers (bulk-actions live-region announcement, debounce, countdown) are untouched.
- Hook dependencies are correct: the `clearRow` ref is updated in an effect, the callback is memoised on `delayMs`, and there is no stale closure.
- Tests: the hook test covers cancel on re-open, clear after the delay, restart on a second close, cancel on unmount, and no clear while open. Each of the four hosts has a regression test that re-opens within 500 ms and waits 600 ms.

**Notes (💭)**
- The first-close case stays as before. If `open` goes `X` then `null`, the row clears 500 ms later. That is by design.
- Paths that use the non-row `close` (create dialogs) never clear `currentRow`, so a stale row can stay mounted with `open=false`. This is harmless to a11y (closed dialogs are not in the a11y tree) and was already the case, so it is not for this bug.
- If a dialog is re-opened for a different row within 500 ms, the key-based remount (`key=app-status-<key>`) gives fresh focus handling. That is correct.
- The tests assert visibility and role queries but do not assert `toHaveFocus` after the re-open. Optional follow-up: add a focus-after-re-open assertion (the existing focus-return test at `app-status-dialog.test.tsx:~161` covers Cancel only).

**Follow-ups**
- Optional: add an `@axe-core/playwright` pass on the apps, roles and organizations routes once PAN-023 lands. This change has no new markup, so no new axe findings are expected.
