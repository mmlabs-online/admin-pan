## PAN-017 consult (api-platform-engineer): user sessions list/revoke

Method: read-only. Compared admin-pan's src/api/openapi.json (c41ef57) with the org-admin-api sources at 26b27be by reading. I could not run the generator and have no shell. Paths are under /home/user/org-admin-api unless noted.

### Findings

**1. Endpoints (app/modules/users/router.py)**

| Method | Path | Success | Declared in |
|---|---|---|---|
| GET | `/api/v1/users/{user_id}/sessions` | 200 `Page[UserSessionRead]`, `Cache-Control: no-store` | :95-126 (no-store at :107) |
| DELETE | `/api/v1/users/{user_id}/sessions/{session_id}` | 204, empty body | :129-141 |
| DELETE | `/api/v1/users/{user_id}/sessions` | 204, empty body (revoke all) | :144-152 |

- All three require `admin:*` (`_sessions_route`, :75-80). That is stricter than `admin:users:read` or `admin:users:write`.
- The OpenAPI `x-permission` value is `admin:*` on all three.
- Each route declares 404 "User or session not found" and the standard error responses.
- The routes sit under the router-level `current_admin`, so they need a Bearer token with `aud=admin`.

**2. Permission and self rules (app/modules/sessions/staff_service.py)**
- A holder of `admin:users:read` plus `admin:users:write` but not `admin:*` gets 403 `permission_denied` with `details.required == "admin:*"`. This is pinned by the USR-10 test `test_routes_require_admin_wildcard` (work/tickets/USR-10/plan.md:60).
- Staff cannot list or revoke their own sessions: 403 `self_session_change_forbidden` (app/core/errors.py:80-81; staff_service.py:52-53 for the list, :79-80 for revokes).
  - The check is by user id, so the staff member's own admin-app session cannot be revoked through this API at all.
  - Revoke attempts write a denied audit row (`record_denied`, :83-87). The list 403 writes no row.
- Target holds an admin role: `require_super(actor)` runs (:54-55, :81-82). It is always satisfied because the route already needs `admin:*`, so it is not reachable over HTTP. The code `admin_wildcard_required` can in principle appear; the UI already handles it.
- Permission lookup in the UI: admin-pan's `permits` (src/lib/permissions/permits.ts) already treats `admin:*` as matching every `admin:...` key. The API's `permits` (app/modules/rbac/authz.py:12-23) matches only `<app>:*` or an exact key. The registry at src/lib/permissions/registry.ts needs a new key for the sessions action. Whether it can be the literal `admin:*` is unverified, because the `permits` test at src/lib/permissions/permits.test.ts:27-29 says a malformed required key is false even with `admin:*`, and `admin:*` may count as malformed. Check this before writing the guard.

**3. Response fields (app/modules/sessions/schemas.py:9-21, staff_service.py:27-34, :60-67)**

| Field | Type | Meaning |
|---|---|---|
| `id` | uuid | Account session id. Use this for the DELETE path. |
| `created_at` | datetime | When the account session was created. |
| `last_used_at` | datetime | Last sign-in of this account on this device. |
| `device_last_seen_at` | datetime | Browser last seen; refreshed at most hourly. |
| `ip` | string or null | Full IP, no masking. `str()` of the INET value, so no `/32` suffix is expected. |
| `user_agent` | string or null | Stored as sent, cut at 512 characters on write (sessions/service.py:151). |

- All fields are required. `ip` and `user_agent` are required but nullable.
- The API describes `ip` and `user_agent` as "Recorded when this browser first signed in; shared by every account on it" (schemas.py:6). They are the device's first sign-in values, not the current location. Label them "First sign-in IP" / "First sign-in browser" or equivalent.
- The API does no PII masking or truncation. The owner decided on full IP, but spec Q6 (is IP/UA PII?) is still open (USR-10 plan.md:141 and :150). Masking or truncating in the UI is a UI decision, not an API behaviour.
- There is no `revoked_at`, no `device_session_id`, no `current` flag and no app or org info.
- The list shows active sessions only. Revoked, idle-expired and max-age-expired ones are hidden. There is no `include_revoked` option (plan.md:115).

**4. Pagination**
- Standard `Page[T]`: `items`, `total`, `limit`, `offset`, with `limit` up to 100.
- Order is `created_at DESC, id DESC` (plan.md:55).
- `total` counts active sessions only.

**5. What revoke does**
- It revokes account sessions (one user on one device, or all of that user's on every device). It does not revoke device sessions.
- A shared browser's other accounts stay signed in. Device rows are untouched (staff_service.py:3-4, plan.md:83).
- After a revoke, `/auth/token` for that account returns 401 `session_invalid`, so no new access tokens are issued.
- Tokens already issued stay valid until `exp`: at most `ACCESS_TOKEN_TTL_SECONDS` (12 h in production) plus 30 s. This includes `aud=admin` tokens (router.py:65-72).
- Revoke does not stop a fresh sign-in with the password.
- So staff revoke is not an incident response for a compromised account. The runbook points to disable, revoking roles, or key rotation (docs/deploy.md "Revoking live tokens").
- Revoking a session of a user who also uses the admin app does not log them out of the admin app for up to 12 h.
- Revoke-all on a user with no active sessions returns 204 and writes no audit row (staff_service.py:122-124).

**6. Errors (the usual envelope `{"error":{"code","message","details"}}`)**
- 401: missing or invalid token.
- 403 `permission_denied` with `details.required == "admin:*"`: caller lacks `admin:*`.
- 403 `self_session_change_forbidden`: new code, not yet in admin-pan.
- 403 `admin_wildcard_required`: effectively unreachable.
- 404 `not_found`: unknown user (list and both revokes).
- 404 `not_found` on revoke-one: unknown session, a session of another user, or an already-revoked session. All return the same message, "Session not found".
- 422 `validation_error`: a non-UUID id.
- Revoke-one accepts an unrevoked session that the list hides because it is idle or max-age expired (see the USR-10 security review, work/tickets/USR-10/security-review.md:24).
- A second revoke of the same session returns 404, not an idempotent 204. The UI must treat 404 after a revoke as "already gone": invalidate and refetch rather than show a hard error.

**7. Audit side effects**
- Actions: `user.session_revoked` and `user.sessions_revoked`, written in the same transaction.
- Actor is the staff user and the target is the user.
- `changes` holds `account_session_ids` (at most 100, sorted) and `account_sessions_revoked` (exact count). It never holds IP or user agent.
- The list is a read and is not audited. Audit rows do store the staff caller's own IP/UA (security-review.md:23).
- The audit-log screen will show these two new action names. Check whether admin-pan's audit-log action filter or labels cover them.

**8. Cache-Control**
- The list returns `no-store`. Revokes return 204 with no body and nothing to cache.
- TanStack Query should keep a short `gcTime` for this key. Keep IP and UA out of any persisted cache, log or URL.

**9. OpenAPI differences a regeneration will pull in (read by comparison, not confirmed by diff)**

Operations added (3 sessions ops plus 1 stats op):
- `GET /api/v1/users/{user_id}/sessions`
- `DELETE /api/v1/users/{user_id}/sessions/{session_id}`
- `DELETE /api/v1/users/{user_id}/sessions`
- `GET /api/v1/stats/dashboard` (app/modules/stats/router.py:38-44): `admin:stats:read`, `Cache-Control: no-store`, response `DashboardStats`.

Schemas added:
- `UserSessionRead` and the `Page_UserSessionRead_` envelope.
- `DashboardStats` and its sub-schemas (app/modules/stats/schemas.py:6-67): `UserStatusCounts`, `UserStats`, `OrganizationStatusCounts`, `OrganizationStats`, `AppStatusCounts`, `AppStats`, `SignIns24h`, `MonthCount`, `SignUps`, `AppMembers`.
- Fields in `DashboardStats`: `generated_at`; `users{total, by_status{active,disabled}, unverified}`; `organizations{total, by_status{active,suspended}}`; `apps{total, by_status{active,disabled}}`; `sign_ins_24h{window_start, window_end, succeeded, failed}`; `sign_ups{time_zone, by_month[{month,count}]}`; `members_per_app[{app_key, name, member_count}]`.
- `AppRead` gains required `member_count` (int, `ge 0`; app/modules/rbac/schemas.py:96-103). It is a new subclass of `AppFields`, so the spec has an `AppFields` base and `AppRead` extends it.
- In the current snapshot `AppRead` has no `member_count` (grep for `member_count`, `admin:stats` and `no-store` found nothing in src/api/openapi.json).
- The apps list (`Page_AppRead_`) and `GET /apps/{key}` now return `member_count`. The create and patch responses probably do too, via `_app_read` at rbac/router.py:42-47. Not verified; check the regenerated diff.

Possible other changes (unverified):
- `x-permission` on three new routes (`admin:*`) and one (`admin:stats:read`).
- New 404 response descriptions on the sessions routes.

Not changed (verified by grep): the other operations in the snapshot match the router decorators I enumerated, with no routes removed or renamed.

**10. Sessions vs. other users features (impact on admin-pan)**
- `src/api/openapi.json` is regenerated with `uv run python -m app.cli openapi --output src/api/openapi.json`, then `pnpm api:types` (PAN-019 plan, per its consult notes).
- The registry at src/lib/permissions/registry.ts:62 marks stats as "No stats API (spec §5.7 gap)". That is now stale, a follow-up for the dashboard ticket, not PAN-017.
- `forbiddenCopy` (src/lib/forbidden.ts) has cases for `admin_wildcard_required`, `self_assignment_forbidden` and `self_status_change_forbidden`, but nothing for `self_session_change_forbidden`.
- `permission-refresh.ts` triggers a permission refetch on `permission_denied` and `admin_wildcard_required`. `self_session_change_forbidden` must NOT trigger it, like the other self codes (see permission-refresh.test.ts:27-29).

### Recommendations (by acceptance criterion and rule)
1. **AC1, R2:** regenerate openapi.json and schema.d.ts first as an isolated step, and record the diff stat in impl-log. Because `AppRead` gains a required field and `DashboardStats` is added, any hand-written or mock `AppRead` in features/apps data will fail typecheck. Update the mocks, or confirm the apps list ticket already handles this. Keep the regeneration to what PAN-017 needs, and flag the `member_count` and stats changes as drift (R7).
2. **AC1:** show `created_at`, `last_used_at` and `device_last_seen_at` as date-times (the second is "last seen"). Show `ip` and `user_agent` with a "first sign-in" label, and handle null with a dash. Render `user_agent` as plain text only (R6). Do not parse it with a library for display beyond what is needed.
3. **AC1, pagination:** use `limit` up to 100 with `offset` and `total`. A user rarely has more than a few sessions, but do not assume everything fits on one page.
4. **AC2, R9:**
   - Revoke-one dialog: name the user and the session (created, last seen, first-sign-in browser).
   - Revoke-all dialog: name the user; say all devices, other accounts on shared browsers stay signed in, and tokens already issued stay valid until expiry (up to 12 h).
   - Not optimistic. On success, invalidate the sessions query (and the audit-log query, since new rows exist). Show API errors inline.
5. **AC2, R4:** gate the section on the `admin:*` guard (see the permission lookup note in finding 2) and still handle 403 from the API. Do not show the sessions section for the signed-in staff user's own row (self 403). Handle `self_session_change_forbidden` with its own copy.
6. **AC3, R8:** tests for list, empty, loading, error, 403 (`permission_denied` and `self_session_change_forbidden`), 404 on revoke, confirm and cancel, and revoke-all. Mock at the network layer.
7. **R10:** a semantic table with headers, and status messages announced for revoke success and failure.

### What the UI must not do
- Must not claim that revoking signs the user out immediately. The honest copy is "no new access tokens; existing ones stay valid until they expire (up to 12 h)".
- Must not offer revoke on the signed-in staff user's own row, and must not rely on hiding it; the API returns 403.
- Must not retry or treat 404 on revoke as a failure to keep showing; refetch the list.
- Must not log, persist, or put IP and user agent in URLs, analytics or error reports (R5). Do not cache them beyond a short query lifetime.
- Must not render the user agent as HTML, and must not call a 'device' revoke (there is none).
- Must not hand-write the session types (R2).
- Must not trigger the permission refetch for `self_session_change_forbidden`.

### Risks
- A live admin token survives a revoke for up to 12 h plus 30 s. Staff may wrongly think a revoked user is locked out of admin. This is the biggest UX/security risk; the copy must be explicit.
- The full IP and user agent are shown to every `admin:*` holder with spec Q6 unresolved. Treat the display as provisional and make it easy to mask later.
- The IP/UA reflect the browser's first sign-in, not the current session, so showing them as "where the session is now" would mislead.
- The regenerated types add a required `AppRead.member_count`. This could break typecheck in the apps features and mocks unrelated to this ticket.
- The UI `permits` handling of `admin:*` as a required key is unverified (see finding 2).
- A 404 from revoke-one is ambiguous (already revoked, other user's, or unknown). The UI cannot tell which.

### Open questions
1. Is there a registry entry for `admin:*` in src/lib/permissions/registry.ts, and does `permits` accept `admin:*` as a required key? The test at permits.test.ts:27-29 suggests malformed keys fail even for holders. Needs a read of permits.ts and registry.ts before the plan.
2. Should the regeneration (including `member_count` and the stats op) be inside PAN-017 or its own preceding ticket? The planner should decide under R7; I recommend noting the drift and including only the regenerated files with the mock updates needed to typecheck.
3. IP/UA display: full values (current API behaviour and owner decision) or masked in the UI pending spec Q6? Owner decision.
4. Should the audit-log screen get labels for `user.session_revoked` and `user.sessions_revoked` in this ticket, or as a follow-up?
5. Is there an "include revoked" requirement? The spec §5.10 says "Default: non-revoked only", and the API has no option, so this would be an org-admin-api follow-up.

Key files:
- /home/user/org-admin-api/app/modules/users/router.py
- /home/user/org-admin-api/app/modules/sessions/staff_service.py
- /home/user/org-admin-api/app/modules/sessions/schemas.py
- /home/user/org-admin-api/app/modules/stats/router.py
- /home/user/org-admin-api/app/modules/rbac/schemas.py
- /home/user/org-admin-api/work/tickets/USR-10/plan.md
- /home/user/org-admin-api/work/tickets/USR-10/security-review.md
- /home/user/admin-pan/src/api/openapi.json
- /home/user/admin-pan/src/lib/forbidden.ts
- /home/user/admin-pan/src/lib/permissions/permits.ts
- /home/user/admin-pan/src/lib/permissions/registry.ts
