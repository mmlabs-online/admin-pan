# PAN-014: Organizations screen on the real API

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Areas | api, ui |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Replace Organizations mock data with `/api/v1/organizations` CRUD; 409 on duplicate slug shown on the field.

## Spec reference
`docs/spec-v1.md` §5.3

## Depends on
PAN-004, PAN-011; org-admin-api ADM-001 (USR-06 for created_by)

## Acceptance criteria
- [ ] Server-side pagination and filters (as the API supports)
- [ ] Create/edit/suspend/delete call the API with confirmation where destructive
- [ ] 409 conflict mapped to the slug field
- [ ] States tested with MSW

## Notes / answers from owner
None yet.
