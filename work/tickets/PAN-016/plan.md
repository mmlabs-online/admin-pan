Status: READY

# Plan — PAN-016: Audit log on the real API

## Spec summary
`docs/spec-v1.md` §5.5 Audit log:
> Read-only, filterable list (actor, action, target, time) with before/after detail; links from users/orgs to their history.
> API: **org-admin-api ADM-004** (backlog).

`docs/spec-v1.md` §6:
> Lists use server-side pagination (`limit` ≤ 100) and stay responsive with thousands of rows.

Owner answers (ticket.md, 2026-11-17):
- **CSV export:** remove it. Record a follow-up asking org-admin-api for a server-side export endpoint. Do not fake it with a current-page export (R1).
- **Date filter:** use the browser's local time zone and show the zone under the pickers. `from` is the start of the picked local day (inclusive). `to` is the start of the local day after the picked day, because the API's `to` is exclusive.

Orchestrator notes (ticket.md, 2026-11-17):
- ADM-004 is DONE in org-admin-api (main 8a4efb2). PAN-008, PAN-011 and PAN-011b are DONE here.
- This ticket owns the **full snapshot regeneration** from 8a4efb2, `pnpm api:types`, and adding `admin:audit:read` to the registry.
- The org → audit link is deferred to PAN-014, because Organizations is still on mock ids.
- Follow the PAN-013 patterns: server-side table, `queryView`, `<Can>`, fake-fetch tests, and debounce only where needed.
- Do not touch the shared ConfirmDialog.

API facts, checked in org-admin-api 8a4efb2:
- `app/modules/audit/router.py`: `GET /api/v1/audit-logs`, `require_permission("admin:audit:read")`, response `Page[AuditLogRead]`. Query params: `actor_user_id` (uuid), `actor_kind` (`ActorKind`), `action` (`AuditAction`), `target_type` (`AuditTarget`), `target_id` (uuid), `app_key` (pattern `^[a-z][a-z0-9-]{1,31}$`, `rbac/models.py:33`), `outcome` (`AuditOutcome`), `from`/`to` (`AwareDatetime`), plus `limit`/`offset`.
- `audit/repository.py:65-73`: `from` is inclusive (`>=`), `to` is exclusive (`<`), and the order is fixed (`occurred_at DESC, id DESC`). There is no sort param.
- `audit/service.py:263-270`: `from > to` returns 422 `unprocessable` with `details=[{field:'from', reason:'after_to'}]`.
- `audit/schemas.py`: in the response, only `outcome` is an enum. `actor_kind`, `action` and `target_type` are plain strings. `changes` is `dict[str, Any] | null`.
- Login and identity events are recorded with `target=(AuditTarget.USER, user.id)`. Sources: `auth/service.py:204-209` (login_succeeded), `:185` (login_failed for known accounts), `:252-256` (logged_out), `password_reset.py:117-122`, `email_verification.py:130-135`. So `target_type=user&target_id=<id>` covers a user's sign-in history. Grants and revokes have `target_type=role_assignment` and the assignment's id as `target_id`, so this filter does not find them (follow-up F4).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Filters map to API query params; server-side pagination | `queries.test.ts`:<br>• "toAuditListParams maps each URL filter to its API param"<br>• "omits empty and invalid values"<br>• "from/to become local-day ISO instants, to = next local day"<br>• "auditLogsKeys omits undefined params"<br>`audit-log-table.test.tsx`:<br>• "next page requests offset=20 and updates ?page"<br>• "each filter control sends its param" (asserts `seen[n].url` for `action`, `target_type`, `outcome`, `actor_kind`, `app_key`, `actor_user_id`, `target_id`, `from`, `to`)<br>• "changing a filter resets page"<br>Grep: `audit-log-table.tsx` has no `getPaginationRowModel`, `getFilteredRowModel`, `getSortedRowModel` or faceted models. |
| 1a | (owner) Day boundaries are local; `to` = start of the next local day; zone shown under the pickers | `format.test.ts`:<br>• "toAuditRange: from = local midnight, to = next local midnight (exclusive)", which compares against `new Date(y, m, d).toISOString()` built in the test, so it passes in any TZ<br>• "localZoneLabel names the IANA zone and the UTC offset"<br>`audit-log-table.test.tsx`:<br>• "date pickers show the local time zone note"<br>• "from after to shows an inline error and sends no request" |
| 1b | (owner) CSV export removed | Grep: no `toCsv`, `Export CSV` or `downloadCsv` in `src/features/audit-log/`. Test `audit-log-table.test.tsx` › "has no export button". |
| 2 | Before/after rendered as text only (R6) | `format.test.ts` › "describeChanges: from/to rows, create (from null), delete (to null), flat map, reason map, null, non-object". `audit-log-detail-sheet.test.tsx`:<br>• "renders from/to changes as a Field/Before/After table"<br>• "renders a flat map as Field/Value"<br>• "R6: HTML payloads in changes, user_agent and actor_label render as text" (`container.querySelector('img, script')` is null and the text is visible)<br>Grep: no `dangerouslySetInnerHTML` or `innerHTML` in the feature. |
| 3 | Links from user detail to their filtered audit log (org link deferred to PAN-014, orchestrator note) | `users-detail-sheet.test.tsx`:<br>• "with admin:audit:read shows 'Events about this user' and 'Actions by this user' links" (asserts the `href` search params `targetType=user&target=<id>` and `actor=<id>`)<br>• "without admin:audit:read the links are hidden"<br>`audit-log-table.test.tsx` › "a ?target=&targetType=user deep link sends target_id and target_type and shows the values in the filter inputs" |
| 4 | Loading, empty, error and 403 states tested with a fake `fetch` injected into `createApiClient` (no MSW, ADR 0005) | `audit-log-table.test.tsx`:<br>• "loading"<br>• "empty (no filters)"<br>• "empty (filtered)"<br>• "error shows alert and Retry refetches"<br>• "422 shows the rejected-filters message"<br>• "403 renders ForbiddenPanel and hides the table"<br>• "403 on refetch replaces stale rows"<br>`package.json` has no `msw`. |
| 5 | (orchestrator) Snapshot regenerated from 8a4efb2; `admin:audit:read` is in the registry; `/audit-log` is no longer `pending` | `registry.test.ts`, unchanged, passes (the x-permission set equals `ADMIN_PERMISSIONS`). The CI step `pnpm api:types && git diff --exit-code src/api/schema.d.ts` is clean. The impl-log records the 8a4efb2 commit and the diff review (Approach step 1). `route-permission-guard.test.tsx` no longer lists `/audit-log/` as pending. |
| R8 | Green checks | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/api/openapi.json` | Regenerate from org-admin-api 8a4efb2 (Approach step 1). Byte-identical generator output, no hand edits. | Orchestrator note. ADR 0001: each real-API ticket refreshes the snapshot. |
| `src/api/schema.d.ts` | `pnpm api:types` | CI diffs it against the snapshot |
| `src/api/errors.ts` | Comment only. Replace the "envelope is not in OpenAPI" header with: "runtime zod parse of the envelope; its type is checked against the generated `ErrorEnvelope` in errors.test.ts". The zod runtime parse stays as it is. | The comment becomes false once the regenerated spec has `ErrorEnvelope` (ADM-013). See Approach step 2. |
| `src/api/errors.test.ts` | Add one type-level test: the zod envelope's inferred type is assignable to `components['schemas']['ErrorEnvelope']` (`expectTypeOf`, as `page.test.ts` does) | R2: the shape is now tied to the generated type, so drift fails the build |
| `src/lib/permissions/registry.ts` | Add `'admin:audit:read'` to `ADMIN_PERMISSIONS` (sorted). Change `'/_authenticated/audit-log/'` to `perm('admin:audit:read', 'GET /api/v1/audit-logs')`. Add the action `'audit.view': perm('admin:audit:read', 'GET /api/v1/audit-logs')`. | R4 and ADR 0004; registry test 1 fails on the new snapshot without this |
| `src/components/permissions/route-permission-guard.test.tsx` | Remove `'/_authenticated/audit-log/'` from the "none or pending route" list | That route is no longer pending, so the test would wrongly deny it |
| `src/features/audit-log/index.tsx` | Drop the mock import. Render `<AuditLogTable search navigate />`. Add the comment `// Route permission: admin:audit:read`. Change the subtitle to "Who did what, and when — read-only. Newest first." | AC1 |
| `src/features/audit-log/data/schema.ts` | Rewrite. `type AuditLogEntry = components['schemas']['AuditLogRead']`. `AuditAction`, `AuditTarget`, `ActorKind` and `AuditOutcome` come from `components['schemas'][…]` (the query-param enums). Add zod enums for URL validation only, each with the same compile-time equality guard as `users/data/schema.ts:12-17`. Delete the hand-written entry/changes schemas. | R2 |
| `src/features/audit-log/data/search.ts` | Rewrite `auditLogSearchSchema`: `page`, `pageSize`, `action`, `targetType`, `actorKind`, `outcome` (single enum values, `.optional().catch(undefined)`), `app` (app-key regex), `actor` and `target` (`z.guid()`), `from`/`to` (`yyyy-MM-dd`). Unknown keys are dropped. | AC1, R5 (no free text in the URL) |
| `src/features/audit-log/data/data.ts` | Rewrite. Add tone maps `Record<AuditAction, Tone>`, `Record<AuditOutcome, Tone>`, and label maps for targets, actor kinds and outcomes. Typed `Record`s make TS fail when the API adds a value. Add `actionBadgeClass(action: string)` with a neutral fallback for unknown strings, and option arrays derived from the maps. Remove `auditAppKeys`. Add `APP_KEY_PATTERN = /^[a-z][a-z0-9-]{1,31}$/` with a comment citing `rbac/models.py:33`. | AC1; responses carry plain strings |
| `src/features/audit-log/data/audit-logs.ts` | **Delete** | Mock replaced (CLAUDE.md mock-data phase) |
| `src/features/audit-log/data/audit-logs.test.ts` | **Delete** | Tests the deleted mock |
| `src/features/audit-log/data/schema.test.ts` (new) | Tests for the search schema and enums | AC1, R5 |
| `src/features/audit-log/lib/format.ts` | Rewrite.<br>• Keep `shortId`, `parseDay`, `formatDay`, `formatTimestamp` (moved here from columns).<br>• Add `actorDisplay(entry)`, `toAuditRange(from?, to?)`, `isRangeInverted`, `localZoneLabel(date?)`, `describeChanges(changes)` and `formatValue(v)`.<br>• Delete `maskEmail`, `actorLabel`, `matchesActor`, `filterByDateRange`, `diffChanges`, `formatJson`, `toCsv`. | AC1a, AC1b, AC2. The API never returns emails (API consult §2), so masking is moot. |
| `src/features/audit-log/lib/format.test.ts` | Rewrite for the new helpers | R8 |
| `src/features/audit-log/api/queries.ts` (new) | `AuditListParams`, `auditLogsKeys`, `toAuditListParams(search)` and `auditLogsQueryOptions(params, api = getApi())`. Same shape as `users/api/queries.ts`. | AC1 |
| `src/features/audit-log/api/queries.test.ts` (new) | Keys, params and request URL tests | AC1, R8 |
| `src/features/audit-log/components/audit-log-table.tsx` | Rewrite as a server-side table (users-table pattern): `api` prop (default `getApi()`), `queryView`, the states, a live region, and the detail sheet opened from a row button | AC1, AC4 |
| `src/features/audit-log/components/audit-log-filters.tsx` (new) | Filter group (`role='search'`):<br>• four single-selects (Action, Target type, Actor kind, Outcome)<br>• three validated text inputs (App key, Actor user ID, Target ID)<br>• two date pickers with the zone note and the range error<br>• Reset | AC1, AC1a. Keeps the table file readable. |
| `src/features/audit-log/components/audit-log-columns.tsx` | Rewrite the columns: Time, Actor, Action, Outcome, Target, App, and View (sr-only header). No sorting. Remove the `filterFn`s. | AC1 |
| `src/features/audit-log/components/audit-log-detail-sheet.tsx` | Rewrite for `AuditLogRead`: field list with "—" for nulls, outcome text badge, `ChangesView` (a table built from `describeChanges` plus a collapsed raw JSON `<details>`), and the Copy request ID button kept | AC2 |
| `src/features/audit-log/components/audit-log-table.test.tsx` | Rewrite with `fakeApi` | AC1, AC1a, AC1b, AC3, AC4 |
| `src/features/audit-log/components/audit-log-detail-sheet.test.tsx` (new) | Detail and changes rendering, R6 payloads, copy toasts | AC2 |
| `src/features/users/components/users-detail-sheet.tsx` | Add an "Audit history" section, wrapped in `<Can action='audit.view'>`, with two router `<Link>`s: "Events about this user" (`search={{ targetType: 'user', target: user.id }}`) and "Actions by this user" (`search={{ actor: user.id }}`) | AC3 |
| `src/features/users/components/users-detail-sheet.test.tsx` | Wrap `openDetails` in a memory router (the `user-auth-form.test.tsx` pattern) because the sheet now renders `<Link>`. Add the two link tests. | AC3; existing tests would throw outside a router otherwise |

The route file `src/routes/_authenticated/audit-log/index.tsx` and `src/components/layout/data/sidebar-data.ts` need no change: they import `auditLogSearchSchema` and `RP[...]` by name. If the implementer touches any file not listed here, the impl-log must say why.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `data/schema.test.ts` › "auditLogSearchSchema keeps valid single values and drops invalid ones" | Stale `?targetType=session`, `?action=["user.disable"]` (array) and a non-uuid `?actor=` each become `undefined` without throwing. |
| `data/schema.test.ts` › "drops unknown keys (no email key survives)" | R5 |
| `data/schema.test.ts` › "app must match the app-key pattern" | AC1 |
| `lib/format.test.ts` › "toAuditRange: from = local midnight, to = next local midnight (exclusive)" | AC1a. Also cover: one-sided ranges, `from == to` (one whole day), and a month/year rollover (`2026-12-31` gives `to = 2027-01-01` local). |
| `lib/format.test.ts` › "isRangeInverted is true only when from > to" | AC1a |
| `lib/format.test.ts` › "localZoneLabel names the IANA zone and the UTC offset" | AC1a. Assert it contains `Intl.DateTimeFormat().resolvedOptions().timeZone` and matches `/UTC[+-]\d{2}:\d{2}/`. |
| `lib/format.test.ts` › "describeChanges: from/to rows, create (from null), delete (to null), flat map, reason map, null, non-object" | AC2. An entry counts as a diff only if it is a plain object whose key set is exactly `{from, to}`. Mixed maps put the from/to entries in the diff table and the other keys in the Field/Value table. |
| `lib/format.test.ts` › "formatValue renders JSON text; null as null; long values are capped" | AC2, R6 |
| `lib/format.test.ts` › "actorDisplay: user → short id, system → label, anonymous → Anonymous, unknown kind → raw kind" | Actor column |
| `api/queries.test.ts` › "toAuditListParams maps each URL filter to its API param" | AC1. The mapping is `actor→actor_user_id`, `target→target_id`, `targetType→target_type`, `actorKind→actor_kind`, `app→app_key`, `action`, `outcome`, `from`/`to` via `toAuditRange`, and `page`/`pageSize` via `toPageParams`. |
| `api/queries.test.ts` › "omits empty and invalid values" | AC1 |
| `api/queries.test.ts` › "auditLogsKeys omits undefined params" | Cache key stability |
| `api/queries.test.ts` › "auditLogsQueryOptions GETs /api/v1/audit-logs with the query string" | AC1. Asserts `seen[0].url`. |
| `audit-log-table.test.tsx` › "loading: never-resolving fetch shows 'Loading audit log…' in the live region and aria-busy" | AC4 |
| `audit-log-table.test.tsx` › "renders rows newest-first as returned; null target/app show —; outcome text shown" | Happy path |
| `audit-log-table.test.tsx` › "empty (no filters)" / "empty (filtered)" | AC4 |
| `audit-log-table.test.tsx` › "error shows alert and Retry refetches" | AC4 |
| `audit-log-table.test.tsx` › "422 shows the rejected-filters message" | AC4. A 422 on retry gives the same result, so Reset is offered instead of Retry. |
| `audit-log-table.test.tsx` › "403 renders ForbiddenPanel and hides the table" | AC4. Uses `apiError(403,'permission_denied',{required:'admin:audit:read'})`. |
| `audit-log-table.test.tsx` › "403 on refetch replaces stale rows" | AC4 (queryView order) |
| `audit-log-table.test.tsx` › "next page requests offset=20 and updates ?page" | AC1 |
| `audit-log-table.test.tsx` › "each filter control sends its param" | AC1. Selecting each Select option or typing a valid id/key leads to `navigate` and then a request containing the param. |
| `audit-log-table.test.tsx` › "changing a filter resets page" | AC1. The `navigate` search has `page: undefined`. |
| `audit-log-table.test.tsx` › "invalid actor id or app key shows an inline error and is not sent" | AC1, R5. Typing `alice@example.com` into Actor user ID shows the error (`aria-invalid`, `aria-describedby`). No request URL and no `navigate` search contains `@`. |
| `audit-log-table.test.tsx` › "a ?target=&targetType=user deep link sends target_id and target_type and shows the values in the filter inputs" | AC3 |
| `audit-log-table.test.tsx` › "date pickers show the local time zone note" | AC1a |
| `audit-log-table.test.tsx` › "from after to shows an inline error and sends no request" | AC1a |
| `audit-log-table.test.tsx` › "Reset clears every filter key and page" | AC1 |
| `audit-log-table.test.tsx` › "has no export button and no sortable headers" | AC1b, ADR 0005 |
| `audit-log-table.test.tsx` › "View button opens the detail sheet (keyboard: Enter)" | R10 |
| `audit-log-detail-sheet.test.tsx` › "shows every field; null fields show —" | Detail |
| `audit-log-detail-sheet.test.tsx` › "renders from/to changes as a Field/Before/After table" | AC2 |
| `audit-log-detail-sheet.test.tsx` › "renders a flat map as Field/Value" and "changes null shows 'No changes recorded for this event.'" | AC2 |
| `audit-log-detail-sheet.test.tsx` › "R6: HTML payloads in changes, user_agent and actor_label render as text" | AC2, R6 |
| `audit-log-detail-sheet.test.tsx` › "unknown action string renders with the neutral tone" | Forward compatibility |
| `audit-log-detail-sheet.test.tsx` › "Copy request ID: success and failure toasts; button hidden when request_id is null" | Kept behaviour |
| `users-detail-sheet.test.tsx` › "with admin:audit:read shows 'Events about this user' and 'Actions by this user' links" | AC3 |
| `users-detail-sheet.test.tsx` › "without admin:audit:read the links are hidden" | AC3, R4 |
| `api/errors.test.ts` › "envelope type is assignable to the generated ErrorEnvelope" | R2 (type-level) |

## Approach
1. **Snapshot regeneration (first, its own commit).**
   - Run `cd /home/user/org-admin-api && git rev-parse --short HEAD`, and check that it prints `8a4efb2`.
   - Run `UV_PROJECT_ENVIRONMENT=<scratchpad>/oaa-venv /root/.local/bin/uv run python -m app.cli openapi --output /home/user/admin-pan/src/api/openapi.json`. This needs no env vars; `cli.py:748` uses `Settings.model_construct(app_env="local")`. Write nothing into org-admin-api.
   - Then run `pnpm api:types`.
   - Review `git diff` of `schema.d.ts` for **removed or retyped** fields used by `src/` (users, roles/assignments, me/permissions, organizations, auth). Additions can be skimmed. Run `pnpm typecheck` as the safety net.
   - Record in impl-log:
     - (a) The commit is 8a4efb2.
     - (b) The PAN-013 409s, on `PATCH /users/{user_id}` and on the assignment `DELETE`, are present in the generated output. Check the descriptions.
     - (c) The PAN-011b `/me/permissions` hand-patch is superseded. Note any difference in `MePermissions`.
     - (d) The set of x-permission values is the old 8 plus `admin:audit:read`. Confirmed in source: `require_permission` keys at 8a4efb2.
     - (e) `HTTPValidationError` is gone, `ErrorEnvelope`/`ErrorBody` were added, and responses now carry `X-Request-ID` headers.
     - (f) New unrelated paths: `/api/v1/auth/orgs…` (`organizations/auth_router.py`) and the invitations routes (`invitations/router.py`). These are cookie/identity endpoints with no `x-permission`. Leave them in the snapshot, because the generated file must stay byte-identical. Do not wire them (R7).
   - If typecheck shows a retyped field used by a screen, fix only the type usage needed to compile and log it. If it needs behaviour changes, stop and record it.
2. **Error envelope (decided: keep the runtime zod parse; tie its type to the spec).** `errors.ts` must validate untrusted JSON at runtime, and the generated types cannot do that. So the zod schema stays. Only its "not in OpenAPI" comment changes. Add a type-level test so the zod shape cannot drift from `components['schemas']['ErrorEnvelope']`. Do not change `ApiError` behaviour, and do not refactor callers (R7). ADR 0001's "hand-written until org-admin-api publishes an error schema" sentence goes to follow-up F6, because ADR edits are not in this plan.
3. **Registry** (R4, ADR 0004): add `admin:audit:read`, turn the route entry into `perm(...)`, add the action `audit.view`, and update the guard test list.
4. **Types and URL state** (R2, R5):
   - In `data/schema.ts`, take the generated types and add zod enums for the URL, with compile-time guards.
   - In `data/search.ts`, all filters are single values. There is no multi-select, because the API takes scalar params. Old array links fall to `undefined` via `.catch`. The URL holds only enums, an app key, uuids and days. None of these is PII (ADR 0005).
5. **Queries** (`api/queries.ts`):
   - `toAuditListParams(search)` is pure. It omits `undefined`/empty values, re-validates ids, app key and days, and builds `from`/`to` via `toAuditRange`.
   - `auditLogsKeys.list(p)` spreads only the defined params.
   - `auditLogsQueryOptions` uses `api.GET('/api/v1/audit-logs', { params: { query }, signal })` with `unwrap` and `placeholderData: keepPreviousData`. It carries the same `exhaustive-deps` disable comment as users.
   - There are no mutations.
6. **Date range** (owner): `toAuditRange(fromDay, toDay)`:
   - `from = new Date(y, m-1, d).toISOString()`
   - `to = new Date(y, m-1, d+1).toISOString()`
   - Both are aware UTC instants for local midnights, so DST is handled by the `Date` constructor.
   - If `isRangeInverted(from, to)` (compare days), the filter group shows an inline error ("Start date must be on or before the end date."), linked by `aria-describedby`. The query runs with `enabled: false` and the table shows that message instead of "Loading".
   - `localZoneLabel()` is rendered under the pickers: "Dates use your time zone: Asia/Ho_Chi_Minh (UTC+07:00). The end date is included."
   - Table and sheet timestamps already render in local time (`formatTimestamp`).
7. **Filters UI** (`audit-log-filters.tsx`):
   - **Enum filters (decided: single-select).** Use shadcn `Select` with a visible `<Label htmlFor>` on the trigger and an "Any" item (value `any`, which maps to `undefined`). Faceted multi-select would wrongly suggest OR semantics (frontend consult §4).
   - **App key (decided: validated text input, not an apps dropdown).** A dropdown needs `admin:apps:read` and an extra request, and it would fail for audit-only staff (both consults recommend text). The input is validated with `APP_KEY_PATTERN`.
   - **Actor user ID and Target ID:** validated text inputs (`z.guid()`).
   - Text inputs keep local state. A value is committed to the URL (`navigate`, `page: undefined`) 300 ms after the last keystroke (`useDebouncedValue`), and only if it is valid or empty. An invalid value shows linked error text (`aria-invalid`, `aria-describedby`) and is never sent. The local state follows external URL changes (Reset, deep link) without stealing focus while typing.
   - Every filter change resets `page`. Reset clears all filter keys and `page`.
   - There is no free-text actor search, because the API has none and the API never returns emails (API consult §2). The PAN-008 masking follow-up is resolved as "API owns it: audit rows hold no email".
8. **Table** (`audit-log-table.tsx`, users-table pattern, ADR 0005):
   - Table setup: `useTableUrlState` for pagination only (default pageSize 20), `manualPagination`, `manualFiltering`, `enableSorting: false`, `rowCount` from `total`, and `ensurePageInRange` only when the data is settled.
   - States:
     - pending: "Loading audit log…"
     - error: `role='alert'` with Retry. For a 422 (`isApiError(e, 422)`) the copy is "The API rejected these filters." with a Reset button instead.
     - forbidden: `ForbiddenPanel variant='page'` with Retry.
     - empty: "No audit entries yet." with no filters, or "No audit entries match these filters." with filters.
   - Live region: one persistent sr-only `role='status' aria-live='polite'` element outside the table. It reads "Loading audit log…", "{total} entries, page n of m", or the empty copy.
   - `aria-busy` is set only while `view.status === 'pending'`.
   - There is no `onClick` on `<tr>`. The last column has a real "View" button labelled `View {action} at {time}`.
   - The detail sheet renders from the list row, because there is no `GET /audit-logs/{id}`.
   - The CSV export and its helpers are removed (owner).
9. **Columns:**
   - **Time:** `<time dateTime>` in local time.
   - **Actor:** `actorDisplay`. A user shows a `<code>` short id with the full id in `title`. A system actor shows `actor_label` (text) or "System". An anonymous actor shows "Anonymous".
   - **Action:** a badge showing the raw text, with the tone from `actionBadgeClass` (neutral for unknown values).
   - **Outcome:** a text badge, so meaning is not carried by colour alone (R10).
   - **Target:** the type label plus the short id, or "—".
   - **App:** `app_key` or "—".
   - The IP column is dropped from the table. IP and user agent are shown in the detail sheet only (less PII on screen; R7-neutral).
10. **Detail sheet and changes** (R6):
    - Fields: ID, Time (local plus raw ISO), Action, Outcome, Actor kind, Actor (label or user id), Target type, Target ID, App, Organization ID, IP, User agent, and Request ID with the Copy button (hidden when null). Every value is a React text node, and nulls show "—".
    - `ChangesView` renders `describeChanges`. From/to entries go into a `<table>` with `<th scope='col'>` Field / Before / After. Other keys go into a Field / Value table. Values use `formatValue`: `JSON.stringify`, `break-all`, capped at 500 chars with "…", and the full text in the raw block.
    - A collapsed `<details><summary>Raw JSON</summary><pre>` shows `JSON.stringify(changes, null, 2)`.
    - There is no `aria-labelledby` on `<pre>`. Headings go `h3` Changes, then the tables via `<caption>`.
    - No `href` is ever built from audit data.
11. **Users link** (AC3, R4):
    - In `UsersDetailSheet`, add a `section` (`h3` "Audit history") inside `<Can action='audit.view'>`.
    - It holds two `<Link to='/audit-log'>`s, as described in the files table. Both carry only a uuid (R5). Links are built by the router, never from data strings (R6).
    - Navigating leaves `/users`, which unmounts the sheet.
    - Showing both links is the decision. `target` alone covers the user's account events, including logins (see the API facts above). `actor` covers what a staff user did. Both are cheap, and both are "their history" (spec §5.5).
    - No org link (orchestrator note, follow-up F3).
12. **Delete** the mock data file and its test. `@faker-js/faker` stays in `package.json`, because other mocks may use it. Do not touch dependencies.

Rules:
- R1: only real endpoints; export dropped.
- R2: generated types; the zod schemas are for the URL or for runtime envelope checks only.
- R3: untouched.
- R4: registry, `<Can>` and 403 panel.
- R5: no PII in the URL, ids validated.
- R6: text only.
- R7: follow-ups below.
- R8: tests listed.
- R9: there are no mutations.
- R10: labels, live region, buttons, table headers.
- R11: staff-only reading.

## Specialist input used
- **api-platform-engineer.** Adopted:
  - the contract and the field mapping (§1–3)
  - "API never returns emails", which resolves the PAN-008 masking follow-up
  - the `changes` shapes and the defensive parse (`_is_count` rule)
  - the snapshot regeneration checklist (§4)
  - the registry changes (§5)
  - the key and param pattern (§6)
  - users link only, with the org link to PAN-014 (§7)

  Its open questions are decided:
  - Q1, login target: verified as `user` (`auth/service.py:207`).
  - Q2 and Q3: answered by the owner.
  - Q4: text input.
  - Q5, the ErrorEnvelope: keep zod, add a type tie (step 2).
  - Q6, unused paths: keep in the snapshot, unwired, noted in impl-log.

  Rejected: invalidating `audit-logs` from the users mutations. It is a minor staleness issue, and the list refetches on mount. Kept as follow-up F7, so the users hooks stay unchanged (R7).
- **frontend-developer.** Adopted:
  - single-select enum filters
  - validated text inputs for the app key and uuids
  - `describeChanges` with table rendering and a raw `<details>` block
  - the R6 payload test
  - the live-region and `aria-busy` lessons
  - a row button instead of a `tr` onClick
  - "—" for nulls
  - the users-sheet links gated by `<Can>`
  - deleting the mock
  - most of the test list

  Rejected:
  - "Filter by this actor/target" buttons in the audit sheet. They are not in AC or spec, so they go to follow-up F8 (R7).
  - Removable filter chips. The visible filter inputs already show deep-link values, which serves the same purpose with less UI.
  - Debouncing to "avoid partial input". Adopted only as "commit when valid".

## Assumptions
- **Generated enum schema names.** The regenerated spec exposes the query-param enums as `components['schemas']['ActorKind' | 'AuditAction' | 'AuditOutcome' | 'AuditTarget']`, as FastAPI does with `StrEnum` (`UserStatus` today). If the names differ, the implementer uses the generated names and logs it.
- **422 on the date range.** Because `to` is always the start of the day after the picked end day, any non-inverted day range sends `from < to`, so the API's `after_to` 422 should not occur (picking the same day for both is valid). Any 422 that still arrives is shown by the rejected-filters state.
- **Offset pagination may shift rows.** Offset pagination on an append-only log can shift rows between pages while staff browse. This is acceptable, because the API has no cursor.
- **Bare ids are acceptable for v1.** Showing user actors as short uuids, with no email lookup, is acceptable for v1. An N+1 lookup would also spread PII.
- **Line count.** The diff will exceed ~500 lines, excluding the generated `openapi.json`/`schema.d.ts`. It is one screen and one spec feature (§5.5), mostly a rewrite of existing mock files plus their tests. Splitting would leave a half-wired screen, so there is no split.
- **Follow-ups** (the implementer copies these into impl-log; R7):
  - F1 (org-admin-api): server-side audit export endpoint (owner, 2026-11-17).
  - F2 (org-admin-api): an `org_id` filter on `GET /audit-logs`, so an org's history includes rows where the org is only context (for example org-scoped role assignments).
  - F3 (PAN-014): org detail → `/audit-log?targetType=organization&target=<org id>` once Organizations runs on real ids (switch to `org_id` once F2 lands).
  - F4 (org-admin-api): role grants and revokes to a user have `target_type=role_assignment`. A "subject user" filter (or recording the user id) would let "Events about this user" include them.
  - F5 (org-admin-api): consider `GET /audit-logs/{id}` for shareable entry links (not needed now).
  - F6 (admin-pan): amend ADR 0001's "envelope type is hand-written" note now that `ErrorEnvelope` is in the spec and type-checked.
  - F7 (admin-pan): invalidate `['audit-logs']` after users or roles mutations.
  - F8 (admin-pan): "Filter by this actor/target" shortcuts in the audit detail sheet.
  - F9 (admin-pan): the snapshot now contains `/auth/orgs…` and invitation paths. No UI uses them; revisit when a ticket needs them.

## Blocking questions
None

## Split proposal
None. It is one screen and one spec feature; see Assumptions for the size note.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/audit-log` | `admin:audit:read` (route guard and nav via `ROUTE_PERMISSIONS`; the API 403 is always handled) | loading: live region "Loading audit log…" with `aria-busy`. empty: "No audit entries yet." or "No audit entries match these filters.". error: alert with Retry; a 422 shows "The API rejected these filters." with Reset. 403: `ForbiddenPanel` page. Inverted range: inline error and no request. happy: paginated rows, newest first. | The filters, pagination and Reset change the URL search, which leads to a GET. "View" opens the detail sheet from the row data, with no fetch. Copy request ID writes to the clipboard and shows a toast. No mutations. | None (read-only) |
| `/users` detail sheet → "Audit history" section | Shown only with `admin:audit:read` (`<Can action='audit.view'>`). The destination handles a 403. | Static links; no states of their own | "Events about this user" goes to `/audit-log?targetType=user&target=<id>`. "Actions by this user" goes to `/audit-log?actor=<id>`. | None |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/audit-logs` | `limit` (≤100, default 20 here), `offset`, `actor_user_id`, `actor_kind`, `action`, `target_type`, `target_id`, `app_key`, `outcome`, `from`, `to` (all optional; `from`/`to` are aware ISO instants, `to` is exclusive) | `components['schemas']['Page_AuditLogRead_']` (`items: AuditLogRead[]`, `total`, `limit`, `offset`), via `paths['/api/v1/audit-logs']['get']` | 401 (auth-client/handler as today), 403 `permission_denied` (ForbiddenPanel), 422 `validation_error`/`unprocessable` (rejected-filters state), 5xx/network (error with Retry) | ADM-004 (DONE, 8a4efb2) |
