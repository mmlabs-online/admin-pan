# PAN-010b: Resend verification email from the admin UI

| Field | Value |
|---|---|
| State | REWORK |
| Priority | P2 |
| Areas | auth, ui, security |
| Attempts | 1 |
| Created | 2026-11-16 |
| PR | — |

## Goal
Add a "Send the link again" action to the "Email not verified" page that PAN-010 builds. It calls the library's `resendVerification()` (cookie class) and handles `sent`, `already_verified`, 409 and 429.

## Spec reference
`docs/spec-v1.md` §5.1. Resend was moved here from PAN-010 on 2026-11-16.

## Depends on
- PAN-010.
- org-admin-api USR-12 (allow verify-email resend for the admin app). DONE and merged as of 2026-11-16 (origin/main a417ddb).

## Acceptance criteria
- [ ] The resend button uses `@mmlabs/auth-client` `resendVerification()` only (R3).
- [ ] `sent` shows a neutral "check your email" message. `already_verified` refreshes the token and continues.
- [ ] 409 and 429 (1/min, 5/day) show clear messages. While rate-limited, the button is disabled and a countdown shows the wait.
- [ ] Tests cover each outcome.

## Notes / answers from owner
- 2026-11-16 (owner): on the ADM-002d conflict, wait for the API to allow resend for `admin`. Do not fake it, and do not send another app's `X-MM-App`.

## Orchestrator notes (2026-11-17)
- **Dependencies.** PAN-010 is DONE. org-admin-api USR-12 is DONE and merged (origin/main b87f200). `get_resend_link_origin` accepts `admin`, so links land on `https://admin-portal.mmlabs.online/verify-email`.
- **Library.** `@mmlabs/auth-client` ts-v0.1.0 `resendVerification(accountId?)` (`client.ts:226`) has no client-side block for `admin`. Its README line 253 ("admin cannot … resend-verification") is out of date since USR-12.
- **Copy alignment (from PAN-012c).** When the button lands, update together:
  - the email-unverified gate page (`src/features/auth/gate/access-pages.tsx`), which says "request it from any mmlabs app you use";
  - the two verify-email strings (`src/features/auth/verify-email/components/verify-email-panel.tsx`, invalid and expired), which say "request a new link from any mmlabs app you use, then sign in".
- **A11y.** Apply the lessons from PAN-013/PAN-011: use `aria-disabled` rather than native `disabled` for the pending and rate-limited button, and announce the result. The shared ConfirmDialog fix belongs to PAN-014; this ticket does not need ConfirmDialog.
