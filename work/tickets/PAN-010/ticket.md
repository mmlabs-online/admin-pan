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
PAN-009; org-admin-api USR-03, USR-03b

## Acceptance criteria
- [ ] Sign-in posts through auth-client only; no password handling elsewhere (R3)
- [ ] Token in memory only; reload restores the session through the device cookie
- [ ] `not_member` and `email_unverified` errors have clear pages
- [ ] Every authenticated route is behind the guard; redirect back after sign-in (no open redirect)
- [ ] Tests for guard, error states and logout

## Notes / answers from owner
None yet.
