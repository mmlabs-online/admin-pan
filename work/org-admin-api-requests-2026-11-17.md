# Requests to org-admin-api from admin-pan (batch of 2026-11-17)

Paste each prompt below into an org-admin-api session as its own `/ticket`. That repo's planner decides the final design; these are proposals. Checked against org-admin-api `main` at the time of writing: ADM-015, ADM-016 and USR-10 are done and are **not** requested again.

Earlier requests that are still open are repeated here in short form, with a pointer to the full text:
- `work/tickets/PAN-015/org-admin-api-request.md`: staff role listing, role holders, apps list filters.
- `work/tickets/PAN-014/org-admin-api-request.md`: organizations list filters.

Order of importance for admin-pan:
1. Role listing and role holders. These block whole screens (PAN-015b and PAN-015c).
2. Organizations and apps list filters. The screens currently ship without search or filters.
3. Everything else. Each item removes a workaround or a follow-up.

---

## 1. Blocking admin-pan screens

```
/ticket "Staff role listing with ids (admin Bearer), including the admin app and disabled apps" P1
```
Full proposal: `admin-pan/work/tickets/PAN-015/org-admin-api-request.md`, section 1.
- **Why:** every role write takes a `role_id`, but the only role list (the public catalog, D17) has no ids. It also returns 404 for `admin` and for disabled apps.
- **Shape:** `Page[...]` with `id, app, key, name, is_system, is_default, permissions, privileged, created_at, updated_at`, and optionally `assignment_count`.
- **Permission:** `admin:apps:read` or `admin:roles:manage`.
- **Unblocks:** admin-pan PAN-015b (roles screen).

```
/ticket "Holders of a role: list assignments by role (admin Bearer)" P1
```
Full proposal: same file, section 2.
- **Shape:** `Page[...]` of assignments for one role. Each item includes `user_id`, `email` and `display_name`, plus `active` and `org_id` filters, in a stable order.
- **Permission:** `admin:users:read`.
- **Unblocks:** admin-pan PAN-015c (who holds this role).

---

## 2. List filters (screens ship without search today)

```
/ticket "Filters and sort for the staff organizations list" P1
```
Full proposal: `admin-pan/work/tickets/PAN-014/org-admin-api-request.md`.
- **Parameters on `GET /api/v1/organizations`:**
  - `status`
  - `q` (case-insensitive substring on name or slug, with LIKE escaping)
  - `sort` from an allow-list, with `id` as the tie-breaker
  - `total` is the filtered count; an invalid value returns 422.
- **Consumer:** admin-pan Organizations (PAN-014, shipped without filters).

```
/ticket "Filters and sort for the staff apps list" P1
```
Full proposal: `admin-pan/work/tickets/PAN-015/org-admin-api-request.md`, section 3.
- **Parameters on `GET /api/v1/apps`:** `status`, `join_policy`, `q` (key or name) and `sort`. Share the design with the organizations ticket.
- **Consumer:** admin-pan Apps (PAN-015, shipped without filters).

---

## 3. Audit log

```
/ticket "Audit log: org filter and single-entry read" P2
```
- **`org_id` filter on `GET /api/v1/audit-logs`.** It matches entries whose target is the org, or whose row carries that `org_id` (entitlements, org-scoped assignments). admin-pan wants an "org history" link from the org detail sheet (PAN-014b).
- **`GET /api/v1/audit-logs/{id}`** with `admin:audit:read`, so a deep link to one entry works without paging the list.
- **Tests:** filter alone and with the existing filters, 404 for an unknown id, 403 without permission.

```
/ticket "Server-side CSV export of the audit log" P3
```
- **Why:** admin-pan removed its client-side CSV export (owner, PAN-016). A filtered export should come from the API.
- **Suggested shape:** `GET /api/v1/audit-logs/export?…same filters…`, returning `text/csv` with a row cap. It needs `admin:audit:read`, or a new `admin:audit:export`, and should write an audit entry.
- **No PII beyond the list:** keep the same `user_agent` stripping.

---

## 4. Contract and OpenAPI accuracy

```
/ticket "Declare 404/409 responses and admin:* requirements in OpenAPI" P2
```
- **Why:** admin-pan generates its types from `/openapi.json`. Today several real responses are missing:
  - 404 on the organizations, entitlements, app-credentials and join-requests routes.
  - 409 on routes that use `_with_409`: POST/PATCH apps, permission PATCH, role PUT, assignment DELETE, and the entitlement grant.
  - The `admin:*` requirement on `POST /api/v1/apps/{key}/credentials` (only in prose today). Something machine-readable would help, e.g. `x-requires-super: true`.
- **Reason code:** a distinct reason for "app key already taken" on POST /apps, so the UI can map it to the key field without parsing the message.

```
/ticket "Optimistic concurrency (ETag / If-Match) on PATCH for organizations and entitlements" P3
```
- **Why:** PATCH on an entitlement replaces `limits` as a whole, so two staff editing at once silently overwrite each other. The same applies to organization edits.
- **Shape:**
  - Return an `ETag` (e.g. based on `updated_at`) on GET and PATCH.
  - Accept `If-Match` on PATCH and return 412 on a mismatch.
  - Keep it optional at first so existing clients still work.

---

## 5. Entitlements

```
/ticket "Grant admin:entitlements:* to a staff role" P2
```
- **Why:** ADM-006 seeded `admin:entitlements:read` and `admin:entitlements:write` but granted them to no role, so only `admin:*` holders can use the admin-pan entitlements tab (PAN-019).
- **Proposal:** add them to the appropriate staff role(s) in a migration, or document the intended role. This is the owner's call; ask before seeding.
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
- **Approve response:** say whether a role was actually granted (e.g. `granted_role_key: string | null`). Today approve on an existing member returns 200 with nothing granted, and the UI cannot tell.
- **`decided_by`:** return a display value (name or masked email) next to the UUID, so the UI need not resolve users.
- **Reject cooldown:** expose its length (e.g. on app detail) and/or give staff a way to clear it for one user.
- **Pending count per app:** for a badge, either on `AppRead` or a cheap `GET …/join-requests/count`. A cross-app "pending inbox" endpoint is optional.
- **Optional reject reason:** stored and audited, and shown to the user if the product wants that.
- **Expiry or auto-cancel** for stale pending requests (from the USR-03g security-review follow-ups).
- **Consistent paging:** `items` and `total` come from two separate statements. A decision made between them can return `{items: [], total: 21}`. Read both in one snapshot (e.g. a REPEATABLE READ transaction, or a window count).
- **Self-approval policy:** a staff member with `admin:roles:assign` can approve their own request on a non-admin app. Decide whether to keep it (and maybe flag it in the audit row) or block it.

---

## 8. Reports

- ADM-017 (operational reports) is BLOCKED on the owner. admin-pan PAN-021 waits on it. No new request; listed for completeness.
