# PAN-012c: Retire the forgot-password page on admin (ADM-002d)

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Areas | auth, ui, security |
| Attempts | 0 |
| Created | 2026-11-16 |
| PR | — |

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
