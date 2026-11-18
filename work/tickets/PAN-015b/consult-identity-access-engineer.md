## PAN-015b consult: identity-access-engineer (read-only)

Sources checked: org-admin-api at 0757c27. Files: `app/modules/rbac/router.py`, `service.py`, `schemas.py`, `actor.py`, `authz.py`, `app/core/errors.py`, `app/modules/admin_auth/service.py`, `app/modules/membership/service.py`. In admin-pan: `src/lib/permissions/*`, `src/lib/forbidden.ts`, ADR 0004, `src/features/apps/api/queries.ts`, and `src/features/roles/*`.

### Findings

**F1. Endpoint and permission per action** (`router.py`)

| Action | Endpoint | Route permission | Also needs `admin:*` when |
|---|---|---|---|
| List roles / one role | `GET /apps/{key}/role-definitions[/{role_id}]` (router.py:229-251) | `admin:apps:read` | never |
| Create | `POST /apps/{key}/roles` (:284) | `admin:roles:manage` | the app is `admin` (service.py:1153-1154) |
| Rename | `PATCH /apps/{key}/roles/{role_id}` (:296) | `admin:roles:manage` | the app is `admin` **and** the name actually changes (service.py:1185-1188) |
| Delete | `DELETE /apps/{key}/roles/{role_id}` (:312) | `admin:roles:manage` | the app is `admin` (service.py:1222) |
| Replace permissions | `PUT /apps/{key}/roles/{role_id}/permissions` (:323) | `admin:roles:manage` | the PUT is diff-based. It needs `admin:*` when (a) it changes anything on the `admin` app, or (b) it adds or removes any `is_admin` permission on any app (service.py:1284-1295). Re-sending an unchanged set never needs `admin:*`. |
| Set default role | `PATCH /apps/{key}` with `{default_role_id}` (:127) | **`admin:apps:write`**, not roles:manage | the app is `admin` and the value changes (service.py:439-440). After that the API always refuses with 409 (below). |

- `admin:*` can only come from `admin:super-admin`. A PUT that puts it on any other role returns 422 `wildcard_super_admin_only` (service.py:1279-1283). `require_super` is `permits(perms, 'admin:*')` (actor.py:29-37).
- Every permission on the `admin` app counts as `is_admin` (schemas.py:159-161). So every `admin` role is `privileged`, and `privileged` = app is `admin` OR the role holds an `is_admin` permission (service.py:1058-1060, schemas.py:240-245). The API calls `privileged` a UI hint.

**F2. Refusal codes. The ticket's AC4 is partly wrong.**
- 403 `admin_wildcard_required`, details `{required:'admin:*'}` (errors.py:63-69). The API logs these refusals in the audit log as denied.
- **Delete returns a plain `conflict` code for every refusal**: system role, default role, org-owner role, has assignments, or a concurrent change (service.py:1235-1247). `role_has_assignments` (errors.py:98-99) only comes from the **PUT**, when it adds an `is_admin` permission to a role that has assignments (service.py:1327-1328).
- The PUT also returns plain 409 `conflict` with **no details** for:
  - a default role holding an admin permission (:1311)
  - an org-owner role holding an admin permission (:1313)
  - the default role of an `org_mode=required` app holding an org-scoped permission (:1315-1320)
  - `admin:super-admin` must keep `admin:*` (:1321-1326)
  - concurrent change (:201)
- 422 reasons:
  - Create: `prefix_mismatch` on `key` (service.py:205-209, checked before `admin:*`). A key that is already taken is 409 `conflict` (:1160-1167).
  - PUT: `unknown_permission` on `permission_keys`, with `key` in each detail (:1272-1277), and `wildcard_super_admin_only`.
  - PATCH default role: `unknown_role` and `role_has_admin_permissions` (service.py:452-462), `role_has_org_permissions` when org_mode=required (:495-504). `same_as_default_role` comes back with **field `org_owner_role_id`** when you pick the org-owner role as default (:487-494).
- The `admin` app can never have a default role: 409 (service.py:441-450). A caller without `admin:*` gets the 403 first (:439).
- Disabled apps can be written: `_locked_app` only gives 404 (service.py:238-242).
- The usable default role at join time refuses a role with an `is_admin` permission (membership/service.py:58-66). That matches the 422 above.

**F3. Self-lockout cannot happen through role edits.** Permissions are reloaded from the database on every request (admin_auth/service.py:51), so any role change applies on the caller's next request. But:
- Only `admin:*` holders can write anything on the `admin` app.
- `admin:*` can only sit on `admin:super-admin`, and that role must keep it (409).
- So a caller who can edit `admin` roles keeps `admin:*` whatever they change.
- The other lockout routes are closed elsewhere: last-super-admin and self-assignment guards on assignments.

**Other staff, however, lose permissions on their next request.** That is the real risk to warn about.

**F4. Effect on `/me/permissions`.** `/me/permissions` only shows `admin`-app permissions (admin_auth/service.py:51). Writes on other apps never change it. On the `admin` app:
- Only the PUT changes effective permissions.
- Create (empty role), delete (refused if the role has assignments) and rename do not.

The apps feature already invalidates `['me','permissions']` for admin-app permission writes (queries.ts:223-230). The 403 refresher already covers `admin_wildcard_required` (permission-refresh.ts:6-9).

**F5. admin-pan state**
- `registry.ts:69` maps the roles route to `GET /api/v1/apps` with the comment "role catalog is public". This is out of date: the screen now reads `role-definitions` (`admin:apps:read`).
- There is no action for "set default".
- `roles.update` (registry.ts:156-160) bundles PATCH and PUT. That is fine because both need the same permission.
- `role-form-dialog.tsx:58` still says "admin:apps:write (planned name)", which is wrong for roles.
- `roles-table.tsx:47-48` computes `permission_count` and `assignment_count` from mock data. `RoleDefinitionRead` has no assignment count (schemas.py:229-250).

### Recommendations

**R-a. Registry** (AC1, R4, ADR 0004)
- Set the route `/_authenticated/roles/` to `perm('admin:apps:read', 'GET /api/v1/apps', 'GET /api/v1/apps/{key}/role-definitions', 'GET /api/v1/apps/{key}/role-definitions/{role_id}')`.
- Add `roles.setDefault: perm('admin:apps:write', 'PATCH /api/v1/apps/{key}')`.
- Optionally split `roles.rename` and `roles.replacePermissions`.
- Keep `roles.create`, `roles.update` and `roles.delete` on `admin:roles:manage`.
- `registry.test.ts` will check these against `x-permission`.

**R-b. When to say `admin:*` is needed** (owner note 2026-11-17, ADR 0004 "no role-to-permission map")
- **`admin` app:** show the static note "Changes to the admin app need admin:*". Keep all controls enabled, the same way as `app-form-dialog` does today.
- **Other apps:** next to each `is_admin` permission checkbox, show "admin only; changing it needs admin:*". Use the API's `is_admin` from `GET /apps/{key}/permissions`.
- **`privileged` flag:** show it only as a badge.
- **Disable, never block:** disable only when `source.check('admin:*') === 'denied'` and the action certainly needs it (the `admin` app). Never block on `unknown`.

**R-c. Two-step create** (AC2, R9)
1. POST `{key: '<app>:<seg>', name}`. On success, keep the returned `id` in component state.
2. Then PUT `{permission_keys}`. Skip the PUT if the set is empty.

If the PUT fails:
- Never repeat the POST.
- Close create mode, or switch the dialog to "edit role <key>" for the returned id.
- Show "Role <key> was created but its permissions were not saved: <reason>".
- Invalidate the role list.

The usual failure is 403 `admin_wildcard_required` when the chosen permissions include an `is_admin` one. Test that case.

**R-d. Edit = PATCH and PUT sent separately** (AC1)
- Send PATCH only if the name changed. Send PUT only if the set of keys changed, compared with the `permissions` the API returned.
- Send permission **keys**, not ids (schemas.py:253-258).
- If the first call succeeds and the second fails, report that part was saved, and invalidate.

**R-e. Error mapping** (AC3, AC4)
- 403 `admin_wildcard_required` / `permission_denied`: use `forbiddenCopy` inline.
- 409 on delete: the code is always `conflict`. Show the server message truncated to 200 characters, as `apps/data/errors.ts:39` does. Don't try to tell system / default / org-owner / assignments apart by code. Pre-disabling Delete for `is_system` and `is_default` is fine as a hint (row-actions does it for `is_system`), but still handle the 409.
- 409 `role_has_assignments`: attach it to the PUT's `permission_keys`. Copy along the lines of "Revoke this role's assignments before adding admin permissions".
- 409 `conflict` on create: show it as a field error on `key`.
- 422 reasons:
  - `prefix_mismatch` → key field
  - `unknown_permission` → list `details[].key` as text (R6)
  - `wildcard_super_admin_only`
  - `unknown_role`
  - `role_has_admin_permissions`
  - `role_has_org_permissions`
  - `same_as_default_role` (match on the reason, not the field)
- 404: "role/app no longer exists".
- Fix the ticket text: `role_has_assignments` comes from the PUT, not from delete.

**R-f. Set default** (R4, R9)
- Use the PATCH from `useUpdateAppMutation`.
- It is access-changing: future joins get this role. So confirm with a dialog that names the role and the app.
- Hide the action on the row that is already default.
- For the `admin` app, either hide it or disable it with the visible reason "The admin app has no default role" (that is an API invariant). See Q1.
- Leave the `is_admin` and org-scope checks to the API's 422s. Computing org scope in the UI would copy a business rule (R1). At most, show a hint when `privileged` is true on a non-admin app.

**R-g. Invalidation** (F4, PAN-011b)
- On every `admin`-app role write (create, rename, PUT, delete), invalidate the role-definitions queries and `mePermissionsKeys.all`. Reuse the `useAppPermissionMutationOptions` pattern; only the PUT strictly needs it.
- Add a test asserting `['me','permissions']` is invalidated for `admin` and not for other apps (as `apps/api/queries.test.tsx:200-211` does).
- After set-default, invalidate the apps and role-definitions queries.
- No optimistic updates.

**R-h. No self-lockout warning; warn about other staff instead** (F3, R9)
- When a PUT removes permissions, keep the existing confirmation listing the removed keys. Add: "Everyone holding <role> loses these on their next request".
- For a PUT on `admin:super-admin`, add the note "must keep admin:*"; the API returns 409 if it is removed.

**R-i. Assignment count** (R1, R7)
- Drop or replace the mock `assignment_count` column. The count is not in `role-definitions`.
- If it is wanted, use `GET …/role-definitions/{id}/assignments` `total` (that needs `admin:users:read`, router.py:254-261), or record an org-admin-api follow-up.

### Risks
- Two-step create can leave an empty role behind after a 403 or 409 on the PUT. This is intended, and the user must be told (AC2).
- A PUT's 409s have no details, so the UI can only show the server message for them. Copy that is driven by code is impossible for those cases.
- After another staff member edits roles, controls can stay visible for up to 60 s (`staleTime`). This is accepted in ADR 0004, and the API still refuses.
- PATCH-default is easy to wire to the wrong permission (`admin:roles:manage`). `registry.test.ts` catches it only if the action names the PATCH operation.

### Open questions
- Q1. `admin` app "Set default": hide, disable with a reason, or leave enabled and show the 409? The owner's note covers editing generally; this is a fixed invariant (service.py:441-450).
- Q2. Is "clear the default role" (`default_role_id: null`) in scope? The API allows it on non-admin apps (schemas.py:76-81), but the ticket only says "set".
- Q3. Should the row show an "org owner" badge (from `AppRead.org_owner_role_id`), so the delete and default 409/422 are explained before the user tries?
