# Requests to org-admin-api from admin-pan (batch of 2026-11-17)

Paste each prompt below into an org-admin-api session as its own `/ticket`. That repo's planner decides the final design; these are proposals. This file is self-contained.

Checked against org-admin-api `main` on 2026-11-17. ADM-015 (stats), ADM-016 (`member_count`) and USR-10 (staff sessions) are done and are **not** requested again.

Order of importance for admin-pan:
1. **Role listing and role holders.** These block whole screens (admin-pan PAN-015b and PAN-015c).
2. **Organizations and apps list filters.** These screens currently ship without search or filters.
3. **Everything else.** Each item removes a workaround or a follow-up.

---

## 1. Blocking admin-pan screens

```
/ticket "Staff role listing with ids (admin Bearer), including the admin app and disabled apps" P1
```

Context: admin-pan cannot manage roles from the real API.
- The only role list is the public catalog `GET /api/v1/apps/{key}/roles` (D17). It has no `id`, it returns 404 for the `admin` app and for disabled apps, and it is rate-limited per IP.
- Every role write is addressed by `role_id`: PATCH, DELETE, PUT permissions, assignment POST, and app PATCH `default_role_id`.
- Today a role id only appears in a create response, in `AppRead.default_role_id`, or in an existing user's assignment.
- The admin-pan owner decided (2026-11-17) to wait for a proper listing rather than work around it.

Proposal (adjust as your planner sees fit):
- **Path:** a new Bearer path that does not collide with the public catalog's method and path, e.g. `GET /api/v1/apps/{key}/role-definitions` or `GET /api/v1/roles?app=<key>`.
- **Permission:** `admin:apps:read`, or `admin:roles:manage`. Pick one and declare it in `x-permission`.
- **Response:** `Page[...]` with `limit ≤ 100` and `offset`. Each item has:
  - `id`, `app`, `key`, `name`, `is_system`;
  - `is_default` (`app.default_role_id == id`);
  - `permissions` (sorted keys);
  - `privileged` (true if any permission is `is_admin` or the app is `admin`);
  - `created_at` and `updated_at`.
- **Counts:** optionally `assignment_count` (active assignments) for the table. Skip it if it is costly.
- **Scope:** include the `admin` app and disabled apps. Return 404 only for an unknown app.
- **Optional detail endpoint:** `GET .../role-definitions/{role_id}`.
- **Tests:** 401, 403, 404 for an unknown app, the admin app included, a disabled app included, paging, and the `is_default` / `privileged` flags.
- **Consumer:** admin-pan PAN-015b (roles screen) and PAN-015c.

---

```
/ticket "Holders of a role: list assignments by role (admin Bearer)" P1
```

Context: role assignments can only be listed per user (`GET /users/{user_id}/role-assignments`). The admin-pan owner wants to keep the Roles screen's "who holds this role" sheet (decided 2026-11-17).

Proposal:
- **Path:** `GET /api/v1/apps/{key}/role-definitions/{role_id}/assignments`, or `GET /api/v1/role-assignments?role_id=&app=`.
- **Permission:** `admin:users:read`, the same as the per-user list. If you see a reason, use `admin:roles:assign` instead.
- **Response:** `Page[...]` with `limit ≤ 100`. Each item has the `AssignmentRead` fields plus the holder's `user_id`, `email` and `display_name`, so the UI does not need N extra calls.
- **Filters:**
  - `active` (true/false). By default expired assignments are included and marked `active=false`, like the per-user list.
  - `org_id`.
- **Order:** stable, e.g. `created_at DESC, id`.
- **Tests:** 401, 403, 404 for an unknown role or app, expired rows, org-scoped rows, and paging.
- **Consumer:** admin-pan PAN-015c (assign, revoke, who holds this role).

---

## 2. List filters (screens ship without search today)

```
/ticket "Filters and sort for the staff organizations list" P1
```

Context: admin-pan PAN-014 put the Organizations screen on the real API.
- `GET /api/v1/organizations` accepts only `limit` and `offset`. The order is fixed (`created_at DESC, id`), and unknown query params are silently ignored.
- Staff need server-side filters to find an organization without paging through the whole list.
- The admin-pan owner first chose to wait for this, then (2026-11-17) shipped the screen without search, so this is now a known gap.

Proposal (adjust as your planner sees fit):
- **`status`:** optional, `active` | `suspended`, one value.
- **`q`:** optional, trimmed, 1..100 chars.
  - Case-insensitive substring match on `name` OR `slug`.
  - Escape LIKE wildcards, as the users `email` filter already does.
  - An empty value is a 422, or is treated as absent. Document which.
- **`sort`:** optional, from an allow-list only: `created_at`, `-created_at` (default), `name`, `-name`, `slug`, `-slug`.
  - Always add `id` as a tie-breaker so offset paging stays stable.
  - An unknown value returns 422.
- **Response:** keep `Page<OrganizationRead>`, with `total` = the filtered count.
- **Indexes:** optionally on `lower(name)` / `slug` (trigram or `text_pattern_ops`). The table is small today.
- **Unknown params:** optionally reject them (or at least `extra` params on list routes), so a client typo doesn't silently return unfiltered data.
- **Tests:**
  - each filter alone and combined;
  - escaping (`%`, `_`);
  - sort order plus the tie-breaker;
  - 422 for a bad `status` / `sort` / empty `q`;
  - 403 without `admin:organizations:read`.
- **OpenAPI:** keep it accurate, and declare the 404 (get/patch/delete) and 409 (duplicate slug, `code: conflict`) responses so admin-pan's generated types show them.
- **Optional, same ticket or a follow-up:** the same `sort` param on `GET /api/v1/users`. admin-pan PAN-013 had to disable column sorting.
- **Consumer:** admin-pan Organizations (PAN-014).

---

```
/ticket "Filters and sort for the staff apps list" P1
```

Context: `GET /api/v1/apps` accepts only `limit` and `offset`. The admin-pan Apps screen (PAN-015) needs a search box and filters, and shipped without them.

Proposal (mirror the organizations list filters so both share one design):
- **Filters:**
  - `status`: `active` | `disabled`.
  - `join_policy`: one value from the existing enum.
  - `q`: trimmed, 1..100 characters, case-insensitive substring on `key` OR `name`, with LIKE wildcards escaped.
- **Sort:** `sort` from an allow-list (`key`, `-key`, `name`, `-name`, `created_at`, `-created_at`), with `id` as the tie-breaker.
- **Response:** `total` is the filtered count. An unknown or invalid value returns 422.
- **Tests:** each filter alone and combined, escaping, sort order and tie-breaker, 422 cases, and 403 without `admin:apps:read`.
- **Consumer:** admin-pan Apps (PAN-015).

---

## 3. Audit log

```
/ticket "Audit log: org filter and single-entry read" P2
```
- **`org_id` filter on `GET /api/v1/audit-logs`:** match entries whose target is the org, or whose row carries that `org_id` (entitlements, org-scoped assignments). admin-pan wants an "org history" link from the org detail sheet.
- **`GET /api/v1/audit-logs/{id}`** with `admin:audit:read`, so a deep link to one entry works without paging the list.
- **Tests:** the filter alone and with the existing filters, 404 for an unknown id, 403 without permission.

```
/ticket "Server-side CSV export of the audit log" P3
```
- **Why:** admin-pan removed its client-side CSV export (owner, PAN-016). A filtered export should come from the API.
- **Suggested shape:** `GET /api/v1/audit-logs/export?…same filters…`, returning `text/csv` with a row cap.
  - Permission: `admin:audit:read`, or a new `admin:audit:export`.
  - Write an audit entry for each export.
- **No PII beyond the list:** keep the same `user_agent` stripping.

---

## 4. Contract and OpenAPI accuracy

```
/ticket "Declare 404/409 responses and admin:* requirements in OpenAPI" P2
```
- **Why:** admin-pan generates its types from `/openapi.json`, and several real responses are missing today.
  - 404 on the organizations, entitlements, app-credentials and join-requests routes.
  - 409 on routes that use `_with_409`: POST/PATCH apps, permission PATCH, role PUT, assignment DELETE, and the entitlement grant.
  - The `admin:*` requirement on `POST /api/v1/apps/{key}/credentials`, which is only in prose today. Something machine-readable would help, e.g. `x-requires-super: true`.
- **Reason code:** add a distinct reason for "app key already taken" on POST /apps, so the UI can map it to the key field without parsing the message.

```
/ticket "Optimistic concurrency (ETag / If-Match) on PATCH for organizations and entitlements" P3
```
- **Why:** PATCH on an entitlement replaces `limits` as a whole, so two staff editing at once silently overwrite each other. The same applies to organization edits.
- **Shape:**
  - Return an `ETag` (e.g. based on `updated_at`) on GET and PATCH.
  - Accept `If-Match` on PATCH, and return 412 on a mismatch.
  - Keep it optional at first so existing clients keep working.

---

## 5. Entitlements

```
/ticket "Grant admin:entitlements:* to a staff role" P2
```
- **Why:** ADM-006 seeded `admin:entitlements:read` and `admin:entitlements:write` but granted them to no role. Only `admin:*` holders can use the admin-pan entitlements tab (PAN-019).
- **Proposal:** add the keys to the appropriate staff role(s) in a migration, or document the intended role. This is the owner's call; ask before seeding.
- **Spec text:** spec §5.6 still says ADM-006 is "(backlog)". Update it when touching this area.

---

## 6. App credentials

```
/ticket "Label and optional expiry for app credentials" P3
```
- **Why:** staff can only tell credentials apart by `key_id` and `created_at`, and an unused leaked key never ages out (ADR-0016 "later" list).
- **Shape:**
  - Optional `label` (short text) on issue, returned by the list.
  - Optional `expires_at` on issue. Expired keys are refused like revoked ones and shown with `active=false`.

---

## 7. Join requests (USR-03g follow-ups)

```
/ticket "Join requests: richer decision response and staff conveniences" P3
```
Pick the parts the owner wants:
- **Approve response:** say whether a role was actually granted (e.g. `granted_role_key: string | null`). Today approving an existing member returns 200 with nothing granted, and the UI cannot tell.
- **`decided_by`:** return a display value (name or masked email) next to the UUID, so the UI does not need to resolve users.
- **Reject cooldown:** expose its length (e.g. on app detail), give staff a way to clear it for one user, or both.
- **Pending count per app:** for a badge, either on `AppRead` or as a cheap `GET …/join-requests/count`. A cross-app "pending inbox" endpoint is optional.
- **Optional reject reason:** stored and audited, and shown to the user if the product wants that.
- **Expiry or auto-cancel** for stale pending requests (from the USR-03g security-review follow-ups).
- **Consistent paging:** `items` and `total` come from two separate statements, so a decision made between them can return `{items: [], total: 21}`. Read both in one snapshot (e.g. a REPEATABLE READ transaction, or a window count).
- **Self-approval policy:** a staff member with `admin:roles:assign` can approve their own request on a non-admin app. Decide whether to keep it (and maybe flag it in the audit row) or block it.

---

## 8. Reports

- ADM-017 (operational reports) is BLOCKED on the owner, and admin-pan PAN-021 waits on it. No new request; listed for completeness.
