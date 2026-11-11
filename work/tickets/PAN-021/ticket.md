# PAN-021: Reports on the real API

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P3 |
| Areas | api, ui |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Replace reports mock data with an org-admin-api reports API (define, run, download).

## Spec reference
`docs/spec-v1.md` §5.7

## Depends on
PAN-007, PAN-011; org-admin-api reports API (gap)

## Acceptance criteria
- [ ] Report CRUD, run and download through the API
- [ ] Downloads never put tokens in URLs (R5)
- [ ] States tested

## Notes / answers from owner
- Needs owner confirmation of the reports scope (spec §8 Q7) and an org-admin-api ticket.
- Proposed data shape for the org-admin-api reports API is in PAN-007's mock (`src/features/reports/data/schema.ts`).
