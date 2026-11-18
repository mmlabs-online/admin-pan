Status: READY

# Plan — BUG-002: Row dialogs close themselves when re-opened within 500 ms (flaky dialog/toast tests)

## Spec summary
This is a bug ticket. The feature reference is the bug report in `ticket.md` (Report, Steps, Expected, Actual, Root cause). The broken behaviour is part of:

- `docs/spec-v1.md` §2: "Safe by default: destructive actions are confirmed, and every change is visible in the audit log."
- §5.3 Organizations: "List (paginated), create, detail, edit, suspend/reactivate, delete with confirmation."
- §5.4 Apps, roles and access: "Apps registry (join policy, org mode, origins, default role), roles and their permissions…"
- §6: "WCAG 2.2 AA (rule R10)." Focus return must keep working.

Expected (ticket): "A dialog opened after a previous one closed keeps its row until it is itself closed; confirm, toasts and refetch run every time."

**Root cause: confirmed by reading the code.** The planner did not run anything. Each host's `closeWithRow` calls `setTimeout(() => setCurrentRow(null), 500)` and never cancels it:
- `src/features/apps/components/apps-dialogs.tsx:25-28`
- `src/features/organizations/components/organizations-dialogs.tsx:12-15`
- `src/features/roles/components/roles-dialogs.tsx:28-31`
- `src/features/reports/components/reports-dialogs.tsx:16-19`. Here it is `setOpen(type)` plus the same timer.

Every host renders its row dialogs under `{currentRow && (…)}` (apps:51, orgs:25, roles:63, reports:30). So when a stale timer fires after a re-open, it unmounts the newly opened dialog.

The success toast is lost because of how the dialogs call `mutate`. Example: `app-status-dialog.tsx:34-42` calls `mutation.mutate(…, { onSuccess: () => { onOpenChange(false); toast.success(…) } })`. A per-call `onSuccess` is dropped when the observer unmounts mid-request. The hook-level invalidation still runs, which is why the refetch happens but the toast does not.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A regression test reproduces the bug: close a row dialog, re-open within 500 ms, wait > 500 ms; the dialog is still open with its row and confirm works. It fails on `origin/main` before the fix and passes after. | **Hook test:** `src/hooks/use-delayed-row-clear.test.tsx`, deterministic with fake timers. **Host tests, one per host:** the "re-open within 500 ms" tests in `app-status-dialog.test.tsx`, `organizations-status-dialog.test.tsx`, `role-default-dialog.test.tsx` and `reports-table.test.tsx`. **impl-log evidence:** (a) output of the host tests failing with the fix reverted, i.e. the four `*-dialogs.tsx` files at `origin/main` with the new tests kept; (b) output of the hook test failing against a naive copy of the old behaviour (see Approach step 6); (c) all of them passing after the fix. |
| 2 | The four named files pass repeatedly | impl-log records each of `organizations-delete-dialog.test.tsx`, `organizations-status-dialog.test.tsx`, `role-default-dialog.test.tsx` and `app-status-dialog.test.tsx` run 10× in a row (`pnpm test <file>` in a loop, all green), plus two full `pnpm test` runs, all green. The reviewer may re-run a sample. |
| 3 | Focus return after close still works (R10) | Existing tests still pass unchanged: `app-status-dialog.test.tsx` › "after success focus returns to the row's actions button (not body)"; the roles focus-return tests in `role-default-dialog.test.tsx`, `role-delete-dialog.test.tsx` and `roles-table.test.tsx` (whichever assert `toHaveFocus`); the org detail-sheet `returnFocus` tests. The `restoreFor` / `focusOpener` effects (apps:31-37, roles:36-43) are not modified: check the diff. |
| 4 | All checks pass (R8) | `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` are green and their output is recorded in impl-log. |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/hooks/use-delayed-row-clear.ts` | **Create.** Shared hook that schedules the delayed row clear. It cancels the timer on re-open (`open !== null`) and on unmount, and the timer callback checks that no dialog is open. | Fixes the cause once instead of four copies (ticket technical notes; consult recommendation). |
| `src/hooks/use-delayed-row-clear.test.tsx` | **Create.** Unit tests for the hook with fake `setTimeout`/`clearTimeout`. | AC 1 (deterministic regression); R8 (logic has unit tests). |
| `src/features/apps/components/apps-dialogs.tsx` | Replace the inline `setTimeout` in `closeWithRow` with the hook's scheduler. | Root cause site. |
| `src/features/organizations/components/organizations-dialogs.tsx` | Same change. | Root cause site. |
| `src/features/roles/components/roles-dialogs.tsx` | Same change. Call the hook **before** `if (!app) return null` (rules of hooks). | Root cause site. |
| `src/features/reports/components/reports-dialogs.tsx` | Same timer change. Keep `setOpen(type)` as it is. | Root cause site. The toggle is a follow-up. |
| `src/features/apps/components/app-status-dialog.test.tsx` | Add the host regression test. | AC 1. |
| `src/features/organizations/components/organizations-status-dialog.test.tsx` | Add the host regression test. | AC 1. |
| `src/features/roles/components/role-default-dialog.test.tsx` | Add the host regression test. | AC 1. |
| `src/features/reports/components/reports-table.test.tsx` | Add the host regression test. It uses `ReportsTestHarness`, which already renders `ReportsDialogs`. | AC 1. |
| `src/features/organizations/components/organizations-delete-dialog.test.tsx` | Only if needed: minimal hardening (see Approach step 5). | AC 2. It is one of the four flaky files. |

No other files. If the implementer must touch another file, they record why in impl-log (R7).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| **Regression (hook):** `src/hooks/use-delayed-row-clear.test.tsx` › "re-opening a dialog before the delay cancels the pending row clear" | Bug cause, deterministic. `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`, `renderHook` from `vitest-browser-react` with `open` as a prop. Steps: rerender `open='status'`, call the scheduler, rerender `open=null` (close), advance 300 ms, rerender `open='status'` (re-open), advance 1000 ms. Expect `clearRow` not called. |
| `use-delayed-row-clear.test.tsx` › "clears the row once after the delay when nothing re-opens" | Close, advance 499 ms: not called. Advance 1 ms: called exactly once. Keeps the exit-animation delay. |
| `use-delayed-row-clear.test.tsx` › "a second close restarts the delay (one clear only)" | Two scheduler calls 300 ms apart (the roles delete case, where `closeDeleted` and `closeConfirm` both fire): called once, 500 ms after the second call. |
| `use-delayed-row-clear.test.tsx` › "unmount cancels the pending clear" | Close, unmount, advance 1000 ms: not called. |
| `use-delayed-row-clear.test.tsx` › "does not clear while a dialog is open even if open did not change" | `openRef` guard. Schedule while `open='status'` is still set (no rerender to null), advance 500 ms: not called. |
| **Regression (host, apps):** `app-status-dialog.test.tsx` › "re-opening within 500 ms of Cancel keeps the dialog and its row; confirm still PATCHes and toasts" | Open calechip › Disable, click Cancel, wait for the dialog to be removed, re-open at once with the existing `open()` helper. Then `await new Promise((r) => setTimeout(r, 600))`. Assert the alertdialog is visible and still names `Calechip`. Click `Disable`. Assert one PATCH to `/api/v1/apps/calechip` and `toast.success('App calechip disabled.')`. Keep the assertion order: assert the toast/PATCH, not only that the dialog was removed. |
| **Regression (host, orgs):** `organizations-status-dialog.test.tsx` › "re-opening within 500 ms of Cancel keeps the dialog and its row; confirm still PATCHes and toasts" | Same pattern with Acme Corp › Suspend: one PATCH `{status:'suspended'}` and `toast.success('Organization "Acme Corp" suspended.')`. |
| **Regression (host, roles):** `role-default-dialog.test.tsx` › "re-opening within 500 ms of Cancel keeps the dialog and its row; confirm still PATCHes and toasts" | Same pattern with stoktok:viewer › Set as default, using an immediately resolving PATCH. Assert the PATCH body `{default_role_id: VIEWER_ID}` and the toast. |
| **Regression (host, reports):** `reports-table.test.tsx` › "re-opening delete within 500 ms of Cancel keeps the dialog; confirm deletes and toasts" | Weekly sign-ups › Delete › Cancel, re-open, wait 600 ms. The dialog still names the report. Click Delete: the row is gone and `toast.success('Report "Weekly sign-ups" deleted.')`. |

## Approach
1. **Hook** `useDelayedRowClear(open: unknown, clearRow: () => void, delayMs = 500): () => void`. It returns `scheduleClear`.
   - `timer` ref; `cancel = () => clearTimeout(timer.current)`.
   - `openRef` and `clearRowRef`, synced inside an effect. Do not write refs during render, or the react-hooks lint rules will fail.
   - Effect on `[open]`: sync `openRef`; if `open !== null`, `cancel()`.
   - Unmount effect: `cancel()`.
   - `scheduleClear`: `cancel()`, then `timer.current = setTimeout(() => { if (openRef.current === null) clearRowRef.current() }, delayMs)`.
   - Add a short doc comment: the delay keeps the row mounted through the ~200 ms Radix exit animation; re-open and unmount cancel it (BUG-002).
2. **Hosts.**
   - apps, orgs and roles: `const scheduleClear = useDelayedRowClear(open, () => setCurrentRow(null))`, then `closeWithRow = () => { setOpen(null); scheduleClear() }`.
   - roles: put the hook call above `if (!app) return null`.
   - reports: `closeWithRow = (type) => () => { setOpen(type); scheduleClear() }`. The toggle is unchanged.
   - Do not touch `close`, `restoreFor`, `focusOpener`, `closeStatus`, `closeConfirm` or `closeDeleted`, apart from what they call.
3. **Hook tests** (fake timers, only `setTimeout`/`clearTimeout`, `vi.useRealTimers()` in `afterEach`). No Radix and no Query in this file.
4. **Host regression tests:**
   - Use **real** timers. Do not use fake timers with Radix, `userEvent` or `expect.element` (consult risk).
   - Re-open as soon as the closing dialog is removed (~200 ms exit animation). On `main` this is well under 500 ms, so the stale timer always fires inside the 600 ms wait and the dialog unmounts.
   - Do not add a wall-clock guard assertion: it could itself flake after the fix.
5. **Flaky files: minimal hardening only.**
   - The four files already assert the request and `toast.success` after the dialog is removed, so the false positive (dialog removed by the stale timer) is already caught by the following toast assertion.
   - Change an existing test only if it checks dialog removal without a following toast or request assertion. In that case add that assertion. No other edits, no refactors.
6. **Prove the regression tests fail before the fix** (ADR 0003). Record both runs in impl-log:
   - (a) With the new host tests in place and the four `*-dialogs.tsx` restored to `origin/main` (`git stash` / `git checkout origin/main -- <files>`), run the four host tests. They fail: the dialog is gone after the 600 ms wait.
   - (b) For the hook test, temporarily replace the hook body with the old behaviour (`return () => { setTimeout(clearRow, delayMs) }`) and show that the re-open, unmount and open-guard cases fail.
   - Restore the fix and show all green.
7. **Stability (AC 2).**
   - Loop each of the four flaky files 10× in a row, then run the full suite twice. In the cloud sandbox set `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
   - Record pass counts in impl-log.
8. Run all R8 checks and `pnpm format`.

Rules:
- **R7:** the diff is limited to the hook, the four hosts and the tests.
- **R9:** no change to confirmation behaviour; mutations stay non-optimistic.
- **R10:** focus effects are unchanged and their tests must pass.
- **R1–R6** are not affected: no API, auth, config or HTML-rendering changes.

## Specialist input used
`consult-frontend-developer.md`:
- **Adopted: root-cause confirmation** (findings 1–3), including the per-call `onSuccess` drop that explains the missing toasts.
- **Adopted: shared hook shape** (Recommendations › Fix), with cancel on `open !== null` and on unmount.
- **Adopted: the `openRef` guard** from Risks › "same-tick edge". It is cheap and covers a close and re-open in one batch.
- **Adopted: hook test with fake timers limited to `setTimeout`/`clearTimeout`, and host tests with a real 600 ms wait.**
- **Adopted: all four hosts get a host test.** The owner's decision answers open question 2, and reports has `ReportsTestHarness`.
- **Adopted: reports keeps `setOpen(type)`** (finding 7 → follow-up).
- **Adopted: focus effects untouched.**
- **Adjusted:** the consult suggests adding `expect.poll(toast.success)` hardening. The planner checked the four files: they already assert the toast or request right after removal, so hardening applies only where such an assertion is missing.
- **Adjusted:** the consult says the re-open happens "within a few ms" of the close. In practice, Radix modal pointer blocking during the ~200 ms exit makes the re-open land at about 200–350 ms. That is still under 500 ms, so the host tests still fail on `main`. The fake-timer hook test is the strictly deterministic guard.

## Assumptions
- The owner chose a shared hook `src/hooks/use-delayed-row-clear.ts` used by all four hosts. It cancels on re-open (`open !== null`) and on unmount, and the timer callback checks `openRef`.
- The owner chose that reports keeps its own `setOpen(type)` call. The fragile toggle is a follow-up.
- Regression coverage is the hook test with fake timers plus one host test per host (apps, organizations, roles, reports), each with a ~600 ms real wait after Cancel and an immediate re-open. The implementer shows each failing before the fix in impl-log.
- In the four flaky files, hardening is minimal and only where it removes a false positive.
- Focus-return effects are unchanged and their tests must still pass.
- Stability is checked with 10 consecutive runs of each of the four flaky files and two full-suite runs, recorded in impl-log.
- The 500 ms delay value is kept. It exists for the 200 ms exit animation (consult finding 8).
- For organizations the host test goes in `organizations-status-dialog.test.tsx`. The delete dialog uses the same host and timer, so a second org host test adds nothing.

## Blocking questions
None.

## Split proposal
None. About 150 changed lines, no migration, one bug.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/apps`, `/organizations`, `/roles`, `/reports` (row dialogs only) | unchanged | unchanged; only the row lifetime after close changes | unchanged (fast re-open now keeps the dialog) | unchanged |

## API calls used
None. No API call changes.

## Follow-ups (not in this diff, R7)
- Move success toasts from per-call `mutate(…, { onSuccess })` into hook-level `useMutation` options, so they survive an unmount (for example, navigating away mid-request).
- `reports-dialogs.tsx` `closeWithRow(type)` uses the toggling `setOpen(type)` (`use-dialog-state.tsx:14-15`). A second call would re-open the dialog. Switch it to `setOpen(null)`.
- Hard `settle` waits (600 ms) in `apps-table.test.tsx:10` and `organizations-table.test.tsx:15`.
