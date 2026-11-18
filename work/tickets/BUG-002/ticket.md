# BUG-002: Row dialogs close themselves when re-opened within 500 ms (flaky dialog/toast tests)

| Field | Value |
|---|---|
| Type | bug |
| State | BACKLOG |
| Severity | S2 |
| Priority | P1 |
| Areas | ui, a11y |
| Found in | `main` at 901dad3 and later (CI on PRs #26, #27, #29; local reviewer runs) — mock/injected API |
| Introduced in | PAN-014 / PAN-015 (`closeWithRow` with a 500 ms `setTimeout` in the `*-dialogs.tsx` hosts) |
| Attempts | 0 |
| Created | 2026-11-18 |
| Record PR | — |
| PR | — |

## Report
Owner, 2026-11-18: "sửa bug test chập chờn". Component tests fail CI at random and pass on rerun:
- `organizations-delete-dialog.test.tsx` "confirm sends DELETE, handles 204, toasts, refetches…": `toast.success` never called.
- `organizations-status-dialog.test.tsx`: one-off failure in a reviewer run.
- `roles/role-default-dialog.test.tsx`: `toast.success` never called.
- `apps/app-status-dialog.test.tsx` "disable: … cancel sends nothing": after Cancel, re-opening and clicking `Disable` times out (`locator.click` on the alertdialog button).

## Environment
- Where: Vitest browser mode (Chromium), CI `check` job and local runs · API: injected fake fetch.
- Slower runs (CI, full suite) make it more likely.

## Steps to reproduce
1. Open a row dialog that closes through `closeWithRow` (e.g. app status, org delete/status, role default), then close it (Cancel).
2. Within 500 ms, open a row dialog again (same or another row).
3. The pending `setTimeout(() => setCurrentRow(null), 500)` from step 1 fires and clears the row of the newly opened dialog; the dialog unmounts (or renders without its row) while the user is in it.

## Expected
- A dialog opened after a previous one closed keeps its row until it is itself closed; confirm, toasts and refetch run every time.

## Actual
- The new dialog disappears or loses its row ~500 ms after the previous close. In tests: the confirm button vanishes (click timeout), or the mutation finishes after the dialog unmounted so its per-call `onSuccess` (toast) never runs.

## Root cause
**Suspected** (strongly; reading the code, not yet reproduced deterministically): the stale timer in
`closeWithRow` — `src/features/apps/components/apps-dialogs.tsx:25-28`,
`src/features/organizations/components/organizations-dialogs.tsx:12-15`,
`src/features/roles/components/roles-dialogs.tsx:28-31`, `src/features/reports/components/reports-dialogs.tsx:16-19`.
The timeout is never cancelled when a dialog re-opens, so it clears `currentRow` belonging to the next dialog. Per-call
`mutate(…, { onSuccess })` callbacks do not run once the component unmounts, which explains the missing toasts. Cause is
in this repo, not org-admin-api. This is also a real user bug (fast re-open), not only a test problem.

## Depends on
None.

## Scope
- Fix the cause above in every `*-dialogs.tsx` host that uses `closeWithRow` (cancel the pending timer on re-open/unmount, or clear the row only when no dialog is open); nothing else (R7).

## Out of scope
- Other flaky patterns not caused by `closeWithRow` (record separately if found).
- Rewriting the dialog hosts or ConfirmDialog.

## Acceptance criteria
- [ ] A regression test reproduces the bug: close a row dialog, re-open one within 500 ms, wait > 500 ms, the dialog is still open with its row and confirm works (fails on `origin/main` before the fix and passes after; use fake timers or a controlled wait so it is deterministic). One per affected host, or a shared hook test plus one host test.
- [ ] The four named test files pass repeatedly (e.g. 10 consecutive runs of each file, and two full-suite runs).
- [ ] Focus return after close still works (R10).
- [ ] All checks pass (R8).

## Technical notes
- Files: the four `*-dialogs.tsx` hosts above (optionally a small shared hook, e.g. `useDelayedRowClear`), their tests.
- Test level: Vitest browser mode.

## Notes / answers from owner
- 2026-11-18 (owner): "merge rồi sửa bug test chập chờn" — fix now (option C).
