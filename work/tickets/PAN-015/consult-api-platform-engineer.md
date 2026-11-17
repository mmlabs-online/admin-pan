PAN-015 consult (api-platform-engineer). All endpoint facts below come from the org-admin-api source at a417ddb (rbac routers, schemas, service, errors). The snapshot comparison is at the end.

# Findings

## 1. Blocking gap: there is no admin way to list roles or get a role id
- The only list of an app's roles is `GET /api/v1/apps/{key}/roles`. That is the public catalog (D17, ETag/304).
- Its entries are `{key, name, is_system, permissions[]}` with **no `id`**. It returns 404 for the `admin` app, for disabled apps and for unknown apps.
- The write endpoints address roles by `role_id` (PATCH, DELETE and PUT permissions). So are assignments (`role_id` in the POST body) and `PATCH /apps/{key}` with `default_role_id`.
- Where a role id can come from today:
  - `RoleRead`, returned by POST, PATCH and PUT on a role.
  - `AppRead.default_role_id`, which is only the default role.
  - `AssignmentRead.role_id`, but only for roles a given user already holds.
- None of these lets the roles table load existing roles with their ids.
- Nothing in org-admin-api's backlog covers it. ADM-016 is only `member_count`.
- Follow-up (P1, blocks the Roles screen):
  - An admin Bearer role list with the `admin:apps:read` permission, e.g. `GET /api/v1/roles?app=<key>&limit&offset`. It would return `Page[RoleRead + app + is_default + permission_count + assignment_count]` and include the `admin` app and disabled apps.
  - Optionally `GET /api/v1/apps/{key}/roles/{role_id}`.
  - Do not add `id` to the public catalog (D17 says no admin data there).

## 2. Assignments are listed per user only
- `GET /users/{user_id}/role-assignments?app=<key>&limit&offset` is the only list. `app` must match `^[a-z][a-z0-9-]{1,31}$`.
- There is no list by role, by app or by organization. There are also no `assignment_count` or `member_count` fields.
- The "Assignments of <role>" sheet (users who hold this role, with emails) has no endpoint. Follow-up (P1/P2): `GET /api/v1/roles/{role_id}/assignments` (Page, with user id and email) or an equivalent.
- The assign form takes an email and the mock resolves it to a user. The API takes `user_id` in the path.
  - The UI would have to look up the user with `GET /users?email=` (substring match). That returns ids, so the form can pick from candidates.
  - The organization select needs `GET /organizations` (Page, limit ≤ 100). I did not audit its filters.
- Interim option: do assign and revoke from the user detail sheet (PAN-013), where the user id is known. Offer it to the owner as the unblocked path.

## 3. Action to endpoint table

Permission strings in the "Perm" column are enforced by the API. `+admin:*` means the API also requires `admin:*` (`403 admin_wildcard_required`, details `{required:"admin:*"}`) in the cases noted. Registry keys come from `src/lib/permissions/registry.ts`.

| Screen action | Endpoint | Perm | Notes |
|---|---|---|---|
| Apps list (table, filter `join_policy`, search key/name, Members column) | `GET /api/v1/apps?limit&offset` | apps:read | Only `limit` (1..100, default 20) and `offset`. No filter, search, sort or member_count. See §4. |
| App detail sheet, Overview | `GET /api/v1/apps/{key}` | apps:read | Registry `apps.view`. The list item has the same shape (`AppRead`), so the sheet can reuse the list row and refetch on open. |
| Overview "Members" | none | | Follow-up ADM-016 (BACKLOG, P3). Drop or mark "unavailable". Do not fake it (R1). |
| Overview "Default role" display (key) | none directly | | Only `default_role_id` is returned. Resolving it to a key needs the role list from §1. Interim: show the id, or the `<key>:member` convention only if the API guarantees it. It does not guarantee it after a PATCH. |
| Register app | `POST /api/v1/apps` | apps:write | Body `{key, name, join_policy=open, org_mode=none, origins=[]}`, `extra=forbid`. The server builds `<key>:member` and sets it as default. Returns 201 `AppRead`. |
| Edit app (name, join_policy, org_mode, origins) | `PATCH /api/v1/apps/{key}` | apps:write | Partial body. `key` is immutable. A null is rejected (422) except for `default_role_id`. No-op PATCH = no write. |
| Enable / Disable app | `PATCH /api/v1/apps/{key}` `{status}` | apps:write | Same endpoint. The registry `apps.update` covers it. |
| Set default role (PAN-005 follow-up) | `PATCH /api/v1/apps/{key}` `{default_role_id}` | apps:write | Possible, but needs a role id, so blocked by §1. Null clears the default. 422 `unknown_role` or `role_has_admin_permissions`. Not in the current UI, and the ticket does not require it (R7). Record it. |
| Delete app | `DELETE /api/v1/apps/{key}` → 204 | apps:write | Exists. The mock has no such action, and the registry has no key. Out of scope (R7). 409 if admin app or if it has assignments ("disable it instead"). |
| Permissions tab list | `GET /api/v1/apps/{key}/permissions?limit&offset` | apps:read | `PermissionRead {id, key, description\|null, is_admin}`. No filters. The mock has `app_id` and a required `description`; the API has neither. 404 for an unknown app. |
| Add permission | `POST /api/v1/apps/{key}/permissions` | roles:manage | `{key, description?, is_admin?}`, key = full `<app>:<res>:<act>` (or `<app>:*`). 409 `conflict` (key taken). 422 `prefix_mismatch`, `wildcard_must_be_admin`, `admin_app_permission_must_be_admin`. 403 `admin_wildcard_required` when it is `is_admin` (including `<app>:*`) or the app is `admin`. |
| Toggle "Admin only" | `PATCH /api/v1/apps/{key}/permissions/{permission_id}` `{is_admin}` | roles:manage | 403 `admin_wildcard_required` on any is_admin change. 409 `conflict` ("default role holds this permission") when making it admin while the default role holds it. 409 `role_has_assignments` (details `[{field:"is_admin"}]`) when making it admin while an assigned role holds it. 422 `wildcard_must_be_admin`, `admin_app_permission_must_be_admin`. |
| Delete permission | `DELETE /api/v1/apps/{key}/permissions/{permission_id}` → 204 | roles:manage | Exists. Not in the mock UI, so out of scope. 409 `conflict` if a role holds it or it is `admin:*`. |
| Roles table (all apps) | none (see §1) | | Needs the follow-up list. |
| Role columns: permissions, assignments, is_default | `permissions` is in `RoleRead` and the catalog | | `assignment_count` has no source. `is_default` = `app.default_role_id === role.id`. |
| New role | `POST /api/v1/apps/{key}/roles` `{key, name}` → 201 `RoleRead` | roles:manage | Needs no role id. The role starts with no permissions, so the dialog must follow with a PUT (see the note under the table). 409 `conflict` (key taken). 422 `prefix_mismatch`. |
| Edit role name | `PATCH /api/v1/apps/{key}/roles/{role_id}` `{name}` | roles:manage | Only `name` is editable. |
| Edit role permissions | `PUT /api/v1/apps/{key}/roles/{role_id}/permissions` `{permission_keys[]}` | roles:manage | Full replace by key (not ids, ≤ 200). Always returns `RoleRead`, with the diff computed server-side. |
| Delete role | `DELETE /api/v1/apps/{key}/roles/{role_id}` → 204 | roles:manage | 409 `conflict` with message "System roles cannot be deleted", "The app's default role cannot be deleted" or "Role has assignments". All three use the generic code `conflict`. |
| Assignments sheet, list | none per role | | See §2. Per user: `GET /users/{id}/role-assignments`. |
| Assign role | `POST /api/v1/users/{user_id}/role-assignments` `{role_id, org_id?, expires_at?}` | roles:assign | 201 `AssignmentRead`. 422: `unknown_role`, `org_id_not_allowed` (app `org_mode=none`), `unknown_org`, `expiry_not_allowed` (super-admin), `expires_in_past`. 409 `conflict` ("Role is already assigned"). 404 user. 403 `admin_wildcard_required` for an admin-app or privileged role. 403 `self_assignment_forbidden`. |
| Revoke assignment | `DELETE /api/v1/users/{user_id}/role-assignments/{assignment_id}` → 204 | roles:assign | 404 assignment. 403 `admin_wildcard_required` / `self_assignment_forbidden`. 409 `last_super_admin`. |

Note on creating a role with permissions: the mock creates a role and its permissions in one step. The API needs POST and then PUT.
- The PUT can fail after the POST succeeded, leaving a role with no permissions.
- The form must handle this. Either keep the dialog open in an "edit created role" state, or show a toast that names the role and the permission error. Do not report "created" as a clean success.
- Because the PUT takes keys, the app's permissions list (`GET .../permissions`, limit ≤ 100) is still needed in the role form to offer the checkboxes. If an app has more than 100 permissions, paging is needed.

## 4. Fidelity notes: mock vs API

### Permissions and default role
- **Default role is not maintained automatically (D9).** The mock auto-adds non-admin permissions to the default role (`withDefaultRolePermission`) and auto-removes them when toggled to admin. The API never does this on permission changes.
  - A new permission is held by no role until a PUT.
  - Toggling a permission to admin that the default role holds gives 409. The API does not strip it.
  - The mock dialog copy ("will be removed from the default role", "granted to everyone with the default role") is therefore wrong against the real API. Rewrite it.
  - The "Make admin only" flow becomes: remove it from the default role first, then toggle. I need a role id for that, so §1 applies.
- **Description** is optional and nullable in the API. The mock requires it. Match the API (optional) or keep the stricter UX, but do not claim it is an API rule. PATCH can set it to null.

### Key formats (the mock matches the structure; the length caps are missing)
- App key `^[a-z][a-z0-9-]{1,31}$` (2 to 32 characters). The mock regex has no length limits (min 1).
- Role key `^[a-z][a-z0-9-]{1,31}:[a-z][a-z0-9-]{0,47}$`, max 160. The mock's `<app>:<key>` is correct, and the key segment is ≤ 48 characters.
- Permission key `^[a-z][a-z0-9-]{1,31}:([a-z][a-z0-9-]{0,47}:[a-z][a-z0-9-]{0,47}|\*)$`, max 160.
- Role create and permission create always send the full key. Role key and permission key are immutable.
- A wrong prefix gives 422 `prefix_mismatch`. The UI builds the prefix from the selected app, so this is a guard only. Make the zod schemas length-capped, but let the API decide.

### Origins
- The mock `isHttpsOrigin` rejects `http://localhost:5173`. The API allows `https://mmlabs.online` and `https://*.mmlabs.online` on the default port, plus loopback (localhost, 127.0.0.1, [::1]) on http or https with any port.
- Everything else is 422 (not mmlabs, non-https, API host, IPs, non-ASCII). Max 20 origins, 255 characters each.
- The server lowercases, strips the default port and trailing slash, and de-duplicates. The response can differ from what was typed. Replace form state from the response.
- Staging and production reject loopback only for the `admin` app (422 `loopback_not_allowed`). For other apps loopback is stored but ignored at CORS time.
- Origin conflicts: 409 `conflict` with `details=[{field:"origins", reason:"origin_taken"}]`. Loopback origins are exempt from the uniqueness check.
- Recommendation: do not duplicate the host rules client-side beyond "valid URL / duplicate in list". Surface the API's 422 on the origins field.

### Other
- The API validates `org_mode` freely on PATCH (only the CLI forbids changing it). The mock lets the user change it. Keep that, but add a risk note: an app that has org-scoped assignments could be set to `none`. The API does not check. This is a possible follow-up.
- The mock's `roleAssignmentSchema.granted_by: uuid` (non-null) differs from the API, where it is nullable (CLI grants). `AssignmentRead` also has `active` (expired = false), `app` and `role_key`; the mock has none of them.
- Show `Expired` when `active=false`. The response carries no user email, so the user detail sheet already knows who it is.

## 5. Error codes (envelope `{error:{code,message,details}}`, `details` always present)

| Code | Status | Where | UI handling |
|---|---|---|---|
| `validation_error` | 422 | Pydantic body/query (details is an array) | Map by `loc` to the form fields. |
| `unprocessable` | 422 | Business refusal, `details=[{field, reason[, key]}]` | Map `field` to the form field, `reason` to a message. Reasons: `prefix_mismatch`, `wildcard_must_be_admin`, `admin_app_permission_must_be_admin`, `unknown_role`, `role_has_admin_permissions`, `unknown_permission` (carries `key`, one entry per missing key), `wildcard_super_admin_only`, `org_id_not_allowed`, `unknown_org`, `expiry_not_allowed`, `expires_in_past`, `apex_not_allowed`, `too_many_origins`, `loopback_not_allowed`. |
| `conflict` | 409 | Key taken, origin taken, admin-app invariant, system/default role delete, role has assignments (delete), "Role is already assigned", concurrent change | Generic. Distinguish only by `details[0].reason` when present (`origin_taken`). Otherwise show the API message verbatim. |
| `role_has_assignments` | 409 | Only for (a) PATCH permission `is_admin` to true, and (b) PUT adding an admin permission to an assigned role. `details=[{field:"is_admin"\|"permission_keys", reason}]` | Show on that control. |
| `last_super_admin` | 409 | Revoke of the last active `admin:super-admin` | Show inline in the revoke dialog. |
| `admin_wildcard_required` | 403 | See the "+admin:*" rows above | Show the message. This is a per-action 403, not a missing route permission. Keep the dialog open and the control enabled. |
| `self_assignment_forbidden` | 403 | Assign or revoke an admin-app role on yourself | Inline message. |
| `permission_denied` | 403 | Missing route permission | `ForbiddenPanel` (ADR 0004). |
| `not_found` | 404 | App, permission, role, assignment, user | Refetch the list or detail, then show the message. |

- **Correction to the brief:** `role_has_assignments` is not what role DELETE returns. Role DELETE on a role with assignments is the generic `conflict` with message "Role has assignments". The specific code is used only for the is_admin / admin-permission-on-assigned-role cases. Test fixtures must reflect this.
- Not-in-brief admin-app invariants, all 409 `conflict`: the `admin` app must stay active, closed, with no org mode and no default role, and cannot be deleted. The `admin:*` permission cannot be deleted, `admin:super-admin` must keep `admin:*`, and only `admin:super-admin` may hold `admin:*` (422 `wildcard_super_admin_only`).
- The `admin` app appears in the apps list. `PATCH` to it needs `admin:*`, except a no-op. The UI should not hide it. Show the API 403 and keep the controls available. If `/me/permissions` (USR-11) already exposes `admin:*` in the client, disable the edit actions for the `admin` app with a hint, as a mirror only (R4).

## 6. Snapshot drift (`src/api/openapi.json`) for these paths
- Paths and methods: all present and complete (apps, permissions, roles POST/PATCH/DELETE, PUT permissions, role-assignments GET/POST/DELETE). No missing path.
- Drift in the contract text, not in request/response schemas:
  1. `POST /apps` and `PATCH /apps/{key}` lack the 409 response entry (source declares them via `_with_409`). So do the permission PATCH, the role PUT and the assignment DELETE. Hand-patching these is optional, as no generated types depend on it.
  2. The `PermissionCreate` description is stale. The source says admin-app permissions are always stored `is_admin=true`; the snapshot says only `<app>:*`. The field schemas are the same.
  3. The `AppRead` and `PermissionRead` field shapes match the source. There is no `member_count` (correct). I did not compare `Page_*` wrappers or the tail of each schema, but fields and constraints I read for AppCreate/AppUpdate/AppRead/PermissionCreate/Read/RoleCreate/Update/Read/RolePermissionsReplace/AssignmentCreate/Read match, including patterns and maxLengths.
- Not in the OpenAPI: the error envelope and its codes (handwritten in `errors.ts`, flagged). The 403 `details` is an object `{required:"admin:*"}`. `errors.ts` types `details` as `unknown`, so this needs a zod narrowing.
- The generated snapshot types `GET /apps/{key}/roles` as `RoleCatalog` (no ids). The `src/api` client has no admin role list to call. This confirms the §1 gap.
- Conclusion: no hand patch is needed to build the ticket. Regeneration stays in PAN-016.

## 7. Cache keys and invalidation (extend the PAN-013 `usersKeys` shape)

Proposed keys, all prefixed so one `invalidateQueries({queryKey})` can sweep a subtree:
- `appsKeys.all = ['apps']`
- `appsKeys.lists()` → `['apps','list']`; `appsKeys.list({limit,offset})`. Pass only limit and offset: the API has no filters, so there is nothing else to put in the key.
- `appsKeys.detail(key)` → `['apps','detail',key]`
- `appsKeys.permissions(key,{limit,offset})` → `[...detail(key),'permissions',p]`
- `appsKeys.roles(key)` → `[...detail(key),'roles']` (public catalog, until the §1 follow-up lands; replace with the paged admin list later)

Invalidation fan-out (non-optimistic, after success, `handlesOwnErrors`):
- App create, PATCH (including status, default role, origins): `appsKeys.all`.
  - Create also makes `<key>:member`, so the roles sweep is covered by `all`.
  - Status change also changes whether the catalog 404s for that app.
- App DELETE: `appsKeys.all`. No users sweep is needed (the API refuses if assignments exist).
- Permission create, PATCH, delete: `appsKeys.permissions(key)`. Also `appsKeys.roles(key)` is not needed unless a delete is allowed to change the role's list (the API refuses when held). Optionally refresh the role form's permission checkbox source.
- Role create, PATCH, PUT: `appsKeys.roles(key)`. Also `appsKeys.detail(key)` if default-role display depends on it. Use the PATCH/PUT response (`RoleRead`) to avoid stale rows only if the cache is a single document. Otherwise just invalidate.
- Role DELETE: `appsKeys.roles(key)`. No users fan-out (refused while assigned).
- Assign / revoke: `usersKeys.detail(userId)` (the role-assignments key is under it, so this covers it). Also the per-role assignments list when that follow-up exists. Also `usersKeys.lists()` only if the users list shows role counts. It does not today.
- On 404 or 409 from any mutation, refetch the affected subtree, as in `useSetUserStatusMutation`.

Two related points:
- `userRoleAssignmentsQueryOptions` hardcodes `{limit:100, offset:0}`. A user with more than 100 assignments is silently truncated. Add a note or page it. It is the PAN-013 pattern, so do not widen the diff.
- Both lists under `apps` can be sorted: the API list order is unspecified (not guaranteed). Do not promise a sort order in the UI.

# Recommendations

1. **Roles screen (acceptance criterion 1).**
   - Raise the org-admin-api follow-up for a Bearer role list and a role assignments list (§1 and §2) before implementing the Roles table, role edit, role delete and role assignments sheet.
   - Ask the owner to choose one of:
     - **(A)** Split PAN-015 into the Apps and permissions part now (done in this ticket) and the Roles part after the API follow-up.
     - **(B)** Ship a partial Roles screen: catalog-backed read-only table for active non-admin apps, and role create (no id needed). Role edit, delete and assign would be disabled and marked as waiting on the API, which is a half-feature.
     - **(C)** Move assign and revoke to the user detail sheet only.
   - My recommendation is A plus C. Unlike (B), it leaves no half-working Roles screen.
2. **Apps screen (AC 1, 3).**
   - Server-side table with `limit/offset` only (ADR 0005). Drop the `join_policy` facet and the key/name search, since the API has no filters (the ticket's own "check which filters the API supports").
   - Note that the number of apps is small. Client-side filtering would be rejected by ADR 0005, so say so explicitly in the plan, or the owner decides to relax it for the apps list.
   - Drop the Members column and show no value (R1). Record ADM-016 as the follow-up. Rewrite the `app-form-dialog` origins validation to defer to the API.
3. **Mutations (AC 2).**
   - Register, edit, status, permission add, toggle, role create/update/delete, assign, revoke: non-optimistic, inline dialog errors, `handlesOwnErrors`. Confirm with the target named (R9) for status, toggle to admin, role delete, permission removal, revoke.
   - Surface 403 `admin_wildcard_required` and `self_assignment_forbidden` as inline messages in the dialog, not as a global forbidden panel.
4. **Tests (AC 3, R8).** Use `src/test-utils/api.ts` `fakeApi`/`apiError` with fixtures for: loading, empty, error, 403 `permission_denied`, 403 `admin_wildcard_required`, 409 `conflict` (origin_taken vs key taken), 409 `role_has_assignments` on a permission toggle, 409 `last_super_admin` on revoke, 422 `unprocessable` field mapping. Fix the role-delete fixture as noted in §5.
5. **Registry (R4).** `apps.view`, `apps.register`, `apps.update`, `apps.createPermission` and `apps.updatePermission` already exist with the right permissions. `roles.viewAssignments` is `admin:users:read` (correct). Adding the key `/_authenticated/roles/` to `admin:apps:read` is correct only while the screen has no role list, as the registry comment says. When the follow-up lands, the route may need `admin:apps:read` as well.
6. **Follow-ups to record (org-admin-api).**
   - Admin roles list (ids, counts, default flag, `admin` and disabled apps included).
   - Assignments by role or app.
   - `member_count` (exists as ADM-016).
   - Optionally `role_has_assignments` as a specific code on role DELETE (currently generic `conflict`).
   - A reason code for "key taken" (409 currently has `details: null`).
   - Declare 409s in the OpenAPI for the routes that lack them.
   - The error envelope in the OpenAPI.

# Risks
- **Half-working Roles page:** without the role list, any Roles UI built now has no ids for existing roles. Faking ids from the catalog or from key strings would break R1.
- **Misleading dialog copy:** the mock copy for admin-only toggling describes default-role behavior the API does not have (D9). Left as is, it is a false claim to staff on an access-changing action.
- **409 ambiguity:** `conflict` is used for many different refusals. Branching on `message` is fragile (not a stable contract). Rely on action context and show the API message, and branch on `details[0].reason` only where it exists.
- **Two-step role creation** can leave a role without permissions if the second request fails.
- **Truncation:** permission lists and the user assignment list are capped at 100. The role form will silently lose permissions beyond 100. Page them, or show a notice with the total.
- **List order** is unspecified for apps and permissions, so tests that assert order are brittle.
- **Admin-app writes** need `admin:*` beyond the route permission. A staff user with `admin:apps:write` but not `admin:*` can open the form and get a 403 per action. The UI cannot predict this unless it knows `admin:*`.
- **Dialog a11y:** the shared `ConfirmDialog` fix is out of scope (PAN-014). Apply the aria-disabled-while-pending, status and `aria-describedby` error pattern locally in any new dialog.

# Open questions (for the owner)
1. Roles screen: A (split), B (partial), or C-only? My recommendation is A+C, with a P1 org-admin-api ticket for the role list and assignments by role.
2. Members column: drop it completely until ADM-016, or show "—" with a tooltip? (Orchestrator note says either is fine; I prefer drop.)
3. Apps list without filters: accept that, or relax ADR 0005 for this small registry (client-side filter over a limit=100 fetch)?
4. Origins: should the form allow `http://localhost:<port>` as the API does, to support registering the local dev origin (CLAUDE.md, PAN-009)?
5. "Make admin only" flow: is it acceptable that the toggle can fail with 409 when the default role holds the permission, and that the UI tells staff to remove it from the default role first (needs the role id, §1)?
6. Should app DELETE and permission DELETE (both exist) be added to the UI now, or recorded as follow-ups? I recommend follow-ups (R7).

Files read (all absolute):
- /home/user/admin-pan/work/tickets/PAN-015/ticket.md
- /home/user/admin-pan/src/api/openapi.json, errors.ts
- /home/user/admin-pan/src/features/apps/** and src/features/roles/** (data/, access-store.ts, forms, tabs, sheets, tables)
- /home/user/admin-pan/src/features/users/api/queries.ts
- /home/user/admin-pan/src/lib/permissions/registry.ts
- /home/user/admin-pan/docs/adr/0005-server-side-tables.md
- /home/user/org-admin-api/app/modules/rbac/{router,assignments_router,catalog_router,schemas,service,origins}.py
- /home/user/org-admin-api/app/core/errors.py
- /home/user/org-admin-api/docs/identity-architecture.md (§4)
- /home/user/org-admin-api/work/backlog.md

I did not re-read ADR 0004 or `schema.d.ts`; the schema comparison used `openapi.json`.
