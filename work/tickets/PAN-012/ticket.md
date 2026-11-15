# PAN-012: Forgot password and reset password pages

| Field | Value |
|---|---|
| State | DONE |
| Priority | P2 |
| Areas | auth, ui, security |
| Attempts | 1 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Wire the auth pages to org-admin-api: forgot (always 202), reset with token, verify email and resend, with Turnstile where required.

## Spec reference
`docs/spec-v1.md` §5.1

## Depends on
PAN-009; org-admin-api USR-04, USR-04b (done)

## Acceptance criteria
- [x] Forgot shows the same message for any email
- [x] Reset validates password and handles expired/used tokens
- [ ] ~~Verify-email handles success, expired and resend limits~~ → moved: verify-email to PAN-012b, resend to PAN-010 (owner 2026-11-15)
- [x] Tests for each state

## Notes / answers from owner
- 2026-11-15 (owner, answers to plan.md blocking questions):
  - Q1 = Yes: amend R3 — sign-in, sign-up, sessions and tokens only through `@mmlabs/auth-client`; the token-credential public flows (forgot, reset, verify-email) may call the API through `src/api/` with `credentials: 'omit'`. Follow-up for org-admin-api USR-08 to absorb them later.
  - Q2 = Yes: resend-verification (and its limits) and the post-verify `/token` refresh move to PAN-010.
  - Q3 = Yes: add these pages to spec §5.1.
- 2026-11-15 (orchestrator): per the planner's split, this ticket covers forgot + reset; the verify-email page is **PAN-012b**. AC3 moves there.
