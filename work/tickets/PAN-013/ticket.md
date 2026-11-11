# PAN-013: Users screen on the real API

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Areas | api, ui |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Replace Users mock data with `GET /api/v1/users`, `GET/PATCH /api/v1/users/{id}`: server-side pagination and filters, enable/disable mutation with query invalidation.

## Spec reference
`docs/spec-v1.md` §5.2

## Depends on
PAN-003, PAN-011; org-admin-api USR-01b, ADM-002

## Acceptance criteria
- [ ] List uses server-side `limit`/`offset`, `email`, `status`
- [ ] PATCH status with confirmation; errors shown; no optimistic success (R9)
- [ ] Loading / empty / error / 403 states tested with MSW

## Notes / answers from owner
- Follow-up from PAN-003: the `email` filter is kept in the URL (`?email=`); CLAUDE.md R5 says no full emails in URLs — decide whether to keep it out of the URL when wiring the API.
- Follow-up from PAN-003: user detail shows a sample "Apps & roles" preview; replace with real role assignments (USR-02).
