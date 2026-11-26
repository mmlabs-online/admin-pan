# PAN-032: Access column on the Users list

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Areas | api, ui, a11y |
| Attempts | 0 |
| Created | 2026-11-25 |
| PR | — |

## Goal
Show each user's current access (active role assignments per app, with role keys and scope) in a read-only column on the `/users` list, loaded with the list page itself — never one request per row.

## Spec reference
`docs/spec-v1.md` §5.2.1 (Access per user in the list); §8 Q8.

## Depends on
- PAN-013, PAN-015c (DONE).
- **org-admin-api: not planned yet.** Needs an access summary on `GET /api/v1/users` (e.g. opt-in `include=access` → `access: [{app, roles: [{assignment_id, role_id, role_key, org_id|null, expires_at|null}]}]`, active only, `admin:users:read`). The owner must add this ticket in org-admin-api first (prompt given 2026-11-25); record its ID here.

## Acceptance criteria
- [ ] `/users` requests the list with the access summary and renders an **Access** column: per app, the role keys and scope (app-wide, or "N orgs"); only active assignments (Q8); users without roles show "No roles".
- [ ] One request per list page; the column never calls `GET /users/{id}/role-assignments` per row (asserted in tests by counting requests).
- [ ] Long lists show a few chips plus "+N more", which opens the user's detail sheet (Role assignments tab); a `truncated` flag from the API, if any, is shown the same way.
- [ ] Values are shown as the API returns them (no client-side permission computation); the column is hidden when the caller lacks `admin:users:read`, and a 403 is handled (R4).
- [ ] Accessible: meaning is not conveyed by colour alone, chips have text, the "+N more" control is a labelled button reachable by keyboard (R10).
- [ ] After a role assign/revoke (PAN-015c, PAN-033) the list query is invalidated so the column refreshes.
- [ ] Tests (API mocked at the network layer): column rendering, no-roles, truncation, loading, empty, error, 403; the e2e fake API returns the new field.

## Notes / answers from owner
- 2026-11-25: Q8 — "access" = active role assignments only; expired hidden in the list.
