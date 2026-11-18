# PAN-020 security review

## Attempt 1

Scope: `git diff origin/main...HEAD` (32 files), against org-admin-api `c7b86dd`. Checks not run (reviewer's R8); no `.env*` read.

**Verdict: no 🔴.** One 🟡 caused by the snapshot drift (not this diff) → follow-up; the rest 💭.

### Rule checks
- **R2 OK:** `src/features/dashboard/api/queries.ts:3,170` uses `getApi()` + `unwrap(api.GET('/api/v1/stats/dashboard', { signal }))`; `DashboardStats` is the generated type (line 153), reused via `DashboardStats['members_per_app']` (`charts.tsx:98`, `view.ts:702`); e2e fake typed from the same schema; no new `fetch`, axios, `console.*`, storage, dependency, CI or nginx changes.
- **R4 OK:** registry maps `/_authenticated/` to `perm('admin:stats:read', 'GET /api/v1/stats/dashboard')` (`registry.ts:991`), matching the snapshot `x-permission` and `stats/router.py:43`; guard test covers denied/granted (`route-permission-guard.test.tsx:57-72`); real API 403 → `ForbiddenPanel` via `queryView` (`dashboard-content.tsx:313-319`, test `queries.test.ts:137-142`); attention link hidden only when the audit route is `denied` (`attention-list.tsx:192,210`).
- **R5 OK:** only search param added is `{ action: 'auth.login_failed' }` (`view.ts:792`), validated by `auditActionSchema`; nothing logged.
- **R6 OK:** app name/key and `time_zone` render as text (`charts.tsx:137-138`, `:73`; `dashboard-content.tsx:342`); no HTML sinks or data `href`.
- **Audit-log enums OK:** `app.join_request_cancelled` and `join_request_retention.purged` added to `auditActionSchema` (`schema.ts:34,51`) and `actionTones` (`data.ts:46,63`), matching the generated union; `Record<AuditAction, Tone>` makes future gaps a compile error.

### Findings
- 🟡 **Session-revocation copy now wrong under the new snapshot (not changed in this diff)** — `src/features/users/data/sessions.ts:5,8,11`, pinned by `sessions.test.ts:43-49`, `user-sessions-tab.test.tsx:228,378`. Regenerated descriptions say revoking "ends the user's admin (`aud=admin`) tokens bound to those sessions on their next admin request" (USR-14); the UI still says tokens stay valid up to 12 h "including this admin app". Risk: staff misjudge a security action (R9). Fix in a separate ticket (R7): admin-app access ends on the next request, other apps' tokens up to 12 h; update both tests.
- 💭 Snapshot drift adds no used behaviour: USR-16 role-definitions types only; join-request `status` gains `cancelled`; 409 description mentions `org_mode`. Gap: `joinRequestStatusOptions` (`src/features/apps/data/data.ts:35-43`) lacks `cancelled` → shown as "Unknown", not filterable; follow-up to derive options from the generated type.
- 💭 `members_per_app` shows all apps (incl. `admin`, disabled) to `admin:stats:read` holders without `admin:apps:read` — documented API intent (`stats/router.py:26-27`).
- 💭 Invalid `generated_at` would make `format(new Date(…))` throw (`dashboard-content.tsx:279`); optional `isValid` guard.
- 💭 Error branch (`dashboard-content.tsx:320-327`) shows generic copy without code/request id — safe for R5, acceptable for a read-only page.

### Follow-ups (out of scope)
1. Session revocation copy and tests (admin-pan bug).
2. `cancelled` join-request status option/label from the generated type.
3. Optional `generated_at` validity guard.
