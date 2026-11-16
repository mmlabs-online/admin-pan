# PAN-010b: Resend verification email from the admin UI

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Areas | auth, ui, security |
| Attempts | 0 |
| Created | 2026-11-16 |
| PR | — |

## Goal
Add a "Send the link again" action to the "Email not verified" page that PAN-010 builds. It calls the library's `resendVerification()` (cookie class) and handles `sent`, `already_verified`, 409 and 429.

## Spec reference
`docs/spec-v1.md` §5.1. Resend was moved here from PAN-010 on 2026-11-16.

## Depends on
- PAN-010.
- An org-admin-api ticket (not yet created) that lets `X-MM-App: admin` call `POST /api/v1/auth/verify-email/resend`. Today ADM-002d refuses it with 403 `origin_not_allowed` (`app/modules/auth/deps.py` `get_mail_link_app_context`).

## Acceptance criteria
- [ ] The resend button uses `@mmlabs/auth-client` `resendVerification()` only (R3).
- [ ] `sent` shows a neutral "check your email" message. `already_verified` refreshes the token and continues.
- [ ] 409 and 429 (1/min, 5/day) show clear messages. While rate-limited, the button is disabled and a countdown shows the wait.
- [ ] Tests cover each outcome.

## Notes / answers from owner
- 2026-11-16 (owner): on the ADM-002d conflict, wait for the API to allow resend for `admin`. Do not fake it, and do not send another app's `X-MM-App`.
