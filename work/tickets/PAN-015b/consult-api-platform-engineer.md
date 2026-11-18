## PAN-015b consult: api-platform-engineer (read-only)

Source: org-admin-api at /home/user/org-admin-api (0757c27). LIMITATION: the consultant's toolset had no shell, so it could not run `git log c7b86dd..HEAD` or `git diff c7b86dd HEAD`. It compared admin-pan's snapshot `src/api/openapi.json` against current code by hand instead (see Finding 7). All file:line refs below are in org-admin-api unless noted.

### Findings

**1. Endpoints.** All are under /api/v1/apps/{key}, and {key} is the app key (e.g. `admin`), not a UUID. All are in app/modules/rbac/router.py. Bearer aud=admin applies to every route (router.py:38).

| Action | Route | Route permission | Success | router.py |
|---|---|---|---|---|
| List roles | GET /{key}/role-definitions | admin:apps:read | 200 Page[RoleDefinitionRead] | 229-240 |
| Role detail | GET /{key}/role-definitions/{role_id} | admin:apps:read | 200 RoleDefinitionRead | 243-251 |
| Holders | GET /{key}/role-definitions/{role_id}/assignments | admin:users:read, not apps:read (PAN-015c territory) | 200 Page[RoleHolderRead] | 254-281 |
| Create role | POST /{key}/roles | admin:roles:manage | 201 RoleRead | 284-293 |
| Rename role | PATCH /{key}/roles/{role_id} | admin:roles:manage | 200 RoleRead | 296-309 |
| Delete role | DELETE /{key}/roles/{role_id} | admin:roles:manage | 204 | 312-320 |
| Replace permissions | PUT /{key}/roles/{role_id}/permissions | admin:roles:manage | 200 RoleRead | 323-338 |
| Set default role | PATCH /{key} | admin:apps:write | 200 AppRead | 127-145 |
| List app permissions | GET /{key}/permissions | admin:apps:read | 200 Page[PermissionRead] | 162-176 |
| List apps / get app | GET "" , GET /{key} | admin:apps:read | 200 | 61, 121 |

- There is no `admin:roles:read`; role reads use `admin:apps:read`.
- Routes of the same name: GET /{key}/roles is the PUBLIC catalog (catalog_router.py), not the admin read. Never use it for admin-pan (R3 auth class mismatch, and it returns 404 for the admin and disabled apps).
- There is no GET on /roles/{id}.

**2. Request and response shapes (schemas.py).**
- RoleCreate {key, name}, extra=forbid (198-204).
  - key matches ROLE_KEY_RE `^[a-z][a-z0-9-]{1,31}:[a-z][a-z0-9-]{0,47}$` (models.py:35) and max 160. The prefix before ":" must equal the app key.
  - name is NFC-normalised, 1..255 chars, with disallowed Unicode categories rejected.
  - The role is created with is_system=false and no permissions.
- RoleUpdate {name?} only (207-218). `key` and `is_system` are immutable; an explicit null name gives 422 validation_error. An empty PATCH body or an unchanged name is a no-op 200 with no audit row (service.py:1185).
- RoleRead {id, key, name, is_system, permissions: sorted string[]} (221-226). Returned by POST, PATCH and PUT.
- RoleDefinitionRead (229-250) adds app, is_default, privileged, created_at and updated_at.
  - privileged = the app is `admin` OR the role holds any is_admin permission (service.py:1058-1060, 1103).
  - updated_at is bumped by a rename only, NOT by a permission replace (schema description, 248-250). Do not show it as "permissions last changed".
  - There is NO assignment_count. The USR-16 consult recommended it, but the shipped schema lacks it, so the UI cannot pre-disable delete on "has assignments"; it can only react to the 409.
  - There is NO is_org_owner flag. org_owner_role_id is on AppRead (schemas.py:95); compare it client-side.
- RolePermissionsReplace {permission_keys: string[] (max 200 items, each max 160 chars, PERMISSION_KEY_RE)}, extra=forbid (253-258).
  - It is a full replace. Duplicates are ignored and `[]` empties the role.
  - Keys are permission KEY strings, not ids. Take them from GET /{key}/permissions (PermissionRead {id, key, description, is_admin, scope: app|org}).
- AppUpdate (58-81) default_role_id: uuid|null. Null clears the default. `extra=forbid`, so unknown fields give 422.

**2b. Pagination.** Page = {items, total, limit, offset}. PageDep gives limit 1..100 (default 20), offset >= 0 (USR-16 consult D). Roles are ordered by key ASC, then id ASC (repository.py:257). There is no q/sort filter on role-definitions. Page through every page; an app can have many roles. `total` counts roles.

**3. Error codes and reasons.** Envelope `{"error":{code,message,details}}` (errors.py:140-147). Check order (ADR-0008 lines 102-104): lock app, 404, shape 422, 403 guards, state 409/422, write.
- 401 `unauthorized`: missing or invalid token.
- 403 `permission_denied`: the route permission is missing.
- 403 `admin_wildcard_required` with details {"required":"admin:*"} (errors.py:63-69). This is a subclass of PermissionDenied (same 403). It is raised when:
  - Any admin-app role create, rename, delete or permission change (service.py:1153-1154, 1187-1188, 1222-1223).
  - A PUT touches the admin app (an added/removed diff is non-empty), OR the diff adds or removes any is_admin permission in any app (1292-1295). An unchanged re-PUT never needs admin:* (comment at 1284).
  - A PATCH /apps/admin that changes anything (service.py:439-440). A no-op PATCH is allowed.
  - Anything else on the route needs only the route permission.
- 404 `not_found`: "App not found" (service.py:241) or "Role not found" (1074). This also covers a role of another app and an unknown permission_id.
- 409 `conflict` (code is always the generic `conflict`; only the message text differs, and details is null):
  - POST: "Role key is already taken" (1161, 1167).
  - DELETE: "System roles cannot be deleted" (1236); "The app's default role cannot be deleted" (1238); "The app's org owner role cannot be deleted" (1240); "Role has assignments" (1242, also generic `conflict`, not role_has_assignments!); "Role was changed concurrently" (1247).
  - PUT: "A default role must not hold admin permissions" (1312); "An org owner role must not hold admin permissions" (1314); "A default role of an org app must not hold org-level permissions" (1320; default role, org_mode=required, a permission with scope=org); "admin:super-admin must keep admin:*" (1326); "Role permissions changed concurrently" (service.py:201).
  - PATCH /apps/{key} for the admin app: "The admin app must stay active, closed, without org mode and without a default role" (service.py:441-450). Setting a non-null default_role_id on admin is a 409.
- 409 `role_has_assignments` is a DISTINCT code (errors.py:98-99). It appears only on PUT, when the diff ADDS an is_admin permission to a role that has assignments (service.py:1327-1328; details [{"field":"permission_keys","reason":"role_has_assignments"}]). Workaround per ADR: revoke, edit, re-grant. Delete-with-assignments is plain `conflict`, so the ticket AC "409 role_has_assignments" for delete does not match the API: the UI must map delete's 409 by `conflict` and message. Do not string-match; show the message inline.
- 422 `validation_error`: details is a list of {type, loc, msg} (errors.py:160-173), for bad key pattern, name length, extra fields, a null name, or more than 200 keys.
- 422 `unprocessable`: details is a list of {field, reason[, key]}:
  - POST role: field=key, reason `prefix_mismatch` (service.py:205-209, 1150-1151).
  - PUT: field=permission_keys, reason `unknown_permission`, plus `key` per missing key (1272-1277); one entry per key.
  - PUT: field=permission_keys, reason `wildcard_super_admin_only`, when `admin:*` is put on an admin-app role other than `admin:super-admin` (1279-1283).
  - PATCH app default_role_id: reason `unknown_role` (456), `role_has_admin_permissions` (461), `role_has_org_permissions` (503; org_mode=required and the role holds a scope=org permission), `same_as_default_role` (field org_owner_role_id, 493), and `org_mode_required` (org_owner_role_id).
  - There is no 422 for role-vs-permission scope on a non-default role, and no 422 for creating a role key that conflicts with scope or org_mode. Scope and org_mode only restrict the DEFAULT role (409 on PUT, 422 on the app PATCH).
- 429 `rate_limited` is not applied to these routes.

**4. Rules (ADR-0001, 0008, 0015; admin app).**
- Admin app: any write needs admin:*. The owner's note says the UI lets it be edited and the API decides. Handle `admin_wildcard_required` as a banner or inline note (a note that admin:* is needed fits).
- `privileged` on a role means a grant or revoke of the role needs admin:*. It is a UI hint only (schema description).
- `is_system`: it cannot be deleted. Its permissions and name can be edited (unless it is an admin-app role), so only delete is blocked.
- Super-admin guard: `admin:super-admin` must keep admin:* (409); only super-admin may hold admin:*.
- The default role may not hold admin permissions (409 on PUT, 422 on the app PATCH).
- Scope (org vs app): ADR-0015 puts it on the permission (PermissionRead.scope), not on the role. The restriction is only default role in org_mode=required.

**5. Audit (R4).** Every successful mutation writes an audit row in the same transaction:
- ROLE_CREATED (service.py:1168), ROLE_UPDATED (1206; only if the name changed), ROLE_DELETED (1248), ROLE_PERMISSIONS_REPLACED (1333; only if the diff is non-empty), APP_UPDATED (service.py:414; only if changes is non-empty).
- Refused privileged writes (the DENIED_ERRORS set, i.e. 403 admin_wildcard_required) are audited with outcome=denied (1156, 1190, 1225, 1297). This means a failed attempt in the UI produces an audit entry; 409/422 refusals do not.
- The audit-log screen must show these. The audit facts hold role_key and permission_keys_added/removed, never emails.

**6. Effects on ['me','permissions'].**
- GET /api/v1/me/permissions (me_router.py:15-26) is a per-request reload: ADR-0008 says "per-request reload" through current_admin, and it sends Cache-Control: no-store. Tokens carry no permissions claim (ADR-0008 line 146-147).
- Therefore, after editing an admin-app role the caller holds, the change is visible immediately on the next /me/permissions call; there is no token refresh. This contradicts ADR-0001 line 42 only for third-party apps (role changes wait for token refresh); for the admin app permissions come live from the database.
- Self-lock-out: a super-admin could in theory remove permissions from a role they hold. Guards: the super-admin role must keep admin:* (409), but other admin roles (e.g. an `admin:roles-manager` role) can lose `admin:roles:manage`, after which the next call is 403 and the UI would hide the controls.
- Recommendation: after any successful role mutation (create, rename, delete, PUT, default role) on app key `admin`, invalidate ['me','permissions'] along with the role queries. It is cheap and safe; for other apps it is not needed. Self-assignment guards do not apply to role edits.

**7. OpenAPI change since c7b86dd.** Git could not be run. Evidence from the snapshot at src/api/openapi.json:
- The snapshot ALREADY contains role-definitions list and detail (lines 5400, 5527) and the RoleDefinitionRead schema (2822-2889) with exactly the fields in the current schemas.py (id, app, key, name, is_system, is_default, privileged, permissions, created_at, updated_at; all required). It also contains the PUT 409 text "Default/super-admin role rule or role has assignments" (6192) and the app-PATCH 409 text (3954).
- No difference was found in the role-related paths or the RoleDefinitionRead between the snapshot and the current code. Roles, permissions and the app PATCH default_role_id look unchanged; the snapshot is current for PAN-015b.
- The snapshot also contains `/{key}/role-definitions/{role_id}/assignments` (RoleHolderRead, USR-17).
- Whether other, non-role endpoints changed between c7b86dd and 0757c27 is unverified; re-run openapi generation against 0757c27 and diff, or run `git diff c7b86dd HEAD -- app/`.

### Recommendations (each tied to an AC or rule)

- **R-1 (AC1, R2).** Generate the types from the snapshot; every call hits one of the endpoints in the table. Role ids come only from list/detail/POST responses. Build the app list from GET /apps, including status=disabled and `admin`; no filter is needed on role-definitions (it already includes the admin and disabled apps).
- **R-2 (AC1, R9).** After a role mutation, invalidate the role list for that app. For PATCH default_role_id also invalidate the app queries (default_role_id and the is_default flag). PUT and PATCH return RoleRead, which lacks is_default and privileged, so refetch the list or detail instead of patching the cache. Not optimistic (R9).
- **R-3 (AC2, two-step create).** POST /roles returns 201 with an empty role, then PUT /permissions. If the PUT fails (403 admin_wildcard_required when an is_admin permission is selected, 422 unknown_permission, 409, a network error), keep the created role in view with its id, tell the user "role created, permissions not saved", offer a retry of the PUT only (it is idempotent: a full replace), and never retry the POST (a repeat gives 409 "Role key is already taken"). Disable submit while in flight. If the POST response is lost (a timeout), do not blindly retry; refetch the list and look for the key.
  - UX pitfall: choosing an is_admin permission on a role that will have no assignments is fine (new role, so no `role_has_assignments`), but it needs admin:* (403 at the PUT after the role exists).
- **R-4 (AC3).** Delete: confirm naming the role (R9). Map 409 `conflict` by message and show it inline: system role, default role, org owner role, "Role has assignments". Because there is no assignment_count, pre-disable only on is_system and is_default (and on org_owner_role_id from AppRead); everything else is the API's call. If assignments exist, point to the holders list (admin:users:read).
- **R-5 (AC4).** Error map keyed on {status, code, details[].reason}, not message text: 403 admin_wildcard_required (note that admin:* is needed), 403 permission_denied, 409 role_has_assignments (PUT only), 409 conflict (show message), 422 unprocessable (reasons prefix_mismatch, unknown_permission with `key`, wildcard_super_admin_only, role_has_admin_permissions, role_has_org_permissions, unknown_role, same_as_default_role, org_mode_required), 422 validation_error (details are {type, loc, msg}; map loc to the form field), 404 (refetch the list and show "no longer exists"). Keep a generic fallback that renders the message.
- **R-6 (R4).** Mirror permissions: hide or disable controls without admin:roles:manage (create, rename, delete, PUT) and admin:apps:write (default role); reads need admin:apps:read. Do not use `privileged` or app=admin to hide controls, only to show a note "needs admin:*" (the owner decided the API decides); check admin:* in the `me/permissions` list with the same wildcard semantics as the API (`admin:*` is unexpanded in the response, me_router/ADR-0008 line 141).
- **R-7 (R6/R10).** Create form: key field needs the `<app-key>:` prefix pre-filled and locked (prefix_mismatch otherwise), pattern ROLE_KEY_RE, name 1..255. Permission picker: source from GET /{key}/permissions (all pages, limit 100), group by scope, mark is_admin permissions, and for default role and org_mode=required warn about scope=org permissions (API 409). Say clearly that `permission_keys` is the full set (replace).
- **R-8 (AC5).** Tests with the injected fetch: loading, empty, error, 403 (permission_denied and admin_wildcard_required), 409 conflict inline on delete, 409 role_has_assignments on PUT, 422 reasons, the two-step create failure with no second POST, and paging (total > limit).
- **R-9.** After a mutation on the `admin` app, also invalidate ['me','permissions'] (Finding 6).
- **R-10.** Follow-ups for org-admin-api (do not fix here, R1/R7): an assignment_count (or has_assignments) on RoleDefinitionRead; an `is_org_owner` flag; a distinct error code for delete-with-assignments (it currently shares `conflict`, which makes the AC wording "409 role_has_assignments" wrong for delete); a stable `reason` in `details` for the 409 conflicts (they currently carry only a message).

### Risks
- The ticket AC3/AC4 wording says delete 409 is `conflict` and lists role_has_assignments separately; this is correct, but if the planner assumes role_has_assignments on delete, the mapping will miss it. The code is `conflict` for delete and `role_has_assignments` only on PUT.
- Message-string dependence: the 409 conflict reasons are only distinguishable by message text (details null). Show the API message verbatim and do not branch on it; branch on client-known state (is_system, is_default) for UX.
- Stale list: no etag/If-Match; concurrent edits give "changed concurrently" 409 or a silent overwrite (PUT is last-write-wins, rename is last-write-wins). Refetch after every mutation.
- Self lock-out via an admin role edit (Finding 6): removing admin:roles:manage from a role the actor holds drops the controls on the next refresh; make the invalidation of ['me','permissions'] robust and handle a following 403.
- Denied attempts are audited (outcome=denied): a UI that lets users try privileged edits will produce audit noise; pre-check admin:* to avoid sending guaranteed-403 calls, but still handle a 403.
- updated_at does not change on a permission replace, so sorting by it or showing it as "last modified" misleads.
- Disabled apps: reads work, and writes appear not to check app status (no status guard in RoleService). Allowed by the API, so the UI should allow it but may warn.
- No tool to run git diff; the "no change since c7b86dd" conclusion rests on a manual comparison of the role-related parts only.

### Open questions
1. Should the UI pre-check admin:* (hide privileged edits for non-super staff) or always send and show the 403? The owner said the API decides; assumed "send and show the 403", with a note.
2. Is a role-holder count needed in the list (needs an org-admin-api ticket) or is the post-hoc 409 acceptable?
3. Should creating a role be allowed with permissions chosen in the same dialog (two-step, as in the AC), or create-then-edit as separate screens? The AC implies the former.
4. Can the UI let staff clear a default role (PATCH default_role_id null)? The API allows it on non-admin apps (schemas.py:76-81, service.py:441-450 only blocks non-null on admin). Is that in scope for "set the app's default role"? Recommendation: setting only.
5. Run the git diff c7b86dd..0757c27 on org-admin-api for non-role paths (to be done by the orchestrator/planner, who has a shell).

Files: /home/user/org-admin-api/app/modules/rbac/router.py, schemas.py, service.py (RoleService 1063-1347, AppService._update 424-539), actor.py, /home/user/org-admin-api/app/core/errors.py, /home/user/org-admin-api/app/modules/admin_auth/me_router.py, /home/user/org-admin-api/docs/adr/0008-admin-api-authentication.md, /home/user/admin-pan/src/api/openapi.json.
