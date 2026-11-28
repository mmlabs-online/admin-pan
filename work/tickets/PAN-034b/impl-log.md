## Attempt 1 — 2026-11-28

### Snapshot (R2)
- org-admin-api clone at `a77e819` (`git rev-parse --short HEAD`), not modified. Reused the full spec generated for PAN-034 at `<scratchpad>/openapi-a77e819.json`.
- A scratchpad script replaced exactly `components.schemas.AppRead`, `components.schemas.AppUpdate` and `paths['/api/v1/apps/{key}'].patch`. `$ref` targets `AppStatus`, `ErrorEnvelope`, `JoinPolicy`, `OrgMode` were deep-equal to the snapshot. The generated `AppRead`/`AppUpdate` differ only by the added `super_admin_role_id` (required lists equal).
- `pnpm api:types`; `git diff --stat src/api/`: `openapi.json` +54/-?, `schema.d.ts` +24/-?; 71 insertions, 7 deletions total. Re-running `pnpm api:types` leaves no further diff.

### Files touched
| File | Required because |
|---|---|
| `src/api/openapi.json`, `src/api/schema.d.ts` | Fragment refresh (AppRead, AppUpdate, PATCH app) |
| `src/lib/permissions/registry.ts` | `apps.setSuperAdminRole` (super, conditional) |
| `src/features/apps/data/app-schema.ts` | Role fields in the form schema, `ROLE_NONE`, `APP_ROLE_FIELDS`, `AppUpdate` type |
| `src/features/apps/data/data.ts` | `appUpdateDiff`, `roleSelectItems`, `describeRole`, `roleChanges`, `superAdminNotAlone`, `ROLE_FIELD_LABELS` |
| `src/features/apps/data/errors.ts` | (field, reason) refusal tables, `sent` routing, edit 403 "Nothing was saved." |
| `src/features/apps/components/app-form-dialog.tsx` | Role selects, super-admin gate, diff, review phase, error routing |
| `src/features/apps/components/app-detail-sheet.tsx` | Role keys instead of ids; Super-admin role row |
| `src/features/apps/components/test-data.ts`, `test-fixtures.tsx` | `ROLE_DEFINITIONS`, `roleDefinitionsPage`, `/role-definitions` fake |
| `data/data.test.ts`, `data/errors.test.ts`, `components/app-form-dialog.test.tsx`, `components/app-detail-sheet.test.tsx` | Tests (below) |

### Tests added / changed
- `data.test.ts` › appUpdateDiff (5 cases), roleSelectItems (2), describeRole, roleChanges (2), superAdminNotAlone
- `errors.test.ts` › "appFormError role refusals": 17 table rows (it.each), shared-reason routing, 409 mapping, edit 403 "Nothing was saved.", validation_error on `org_owner_role_id`; the old reason-only `role_has_org_permissions`/`org_mode_required` loop was removed (now routed by field)
- `app-form-dialog.test.tsx` › "App edit dialog: roles" (9 tests): AC1 simap network-fake flow, select visibility, untouched roles not sent, review Back/Confirm + double click, owner to None, admin:* gate, super-admin on its own, 422 F6 field error, 409/403, roles failed to load
- `app-detail-sheet.test.tsx` › two assertions now check keys, not uuids; new test for Loading / Unknown role / 500 / no request when all ids null

### Checks (actual output summary)
- pnpm typecheck: clean (`tsc -b`)
- pnpm lint: clean (0 errors, 0 warnings)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): Test Files 124 passed (124); Tests 1071 passed (1071)
- pnpm build: built OK
- `pnpm api:types`: no further diff in `src/api/`
- pnpm e2e: 30 passed (1.3m)

### Out-of-plan files
- `src/features/apps/data/app-schema.test.ts` — its valid form fixture lacked the three new required role fields, so 3 existing tests failed; added the three `'none'` values to the fixture only.

### Notes
- The footer buttons carry `key='back'` / `key='save'`: without them React reused the Back button's DOM node for the submit button and a click on Back re-submitted the form.
- The Retry button and the load-error text: the note appears in each role field's description (linked by aria-describedby), the Retry button once under the role group.

### Follow-ups (noticed, not done)
- org-admin-api: resolve the simap recipe vs. owner-role rule conflict (`docs/consumers.md:241-248` vs `rbac/service.py:496-502`); UI shows the 422 on the field.
- admin-pan: refresh `RoleDefinitionRead` (`is_org_owner`, `is_super_admin`, `assignment_count`) for badges and hints.
- admin-pan: `roleDefaultError` lacks `same_as_super_admin_role` copy.
- admin-pan: link from the super-admin "cleared" review copy to that role's holders.
- admin-pan: full `openapi.json` refresh.

### Scope self-check
- Could the diff be smaller? No; the pure helpers, error tables and the review phase are each required by the plan.
- Diff size: see `git diff --shortstat` (not committed).
