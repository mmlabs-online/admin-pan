# PAN-005: Apps management with mock data

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Areas | ui, ux |
| Attempts | 1 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Apps registry: list, register/edit (join policy, org mode, origins), enable/disable, and a detail sheet with permissions and roles, on mock data shaped like org-admin-api `apps`.

## Spec reference
`docs/spec-v1.md` §5.4

## Depends on
PAN-001

## Acceptance criteria
- [x] Register/edit validates key and origins (`https://…`)
- [x] Disable asks for confirmation
- [x] Detail sheet lists permissions (with is_admin) and roles (default role marked)
- [x] Tests for list, filter, validation and confirm/cancel

## Notes / answers from owner
- Implemented directly at the owner's request on 2026-11-11 ("dựng khung UI … chưa cần integrate API", template satnaing/shadcn-admin), outside `/run`: no plan.md / review.md. Checks at commit: see the PR.
