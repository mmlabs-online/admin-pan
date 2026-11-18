# BUG-001 security review

## Attempt 1

**Verdict: the committed copy (`d13dabd`) is accurate against org-admin-api c7b86dd — no over- or under-claim — and the regression test is sound.**

### Findings
- 🔴 (transient, resolved) The auditor saw `src/features/users/data/sessions.ts` reverted to the pre-fix copy in the working tree. Orchestrator note: this was the reviewer's deliberate "fails before the fix" check running at the same time (the reviewer copied the origin/main file in, ran the tests, then restored it with `git checkout`). After the reviewer finished, `git diff --quiet HEAD -- src` was clean and the file contains the fixed copy; nothing stale was committed.
- 💭 Committed copy matches the API:
  - "Can't get new access tokens" — `revoke_account_of_user` / `revoke_all_accounts_of_user_ids` (`app/modules/sessions/repository.py:151-175`) set `AccountSession.revoked_at`, so `/auth/token` → 401 `session_invalid`.
  - Admin-app access ends on the next admin request — `tokens/service.py:121-122` adds `sid` to admin tokens only; `admin_auth/deps.py:79-90` rejects a missing or ended session; `is_account_active` (`repository.py:219-230`) runs per request; "next request" (not "immediately") is correct because an in-flight request completes.
  - Other apps' tokens until expiry, up to 12 h — only `aud=admin` is checked against `sid` (`router.py:65-73`); 12 h is the production TTL (code default 900 s, max 43200 s, `config.py:93`).
  - Other accounts on the browser unaffected (`repository.py:152`); not a password change; disable to lock.
- 💭 The +30 s leeway is omitted — fine for staff copy.
- 💭 "12 hours" is hard-coded while the TTL is API config — follow-up (derive from config/API or ask org-admin-api to expose it).
- 💭 Regression test sound: `sessions.test.ts:42-56` fails on origin/main (no "next admin request"/"other apps", contains "including this admin app"), keeps the signed out/immediately/logged out guard, covers all three constants; `user-sessions-tab.test.tsx:229, :380` check the rendered dialogs.
- 💭 No R5/R6 issues: static text, no HTML sinks, no PII.

### Follow-ups (out of scope)
- Disable-user dialog copy overclaims "signed out of every mmlabs app" (already in the ticket's Out of scope).
- Stop hard-coding the 12 h TTL in UI copy.
