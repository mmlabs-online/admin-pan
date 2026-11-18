# PAN-015c: Role assignments (assign, revoke, holders of a role) on the real API

| Field | Value |
|---|---|
| State | REVIEW |
| Priority | P1 |
| Areas | api, ui, auth, security |
| Attempts | 1 |
| Created | 2026-11-17 |
| PR | — |

## Goal
Make role assignments work on the real API in two places:
- **User detail sheet:** assign and revoke roles. The sheet already lists them read-only since PAN-013.
- **Roles screen:** keep the per-role "Assignments" sheet (who holds this role), backed by a new API endpoint.

Split from PAN-015 (owner, 2026-11-17).

## Spec reference
`docs/spec-v1.md` §5.4

## Depends on
- PAN-015b (DONE, merged in #27): role ids from `GET /apps/{key}/role-definitions`.
- org-admin-api USR-16 (DONE, merged): staff role listing with ids.
- org-admin-api USR-17 (DONE, merged): `GET /apps/{key}/role-definitions/{role_id}/assignments` (holders of a role, `admin:users:read`).

## Acceptance criteria
- [ ] Assign picks the user explicitly from the `GET /users?email=` results (never auto-picks the first match), picks the role, optionally the org (only when the app's `org_mode` is not `none`), and optionally an expiry. The expiry is sent as an ISO timestamp with an offset.
- [ ] Revoke asks for confirmation that names the user, role and scope. It is never optimistic.
- [ ] Errors are mapped by code: 403 `admin_wildcard_required` / `self_assignment_forbidden`, 409 `last_super_admin` / `conflict`, 422 `org_id_not_allowed` / `unknown_org` / `expires_in_past` / `expiry_not_allowed`.
- [ ] After granting or revoking a non-admin app's role, the UI notes that it takes effect in that app within 15 minutes for sessions already signed in. It never claims the change is immediate.
- [ ] The per-role holders sheet uses the new endpoint and has its own loading, empty, error and 403 states.
- [ ] States are tested with the injected-fetch API mock.

## Notes / answers from owner
- 2026-11-17 (owner): keep the per-role holders sheet and ask the API for an endpoint. Assignment is also managed from the user detail sheet.
