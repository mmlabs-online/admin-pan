# PAN-008: Audit log viewer with mock data

| Field | Value |
|---|---|
| State | DONE |
| Priority | P2 |
| Areas | ui |
| Attempts | 1 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Read-only audit log: newest first, filters by actor, action, target, app and date range, detail sheet with before/after, on mock data shaped like org-admin-api ADM-004.

## Spec reference
`docs/spec-v1.md` §5.5

## Depends on
PAN-001

## Acceptance criteria
- [x] Filters for actor, action, target type, app, date range
- [x] Detail sheet shows before/after as text (R6)
- [x] No mutation actions
- [x] Tests for list order, filters and detail

## Notes / answers from owner
- Implemented directly at the owner's request on 2026-11-11 ("dựng khung UI … chưa cần integrate API", template satnaing/shadcn-admin), outside `/run`: no plan.md / review.md. Checks at commit: see the PR.
