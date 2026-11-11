# PAN-015: Apps, permissions, roles and assignments on the real API

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Areas | api, ui, auth |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Replace apps/roles mock data with the USR-02 admin endpoints (apps registry, permissions, roles, role assignments).

## Spec reference
`docs/spec-v1.md` §5.4

## Depends on
PAN-005, PAN-006, PAN-011; org-admin-api USR-02

## Acceptance criteria
- [ ] Every screen action maps to a USR-02 endpoint (missing ones become org-admin-api follow-ups)
- [ ] Revoke/assign with confirmation and query invalidation
- [ ] States tested with MSW

## Notes / answers from owner
None yet.
