## Attempt 1 — 2026-11-18

### Files touched
| File | Required because |
|---|---|
| `src/api/openapi.json`, `src/api/schema.d.ts` | Regenerated from org-admin-api 0757c27 with the plan's exact command, then `pnpm api:types`. No hand edits. `pnpm typecheck` and the registry test passed unchanged: no fixture fixes (A11) and no new `x-permission` values were needed. |
| `src/lib/permissions/registry.ts` | Route `/roles/` lists the role-definitions reads; `roles.create` also names the PUT; `roles.update` replaced by `roles.rename` + `roles.setPermissions`; added `roles.setDefault`. |
| `src/routes/_authenticated/roles/index.tsx` | `validateSearch: rolesSearchSchema` (imported). |
| `src/features/roles/data/role-schema.ts` (+ `.test.ts`) | New: generated aliases, drift-tested constants, zod schemas, `rolesSearchSchema`; the no-mock-store guard moved here. |
| `src/features/roles/data/errors.ts` (+ `.test.ts`) | New: `roleCreateError`, `roleRenameError`, `rolePermissionsError`, `roleDeleteError`, `roleDefaultError`. |
| `src/features/roles/api/queries.ts` (+ `.test.tsx`) | New: keys, list/detail/all-permissions query options, four role mutations. |
| `src/features/roles/index.tsx` | Rewritten: `RolesContent({search, navigate, api?})`, app picker, notes, New role. |
| `src/features/roles/components/roles-provider.tsx`, `roles-table.tsx`, `roles-columns.tsx`, `roles-row-actions.tsx`, `roles-dialogs.tsx`, `role-delete-dialog.tsx` | Rewritten for the real API (plan §5, §6, §11). |
| `src/features/roles/components/roles-app-picker.tsx`, `role-permission-picker.tsx`, `role-create-dialog.tsx`, `role-rename-dialog.tsx`, `role-permissions-dialog.tsx`, `role-default-dialog.tsx` | New (plan §5, §7-§10, §12). |
| `src/features/roles/components/test-data.ts`, `test-fixtures.tsx` | New fixtures and `renderRoles` / `rolesServer`. |
| `src/features/roles/components/roles-table.test.tsx`, `role-create-dialog.test.tsx`, `role-rename-dialog.test.tsx`, `role-permissions-dialog.test.tsx`, `role-delete-dialog.test.tsx`, `role-default-dialog.test.tsx` | New tests (plan list). |
| Deleted: `src/features/roles/roles.test.tsx`, `components/role-form-dialog.tsx`, `components/role-form-dialog.test.tsx`, `components/role-assignments-sheet.tsx`, `src/features/roles/__screenshots__/` | Mock phase ends. |
| Deleted: `src/features/apps/data/access-store.ts`, `mock-data.ts`, `schema.ts`, `components/data-table-view.tsx` | Only the Roles mock used them (R1). |
| `src/features/apps/data/data.ts` | Removed dead `KEY_SEGMENT_PATTERN`. |
| `src/features/apps/data/app-schema.ts` | Header comment fixed. |
| `src/features/apps/data/app-schema.test.ts` | Removed the "imports no mock store" test (guard moved to `role-schema.test.ts`). |
| `src/features/apps/data/errors.ts` | `export` on `fallback`, `message`, `bodyFields` (plan) and `detailObjects` (see deviations). No behaviour change. |
| `src/features/apps/components/app-detail-sheet.tsx` | "Manage roles" `<Link to='/roles' search={{app}}>` replaces the stale sentence. |
| `src/features/apps/components/test-fixtures.tsx` | `renderApps` renders inside a memory `RouterProvider` (`/` + `/roles` stub). |
| `src/features/apps/components/app-detail-sheet.test.tsx` | New link test; one existing assertion adjusted (see deviations). |
| `e2e/support/fake-api.ts`, `e2e/pages.e2e.ts` | Roles read routes, calechip default/owner role ids, new read-only roles e2e test. |

### Tests added / changed
- `role-schema.test.ts` › limits match openapi.json; segment/name rules; `rolesSearchSchema`; no mock store under features/apps or features/roles.
- `errors.test.ts` › one block per mapper (create, rename, permissions, delete, default).
- `queries.test.tsx` › keys; list/detail URLs; placeholder never crosses apps; 130 permissions = 2 requests (offset 0, 100); mutation endpoints and bodies; invalidation on success and 404/409/422; `['me','permissions']` only for `admin`; create sent once with a failing POST.
- `roles-table.test.tsx` (20) › default app, URL state, picker, loading, rows/badges, empty, error + Retry, 403, 404, apps-list states, unknown `?app=`, paging, clamp, app switch, admin note, read-only, Set-as-default hidden, delete hints, row ids.
- `role-create-dialog.test.tsx` (13) › form validation, POST then PUT with the POST id, POST only, partial phase (one POST, key/name read-only), PUT-only retry, Close, 422 unknown_permission, Enter in partial phase, double click, unknown POST outcome then manual 409, 409/422 on Key, admin app, picker loading/error.
- `role-rename-dialog.test.tsx` (4), `role-permissions-dialog.test.tsx` (12), `role-delete-dialog.test.tsx` (4), `role-default-dialog.test.tsx` (4) › as in the plan.
- `app-detail-sheet.test.tsx` › "Manage roles" link; the "Overview: ... (no links)" assertion now expects exactly one link.
- `e2e/pages.e2e.ts` › roles: calechip default, switch to stoktok, permissions dialog and delete confirm pass axe, Cancel sends no writes.

### Mutation proofs (guards)
- Exactly-one POST: removed the `inFlight` guard (and the `createdRef` reuse) in `role-create-dialog.tsx` `onSubmit`. Failed: "double-click on Create sends one POST ..." (and the Enter test). Restored, 13/13 pass.
- Picker Save until every page loaded: changed `const ready = fresh && permsQ.isSuccess && !overLimit` to `fresh && !overLimit`. Failed: "with 130 app permissions, Save stays aria-disabled until both pages loaded ..." (a PUT was sent). Restored, 12/12 pass.

### Checks (actual output summary)
- pnpm typecheck: clean (`tsc -b`, no output).
- pnpm lint: clean (`eslint .`, no output).
- pnpm format:check: "All matched files use Prettier code style!" (after `pnpm format`).
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): Test Files 104 passed (104), Tests 811 passed (811).
- pnpm build: built in 1.31s.
- pnpm e2e (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): 29 passed; no `unmatched` calls (the fixture asserts it).

### Out-of-plan files
- `src/features/roles/components/role-alert-view.tsx`: shared `AppAlert` renderer (403 panel or `role=alert` text) used by five dialogs; avoids five copies.
- `src/features/roles/components/role-name-cell.tsx`: the name + badges cell; `react-refresh/only-export-components` rejects a component and the columns array in one file.

### Deviations from plan
- `apps/data/errors.ts` also exports `detailObjects` (needed to read `details[].key` for `unknown_permission`).
- Focus return after a ConfirmDialog (delete, set default) runs in `requestAnimationFrame` after `open` becomes null. A synchronous effect lost: Radix FocusScope moved focus to `<body>` a tick later (found by the delete test "focus to New role"). Delete passes an extra `onDeleted` prop so only a deleted row sends focus to New role; cancel returns it to the row's actions button.
- Permissions picker renders only after every page loaded (the query pages internally and returns the full list), so a half-loaded list is never shown; a held key not yet in the list is shown flagged meanwhile.
- A locked `admin:*` checkbox stays enabled when the role already holds it (so it cannot be trapped checked).
- Tests click an `aria-disabled` Save with a DOM `click()` because Playwright refuses to click it.
- Existing apps test "Overview ... (no links)" asserted zero links; it now asserts exactly one (the Manage roles link).
- `pnpm knip` was not part of the checks and reports many pre-existing unused-type findings; not touched.

### Follow-ups (noticed, not done)
- admin-pan: `apps-dialogs.tsx` `closeStatus` restores focus in a synchronous effect, so after the status dialog closes focus likely lands on `<body>` (same Radix FocusScope timing as found here). No test covers it. Not changed (R7).
- org-admin-api: `details.reason` on role-delete 409s and PUT 409 `conflict`s; `assignment_count` on `RoleDefinitionRead`; optional `is_org_owner` flag (plan follow-up 1).
- admin-pan: clear default role (`default_role_id: null`); `org_owner_role_id` picker; role names in the app Overview; PAN-015c holders sheet; filters ticket (ADM-020/USR-18 params now in the snapshot); app picker beyond 100 apps.
- e2e fake API CORS preflight lists `GET, POST, PATCH, DELETE, OPTIONS` without `PUT`: a future e2e that writes permissions needs `PUT` added.

### Scope self-check
- Could the diff be smaller? No. The rewrite replaces mock files with API-backed ones; the two extra small files are required by lint and reuse.
- Diff size: tracked files +1517 / -2028 (git diff --shortstat); untracked new files about 3,800 lines, roughly 60% tests.
