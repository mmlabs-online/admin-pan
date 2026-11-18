## Attempt 1 — 2026-11-18
Verdict: PASS

### Checks (run by reviewer)
- pnpm typecheck: clean (`tsc -b`, exit 0)
- pnpm lint: clean (eslint, no output)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`), run twice: 112 files / 938 tests passed both times. Matches impl-log.
- pnpm build: "built in 1.35s"
- pnpm e2e: 30 passed (1.6m)

### Regression proof (ADR 0003, reproduced by reviewer)
- I checked out the four `*-dialogs.tsx` hosts from `origin/main` and kept the new tests. The four host tests then failed: 4 failed | 22 passed. Each failure was `Cannot find element with locator: page.getByRole('alertdialog')`: the stale timer unmounted the re-opened dialog. Afterwards I restored the hosts with `git checkout HEAD -- <hosts>`.
- I replaced `use-delayed-row-clear.ts` with the old behaviour (`return () => { setTimeout(clearRow, delayMs) }`). The hook test then gave 4 failed | 1 passed: re-open, second close, unmount and open-guard failed, and the plain delay case passed. Afterwards I restored the file with `git checkout HEAD`.
- With the fix restored, all of these pass (full suite above).

### Acceptance criteria
- [x] A regression test reproduces the bug and is deterministic. Evidence: `src/hooks/use-delayed-row-clear.test.tsx` (fake setTimeout/clearTimeout), plus one host test per host: `app-status-dialog.test.tsx`, `organizations-status-dialog.test.tsx`, `role-default-dialog.test.tsx`, `reports-table.test.tsx` ("re-opening within 500 ms of Cancel …"). All fail on base and pass after the fix (see above).
- [x] The four named files pass repeatedly. Evidence: I ran organizations-delete-dialog, organizations-status-dialog, role-default-dialog and app-status-dialog 5× each, 20/20 green. impl-log records 10× each. Two full-suite runs were green.
- [x] Focus return still works (R10). Evidence: the diff leaves `focusOpener`, `restoreFor` and the effects on `[open]` untouched (apps-dialogs.tsx, roles-dialogs.tsx). `closeWithRow` still calls `setOpen(null)` first. The existing focus tests (e.g. app-status-dialog "after success focus returns to the row's actions button") pass, and the a11y review finds no regression.
- [x] All checks pass (R8). Evidence: see Checks.

### Code review
- Hook `src/hooks/use-delayed-row-clear.ts`:
  - The effect on `[open]` cancels the pending clear when `open !== null` (re-open).
  - The empty-deps effect cancels it on unmount.
  - The `scheduleClear` callback cancels any previous timer before starting a new one, so a double close leads to one clear.
  - The timer callback checks `openRef.current === null`, which guards a close and re-open in the same batch.
  - Refs are synced in effects, not during render, which satisfies the react-hooks lint rules.
  - `clearRowRef` avoids stale closures. `useCallback` depends only on `delayMs`, which is correct because everything else is read through refs.
  - All providers use `useDialogState`, which yields `T | null` and never `undefined`, so `!== null` is sound.
- Roles host: the hook is called before `if (!app) return null`, which respects the rules of hooks.
- Reports host: it keeps the toggling `setOpen(type)`, as the plan says. Behaviour is unchanged apart from the timer.
- No other `setCurrentRow(null)` timers remain in `src` (grep).

### Issues
None.

### Rules R1–R11
No violations found. R7: the diff touches only the hook, its test, the four hosts, the four host test files and the work/ files. It matches the plan, with no out-of-plan files.

### Security / a11y blockers
None. a11y-review.md: 0 🔴. Its 🟡 "staged revert in the working tree" came from the reviewer's temporary base checkout during the regression proof. That checkout was restored: `git diff HEAD` is empty and HEAD d435635 contains the fix.

### Nits (do not block)
- 💭 Host tests wait a hard 600 ms of real time. This is intended (plan step 4), but it adds about 2.4 s to the suite.

### Follow-ups (out of scope)
- Move success toasts from per-call `mutate(…, { onSuccess })` into hook-level `useMutation` options, so they survive an unmount.
- In reports-dialogs `closeWithRow(type)`, use `setOpen(null)` instead of the toggling `setOpen(type)`.
- Hard 600 ms `settle` waits in `apps-table.test.tsx` and `organizations-table.test.tsx`.
