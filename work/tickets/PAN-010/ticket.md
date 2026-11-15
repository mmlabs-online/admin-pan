# PAN-010: Sign-in with @mmlabs/auth-client, account switch, logout and route guard

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Areas | architecture, auth, security, api, ui |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Replace the mock sign-in: login via `@mmlabs/auth-client` with app key `admin`, in-memory `aud=admin` token, account picker/switch, logout (one/all), and the auth guard on every route except the auth pages.

## Spec reference
`docs/spec-v1.md` §5.1

## Depends on
PAN-009; org-admin-api USR-03, USR-03b, USR-03c, ADM-002c (all done 2026-11-15) and **USR-08** (`@mmlabs/auth-client`, separate repo — not started)

## Acceptance criteria
- [ ] Sign-in posts through auth-client only; no password handling elsewhere (R3)
- [ ] Token in memory only; reload restores the session through the device cookie
- [ ] `not_member` and `email_unverified` errors have clear pages
- [ ] Every authenticated route is behind the guard; redirect back after sign-in (no open redirect)
- [ ] "Email not verified" page: resend verification (`POST /auth/verify-email/resend`, cookie class, 409/429 limits) and refresh the token after verify (moved from PAN-012, owner 2026-11-15)
- [ ] Tests for guard, error states and logout

## Notes / answers from owner
- 2026-11-15 (owner): wait for the API team's `@mmlabs/auth-client` (org-admin-api USR-08); no interim hand-written auth module. R3 stays as written.
- 2026-11-15 (owner, via PAN-012 Q2): resend-verification and the post-verify `/token` refresh belong here.
- From PAN-009/PAN-012 security reviews: drop the hash from the 401 `redirect` value (`src/main.tsx`); validate `redirect` on the sign-in page (same-origin relative path only).
