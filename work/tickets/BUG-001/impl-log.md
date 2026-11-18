
## Attempt 1 — 2026-11-18

### Files touched
| File | Required because |
|---|---|
| src/features/users/data/sessions.test.ts | Regression test (AC1, AC2) |
| src/features/users/components/user-sessions-tab.test.tsx | Dialog assertions `next admin request` (revoke one, revoke all) |
| src/features/users/data/sessions.ts | Root cause: stale copy replaced with plan's target copy |

### Regression test: before fix (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test src/features/users`, unfixed sessions.ts)
- Test Files 2 failed | 6 passed; Tests 3 failed | 86 passed
- FAIL sessions.test.ts > revoke copy > admin-app access ends on the next admin request; ... : `AssertionError: expected 'IP and browser are recorded when the …' to contain 'next admin request'`
- FAIL user-sessions-tab.test.tsx > revoke one: confirm names email ... (dialog lacks `next admin request`, timeout)
- FAIL user-sessions-tab.test.tsx > revoke all: confirm names the email ... (same)

### After fix (same command)
- Test Files 8 passed (8); Tests 89 passed (89)

### Tests added / changed
- sessions.test.ts › revoke copy (renamed, extended to all three constants incl. stale-phrase negatives)
- user-sessions-tab.test.tsx › revoke one / revoke all dialog tests: added `next admin request`

### Checks (actual output summary)
- pnpm typecheck: pass (tsc -b, no errors)
- pnpm lint: pass
- pnpm format:check: pass
- pnpm test: 97 files, 740 tests passed
- pnpm build: built OK
- pnpm e2e: 28 passed

### Out-of-plan files
None

### Follow-ups (noticed, not done)
- users-status-dialog.tsx:69 "signed out of every mmlabs app" overclaims for other apps' tokens (pinned by users-status-dialog.test.tsx:88); ticket lists as out of scope.
- org-admin-api: "12 hours" is hard-coded; consider exposing the access-token TTL.

### Scope self-check
- Could the diff be smaller? No (copy text is verbatim from the plan)
- Diff size: 3 files, copy + test assertions only
