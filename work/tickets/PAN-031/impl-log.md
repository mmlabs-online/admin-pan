## Attempt 1 — 2026-11-19

### Files touched
| File | Required because |
|---|---|
| `src/lib/mutation-success.ts` (new) | Shared `MutationSuccessOptions` type (data typed `unknown`: no dialog reads it). |
| `src/features/apps/api/queries.ts`, `organizations/api/queries.ts`, `organizations/api/entitlements.ts`, `roles/api/queries.ts`, `users/api/queries.ts` | 13 hooks take a trailing `options`; the callback runs in the hook-level `onSuccess` after the invalidations (awaited refetch kept for orgs and user status). |
| 13 dialogs (apps: credential-revoke, join-request-decision, permission-admin, status; orgs: delete, status, entitlement-enabled; roles: default, delete; users: status, role-assign, role-assignment-revoke, session-revoke) | `toast.success` moved, text byte-identical, into the hook `options.onSuccess`. In `role-assign-dialog` the hook call moved below `role` (the toast text needs it). In 4 dialogs the hook call moved below the `disabling`/`suspend`/`makeAdmin` const it reads. |
| `src/features/reports/components/reports-dialogs.tsx` | `closeWithRow` now `setOpen(null)` (its unused `type` param dropped); create dialog `onOpenChange` only sets null on close. |
| `src/features/reports/components/reports-dialogs.test.tsx` (new) | Double-close test. |
| `apps-table.test.tsx`, `organizations-table.test.tsx` | `settle` (600 ms) removed. |
| `app-status-dialog.test.tsx`, `organizations-status-dialog.test.tsx`, `role-delete-dialog.test.tsx`, `user-sessions-tab.test.tsx` | Unmount tests; `toHaveBeenCalledTimes(1)` on 3 happy paths. |
| `apps/api/queries.test.tsx`, `users/api/queries.test.tsx` | Hook unit tests for `options.onSuccess`. |

### Tests added / changed
- `app-status-dialog.test.tsx` › "unmount mid-request: the success toast still fires exactly once"
- `organizations-status-dialog.test.tsx` › same name
- `role-delete-dialog.test.tsx` › same name
- `user-sessions-tab.test.tsx` › "unmount mid-request: 'Session revoked.' still fires exactly once"
- `reports-dialogs.test.tsx` › "a double close of edit/delete/create leaves every dialog closed and the row is still cleared"
- `apps/api/queries.test.tsx` › "useUpdateAppMutation options.onSuccess runs once after success with data and vars, not on error"
- `users/api/queries.test.tsx` › "useRevokeAssignmentMutation options.onSuccess runs after the invalidations, not on error"
- Rewritten: apps-table "search sends trimmed q after one debounce; whitespace sends none", "URL round-trip and back/forward…"; organizations-table "search sends trimmed q after the debounce; several keystrokes…", "whitespace-only search…", "URL round-trip…".

Red before the fix (new tests written first, run on the unchanged product code):
- Reports double close: `expect(state).toHaveTextContent(/open=none/)` received `open=edit row=r1` (the second close reopened the dialog).
- 4 unmount tests, all failed on `expect(toast.success).toHaveBeenCalledWith(...)` ("Matcher did not succeed in time"): apps, organizations, roles, users. All 7 new tests pass after the change.

Settle-wait replacements (design and mutation proofs, each reverted afterwards):
- Whitespace negatives (apps, orgs) and the back tests use fake timers for `setTimeout`/`clearTimeout` only (`throughDebounce`, `try/finally` with `useRealTimers`), advanced inside `act(...)`. Without `act` the React commit that the debounce triggers had not run yet when the faked clock ended, and the negative was vacuous (found by debugging: search state still `{}`). `userEvent.type` works under the faked timers. Each is then bounded by a real sentinel (apps: fill `stok`; orgs and the sort cases: click Name/Slug sort) with exact request counts.
- (a) `toSearchTerm` without `.trim()`: orgs "trimmed q" and orgs "whitespace-only" fail; the apps tests do NOT, because `appsSearchSchema` (`searchTermSchema.trim()`) trims again. With both trims removed (`toSearchTerm` and `searchTermSchema`) all three tests (apps whitespace, orgs trimmed, orgs whitespace) fail.
- (b) `useDebouncedValue(draft, 0)`: with the original single `type('  glob  ')` the test still passed (the keystrokes arrive in one burst), so the orgs "several keystrokes" test now types in two parts with a pause under the debounce (fake clock). Result: it fails with debounce 0 and passes on the real code.
- (c) Back/forward tests: removing `dirty.current = false` in the `[value]` effect leaves them green. No realistic mutation fails them beyond the existing `toHaveValue('')` check, because they never type before going back. Not invented further. The sentinel plus fake debounce window still proves no write-back after a full debounce.
- Deviation from the plan: the back tests also run the Simulate back click inside the fake-timer window (plan: barrier + sentinel only), so the "no write-back" check covers a complete debounce deterministically. Orgs back test asserts exactly `count + 2` list calls.

### Checks (actual output summary)
- pnpm typecheck: clean (`tsc -b`).
- pnpm lint: clean (`eslint .`).
- pnpm format / format:check: "All matched files use Prettier code style!"
- pnpm test (run twice in a row, `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): both `Test Files 116 passed (116)`, `Tests 980 passed (980)`.
- pnpm build: `✓ built in 5.64s`.
- pnpm e2e: `30 passed (1.4m)`.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- The users-status toast `Disabled/Enabled ${email}` carries a full email (R5 spirit; pinned by `users-status-dialog.test.tsx`).
- Errors after unmount are silent (`handlesOwnErrors` set, per-call `onError` dropped); unreachable while close is blocked during pending.
- Unmount tests for the access-changing `mutateAsync` flows (role-permissions save, entitlement grant/edit).
- Convert the 600 ms waits at `app-status-dialog.test.tsx` ("re-opening within 500 ms…") and `reports-table.test.tsx:191` to fake timers.
- The `appsSearchSchema` and `toSearchTerm` both trim, so a single-layer regression is masked on the apps screen (only orgs has a single layer).

### Scope self-check
- Could the diff be smaller? No: 13 hooks + 13 dialogs are the inventory; the rest is tests.
- Diff size: +454 / -137 lines (27 files modified, 2 new files; includes the new tests).
