# PAN-012c: Retire the forgot-password page on admin (ADM-002d)

| Field | Value |
|---|---|
| State | DONE |
| Priority | P2 |
| Areas | auth, ui, security |
| Attempts | 0 |
| Created | 2026-11-16 |
| PR | https://github.com/mmlabs-online/admin-pan/pull/13 |

## Goal
org-admin-api ADM-002d refuses `POST /auth/password/forgot` with `X-MM-App: admin` (403 `origin_not_allowed`), so the `/forgot-password` page shipped in PAN-012 always fails on the real API. Retire it, or replace it with a text notice, and fix the copy that points to it.

## Spec reference
`docs/spec-v1.md` §5.1. Update the list of public pages.

## Depends on
PAN-010, which removes the sign-in form's "Forgot password?" link.

## Acceptance criteria
- [ ] The `/forgot-password` route shows a text notice: "reset your password from any mmlabs app you use". It has no form and makes no API call.
- [ ] `forgotPassword()` is removed from `src/api/public-auth.ts`, along with its tests.
- [ ] The PAN-012b copy "Sign in to request a new one" (verify-email expired or invalid) is corrected.
- [ ] `/reset-password` and `/verify-email` stay as they are. Links already sent may still point to them.
- [ ] Spec §5.1 is updated.

## Notes / answers from owner
- 2026-11-16 (owner): handle this in a separate ticket after PAN-010. Use text only, with no link to a specific app.

## Owner answers (2026-11-17)
- **R3 in CLAUDE.md:** leave it unchanged. Do not edit CLAUDE.md in this ticket. Record narrowing the R3 exception as a follow-up.
- **Reset-password links:** rename the two links on the reset-password page that point to `/forgot-password` ("Request a new link", "Forgot password") to "How to reset your password". They keep pointing to the notice. Update their tests. This is a small, owner-approved change to AC4 ("stay as they are"); the behaviour of `/reset-password` itself does not change.
- **Notice fallback line:** add, as text only with no link: "If you don't use any other mmlabs app, contact an administrator."

## Orchestrator notes (2026-11-17)
- **Still refused.** Checked against org-admin-api origin/main b87f200: `POST /auth/password/forgot` with `X-MM-App: admin` is still refused with 403 `origin_not_allowed` (`app/modules/auth/deps.py` `get_mail_link_app_context`, used by signup and forgot). USR-12 re-allowed only verify-email resend for `admin`.
- **PAN-012b copy.** The verify-email page says "Sign in to request a new one". Since USR-12, signing in and using "Send the link again" on the email-unverified gate page is real (PAN-010b adds that button). Decide the corrected copy with that in mind. It must not promise a resend button before PAN-010b lands.
- **Dependency.** PAN-010 is DONE.
