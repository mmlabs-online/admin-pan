PAN-034 consult (api-platform-engineer). Verified against org-admin-api main a77e819: app/modules/app_credentials/{router,schemas,service,models}.py and app/modules/rbac/{router,schemas,service}.py. Read-only; nothing modified.

## Findings

### A. POST/GET /api/v1/apps/{key}/credentials
- **Body:** optional `AppCredentialIssue {scope}` with `extra="forbid"`. No body or `{}` gives `manifest`. A bad scope or an extra key returns 422 `validation_error` (FastAPI `loc` form, handled by the existing `bodyFields`).
- **Scope enum:** `manifest`, `releases`, `org-members:read`, `usage:read`, `usage:write`, `limits:write`. The ticket's list is exact.
- **Permission:** POST needs `admin:apps:write` and `admin:*` ALWAYS (`requires_super="always"`). The ticket says nothing about `admin:*`. The existing dialog and registry already gate on it (registry.ts:144), so keep that gating and say so in the scope hint.
- **GET** needs `admin:apps:read`. The response is `Page<AppCredentialRead>` with `scope` on every row.
- **Response fields:** `id`, `app`, `key_id`, `scope`, `created_by`, `created_at`, `last_used_at`, `revoked_at`, `active`. `AppCredentialIssued` adds `credential`. The POST response carries `Cache-Control: no-store`.
- **Check order in `issue()`:**
  1. 404 `not_found` for an unknown app.
  2. 403 `admin_wildcard_required`, with `details={required:'admin:*'}`.
  3. 409, `details=[{field:'key', reason}]`, code `conflict`. The reason depends on the case:
     - `admin_app`: the app is `admin` and the scope is not `releases`. The allow-list is `releases` only.
     - `app_disabled`.
     - `scope_not_available`: scope is `limits:write`, until ADM-044. This is new. The existing `credentialIssueError` default text ("The API refused…") would hide it.
     - `credential_limit`: at most 2 active credentials per (app, scope). `MAX_ACTIVE` is 2 and is counted per scope.
- **Not enforced server-side:** no check ties `org-members:read` to `org_mode=required`. The UI must not invent one (R1). The ticket's "admin app → `releases` only" matches the service.
- **Existing mapping, to change:** `credentialIssueError` has copy only for `admin_app`, `app_disabled` and `credential_limit`. Its `credential_limit` text says "This app already has 2 active credentials". It must become "2 active `<scope>` credentials". Add a `scope_not_available` case.
- **Existing UI copy, to change:** the credentials tab and dialog text ("at most 2 active credentials" per app) must be reworded per scope.

### B. PATCH /api/v1/apps/{key} (AppUpdate, `extra="forbid"`)
**Schema**
- Null is allowed ONLY for `default_role_id`, `org_owner_role_id` and `super_admin_role_id`. Any other field sent as null returns 422 `validation_error`.
- All three are `uuid | null`, optional. A field that is sent is compared with the stored value, and an equal value is a no-op that is dropped from `changes`.
- Clearing is allowed for all three. "None" is valid everywhere, except on the `admin` app, which cannot take a non-null default.

**Permission**
- Route: `admin:apps:write`.
- Plus `admin:*` when:
  - the app is `admin` and any field changed, or
  - `super_admin_role_id` is in `changes`, whether setting or clearing.
- Neither `default_role_id` nor `org_owner_role_id` needs `admin:*` on a non-admin app.
- A refused write returns 403 `admin_wildcard_required`, with `details={required:'admin:*'}`. A missing route permission returns 403 `permission_denied`. `isForbidden` and `forbiddenCopy` already exist.
- Send only changed fields. An unchanged `super_admin_role_id` then does not trip the `admin:*` check.

**Refusals, in evaluation order. Only the first is returned.** All 422 are code `unprocessable` with `details=[{field, reason}]`; all 409 are code `conflict`.

| # | Status | field / reason | Trigger |
|---|---|---|---|
| 1 | 404 | none | Unknown app (`not_found`). |
| 2 | 403 | none | `admin_wildcard_required`, as above. |
| 3 | 409 | no details | Admin-app invariant. A non-null `default_role_id` on `admin` is refused. Hide the role fields for `admin`. |
| 4 | 422 | `default_role_id` / `unknown_role` | Role not found in this app, so a role from another app is refused here. |
| 5 | 422 | `default_role_id` / `role_has_admin_permissions` | Default role holds an admin-only permission. |
| 6 | 403 | none | `admin_wildcard_required` when `super_admin_role_id` changes. |
| 7 | 422 | `super_admin_role_id` / `admin_app_not_allowed` | Super-admin role set on `admin`. Defensive, since #3 or the `org_mode` rules usually fire first. |
| 8 | 422 | `super_admin_role_id` / `unknown_role` | Role not found in this app. |
| 9 | 422 | `super_admin_role_id` / `org_mode_required` | Effective `org_mode` is not `required`. |
| 10 | 422 | `super_admin_role_id` / `system_role` | The role is a system role. |
| 11 | 422 | `super_admin_role_id` / `same_as_default_role` | Same as the effective default role. |
| 12 | 422 | `super_admin_role_id` / `same_as_org_owner_role` | Same as the effective owner role. |
| 13 | 422 | `super_admin_role_id` / `role_has_org_permissions` | The role holds org-scope permissions. |
| 14 | 422 | `super_admin_role_id` / `wildcard_not_allowed` | The role holds `<app>:*`. |
| 15 | 409 | `super_admin_role_id` / `role_has_assignments` | The role already has assignments. |
| 16 | 422 | `org_owner_role_id` / `unknown_role` | Owner role not in this app. |
| 17 | 422 | `org_owner_role_id` / `role_has_admin_permissions` | Owner role holds an admin-only permission. |
| 18 | 422 | `org_owner_role_id` / `org_mode_required` | An owner role is set, or about to be set, and the effective `org_mode` is not `required`. |
| 19 | 422 | `org_owner_role_id` / `same_as_default_role` | Owner equals the effective default. |
| 20 | 422 | `default_role_id` / `role_has_org_permissions` | `org_mode=required`, and the default role holds org-scope permissions. Only checked when `default_role_id` or `org_mode` changed. |
| 21 | 422 | `default_role_id` or `org_owner_role_id` / `same_as_super_admin_role` | Super-admin equals a changed default or owner role. The field says which one. |
| 22 | 409 | `org_mode` / `super_admin_role_designated` | `org_mode` set to `none` while a super-admin role is set. |
| 23 | 409 | `org_mode` / `org_mode_in_use` | `org_mode` goes from `required` to `none` while entitlements or org assignments exist. |
| 24 | 409 | `origin_taken` | Origin already held by another app. |
| 25 | 409 | `conflict`, no details | "App was changed concurrently", on `IntegrityError`. Includes a role deleted mid-request. |

- Item 18 does not fire when the owner is being cleared. `org_mode` must stay `required` while an owner role is set. Changing `org_mode` to `none` while an owner is set hits #18 with `field: org_owner_role_id`.
- "owner == default" is #19, with `field: org_owner_role_id`. The spec text does not give the reverse case (default changed to equal the owner) its own reason. It is the same code and reports `org_owner_role_id`.
- "admin-only permission on default/owner" is #5 and #17. The check is `role_has_admin_permission`.
- Also validated: `default_role_id` must be unique from owner and super-admin. A role from another app returns `unknown_role`.

**Mapping issues in the existing `src/features/apps/data/errors.ts`**
- `UNPROCESSABLE_FIELD` keys on `reason` alone. `org_mode_required` and `role_has_org_permissions` are mapped to the `org_mode` field, with copy about org mode. These same reasons now also arrive with `field` of `org_owner_role_id` or `super_admin_role_id`. The mapping must key on `(details[0].field, reason)` or the copy will be wrong.
- The edit-mode 409 branch falls through to the generic CHANGED message ("changed by someone else"). That swallows:
  - `role_has_assignments`
  - `super_admin_role_designated`
  - `org_mode_in_use`
  - the admin-app invariant message
- `AppFormField` and `APP_FIELDS` lack the three role fields. Add them.
- `permissionAdminError` already mentions the default and owner role holding a permission. It does not need changes.

**Refusal codes to map in errors.ts**
- 403: `permission_denied`, `admin_wildcard_required` (the existing `forbiddenCopy` covers both; verify the super-admin field names `admin:*`).
- 404: `not_found`.
- 409 `role_has_assignments`, 409 `super_admin_role_designated`, 409 `org_mode_in_use`, 409 `origin_taken`, and 409 with no reason (admin-app invariant or concurrent change).
- 422 `unprocessable` reasons (default role): `unknown_role`, `role_has_admin_permissions`, `role_has_org_permissions`.
- 422 `unprocessable` reasons (owner role): `unknown_role`, `role_has_admin_permissions`, `org_mode_required`, `same_as_default_role`, `same_as_super_admin_role`.
- 422 `unprocessable` reasons (super-admin role): `admin_app_not_allowed`, `unknown_role`, `org_mode_required`, `system_role`, `same_as_default_role`, `same_as_org_owner_role`, `role_has_org_permissions`, `wildcard_not_allowed`.
- 422 `validation_error`: handled by the existing `bodyFields`.
- Credentials: 409 `admin_app`, `app_disabled`, `scope_not_available` (new), `credential_limit`, plus 403 `admin_wildcard_required` and 404.

### C. What admin-pan already has (src/api/openapi.json, schema.d.ts)
Missing from the snapshot and needed:
- **`AppCredentialScope` enum:** absent.
- **`AppCredentialIssue` body:** absent. `issue_credential` operation has `requestBody?: never`. Add the requestBody, the new 409 and 422 descriptions, and the always-`admin:*` note.
- **`AppCredentialRead` and `AppCredentialIssued`:** both lack `scope`.
- **`AppRead`:** has `default_role_id` and `org_owner_role_id` (optional). It lacks `super_admin_role_id`.
- **`AppUpdate`:** has `default_role_id` and `org_owner_role_id`. It lacks `super_admin_role_id`, plus its description.
- **`RoleDefinitionRead`:** has `is_default` but lacks `is_org_owner` and `is_super_admin`. The `privileged` description is stale. `assignment_count` may also be missing; check the snapshot.
- **Descriptions** on the PATCH operation (409 and 422 reasons) are stale.

The snapshot is also stale elsewhere (for example `RoleDefinitionRead.updated_at` semantics). Refresh only the fragments above, using the PAN-018 method: copy the fragments from the API's `/openapi.json`, run `pnpm api:types`, and commit only the intended diff. Do not hand-edit `schema.d.ts` (R2). `pnpm api:types` regenerates the whole file, so check the diff for drift that is not about this ticket and revert it, or note it.

### D. Role ids to keys, without N+1
- Both apps GET responses (`GET /apps` and `GET /apps/{key}`) return all three role ids, once the schema is refreshed. All three are plain uuids; there are no keys or names on the app.
- `GET /api/v1/apps/{key}/role-definitions` is `Page<RoleDefinitionRead>` with `id`, `key`, `name`, `is_system`, `is_default`, `is_org_owner`, `is_super_admin`, `privileged`, `assignment_count`. It needs only `admin:apps:read`, the same permission as the apps GET. It is one request per app.
- `useRoleDefinitions` in `src/features/roles/api/queries.ts` (lines 50 to 120) already calls this endpoint. The detail sheet and the edit dialog can reuse it with `limit=100`, so there is no N+1. A single GET `role-definitions/{role_id}` per field would be N+1, so avoid it.
- Page limit is 100. An app with more than 100 roles needs a follow-up page, or a note. Check the roles hook for how it pages.
- Resolve ids with a map over that page. The flags `is_default`, `is_org_owner` and `is_super_admin` give the same answer without an id join. Prefer the id join, and fall back to the flags if the id is not in the page.
- Show the detail sheet roles as "key (name)". If a role id is not found, show a neutral "Unknown role" and do not fall back to the raw id.

## Recommendations
1. **Issue dialog (AC1, AC4).**
   - Scope options: `admin` app gets only `releases`; every other app gets `manifest`, `releases`, `org-members:read`, `usage:read`, `usage:write`. Never offer `limits:write`.
   - Send `{scope}` always, even for `manifest`.
   - Gate on `admin:apps:write` and `admin:*` (R4).
   - Add `scope_not_available` and a per-scope `credential_limit` copy. Add the test for the scope options per app and the body sent.
2. **Credentials tab.** Add the Scope column. Derive "N of 2 active" per scope from the list. Beware: the list is paged (`limit` ≤ 100), and revoked rows are included. Count `active` rows only, and fetch all pages or show the limit as unknown when `total` exceeds the page.
3. **Edit app (AC2, AC3).**
   - Add three selects, listed from the app's role-definitions, with "None" for each.
   - Hide them all for `admin`.
   - Disable Super-admin without `admin:*` and say why. Use the existing permission helper rather than a new one.
   - Exclude roles that are certain to be refused client-side only as a hint (for example system roles for super-admin, roles with `privileged` for default/owner). The server remains the source of truth (R4).
   - Send the PATCH diff only: changed fields, with `null` for "None", and no unchanged fields.
   - Disable the role selects while `org_mode` is `none` when a role is set (keep `org_mode` required). Do not rely on this; map the 422.
4. **Detail sheet.** Show the three roles by key, with a "None" or "Not set" text. Add a `super_admin_role_id` row.
5. **errors.ts.** Key mappings on `(field, reason)`. Change the edit 409 fallback so it only says "changed by someone else" for reason-less 409s. Add a `roleFormError` or extend `appFormError` with the three role fields. Cover every code in the table in tests (AC3, AC4).
6. **Role-id invalidation.** After a successful PATCH, invalidate the apps detail, the apps list and the role-definitions queries (`is_default` and the other flags change). The roles screen shows these flags too.
7. **Schema.** Do the PAN-018 partial refresh first (section C). Add a test that the types compile with `scope` and `super_admin_role_id`.

## Risks
- **Order of refusals.** The API returns only the first refusal, so a form can reveal errors one by one. Show the refusal against the field named in `details[0].field`, with an alert as backup.
- **Stale snapshot.** `schema.d.ts` is stale, so typecheck passes only after the refresh.
- **Wrong field for shared reasons.** Without the `(field, reason)` key the copy for `org_mode_required` and `role_has_org_permissions` will be wrong (see B).
- **`role_has_assignments` is a real blocker.** A role with holders cannot be designated super-admin. It is a 409 that staff must fix in the roles screen first. The copy must say so (the role-definitions row has `assignment_count` to pre-warn).
- **Owner role `simap:admin` (AC2).** It must not hold admin-only permissions, and simap must be `org_mode=required`. If either is untrue, the PATCH is refused (#17, #18). Verify with the actual simap data; the UI should show the API reason, not guess.
- **Secrets (ADR 0007, R5).** Keep show-once and copy-then-clear exactly as is. Do not put the scope or credential in URLs or logs.
- **Runtime-scope credentials.** The hint that a credential is for a backend deploy environment only is advisory. The API does not enforce it.
- **Role pages over 100.** An app with more than 100 roles breaks the single-page assumption.

## Open questions
1. Should the edit-app role selects live in the existing `app-form-dialog.tsx` or in a separate dialog? The org_mode field is there, and a combined PATCH lets staff change `org_mode` and an owner role in one request, which the API needs (#18).
2. Should the UI pre-filter roles using `privileged`, `is_system` and `assignment_count`, or show all roles and let the API refuse? Recommended: pre-filter lightly, and always map the API refusals.
3. The API refuses `limits:write` until ADM-044. When that lands, the option can appear, which needs a new ticket and a snapshot refresh. Confirm that hiding is the owner's wish.
4. Do the credentials tab and detail sheet need to show `created_by` for audit? Out of scope here, so a follow-up at most.
5. Should the roles screen show the new `is_org_owner` and `is_super_admin` flags (now in the API)? Out of scope for PAN-034 (R7); record as a follow-up.

Files referenced (absolute):
- /home/user/admin-pan/work/tickets/PAN-034/ticket.md
- /home/user/admin-pan/src/features/apps/data/errors.ts
- /home/user/admin-pan/src/api/schema.d.ts
- /home/user/admin-pan/src/api/openapi.json
- /home/user/admin-pan/src/features/apps/api/queries.ts
- /home/user/admin-pan/src/features/roles/api/queries.ts
- /home/user/admin-pan/src/lib/permissions/registry.ts
- /home/user/mmlabs-online/org-admin-api/app/modules/app_credentials/service.py
- /home/user/mmlabs-online/org-admin-api/app/modules/app_credentials/router.py
- /home/user/mmlabs-online/org-admin-api/app/modules/app_credentials/schemas.py
- /home/user/mmlabs-online/org-admin-api/app/modules/rbac/service.py (lines 441 to 629)
- /home/user/mmlabs-online/org-admin-api/app/modules/rbac/router.py
- /home/user/mmlabs-online/org-admin-api/app/modules/rbac/schemas.py
