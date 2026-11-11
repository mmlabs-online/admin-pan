# PAN-012: Forgot password, reset password and verify-email pages

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Areas | auth, ui, security |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Wire the auth pages to org-admin-api: forgot (always 202), reset with token, verify email and resend, with Turnstile where required.

## Spec reference
`docs/spec-v1.md` §5.1

## Depends on
PAN-009; org-admin-api USR-04

## Acceptance criteria
- [ ] Forgot shows the same message for any email
- [ ] Reset validates password and handles expired/used tokens
- [ ] Verify-email handles success, expired and resend limits
- [ ] Tests for each state

## Notes / answers from owner
None yet.
