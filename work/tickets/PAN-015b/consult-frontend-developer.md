## PAN-015b consult (frontend-developer): Roles screen on the real API

Read-only. Nothing was edited and no commands were run. API read at /home/user/org-admin-api (app/modules/rbac); admin-pan at /home/user/admin-pan.

### Findings

**API contract (org-admin-api 0757c27)**
- `RoleDefinitionRead` (schemas.py:229-250) carries `id, app, key, name, is_system, is_default, privileged, permissions (sorted keys), created_at, updated_at`.
  - It has no assignment count. The mock column `assignment_count` (roles-columns.tsx:57-63) cannot survive (R1). Drop it, and also drop `permission_count` as a stored value; use `permissions.length`.
  - There is no `is_org_owner` flag. The owner role is only known from `app.org_owner_role_id`.
- List: `GET /apps/{key}/role-definitions` (router.py:229-240). It is `Page`, `limit` ≤ 100, `admin:apps:read`, and covers `admin` and disabled apps. There is no sort, search or filter parameter. Paging only, as with apps (ADR 0005).
  - There is no cross-app role list, so the screen is inherently per app.
- Writes (all `admin:roles:manage`):
  - `POST /apps/{key}/roles` takes only `{key, name}` (schemas.py:198-204). Permissions are always empty after create, so the PUT is a separate call.
  - `ROLE_KEY_RE = ^[a-z][a-z0-9-]{1,31}:[a-z][a-z0-9-]{0,47}$` (models.py:35). The key prefix must equal the app key, else 422 `prefix_mismatch` (service.py:205). The existing `KEY_SEGMENT_PATTERN` (apps/data/data.ts:58) has no length cap; the role segment is at most 48 characters.
  - `PATCH …/roles/{id}` takes `{name}` only (schemas.py:207-218).
  - `PUT …/roles/{id}/permissions` takes `{permission_keys: string[]}` (≤200). It is a full replace and takes keys, not ids; the mock used ids. It is idempotent: an unchanged re-PUT never refuses (service.py:1284).
  - `DELETE …/roles/{id}` returns 204.
- Default role: `PATCH /apps/{key}` with `{default_role_id}`. This needs `admin:apps:write`, not `roles:manage` (router.py:127-145, service.py:452-504).
- Error shapes the UI must map:
  - **Create:** 409 `conflict` (key taken); 422 `validation_error` and `prefix_mismatch`; 403 `admin_wildcard_required` on the admin app (service.py:1153-1160).
  - **Rename:** 403 `admin_wildcard_required` on the admin app; no-op if the name is unchanged.
  - **Delete:** 409 code is `conflict` in all four cases (system role, default role, org owner role, has assignments), distinguished only by message text (service.py:1235-1242). No `details.reason` is sent.
    - The ticket AC says 409 `role_has_assignments`. That code is only used by the PUT (`RoleHasAssignmentsError`, errors.py:98, service.py:1328). A delete with assignments is plain `conflict`.
  - **PUT permissions:**
    - 422 `unprocessable`, reason `unknown_permission`, with a `key` per entry.
    - 422 `wildcard_super_admin_only`.
    - 409 `role_has_assignments` (adding an admin permission to an assigned role).
    - 409 `conflict`: default or org owner role would hold an admin permission; default role of an org app holding an org-scope permission; `admin:super-admin` must keep `admin:*`.
    - 403 `admin_wildcard_required` for any change on the admin app, and for adding or removing any `is_admin` permission.
  - **Set default:**
    - 409 on the admin app (it must keep no default role).
    - 422 reasons: `unknown_role`, `role_has_admin_permissions`, `role_has_org_permissions`.
    - 403 `admin_wildcard_required` on the admin app.
- Existing admin-pan mappers already cover the shared parts: `firstReason`, `isUnknownOutcome`, the `fallback` forbidden handling, and the `appFormError` entries for `role_has_org_permissions` and `org_mode_required` (apps/data/errors.ts:51, 81-89, 219-229). `forbiddenCopy` already handles `admin_wildcard_required` (lib/forbidden.ts:42). `src/api/schema.d.ts` already has `role-definitions` (:203, :220); the role write endpoints are in the same file.

**Admin-pan today**
- The Roles screen is entirely mock.
  - The route is `src/routes/_authenticated/roles/index.tsx`, with search `{page, pageSize, filter, app[]}`.
  - The page is `src/features/roles/index.tsx`, built on `useAccessData()` (roles-table.tsx:17, :35).
- Registry entries already exist (`src/lib/permissions/registry.ts`):
  - `roles.create/update/delete` at :155-164.
  - The route `/_authenticated/roles/` is guarded by `admin:apps:read` with only `GET /api/v1/apps` listed (:69). That list needs `GET …/role-definitions` added.
  - There is no registry entry for set-default (needs `admin:apps:write`), so one must be added (e.g. `roles.setDefault`).
- Mock-store importers (grep of `access-store | mock-data | data/schema`):
  - `features/roles/**` only: roles-table, roles-columns, roles-dialogs, roles-row-actions, role-form-dialog (+test), role-delete-dialog, role-assignments-sheet, roles.test.
  - **Users do not depend on it.** The users feature imports its own `../data/schema` (users-detail-sheet.tsx:25) and reads real `GET /users/{id}/role-assignments`.
  - So PAN-015c's user-sheet assign/revoke does not need the mock store. Only the mock per-role holders sheet does, and 015c rewrites that against `GET …/role-definitions/{id}/assignments`. That endpoint exists (router.py:254-281, `admin:users:read`).
- `apps/components/data-table-view.tsx` is used only by roles-table.tsx:16. The other grep hits are `DataTableViewOptions`, a different symbol.
- The guard test `apps/data/app-schema.test.ts:126-141` allow-lists `(access-store|mock-data|schema).ts`. It must be updated or removed when those files are deleted.
- Apps real-API patterns to copy:
  - **Sheet tabs:** `app-detail-sheet.tsx`.
  - **Provider with injected `api`:** `apps-provider.tsx:25-36`.
  - **In-flight ref and `aria-disabled` pending:** `app-permission-form-dialog.tsx:56, 78-106, 229-236`.
  - **Dialog close blocked while pending:** `app-permission-admin-dialog.tsx:50-54`.
  - **Focus return:** `onCloseAutoFocus` + `returnFocus` for Radix dialogs (permission-form-dialog:117-123); effect-based focus for `AlertDialog`/`ConfirmDialog` (permissions-tab:35-47, apps-dialogs.tsx:29-41).
  - **Mutation options:** `useMutationOptions` with 404/409 refetch, and `meta.handlesOwnErrors` (queries.ts:181-198). Admin-app invalidation of `mePermissionsKeys.all` is in `useAppPermissionMutationOptions` (queries.ts:225-230), which is private.
- Stale text: app-detail-sheet.tsx:161 says "Role names and the role list arrive with role management." The Overview prints raw role UUIDs (:122-123, :132, :135). app-detail-sheet.test.tsx:47 and :75 assert those UUIDs.
- **Screenshots:** `__screenshots__/` is git-ignored (`.gitignore:44`). They are Vitest failure artifacts. There are no `toMatchSnapshot` or `toHaveScreenshot` usages anywhere, so there is no snapshot regeneration. Deleting the roles tests only orphans ignored PNGs. (`dbg.test.tsx/dbg-1.png` in apps is a leftover artifact; harmless.)
- e2e (`e2e/pages.e2e.ts:60-65`): the `roles` entry opens `/roles`, expects heading "Roles", clicks "New role", closes the dialog, then runs axe. `e2e/support/fake-api.ts` answers only registered `METHOD path` keys and records `unmatched`. It has `GET /apps`, `GET /apps/{key}` and `…/permissions` per app (:418-420), but no `role-definitions` and no role writes. APPS have `default_role_id: null` (:84). `me/permissions` grants `admin:*` (:268-273).

### Recommendations

**R-1. Route: keep a standalone `/roles` with an app picker; do not re-add a sheet tab.** (AC1, R7)
- The route, sidebar entry (sidebar-data.ts:68), registry key and e2e entry already exist.
- The API is per app, so the page is "pick an app, then manage its roles". Put the app key in the URL as `?app=<key>` (search schema `{app?: string, page, pageSize}`). Drop the `filter` and `app[]` arrays: there is no server search, so a client filter over one page would mislead.
- The sheet (`sm:max-w-2xl`) is too cramped for a permission picker, and nested dialog-over-sheet focus is harder (R10). PAN-015 removed the tab deliberately.
- From the app sheet Overview add a link "Manage roles" to `/roles?app=<key>`. Replace the stale line at :161. Optionally show the default role's name via a shared role-definitions query. If that is not done, move it to follow-ups (R7).
- The picker lists apps from `GET /apps?limit=100`, showing key, name and a "disabled" badge. The `admin` app is selectable. If `total > 100`, show a visible note. It needs a label (axe).
- Role ids stay out of the URL; they come only from API rows.
- Default selection: no auto-select of `admin`, because it sorts first and invites accidental edits. Either default to the first non-admin app, or show "Choose an app" with the create button disabled. See Q1: the second option requires editing the e2e entry.

**R-2. File layout.**
- Add `src/features/roles/api/queries.ts` with `rolesKeys` nested under `appsKeys.detail(key)`, e.g. `[...appsKeys.detail(key), 'roles', {limit, offset}]`.
  - Then `useUpdateAppMutation` (invalidates `appsKeys.all`) refreshes `is_default` for free.
  - Permission writes (`appsKeys.detail(appKey)`) refresh role `privileged` and the picker.
  - Role mutations invalidate `appsKeys.detail(appKey)`, and `mePermissionsKeys.all` for PUT on `admin`. Export `useAppPermissionMutationOptions` or add a roles twin.
- Add `roles/data/errors.ts` with `roleCreateError`, `roleRenameError`, `rolePermissionsError`, `roleDeleteError` and `roleDefaultError`. Reuse `firstReason`, `isUnknownOutcome` and `forbiddenCopy` rather than copying them.
- Add a `RolesProvider` with an injected `api` (as in apps-provider). Use the generated `components['schemas']` types (R2); no hand-written `Role` type.

**R-3. Table (server-paged, aria-labelled).**
- Follow `AppsTable` (apps-table.tsx:32-120): `manualPagination`, `getRowId=id`, `queryView` for loading, error+Retry and 403 `ForbiddenPanel`, and an empty "No roles in <app> yet." state.
- Columns:
  - Key (mono).
  - Name with "System" and "Default" badges.
  - Permissions: a count, with the keys in the permissions dialog or a `title`/expand. Don't render 50 keys inline.
  - A "Privileged" indicator from `privileged`.
  - Actions menu, with `aria-label="Actions for <role key>"`.
- Remove the Assignments column and its sheet (see R-8).

**R-4. Create: two-step, with an explicit state machine (AC2).**
- Dialog fields are key segment (prefix shown read-only as `${app.key}:`), name, and an optional permission picker.
- Submit flow:
  1. If `createdRole` (a ref plus state) is unset, POST `{key: app.key + ':' + segment, name}`. On 201, store `createdRole = {id, key}` immediately and invalidate the list.
  2. If permissions were chosen, PUT `{permission_keys}` for `createdRole.id`. If none were chosen, skip the PUT. A new role holds nothing.
- POST is never retried: `retry: false`, an in-flight ref, and `if (createdRole) skip POST`.
- On a PUT failure the dialog stays open in a "partial" phase:
  - Key and name are read-only.
  - The `role` alert says: "Role X was created, but its permissions weren't saved: <mapped reason>".
  - The primary button is "Retry saving permissions" (PUT only; safe because it is idempotent).
  - A secondary "Close" leaves the role with no permissions.
  - Focus moves to the alert, and the status region is announced.
- POST with an unknown outcome (`isUnknownOutcome`): say "couldn't confirm whether the role was created; check the list", invalidate the list, and don't auto-retry. A manual re-submit that returns 409 `conflict` should then say "A role with this key already exists (it may have just been created; check the list)". Same approach as `credentialIssueError` (errors.ts:231-254).
- Pending UX as in permission-form-dialog: `aria-disabled`, and block Escape/outside-click while pending.
- Key validation: zod schema `^[a-z][a-z0-9-]{0,47}$` for the segment (add the length cap rather than reusing the uncapped `KEY_SEGMENT_PATTERN`). The API is still the authority.

**R-5. Rename and edit permissions are separate dialogs, one request each.**
- Don't repeat the mock's combined edit form. This removes a second partial-failure path (PATCH ok, PUT fails).
- Rename:
  - PATCH name only; the key is immutable.
  - Skip the request and just close if unchanged.
  - Admin app gets the `admin:*` note.
- Permissions dialog (PUT):
  - Initial selection comes from a fresh `GET …/role-definitions/{id}` (enabled when opened, with the row as `placeholderData`). Disable Save until the fresh copy is loaded; the list row can be stale.
  - Picker source is `GET /apps/{key}/permissions` (limit ≤ 100), auto-paginated until `total` is reached.
  - **Full-replace hazard:** the picker must never drop keys it did not load. Keep the selection as a `Set` of keys, seeded from `role.permissions` (keys). Disable Save until every permissions page has loaded, or preserve unloaded selected keys. Otherwise a role holding a permission on page 2 silently loses it. `permission_keys` max is 200.
  - Group by resource, with admin-only and scope badges.
  - Any selected key that is not in the app's permission list is shown but flagged.
  - Removing permissions needs a confirm listing the removed keys (R9, as in role-form-dialog.tsx:132-141, 303-324).
  - Advisory only (the API enforces): for the admin app, disable `admin:*` unless `role.key === 'admin:super-admin'`. For admin-only permissions and the admin app, show "needs admin:*". Show the 403 inline via `ForbiddenPanel`.
  - Map 422 `unknown_permission` to a message naming the key. `wildcard_super_admin_only` gets fixed copy. Refresh the permission query on `unknown_permission` or 409 (a permission may have been deleted).

**R-6. Delete: `ConfirmDialog` naming `<key> (<name>)` (AC3).**
- A plain confirm is enough, not an org-style typed slug. The API refuses a role that is assigned, so the blast radius is small.
- Show the 409 inline in the dialog (`ConfirmDialog` has an `error` prop, permission-admin-dialog.tsx:77-84). Never optimistic. On success: toast, invalidate, and return focus to a stable element (the table or the New role button), since the row is gone.
- Client pre-checks (advisory): for `is_system` or `is_default`, disable confirm and explain. The API's other 409s come from the server.
- Because every 409 has the code `conflict` with no reason, show fixed copy ("Can't delete: it's a system role, the app's default or org owner role, or users still hold it") plus the server message sliced to 200 chars, as `fallback` does (errors.ts:39).
- Add a follow-up for org-admin-api to emit `details.reason` on delete conflicts (see Q3).
- AC4 says 409 `role_has_assignments`; the real code for delete is `conflict`. Map by status plus code plus reason so both work.

**R-7. Default role.**
- Row action "Set as default" calls `PATCH /apps/{key} {default_role_id: id}` via the existing `useUpdateAppMutation`. It is gated on `admin:apps:write` (new registry action), not `roles:manage`.
- Confirm dialog, because it changes who is granted what on future joins: "New members of X will get role Y".
- Hide or disable it when:
  - the app is `admin`: the API forces no default, with a note;
  - the role is already default (show the badge instead);
  - `privileged` is true: the API refuses admin-permission defaults (422 `role_has_admin_permissions`).
- Map 422 `role_has_admin_permissions`, `role_has_org_permissions` and `unknown_role` to fixed copy. 409 means the admin-app rule.
- Clearing the default (`null`) is allowed by the API but is outside the ticket. Leave it as a follow-up.
- `org_owner_role_id` is also out of scope (the PAN-015 follow-up said "pickers"; confirm with the owner whether 015b includes it).

**R-8. Remove the mock store; stage the deletions.**
- Delete in 015b: `roles-provider.tsx` (replace), `roles-table.tsx`, `roles-columns.tsx`, `roles-dialogs.tsx`, `roles-row-actions.tsx`, `role-form-dialog.tsx` and its test, `role-delete-dialog.tsx`, `role-assignments-sheet.tsx`, and `roles.test.tsx` (rewrite).
- Also delete `apps/data/access-store.ts`, `mock-data.ts`, `schema.ts` and `components/data-table-view.tsx` (the last one only if the new table doesn't reuse it).
- After that, delete the allow-list in `app-schema.test.ts:126-141` or reduce it to "no file named `access-store`/`mock-data` exists". Update the comments at `app-schema.ts:5` and `schema.ts:3`.
- Deleting the holders sheet loses the mock "Assignments" action. PAN-015c re-adds a real one. Say so in the ticket so the row menu isn't left with a dead item. Do not keep `access-store` for 015c: it needs only the new `…/assignments` endpoint and `GET /users?email=`.

**R-9. Permission registry and `Can`.**
- Add to the route entry `/_authenticated/roles/`: `GET /api/v1/apps/{key}/role-definitions` and `GET …/role-definitions/{role_id}`.
- Add `roles.setDefault`.
- `roles.update` currently bundles PATCH and PUT; with separate dialogs, consider splitting (`roles.rename`, `roles.setPermissions`) so each dialog's declared endpoint matches (R4). Check the registry test, if one exists, against the OpenAPI.
- Use `<Can … disable>` with the `describedBy` pattern for buttons, as in `RegisterAppButton`.

**R-10. e2e and fake API (not required by the AC, but the existing entry breaks otherwise).**
- Add `GET /api/v1/apps/${a.key}/role-definitions` and `…/role-definitions/{id}` per app in `fake-api.ts` (around :418), with fixtures that carry ids. Include the `system`, `default` and `privileged` cases. Set one app's `default_role_id` to a fixture role id. The `admin` app's list needs `admin:super-admin`.
- If the page defaults to a non-admin app (R-1), the `roles` e2e entry only needs its "New role" step to still work against the fake perms and permission routes. Otherwise add a `selectApp` step.
- Axe: the combobox needs an accessible name; the table needs `aria-label`.
- A mutating e2e (create then PUT) is optional; unit tests with injected fetch cover the partial-failure UX.

**R-11. Tests (R8, AC5).** Use the injected-fetch mock, following the apps tab tests.
- **Table:** loading, empty, error+Retry, 403 panel, paging, app switch.
- **Create:** POST then PUT order and bodies (keys, not ids); PUT failure leaves the dialog in the partial phase and POST is sent exactly once, even on double-click and after retry; skip PUT when empty; 409 key taken; prefix and validation mapping.
- **Rename / permissions:** unchanged means no request; removal confirm lists keys; admin-app 403 `admin_wildcard_required`; unloaded permission pages preserved (or Save disabled).
- **Delete:** confirm names the role; cancel sends nothing; 409 inline; focus restored.
- **Set default:** PATCH body; 422 reasons; `privileged` and admin-app disabled states.
- **Unit tests:** error mappers, key schema.
- **Guard:** keep a guard test that no mock store is importable.

### Risks
- **Silent permission loss** from a paged picker plus a full-replace PUT (R-5). This is the most serious one.
- **Stale list rows** as the source for the edit form; mitigated by fetching the detail on open.
- **Delete 409s are indistinguishable** by code or reason; the UI depends on message text unless the API adds a reason. Don't parse message strings.
- **Privilege hint drift:** `privileged` and the `admin:*` hints are advisory. The UI must never hide the 403 path (R4), and `me/permissions` should be invalidated after PUT on the admin app so the signed-in user's own access refreshes (PAN-011b D7).
- **Cross-boundary writes need `admin:*`:** a user with only `roles:manage` can create or edit most roles but gets 403 `admin_wildcard_required` on admin-only permissions and on the admin app. This is expected; the note plus the inline 403 are the UX, not a bug.
- **The `admin` app is editable** (owner decision 2026-11-17). Editing it can lock staff out (for example, removing `admin:*` from `admin:super-admin` is refused 409, but other changes can reduce access). Show the `ADMIN_APP_NOTE` (apps/data/data.ts:76) on the page when `admin` is selected, and add a stronger confirm for permission removal on admin roles.
- **Apps picker capped at 100 apps:** acceptable now, but undocumented.
- **Overview app-detail test** (app-detail-sheet.test.tsx:47, :75) breaks if role ids become names. Do it in 015b or defer explicitly.
- **Guard test removal** must not weaken the "no network from mock code" intent; keep a deletion check.
- **A fresh `GET /apps/{key}/permissions` fetch** is needed after concurrent permission edits; stale permission lists may reject on PUT with 422 `unknown_permission`.

### Open questions
1. Default app on `/roles`: first non-admin app (recommendation, keeps the e2e entry unchanged) or "Choose an app" with no default? A related question is whether the `admin` app should be reachable by URL only.
2. Does 015b include `org_owner_role_id` (org-required apps), or only `default_role_id`? The ticket says only default. The PAN-015 follow-up mentions both pickers. Also: may the default role be cleared?
3. Is the owner willing to open an org-admin-api follow-up so role-delete 409s carry `details.reason` (`system_role`, `default_role`, `org_owner_role`, `role_has_assignments`)? Otherwise the UI shows fixed generic copy plus the truncated message.
4. Should Overview in the app sheet show default and org-owner role names in 015b, or stay as ids until a later ticket? That also decides whether the sheet test changes.
5. Is a role-key length cap of 48 for the segment (full key ≤ 160) to be enforced client-side? The API enforces it either way.
6. Do we want a mutating e2e for create (POST then PUT) in this ticket, or only unit tests with injected fetch?
