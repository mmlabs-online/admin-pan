# PAN-012b: Verify-email page

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P2 |
| Areas | auth, ui, security |
| Attempts | 0 |
| Created | 2026-11-15 |
| PR | — |

## Goal
Public `/verify-email` page that reads the token from the email link and confirms the address with org-admin-api, split from PAN-012.

## Spec reference
`docs/spec-v1.md` §5.1 (public pages, owner 2026-11-15)

## Depends on
PAN-012 (fragment-token helper, retry-after formatter, public auth client); org-admin-api USR-04 (done)

## Acceptance criteria
- [ ] Route `/verify-email` reads the token from the URL fragment only, validates it, and strips it from the URL
- [ ] An explicit "Confirm my email" button sends one `POST /api/v1/auth/verify-email`
- [ ] States: invalid link, verifying, success (link to `/sign-in`), `token_invalid` ("link invalid or expired; sign in to request a new one"), 429 with wait time, network retry
- [ ] Tests for each state

## Notes / answers from owner
- 2026-11-15: split from PAN-012 (planner split proposal; owner Q2 moved resend to PAN-010).
