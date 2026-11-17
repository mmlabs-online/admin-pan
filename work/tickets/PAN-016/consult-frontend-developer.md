PAN-016 frontend consult (read-only). Main finding: the real API contract differs a lot from the mock, so this is a rewrite of the audit-log feature's data layer, not a swap. I read the API source in /home/user/org-admin-api/app/modules/audit/{router,schemas,actions,diff,service}.py. I did not read the OpenAPI snapshot or run anything.

## Findings

**1. Mock vs real contract.** The names are not mechanically swappable.
- The response row (`AuditLogRead`) has: `id`, `occurred_at`, `actor_kind` (user|system|anonymous), `actor_user_id?`, `actor_label?`, `action`, `outcome` (success|failure|denied), `target_type?`, `target_id?`, `app_key?`, `org_id?`, `changes?`, `ip?`, `user_agent?`, `request_id?`. Every field after `outcome` can be null, and the mock treats several as required.
- The mock has no `actor_kind`, no `outcome`, and an `actor_email` that does not exist in the API.
- Action names differ: the real ones are past tense, such as `user.disabled`, `organization.created`, `role_assignment.granted`, `auth.login_failed`, `auth.logged_out_all`, `device_session.reuse_revoked`, `audit_log.purged`, `email_retention.purged`, `app.registered` and `app.admin_origins_set`. The catalogue has about 34 values.
- `target_type` values are: organization, user, app, permission, role, role_assignment, device_session, invitation. The mock's `session` is wrong.
- `src/features/audit-log/data/schema.ts` (zod enums), `data.ts` (`actionTones`, options) and `search.ts` are all stale. The mock tests and `lib/format.ts` helpers (`maskEmail`, `matchesActor`, `filterByDateRange`, `toCsv`) are affected too.
- Per R2, types must come from the generated OpenAPI types. The schema file should keep only UI-side value lists/tones, typed with `satisfies Record<components['schemas'][...], Tone>`. The tone map then fails typecheck when the API adds an action.
- Unknown future actions must still render. Use a fallback tone and show the raw string. Do not use a closed zod enum on the response (the mock does this), or one new action breaks the whole page.

**2. Email masking follow-up is moot.**
- The API never stores or returns an email in audit rows. `actor_label` is set only for system actors (the system actor's name, at most 64 characters). User actors carry `actor_user_id` only, and anonymous actors carry nothing.
- Resolve the PAN-008 follow-up as "API owns it: no email exists in audit data". Remove `maskEmail`, `actor_email` and the "Email, user ID or system" placeholder.
- Display the actor as: system → `actor_label`; user → short id (as a `<code>` with the full id in `title` and in the detail sheet); anonymous → "Anonymous". Add a `kind` text column. Do not resolve user ids to emails (N+1, PII, out of scope).
- I would flag in the open questions that `actor_label` is API-controlled text, so it is rendered as text only.

**3. `changes` is not `{before, after}`.**
- Admin mutations store `{field: {from, to}}`, which is already a diff. Identity and failure rows store a flat object of allowlisted scalars (service.py docstring). Create rows have `from: null`, delete rows `to: null`.
- The mock's Diff/Before/After panels and `diffChanges` assume the old shape. Replace them as follows:
  - Detect per field: `isFromTo(v)` means a plain object whose keys are exactly `from` and `to`. If so, render a row with the field, "from" and "to" values.
  - Otherwise treat it as a flat scalar map and render field/value rows.
  - Use a real `<table>` with `<th scope=col>` (Field / Before / After, or Field / Value). The diff is then scannable and not conveyed by colour alone (R10).
  - Value formatting: `JSON.stringify` (null shown as `null`, strings quoted, arrays such as `origins` compact), wrapped in a `<code>` with `break-all`.
  - Cap values (for example, truncate over 500 characters with the full text still in the DOM, or a "Show full" toggle).
  - Add a collapsed "Raw JSON" `<details>` with `JSON.stringify(changes, null, 2)` in a `<pre>`, for support copy/paste.
- R6: render only through React text nodes. No `dangerouslySetInnerHTML`, and no `href` built from change values or user_agent. `user_agent`, `actor_label`, `request_id` and `ip` are API-controlled strings and also go in as text. Put one test in with `<img onerror>` and `<script>` payloads in `changes`, `user_agent` and `actor_label`, asserting they appear as text and no element is created.
- Guard against non-object `changes` (the schema says `dict | null`, but be defensive) and against deep nesting, using `JSON.stringify` and no recursive renderer.

**4. Filters to API params.** Each filter takes a single value, because the API takes scalar enums. The mock's multi-select `array` filters would silently drop selections.
- `action`, `target_type`, `outcome` and `actor_kind` are single-select (for example a shadcn Select with an "Any" option). The faceted multi-select cannot be used as is. Alternatively, send the param only when exactly one value is selected, as users does for `status`. That would be misleading for 2-of-34 selections, so I prefer single-select.
- `app_key` is a free string with a pattern (`APP_KEY_RE`). Do not hardcode `['admin','stoktok','identity']`. Options either come from `GET /api/v1/apps` (needs `admin:apps:read`, so it is a separate permission; handle its 403 by falling back to a text input) or are a plain input validated client-side against the key regex before it is sent. Pick one in the plan. The simpler choice is a text input validated by regex, which keeps the audit screen independent of apps.
- `actor_user_id` and `target_id` are UUIDs. They are URL state as `actor` and `target`, validated by `z.uuid()` with `.catch(undefined)`. They come from links, and a small text input lets a user paste an id. An invalid UUID gives a 422 from the API, so validate before sending and show an inline error.
- Each active id filter shows a removable chip ("Actor: 1a2b3c4d…" with a clear button), so a deep link does not leave a hidden filter.
- `from` and `to` are `AwareDatetime`, and a naive datetime is a 422. Take the day pickers (the existing `DatePicker`) but convert explicitly:
  - `from` = start of the local day as `toISOString()`, a UTC instant.
  - `to` = start of the next local day, exclusive, if the API's upper bound is exclusive. Check `AuditLogRepository` (`occurred_to` is `<` or `<=`) and encode it in a pure `toAuditRangeParams` that is unit-tested.
  - Which time zone defines "a day" is an open question. The default is the browser's local zone, with the zone shown under the pickers ("Times shown in your local time, UTC+7").
  - Keep URL state as `yyyy-MM-dd` (non-PII), as the mock does with `parseDay` and `formatDay`, and convert to ISO only for the request.
  - Reject `from > to` inline and do not send.
  - `to` is not "inclusive of the picked day" unless the conversion above makes it so. Say that in the helper text.
- Sorting: the API has no sort parameter and returns newest first (check the repository `ORDER BY`). Per ADR 0005 sorting stays off, so remove the mock's `occurred_at` sorting state.
- Pagination: `toPageParams`, `manualPagination`, `rowCount` from `total`, `placeholderData: keepPreviousData`, and `ensurePageInRange` only when settled. Same as users.
- Reuse the `queryView` ForbiddenPanel (page variant) for 403. Gate the route and nav with `admin:audit:read` in `registry.ts`, replacing `pending`. The registry entry needs the endpoint string (`GET /api/v1/audit-logs`), as the other `perm(...)` lines show.

**5. URL state.**
- Keep in the URL: `page`, `pageSize`, `action`, `targetType`, `outcome`, `actorKind`, `app`, `from`, `to`, `actor` (uuid), `target` (uuid).
- Do not put any text typed by a user that could be an email in the URL. Every filter above is an enum, a key, a uuid or a date, so nothing is debounced as PII. The text inputs for `app` and the uuids can still use a short debounce (300 ms via `useDebouncedValue`) so partial input is not sent. Only send valid values.
- `useTableUrlState` supports `string` and `array` column filters. Reset page to 1 on any filter change, which the hook does for column filters. The date and id filters are written through `navigate` directly, so they need `page: undefined` as the mock's `setDay` does. Test that.
- Single-value enums stored as strings, not arrays. Old `?action=[...]` (array) links hit `.catch(undefined)`.
- Update the schema's `.catch` defaults for stale values (such as `session`) so an old link does not crash the page. This is `catch(undefined)`, not `[]`.

**6. Detail view.**
- The mock sheet works from the row that was clicked. There is no `GET /audit-logs/{id}` (check the router: only the list). So the sheet renders from the list row, with no extra fetch. That needs no per-section states. Say so in the plan.
- Sheet fields: Time (local plus the raw ISO), Action badge with text, Outcome badge (text, not colour alone), Actor (kind, label or id), Target type and id, App, Org id, IP, User agent, Request id (with the Copy button; keep the button label, and handle clipboard failure with a toast as now), and Changes.
- Add "Filter by this actor" and "Filter by this target" buttons or links in the sheet when `actor_user_id`/`target_id` exist. They are small and need no extra API.
- `target_type`, `target_id`, `ip` and `user_agent` can all be null. Show "—" rather than a literal "null" or "undefined".

**7. Link from the users detail sheet.**
- Add a link in `UsersDetailSheet` to `/audit-log?target=<user.id>`. Add a second link, `?actor=<user.id>` ("Actions by this user"), since both filters exist. Both ids are UUIDs, so R5 is fine.
- Use the router `<Link to='/audit-log' search={{ target: id }}>`, never a string `href` built from data (R6). Put the target type in as well, `search={{ target: id, targetType: 'user' }}`, so the filter chip is explicit.
- Gate it with `<Can action='audit.read'>` (add that action key to the permission registry), so the link is hidden without `admin:audit:read`. The destination handles 403 anyway (R4).
- The sheet is inside a modal. After navigating, the sheet must close. Check that the route change unmounts it. If `UsersProvider` keeps the open state in context, call `onOpenChange(false)` on click.
- Why not from organizations yet: the Organizations screen is on mock ids that are not real UUIDs from the API. A link would pair a mock `org_id` with real audit data, which returns nothing (or a 422 if the mock id is not a uuid), and it would look like a bug. Record "org → audit history (`?target=<org id>&targetType=organization`, or the `org_id` filter once the API adds it)" as a PAN-014 follow-up.
- Note: the API has no `org_id` filter, only `target_id` and `app_key`. So a link from an org would be `target_type=organization&target_id=...`, and it would miss events where the org is only context (`org_id` set on a role_assignment row). Flag that to org-admin-api as a follow-up. It matters for the acceptance criterion "links from user and org detail".

**8. States and a11y (lessons from PAN-013 and PAN-010b).**
- Use one persistent sr-only `role='status' aria-live='polite'` element outside the table. It reads "Loading audit log…", then "{total} entries, page n of m" or "No entries match these filters". It does not live inside the table (the mock's status says "{n} matching entries" from client data).
- Do not put `role='status'` on the visible message row. Set `aria-busy` on the table only while the view is pending, not on every refetch (`aria-busy={q.isFetching}` in users-table.tsx:118 was flagged).
- Empty with and without filters ("No audit entries yet." vs "No entries match these filters."). Error with `role='alert'` and Retry. 403 uses ForbiddenPanel.
- The actions column and any icon-only column get an sr-only header. Table rows are clickable: put a real button in the first cell ("View entry <short id> at <time>") instead of `onClick` on `<tr>`, which is not keyboard reachable (the mock's `TableRow onClick` has this problem). Use a `<time dateTime>` for timestamps.
- Filter inputs all need linked labels and linked error text (`aria-describedby`, `aria-invalid`). The `role='search'` group stays.
- The `Select`s need visible labels. Clearing a filter chip returns focus to a sensible element (the filter group's first control).
- Sheet: the nested `<h4>` headings need `<h3>` context. Do not use `aria-labelledby` on `<pre>`. Use a `role='group'` or `<figure>` with a caption if kept at all (the mock does this for `pre`).

**9. CSV export.** Today it exports the client-side filtered set. With server-side data it would export only the visible page, which is misleading. Options: remove it (my recommendation; it is not in the ticket's acceptance criteria and R7 says stay in the plan) or keep it as "Export this page", clearly labelled. If kept, the formula-injection guard stays. I recommend removing it and logging a follow-up for a server-side export (there is no API for it, R1: do not fake it).

## Recommendations
- AC1, R2: regenerate the snapshot first (as the ticket says), then build `src/features/audit-log/api/queries.ts` with `auditLogsKeys`, `toAuditListParams` (pure, tested), and `auditLogsQueryOptions(params, api = getApi())` using the users pattern. An AuditLog provider is optional; passing `api` as a prop is simpler for one component tree.
- AC1: `toAuditListParams` omits empty values, converts days to ISO instants, and includes only valid uuids and app keys. Tested for each key.
- AC2, R6: write `ChangesView` as above, with a pure `describeChanges(changes)` returning `{kind: 'fromTo' | 'flat' | 'empty', rows}`. Unit-test it.
- AC3: users sheet links as above. Registry/Can action for `audit.read`. Orgs deferred to a PAN-014 follow-up.
- AC4, R8: tests via `fakeApi` (see the test list).
- Delete the mock files (`data/audit-logs.ts` and its tests) once the real data layer is in, and update the mock-data note, since CLAUDE.md says each mock file names its replacing ticket.
- Keep the `Header`/`Main` shell in `index.tsx` and route `validateSearch` as is, with the new schema.
- Permissions: add `admin:audit:read` to the registry and the generated permission list. Check whether `<Can>` takes an action key (`roles.viewAssignments` suggests a map of actions to permissions) and add `audit.read` there.

## Test list (Vitest browser, fake fetch)
Table and query:
1. Loading: a never-resolving fetch shows the status text and `aria-busy`.
2. Renders rows with total and `rowCount` (outcome, kind, action, short ids). Null target and actor render "—" / "System" / "Anonymous".
3. Empty with no filters and empty with filters (different copy).
4. 403 shows ForbiddenPanel and retry works. 500 shows an alert with Retry that refetches.
5. 422 on a bad param shows the error, not a crash.
6. Pagination: next page sends `offset`/`limit`. A `page` beyond `total` is corrected only after settled data.
7. Each filter sends the right param (`action`, `target_type`, `outcome`, `actor_kind`, `app_key`, `actor_user_id`, `target_id`). `seen[n].url` is asserted. Empty filters send nothing.
8. Date range: `from`/`to` go out as aware ISO strings. `to` boundary as decided. `from > to` shows an inline error and sends no request.
9. Changing a filter resets to page 1.
10. Invalid uuid or app key in the URL is ignored (the `.catch`), and a stale array `action` param does not crash.
11. No filter value containing `@` appears in any request URL or in the router URL.
Detail sheet:
12. Opens from the row's button (keyboard: Tab and Enter). Shows all fields, and null fields show "—".
13. `{field: {from, to}}` renders as rows with Before and After columns. Create (`from: null`) and delete (`to: null`) render correctly. A flat scalar map renders as Field/Value. `changes: null` shows "No changes recorded".
14. R6 payloads as text only (`<img onerror>` in `changes`, `user_agent`, `actor_label`). `container.querySelector('img, script')` is null.
15. Unknown action string renders with the fallback tone.
16. Copy request ID success and failure toasts. The "filter by this actor/target" buttons navigate with the right search.
Users link:
17. Users detail sheet shows both links with the right `search` when the user has `admin:audit:read`, and hides them without it.
Pure functions:
18. `toAuditListParams` and the day-to-ISO helper (including the DST-free `Asia/Ho_Chi_Minh` case and a zone offset), `auditLogSearchSchema`, `describeChanges`, and the registry mapping for `/audit-log`.
a11y:
19. The live region text changes through loading, loaded and empty. Labels link to inputs, error text is linked by `aria-describedby`.

## Risks
- Snapshot regeneration may drop PAN-013's hand-patched 409s and PAN-011b's `/me/permissions` (the ticket already flags this). Diff the snapshot and `pnpm api:types` output before and after, and keep the users tests as the safety net.
- `actor_user_id` shown as a bare uuid is hard to read for staff. Without id-to-email resolution it is a real usability gap. Offering a link to the user's page is not possible without a user-by-id route in the UI (check whether `/users` can open a detail by id). I recommend accepting it for v1 and recording a follow-up.
- Single-select enum filters differ from the mock and from other screens' multi-selects. The product spec may expect multi-select. The API contract decides, so I would not fake it.
- The time zone for day boundaries is a product decision; the wrong default makes "yesterday" filters look wrong near midnight.
- Large `changes` values (`origins` arrays) could make the detail sheet wide. Break-all and the truncation cap above cover it.
- Removing CSV export removes an existing mock feature. Confirm it is not in spec §5.5 before dropping it.

## Open questions
1. Is `occurred_to` inclusive or exclusive in `AuditLogRepository`, and what time zone should the "day" pickers use (browser local, or `Asia/Ho_Chi_Minh`)? (Spec §8 OQ6 asks the same for the dashboard.)
2. `app_key` filter: free-text input with regex validation, or a dropdown from `GET /api/v1/apps` (extra permission and request)? I recommend the input.
3. Keep CSV export as "this page only", or drop it? I recommend dropping it and logging a follow-up.
4. Should the planner ask org-admin-api for an `org_id` filter (and possibly a `GET /audit-logs/{id}`) as follow-ups? An `org_id` filter is needed for a complete "org → history" link.
5. Is a users-detail link by `actor` as well as `target` wanted, or only `target` as the ticket says? I recommend both; both are cheap.

Files read: /home/user/admin-pan/work/tickets/PAN-016/ticket.md, /home/user/admin-pan/src/features/audit-log/{index.tsx,data/schema.ts,data/search.ts,data/data.ts,lib/format.ts,components/audit-log-table.tsx,components/audit-log-detail-sheet.tsx}, /home/user/admin-pan/src/features/users/{components/users-table.tsx,components/users-detail-sheet.tsx,api/queries.ts}, /home/user/admin-pan/src/routes/_authenticated/audit-log/index.tsx, /home/user/admin-pan/src/lib/permissions/registry.ts, /home/user/admin-pan/src/test-utils/api.ts, /home/user/admin-pan/docs/adr/0005-server-side-tables.md, /home/user/admin-pan/work/tickets/PAN-013/a11y-review.md, and the org-admin-api audit module files named above. I did not open PAN-010b's a11y review, the OpenAPI snapshot, the audit repository, the existing audit tests, or `<Can>` and the `audit.read` action map.
