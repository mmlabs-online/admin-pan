# PAN-007: Reports management with mock data

| Field | Value |
|---|---|
| State | DONE |
| Priority | P2 |
| Areas | ui |
| Attempts | 1 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Reports: define, edit, run now, download CSV and delete operational reports, plus an overview tab with charts, on mock data.

## Spec reference
`docs/spec-v1.md` §5.7

## Depends on
PAN-001

## Acceptance criteria
- [x] Report form validates name, type and date range
- [x] Run now moves status running → ready
- [x] Download builds a CSV client-side
- [x] Delete asks for confirmation
- [x] Tests for list, form, run and CSV builder

## Notes / answers from owner
- Implemented directly at the owner's request on 2026-11-11 ("dựng khung UI … chưa cần integrate API", template satnaing/shadcn-admin), outside `/run`: no plan.md / review.md. Checks at commit: see the PR.
- Interpretation of "Reports management" to be confirmed by the owner (spec §8 Q7). org-admin-api has no reports API yet (gap).
