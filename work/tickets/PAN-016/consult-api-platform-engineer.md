## PAN-016 API consult (api-platform-engineer, read-only)

Source: org-admin-api 8a4efb2 working tree (`app/modules/audit/*`, `app/core/openapi.py`, `app/core/errors.py`). I had no shell, so I could not run `make openapi` or diff the generated JSON. The drift list below comes from reading the code and grepping the snapshot, and has to be confirmed with a real regeneration.

### Findings

**1. List contract: `GET /api/v1/audit-logs`** (`audit/router.py`)
- Auth: Bearer, `x-permission: admin:audit:read`. The route's error responses come from `require_permission`'s `_ERROR_RESPONSES`. The list endpoint is not itself audited.
- Page params: `limit` 1..100 (default 20), `offset` >= 0 (default 0). Response is `Page<AuditLogRead>`: `items, total, limit, offset`.
- Filters are ANDed. All are optional. An invalid value gives 422 `validation_error`; `details` is a list of `{type, loc, msg}`.

| Param | Type |
|---|---|
| `actor_user_id` | uuid |
| `actor_kind` | `user` \| `system` \| `anonymous` |
| `action` | enum of 33 values (below) |
| `target_type` | `organization` \| `user` \| `app` \| `permission` \| `role` \| `role_assignment` \| `device_session` \| `invitation` |
| `target_id` | uuid |
| `app_key` | string matching `APP_KEY_RE` |
| `outcome` | `success` \| `failure` \| `denied` |
| `from` | aware datetime (alias; the Python name is `occurred_from`) |
| `to` | aware datetime |

- `action` enum (past tense, dotted): `organization.created|updated|deleted|invitation_created|invitation_accepted|invitation_revoked`; `user.created|disabled|enabled`; `app.created|updated|deleted|registered|admin_origins_set|joined`; `permission.created|updated|deleted`; `role.created|updated|deleted|permissions_replaced`; `role_assignment.granted|revoked`; `email_retention.purged`; `audit_log.purged`; `auth.login_succeeded|login_failed|logged_out|logged_out_all|password_reset_completed|email_verified`; `device_session.reuse_revoked`.
- `from` is inclusive (`occurred_at >=`). `to` is exclusive (`occurred_at <`).
- Datetimes must be timezone-aware: a naive value like `2026-11-17T00:00:00` is a 422. Send full ISO strings with `Z` or an offset.
- `from > to` gives 422 `unprocessable` with `details=[{field:'from', reason:'after_to'}]`. This is a different shape from `validation_error`. The UI should validate this client-side and still handle the 422.
- A "to" of end-of-day inclusive means sending next-day 00:00 as `to`, because `to` is exclusive. The mock's day-based `from`/`to` must be converted this way. Local-day versus UTC-day is a decision (see Open questions).
- Ordering is fixed: `occurred_at DESC, id DESC`. There is no sort param. The UI must remove any column-sort UI, or keep it disabled and say why.
- There is no free-text, actor-email or ip filter. This confirms the ticket note: no email goes into the URL (R5).
- There is no `org_id` filter. `org_id` is a field on the row only. Filtering by org is `target_type=organization&target_id=<org>`. That does not include rows where the org is only the context (e.g. an org-scoped role assignment).

**2. `AuditLogRead` fields** (`audit/schemas.py`). All are required and nullable where noted, with no extra fields:
`id` uuid; `occurred_at` datetime; `actor_kind` string; `actor_user_id` uuid|null; `actor_label` string|null; `action` string; `outcome` enum; `target_type` string|null; `target_id` uuid|null; `app_key` string|null; `org_id` uuid|null; `changes` object|null; `ip` string|null; `user_agent` string|null; `request_id` string|null.
- `actor_kind`, `action` and `target_type` are plain strings in the response schema. Only `outcome` is an enum. The enums exist only on the query params, so the generated response types will not be union types for these three. Do not hand-write a response enum (R2). To build the filter dropdowns, either derive the options from the generated query-param types (`operations['list_audit_logs'].parameters.query`) or keep a typed constant that a test checks against the snapshot enum. Display unknown values defensively, as the API may add new ones.
- **PII and email masking.** There is no email in the row and no `actor_email`. Actors are `actor_user_id` plus `actor_kind`. `actor_label` is non-null only for `system` actors (a name, max 64 chars, enforced by a DB check). It is null for `user` and `anonymous` actors. `service._check_keys` rejects any `changes` key matching `hash|token|password|cookie|email|secret` before the row is written (the only exception is the `email_retention.purged` table-count keys). `diff.py` also uses allowlisted fields only. Org/app/role/permission diffs are non-PII. USER diffs hold `status` only.
  - **Answer to the owner note: the API never returns emails, so there is nothing to mask in the UI.** An unknown-account `auth.login_failed` has `actor_kind=anonymous`, `actor_user_id=null`, `actor_label=null`. The mock's `actor_email`, `maskEmail`, `matchesActor` and the "masked for unknown-account" comment all go away.
  - To show who a user actor is, display the short uuid and link to the user (`/users/<id>` or the users filter). Resolving it to an email by calling `GET /users/{id}` per row is N+1 and a PII spread. Do not do it in this ticket; record a follow-up if the owner wants it.
  - `ip` and `user_agent` are returned. They are PII-ish but not covered by R5's "full emails". The API validates the IP (IPv4-mapped IPv6 is normalised to IPv4) and strips control and bidi characters from the user agent (max 512 chars). Render both as text only.
- **`changes` shape.** It is not `{before, after}`. There are three shapes (`service.py`, `diff.py`):
  1. Admin mutations: `{field: {"from": v, "to": v}}`, only the changed fields. A create is `{field:{from:null,to:..}}`; a delete is `{field:{from:..,to:null}}`. Values are JSON (UUIDs and datetimes as strings; `origins` is a list).
  2. Identity and failure rows: a flat object of allowlisted scalars.
  3. Denied rows: `{"reason": "<error code>", ...facts}`.
  4. Purge rows: `{email_send_log: {from:null,to:<int>}, ...}`.
  - `changes` is null when there is nothing to record.
  - The schema type is `dict[str, Any]`, i.e. `{[k:string]: unknown}`. The UI must parse it defensively: treat an entry as a change only if it is an object with exactly the keys `from` and `to` (see `_is_count`), and otherwise show the key/value as flat text. Render everything as text via `JSON.stringify`/`String` (R6). The mock's `diffChanges` and `formatJson`, the detail sheet's Before/After panes and the `auditChangesSchema` (before/after) must be rewritten to the from/to shape. A zod schema for response parsing is not needed (R2: types come from generated code).

**3. Mock-versus-API field mapping**

| Mock | API |
|---|---|
| `actor_email` | removed; use `actor_kind` + `actor_user_id` + `actor_label` |
| `action` values like `user.disable`, `role.assign`, `auth.login.success`, `app.join` | `user.disabled`, `role_assignment.granted`, `auth.login_succeeded`, `app.joined` etc. All 12 mock values are renamed or retargeted |
| `target_type` `session` | `device_session`; new: `permission`, `role_assignment`, `invitation` |
| `target_id` required | nullable |
| `target_type` required | nullable |
| `ip`, `user_agent`, `request_id` required | nullable |
| `changes.before/after` | `changes[field].from/to` |
| (none) | new fields `outcome`, `actor_kind`, `actor_label` |
| `app_key` filter | `admin`, `stoktok`, `identity` is a hard-coded mock enum. The API accepts any key matching the key pattern. Use a free input or the options from `GET /apps` rather than a fixed list |
| actor free-text filter (`actor`) | no equivalent. Replace it with `actor_user_id` (uuid). Validate the uuid client-side, since an invalid one is a 422 |
| client-side date filter and CSV export of the loaded array | the API paginates; the export would only cover the current page. Drop it, or label it "current page" (R7: decide in the plan) |

- URL search schema: replace `actor`, `action[]`, `targetType[]`, `app[]` with the real params. The API takes single values (no multi-select for `action`, `target_type`, `outcome`). The users screen's "send only if exactly one is selected" pattern fits.
- New filters worth adding: `outcome` (failure/denied rows are the main reason to read an audit log), `target_id`, and `actor_user_id`.

**4. Snapshot regeneration from 8a4efb2 (`make openapi OUT=<path>` runs `python -m app.cli openapi`, which writes sorted keys, indent 2)**
Known differences against the current `src/api/openapi.json`, which predates ADM-013:
- **New path:** `GET /api/v1/audit-logs`, with a new schema `AuditLogRead`, `Page_AuditLogRead_` (or the generic `Page[T]` name, depending on the generator) and the enum schemas for the query params.
- **New paths (unexpected scope):** `POST /api/v1/auth/orgs/...` (`organizations/auth_router.py`, prefix `/auth/orgs`), `POST /api/v1/auth/orgs/{org_id}/invitations` and `POST /api/v1/auth/invitations/accept` (`invitations/router.py`). These are not in the current snapshot's path list (I checked all listed paths). Their routes and schemas will appear in the diff. They are not used by the UI. Record them in the impl-log and do not wire them (R7). I did not read the orgs `auth_router.py` in detail.
- **`/api/v1/me/permissions`:** the generated output will contain the real operation (`me/` router, `current_admin`, no `x-permission`). Compare it with the hand-patched fragment: PAN-011b says it was copied from 8a4efb2, but verify the `MePermissions` schema and all response codes, because the regeneration adds 401/403 with the envelope. The generated version should supersede the patch.
- **409s:** the hand-patched 409s (`PATCH /users/{user_id}`, `DELETE /users/{user_id}/role-assignments/{assignment_id}`) correspond to `_WRITE["responses"][409]` in `users/router.py` and `assignments_router.py:58-59`. They should be regenerated identically, with description "Last active super-admin" (verify the `assignments_router` text). Any other 409 present in the generated document is a diff to review. The current snapshot has 409s at 4 places (lines 2914, 3095, 3625, 3844), of which two are the hand-patches. The others are pre-existing auth conflicts.
- **ErrorEnvelope (ADM-013):** `components.schemas.ErrorEnvelope` and `ErrorBody` are added. Every response with status >= 400 now points to `ErrorEnvelope`. `HTTPValidationError` and `ValidationError` are removed (the current snapshot has both). 422 descriptions become "Validation failed (code=validation_error; also code=unprocessable for refused data)". No code outside `schema.d.ts` references `HTTPValidationError` (my grep found it only in the snapshot). Check `schema.d.ts` consumers with `pnpm typecheck`.
- **X-Request-ID:** every response of every operation (also 2xx) gains `headers: {X-Request-ID: {schema: string, format: uuid}}`. openapi-typescript will emit `headers` on every response in `schema.d.ts`. That inflates the diff but is additive. `openapi-fetch` ignores it. This confirms the PAN-009 follow-up in `src/api/errors.ts` (hand-written envelope exception, "envelope is not in OpenAPI"): the envelope is now in the spec. Following R2, the hand-written zod `envelope` could be replaced by a type from the generated `ErrorEnvelope`. That is optional and a refactor (R7); record it as a follow-up unless the planner wants it. The `request_id` is available as the `X-Request-ID` response header and is not in the error body. The 429 handling in `errors.ts` (header `Retry-After` plus `details.retry_after`) matches `RateLimitedError`.
- **`x-permission`:** the generated document has a new value, `admin:audit:read`, on `GET /api/v1/audit-logs`. The existing values (`admin:apps:read|write`, `admin:roles:manage|assign`, `admin:organizations:read|write`, `admin:users:read|write`) should be unchanged. Verify after regeneration that the set of x-permission values equals `ADMIN_PERMISSIONS` plus `admin:audit:read`, and that no other new value appears.
- **Other possible drift:** any changes made to schemas between the snapshot commit (d9e496f for PAN-013) and 8a4efb2 (Users, apps, roles, orgs, auth, invitations). I could not diff them. After regenerating, review `git diff` of `schema.d.ts` for removed or retyped fields, not only additions. This is the check that actually matters (Backward-compat rule: changed type or removed field means a real UI break).
- Generate from the same commit with `make openapi OUT=/path/openapi.json`, copy to `src/api/openapi.json`, run `pnpm api:types`, and record "8a4efb2" in the impl-log. ADR 0001 says CI fails on a `schema.d.ts` diff, so both files must be committed together.

**5. Registry and test impact** (`src/lib/permissions/registry.ts`, `registry.test.ts`)
- Add `'admin:audit:read'` to `ADMIN_PERMISSIONS`. Otherwise the first test ("equals the set of x-permission values") fails on the full snapshot, which is the known reason PAN-013 hand-patched.
- Change `'/_authenticated/audit-log/'` from `pending` (PAN-016) to `perm('admin:audit:read', 'GET /api/v1/audit-logs')`.
- Add an action only if the UI has a gated control. There is none beyond the route: a read-only screen needs no `ACTIONS` entry. The "users history" link on the user row/detail is gated by the same `admin:audit:read` (hide it without the permission, R4). If the link is gated, add e.g. `'audit.view': perm('admin:audit:read', 'GET /api/v1/audit-logs')` to `ACTIONS`, and use it with `<Can>`.
- The fourth test ("pending requirements ... length > 0") stays green: `/` (PAN-020) and `/reports` (PAN-021) are still pending, plus the `reportsPending` actions.
- No registry change is needed for the me/permissions fragment (no `x-permission`).
- The permission source (PAN-011b) works with permissions from `/me/permissions`: a user without `admin:audit:read` will see the audit route denied. Use `queryView` + `ForbiddenPanel` on 403, with `details.required` = `admin:audit:read` as the API's 403 body shows (`PermissionDeniedError` has `details={"required": key}`).

**6. Cache keys and query hooks** (pattern from `features/users/api/queries.ts`)
- Add `src/features/audit-log/api/queries.ts` with `auditKeys = { all: ['audit-logs'], lists: () => [...all,'list'], list: (p) => [...lists(), p] }`. Include only the defined params in the key, as `usersKeys` does (omit undefined values so `{}` and `{outcome: undefined}` produce one key). All filters are in the key: `limit, offset, actor_user_id, actor_kind, action, target_type, target_id, app_key, outcome, from, to`.
- `keepPreviousData` as in users. Pass `signal`. The injected `api: ApiClient = getApi()` with the `eslint-disable exhaustive-deps` pattern.
- `toAuditListParams` builds query params from the URL state (`toPageParams` from `@/api`); it omits empty values and sends `from`/`to` as ISO strings with a timezone.
- Read-only: no mutation hooks. After a user status change or role assignment the audit list becomes stale, so `invalidateQueries({queryKey: ['audit-logs']})` could be added to the users mutations' `onSuccess` (R9 requires invalidating affected queries). The list also refetches on mount (staleTime default), so this is a minor point. I suggest a follow-up, not a change to the users hooks, unless the planner wants it.
- Debounce: no PII filters exist (uuids, enums, dates). The uuid inputs do not need to be debounced as text, but should validate with a uuid regex before sending, or the 422 shows. A uuid in the URL is not PII (R5 is about emails/tokens).
- Detail: the rows already carry all fields; the detail sheet does not need a `GET /audit-logs/{id}` (there is none). Use the row from the list.

**7. Links from users and orgs**
- Users: `Link` to `/audit-log?target_type=user&target_id=<id>`. This shows the changes made to that user, e.g. `user.disabled`. Optionally add `actor_user_id=<id>` as a second link ("actions by this user"). They are two different questions, and `target_id` filters only rows where the user is the target; login events (`auth.login_succeeded`) are recorded with `target_type=device_session` or `user` — I did not check which, so verify in the code that emits them if the "history" is meant to include logins. The API's own docs say each action has `target`, so check the emitting services (`auth/service`) before promising login history on the user detail.
- Organizations: still on mock ids (PAN-014 BLOCKED). I agree with the orchestrator: no org link now, and a follow-up for PAN-014. Using `target_type=organization&target_id=<org>` is the right shape when it lands.
- The `/audit-log` route's search schema should accept `target_type`, `target_id` and `actor_user_id` (validated as a uuid, falling back to undefined on parse error, as the existing `.catch`).

### Recommendations
1. (AC1, R2) Regenerate the snapshot from 8a4efb2 via `make openapi`, run `pnpm api:types`, review the schema diff for removals and retypes, and record the commit in the impl-log. Drop the PAN-013/PAN-011b hand-patches in favour of the generated output after comparing them.
2. (AC1) Build the list on the generated `GET /api/v1/audit-logs` types; the filter state maps 1:1 to the nine query params. Single-value filters only; remove multi-select and the free-text actor filter; add `outcome`, `target_id`, `actor_user_id`.
3. (AC2, R6) Rewrite the Before/After rendering for the `{field:{from,to}}` shape and the flat shapes. Render as text only, with a defensive parser for `unknown` values.
4. (R4, ADR 0004) Add `admin:audit:read` to `ADMIN_PERMISSIONS`; move the `/audit-log` route to a `permission` requirement; use `queryView`/`ForbiddenPanel` for 403; gate the user-detail link with `<Can>`.
5. (AC3) Link from Users only. Org link as a PAN-014 follow-up.
6. (AC4) Tests with a fake `fetch` injected in `createApiClient`: loading, empty, error (500 envelope), 403 (`permission_denied`, `details.required`), 422 for `from > to`, params sent in the URL (assert the exact query string, including `from`/`to` ISO format and no email), pagination (`total`, `offset`), and changes rendering with from/to, flat and null shapes.
7. Remove the export-to-CSV of the current page unless the planner keeps it with a clear label; remove the mock `data/` files and `@faker-js` use for audit (mock file says it is replaced by this ticket).
8. Date filters: convert the picked day to UTC or local ISO datetimes; `to` = start of the day after the picked day.

### Risks
- A hidden 33-value `action` enum in the response type is just `string`; a hard-coded UI list can drift from the API. Mitigate with a test that compares the UI's options with the snapshot's query-param enum.
- The regeneration pulls in unrelated paths (orgs auth, invitations) and the envelope and `X-Request-ID` changes. A large `schema.d.ts` diff; mitigate by reviewing only removals and retypes of used operations. `pnpm typecheck` is the check.
- If the hand-patched `/me/permissions` fragment differs from the generated one (e.g. field requiredness), the PAN-011b code and tests could break. Typecheck will show it.
- Audit rows may hold `ip` and `user_agent`, which are personal data. Staff-only, but do not put them in URLs, logs or the CSV unless intended.
- Offset pagination on an append-only log that is written while the admin browses: rows may shift between pages (duplicates across pages). Acceptable; note it, because the API has no cursor.
- An unbounded `total` count query on a growing table is the API's concern (note for org-admin-api, not this repo).
- The audit-log purge (`audit_log.purged`) means old rows disappear; an empty history for an old user is legitimate.

### Open questions
1. Do login events count as part of a user's "history"? Which `target_type`/`target_id` do `auth.login_*` rows use? (I did not read the auth service's audit calls.) That decides whether the user link is `target_id` only or also `actor_user_id`.
2. Date semantics: is the picked day local or UTC? The API only takes aware datetimes. Suggest local midnight converted to ISO with offset; the owner or planner decides.
3. Keep CSV export (current page only) or drop it (R7)?
4. `app_key` filter control: free text (validated against the key pattern), or options from `GET /apps` (needs `admin:apps:read`, an extra request, may be 403 for audit-only staff)? I suggest free text or a select that falls back to text.
5. Should `errors.ts`'s hand-written envelope be replaced with the generated `ErrorEnvelope` type now that ADM-013 has put it in the spec (a follow-up, or in this ticket since the snapshot regeneration makes it possible)?
6. Do you want the extra unused paths (`/auth/orgs`, invitations) recorded as a follow-up for the product, or ignored?

Files referenced:
- /home/user/admin-pan/work/tickets/PAN-016/ticket.md
- /home/user/admin-pan/src/api/openapi.json, /home/user/admin-pan/src/api/schema.d.ts, /home/user/admin-pan/src/api/errors.ts
- /home/user/admin-pan/src/lib/permissions/registry.ts, /home/user/admin-pan/src/lib/permissions/registry.test.ts
- /home/user/admin-pan/src/features/audit-log/data/schema.ts, /home/user/admin-pan/src/features/audit-log/data/search.ts, /home/user/admin-pan/src/features/audit-log/lib/format.ts
- /home/user/admin-pan/src/features/users/api/queries.ts
- /home/user/org-admin-api/app/modules/audit/router.py, schemas.py, actions.py, repository.py, service.py, diff.py
- /home/user/org-admin-api/app/core/openapi.py, /home/user/org-admin-api/app/core/errors.py
