# BUG-001: Session revoke copy says admin tokens stay valid up to 12 h (wrong since org-admin-api USR-14)

| Field | Value |
|---|---|
| Type | bug |
| State | DONE |
| Severity | S2 |
| Priority | P1 |
| Areas | ui, auth |
| Found in | main b406001 (real API; contract change from org-admin-api USR-14) |
| Introduced in | PAN-017 (c4e0365); became wrong when org-admin-api USR-14 merged |
| Attempts | 1 |
| Created | 2026-11-18 |
| Record PR | — |
| PR | — |

## Report
Owner, 2026-11-18: "merge rồi sửa bug PAN-017" — after the PAN-020 security review flagged that the PAN-017 session-revoke copy no longer matches the API.

## Environment
- Where: any (users detail sheet → Sessions tab, revoke-one / revoke-all dialogs and the section note) · API: real org-admin-api at c7b86dd or later
- Signed-in permissions: `admin:*` (the Sessions tab requires it)

## Steps to reproduce
1. As an `admin:*` holder, open Users → a user → Sessions.
2. Read the section note, then open "Revoke" and "Revoke all".

## Expected
- The copy matches the API contract (org-admin-api `app/modules/users/router.py:65-73`, `_REVOKE_LIMITS`, shipped in USR-14 and present in the regenerated snapshot descriptions):
  - revoking stops new access tokens;
  - it **ends the user's admin (`aud=admin`) tokens bound to those sessions on their next admin request**;
  - tokens of **other apps** stay valid until they expire, up to 12 hours;
  - it is not a password change; to lock the account, disable it.

## Actual
- `src/features/users/data/sessions.ts:4-11` says tokens already issued stay valid for up to 12 hours "so apps already open there (including this admin app) can keep working" (revoke-one), "open apps can keep working" (revoke-all) and "tokens already issued stay valid for up to 12 hours" (note). Staff misjudge the effect of a security action (R9 confirmation text misleads).

## Root cause
**Confirmed** by reading: the copy constants in `src/features/users/data/sessions.ts:4-11` were written for the pre-USR-14 contract. org-admin-api USR-14 (merged after PAN-017's snapshot at 26b27be) added the `sid` claim so admin tokens end on the next admin request after logout, password reset or staff session revoke. The regenerated snapshot (`src/api/openapi.json`, sessions routes) already carries the new description. Cause is in this repo (stale copy); the API is correct.

## Depends on
None (org-admin-api USR-14 is DONE and merged).

## Scope
- Fix the three copy constants and the tests that pin them; nothing else (R7).

## Out of scope
- The users status (disable) dialog copy that overclaims "signed out of every mmlabs app" (separate follow-up).
- Any change to session list/revoke behaviour, the join-request `cancelled` status, or a 401-after-self-revoke flow (self-revoke is refused by the API).

## Acceptance criteria
- [ ] A regression test reproduces the bug: it fails on `origin/main` before the fix and passes after (e.g. `sessions.test.ts` asserting the copy says admin-app access ends on the next admin request and that only other apps' tokens last up to 12 hours, and no longer claims "including this admin app").
- [ ] The section note, revoke-one and revoke-all copy state: no new tokens; admin-app access ends on the next admin request; other apps' tokens up to 12 h; not a password change; disable to lock. The existing guard against "signed out", "immediately" and "logged out" is kept or adjusted only as far as the new contract requires (the admin app ends on the *next request*, not immediately).
- [ ] All checks pass (R8).

## Technical notes
- Files: `src/features/users/data/sessions.ts`, `src/features/users/data/sessions.test.ts`, `src/features/users/components/user-sessions-tab.test.tsx` (~:228, :378 pin the old text).
- Test level: Vitest browser mode next to the code.

## Notes / answers from owner
- 2026-11-18: owner asked to fix it now (option C).
