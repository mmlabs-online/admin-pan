# PAN-017: User sessions: list and revoke

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Areas | api, ui, security |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
In user detail, list the user's device/account sessions and revoke one or all, with confirmation.

## Spec reference
`docs/spec-v1.md` §5.4

## Depends on
PAN-013; org-admin-api endpoint for admin session revoke (identity-architecture §4, not ticketed yet)

## Acceptance criteria
- [ ] Sessions list (created, last seen, user agent, IP)
- [ ] Revoke one / all with confirmation
- [ ] States tested

## Notes / answers from owner
- Needs an org-admin-api ticket for the admin sessions endpoints first.
