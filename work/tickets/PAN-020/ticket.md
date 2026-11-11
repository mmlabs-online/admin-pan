# PAN-020: Dashboard stats on the real API

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P3 |
| Areas | api, ui |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Replace dashboard mock stats with an org-admin-api stats endpoint.

## Spec reference
`docs/spec-v1.md` §5.7

## Depends on
PAN-002, PAN-011; org-admin-api stats endpoint (gap)

## Acceptance criteria
- [ ] KPIs, charts and attention counts come from the API
- [ ] States tested

## Notes / answers from owner
- org-admin-api has no stats endpoint yet: propose a ticket there.
