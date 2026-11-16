# PAN-010: Sign-in with @mmlabs/auth-client, account switch, logout and route guard

| Field | Value |
|---|---|
| State | IN_PROGRESS |
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
PAN-009; org-admin-api USR-03, USR-03b, USR-03c, ADM-002c (all done 2026-11-15) and USR-08 (`@mmlabs/auth-client`, repo `mmlabs-online/mmlabs-auth`, tag `ts-v0.1.0`) — all DONE and merged on org-admin-api `main` (checked 2026-11-16); ADM-012 (non-credentialed CORS for Bearer admin endpoints) DONE too

## Acceptance criteria
- [ ] Sign-in posts through auth-client only; no password handling elsewhere (R3)
- [ ] Token in memory only; reload restores the session through the device cookie
- [ ] `not_member` and `email_unverified` errors have clear pages
- [ ] Every authenticated route is behind the guard; redirect back after sign-in (no open redirect)
- [ ] "Email not verified" page: explains that the email must be verified from any mmlabs app the user uses (text only, no link to a specific app), and has an "I've verified, continue" action that refreshes the token (`getToken({forceRefresh:true})`), plus switch account and sign out. The resend button moved to PAN-010b (owner, 2026-11-16).
- [ ] Sign-in form has no "Forgot password?" link to `/forgot-password`. Instead, one line of text says to reset the password from any mmlabs app. The page itself is handled in PAN-012c.
- [ ] Tests for guard, error states and logout

## Notes / answers from owner
- 2026-11-15 (owner): wait for the API team's `@mmlabs/auth-client` (org-admin-api USR-08); no interim hand-written auth module. R3 stays as written.
- 2026-11-15 (owner, via PAN-012 Q2): resend-verification and the post-verify `/token` refresh belong here.
- From PAN-009/PAN-012 security reviews: drop the hash from the 401 `redirect` value (`src/main.tsx`); validate `redirect` on the sign-in page (same-origin relative path only).
- 2026-11-16 (owner): reaffirmed — keep waiting for `@mmlabs/auth-client` (USR-08); no hand-written client like tudocuatui's.
- 2026-11-16 (owner): org-admin-api reports USR-08 and ADM-012 done; admin-pan can sign in, pick an account, get an `aud=admin` token and log out via `@mmlabs/auth-client` `ts-v0.1.0`, and call the existing admin APIs with Bearer. Ticket unblocked.
- 2026-11-16 (owner), answers on the consult open questions:
  - **Resend vs ADM-002d.** Wait for the API to allow resend for `admin`. The resend button moves to **PAN-010b**, which depends on a future org-admin-api ticket. PAN-010 builds the unverified page without resend.
  - **Forgot password.** Remove the "Forgot password?" link from the sign-in form in PAN-010. Retiring `/forgot-password` and fixing the PAN-012b copy go to **PAN-012c**.
  - **Wording.** The unverified page and the reset hint use text only ("any mmlabs app you use"), with no link to a specific app.
  - **No mock sign-in.** It is acceptable that signing in always needs a real or local org-admin-api from now on. Screen data stays on mock until the per-screen tickets.
- Library artifact: `mmlabs-auth-client-0.1.0.tgz`, downloaded by the orchestrator from the `ts-v0.1.0` release on 2026-11-16, has SHA-256 `f1303c170f5e2799f1d6cecd8c4684cf1ab20c8ef84d441bd75002f46b6108f2`. This was computed locally. The release notes could not be read from this session (GitHub API access to mmlabs-auth is not attached), so the owner must confirm the hash against the release page before merge.
