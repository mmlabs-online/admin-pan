# Request to org-admin-api from admin-pan (2026-11-17)

Paste the prompts below into an org-admin-api session. Each one is a separate `/ticket`, and that repo's planner decides the final design. They unblock admin-pan PAN-015 (apps), PAN-015b (roles) and PAN-015c (assignments). The Organizations list filters are requested separately in `work/tickets/PAN-014/org-admin-api-request.md`, and the two requests can share one design.

---

```
/ticket "Staff role listing with ids (admin Bearer), including the admin app and disabled apps" P1
```

Context: admin-pan cannot manage roles from the real API. The only role list is the public catalog `GET /api/v1/apps/{key}/roles` (D17). It has no `id`, it returns 404 for the `admin` app and for disabled apps, and it is rate-limited per IP. Every role write is addressed by `role_id`: PATCH, DELETE, PUT permissions, assignment POST, and app PATCH `default_role_id`. Today the only places a role id appears are a create response, `AppRead.default_role_id`, or an existing user's assignment. The admin-pan owner decided (2026-11-17) to wait for a proper listing rather than work around it.

Proposal (adjust as your planner sees fit):
- **Path:** a new Bearer path that does not collide with the public catalog's method and path. For example `GET /api/v1/apps/{key}/role-definitions`, or `GET /api/v1/roles?app=<key>`.
- **Permission:** `admin:apps:read`. Alternatively `admin:roles:manage`; pick one and declare it in `x-permission`.
- **Response:** `Page[...]` with `limit ≤ 100` and `offset`. Each item has `id`, `app`, `key`, `name`, `is_system`, `is_default` (`app.default_role_id == id`), `permissions` (sorted keys), `privileged` (true if any permission is `is_admin` or the app is `admin`), and `created_at` / `updated_at`.
- **Counts:** optionally `assignment_count` (active assignments) for the table. Skip it if it is costly.
- **Scope:** include the `admin` app and disabled apps. 404 only for an unknown app.
- **Optional detail endpoint:** `GET .../role-definitions/{role_id}`.
- **Tests:** 401, 403, 404 for an unknown app, the admin app included, a disabled app included, paging, and the `is_default` / `privileged` flags.
- **Consumer:** admin-pan PAN-015b and PAN-015c.

---

```
/ticket "Holders of a role: list assignments by role (admin Bearer)" P1
```

Context: role assignments can only be listed per user (`GET /users/{user_id}/role-assignments`). The admin-pan owner wants to keep the Roles screen's "who holds this role" sheet (decided 2026-11-17).

Proposal:
- **Path:** `GET /api/v1/apps/{key}/role-definitions/{role_id}/assignments`, or `GET /api/v1/role-assignments?role_id=&app=`.
- **Permission:** `admin:users:read`, the same as the per-user list. If you see a reason, use `admin:roles:assign` instead.
- **Response:** `Page[...]` with `limit ≤ 100`. Each item is the `AssignmentRead` fields plus the holder's `user_id`, `email` and `display_name`, so the UI does not have to make N extra calls.
- **Filters:** `active` (true/false; the default includes expired assignments, marked `active=false`, like the per-user list) and `org_id`.
- **Order:** stable, for example `created_at DESC, id`.
- **Tests:** 401, 403, 404 for an unknown role or app, expired rows, org-scoped rows, and paging.
- **Consumer:** admin-pan PAN-015c.

---

```
/ticket "Filters and sort for the staff apps list" P1
```

Context: `GET /api/v1/apps` accepts only `limit` and `offset`. The admin-pan Apps screen needs a search box and filters, and the owner decided to wait for server-side support rather than ship without them (2026-11-17).

Proposal (mirror the Organizations list filters ticket so both share a design):
- **Filters:**
  - `status`: `active` | `disabled`.
  - `join_policy`: one value from the existing enum.
  - `q`: trimmed, 1..100 characters, case-insensitive substring on `key` OR `name`, with LIKE wildcards escaped.
- **Sort:** `sort` from an allow-list (`key`, `-key`, `name`, `-name`, `created_at`, `-created_at`), with `id` as the tie-breaker.
- **Response:** `total` is the filtered count. An unknown or invalid value returns 422.
- **Member count:** optionally fold ADM-016 (`member_count`) into the same response.
- **Tests:** each filter alone and combined, escaping, sort order and tie-breaker, 422 cases, and 403 without `admin:apps:read`.
- **OpenAPI:** declare the 409 responses that `_with_409` adds (POST/PATCH apps, permission PATCH, role PUT, assignment DELETE) so admin-pan's generated types show them.
- **Consumer:** admin-pan PAN-015.
