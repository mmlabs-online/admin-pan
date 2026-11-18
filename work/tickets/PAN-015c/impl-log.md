## Attempt 1 — 2026-11-18

### Files touched
| File | Required because |
|---|---|
| `src/lib/permissions/registry.ts` | `roles.viewHolders` (admin:users:read, GET holders) for R4 |
| `src/features/users/data/assignments.ts` (new) | Effect copy (12 h constant), `toExpiresAt`, `zoneLabel`, `scopeLabel`, type aliases (AC1, AC4) |
| `src/features/users/data/assignments.test.ts` (new) | R8 |
| `src/features/users/data/data.ts` | `formatDateTimeZone` |
| `src/features/users/data/errors.ts`, `errors.test.ts` | `assignRoleError`, `revokeAssignmentError` (AC3) |
| `src/features/users/api/queries.ts`, `queries.test.tsx` | Paged assignments key and options, user and org pickers, assign and revoke mutations (R2, R9) |
| `src/features/roles/api/queries.ts`, `queries.test.tsx` | Holders keys and options, `allRoleDefinitionsQueryOptions` |
| `src/features/users/components/user-role-assignments.tsx` (new) + test | "Apps & roles" section moved out of the sheet: paging, Assign, Revoke, notice, focus, self and admin:* hints |
| `src/features/users/components/users-detail-sheet.tsx` + test | Local `RoleAssignments` replaced by the new component; the 6 `assignments:` tests moved, one smoke test kept |
| `src/features/users/components/role-assign-dialog.tsx` (new) + test | Shared assign dialog (user fixed or role fixed), confirm phase, error mapping |
| `src/features/users/components/assign-pickers.tsx` (new) | Explicit-selection `UserPicker` and `OrgPicker` |
| `src/features/users/components/role-assignment-revoke-dialog.tsx` (new) + test | Revoke confirm on `ConfirmDialog` |
| `src/features/users/components/assignment-test-data.ts` (new) | Fixtures and `assignmentsServer` for the tests |
| `src/features/roles/components/role-holders-sheet.tsx` (new) + test | Holders sheet (AC5) |
| `src/features/roles/components/roles-provider.tsx`, `roles-row-actions.tsx`, `roles-dialogs.tsx` | `'holders'` dialog type, "Assignments" row item, host |
| `src/features/roles/components/roles-table.test.tsx` | Assignments item test |
| `e2e/support/fake-api.ts`, `e2e/pages.e2e.ts` | Stateful assignments, holders route, one assign -> revoke -> holders test |

### Tests added / changed
- `assignments.test.ts`: effect copy per app, banned-words guard, one 12 constant, `toExpiresAt`, `zoneLabel`, `scopeLabel`
- `errors.test.ts`: `assignRoleError` (403 codes, 409, 422 reasons, reason-as-code not mapped, validation_error, 404, unknown outcome), `revokeAssignmentError`
- `users/api/queries.test.tsx`: assignments key and paging, picker options (no placeholder, gcTime 5000), org picker, assign body and invalidation, 409/404/unknown/`unknown_role` invalidation, revoke invalidation, no cache write before success
- `roles/api/queries.test.tsx`: holders keys without email, `roleHoldersQueryOptions`, `allRoleDefinitionsQueryOptions` (130 roles, page cap)
- `user-role-assignments.test.tsx` (14): states, paging and clamp, permissions, row labels and placeholder, self and admin:* guards, notices, focus, not optimistic, failure keeps the row
- `role-assign-dialog.test.tsx` (28): user-fixed and role-fixed flows, org modes, expiry, super-admin, double click, confirm phase, self, disabled user, errors, picker guards, R5/R6
- `role-assignment-revoke-dialog.test.tsx` (8), `role-holders-sheet.test.tsx` (12), `roles-table.test.tsx` (+1)
- `e2e/pages.e2e.ts`: "role assignments" (axe on assign dialog, list, revoke confirm and holders sheet; no `unmatched` calls)

### Mutation proofs (guard broken, test fails, restored)
| Guard | Break | Result |
|---|---|---|
| One search result is never auto-selected | selected the single result in `PickList` | `role-assign-dialog.test.tsx` "search fires on Search or Enter only ... not auto-selected" failed (`aria-disabled` assertion). The first try passed because the negative assertions pass at once, so a 100 ms settle was added to the test and it then failed as it should |
| Text change clears the selection | removed `onSelect(null)` from the input `onChange` | "editing the search text after a selection clears it" failed (`Selected:` still shown) |
| Double click sends one POST / DELETE | removed the `inFlight.current` early return in `send()` and in `handleConfirm` | "confirm sends one DELETE even on a double click" failed and "a privileged role goes through a confirm step ... Confirm sends one POST" failed. The plain-grant double-click test still passed: the `ready` check (`aria-disabled` after the first render) also stops it, so it is covered by two guards |
| Propagation copy never says 15 minutes / immediately | added "(within 15 minutes)" to the non-admin copy; separately changed the admin copy to "immediately" | `assignments.test.ts` failed both times ("no effect text claims ...", the 12-hours-only-number test, the admin "next admin request" test). Both restored |

### Checks (actual output summary)
- pnpm typecheck: pass (no output)
- pnpm lint: pass (0 errors, 0 warnings)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): Test Files 109 passed (109), Tests 897 passed (897). One earlier full run had a flaky holders clamp test (fixed with `expect.poll`) and one unrelated `role-permissions-dialog` timeout that passed on rerun and in the next full run
- pnpm build: built in 1.25s
- pnpm e2e: 30 passed (1.5m), no unmatched or stray requests

### Out-of-plan files
- `src/features/users/data/schema.ts`: removed the now unused `RoleAssignment` type (replaced by `Assignment` in `assignments.ts`); it was only used by the moved tests and the old sheet.

### Deviations from the plan
- Revoke dialog Confirm uses `ConfirmDialog`'s `disabled` (real `disabled`), not `aria-disabled`: the shared component has no aria-disabled option and the plan says not to touch it. The reason is visible text ("Needs admin:*." or the self reason).
- `formatDateTimeZone` uses `year/month/day/hour/minute` plus `timeZoneName`, not `dateStyle`/`timeStyle`: `Intl.DateTimeFormat` throws when `dateStyle` is combined with `timeZoneName` (found by the first test run).
- The picker keeps the search input visible while a row is selected (summary "Selected: ... (Change)" below it, results hidden). Hiding the input would have made "typing clears the selection" untestable and vacuous.
- `RoleHoldersSheet` labels its table with `aria-label` (not `aria-labelledby` on the title): a custom `id` on `SheetTitle` overrides Radix's title id and triggers the "DialogContent requires a DialogTitle" warning.
- After a successful grant the user-sheet list jumps to page 1 (`setOffset(0)`), since the list is newest first.
- The "Back" test uses a DOM `click()`: Playwright's click also hit the Review button that mounts in the same place (test-only artifact; no unstyled layout in the browser tests).
- `DialogContent` of the assign dialog sets `onCloseAutoFocus` to `preventDefault` so the opener's focus effect decides where focus goes.

### Follow-ups (noticed, not done)
- org-admin-api: `expires_at` accepts only an aware datetime; nothing else found beyond the plan's F2 to F5.
- admin-pan: `knip` reports many pre-existing unused exported types (not part of the required checks); none added except what it already tolerates.
- admin-pan: the plan's F1 (AC4 wording in the ticket and ADR 0003) and F6 to F9 stand as written.

### Scope self-check
- Could the diff be smaller? No: roughly 3,600 lines are new files, about half of them tests; existing files changed by +992 / -223 (mostly tests and the move out of the sheet).
- Diff size: tracked files +992 / -223; 12 new files.
