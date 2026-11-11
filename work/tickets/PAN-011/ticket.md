# PAN-011: Permission-aware UI and 403 handling

| Field | Value |
|---|---|
| State | BACKLOG |
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
