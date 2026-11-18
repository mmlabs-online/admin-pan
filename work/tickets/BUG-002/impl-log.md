## Attempt 1 — 2026-11-18

### Files touched
| File | Required because |
|---|---|
| `src/hooks/use-delayed-row-clear.ts` (new) | Shared scheduler; cancels the pending row clear on re-open (`open !== null`) and unmount; timer callback checks no dialog is open |
| `src/features/{apps,organizations,roles,reports}/components/*-dialogs.tsx` | Replaced the inline `setTimeout(() => setCurrentRow(null), 500)` with `scheduleClear()` (roles: hook called before `if (!app) return null`; reports keeps `setOpen(type)`). Focus effects untouched |

### Tests added / changed
- `src/hooks/use-delayed-row-clear.test.tsx` (new, fake setTimeout/clearTimeout): re-open cancels; clears once after 500 ms; second close restarts delay; unmount cancels; no clear while open.
- `app-status-dialog.test.tsx`, `organizations-status-dialog.test.tsx`, `role-default-dialog.test.tsx`, `reports-table.test.tsx` › "re-opening within 500 ms of Cancel keeps the dialog and its row; confirm still PATCHes and toasts" (reports: delete variant). Real 600 ms wait.
- The four flaky files needed no hardening (they already assert request/toast after removal).

### Regression proof (ADR 0003)
- Host tests with the four `*-dialogs.tsx` at the unfixed state: 4 failed | 22 passed — each `Cannot find element with locator: page.getByRole('alertdialog')` (the stale timer unmounted the re-opened dialog).
- Hook test against the old behaviour (`return () => { setTimeout(clearRow, delayMs) }`): 4 failed | 1 passed (re-open, second close, unmount, open-guard fail; plain delay passes).
- After the fix: hook + 4 host files: 5 files, 31 tests passed.

### Checks (actual output summary)
- pnpm typecheck: clean
- pnpm lint: clean
- pnpm format / format:check: "All matched files use Prettier code style!"
- pnpm test: run twice, both 112 files / 938 tests passed
- pnpm build: built OK
- pnpm e2e: 30 passed
- Stability: organizations-delete-dialog 10/10, organizations-status-dialog 10/10, role-default-dialog 10/10, app-status-dialog 10/10 consecutive runs green.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- As in plan: hook-level toasts; reports `closeWithRow` toggling `setOpen(type)`; hard 600 ms `settle` waits in apps/organizations table tests.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: ~ +230 / -8 lines (about 150 of it tests).
