# PAN-011: Permission-aware UI and 403 handling

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P1 |
| Areas | auth, ui, security |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
`usePermission()` from the token's roles; navigation, routes and actions declare and check their `admin:*` permission; API 403 shows a clear message.

## Spec reference
`docs/spec-v1.md` §5.1; CLAUDE.md R4

## Depends on
PAN-010; org-admin-api ADM-002, USR-02

## Acceptance criteria
- [ ] Each route and action declares its permission (same as the API endpoint)
- [ ] Hidden/disabled controls without permission; API 403 still handled
- [ ] Tests for allowed / denied cases

## Notes / answers from owner
None yet.

## Orchestrator notes (2026-11-16)
These facts were checked against org-admin-api `origin/main` 35c8825.
- The `aud=admin` access token carries `roles` as a list of role **keys**, not permissions (`app/modules/tokens/service.py:92`). Permissions are resolved on the server for each request (`require_permission`, `app/modules/admin_auth/deps.py:100`).
- The role catalog for app `admin` is refused (D17, ADR-0008). There is no endpoint that returns the caller's effective admin permissions.
- `@mmlabs/auth-client` does not expose the token value or its claims (PAN-010, ADR 0003). The UI must never decode the JWT (security reviews of PAN-010).
- So the goal's phrase "`usePermission()` from the token's roles" has no data source today. The consults and the planner must decide how PAN-011 can mirror permissions (R4), or whether it needs an org-admin-api endpoint first.
