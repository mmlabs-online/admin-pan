# PAN-033: Adopt an @mmlabs/auth-client whose login() resolves after the provider state is updated

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P3 |
| Areas | auth, security |
| Attempts | 0 |
| Created | 2026-11-27 |
| PR | — |

## Goal
Remove the BUG-003 workaround once the auth library is fixed: `AuthProvider.login` (React wrapper of `@mmlabs/auth-client`) should resolve only after its snapshot reflects the new session, so the sign-in form no longer has to call `reload()` itself.

## Spec reference
`docs/spec-v1.md` §5.1 (login using `@mmlabs/auth-client`); rule R3.

## Depends on
BUG-003; a new release of `@mmlabs/auth-client` (separate library repo, built under org-admin-api USR-08) with the fix — **no ticket there yet**: the owner must raise one in the library repo first. admin-pan does not change the vendored library (`vendor/mmlabs-auth-client-0.1.0.tgz`).

## Acceptance criteria
- [ ] The vendored `@mmlabs/auth-client` is upgraded to the fixed release (tgz in `vendor/`, `SHA256SUMS` and `pnpm-lock.yaml` updated).
- [ ] `user-auth-form.tsx` no longer calls `reload()` after `login()`; a successful sign-in triggers only one `GET /api/v1/auth/accounts`.
- [ ] The BUG-003 regression test and its companion tests still pass without changes to their assertions.
- [ ] No other auth behaviour changes (account switch, logout, AuthGate); all checks pass (R8).

## Notes / answers from owner
- 2026-11-27 (owner): create a ticket for the auth-library follow-up from BUG-003.
- Library request to raise (outside this repo): in the React `AuthProvider`, make `login` await the provider's `reload()` (or return the new status) before resolving. Found in `@mmlabs/auth-client` 0.1.0 (`dist/react/index.js`).
