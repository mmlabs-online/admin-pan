# Review — BUG-001

## Attempt 1 — 2026-11-18
Verdict: PASS

### Checks (run by reviewer)
- pnpm typecheck: pass (tsc -b, no errors)
- pnpm lint: pass (eslint exit 0)
- pnpm format:check: pass ("All matched files use Prettier code style!")
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): Test Files 97 passed (97), Tests 740 passed (740). Matches impl-log.
- pnpm build: pass ("built in 1.13s")
- pnpm e2e (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): 28 passed. Matches impl-log.

### Regression evidence (ADR 0003), reproduced by reviewer
- Replaced `src/features/users/data/sessions.ts` with `git show origin/main:src/features/users/data/sessions.ts`, then ran `pnpm test src/features/users`:
  - Test Files 2 failed | 6 passed (8); Tests 3 failed | 86 passed (89)
  - FAIL `sessions.test.ts > revoke copy > admin-app access ends on the next admin request; …` — `AssertionError: expected 'IP and browser are recorded when the …' to contain 'next admin request'`
  - FAIL `user-sessions-tab.test.tsx > UserSessionsTab > revoke one: confirm names email …` (dialog lacks `next admin request`)
  - FAIL `user-sessions-tab.test.tsx > UserSessionsTab > revoke all: confirm names the email …` (same)
- Restored with `git checkout -- src/features/users/data/sessions.ts`; `git diff --quiet` succeeded (tree clean). With the fix the same suite is 89/89 green (part of the full run above).

### Acceptance criteria
- [x] A regression test reproduces the bug: it fails on origin/main and passes after the fix — evidence: `src/features/users/data/sessions.test.ts:43-56` plus `src/features/users/components/user-sessions-tab.test.tsx:229` and `:380`; red/green run reproduced above.
- [x] Section note, revoke-one and revoke-all state the five points; the `signed out|immediately|logged out` guard is kept — evidence: `src/features/users/data/sessions.ts:5-12`; each of the three constants says "new access tokens", "next admin request", "other apps … up to 12 hours", "not a password change", "disable it". The guard regex is kept verbatim at `sessions.test.ts:54`, now also applied to `SESSIONS_NOTE`. Stale phrases ("including this admin app", "open apps can keep working", "new access tokens only") are forbidden at `sessions.test.ts:51-53`.
  - Cross-check against org-admin-api c7b86dd (read-only):
    - `app/modules/users/router.py:65-73` `_REVOKE_LIMITS`: no new tokens; admin (`aud=admin`) tokens bound to those sessions end on the next admin request; other apps' tokens valid until `exp` (12 h + 30 s leeway); does not stop a new password sign-in. The new copy matches; leaving out the leeway was a caller decision recorded in the plan.
    - `app/modules/admin_auth/deps.py:80-87`: `sid` claim checked per request (`_deny("sid"/"session")`), so "on the next admin request" is accurate and "immediately" would overclaim.
    - `app/modules/sessions/repository.py:108` (revoke-all: "Device sessions stay: they may carry other users' accounts"), `:152` (revoke-one: "the device session is untouched"), `:219-230` (`is_account_active` checks account and device revocation). This backs "Other accounts on that browser are not affected" and "Other accounts on the same browsers stay signed in".
- [x] All checks pass (R8) — evidence: Checks above.

### Scope
- Changed source files: `src/features/users/data/sessions.ts`, `src/features/users/data/sessions.test.ts`, `src/features/users/components/user-sessions-tab.test.tsx`. All are in the plan's file list. The other changes are workflow files only: `work/backlog.md` row, and `work/tickets/BUG-001/*`. No out-of-plan source changes.

### Issues
None.

### Rules R1–R11
No violations found.
- R1: the copy mirrors the API contract and adds no behaviour.
- R6: the copy is still plain strings, rendered as text.
- R7: copy and tests only.
- R8: the copy is pinned by unit and rendered tests.
- R9: the confirmation text now describes the real effect.

### Security / a11y blockers
None. No security-review.md or a11y-review.md is present in the ticket folder.

### Nits (do not block)
- The test titles at `user-sessions-tab.test.tsx:214` and `:367` still say "states the 12-hour limit" without mentioning the next admin request. The plan made renaming them optional.
- The ticket and backlog still show `Attempts 0`. This is orchestrator bookkeeping.

### Follow-ups (out of scope)
- `users-status-dialog.tsx:69` "signed out of every mmlabs app" overclaims for other apps' tokens (pinned by `users-status-dialog.test.tsx:88`); the ticket already lists this as out of scope.
- org-admin-api: "12 hours" is hard-coded in the UI while `ACCESS_TOKEN_TTL_SECONDS` is API config; consider exposing the TTL.
