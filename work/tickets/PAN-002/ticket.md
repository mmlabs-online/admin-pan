# PAN-002: Dashboard with mock data

| Field | Value |
|---|---|
| State | DONE |
| Priority | P2 |
| Areas | ui |
| Attempts | 1 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Dashboard page: KPIs, sign-ups and sign-ins charts, members per app, needs-attention list and recent admin activity, on mock data.

## Spec reference
`docs/spec-v1.md` §5.7

## Depends on
PAN-001

## Acceptance criteria
- [x] KPI cards for users, active orgs, apps and 24 h sign-ins
- [x] Charts have accessible names
- [x] Needs-attention items link to the related pages
- [x] Unit test for KPI formatting and rendering

## Notes / answers from owner
- Implemented directly at the owner's request on 2026-11-11 ("dựng khung UI … chưa cần integrate API", template satnaing/shadcn-admin), outside `/run`: no plan.md / review.md. Checks at commit: see the PR.
