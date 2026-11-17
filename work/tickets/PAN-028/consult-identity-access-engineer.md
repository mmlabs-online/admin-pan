## PAN-028 consult: identity-access-engineer (read-only)

### Findings

**F1. Join policy and verified email are enforced by the API at decision time.**
- **Approve** re-checks four things under the app lock. Each failure returns `409` with `code: "conflict"` and the reason in `details[0].reason` (`details[0].field` is `request_id`, from `_refusal`, `/home/user/org-admin-api/app/modules/join_requests/service.py:34-35`):
  - `not_pending` (`service.py:88-89`)
  - `app_disabled` (`:97-98`)
  - `join_policy_changed`: the app is no longer `approval`, so a request queued under `approval` cannot be approved after the policy changes to `open` or `closed` (`:99-100`)
  - `user_disabled` (`:102-103`)
  - `email_unverified` (`:104-105`)
  - `default_role_unusable`: the default role is NULL, missing or holds an `is_admin` permission (`:106-109`, `/home/user/org-admin-api/app/modules/membership/service.py:57-65`)
- **Reject** only checks `not_pending`. It works whatever the policy, the app status or the user status (`service.py:129-149`).
- Requests are only created for verified, active users under `approval` (`membership/service.py:126-136`, `:154-171`). The list can still show a user who became unverified or disabled later: the rows carry `email_verified` and `user_status` (`/home/user/org-admin-api/app/modules/join_requests/schemas.py:17-18`).
- Rejecting starts a re-request cooldown. The default is 7 days (`JOIN_REJECT_COOLDOWN_SECONDS`, `plan.md:45,112`; `membership/service.py:160-163`). The value is server config and the UI cannot read it.

**F2. Approving grants a role.** It grants the app's current `default_role` at **app scope**: `org_id=None`, `expires_at=None`, `granted_by` = the staff member (`service.py:107-114`; router docstring `router.py:59`).
- If the user already has any effective role in the app, approve still returns `200` and marks the request approved, but grants nothing (`service.py:112`). Only the audit `changes` records the difference. The response body (`JoinRequestRead`) does not say whether a grant happened.

**F3. Admin app and self-approval.**
- The `admin` app is blocked for list, approve and reject. It returns `404 not_found`, the same as an unknown app (`service.py:66-68`, `:72-76`).
- **Self-approval is allowed** on non-admin apps. This is a deliberate API decision (`/home/user/org-admin-api/work/tickets/USR-03g/plan.md:260`). `_guard_privileged` only blocks self-assignment on `admin` and only requires `admin:*` for `is_admin` roles (`/home/user/org-admin-api/app/modules/rbac/service.py:1442-1451`). The default role can never be `is_admin` (`usable_default_role`).

**F4. Permissions.**
- List: `admin:users:read` (`router.py:24-28`).
- Approve and reject: `admin:roles:assign` (`router.py:18-21`, `:43-49`, `:65-69`).
- **No path needs `admin:*`.** `require_super` is never reached because the role is not privileged. So no `admin_wildcard_required` 403 can occur, only `permission_denied`.
- The snapshot already has these operations (`/home/user/admin-pan/src/api/schema.d.ts:96,113,133`). The registry has no entries for them yet (`/home/user/admin-pan/src/lib/permissions/registry.ts:96-179`).

**F5. Approving cannot change the caller's own admin permissions.** The grant goes to a non-admin app (admin returns 404) and uses a non-`is_admin` role. `GET /me/permissions` covers admin-app grants only. Even on self-approval, the caller's `admin:*` permission set is unchanged.

**F6. Requester PII.**
- Rows and decision responses carry the full `email` and an untrusted `display_name` (`schemas.py:14-15`). The API sends `Cache-Control: no-store` for this reason (`router.py:39,61,79`).
- API logs and audit rows deliberately leave out email (`service.py:124-126`; `plan.md:165`).
- The list endpoint has no email or `q` search filter, only `status` (`pending` by default, or `approved`/`rejected`) plus `limit`/`offset` (`router.py:34`). Order is fixed by `created_at, id` (`plan.md:142`).
- `decided_by` is a bare UUID. There is no name for it.

### Recommendations

**R-a. Registry (R4, ADR 0004, AC1/AC3).** Add three actions to `ACTIONS` so `registry.test.ts` checks them against `x-permission`:
- `joinRequests.view` = `perm('admin:users:read', 'GET /api/v1/apps/{key}/join-requests')`
- `joinRequests.approve` = `perm('admin:roles:assign', 'POST /api/v1/apps/{key}/join-requests/{request_id}/approve')`
- `joinRequests.reject` = `perm('admin:roles:assign', 'POST /api/v1/apps/{key}/join-requests/{request_id}/reject')`

How to present them:
- If this is a tab or section inside app detail, the section uses `queryView` + `ForbiddenPanel`. A section is the better fit: the app detail already needs `admin:apps:read`, and the list needs a separate `admin:users:read`.
- Approve and reject are row actions, so hide them when denied. Never gate anything on `admin:*`.

**R-b. Do not block self-approval in the UI (R1/R4).** Blocking it would invent a rule the API does not have. The ADR 0004 amendment uses `user_id` only to disable self-actions the API refuses. Optionally label the row "(you)" by comparing `user_id` with the `me` `user_id`.

**R-c. Hide the section for `admin`.** The API returns 404 for it. Show the section for every other app, not only `join_policy === 'approval'`, because history (`approved`/`rejected`) stays listable after a policy change. On an app that is not `approval`, show a note that approve will be refused with `join_policy_changed`.

**R-d. Map errors by status and `details[0].reason` (AC3).**
- Map 409 reasons to fixed copy: `not_pending`, `app_disabled`, `join_policy_changed`, `user_disabled`, `email_unverified`, `default_role_unusable`, plus a generic fallback. Never show the server `message`.
- Important: the 409 `email_unverified` is a `details` reason on `code: "conflict"`. It must not go to the AuthGate `email_unverified` gate handling, which is a 403 code (`/home/user/admin-pan/src/lib/forbidden.ts:3`). Add a test for this.
- 404 means the app is unknown or admin, or the request belongs to another app.
- After any 409 or 404, keep the dialog open with the error inline, then invalidate the list, because the row state probably changed.

**R-e. Confirmations and mutations (R9, AC2).**
- Both actions are access-changing, so both need a confirm dialog naming the requester and the app. Mutations are non-optimistic.
- Approve copy: "Grants the app's default role `<role>` (app-wide)". The role name comes from the app detail `default_role` data the screen already has. Also note "no change if already a member".
- Reject copy: mention that the user cannot re-request for a while. Do not hardcode "7 days".

**R-f. Invalidation (AC2).**
- On approve: invalidate the join-requests list for that app (all statuses and pages) and `usersKeys.detail(user_id)`. The second one covers `[..., 'role-assignments', p]` (`/home/user/admin-pan/src/features/users/api/queries.ts:34`), because approve can create an assignment.
- On reject: invalidate only the join-requests list.
- **Do not invalidate `['me','permissions']`** (F5). The existing 403-driven refresher (`/home/user/admin-pan/src/lib/permissions/permission-refresh.ts`) already covers revoked staff rights.
- Suggested key: `[...appsKeys.detail(key), 'join-requests', { status, limit, offset }]`, so `appsKeys.detail(key)` invalidation also covers it.

**R-g. Requester identity without leaking PII (R5, R6).**
- Show `display_name` (if present) and `email` as plain React text only. `display_name` is untrusted.
- Show `email_verified` and `user_status` as badges, so staff can see a request that is bound to fail before they approve it.
- Keep only `status`, `limit` and `offset` in URL search params. Never put the email in the URL, a route param, a query key, toasts that persist, console output or error reports. Keep `request_id` and `user_id` (UUIDs) in paths only.
- The success toast can name the requester (it is on screen only) but must not be logged.
- Any "open user" link should use `user_id`.
- Show `decided_by` as "you" when it equals the caller, otherwise as a short ID.

**R-h. Tests (R8, AC4)** with the fake fetch:
- list loading, empty, error, and 403 `permission_denied`
- `status` filter
- approve and reject confirm and cancel
- each 409 reason shown inline
- 404 handling
- invalidation assertions, including that `['me','permissions']` is **not** invalidated
- 409 `email_unverified` does not trigger the AuthGate
- `display_name` containing HTML is rendered as text

### Risks
- **Silent no-op approve.** When the user is already a member, approve returns 200 with nothing granted (F2), and the UI cannot tell staff. This is low impact, but the success copy should not claim "role granted" outright.
- **Stale default role.** The role granted is whatever the default is at approval time, not at request time. A default changed between request and approval is applied silently. Show the current default in the confirmation.
- **Self-approval** is permitted and audited. A staff member holding `admin:roles:assign` can admit themselves to any `approval` app. This is the API's accepted decision, not a UI concern. Mention it to the owner.
- **PII exposure.** The list exposes full emails to anyone with `admin:users:read`. This matches the existing users screen. TanStack Query keeps the data in memory only; make sure no persister is added.

### Open questions
1. Should the API return a `granted: bool` or `role_key` on approve, so the UI can say "already a member"? This would be an org-admin-api follow-up, not something to fake in the UI.
2. Should the reject confirmation give the exact cooldown? That needs the API to expose it (for example on app detail). Otherwise use generic wording.
3. Should `decided_by` be resolved to a name? That needs either an API field or a `GET /users/{id}` per row, which needs `admin:users:read`. Proposed default: show "you" or a short ID and record a follow-up.
4. Where should this live: the app detail sheet (a tab) or its own route? A new route needs a `ROUTE_PERMISSIONS` entry for `admin:users:read`. A tab is simpler and matches R-a.
