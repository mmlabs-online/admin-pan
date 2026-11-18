Status: READY

# Plan — PAN-015b: Roles and role permissions on the real API

## Spec summary
`docs/spec-v1.md` §5.4 Apps, roles and access:
> Apps registry (join policy, org mode, origins, default role), roles and their permissions, role assignments per user (app scope or one org), revoke sessions.

§6: "Lists use server-side pagination (`limit` ≤ 100) and stay responsive with thousands of rows."
§7: "Every admin task org-admin-api supports can be done in the UI, without raw API calls."

Ticket scope (owner split 2026-11-17): per app, list roles (the `admin` app and disabled apps included), create (POST, then PUT permissions), rename, replace permissions, delete, and set the app's default role. Assignments and role holders are PAN-015c.

Owner note 2026-11-17: "The `admin` app may be edited in the UI and the API decides: show a note that `admin:*` is needed and show the API's 403/409 inline."

**API facts, org-admin-api 0757c27** (read-only checkout; `app/modules/rbac/{router,schemas,service}.py`, `app/core/errors.py`; consults cite exact lines):
- Reads use `admin:apps:read`:
  - `GET /api/v1/apps/{key}/role-definitions` (router.py:229-240) returns `Page[RoleDefinitionRead]`. It takes only `limit` (1..100) and `offset`, and is ordered by key. The `admin` app and disabled apps are included.
  - `GET …/role-definitions/{role_id}` (router.py:243-251).
- `RoleDefinitionRead` has `id, app, key, name, is_system, is_default, privileged, permissions (sorted keys), created_at, updated_at`.
  - There is **no** assignment count and **no** org-owner flag. The owner role comes from `AppRead.org_owner_role_id`.
  - `updated_at` is not bumped by a permission replace.
- Role writes all need `admin:roles:manage`:
  - `POST /apps/{key}/roles {key, name}` returns 201 `RoleRead`, with no permissions.
  - `PATCH /apps/{key}/roles/{id} {name}` returns `RoleRead`. An unchanged name is a no-op.
  - `DELETE /apps/{key}/roles/{id}` returns 204.
  - `PUT /apps/{key}/roles/{id}/permissions {permission_keys}` returns `RoleRead`. It is a **full replace**, takes **keys** not ids, allows at most 200 keys, and is idempotent.
- The default role is set with `PATCH /apps/{key} {default_role_id}`, which needs `admin:apps:write`.
- `admin:*` is required (403 `admin_wildcard_required`) for:
  - any role write on the `admin` app;
  - a PUT whose diff adds or removes an `is_admin` permission;
  - a real change to `PATCH /apps/admin`.
- 409 refusals:
  - **Delete:** always generic `conflict`, with `details: null`. Causes: system role, default role, org owner role, role has assignments, concurrent change.
  - **PUT:** `role_has_assignments` (adding an `is_admin` permission to an assigned role). Also generic `conflict` when the default or owner role would hold an admin permission, the default role of an org-required app would hold an org-scope permission, `admin:super-admin` would lose `admin:*`, or there is a concurrent change.
  - **POST:** `conflict` when the key is taken.
  - **`PATCH /apps/admin` with a default role:** `conflict`.
- 422 `unprocessable` reasons:
  - POST: `prefix_mismatch`.
  - PUT: `unknown_permission` (each detail carries a `key`) and `wildcard_super_admin_only`.
  - App PATCH: `unknown_role`, `role_has_admin_permissions`, `role_has_org_permissions`, and `same_as_default_role` (the field is `org_owner_role_id`).
  - 422 `validation_error` returns details as `{type, loc, msg}`.
- `/me/permissions` is reloaded from the database on every request. Admin-app role writes take effect at once.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Every role action maps to an endpoint, and role ids come only from the API | **Mapping:** see API calls used below. **No mock left:** the files `apps/data/access-store.ts`, `mock-data.ts`, `schema.ts` and `apps/components/data-table-view.tsx` are deleted. The test `role-schema.test.ts` › "no mock store exists or is imported under features/apps or features/roles" enforces this. **Tests:** `roles/api/queries.test.tsx` › "list GET …/role-definitions?limit&offset; detail GET …/role-definitions/{id}; create POST …/roles; rename PATCH …/roles/{id}; replace PUT …/roles/{id}/permissions; delete DELETE …/roles/{id}". `role-create-dialog.test.tsx` › "the PUT path uses the id from the POST response". `roles-table.test.tsx` › "row actions use the row's API id in the path". Role ids never appear in the URL search (`rolesSearchSchema` test). |
| 2 | Two-step create handles a failure after the role is created: the role exists, the user is told, and no POST is retried | `role-create-dialog.test.tsx`: › "POST 201 then PUT 403 admin_wildcard_required → partial phase: alert names the role and says permissions were not saved; key/name read-only; list refetched; exactly one POST"; › "Retry saving permissions sends only the PUT (POSTs still 1, PUTs 2) and closes on success"; › "double-click on Create sends one POST"; › "POST with unknown outcome (500/network): 'couldn't confirm' alert, list refetched, no automatic POST"; › "no permissions chosen → POST only, no PUT". |
| 3 | Deleting a role asks for confirmation that names the role; 409 `conflict` (system role, default role, has assignments) is shown inline | `role-delete-dialog.test.tsx`: › "confirm names '{name} ({key})'; Cancel sends nothing"; › "confirm sends one DELETE to the row id; toast; list refetched; focus to New role"; › "409 conflict shows the fixed reason text plus the API message inline (role=alert, aria-describedby); dialog stays open"; › "404 → 'This role no longer exists.' and refetch". `roles-table.test.tsx` › "Delete is disabled with a visible reason for system, default and org owner roles". **AC wording fix:** for delete the API code is always `conflict`. `role_has_assignments` is a PUT-only code (see Assumptions A1). |
| 4 | Errors are mapped by code: 403 `admin_wildcard_required`, 409 `role_has_assignments`, 422 reasons | `roles/data/errors.test.ts` (one block per mapper, see Tests). Component checks: `role-permissions-dialog.test.tsx` › "409 role_has_assignments → revoke-first text"; › "422 unknown_permission names the keys"; › "403 admin_wildcard_required inline ForbiddenPanel". `role-default-dialog.test.tsx` › "422 role_has_admin_permissions / role_has_org_permissions / unknown_role / same_as_default_role → fixed copy". |
| 5 | Loading, empty, error and 403 states are tested with the injected-fetch API mock | `roles-table.test.tsx` covers loading (aria-busy and status), empty, error with Retry, 403 page panel, 404 unknown app, paging, and app switch. `role-permissions-dialog.test.tsx` covers loading (Save aria-disabled), permission-list error, and 403. All tests use `fakeApi` from `src/test-utils/api.ts` (ADR 0005, no MSW). |
| — | Owner: the `admin` app is editable; a note says `admin:*` is needed; the API's 403/409 are shown inline | `roles-table.test.tsx` › "admin app selected: admin:* note shown; New role and row actions stay enabled". `role-rename-dialog.test.tsx` › "admin app: 403 admin_wildcard_required inline". `role-create-dialog.test.tsx` › "admin app: POST 403 shown inline, no PUT". |
| — | `['me','permissions']` refetched after admin-app role writes only | `roles/api/queries.test.tsx` › "create/rename/replace/delete on app 'admin' invalidate ['me','permissions']; on 'stoktok' they do not". |
| — | No silent permission loss from a paged picker (full-replace hazard) | `roles/api/queries.test.tsx` › "all-permissions query pages with limit=100 until total". `role-permissions-dialog.test.tsx` › "with 130 app permissions, Save stays aria-disabled until both pages loaded; a selected key from page 2 is kept in the PUT body". |
| — | Checks green | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, and `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm e2e` (the `roles` sweep entry and the new roles test, with no `unmatched` calls). |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/api/openapi.json` | **Regenerate** from org-admin-api 0757c27 (Approach §1). No hand edits. | R2; snapshot was c7b86dd |
| `src/api/schema.d.ts` | **Regenerate** with `pnpm api:types` | R2 |
| `src/lib/permissions/registry.ts` | **Route `/_authenticated/roles/`:** `perm('admin:apps:read', 'GET /api/v1/apps', 'GET /api/v1/apps/{key}/role-definitions', 'GET /api/v1/apps/{key}/role-definitions/{role_id}')`; drop the stale "catalog is public" comment. **`roles.create`:** POST roles + `PUT …/roles/{role_id}/permissions`. **Replace `roles.update`** with `roles.rename` (PATCH) and `roles.setPermissions` (PUT). **Add `roles.setDefault`:** `perm('admin:apps:write', 'PATCH /api/v1/apps/{key}')`. Keep `roles.viewAssignments/assign/revoke` (users feature, PAN-015c). If the regenerated spec has new `x-permission` values, add them to `ADMIN_PERMISSIONS`. | R4, ADR 0004; `registry.test.ts` checks it |
| `src/routes/_authenticated/roles/index.tsx` | `validateSearch: rolesSearchSchema` (imported) | URL state `{app?, page, pageSize}` |
| `src/features/roles/data/role-schema.ts` | **New.** Generated aliases, constants, zod schemas, `rolesSearchSchema` (Approach §3) | R2 |
| `src/features/roles/data/role-schema.test.ts` | **New** | R8 |
| `src/features/roles/data/errors.ts` | **New.** `roleCreateError`, `roleRenameError`, `rolePermissionsError`, `roleDeleteError`, `roleDefaultError` (Approach §4) | AC3, AC4 |
| `src/features/roles/data/errors.test.ts` | **New** | R8 |
| `src/features/roles/api/queries.ts` | **New.** Keys, list/detail/all-permissions query options, role mutations (Approach §2) | AC1, R2, R9 |
| `src/features/roles/api/queries.test.tsx` | **New** | R8 |
| `src/features/roles/index.tsx` | **Rewrite** (Approach §5): shell + `RolesContent({search, navigate, api?})` with app picker, admin note, New role, table, dialogs | AC1 |
| `src/features/roles/components/roles-provider.tsx` | **Rewrite.** Context `{api, app (AppRead or null), open, setOpen, currentRow (RoleDefinitionRead or null), setCurrentRow}`. Dialog types are `create`, `rename`, `permissions`, `delete` and `default`. | apps-provider pattern |
| `src/features/roles/components/roles-app-picker.tsx` | **New.** Labelled Select of apps (Approach §5) | Per-app API |
| `src/features/roles/components/roles-table.tsx` | **Rewrite** on the `apps-table.tsx` shape (Approach §6) | AC1, AC5 |
| `src/features/roles/components/roles-columns.tsx` | **Rewrite.** Key, Name + badges, Permissions (count), Privileged, actions. No Assignments column. | R1 |
| `src/features/roles/components/roles-row-actions.tsx` | **Rewrite** (Approach §6) | R4 |
| `src/features/roles/components/roles-dialogs.tsx` | **Rewrite.** Mounts the five dialogs; explicit close handlers; focus return (Approach §6) | R10 |
| `src/features/roles/components/role-permission-picker.tsx` | **New.** Shared checkbox picker (Approach §7) | Create + permissions |
| `src/features/roles/components/role-create-dialog.tsx` | **New** (replaces `role-form-dialog.tsx`). Two-step state machine (Approach §8) | AC2 |
| `src/features/roles/components/role-rename-dialog.tsx` | **New** (Approach §9) | AC1 |
| `src/features/roles/components/role-permissions-dialog.tsx` | **New** (Approach §10) | AC1, AC4 |
| `src/features/roles/components/role-delete-dialog.tsx` | **Rewrite** on `ConfirmDialog` (Approach §11) | AC3, R9 |
| `src/features/roles/components/role-default-dialog.tsx` | **New** (Approach §12) | AC1, R9 |
| `src/features/roles/components/test-data.ts` | **New.** API-shaped fixtures: `APPS` (admin, calechip org-required with default + owner role ids, stoktok, a disabled app), `ROLES` per app, `PERMISSIONS` per app, page helpers | Tests |
| `src/features/roles/components/test-fixtures.tsx` | **New.** `renderRoles(client, {granted?, search?, queryClient?})` with a URL-state harness (as apps `TableWithUrlState`); `rolesServer(write, overrides)` fake handler | Tests |
| `src/features/roles/components/roles-table.test.tsx` | **New** (replaces `roles.test.tsx`) | AC1, AC3, AC5 |
| `src/features/roles/components/role-create-dialog.test.tsx` | **New** (replaces `role-form-dialog.test.tsx`) | AC2 |
| `src/features/roles/components/role-rename-dialog.test.tsx` | **New** | AC1 |
| `src/features/roles/components/role-permissions-dialog.test.tsx` | **New** | AC1, AC4 |
| `src/features/roles/components/role-delete-dialog.test.tsx` | **New** | AC3 |
| `src/features/roles/components/role-default-dialog.test.tsx` | **New** | AC4 |
| `src/features/roles/components/role-form-dialog.tsx`, `role-form-dialog.test.tsx`, `role-assignments-sheet.tsx`, `src/features/roles/roles.test.tsx` | **Delete** | Mock phase ends. The holders sheet returns in PAN-015c on `…/role-definitions/{id}/assignments`. |
| `src/features/apps/data/access-store.ts`, `mock-data.ts`, `schema.ts`, `src/features/apps/components/data-table-view.tsx` | **Delete.** Only the Roles mock imported them. | R1 |
| `src/features/apps/data/data.ts` | Remove `KEY_SEGMENT_PATTERN` (only the deleted role form used it) | Dead code after deletion |
| `src/features/apps/data/app-schema.ts` | Header comment: drop the "`schema.ts` is the Roles mock shape" sentence | Accuracy |
| `src/features/apps/data/app-schema.test.ts` | Remove the "imports no mock store" test (its allow-list names deleted files). The roles guard (above) replaces it and covers both features. | Guard moves |
| `src/features/apps/data/errors.ts` | `export` the existing `fallback`, `message`, `bodyFields` (no behaviour change) | Reuse, no copies |
| `src/features/apps/components/app-detail-sheet.tsx` | Overview: replace the stale "Role names and the role list arrive with role management." with a TanStack `<Link to='/roles' search={{ app: app.key }}>Manage roles</Link>`. Role ids stay as they are (names are a follow-up). | Ticket context; R7 |
| `src/features/apps/components/test-fixtures.tsx` | `renderApps` renders its tree inside a memory `RouterProvider` (root route `/` = the tree, plus a `/roles` stub), as `users-detail-sheet.test.tsx:77-95` does | `Link` needs a router |
| `src/features/apps/components/app-detail-sheet.test.tsx` | Add "Overview has a 'Manage roles' link to /roles?app={key}; the stale role-management line is gone" | Test for the link |
| `e2e/support/fake-api.ts` | Add `ROLES` per app and the read routes (Approach §13); give calechip `default_role_id` and `org_owner_role_id` | `noStrayRequests` |
| `e2e/pages.e2e.ts` | Sweep entry `roles` unchanged; add one read-only roles test (Approach §13) | E2E + axe |

Not touched:
- `confirm-dialog.tsx`;
- `apps/api/queries.ts` (`useUpdateAppMutation` and `appsListQueryOptions` are reused as exported);
- the users feature;
- `src/features/apps/__screenshots__`.

`__screenshots__` folders are git-ignored failure artifacts. Delete `src/features/roles/__screenshots__/` along with `roles.test.tsx`.

No ADR is needed. ADR 0004 (permission mirror) and ADR 0005 (paging, injected fetch) cover the patterns.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `roles/data/role-schema.test.ts` › "ROLE_KEY_PATTERN.source equals RoleCreate.key.pattern in openapi.json; ROLE_NAME_MAX = RoleCreate.name.maxLength; PERMISSION_KEYS_MAX = RolePermissionsReplace.permission_keys.maxItems" (`?raw` import) | Drift guard |
| › "role key segment: accepts a, a-1, 48 chars; rejects '', 1a, A, a_b, a:b, 49 chars; `${app}:${seg}` of a valid segment matches ROLE_KEY_PATTERN" | Key schema |
| › "name trims; rejects whitespace-only; 255 ok, 256 rejected" | Limits |
| › "rolesSearchSchema keeps app/page/pageSize and drops filter and app[] (old URLs)" | URL |
| › "no mock store exists or is imported under features/apps or features/roles" (`import.meta.glob` over both folders: no file named `access-store`/`mock-data`/`data-table-view`, and no source imports them or `apps/data/schema`) | AC1, R1 |
| `roles/data/errors.test.ts` › "roleCreateError: 409 → key 'A role with this key already exists.'; after an unknown outcome adds 'It may have just been created; check the list.'; 422 prefix_mismatch → key; 422 validation_error body.key/body.name → fields, else alert; 403 admin_wildcard_required/permission_denied → forbidden; 404 → 'This app no longer exists.'; unknown outcome → couldn't-confirm alert" | AC4 |
| › "roleRenameError: 422 validation body.name → name; 403 → forbidden; 404 → 'This role no longer exists.'; 409 → changed-meanwhile; other → message ≤ 200" | AC4 |
| › "rolePermissionsError: 409 role_has_assignments (by code or reason) → revoke-first text; 409 conflict → fixed lead + API message ≤ 200; 422 unknown_permission → names details[].key (text, ≤ 10 listed); 422 wildcard_super_admin_only → fixed; 422 validation_error → 'The API rejected these values.'; 403; 404 role" | AC4 |
| › "roleDeleteError: any 409 → fixed reason text + API message ≤ 200; 404 → role gone; 403 → forbidden; unknown outcome → 'couldn't confirm; check the list'" | AC3 |
| › "roleDefaultError: 422 role_has_admin_permissions / role_has_org_permissions / unknown_role / same_as_default_role → fixed copy each; other 422 → rejected; 409 on 'admin' → 'The admin app can't have a default role.'; 409 other → changed-meanwhile; 403; 404 app" | AC4 |
| `roles/api/queries.test.tsx` › "rolesKeys: all(app) = ['apps','detail',app,'roles']; list and detail are under it" | Keys |
| › "list GET /api/v1/apps/stoktok/role-definitions?limit=10&offset=20; detail GET …/role-definitions/{id}" | R2 |
| › "list placeholder keeps the previous page of the same app but never another app's rows" | Stale data |
| › "all-permissions query pages with limit=100 until total (130 → 2 requests, offset 0 and 100) and returns all items" | Full-replace hazard |
| › "create POSTs {key,name}; rename PATCHes {name}; replace PUTs {permission_keys}; delete DELETEs; all to the given id" | AC1 |
| › "role mutations invalidate ['apps','detail',app,'roles'] on success and on 404/409; replace also invalidates ['apps','detail',app] on 404/409/422" | R9 |
| › "create/rename/replace/delete on app 'admin' invalidate ['me','permissions']; on 'stoktok' they do not" | PAN-011b |
| › "create has retry: false and a failing POST is sent once" | AC2 |
| `roles-table.test.tsx` › "defaults to the first non-admin app (calechip); fetches GET /apps?limit=100&offset=0 then its role-definitions" | Default |
| › "?app=stoktok selects stoktok; picking another app writes app to the URL and resets page" | URL |
| › "picker lists every app with a 'Disabled' marker; admin selectable; has an accessible name" | AC1, R10 |
| › "loading: never-resolving fetch shows 'Loading roles…' and aria-busy" | AC5 |
| › "rows: key (mono), name, System/Default/Org owner badges (text), permission count, Privileged text" | AC1 |
| › "empty: 'No roles in Stoktok yet.'" / "error alert with Retry refetches" / "403 → page ForbiddenPanel, no table" / "404 → 'This app no longer exists.'" | AC5 |
| › "total 25, pageSize 10: Next sends offset=10 and writes page=2; clamps to page 1 when a page comes back empty" | §6 paging |
| › "app switch shows loading, not the previous app's rows" | Stale data |
| › "admin app selected: admin:* note shown; New role and row actions stay enabled" | Owner |
| › "read-only (admin:apps:read only): New role disabled with 'Requires admin:roles:manage'; menu has only 'Permissions'; Set as default absent without admin:apps:write" | R4 |
| › "Delete is disabled with a visible reason for system, default and org owner roles; Set as default is hidden on the default row and disabled with 'The admin app has no default role' on admin" | R4 mirror |
| › "row actions use the row's API id in the path" | AC1 |
| › "actions trigger is labelled 'Actions for {key}'" | R10 |
| `role-create-dialog.test.tsx` › "key prefix '{app}:' shown read-only; client validation (segment, name) sends nothing" | Form |
| › "POST {key:'stoktok:viewer',name} then PUT {permission_keys:[…keys]} to the id from the POST response; toast; close; list refetched" | AC1 |
| › "no permissions chosen → POST only, no PUT" | AC2 |
| › "POST 201 then PUT 403 admin_wildcard_required → partial phase: alert names the role and says permissions were not saved; key/name read-only; list refetched; exactly one POST" | AC2 |
| › "partial: Retry saving permissions sends only the PUT (POSTs 1, PUTs 2); success closes" / "partial: Close leaves the role; no further request" | AC2 |
| › "partial: PUT 422 unknown_permission names the key; selection still editable before retry" | AC2, AC4 |
| › "double-click on Create sends one POST; pending 'Creating…', aria-disabled, Escape ignored" | R9, R10 |
| › "POST 500 / network: couldn't-confirm alert; list refetched; no automatic POST; a manual resubmit that gets 409 shows the 'may have just been created' text on Key" | AC2 |
| › "409 key taken → Key field error focused; 422 prefix_mismatch → Key" | AC4 |
| › "admin app: note shown; admin:* checkbox disabled; POST 403 shown inline, no PUT" | Owner |
| › "picker list loading/error: Create stays usable with no permissions selected; error offers Retry" | States |
| `role-rename-dialog.test.tsx` › "prefilled with the name; unchanged (after trim) → closes with no request" | Rename no-op |
| › "sends PATCH {name} only; toast; refetch; focus returns to the row's actions button" | AC1, R10 |
| › "422 name error on the field; 404 → 'This role no longer exists.'; admin app: 403 admin_wildcard_required inline" | AC4 |
| `role-permissions-dialog.test.tsx` › "Save aria-disabled until the fresh role detail and every permissions page loaded; seeded from the detail, not the list row" | Hazard |
| › "with 130 app permissions a selected key from page 2 is kept in the PUT body" | Hazard |
| › "no change → closes with no request" | No-op |
| › "adding only → PUT sorted keys; toast; refetch" | AC1 |
| › "removing → confirm phase lists removed keys and 'Everyone holding {key} loses these on their next request'; Back sends nothing; Confirm sends one PUT" | R9 |
| › "is_admin permissions show 'Admin only — changing it needs admin:*'; admin:* disabled unless role is admin:super-admin" | Advisory hints |
| › "409 role_has_assignments → revoke-first text; 409 conflict → fixed lead + server text; 422 unknown_permission names keys and refetches the permission list; 403 admin_wildcard_required inline ForbiddenPanel" | AC4 |
| › "a key the role holds but the app list lacks is shown flagged and kept unless unchecked" | Hazard |
| › "read-only (no admin:roles:manage): checkboxes disabled, no Save" | R4 |
| › "more than 200 selected → Save aria-disabled with the limit message" | Limit |
| `role-delete-dialog.test.tsx` › "confirm names '{name} ({key})'; Cancel sends nothing" | AC3, R9 |
| › "confirm sends one DELETE (double-click too); toast; list refetched; focus to New role" | AC3, R10 |
| › "409 conflict shows the fixed reason text plus the API message inline (role=alert, aria-describedby); dialog stays open" | AC3 |
| › "404 → 'This role no longer exists.' and refetch; 403 admin_wildcard_required inline" | AC4 |
| `role-default-dialog.test.tsx` › "confirm names the role and the app; Cancel sends nothing; confirm sends PATCH /apps/{key} {default_role_id: row.id} only; Default badge moves only after refetch" | AC1, R9 |
| › "422 role_has_admin_permissions / role_has_org_permissions / unknown_role / same_as_default_role → fixed copy inline" | AC4 |
| › "privileged role: confirm shows the admin-only hint; request still sent; 422 shown" | Advisory only |
| › "403 permission_denied inline" | R4 |
| `app-detail-sheet.test.tsx` › "Overview has a 'Manage roles' link to /roles?app={key}; the stale role-management line is gone" | Link |
| `e2e/pages.e2e.ts` › "roles: calechip by default; switch to stoktok; permissions dialog and delete confirm pass axe; Cancel sends no writes" | E2E, axe |

## Approach

### 1. Order of work
1. **Snapshot.** Run:
   ```
   cd /home/user/org-admin-api && DATABASE_URL=postgresql+asyncpg://x:x@localhost/x UV_PROJECT_ENVIRONMENT=/tmp/claude-0/-home-user/ce8daed7-26f0-593f-9bf8-a95df9f28817/scratchpad/oaa-venv /root/.local/bin/uv run python -m app.cli openapi --output /home/user/admin-pan/src/api/openapi.json
   ```
   then `pnpm api:types` in admin-pan. Then:
   - **Typecheck and tests.** Run `pnpm typecheck` and `pnpm test src/lib/permissions`. Fix only what the regeneration breaks (fixtures typed with generated types) and record each fix in impl-log.
   - **Permissions.** A grep of the 0757c27 routers shows no `x-permission` outside the current `ADMIN_PERMISSIONS`. If `registry.test.ts` disagrees, align the list.
   - **New API surface (do not use, R7).** The snapshot now carries USR-17 role holders and the ADM-020/USR-18 list filter params. Do **not** use them here: holders are PAN-015c, and filters belong to a separate ticket.
2. Data layer: `role-schema.ts`, `errors.ts`, `api/queries.ts`, their tests, and the `apps/data/errors.ts` exports.
3. Registry.
4. Provider, picker, page, table, columns, row actions, route.
5. Dialogs: picker, create, rename, permissions, delete, default.
6. Delete the mock files. Move the guard. Update `data.ts` and the `app-schema.ts` comment.
7. App sheet link and the `renderApps` router wrap.
8. e2e.
9. Run all checks: `typecheck`, `lint`, `format:check`, `test`, `build`, `e2e`.

### 2. Queries (`roles/api/queries.ts`; R2, R9)
- **Types:** `RoleDefinition = components['schemas']['RoleDefinitionRead']`. Bodies `RoleCreate`, `RoleUpdate` and `RolePermissionsReplace` come from `components['schemas']`.
- **Keys:** they are nested under the app, so `useUpdateAppMutation` (invalidates `['apps']`) also refreshes `is_default`.
  - `rolesKeys.all(app) = [...appsKeys.detail(app), 'roles']`
  - `list(app, p) = [...all(app), 'list', {limit, offset}]`
  - `detail(app, id) = [...all(app), 'detail', id]`
  - `allPermissions(app) = [...appsKeys.detail(app), 'permissions', 'all']`. This is a sibling of the paged permissions keys, so PAN-015 permission writes invalidate it.
- **`roleDefinitionsQueryOptions(app, p, api)`**
  - `placeholderData: (prev, prevQuery) => prevQuery?.queryKey[2] === app ? prev : undefined`. It keeps previous data only within the same app, so switching apps never shows the old app's rows.
- **`roleDefinitionQueryOptions(app, id, api)`** has no special options.
- **`appAllPermissionsQueryOptions(app, api)`**
  - Loop `GET /apps/{key}/permissions?limit=100&offset=n` until `items.length >= total` or a page is empty.
  - Hard cap of 50 pages. Past the cap, throw `ApiError({kind:'invalid_response', …})`, which shows the error state and keeps Save disabled.
  - Return `PermissionRead[]`.
- **Mutation options helper** `useRoleMutationOptions(app, extraOnError?)`:
  - `meta: {handlesOwnErrors: true}`; never optimistic.
  - `onSuccess`: invalidate `rolesKeys.all(app)`, plus `mePermissionsKeys.all` when `app === ADMIN_APP_KEY`.
  - `onError`: invalidate `rolesKeys.all(app)` on 404, 409 or `isUnknownOutcome`.
- **Mutations** (each takes `(app, api = getApi())`):
  - `useCreateRoleMutation`: POST, `retry: false`.
  - `useRenameRoleMutation`: `{roleId, name}` → PATCH.
  - `useReplaceRolePermissionsMutation`: `{roleId, keys}` → PUT, `retry: false`. On 404, 409 or 422 it also invalidates `appsKeys.detail(app)`, so the permission list refreshes after `unknown_permission`.
  - `useDeleteRoleMutation`: `roleId` → DELETE.
- **Set default** reuses `useUpdateAppMutation(api)` from `apps/api/queries.ts`. A successful write on `admin` is impossible (API 409), so no `me` invalidation is needed there.

### 3. `roles/data/role-schema.ts`
- **Aliases:** `RoleDefinition`, `Role = RoleRead`.
- **Constants** (drift-tested against `openapi.json`):

  | Constant | Value |
  |---|---|
  | `ROLE_KEY_PATTERN` | `/^[a-z][a-z0-9-]{1,31}:[a-z][a-z0-9-]{0,47}$/` |
  | `ROLE_SEGMENT_PATTERN` | `/^[a-z][a-z0-9-]{0,47}$/` |
  | `ROLE_NAME_MAX` | 255 |
  | `PERMISSION_KEYS_MAX` | 200 |
  | `SUPER_ADMIN_ROLE_KEY` | `'admin:super-admin'` |
  | `WILDCARD` | `'admin:*'` |

- **`roleCreateSchema`:**
  - `segment`: `.trim().min(1,'Key is required.').regex(ROLE_SEGMENT_PATTERN,'Use 1–48 lowercase letters, digits and hyphens, starting with a letter.')`
  - `name`: `.trim().min(1,'Name is required.').max(255)`
- **`roleRenameSchema`:** `{name}`, same rule as above.
- **`rolesSearchSchema`:** `z.object({ app: z.string().optional().catch(undefined), page: z.number().optional().catch(1), pageSize: z.number().optional().catch(10) })`.

### 4. Error mappers (`roles/data/errors.ts`; by status, code and `details[].reason`; ADR 0004)
- **Reuse.** Import `AppAlert`, `FormError`, `firstReason`, `isUnknownOutcome`, `fallback`, `message` and `bodyFields` from `apps/data/errors.ts`. Role-specific 404 copy, "This role no longer exists.", is checked before `fallback`, because `fallback`'s 404 text talks about the app.
- **Shared texts:**
  - `ROLE_GONE`
  - `CHANGED` ("This role was changed by someone else. Close the dialog and try again.")
  - `REJECTED`
  - `serverText(e) = e.message.slice(0,200)`, rendered as text only (R6)
- **`roleCreateError(error, {appKey, afterUnknown})`.** Fields are `segment | name`.
  - Unknown outcome → alert: "We couldn't confirm whether the role was created. Check the list before trying again."
  - 409 → `segment`: "A role with this key already exists." When `afterUnknown`, add " It may have just been created; check the list."
  - 422 `prefix_mismatch` → `segment`: "The key must start with {appKey}:".
  - 422 `validation_error`: `body.key` → `segment`, `body.name` → `name`. If nothing maps → alert `REJECTED`.
  - 404 → "This app no longer exists."
  - Otherwise `fallback`.
- **`roleRenameError(error)`:**
  - 422 validation `body.name` → `name`;
  - 404 → `ROLE_GONE`;
  - 409 → `CHANGED`;
  - otherwise `fallback`.
- **`rolePermissionsError(error)`.** Returns an `AppAlert`.

  | Condition | Copy |
  |---|---|
  | 409 with code or reason `role_has_assignments` | "Users hold this role, so admin-only permissions can't be added to it. Revoke its assignments, change the permissions, then grant it again." |
  | 409 other | "The API refused this permission set (a default, org owner or super-admin role rule, or a concurrent change): {serverText}" |
  | 422 `unknown_permission` | "These permissions no longer exist: {keys}." Keys come from `details[].key` strings, at most 10, joined with ", ". |
  | 422 `wildcard_super_admin_only` | "Only the admin:super-admin role can hold admin:*." |
  | other 422 | `REJECTED` |
  | 404 | `ROLE_GONE` |
  | anything else | `fallback` |

- **`roleDeleteError(error)`:**
  - 409 (any code) → "This role can't be deleted: it is a system role, the app's default or org owner role, or users still hold it. API: {serverText}";
  - 404 → `ROLE_GONE`;
  - unknown outcome → "We couldn't confirm the delete. Check the list.";
  - otherwise `fallback`.
- **`roleDefaultError(error, appKey)`:**

  | Condition | Copy |
  |---|---|
  | 422 `role_has_admin_permissions` | "This role holds admin-only permissions, so it can't be the default role." |
  | 422 `role_has_org_permissions` | "This app requires organizations and this role holds org-scoped permissions, so it can't be the default role." |
  | 422 `unknown_role` | `ROLE_GONE` |
  | 422 `same_as_default_role` | "This role is the app's org owner role, so it can't also be the default role." |
  | other 422 | `REJECTED` |
  | 409 on `admin` | "The admin app can't have a default role." |
  | 409 other | "This app was changed by someone else. Close the dialog and try again." |
  | anything else | `fallback` (404 = app gone) |

### 5. Page, provider and app picker (`index.tsx`, `roles-app-picker.tsx`)
**`RolesContent({search, navigate, api?})`** wraps `RolesProvider api`.

**Apps.** `useQuery(appsListQueryOptions({limit:100, offset:0}, api))`.
- **Selected key.** `search.app` if set, else the first app whose key is not `admin`, else `admin`. Do not write the default into the URL (no navigation on load).
- **App row.** The selected app row comes from the apps list. If `search.app` is not in the first 100, call `appQueryOptions(search.app)` for it. A 404 shows "This app no longer exists." and the picker.
- **Apps list states:**
  - loading → status "Loading apps…";
  - error → alert with Retry;
  - 403 → page `ForbiddenPanel`;
  - empty → "No apps registered yet."

**Picker.** A shadcn `Select` with a visible `<Label>` "App".
- Each option reads `{name} ({key})`, plus " — disabled" text for disabled apps.
- If `total > 100`, show the note "Showing the first 100 apps; open others from the Apps screen."
- `onValueChange` calls `navigate({ search: prev => ({ ...prev, app: key, page: undefined }) })`.

**Header.** The heading is "Roles". Subtitle: "Roles of one app and the permissions they grant."

**Notes:**
- When the app is `admin`, show a `<p>` note (not an alert): "Changes to the admin app's roles need the admin:* permission. Permission changes apply to everyone holding the role on their next request."
- When the app is disabled: "This app is disabled. Its roles can still be edited."

**New role button.** `<Can action='roles.create' disable>`, the same as today. It is disabled while no app is resolved.

### 6. Table, columns, row actions, dialogs host
**Table.** `roles-table.tsx` copies `apps-table.tsx`:
- `useTableUrlState` with `globalFilter` disabled and default page size 10;
- `manualPagination`, `enableSorting: false`, `rowCount`, `getRowId: r => r.id`;
- clamp only when settled;
- a sr-only `role=status` live region: "Loading roles…" / "{total} roles, page n of m" / "No roles in {app name} yet.";
- `aria-label='Roles of {app name}'` and `aria-busy` while pending;
- an error row with `role=alert` and Retry;
- 404 → "This app no longer exists.";
- 403 → page `ForbiddenPanel`;
- wrapper `overflow-x-auto`.

**Columns:**
- **Key** (mono).
- **Name**, followed by text badges: "System" (`is_system`), "Default" (`is_default`), "Org owner" (`app.org_owner_role_id === row.id`).
- **Permissions:** "{n} permissions".
- **Privileged:** "Yes" with sr text "granting it needs admin:*", or "—".
- **Actions:** an sr-only header.

**Row actions** (`roles-row-actions.tsx`). The trigger has `aria-label="Actions for {key}"` and the icons are `aria-hidden`. Items:
- **Permissions:** always shown (route `admin:apps:read`). It opens the permissions dialog, read-only without `roles.setPermissions`.
- **Rename:** `<Can action='roles.rename'>`.
- **Set as default:** `<Can action='roles.setDefault'>`. Hidden when `is_default`. On `admin` it is disabled (`aria-disabled`) with the visible reason "The admin app has no default role", which mirrors the API invariant.
- **Delete:** `<Can action='roles.delete'>`, class `text-red-700 dark:text-red-400`. It is disabled with a visible reason for `is_system` ("System roles can't be deleted"), `is_default` ("Default role: choose another default first") and org owner ("Org owner role"). This is an advisory hint; the 409 is still handled.

**Dialogs host** (`roles-dialogs.tsx`):
- **Close handlers.** Explicit, as `apps-dialogs.tsx`: `setOpen(null)`, then clear the row after 500 ms.
- **Focus return.** After a successful close, focus goes to the row's actions trigger. For delete, the row is gone, so focus goes to the "New role" button. Both use `requestAnimationFrame` + `querySelector`, as `apps-dialogs.tsx:29-41`.

### 7. `role-permission-picker.tsx`
**Props:** `{ app, roleKey?, permissions: PermissionRead[], selected: Set<string>, onChange, disabled }`.
- **Selection.** Selection is a `Set` of **keys**. Keys selected but absent from `permissions` render first in a "Not in this app's permission list" group. They stay checked and are kept unless the user unchecks them.
- **Layout.**
  - A `<fieldset>` with `<legend>Permissions</legend>` and the help text "The role gets exactly the checked permissions (the list replaces the role's current set)."
  - Group by `scope` ("App" / "Org" via `permissionScopeLabels`), sorted by key.
  - Each row is a `Checkbox` labelled by the key, with the description below it, linked by `aria-describedby`.
  - Scroll region `max-h-72 overflow-y-auto`.
- **Advisory hints** (never blocking, except the one disable below):
  - `is_admin` → "Admin only — changing it needs admin:*".
  - On `admin`, `admin:*` is disabled unless `roleKey === 'admin:super-admin'`, with the reason "Only admin:super-admin can hold admin:*". This mirrors 422 `wildcard_super_admin_only`.
- **Limit.** When `selected.size > 200`, show "A role can hold at most 200 permissions." (`role=alert`). The parent keeps Save `aria-disabled`.

### 8. Create dialog (two-step; AC2)
**State:**
- `phase: 'form' | 'partial'`
- `createdRef = useRef<RoleRead | null>(null)` plus a `created` state mirror
- `inFlight = useRef(false)`
- `unknownOutcome` flag

**Fields:**
- **Key:** a read-only prefix `{app.key}:` (visible text plus an `aria-describedby` hint) and the segment input.
- **Name.**
- **Picker:** `useQuery(appAllPermissionsQueryOptions(app.key, api))` while the dialog is open.
  - Loading → "Loading permissions…". Error → alert with Retry.
  - In both cases Create stays usable with an empty selection.

**Submit:**
1. If `inFlight`, return; set it.
2. **POST**, only when `createdRef.current` is null.
   - On success, store the role in `createdRef` immediately.
   - On error, apply `roleCreateError` (passing `afterUnknown` when the previous attempt had an unknown outcome), set `unknownOutcome` on an unknown outcome, then stop.
3. **No selection.** Toast "Role {key} created." and close.
4. **PUT** `{permission_keys: [...selected].sort()}` to `createdRef.current.id`.
   - Success: toast "Role {key} created with {n} permissions." and close.
   - Failure: `phase = 'partial'`.
5. Reset `inFlight` in `finally`.

**Partial phase:**
- Key and name are read-only.
- A `role=alert` box receives focus: "Role {key} was created, but its permissions weren't saved." followed by the `rolePermissionsError` text, or a `ForbiddenPanel variant='inline'` for 403.
- The picker stays editable.
- **Primary:** "Retry saving permissions" sends the PUT only.
- **Secondary:** "Close", which leaves the role. The list was already invalidated by the POST's `onSuccess`.
- The POST is never sent again: the `createdRef` guard is backed by the mutation's `retry: false`.

**Pending:**
- Labels "Creating…" / "Saving permissions…" with `aria-disabled` on the buttons and an sr-only status.
- `onOpenChange` ignores close while pending.
- Closing resets everything, including `createdRef`.

**Admin app.** Show the `admin:*` note. The controls stay enabled.

### 9. Rename dialog
- **Form.** react-hook-form + `roleRenameSchema`, prefilled with `currentRow.name`. Key shown read-only.
- **No-op.** If the trimmed value equals the row name, close without a request (avoids a no-op `admin:*` check and audit noise).
- **Submit.** `rename.mutate({roleId: currentRow.id, name})` with a `useRef` guard.
  - Success: toast "Role {key} renamed." and close.
  - Errors: `roleRenameError` → field error (`shouldFocus`) or inline alert / `ForbiddenPanel`.
- **Admin app.** Show the note.

### 10. Permissions dialog (PUT; full-replace hazard)
**Queries** (both enabled while open):
- `roleDefinitionQueryOptions(app.key, currentRow.id)` with `placeholderData: currentRow`;
- `appAllPermissionsQueryOptions(app.key)`.

**Seeding.** Seed `selected` from the **fetched** detail once it has loaded and is not placeholder data. Reseed if the detail's `permissions` change while nothing has been edited.

**Save is `aria-disabled`** (with the visible reason "Loading…" or the error) until:
- the detail is fresh;
- the full permission list has loaded;
- the selection holds 200 keys or fewer.

**States:**
- detail or permission-list error → alert with Retry;
- 403 → inline `ForbiddenPanel`;
- 404 → `ROLE_GONE`.

**Save:**
- Compute `added` and `removed` against the fresh `permissions`.
- Neither → close with no request.
- `removed` non-empty → an in-dialog **confirm phase**, not a nested dialog:
  - It lists the removed keys (`<ul>`, text).
  - Copy: "Everyone holding {key} loses these on their next request."
  - On `admin`, add "This can reduce staff access to this console."
  - Buttons are "Back" and "Remove and save" (destructive).
- Otherwise, PUT straight away.

**Request.** One PUT `{permission_keys: [...selected].sort()}` with a `useRef` guard.
- Success: toast "Permissions of {key} saved." and close.
- Error: `rolePermissionsError` inline (`role=alert`, linked with `aria-describedby`); the dialog stays open in the edit phase.

**Read-only.** Without `roles.setPermissions` (via `useActionPermission`) the picker is disabled, Save is absent, and the title is "Permissions of {key}".

**`admin:super-admin`** gets the note "This role must keep admin:*."

### 11. Delete dialog
`ConfirmDialog`:
- **Title:** "Delete role {key}?"
- **Description:** "Delete **{name}** ({key}) from {app name}? This can't be undone. The API refuses if it is a system, default or org owner role, or if users hold it."
- **Props:** `destructive`, `isLoading`, `pendingText="Deleting…"`, `error`.

Behaviour:
- `handleConfirm` has a `useRef` guard.
- **Success:** toast "Role {key} deleted.", close, focus "New role".
- **Error:** `roleDeleteError` inline; the dialog stays open.
- Close is blocked while pending.

### 12. Default-role dialog
`ConfirmDialog`:
- **Title:** "Make {key} the default role?"
- **Description:** "New members of {app name} get **{name}** ({key}) when they join. Existing assignments don't change."
- **Privileged hint:** when `row.privileged`, add "This role holds admin-only permissions; the API refuses those on a default role."
- **On `admin`:** the menu item is disabled, so the dialog is not reached. If it ever is, the 409 maps.

**Request.** `useUpdateAppMutation(api).mutate({ key: app.key, body: { default_role_id: row.id } })` with a `useRef` guard.
- Success: toast "{key} is now the default role of {app name}." and close. The badge moves after the `['apps']` refetch.
- Errors: `roleDefaultError` inline.

### 13. E2E
**`fake-api.ts`.** Add `ROLES: Record<appKey, RoleDefinitionRead[]>` with fixed UUIDs:
- `admin`: `admin:super-admin` (system, privileged, `['admin:*']`).
- `calechip`: `calechip:member` (default) and `calechip:owner` (org owner). Set calechip's `default_role_id` and `org_owner_role_id` to their ids.
- `stoktok`: `stoktok:viewer` and `stoktok:operator` (privileged, holding stoktok's admin permission).

For each app, add `GET /api/v1/apps/${key}/role-definitions` (paged with `page(…, query)`) and `GET /api/v1/apps/${key}/role-definitions/${id}`. No write handlers.

**`pages.e2e.ts`:**
- The `roles` sweep entry is unchanged. The page defaults to calechip; "New role" opens the create dialog, which loads `…/calechip/permissions` (an existing route), and Close closes it.
- New test:
  1. `signIn('/roles')`; the heading is visible and calechip rows load.
  2. Pick "Stoktok (stoktok)" in the App select. The URL has `app=stoktok`.
  3. Open "Actions for stoktok:operator" → Permissions. Wait for the checkbox `stoktok:…`, run `expectNoSeriousA11y(page,'roles-permissions')`, then Escape.
  4. Actions → Delete. The alertdialog contains `stoktok:operator`. Run axe, then Cancel.
  5. Expect no POST, PATCH, PUT or DELETE under `/api/v1/apps` in `api.calls`.

### Rules
- **R1:** no assignment counts, no catalog scrape, no client search. Hints mirror API facts only.
- **R2:** generated types only; HTTP only via `src/api`.
- **R3:** unchanged.
- **R4:** registry keys `roles.create/rename/setPermissions/delete/setDefault`, and the route lists `role-definitions`. A 403 is handled in the list, the detail and every dialog. `admin:*` is never a gate.
- **R5:** the URL holds `app`, `page` and `pageSize` only; no role ids, no emails.
- **R6:** keys, names and server text render as text.
- **R7:** no holders, no assignments, no filters, no clearing the default, no org-owner picker, no names in the app Overview.
- **R8:** all checks; the state tests above.
- **R9:**
  - confirmations name the target for delete, default change and permission removal;
  - nothing is optimistic;
  - errors are inline;
  - invalidation after success and after 404/409.
- **R10:**
  - labelled picker and inputs;
  - `aria-disabled` pending;
  - live regions;
  - focus return;
  - `text-red-700` destructive item;
  - semantic table with `aria-label`.

## Specialist input used
- **api-platform-engineer.** Adopted:
  - the endpoint/permission table;
  - shapes and error tables;
  - delete 409 = generic `conflict` and `role_has_assignments` = PUT only (the AC wording fix);
  - no `assignment_count` or owner flag;
  - full-page permission loading;
  - the prefix-locked key;
  - `me/permissions` invalidation on `admin`;
  - the follow-ups (R-10).

  Superseded:
  - "the snapshot is current, no regeneration": the orchestrator mandates regeneration from 0757c27.
  - Open questions Q1–Q4 are resolved under Assumptions.
- **frontend-developer.** Adopted:
  - standalone `/roles` with `?app=`;
  - keys nested under `appsKeys.detail`;
  - the separate errors module reusing apps helpers;
  - the two-step state machine with the partial phase;
  - separate rename and permission dialogs;
  - the detail fetch before Save;
  - the full-replace hazard handling;
  - delete via `ConfirmDialog` with inline 409;
  - the set-default confirm via `useUpdateAppMutation`;
  - removing the mock store and the holders sheet;
  - the registry split;
  - the e2e fixtures;
  - the test list.

  Changed:
  - Privileged roles keep "Set as default" enabled (with a hint) instead of disabled, per the orchestrator's "advisory hints only".
  - The guard test moves to the roles feature.
  - The "Manage roles" link is added; names in the Overview are deferred.
- **identity-access-engineer.** Adopted:
  - registry entries, including `roles.setDefault` on `admin:apps:write`;
  - the `admin:*` note with controls enabled;
  - the `is_admin` hint per permission;
  - error copy by code;
  - the warning about other staff on removal ("loses these on their next request");
  - the super-admin note;
  - set-default confirm naming the app and role.

  Q1 (admin "Set default") is answered as **disabled with the visible reason**, because it is a fixed API invariant (as PAN-015 locks admin-app `is_admin`). Q2 (clear default) and Q3 (org owner badge) are answered under Assumptions.

## Assumptions
- **A1 — AC wording divergence (flag to owner, not blocking).** AC3/AC4 imply 409 `role_has_assignments` on delete. The API returns generic `conflict` for every delete refusal (service.py:1235-1247). `role_has_assignments` only comes from the PUT (service.py:1327-1328). The plan maps delete by status 409 with fixed copy plus the API message, and maps `role_has_assignments` on the PUT. A follow-up asks org-admin-api to add `details.reason` on delete conflicts.
- **A2 — Default app.** `/roles` without `?app` shows the first non-admin app. `admin` is reachable from the picker or the URL.
- **A3 — Default role scope.** Only setting the default role is in scope. Clearing it (`default_role_id: null`) and the `org_owner_role_id` picker are follow-ups. The "Org owner" badge is shown, because it explains delete/default refusals with data the API already returns.
- **A4 — Admin app.** All role actions are enabled, with the note. The API's 403 and 409 are shown inline (owner 2026-11-17). The only disabled item is "Set as default" on `admin`, which is an API invariant that holds even for `admin:*`.
- **A5 — Delete pre-disable.** Delete is pre-disabled for system, default and org owner roles as an advisory hint. "Has assignments" is learned only from the 409.
- **A6 — Two-step create.**
  - The PUT is skipped when no permission is selected.
  - The partial phase offers PUT retry and Close.
  - After an unknown POST outcome, the user may resubmit manually. That is a new user action, not an automatic retry, and a duplicate returns 409 with the "may have just been created" copy.
- **A7 — Disabled apps.** Role writes on disabled apps are allowed (the API allows them). A note is shown.
- **A8 — Picker.** The app picker loads at most 100 apps (`limit` ≤ 100), with a visible note when there are more. The permission picker loads every page (cap 50 × 100).
- **A9 — Copy.** UI copy is English (spec §8 Q3 open). Role list page size defaults to 10.
- **A10 — Holders sheet.** The mock holders sheet and its "Assignments" row action are removed without a replacement. PAN-015c re-adds them on `GET …/role-definitions/{id}/assignments`.
- **A11 — Snapshot fixes.** If regenerating the snapshot changes required fields of types used in existing fixtures (e.g. `AppRead`), the implementer fixes the fixtures minimally and lists each change in impl-log. Using any new endpoint or param stays out of scope.

## Blocking questions
None.

## Split proposal
- **Size.** This is about 1,200–1,500 changed lines excluding tests and deletions, above the ~400 guide. It is one spec feature (§5.4 roles), the owner already split it out of PAN-015, and most of it is a rewrite of mock files. This is the same situation as PAN-015, which shipped in one cycle.
- **This plan:** everything above.
- **Fallback if a rework runs long** (the orchestrator decides only after a REWORK): move the set-default dialog (§12) and the app-sheet link to a new ticket. List, create, rename, permissions and delete stay.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/roles?app=&page=&pageSize=` | `admin:apps:read` (route registry) | Apps: loading / error + Retry / 403 page / none registered. Roles: "Loading roles…" + aria-busy; "No roles in {app} yet."; alert + Retry; page `ForbiddenPanel`; 404 app gone; paged table. Notes for `admin` and disabled apps. | Pick app → URL `app`; New role → create dialog (`roles.create`) | — |
| Create dialog | `admin:roles:manage` (+ `admin:*` on `admin` / admin-only permissions; the API decides) | Pending (aria-disabled, close blocked); field errors; inline 403/404/409; permission list loading/error; **partial phase** | `POST …/roles`, then `PUT …/roles/{id}/permissions` (retry = PUT only) | `['apps','detail',app,'roles']`; `['me','permissions']` on `admin`; on PUT error also `['apps','detail',app]` |
| Rename dialog | `admin:roles:manage` | Pending; name error; inline 403/404/409; no-op closes | `PATCH …/roles/{id} {name}` | roles; `me` on `admin` |
| Permissions dialog | read: `admin:apps:read`; save: `admin:roles:manage` | Detail + all-permission pages loading (Save disabled); error + Retry; 403 inline; 404; removal confirm phase; read-only mode | `PUT …/roles/{id}/permissions {permission_keys}` | roles + `['apps','detail',app]` on error; `me` on `admin` |
| Delete confirm | `admin:roles:manage` | Pending; inline 409/404/403 | `DELETE …/roles/{id}` | roles; `me` on `admin` |
| Default confirm | `admin:apps:write` | Pending; inline 422 reasons / 409 / 403 / 404; privileged hint | `PATCH /apps/{key} {default_role_id}` | `['apps']` (covers roles) |
| App sheet Overview | `admin:apps:read` | unchanged | "Manage roles" link → `/roles?app={key}` | — |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/apps` | `limit=100`, `offset=0` | `Page_AppRead_` | 403, 5xx/network | USR-02 |
| GET | `/api/v1/apps/{key}` | — (only when `?app` is beyond the first 100) | `AppRead` | 404, 403 | USR-02 |
| GET | `/api/v1/apps/{key}/role-definitions` | `limit`, `offset` | `Page_RoleDefinitionRead_` | 404, 403, other | USR-16 |
| GET | `/api/v1/apps/{key}/role-definitions/{role_id}` | — | `RoleDefinitionRead` | 404, 403, other | USR-16 |
| GET | `/api/v1/apps/{key}/permissions` | `limit=100`, `offset` (all pages) | `Page_PermissionRead_` | 404, 403, other | USR-02 |
| POST | `/api/v1/apps/{key}/roles` | `RoleCreate {key: '{app}:{segment}', name}` | `RoleRead` (201) | 409 `conflict`; 422 `prefix_mismatch` / `validation_error`; 403 `admin_wildcard_required` / `permission_denied`; 404; unknown outcome | USR-02 |
| PATCH | `/api/v1/apps/{key}/roles/{role_id}` | `RoleUpdate {name}` | `RoleRead` | 422 `validation_error`; 403; 404; 409 | USR-02 |
| PUT | `/api/v1/apps/{key}/roles/{role_id}/permissions` | `RolePermissionsReplace {permission_keys}` (sorted, ≤ 200) | `RoleRead` | 409 `role_has_assignments` / `conflict`; 422 `unknown_permission` / `wildcard_super_admin_only` / `validation_error`; 403 `admin_wildcard_required`; 404 | USR-02, ADM-002b |
| DELETE | `/api/v1/apps/{key}/roles/{role_id}` | — | 204 | 409 `conflict` (all causes); 404; 403; unknown outcome | USR-02 |
| PATCH | `/api/v1/apps/{key}` | `AppUpdate {default_role_id}` | `AppRead` | 422 `role_has_admin_permissions` / `role_has_org_permissions` / `unknown_role` / `same_as_default_role`; 409 (admin invariant / concurrent); 403; 404 | USR-02, ADR-0015 |

Not used:
- `GET /api/v1/apps/{key}/roles` (the public catalog; wrong auth class);
- `GET …/role-definitions/{id}/assignments` (PAN-015c);
- new list filter params (separate ticket);
- `org_owner_role_id` writes;
- `default_role_id: null`.

## Follow-ups (record in ticket / backlog; not in this diff)
1. **org-admin-api:**
   - `details.reason` on role-delete 409s (`system_role`, `default_role`, `org_owner_role`, `role_has_assignments`) and on PUT 409 `conflict`s;
   - `assignment_count` (or `has_assignments`) on `RoleDefinitionRead`;
   - an `is_org_owner` flag (optional).
2. **PAN-015c:** role holders sheet and row action on `…/role-definitions/{id}/assignments`; assign/revoke.
3. **admin-pan:**
   - clear default role (`default_role_id: null`);
   - `org_owner_role_id` picker for org-required apps;
   - role names instead of ids in the app sheet Overview (shared role-definitions query; update `app-detail-sheet.test.tsx`).
4. **admin-pan filters ticket:** use the ADM-020/USR-18 list filter params now in the snapshot.
5. **admin-pan:** app picker beyond 100 apps (search, or paging in the select) once the apps list grows.
