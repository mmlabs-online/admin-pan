# PAN-003: Users management with mock data

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Areas | ui |
| Attempts | 1 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Users list (email search, status filter, pagination), detail sheet and enable/disable with confirmation, on mock data shaped like `UserRead`.

## Spec reference
`docs/spec-v1.md` §5.2

## Depends on
PAN-001

## Acceptance criteria
- [x] Columns and filters match `GET /api/v1/users` (email, status)
- [x] Detail sheet shows all `UserRead` fields
- [x] Enable/disable asks for confirmation naming the user (R9)
- [x] No create/delete (not in the API)
- [x] Tests for list, filter and confirm/cancel

## Notes / answers from owner
- Implemented directly at the owner's request on 2026-11-11 ("dựng khung UI … chưa cần integrate API", template satnaing/shadcn-admin), outside `/run`: no plan.md / review.md. Checks at commit: see the PR.
