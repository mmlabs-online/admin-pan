# PAN-015 consult: identity-access-engineer

Sources read: org-admin-api at a417ddb (`app/modules/rbac/{service,authz,actor,router,assignments_router,catalog_router,schemas,models}.py`, `app/modules/admin_auth/{service,me_router}.py`, `app/core/errors.py`, ADR-0008 with its amendments, and `docs/identity-architecture.md`). In admin-pan I read the apps and roles features, `src/lib/permissions/{registry,source}.ts`, ADR 0003/0004 and the OpenAPI snapshot.

## Findings

**F1. Blocking contract gap: there is no staff endpoint that lists roles with their ids.**
- `router.py` has only POST, PATCH and DELETE for roles, plus PUT for `/roles/{role_id}/permissions`.
- The only GET on `/apps/{key}/roles` is the public catalog (D17). It returns `key, name, is_system, permissions` with no `id`, and it answers 404 for the `admin` app and for disabled apps.
- Every role write needs `role_id`: PATCH/DELETE/PUT, the assignment POST body `{role_id}` and app PATCH `default_role_id`.
- So with the real API the UI cannot:
  - list the roles of the `admin` app or of a disabled app;
  - edit or delete any role it did not create in the same session;
  - assign any role;
  - set a default role.
- An admin endpoint for this cannot reuse `GET /apps/{key}/roles`, because that method and path belong to the public catalog. The API needs a new path or another design.

**F2. Gap: there is no "who holds this role" endpoint.**
- Assignments exist only per user: `GET/POST /users/{user_id}/role-assignments` and `DELETE …/{assignment_id}`. The GET has an `?app=` filter.
- The current Roles screen has an "Assignments of <role>" sheet, which the API cannot back.
- Spec §5.4 itself says "role assignments per user", so the per-role sheet is a mock-era layout, not a requirement.
- Assigning by email works through `GET /users?email=`. That is a substring (ILIKE) search, so the UI must pick from results, not trust a single match.

**F3. The `admin` app is special (enforced by the API).**
- It is listed and readable (`admin:apps:read`) like any app.
- Any real change to it needs `admin:*` (403 `admin_wildcard_required`, `details.required = "admin:*"`). A no-op PATCH needs nothing.
- It must stay `active`, `closed` join policy, `org_mode = none` and without a default role (409). It cannot be deleted (409).
- Origins: at most 2, no apex, no loopback in staging/prod. The CLI is the documented path.
- Its permissions are always `is_admin` (422 `admin_app_permission_must_be_admin` on an explicit false).
- Creating, changing or deleting its permissions, or creating, renaming or deleting its roles, needs `admin:*`.
- A role permissions PUT on an admin-app role needs `admin:*` only if the diff is non-empty.
- `admin:*` may only be held by `admin:super-admin` (422 `wildcard_super_admin_only`). Super-admin must keep it (409). It cannot be deleted (409).
- The `admin` app has no member role.

**F4. Wildcards and key format.**
- Permission keys: `^[a-z][a-z0-9-]{1,31}:([a-z][a-z0-9-]{0,47}:[a-z][a-z0-9-]{0,47}|\*)$`, max 160 characters.
- Role keys: `^<app>:<name>`, two segments.
- The prefix must equal the app key (422 `prefix_mismatch`).
- `<app>:*` is always `is_admin` (422 `wildcard_must_be_admin`).
- `permits()` matches only the exact key or `<app>:*`. There is no global `*` and no `<app>:<resource>:*`.
- The PAN-005 question is answered: role keys go over the wire in full, as `<app>:<key>`. The permissions PUT body takes `permission_keys` (keys, not ids, max 200).

**F5. Privileged operations need `admin:*` on top of the route permission (G2/G4).**
- Creating an `is_admin` or `<app>:*` permission.
- Flipping `is_admin` in either direction.
- A role permissions PUT whose diff adds or removes any `is_admin` permission.
- Granting or revoking a privileged role: any admin-app role, or any role holding an `is_admin` permission. Renewing an expired row counts as a grant.
- State refusals:
  - 409 `role_has_assignments` when `is_admin` would reach members of an assigned role (PUT adds one, or a false→true flip).
  - 409 when a false→true flip hits a permission held by the default role.
  - 409 when a default role would hold an admin permission.
  - 409 when deleting a permission any role holds, deleting a system or default role, deleting a role with assignments, or deleting an app that has assignments.

**F6. Self-assignment.**
- Nobody, super-admins included, can grant or revoke their own admin-app roles (403 `self_assignment_forbidden`).
- Roles of other apps, even privileged ones, can be self-granted by a super-admin.

**F7. Last super-admin.**
- Revoke returns 409 `last_super_admin` when no other active, verified, unexpired, app-scope super-admin would remain.
- Revoking an expired super-admin row is allowed.
- The UI cannot predict any of this; it must map the error.

**F8. Org-scoped vs app-wide assignments.**
- `org_id` is allowed only when the app's `org_mode != none` (422 `org_id_not_allowed`). An unknown org gives 422 `unknown_org`.
- Admin-app roles are therefore always app-scope.
- Admin enforcement reads only app-scope roles (`effective_permissions(user, "admin")`, no org).
- The org picker needs `GET /organizations` (`admin:organizations:read`). PAN-014 is BLOCKED, but the endpoint exists.

**F9. Expiry.**
- `expires_at` must be timezone-aware and in the future by the DB clock (422 `expires_in_past`).
- `admin:super-admin` cannot expire (422 `expiry_not_allowed`).
- Expired rows are still listed with `active: false` and can be revoked.
- Re-granting the same (user, role, org) after expiry replaces the row in place, with the same `id` and `created_at`. A live duplicate gives 409.
- The mock turns a date input into UTC midnight. That means a role "expiring on 2026-12-01" ends at 07:00 on 2026-12-01 in Vietnam (UTC+7), and the start of that day is a past instant for a "today" pick made in the morning.

**F10. Token and enforcement lag.**
- Admin API: no lag. ADR-0008 §3 reloads the user's admin permissions from the DB on every request, so revoking, granting or expiring an admin role, or editing an admin role's permissions, applies on the next call.
- The 15-minute tail applies to other apps' tokens, because of the D7 `roles` claim. A revoked `stoktok:*` role keeps working in stoktok for up to 15 minutes.
- Because of F6, the current user can never change their own admin-app assignments. Self-changes can only happen in two ways:
  - (a) a super-admin edits the permissions of an admin role they hold;
  - (b) another staff member revokes them, possibly in another tab or browser.
- If the user loses all admin roles, their token stays valid: `/me/permissions` returns 200 with empty lists and every admin call returns 403. The gate shows "No access" only on the next token mint (`not_member`).

**F11. The mock behaves differently from the API in ways that tests could lock in.**
- `addPermission` / `setPermissionAdmin` add to and remove from the default role automatically. The API never does this (D9: only create, seed or manifest rebuild `<app>:member`).
- `deleteRole` cascades assignments; the API refuses with 409.
- The mock `granted_by` is non-null; the API returns `uuid | null`, with null for system/CLI.
- The API `PermissionRead` and `RoleRead` have no `app_id`, and `description` is nullable.
- `AssignmentRead` has `app`, `role_key` and `active`.
- The mock comments name `admin:apps:write` for permission and role writes. The real permission is `admin:roles:manage`; the registry already uses the right key.

**F12. Registry gaps.**
- There is no `apps.delete` (`DELETE /apps/{key}`, `admin:apps:write`) and no permission delete (`DELETE …/permissions/{id}`, `admin:roles:manage`).
- `forbidden.ts` already has copy for `admin_wildcard_required` and `self_assignment_forbidden`.
- The users feature already maps `last_super_admin`. PAN-015 should reuse that mapping, not duplicate it.

## Recommendations

1. **Contract gap (AC1, R1).** Record an org-admin-api follow-up for a staff role listing with ids. It must cover the `admin` app and disabled apps, and include each role's permission keys and whether it is privileged. It must not use the public catalog's method and path (`GET /apps/{key}/roles`). Do not use the public catalog to manage roles: it has no ids, skips the admin app and is rate-limited per IP.
   - Until the listing lands, the planner should either split PAN-015 or stop with BLOCKED.
   - What works today: apps CRUD; permissions list, create, PATCH and delete; role create, which returns the id; and per-user assignment list and revoke.
   - What is blocked: role list, edit and delete, assign, and set default role.
   - Also record a "list holders of a role" follow-up, or drop the per-role assignments sheet.
2. **Move assignment management to the user** (spec §5.4, AC1/AC2): the user detail sheet lists the user's assignments, with `?app=` as the only filter the API supports.
   - Show `role_key`, scope (app-wide or the org name), expiry, and active/expired status taken from the API's `active` field. Never compute it from the client clock.
   - Revoke goes through a confirmation naming the user, role key and scope (R9). It is never optimistic, and on success it invalidates the user's assignments query.
3. **Handle errors by `code` (R4, R9).** Inline in the dialog (`handlesOwnErrors`), with fixed copy, and never show the server `message`:
   - 403: `admin_wildcard_required`, `self_assignment_forbidden`, `permission_denied`;
   - 409: `last_super_admin`, `role_has_assignments`, plain `conflict` (duplicate key, default/system role, permission still held, app has assignments, admin-app invariants), `origin_taken` (`details.reason`);
   - 422 with `details.reason`, put on the matching field: `prefix_mismatch`, `wildcard_must_be_admin`, `admin_app_permission_must_be_admin`, `wildcard_super_admin_only`, `org_id_not_allowed`, `unknown_org`, `unknown_role`, `expires_in_past`, `expiry_not_allowed`, `unknown_permission` (with `key`).
   - Add tests for at least `admin_wildcard_required`, `self_assignment_forbidden`, `last_super_admin` and `role_has_assignments` with the fake `fetch`.
4. **Do not reimplement API rules as blocking UI logic (R1, ADR 0004).**
   - No client-side "is this privileged?", "is this the last super-admin?" or self-assign blocking.
   - The only allowed client checks: key regexes copied from F4 (prefix = app key, `<app>:*` forces `is_admin` checked), and forcing the `is_admin` checkbox on and disabling it for the `admin` app.
   - For the admin app, show a static note: "Changes to the admin app require admin:*". Keep the controls enabled; the API decides.
5. **Expiry input (F9).**
   - Send an ISO timestamp with an offset, at end of day in the user's local zone, and say which zone in the help text. Or use `datetime-local`.
   - Keep the client "future" check as a hint only; the API's `expires_in_past` is authoritative.
   - Hide or disable expiry for `admin:super-admin` with a reason, and still handle `expiry_not_allowed`.
   - After a re-grant of an expired row (same id), invalidate; do not append to the list.
6. **Live tokens (F10).**
   - Do not call `invalidateToken()` after assignment changes. The current user cannot change their own admin roles, other apps' roles do not affect the `aud=admin` token, and the admin API already reloads permissions per request.
   - After any write on the `admin` app (role PUT, or assigning or revoking admin roles for others), invalidate the `['me','permissions']` query key that PAN-011b will add. This is a harmless no-op until then.
   - After granting or revoking a role of a non-admin app, show: "Takes effect in <app> within 15 minutes for already signed-in sessions." This is accurate (D7) and sets expectations.
7. **Registry (R4).**
   - Add `apps.delete` → `DELETE /api/v1/apps/{key}` (`admin:apps:write`) and `apps.deletePermission` → `DELETE …/permissions/{permission_id}` (`admin:roles:manage`), if the screens offer them.
   - Consider splitting `roles.update` (PATCH name) from `roles.setPermissions` (PUT), so the 409/422 handling stays tied to each operation.
   - Do not add `admin:*` as a requirement in `ACTIONS`. It depends on the target, not the route.
8. **Fix the mock schemas to match the API (AC1):** nullable `granted_by` and `description`; no `app_id` on permission and role reads; `AssignmentRead` with `app`, `role_key`, `active`. Use generated types (R2). Drop the default-role auto-sync from the mock, or remove it with the mock.
9. **Members column:** drop it, or show "unavailable", as the orchestrator noted. ADM-016 is the follow-up.
10. **Order versus PAN-011b: land PAN-015 first; PAN-011b can follow or run in parallel.**
    - PAN-015 does not depend on it: `unknown` renders as allowed and the API gates, per ADR 0004.
    - PAN-011b must implement `permits()` semantics in its source: `admin:*` grants every admin permission. Otherwise super-admins would see controls as denied. Put that in PAN-011b's acceptance criteria.
    - PAN-011b should also refetch `/me/permissions` after admin-app writes, which is the hook in rec. 6. Landing it first would add nothing PAN-015 needs and would delay a P1.

## Risks

- **R-a.** Without F1 resolved, a partial PAN-015 ships a Roles screen that cannot edit, delete or assign. Hard-coding role ids, or scraping them from the users' `role_id`, would be faking API data (R1); do neither.
- **R-b.** Copying API predicates into the UI (privileged role, last super-admin, self-assign) drifts silently when the API changes. Keep them as error mapping only.
- **R-c.** The email lookup for assignment is a substring search. Auto-picking the first match could grant a role to the wrong account; require an explicit selection that shows the full email.
- **R-d.** Granting stays the escalation path. A staff member with `admin:roles:assign` but not `admin:*` can grant non-privileged roles of other apps, including to themselves. That is by design. Every grant is audited (R4 in the API), so the UI needs no extra guard. Mention it in the PR so the owner is aware.
- **R-e.** Expiry timezone mistakes cause early or late cut-offs. Test that the ISO value carries an offset.
- **R-f.** The 15-minute tail on other apps' tokens after a revoke is an accepted risk (spec OQ8). The UI must not claim a revoke is immediate.

## Open questions

1. **For the owner / org-admin-api:** what shape should the staff role listing take? Options: a new path such as `GET /api/v1/apps/{key}/role-definitions` returning `Page[RoleRead]`, or roles embedded in the app detail. Should it carry a computed `privileged` flag? Until it exists, should PAN-015 be split (apps + permissions + per-user revoke now; roles and assign later) or be BLOCKED?
2. **For the owner:** is it confirmed that the per-role "Assignments" sheet is replaced by assignments on the user detail (spec §5.4 wording)? Or should a "holders of role" endpoint be requested?
3. **For the owner:** should admin-app writes be offered in the UI at all? The API allows them with `admin:*`. The alternative is showing the `admin` app as read-only and leaving origins to the CLI (ADR-0008 calls the CLI the documented path).
4. **For the owner:** should expiry be date-only or date and time, and in which display timezone (spec §8 Q3, UI language/locale)?
5. **For org-admin-api:** should `PATCH /apps/{key}` with `default_role_id` (the "set default role" action from PAN-005) be in scope here? It needs the role ids from Q1.

Relevant files:
- /home/user/org-admin-api/app/modules/rbac/service.py (guards: lines 365-424, 706-834, 860-1051, 1193-1307)
- /home/user/org-admin-api/app/modules/rbac/router.py, /home/user/org-admin-api/app/modules/rbac/assignments_router.py, /home/user/org-admin-api/app/modules/rbac/catalog_router.py
- /home/user/org-admin-api/app/modules/rbac/models.py (lines 33-35, key regexes), /home/user/org-admin-api/app/modules/rbac/schemas.py
- /home/user/org-admin-api/app/modules/admin_auth/service.py (per-request reload)
- /home/user/org-admin-api/docs/adr/0008-admin-api-authentication.md
- /home/user/admin-pan/src/lib/permissions/registry.ts, /home/user/admin-pan/src/lib/forbidden.ts, /home/user/admin-pan/src/features/users/data/errors.ts
- /home/user/admin-pan/src/features/apps/data/access-store.ts, /home/user/admin-pan/src/features/apps/data/schema.ts, /home/user/admin-pan/src/features/roles/components/role-assignments-sheet.tsx
