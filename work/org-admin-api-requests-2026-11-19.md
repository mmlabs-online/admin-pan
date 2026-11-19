# Requests to org-admin-api from admin-pan (batch of 2026-11-19)

Paste each prompt below into an org-admin-api session as its own `/ticket`. That repo's planner decides the final design; these are proposals. This file is self-contained.

Checked against org-admin-api `main` at 0da2a42 on 2026-11-19. The following are done and are **not** requested again: USR-16 (role-definitions), USR-17 (role holders), ADM-020 / USR-18 (list filters), ADM-021, ADM-022, ADM-023. Still open on that side and **not repeated here**: ADM-024 (ETag/If-Match on PATCH organizations and entitlements; request 3 below asks to extend it), ADM-025, USR-19…22, ADM-017 (reports, BLOCKED on the owner).

Order of importance for admin-pan:
1. **Organization members and invitations for staff.** These block a whole screen (admin-pan PAN-018).
2. **Safety of role edits.** Lost updates on the full-replace permissions PUT, and the scope of the self-assignment guard.
3. **Everything else.** Each item removes a UI workaround or a vague message.

---

## 1. Blocking an admin-pan screen

```
/ticket "Staff read of an organization's members and invitations (admin Bearer)" P1
```

Context: admin-pan PAN-018 (spec §5.3) must show, in the organization detail, its members with their roles and joined date, and its pending invitations with status.
- Today staff have no endpoint for either. The only membership/invitation routes are cookie-authenticated identity routes under `/api/v1/auth/orgs/*` and `/api/v1/auth/invitations/accept`, which act for a signed-in account, not for staff.
- Membership is a role assignment with `org_id` set (`role_assignments`, `app/modules/rbac/models.py`); invitations are `OrgInvitation` (`app/modules/invitations/models.py`), which stores only `email_hmac`, not the address.

Proposal (adjust as your planner sees fit):
- **Members:** `GET /api/v1/organizations/{org_id}/members` → `Page[...]` (`limit ≤ 100`, `offset`).
  - Each item: `user_id`, `email`, `display_name`, `user_status`, `app` (key), `role_id`, `role_key`, `role_name`, `assignment_id`, `granted_by`, `created_at` (joined), `expires_at`, `active` (not expired).
  - One row per assignment (a user can hold several roles in one org); say so in the description, as USR-17 does for role holders.
  - Optional filters: `app`, `active`.
  - Permission: `admin:users:read` (it returns emails, like the role-holders endpoint), or `admin:organizations:read` plus `admin:users:read`. Declare it in `x-permission`. `Cache-Control: no-store`.
- **Invitations:** `GET /api/v1/organizations/{org_id}/invitations` → `Page[...]`.
  - Each item: `id`, `app`, `role_id`, `role_key`, `invited_by`, `created_at`, `expires_at`, `accepted_at`, `accepted_by`, `revoked_at`, and a derived `status` (`pending | accepted | revoked | expired`). No token, no token hash.
  - The invitee email is stored only as an HMAC, so the list cannot show it. Either accept that (admin-pan shows "invited by … for role …"), or store a masked hint at create time (e.g. `j***@example.com`) if the owner wants staff to recognise invitations. Decide in the plan; do not store the plain address only for this.
  - Optional filter: `status`. Permission: `admin:organizations:read`.
- **Optional, only if cheap:** staff revoke of a pending invitation, `DELETE /api/v1/organizations/{org_id}/invitations/{id}` (204, audited, `admin:organizations:write`). admin-pan would add it in a later ticket.
- **Tests:** 401, 403, 404 for an unknown org, paging, a user with two roles in one org, expired assignment `active=false`, invitation status derivation for each state, no token fields in the response.
- **Consumer:** admin-pan PAN-018.

---

## 2. Safety of role edits

```
/ticket "Optimistic concurrency on PUT /apps/{key}/roles/{role_id}/permissions (extend ADM-024)" P2
```

Context: the permissions PUT is a full replace and has no version check. Two staff editing the same role at the same time silently overwrite each other: the later save removes permissions the other just granted. admin-pan PAN-030 narrows the window on one client (it refuses to send if the role changed while the confirm step was open), but cannot prevent it across clients.
- `RoleDefinitionRead.updated_at` is bumped by a rename only, not by a permission replace (schema description), so the UI cannot use it as a version today.

Proposal:
- Bump a version on every permission replace: either bump `updated_at` on replace, or add an integer `version` / `permissions_version` to `RoleDefinitionRead` and `RoleRead`.
- Accept a precondition on the PUT: `If-Match` with an ETag from `GET …/role-definitions/{role_id}`, or a body field `expected_version`. On mismatch return 409 with a stable reason, e.g. `details: [{"reason": "role_changed"}]` (412 is also fine if you prefer HTTP semantics; say which).
- Keep it optional at first (no precondition → current behaviour) so existing clients don't break; admin-pan will always send it.
- Same shape as ADM-024 for organizations and entitlements, so one client helper covers all three.
- Tests: matching version succeeds and bumps it; stale version → 409/412 with the reason, nothing written, no audit row; no precondition → still works.

```
/ticket "Decide the scope of self_assignment_forbidden beyond the admin app" P2 (needs owner)
```

Context: today `self_assignment_forbidden` applies only to admin-app roles (`app/modules/rbac/service.py`, the guard in the assignment create/revoke path). A staff member with `admin:roles:assign` can grant **themselves** any non-admin product role, and, with `admin:*`, privileged product roles too. admin-pan mirrors the API and allows it, but its security review flagged it as a separation-of-duties gap.

Proposal: the owner decides one of
- (a) keep as is (document it in ADR-0001/0008);
- (b) forbid self-grant/self-revoke of **privileged** roles (any role holding an `is_admin` permission) in every app;
- (c) forbid all self-assignment in every app.

Whatever is chosen, keep the same 403 code `self_assignment_forbidden`, audit refused attempts as `denied`, and add tests per app type.

---

## 3. Removing UI workarounds

```
/ticket "Role definitions: assignment count, org-owner flag, and reasons on role-delete conflicts" P3
```

Context (admin-pan PAN-015b):
- `RoleDefinitionRead` has no assignment count, so the roles table cannot show how many users hold a role, and Delete can't be pre-disabled for a role that still has holders; the UI only learns it from the 409.
- There is no `is_org_owner` flag; the UI compares `AppRead.org_owner_role_id` itself.
- Every role-delete refusal is a plain 409 `conflict` with `details: null` (system role, default role, org-owner role, has assignments, changed concurrently). The UI can only show the server message, not fixed, translatable copy.

Proposal:
- Add `assignment_count` (active assignments) to `RoleDefinitionRead` (list and detail). Skip it on the list if it is costly and keep it on the detail.
- Add `is_org_owner` (bool) next to `is_default`.
- On DELETE 409, add `details: [{"reason": "system_role" | "default_role" | "org_owner_role" | "role_has_assignments" | "changed_concurrently"}]`. Keep the code `conflict` so existing clients keep working.
- Likewise give the PUT-permissions 409s a reason (`default_role_admin_permission`, `org_owner_admin_permission`, `default_role_org_permission`, `super_admin_must_keep_wildcard`, `changed_concurrently`).
- Tests for each reason.

```
/ticket "Role assignments: return role and org names" P3
```

Context (admin-pan PAN-015c): `AssignmentRead` (user role-assignments and role holders) carries `role_key` and `org_id` but no role name and no org name. The user sheet and holders sheet show raw org UUIDs; the revoke confirmation has to join with the organizations list to name the scope. (The missing 404/409 OpenAPI declarations were fixed by ADM-023 and are not requested.)

Proposal:
- Add `role_name` and `org_name` (nullable) to `AssignmentRead` and `RoleHolderRead`.
- Tests: names present, `org_name` null for app-scope assignments.

```
/ticket "Exact email lookup for staff user search" P3
```

Context (admin-pan PAN-015c): `GET /api/v1/users?email=` is a case-insensitive **substring** match (`app/modules/users/repository.py`, `ilike %x%`). When staff assign a role from the holders sheet, typing `an@x.com` also returns `joan@x.com`. admin-pan requires an explicit row choice, but an exact lookup would remove the look-alike risk. The email is also in the request URL, so it can reach proxy/API access logs.

Proposal:
- Add `email_exact=` (case-insensitive equality after normalisation), or a mode flag `email_match=exact|contains` (default `contains`).
- Optionally accept the lookup as `POST /api/v1/users/search` with the email in the body, so it stays out of URLs and access logs (R5 on the admin-pan side). If not, make sure access logs drop query strings for `/api/v1/users`.
- Tests: exact hit, case-insensitive hit, no partial hit with `exact`.

```
/ticket "Organizations and apps lists: sort collation and member_count sort" P3
```

Context (admin-pan PAN-029): `sort=name` follows the database collation. With a `C`/byte collation, Vietnamese and mixed-case names sort in an order staff won't expect (uppercase before lowercase, accented letters last). Apps cannot be sorted by `member_count` (422 today), although ADM-016 added the field.

Proposal:
- Sort `name` with a case-insensitive, locale-aware collation (e.g. ICU `und-u-ks-level2`, or `lower(name)` plus a Vietnamese-friendly collation), keeping the `id` tie-break. Document it.
- Add `member_count` / `-member_count` to the apps `sort` values if it can be done without a per-row count.
- Tests: mixed-case and accented names order; member_count sort with ties.
