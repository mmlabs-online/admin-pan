# PAN-004: Organizations management with mock data

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Areas | ui |
| Attempts | 1 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Organizations list, create/edit dialog, suspend/reactivate and delete with confirmation, on mock data shaped like `OrganizationRead`.

## Spec reference
`docs/spec-v1.md` §5.3

## Depends on
PAN-001

## Acceptance criteria
- [x] Create/edit form validates name and slug (duplicate slug shows an error)
- [x] Suspend/reactivate and delete ask for confirmation naming the org
- [x] Search and status filter
- [x] Tests for list, filter, validation and confirm/cancel

## Notes / answers from owner
- Implemented directly at the owner's request on 2026-11-11 ("dựng khung UI … chưa cần integrate API", template satnaing/shadcn-admin), outside `/run`: no plan.md / review.md. Checks at commit: see the PR.
