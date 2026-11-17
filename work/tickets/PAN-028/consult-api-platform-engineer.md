PAN-028 consult (api-platform-engineer, read-only). Source: org-admin-api at b79cf77. Note: I read the code, not a generated /openapi.json, and there is no git history in the checkout, so I could not diff c41ef57..b79cf77 directly. The diff section below is inferred from ADM-015 artifacts and is labelled as such.

NOTE: /home/user/org-admin-api/work/tickets/USR-03g/consult-api-platform-engineer.md is the PRE-implementation proposal. The shipped code differs, so do not use it for the contract. Known differences: there is no `granted_role_key` in the read model, and 409 reasons are in `details[0].reason`.

## Findings

### Endpoints and permissions
All three are Bearer class (`aud=admin`). The router has `current_admin` at router level plus exactly one `require_permission` per route (`/home/user/org-admin-api/app/modules/join_requests/router.py:15`).

| Route | Permission | Success | Error codes |
|---|---|---|---|
| `GET /api/v1/apps/{key}/join-requests` (router.py:24-40) | `admin:users:read` | 200 `Page[JoinRequestRead]` | 401, 403, 404, 422 |
| `POST /api/v1/apps/{key}/join-requests/{request_id}/approve` (router.py:43-62) | `admin:roles:assign` | 200 `JoinRequestRead` | 401, 403, 404, 409, 422 |
| `POST /api/v1/apps/{key}/join-requests/{request_id}/reject` (router.py:65-80) | `admin:roles:assign` | 200 `JoinRequestRead` | 401, 403, 404, 409, 422 |

- There is no extra route-level permission rule. The ticket's mapping is correct.
- There is a hidden service-level rule on approve. `_grant_locked` calls `_guard_privileged` (`app/modules/rbac/service.py:1412`, `:1442-1451`). If the app's default role holds an `is_admin` permission, the actor must hold `admin:*` (`require_super`). Otherwise the API returns a 403 for a caller who does hold `admin:roles:assign`. The UI cannot predict this from `admin:roles:assign` alone.
- I did not trace the exact error code of that 403. Treat it as a generic 403 and show `error.message`.
- In practice join already refuses admin default roles (`usable_default_role`, `app/modules/membership/service.py`), so this should be rare.
- Approve and reject return the subject's email under `admin:roles:assign` only. A staff member who has `assign` but not `users:read` therefore sees the email on a decision response. The USR-03g security review flagged this as N1 (`work/tickets/USR-03g/security-review.md:16-19`); the S1 `no-store` finding was fixed, and the code now sets `Cache-Control: no-store` on all three routes. The UI should simply gate the page on `admin:users:read`.

### List params, filters, ordering
- Query params: `status` (enum `pending|approved|rejected`, default `pending`, `schemas.py:7`, `router.py:34`), `limit` (at most 100), `offset`. There are no other filters (no search, no user filter, no date range).
- Response: `Page[T]` = `{items, total, limit, offset}`.
- Ordering is fixed: `created_at ASC, id ASC` (`repository.py:74`). The oldest request comes first. There is no sort param, and decided lists are not ordered by `decided_at`.
- An invalid `status` returns 422. An unknown app returns 404. The `admin` app key also returns 404 (`service.py:66`, `:73`).
- Sub-resource semantics: the app key is the path segment, not a numeric id. Join requests are not listed across apps. There is no global "all pending" endpoint, so a cross-app inbox needs one request per app.
- The list does not require the app to have `join_policy=approval`. It returns an empty page for `open` or `closed` apps, so the UI can show the tab for every app or only for approval apps (a UI choice).
- Responses are `Cache-Control: no-store`.

### Response shape: `JoinRequestRead` (`schemas.py:10-21`)
- `id`: uuid.
- `app_key`: string.
- `user_id`: uuid.
- `email`: string. This is the full email and is PII.
- `display_name`: string or null. It is untrusted user text and must be rendered as text only (comment at `schemas.py:15`).
- `email_verified`: bool.
- `user_status`: string. This is the user's status (active/disabled or similar), not the request status. I did not check the enum values.
- `status`: string (`pending|approved|rejected`).
- `created_at`: timestamptz.
- `decided_at`: timestamptz or null.
- `decided_by`: uuid or null. It is a user id only, with no email or name, so the UI must resolve it via the users API or just show it as an id. It can become null if the deciding user is deleted (FK `SET NULL`, `models.py:58-60`).
- Invariant: `decided_at` is null if and only if `status` is pending (`models.py:29-31`).
- The response has no org field, no requested role, no granted role and no reject reason. The `granted_role_key` suggested in the consult was NOT implemented.
- `status` and `user_status` are plain `str` in the schema, not enums, so the generated TS type will be `string`. The UI should treat unknown values defensively.

### Approve and reject bodies
- Both POSTs take no request body. There is no role choice, no org and no reason field.
- Approve grants the app's CURRENT default role at app scope (`org_id=None`, no expiry) at the moment of approval (`service.py:59`, `:107-113`). It is not the role at request time.
- If the user already has any effective role in the app, the request is marked approved and nothing is granted (`service.py:112`).
- The UI cannot choose a role or an org. If a screen wants that, record it as an org-admin-api follow-up (R1).
- The UI cannot show "which role will be granted" from the join-request response. It would need the app detail (`default_role`), which may be stale by approval time.

### What approve does (`service.py:92-127`)
Lock order: app, user, request.
1. 404 if the app is unknown or is `admin`.
2. 404 if the request is unknown or belongs to another app.
3. 409 `not_pending` if the request is already decided (this includes approving an already-approved request, which is not idempotent).
4. 409 `app_disabled`, 409 `join_policy_changed`, 409 `user_disabled`, 409 `email_unverified`, 409 `default_role_unusable` (checked in this order).
5. Grant the default role via `_grant_locked` with the staff actor, so `granted_by` is the staff user.
6. Set the request to approved, with `decided_by` and `decided_at`.

Reject (`:129-149`): 404, then 409 `not_pending`. There is no user re-check, no `app_disabled` check and no role check, and it grants nothing.

### Error codes and reasons
Error envelope: `{"error": {"code", "message", "details"}}`. The 409 `details` is `[{"field": "request_id", "reason": "<reason>"}]` (`service.py:34-35`). The UI should branch on `details[0].reason`, not on the message text.

| Status | Condition |
|---|---|
| 401 | Missing or invalid token (`current_admin`). |
| 403 | Token lacks the route's permission (`users:read` for list, `roles:assign` for approve/reject). Also approve with an admin-level default role without `admin:*` (see above). |
| 404 | Unknown app, the `admin` key, unknown request id, or a request id belonging to another app (single answer, no oracle). A malformed non-UUID `request_id` is 422, not 404. |
| 409 | `not_pending` (approve and reject); `app_disabled`, `join_policy_changed`, `user_disabled`, `email_unverified`, `default_role_unusable` (approve only). |
| 422 | Invalid `status`, `limit`/`offset` out of range, or a non-UUID `request_id`. |

Suggested UI messages for the 409 reasons:
- `not_pending`: "already decided" (refresh the list).
- `app_disabled`: enable the app first.
- `join_policy_changed`: app no longer requires approval.
- `user_disabled`: user is not active.
- `email_unverified`: user has not verified their email.
- `default_role_unusable`: fix the app's default role.

There is no 429 on these staff routes that I found.

### Audit side effects
- Approve writes `app.join_request_approved`, target `join_request` (`actor_kind` is the staff user), `app_key` set, `changes = {status: pending→approved, role_key: null→<role>}` (`role_key` only when a grant happened). It also performs a grant via `_grant_locked`, which "never audits" itself (`service.py:1395`), so the role-assignment audit row is not separately written. The approve audit row is the record.
- Reject writes `app.join_request_rejected` with `changes = {status: pending→rejected}`.
- The audit enum already contains `app.join_requested` (written by end-user joins) and the target `join_request` (`app/modules/audit/actions.py:28`, `:48-50`).
- The audit-log screen will therefore receive these action and target values. If PAN's audit-log filters or labels use a hard-coded list, they need these three actions and the `join_request` target.

### Rejection cooldown
Per `docs/consumers.md:351` and `:362`, after a rejection the user cannot re-request for a cooldown (default 7 days); join returns 403 `join_rejected`. This is end-user behaviour and not in the staff API, but the reject confirmation text can mention it. There is no staff API to clear a cooldown (I did not find one).

### PII (R5)
- The email appears only in response bodies (list and decisions). It never appears in paths or query params: the identifiers are `key` and the request UUID.
- The UI must not put the email in URLs, search params, logs, error reports, analytics or toast text sent anywhere. The confirmation dialog should name the requester on screen, which is fine because it is rendered locally and not logged.
- The server logs only ids (`service.py:124-126`). Mirror this on the client: log only `request_id`.
- Do not persist the list in storage. Keep it in TanStack Query memory.

### What the UI must not do
- Must not assume a default status. Send `status` explicitly, although the default is `pending`.
- Must not send a body, a role, an org or a reason on approve/reject.
- Must not apply optimistic updates (R9). After success, invalidate the join-requests queries for the app. Also consider invalidating the app's members/assignments and user roles queries, because approve creates a role assignment. The users stats on the dashboard could change too (member counts).
- Must not render `display_name` or `email` as HTML or as an `href` (R6). A `mailto:` from data needs a scheme check, so prefer plain text.
- Must not rely on hiding for security (R4): `admin:users:read` gates the page, `admin:roles:assign` gates the actions, and the API's 403 must still be shown.
- Must not synthesize a role name or "will be granted X" from the join-request payload.
- Must not call the cookie-class end-user join endpoints (`/auth/apps/{key}/join`). That is R11/R3 territory.
- Must not treat `decided_by` as a displayable name. It is a user id.
- Must not call the list for the `admin` key (404).

## OpenAPI differences c41ef57 -> b79cf77 (inferred; no git history available)
From `work/backlog.md:41` and the ADM-015 artifacts, the visible change is ADM-015 (DONE 2026-11-17), and I found no other new endpoint or permission:
1. New endpoint `GET /api/v1/stats/dashboard` (`app/modules/stats/router.py:38-75`).
   - Permission: `admin:stats:read`. It is a new permission key (`is_admin`, granted to no role; `admin:*` covers it). It is seeded by migration `migrations/versions/20261117_e2b7a94d1c58_adm015_stats_permission.py`.
   - Response: `DashboardStats` with fields `generated_at`, `users {total, by_status, unverified}`, `organizations {total, by_status}`, `apps {total, by_status}`, `sign_ins_24h {window_start, window_end, succeeded, failed}`, `sign_ups {time_zone, by_month[{month,count}]}`, `members_per_app[{app_key, name, member_count}]`. The shapes are in `app/modules/stats/schemas.py`, which I did not read in full, so verify field-level types from the regenerated schema.
   - It is a single document (R9 exception D26) with `Cache-Control: no-store`. The description says "Clients ignore unknown keys".
   - It exposes every app's key and name (including disabled and `admin`) to anyone with `admin:stats:read`.
2. The `admin:stats:read` permission key will appear in `GET /permissions` or catalog responses and in the `x-permission` openapi extension on the stats route. If PAN has a typed permission-key union, add the new key.
3. No audit enum change comes from ADM-015 (the endpoint writes no audit row), and the join-request actions are already in `c41ef57`, since USR-03g was merged there. So "new audit enums" should not appear in the regeneration. I could not confirm this without the old snapshot. Diff `/openapi.json` against the committed snapshot to be sure.
4. ADM-016 (`member_count` on the apps list and app detail) is BACKLOG, so it is not in the regeneration.
5. Doc and description changes in the identity docs that don't change the schema: `docs/identity-architecture.md:158`, `docs/spec-v1.md:99`.

## Recommendations
1. AC "list with supported filters": expose a `status` selector (pending default, approved, rejected) and pagination only. No search or sort. The ordering note: pending shows oldest first, which suits a work queue.
2. AC "approve/reject with confirmation naming the requester": use the existing confirm dialog (R9), naming `display_name` (as text) or the email, and the app key. State that approve grants the app's current default role at app scope, with no choice. Keep it non-optimistic. Disable both buttons while a mutation is in flight.
3. AC "inline errors 403/404/409": map the 409 `details[0].reason` values listed above to messages, with the generic `error.message` as fallback. On `not_pending` and on 404, also refresh the list. Show a 403 inline (R4).
4. Gating: page and list on `admin:users:read`, buttons on `admin:roles:assign`. Show approve/reject only for rows with `status=pending`.
5. After success, invalidate the app's join-requests queries and the app's member/assignment queries (approve creates a grant).
6. Show `email_verified=false` and `user_status != active` as a warning badge on the row, since approve will return 409 for those cases. Consider disabling Approve there, but still handle the 409 (the API is the authority).
7. Types: use the regenerated OpenAPI types (R2). `status` and `user_status` are `string` in the schema, so narrow them with a zod or union guard in one place (the client), not in feature code.
8. Tests (AC "loading, empty, error, 403 states with fake fetch"): add 409 reason cases, a 404 case, a 422 case (`status`), a `no-store` header assumption (not needed in the test), and a check that no email appears in request URLs.
9. Audit-log feature: add labels for `app.join_request_approved`, `app.join_request_rejected`, `app.join_requested` and the `join_request` target, if the audit screen maps actions.
10. Follow-ups for org-admin-api (R1, not in the PAN-028 diff):
    - A requester `display_name` and email resolver for `decided_by`.
    - An optional cross-app pending inbox, a count of pending requests per app (for a badge), and a `granted_role_key` or `default_role` hint on the decision response.
    - A way to clear the rejection cooldown.
    - A reject reason, if staff want to communicate one.

## Risks
- Approve grants the default role as it is at approval time, so the role can differ from what the staff member saw when they opened the page. The response carries no role information to confirm what was granted.
- Race: another staff member may decide the same request. Expect 409 `not_pending` and handle it gracefully.
- Unknown-reason risk: the 409 reason list is code-derived. New reasons may be added later, so keep a generic fallback.
- N1 (decision responses carry the email under `roles:assign` alone) is a documented API behaviour. Do not cache decision responses client-side beyond query memory.
- `decided_by` can be null after the staff user is deleted, so render a fallback.
- There is no cap, expiry or auto-cancel for stale pending requests (security-review follow-ups, `security-review.md:76`). Lists may contain disabled or unverified users that can never be approved.
- No cross-app endpoint means a dashboard-level "pending join requests" badge needs N requests. Avoid it in this ticket.

## Open questions
1. Which exact 403 `code` does the API return for the `_guard_privileged` case on approve? I did not trace `require_super`. Verify in `/openapi.json` or the tests before writing the 403 message.
2. Should the Join Requests view live as a tab on the app detail page (natural, since the key is in the path) or as a global page that iterates apps? The first is recommended.
3. What are the allowed values of `user_status`? The schema types it as a plain string. Confirm via `UserStatus` in `app/modules/users/models.py`, which I did not read.
4. Does the owner want the approve dialog to display the app's default role (extra fetch of the app detail, possibly stale), or to state "the app's default role" generically? The latter is recommended.
5. Is the committed OpenAPI snapshot at c41ef57 complete enough to diff mechanically? If PAN-009 regenerates types by script, the diff of stats-related types is the expected delta.

Paths: /home/user/org-admin-api/app/modules/join_requests/router.py, service.py, repository.py, schemas.py, models.py; /home/user/org-admin-api/app/modules/audit/actions.py; /home/user/org-admin-api/app/modules/rbac/service.py; /home/user/org-admin-api/app/modules/stats/router.py; /home/user/org-admin-api/docs/consumers.md:323-364; /home/user/org-admin-api/docs/identity-architecture.md:154-156,222; /home/user/org-admin-api/work/tickets/USR-03g/security-review.md.
