# PAN-016: Audit log on the real API

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Areas | api, ui |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Replace audit mock data with `GET /api/v1/audit-logs` and its filters; links from users/orgs to their history.

## Spec reference
`docs/spec-v1.md` §5.5

## Depends on
PAN-008, PAN-011; org-admin-api ADM-004

## Acceptance criteria
- [ ] Filters map to API query params; server-side pagination
- [ ] Before/after rendered as text only (R6)
- [ ] Links from user and org detail to their filtered audit log
- [ ] States tested with MSW

## Notes / answers from owner
None yet.
