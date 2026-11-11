# PAN-006: Roles and role assignments with mock data

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Areas | ui, ux |
| Attempts | 1 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Roles across apps: list, create/edit with the app's permissions, delete (not system roles), and assignments (assign / revoke) per role, on mock data.

## Spec reference
`docs/spec-v1.md` §5.4

## Depends on
PAN-005

## Acceptance criteria
- [x] Permission picker only offers the selected app's permissions
- [x] System roles cannot be deleted
- [x] Revoke asks for confirmation naming user and role
- [x] Tests for list, filter, validation and confirm/cancel

## Notes / answers from owner
- Implemented directly at the owner's request on 2026-11-11 ("dựng khung UI … chưa cần integrate API", template satnaing/shadcn-admin), outside `/run`: no plan.md / review.md. Checks at commit: see the PR.
