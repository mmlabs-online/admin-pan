## PAN-015c consult: identity-access-engineer (read-only)

## PAN-015c: identity and access consult (read-only, org-admin-api @ 0757c27)

**Main point: AC4's "within 15 minutes" is wrong for production.** Production access tokens last 12 hours. The copy needs an owner decision (Open question 1).

### Findings

**F1. Permission per action** (all Bearer `aud=admin`; `x-permission` from the routers)
| Action | Endpoint | Permission | Source |
|---|---|---|---|
| List a user's assignments | `GET /users/{user_id}/role-assignments` | `admin:users:read` | `org-admin-api/app/modules/rbac/assignments_router.py:25-39` |
| Assign | `POST /users/{user_id}/role-assignments` | `admin:roles:assign` | `assignments_router.py:42-55` |
| Revoke | `DELETE /users/{user_id}/role-assignments/{assignment_id}` | `admin:roles:assign` (409 documented) | `assignments_router.py:58-74` |
| List holders of a role | `GET /apps/{key}/role-definitions/{role_id}/assignments` | `admin:users:read` (404 for unknown app or role; `Cache-Control: no-store`) | `org-admin-api/app/modules/rbac/router.py:254-281` |

- The holders endpoint is already in our snapshot (`admin-pan/src/api/openapi.json:5876`). The user endpoints are at `:10530` and `:10788`.
- The assign dialog also calls other endpoints, each with its own permission:
  - user search `GET /users?email=`: `admin:users:read`
  - apps list and role-definitions: `admin:apps:read`
  - org picker `GET /organizations`: `admin:organizations:read`

**F2. When `admin:*` is also needed** (`org-admin-api/app/modules/rbac/service.py:1557-1566`)
- `_guard_privileged` requires `admin:*` when the role is in the `admin` app, or when the role holds any `is_admin` permission (in any app).
- It runs on both assign (`:1527`) and revoke (`:1580`).
- The UI can predict this without extra calls: `RoleDefinitionRead.privileged` uses the same rule (`role_is_privileged`, `service.py:1058-1060`, `:1103`).
- On revoke, the user's assignment rows (`AssignmentRead`) have no `privileged` field. To predict it, the UI has to join `role_id` to role-definitions.
- When the actor lacks `admin:*` the API returns 403 `admin_wildcard_required` with `details.required = "admin:*"` (`org-admin-api/app/core/errors.py:63-69`).

**F3. Self-assignment guard**
- It applies only to the `admin` app, in both directions (grant and revoke), and super-admins are included (`service.py:1565-1566`).
- Nobody can revoke their own admin role, so self-revoke of an admin role is impossible. Self grant or revoke of non-admin app roles is allowed, including privileged ones if the actor has `admin:*`.
- Order matters: `require_super` runs before the self check. A non-super actor targeting their own admin role gets `admin_wildcard_required`, not `self_assignment_forbidden`.

**F4. Last-super-admin guard** (`service.py:1581-1587`, `org-admin-api/app/modules/rbac/repository.py:650-677`)
- Revoke only.
- It fires only when the target is an app-scope, unexpired `admin:super-admin` held by an active, verified user, and no other such holder exists.
- Since the actor cannot revoke their own admin role, this needs an actor who has `admin:*` from a role other than super-admin. That is rare but reachable, so the UI must handle it rather than try to predict it.
- Related: `admin:super-admin` cannot have an expiry (422 `expiry_not_allowed`, `service.py:1519-1522`).

**F5. Error shapes: the ticket's 422 codes are not top-level codes**
- `_assignment_unprocessable` raises `UnprocessableError`, whose top-level `code` is `unprocessable`. The specific reason is in `details[0].reason` (`service.py:1350-1351`, `errors.py:42-50`).
- So `org_id_not_allowed`, `unknown_org`, `expires_in_past` and `expiry_not_allowed` must be read from `details[].reason` (with `field` set to `org_id` or `expires_at`).
- AC3 leaves out 422 `unknown_role` (`service.py:1427`, `:1431`).
- A naive (no-offset) datetime fails Pydantic `AwareDatetime` (`org-admin-api/app/modules/rbac/schemas.py:283`) and comes back as the request-validation 422, not `unprocessable`.
- 409 `conflict` (top-level `code`, `errors.py:37-39`) covers "already assigned" (an unexpired duplicate for the same user, role and org) and "changed concurrently".
- Expired duplicates are renewed in place with the same id (`service.py:1530-1541`), so a grant can return an existing assignment id.
- 404 covers "User not found" and "Assignment not found" (`service.py:1413-1414`, `:1571-1577`).

**F6. Propagation: "15 minutes" is wrong in production**
- `access_token_ttl_seconds` defaults to 900 s (15 min), with bounds 60 to 43200 (`org-admin-api/app/core/config.py:92-93`).
- The USR-13 amendment (owner, 2026-11-17) sets **production to 43200 s (12 h)**: `org-admin-api/docs/adr/0005-access-token-signing.md:70-75`, `org-admin-api/.env.example:62`, and `org-admin-api/app/modules/users/router.py:65-73` ("12 h in production plus 30 s leeway").
- ADR-0001 (`org-admin-api/docs/adr/0001-multi-app-authorization.md:42-45`) says role changes take effect at the next token mint, which is at most the TTL. There are no refresh tokens, no denylist and no introspection.
- `roles` and `org_roles` are baked into the JWT at mint time (`org-admin-api/app/modules/tokens/service.py:97-139`).
- Practical effect:
  - Revoke: the user keeps the role in that app for up to 12 h (plus 30 s).
  - Grant: it takes effect the next time the app gets a new token. That may be immediate for a user who had no role yet (they were getting `not_member`), and up to 12 h for a live session.
- admin-pan's own ADR also states 15 min and is now outdated: `admin-pan/docs/adr/0003-auth-client-integration.md:21`.

**F7. Admin-app roles take effect immediately on the API side**
- Admin permissions are reloaded from the database on every request (`org-admin-api/app/modules/admin_auth/service.py:51`), so admin-app grants and revokes apply on the target's next admin API call.
- Effect on the signed-in user's own access:
  - Admin-app changes to yourself are impossible (F3).
  - Changes in other apps never affect admin permissions, because `effective_permissions(user, "admin")` only reads admin-app roles.
- So a successful assignment mutation can **never** change the caller's own `me/permissions`. The target user's admin UI picks up the change through their own 403 → `permission-refresh` path.

**F8. Registry** (`admin-pan/src/lib/permissions/registry.ts:177-188`)
- `roles.viewAssignments`, `roles.assign` and `roles.revoke` already exist and match the API.
- There is no entry yet for the holders endpoint.
- `registry.test.ts` checks every entry against `x-permission`, so `admin:*` cannot be declared on these actions. It is a runtime condition, the same pattern as `apps.issueCredential` (`registry.ts:134-137`).
- Watch out: `evaluateAll` uses **OR** semantics (`admin-pan/src/lib/permissions/source.ts:30-38`). `useActionPermission(['roles.assign','users.view'])` returns `granted` if either one is granted. It must not be used to express "needs both".

**F9. `forbiddenCopy`** (`admin-pan/src/lib/forbidden.ts:42-52`)
- It already handles `admin_wildcard_required` and `self_assignment_forbidden` with suitable copy and never shows the server `message`.
- `permission-refresh` already refetches `me/permissions` on `admin_wildcard_required` and does not on `self_assignment_forbidden`, which is correct.
- `last_super_admin` is a 409, not a 403. It is mapped per feature, as in `admin-pan/src/features/users/data/errors.ts:13`.

### Recommendations

- **R1 (AC4, R4/R11):** Do not ship "within 15 minutes". Base the copy on the actual production TTL:
  - Revoke: "Users already signed in to {app} may keep this role for up to 12 hours."
  - Grant: "Takes effect the next time {app} gets a new sign-in token (up to 12 hours for open sessions)."
  - Admin app: "Takes effect on their next admin request." Here the API is immediate (F7), so this does not count as claiming immediacy for other apps.
  - Put the duration in one constant with a comment citing ADR-0005 §6 and the USR-13 amendment. Do not hard-code 15.
  - Fix AC4 and admin-pan ADR 0003:21 through the owner, or as a follow-up (R7).
- **R2 (registry, R4):** Add `'roles.viewHolders': perm('admin:users:read', 'GET /api/v1/apps/{key}/role-definitions/{role_id}/assignments')`. Optionally rename `roles.viewAssignments` to `users.viewRoleAssignments` for clarity, but only if it stays inside the plan; otherwise make it a follow-up. Keep `roles.assign` and `roles.revoke` as they are.
- **R3 (AC1, R4):**
  - Gate the Assign control on `roles.assign`.
  - Gate the user picker separately on `users.view` or the `users` list permission (`admin:users:read`), and the org picker on `organizations.view` (`admin:organizations:read`).
  - Check each with its own `useActionPermission` call, not the array form (F8).
  - When the chosen role has `privileged === true` and `source.check('admin:*') === 'denied'`, show the existing "Only super admins can do this" note and disable Submit.
  - When the state is `unknown`, leave Submit enabled (fail open, ADR 0004). Always handle the 403.
- **R4 (self guard, R4/R9):** When `app === 'admin'` and the target `user_id === useSelfUserId()`, disable assign and revoke with the `self_assignment_forbidden` copy. Do not apply this to other apps; the API allows it there. Still handle the 403 for when `selfUserId` is undefined.
- **R5 (revoke, R9, AC2):**
  - Confirmation names the user (display name or email in the dialog body only, never in the URL or logs, R5), the role key, the app and the scope (app scope or org name).
  - For admin `super-admin` rows, add a line saying the API refuses to revoke the last active super-admin.
  - On 409 `last_super_admin`, keep the dialog open with that message and refetch nothing beyond the list.
  - Not optimistic. Use `retry: false` on both mutations.
- **R6 (AC3 error mapping):**
  - Map 422 by `details[0].reason` (`org_id_not_allowed`, `unknown_org` → org field; `expires_in_past`, `expiry_not_allowed` → expiry field; `unknown_role` → role field, then refetch role-definitions).
  - Map 409 `conflict` to "This user already has this role in this scope" and refetch the user's assignments.
  - 404 → "user or assignment no longer exists", then refetch.
  - 403 → `forbiddenCopy`.
  - Treat the request-validation 422 from a naive datetime as a bug: build `expires_at` with an explicit offset (`toISOString()` gives `Z`, which is fine) and unit-test that.
- **R7 (invalidation):**
  - On success, invalidate the target user's assignment list, the holders list for that role (`rolesKeys.all(app)` covers it if the holders key is nested under it), and the user detail.
  - Invalidating `me/permissions` is not needed (F7). If the plan wants it for consistency with `useRoleMutationOptions` (`admin-pan/src/features/roles/api/queries.ts:126`), restrict it to `app === 'admin'`. It is harmless but cannot change anything.
  - The 403 refresh already comes from `permission-refresh`.
- **R8 (holders sheet, AC5):**
  - Loading, empty, error (Retry), 403 via `query-view`, and 404 ("role or app no longer exists").
  - Show `user_status` (disabled holders are listed) and `active`. Per the schema note (`org-admin-api/app/modules/rbac/schemas.py:298-311`), `active` does not mean "effective in tokens", so label it "Not expired", not "Active access".
  - Note in the UI that `total` counts assignments, not distinct users.
  - Rows contain emails: show them, but never put an email in route search params.
- **R9 (user picking, AC1, R5):** Keep the `email` search term in component state and the API query string only, never in TanStack Router search params. Require an explicit row selection by `user_id`.

### Risks

- If the 15-min copy ships, staff will believe a revoke cut off access when the user actually keeps the role for up to 12 h. That is a real offboarding gap.
- If the predicted `admin:*` gate fails closed, legitimate super-admins could be blocked while `me/permissions` is loading. Keep `unknown` meaning "allowed".
- Mapping 422 by top-level `code` would make every 422 fall through to a generic message (F5). Tests must send `{"code":"unprocessable","details":[{"field","reason"}]}`.
- Revoke rows lack `privileged`. Without the join to role-definitions, a non-super admin sees enabled revoke buttons for privileged rows and only learns from the 403. That is acceptable, but should be intentional.
- A grant that renews an expired duplicate returns the same id, so the UI must not assume a new row.

### Open questions

1. **Owner:** AC4 says 15 minutes, but production TTL is 12 h (USR-13, 2026-11-17). Should the copy say "up to 12 hours", or name no number ("after the user's current sign-in token expires")? A number has to track the deploy setting. Also, ADR 0003:21 needs an update.
2. Should AC3 include 422 `unknown_role` and 404 (user or assignment gone)? The API returns both.
3. Should revoking a holder be possible from the per-role holders sheet as well, or only from the user detail sheet? The ticket's goal lists assign and revoke only in the user sheet.
4. Is renaming `roles.viewAssignments` (it actually lists a user's assignments) in scope, or a follow-up?
