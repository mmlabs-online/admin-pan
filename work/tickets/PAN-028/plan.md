Status: READY

# Plan — PAN-028: App join requests (list, approve, reject)

## Spec summary
- `docs/spec-v1.md` §5.4: "Apps registry (join policy, org mode, origins, default role), roles and their permissions, role assignments per user (app scope or one org), revoke sessions."
- §7: "Every admin task org-admin-api supports can be done in the UI, without raw API calls." Owner, 2026-11-17 (ticket notes): "build what the API already offers first".
- The API side is org-admin-api USR-03g (DONE, merged in c41ef57). The contract is taken from the shipped code at b79cf77 (`app/modules/join_requests/{router,service,schemas}.py`), not from the pre-implementation consult in that repo.

The UI shows only what the API offers: a per-app list filtered by `status` with paging, and approve/reject without a body. There is no search, no sort, no role choice, no reject reason and no cross-app inbox. Anything beyond that is a follow-up (R1).

## Acceptance criteria → verification
| # | Criterion (ticket) | How the reviewer verifies it |
|---|---|---|
| 1 | Join requests per app listed from the API, paginated, with the filters the API supports | `app-join-requests-tab.test.tsx`: "fetches GET …/join-requests?status=pending&limit=20&offset=0 only when the tab is opened"; "status filter Approved sends status=approved&offset=0 …"; "pager: total 25 …"; "page clamp …". e2e `apps join requests: …`. Filters are `status` (pending, approved, rejected) and paging only, which matches openapi.json:3918-3955. |
| 2 | Approve and reject with a confirmation naming the requester; non-optimistic; list refreshed after success | `app-join-request-decision-dialog.test.tsx`: "approve confirm names requester and app …", "reject confirm …", "Cancel sends nothing …", "confirm sends exactly one POST with no body … row stays until the refetch …", "invalidations …". e2e: Cancel sends no POST and focus returns to the row button; confirm sends one POST, the row leaves the pending list and focus moves to the heading. |
| 3 | API errors shown inline (403, 404, 409) | Decision-dialog tests: "403 → inline ForbiddenPanel", "404 → 'This join request no longer exists.' + list refetched", "each 409 reason → fixed copy (table-driven)", "409 email_unverified is not an auth-gate event". `errors.test.ts` › `joinRequestDecisionError`. |
| 4 | Loading, empty, error and 403 states tested with the fake fetch (ADR 0005) | `app-join-requests-tab.test.tsx` › "loading / empty per filter / error + Retry / 403 inline". Uses `fakeApi` from `src/test-utils/api.ts`. |
| R8 | Checks green | `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`), `pnpm build`, and the e2e run (same env) all pass. They are recorded in impl-log. |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/lib/permissions/registry.ts` | Add `ACTIONS['apps.viewJoinRequests'] = perm('admin:users:read', 'GET /api/v1/apps/{key}/join-requests')` and `ACTIONS['apps.decideJoinRequest'] = perm('admin:roles:assign', 'POST /api/v1/apps/{key}/join-requests/{request_id}/approve', 'POST /api/v1/apps/{key}/join-requests/{request_id}/reject')`. **Do not** touch `ADMIN_PERMISSIONS`. | R4 / ADR 0004. `registry.test.ts` checks the entries against `x-permission`. |
| `src/features/apps/api/queries.ts` | `JOIN_REQUESTS_PAGE_SIZE = 20`; `JoinRequestStatus` type (the generated query enum); `appsKeys.joinRequestsAll(key)` and `appsKeys.joinRequests(key, {status, limit, offset})`; `appJoinRequestsQueryOptions`; `useDecideJoinRequestMutation(appKey, decision, api)`. | AC1, AC2, R2, R9 |
| `src/features/apps/data/app-schema.ts` | `export type JoinRequest = components['schemas']['JoinRequestRead']`. | R2: generated types only |
| `src/features/apps/data/data.ts` | `joinRequestStatusOptions` (Pending, Approved, Rejected) and `joinRequestStatusLabel(status: string)`, which returns `'Unknown'` for unexpected values because the schema types `status` as a plain `string`. | AC1. Narrowing lives in one place. |
| `src/features/apps/data/errors.ts` | `joinRequestDecisionError(error, decision): AppAlert` and `joinRequestRefusal(error): string \| undefined` (exports the existing `firstReason` logic for the mutation hook). | AC3 |
| `src/features/apps/components/app-join-requests-tab.tsx` (new) | Tab body: policy/status notes, status filter, table, pager, page clamp, row actions, focus management, dialog host. | AC1, AC2 |
| `src/features/apps/components/app-join-request-decision-dialog.tsx` (new) | One `ConfirmDialog` parameterised by `decision: 'approve' \| 'reject'`, with the in-flight guard. | AC2, AC3, R9 |
| `src/features/apps/components/app-detail-sheet.tsx` | Fourth tab "Join requests" (between Permissions and Credentials) for every app except `admin`, wrapped in `<Can action='apps.viewJoinRequests'>`. Sheet description becomes "App settings, permissions, join requests and credentials." | AC1 |
| `src/features/apps/components/test-data.ts` | `JOIN_REQUESTS` fixtures plus a `joinRequestsPage()` helper. | Tests |
| `src/features/apps/components/test-fixtures.tsx` | `appsServer`: answer `GET /api/v1/apps/{key}/join-requests` (filter by `status`, 404 for `admin` like the API). | Tests |
| `src/features/apps/components/app-join-requests-tab.test.tsx` (new) | List tests. | AC1, AC4 |
| `src/features/apps/components/app-join-request-decision-dialog.test.tsx` (new) | Dialog and mutation tests. | AC2, AC3 |
| `src/features/apps/data/errors.test.ts` | `joinRequestDecisionError` cases. | R8 (logic unit-tested) |
| `src/features/apps/components/app-detail-sheet.test.tsx` | Update "tabs are …" to expect 4 tabs for stoktok and 3 for `admin` (no Join requests). Add: the tab is hidden when `admin:users:read` is denied. | Existing test asserts 3 tabs |
| `src/features/apps/api/queries.test.tsx` | Key-shape tests: `joinRequests` is under `appsKeys.detail(key)` and holds only `{status, limit, offset}`. | R5 (no PII in keys) |
| `e2e/support/fake-api.ts` | Per-install join-request state. For each app: `GET …/join-requests` (status filter + `page()`, 404 for `admin`); for each request: `POST …/{id}/approve` and `/reject` (mutate status, 409 `not_pending` if already decided). | e2e |
| `e2e/pages.e2e.ts` | New test `apps join requests: …` (see Tests). | e2e smoke + focus (ADR 0006) |

Not touched: `src/api/openapi.json` and `src/api/schema.d.ts` (see Approach §0). Also not touched: `src/features/audit-log/**` (it already has `app.join_requested`, `app.join_request_approved`, `app.join_request_rejected` and the `join_request` target, `audit-log/data/data.ts:41-43,97`), `ROUTE_PERMISSIONS` (no new route) and `src/lib/forbidden.ts`.

## Tests to write
All Vitest browser-mode tests use `fakeApi`/`json`/`apiError` (`src/test-utils/api.ts`) and `renderApps` + `appsServer` (`test-fixtures.tsx`). Open the sheet, then the "Join requests" tab, as `openTab` does in `app-credentials-tab.test.tsx`. **Always `await expect.element(...)` before reading `.element()`/`.elements()`** (the PAN-019 flakiness lesson).

| Test (file › name) | Covers |
|---|---|
| `app-join-requests-tab.test.tsx` › fetches `GET /api/v1/apps/stoktok/join-requests?status=pending&limit=20&offset=0` only after the tab is selected (none while on Overview) | AC1, lazy mount |
| › loading "Loading join requests…" (`role=status`) / empty "No pending join requests." (and "No approved join requests." after switching filter) / error "Couldn't load join requests." + Retry refetches / 403 `permission_denied` → inline ForbiddenPanel naming `admin:users:read` | AC4 |
| › rows: requester `display_name` with the email on a muted second line; a null `display_name` shows the email only; Requested shows a `<time dateTime>`; status label; badges "Email not verified" when `email_verified=false` and "Account disabled" when `user_status !== 'active'`; "(you)" when `user_id === selfUserId` (via `WithPermissions userId`) | AC1, R4 mirror |
| › `display_name` of `<img src=x onerror=alert(1)>` renders as literal text: no `img` element in the sheet, and the text is present | R6 |
| › status filter: choosing Approved sends `status=approved&offset=0` (also from page 2); the Decided column is shown, with "(by you)" when `decided_by === selfUserId`; no Approve/Reject buttons on non-pending rows; the Actions column is absent for approved/rejected | AC1 |
| › pager: total 25 → "Showing 1–20 of 25", Next sends `offset=20`, Previous back to `offset=0` | AC1 |
| › page clamp: on offset 20 with total 21, deciding the only row → the refetch returns `items: [], total: 20` → the tab requests `offset=0` and shows rows (no empty page 2) | AC1, caller item |
| › only `admin:users:read` granted: rows shown, no Approve/Reject buttons, note "Approving or rejecting requests needs admin:roles:assign." | R4 |
| › policy notes: calechip (`open`) shows "This app's join policy is Open …" plus the list; stoktok fixture (`status: disabled`) shows the disabled note; an approval + active app shows neither | caller item, R4 mirror |
| › no request URL contains `@` or the fixture email (assert over `seen`), and the query cache keys (`queryClient.getQueryCache().getAll().map(q => q.queryKey)`) do not contain any fixture email | R5 |
| `app-join-request-decision-dialog.test.tsx` › approve: Approve on the Ada row opens an alertdialog "Approve join request?" naming "Ada Lovelace", her email, "Stoktok" and "stoktok", and "the app's default role"; it does **not** contain "will be granted" / a role id | AC2, caller item |
| › reject: the dialog names requester and app, says "can't request to join this app again for a while", contains no digit (no hardcoded cooldown), and the confirm button is the destructive variant | AC2 |
| › Cancel (and Escape) sends no POST; focus returns to that row's button (Approve or Reject, whichever opened it) | R9, R10 |
| › confirm sends exactly one `POST /api/v1/apps/stoktok/join-requests/{uuid}/approve` (path only, no body, `request.body === null`) even on double-click; while pending, the confirm reads "Approving…" and both buttons are `aria-disabled`; Escape is ignored while pending; the row stays visible and pending until the refetch resolves (hold the refetch on a deferred promise); afterwards the row is gone, toast "Join request approved." (no name, no email), focus is on the "Join requests" heading | AC2, R9, R10 |
| › same flow for reject: toast "Join request rejected." | AC2 |
| › invalidations: spy `queryClient.invalidateQueries`. Approve → called with `appsKeys.joinRequestsAll('stoktok')` and `usersKeys.detail(<user_id>)`; reject → only `joinRequestsAll`; **never** with `['me','permissions']` (`mePermissionsKeys.all`) | caller item, F5 |
| › 403 `permission_denied` → inline ForbiddenPanel in the dialog, dialog stays open | AC3, R4 |
| › 404 → "This join request no longer exists." and the list is refetched | AC3 |
| › table-driven 409 `{code:'conflict', details:[{field:'request_id', reason}]}` for `not_pending`, `app_disabled`, `join_policy_changed`, `user_disabled`, `email_unverified`, `default_role_unusable` and an unknown reason → the fixed copy below; the server text "server text" is never shown; the list is refetched; `app_disabled`/`join_policy_changed`/`default_role_unusable` also refetch `GET /api/v1/apps/stoktok` | AC3 |
| › 409 `email_unverified` is not an auth-gate event: with `setUnauthorizedHandler(spy)` (`src/api/auth-hooks.ts`), the spy is never called; no ForbiddenPanel; the inline copy is "This user hasn't verified their email …"; the dialog stays open | caller item (AuthGate), R3 |
| › network failure (fetch throws) → "We couldn't confirm the decision. Check the list before trying again." and the list is refetched | AC3 |
| › after a 409 `not_pending` whose refetch drops the row, closing the dialog focuses the heading (the row button is gone) | R10 |
| `errors.test.ts` › `joinRequestDecisionError`: every reason; unknown reason → generic copy (not the server message); 404; 403 → `{kind:'forbidden'}`; network/5xx → unknown-outcome copy; 422 → fallback | R8 |
| `queries.test.tsx` › `appsKeys.joinRequests('stoktok', {status:'pending', limit:20, offset:0})` equals `['apps','detail','stoktok','join-requests',{status:'pending',limit:20,offset:0}]` and starts with `appsKeys.detail('stoktok')` | R5, invalidation scope |
| `app-detail-sheet.test.tsx` › tabs: stoktok has Overview, Permissions, Join requests, Credentials (4); admin has 3 with no Join requests; with `admin:users:read` denied (and `admin:apps:read` granted), stoktok has no Join requests tab | AC1, R4 |
| `e2e/pages.e2e.ts` › `apps join requests: stoktok tab lists pending, passes axe; reject confirm names requester and app, Cancel sends no POST and focus returns to Reject; approve sends one POST with no body, the row leaves the pending list, focus on the heading; Approved filter shows it; no email in any request URL` | e2e smoke, focus (ADR 0006) |

## Approach

### 0. OpenAPI snapshot: no regeneration
- The snapshot (`src/api/openapi.json`, c41ef57) already contains the three operations (openapi.json:3905-4313), `JoinRequestRead` (:1251-1339) and `Page_JoinRequestRead_` (:2187).
- I compared it with org-admin-api at b79cf77, and it matches field for field:
  - `schemas.py:10-21`: 11 fields with the same types and nullability, `status`/`user_status` as plain strings.
  - `router.py:24-80`: `status` Literal with default `pending`, `PageDep`, the 409 descriptions, `x-permission`.
- The planner has no shell, so it could not run the regeneration itself. The **implementer runs it once as a check**, outside the repo:
  ```
  cd /home/user/org-admin-api && UV_PROJECT_ENVIRONMENT=<scratchpad>/oaa-venv DATABASE_URL=postgresql+asyncpg://x:x@localhost/x /root/.local/bin/uv run python -m app.cli openapi <scratchpad>/openapi-b79cf77.json
  ```
  Then diff the three paths plus `JoinRequestRead` and `Page_JoinRequestRead_` against the snapshot (e.g. with `jq`). Record the result in impl-log.
- Expected: no difference, so **do not** regenerate. Regenerating would pull in ADM-015 (`GET /api/v1/stats/dashboard`, `admin:stats:read`) and break `registry.test.ts` "ADMIN_PERMISSIONS equals the set of x-permission values". That belongs to PAN-020 (R7).
- If a join-request difference appears: stop and record it in impl-log as a blocker for the orchestrator. Do not regenerate partially.

### 1. Registry (R4, ADR 0004)
- Add the two actions from the Files table. Two actions, not three, because approve and reject declare the same permission and are always shown together.
- Never gate on `admin:*`. The approve `_guard_privileged` path cannot fire, because `usable_default_role` refuses `is_admin` default roles (identity consult F4). Any 403 is still shown through `forbiddenCopy`.

### 2. Queries (`queries.ts`, R2, R9)
- Keys:
  ```ts
  joinRequestsAll: (key: string) => [...appsKeys.detail(key), 'join-requests'] as const,
  joinRequests: (key: string, p: JoinRequestsParams) =>
    [...appsKeys.joinRequestsAll(key), { status: p.status, limit: p.limit, offset: p.offset }] as const,
  ```
  Only the app key, status and paging go into keys. Emails and display names never do.
- `appJoinRequestsQueryOptions(key, {status, limit, offset}, api)`:
  - Calls `api.GET('/api/v1/apps/{key}/join-requests', { params: { path: { key }, query: { status, limit, offset } }, signal })`.
  - `status` is always sent explicitly.
  - **No `placeholderData: keepPreviousData`.** On a filter change, stale rows from another status would otherwise show briefly with the wrong actions. The tab shows "Loading…" instead.
- `useDecideJoinRequestMutation(appKey, decision: 'approve' | 'reject', api)`:
  - `mutationFn: (requestId: string) => unwrap(await api.POST('/api/v1/apps/{key}/join-requests/{request_id}/<decision>', { params: { path: { key: appKey, request_id: requestId } } }))`. Use two literal path strings chosen by `decision`, so the types stay checked. No body.
  - `retry: false` and `meta: { handlesOwnErrors: true }`, so the global `handleServerError` toast is skipped. Inline errors only.
  - `onSuccess: (data) =>`
    - invalidate `appsKeys.joinRequestsAll(appKey)`;
    - if approve, also invalidate `usersKeys.detail(data.user_id)` (import from `@/features/users/api/queries`). That covers `[…detail, 'role-assignments', p]` because approve may create an app-scope assignment.
    - **Never** invalidate `mePermissionsKeys.all`: grants go to non-admin apps only (identity consult F5), and `permission-refresh.ts` already handles revoked staff rights.
  - `onError: (error) =>`
    - if 404, 409 or `isUnknownOutcome(error)`, invalidate `joinRequestsAll(appKey)`;
    - if `joinRequestRefusal(error)` is `app_disabled`, `join_policy_changed` or `default_role_unusable`, also invalidate `appsKeys.detail(appKey)` (refreshes the app, so the notes update).
  - Never optimistic: there is no `onMutate` and no `setQueryData`.

### 3. Errors (`errors.ts`)
`joinRequestDecisionError(error, decision)` uses fixed copy only. It never shows the server `message` for mapped cases, and unknown 409 reasons get a generic line. Checks are applied in this order:
1. `isUnknownOutcome` → "We couldn't confirm the decision. Check the list before trying again."
2. 404 → "This join request no longer exists."
3. 409 (by `details[0].reason`):
   - `not_pending` → "Someone already decided this request. The list has been refreshed."
   - `app_disabled` → "This app is disabled. Enable it before approving requests."
   - `join_policy_changed` → "This app no longer requires approval, so the request can't be approved. You can still reject it."
   - `user_disabled` → "This user's account is disabled, so the request can't be approved."
   - `email_unverified` → "This user hasn't verified their email, so the request can't be approved."
   - `default_role_unusable` → "This app's default role is missing or can't be granted. Fix the app's default role, then try again."
   - other → "The API refused this decision. Refresh the list and try again."
4. Otherwise `fallback(error)`: 403 → `{kind:'forbidden'}`, others as today.

The 409 `email_unverified` arrives as `kind:'http'`, `code:'conflict'`. It is not in `GATE_CODES` (`src/api/client.ts:12-17`), which are matched on `kind:'auth'` codes only, so it never reaches AuthGate. `isForbidden` is false, so it is not a ForbiddenPanel either. Do not change `client.ts` or `forbidden.ts`. The regression test above pins this.

### 4. Tab (`app-join-requests-tab.tsx`), modelled on `app-credentials-tab.tsx`
- **State:**
  - `status` (default `'pending'`) and `offset` live in component state, not the URL (the sheet has no URL state, and only UUIDs/keys may go in URLs).
  - `deciding: { request: JoinRequest; decision } | null`.
  - `heading` ref.
  - `actionButtons = useRef(new Map<string, HTMLButtonElement>())` keyed `${id}:${decision}`. Refs only, never selectors built from API data.
  - `focusAfter` ref.
- **Focus effect** (same shape as credentials): after the dialog closes, focus target `{kind:'row', key}` if `el?.isConnected`, else the heading. Success → heading.
- **Header:** `h3` "Join requests" (`tabIndex={-1}`, ref), then a muted line: "People who asked to join {app.name}. Approving gives them the app's default role, app-wide."
- **Notes** (muted text, mirrors only, R4):
  - If `app.join_policy !== 'approval'`: "This app's join policy is {joinPolicyLabels[…]}, so no new requests are created. Requests already listed can still be rejected; approving them will be refused."
  - If `app.status === 'disabled'`: "This app is disabled. Approving requests will be refused until it is enabled."
- **Filter:** shadcn `Select` with a visible `<Label htmlFor>` "Status", options from `joinRequestStatusOptions`. On change: `setStatus(v); setOffset(0)`.
- **Query:** `useQuery(appJoinRequestsQueryOptions(app.key, { status, limit: JOIN_REQUESTS_PAGE_SIZE, offset }, api))`, then `queryView(q)`.
  - forbidden → `ForbiddenPanel variant='inline'`;
  - pending → `<p role='status'>Loading join requests…</p>`;
  - error → `role='alert'` "Couldn't load join requests." plus Retry.
- **Table:** `<Table aria-label={`Join requests of ${app.key}`}>` with `scope='col'` headers:
  - **Requester:** primary line `display_name ?? email`; second muted line `email` when `display_name` is set; "(you)" when `user_id === useSelfUserId()`. Badges use `variant='outline'` (neutral, contrast-safe): "Email not verified" and "Account disabled". Long values use `truncate` + `title`. All text nodes: no `href`, no `mailto:`, no HTML.
  - **Requested:** `<time dateTime={created_at}>{formatDate(created_at)}</time>`.
  - **Status:** `Badge variant='secondary'` with `joinRequestStatusLabel(r.status)`.
  - **Decided:** only when `status !== 'pending'`. `formatDate(decided_at)`, plus " (by you)" when `decided_by === selfUserId`. Otherwise no decider shown: `decided_by` is a bare UUID.
  - **Actions:** sr-only header, only when `status === 'pending'`. Per row, and only when `r.status === 'pending'`, wrap in `<Can action='apps.decideJoinRequest'>` (hide when denied, like Revoke). Two buttons:
    - `Button size='sm' variant='outline'` "Approve", `aria-label={`Approve ${display_name ?? email}`}`;
    - `Button size='sm' variant='outline'` "Reject", `aria-label={`Reject ${display_name ?? email}`}`.
    Both outline: no red text on rows. The destructive colour appears only on the reject confirm button. Do not disable Approve on the badge conditions: the API decides (R4).
  - Below the table, `<Can action='apps.decideJoinRequest' fallback={<p className='text-sm text-muted-foreground'>Approving or rejecting requests needs admin:roles:assign.</p>}>{null}</Can>`.
  - **Empty row:** "No {pending|approved|rejected} join requests."
- **Pager:** identical to credentials ("Showing x–y of total", Previous/Next with `JOIN_REQUESTS_PAGE_SIZE`).
- **Page clamp:**
  ```ts
  useEffect(() => {
    if (!q.isSuccess || offset === 0 || q.data.items.length) return
    setOffset(q.data.total > 0
      ? Math.floor((q.data.total - 1) / JOIN_REQUESTS_PAGE_SIZE) * JOIN_REQUESTS_PAGE_SIZE
      : 0)
  }, [q.isSuccess, q.data, offset])
  ```

### 5. Dialog (`app-join-request-decision-dialog.tsx`), modelled on `app-credential-revoke-dialog.tsx`
- **Props:** `app`, `request`, `decision`, `onDone(result: 'success' | 'cancel')`.
- **In-flight guard:** `inFlight` `useRef` guard in `handleConfirm`, cleared `onSettled`. `onOpenChange` ignores close while `isPending`, and otherwise calls `mutation.reset(); onDone('cancel')`.
- **Requester naming:** `who = request.display_name ? <>{display_name} ({email})</> : email`, as React text nodes.
- **Approve:**
  - title "Approve join request?";
  - desc "Approve {who} to join {app.name} ({app.key})? If they aren't a member yet, they get the app's default role, app-wide. If they already have a role in this app, nothing else changes."
  - `confirmText='Approve'`, `pendingText='Approving…'`, not destructive.
  - Do not name a role and do not say "will be granted": the response does not say whether a grant happened (silent no-op for existing members).
- **Reject:**
  - title "Reject join request?";
  - desc "Reject the request from {who} to join {app.name} ({app.key})? They can't request to join this app again for a while. This can't be undone here."
  - `confirmText='Reject'`, `pendingText='Rejecting…'`, `destructive`.
  - No number for the cooldown: it is server config.
- **Error slot:** `forbidden` → `ForbiddenPanel variant='inline'`; `message` → `<p role='alert' className='text-sm text-destructive'>`.
- **Success:** `toast.success('Join request approved.' | 'Join request rejected.')`, with no name or email (R5: toasts can be captured), then `onDone('success')`.
- No `console.*` anywhere. Nothing is stored outside TanStack memory.

### 6. Sheet (`app-detail-sheet.tsx`)
- Add `<Can action='apps.viewJoinRequests'>` around both the `TabsTrigger value='join-requests'` and its `TabsContent`, rendered only when `app.key !== ADMIN_APP_KEY` (the API 404s for `admin`).
- Content mounts only when selected (Radix default), like the other tabs.
- Update the description.

### 7. e2e
- **Fake API** (`fake-api.ts`): add `type JoinRequestRead = components['schemas']['JoinRequestRead']` and per-install `joins: Record<string, JoinRequestRead[]>`:
  - stoktok (approval, active): two pending requests:
    - Ada: `display_name: 'Ada Lovelace'`, email `ada@people.e2e.test`, verified, active;
    - Bob: `display_name: null`, email `bob@people.e2e.test`.
  - calechip: empty.
  - In the `for (const a of APPS)` loop:
    - `GET …/join-requests`: `admin` → 404 `not_found`; otherwise filter by `query.get('status') ?? 'pending'`, then `page()`.
    - Per request, `POST …/{id}/approve` and `/reject`: 409 `{code:'conflict', details:[{field:'request_id', reason:'not_pending'}]}` if not pending; otherwise set `status`, `decided_at = stamp`, `decided_by = SELF_USER_ID`, and return `json(200, row)`.
- **Test** (`pages.e2e.ts`): new test, as named in the Tests table:
  1. Open stoktok, `selectTab(page, 'Join requests')`, see "Ada Lovelace", run `expectNoSeriousA11y(page, 'apps-join-requests')`.
  2. Reject Ada → alertdialog contains "Ada Lovelace" and "Stoktok"; axe; Cancel → hidden, `Reject Ada Lovelace` button `toBeFocused()`, zero POSTs.
  3. Approve Ada → confirm → hidden; exactly one `POST /api/v1/apps/stoktok/join-requests/<id>/approve` whose body is `undefined`.
  4. The "Join requests" heading `toBeFocused()`; the Ada row is gone, the Bob row remains.
  5. Switch Status to Approved → the Ada row is shown with "(by you)".
  6. `api.calls.every(c => !c.path.includes('@') && ![...c.query.values()].some(v => v.includes('@')))`.

### Rules
- **R1:** only existing endpoints are used. Gaps are follow-ups.
- **R2:** generated types; calls only through `src/api` via the injected `ApiClient`.
- **R3:** no auth changes. The 409 `email_unverified` stays out of the gate, and a test pins this.
- **R4:** registry actions; tab hidden when `admin:users:read` is denied; row actions hidden when `admin:roles:assign` is denied; 403 always shown inline.
- **R5:** emails and display names only as rendered text. Not in URLs, query keys, toasts, logs or storage.
- **R6:** text only, no `href`/`mailto`; the XSS-text test pins this.
- **R7:** no snapshot regeneration, no audit-log or forbidden changes.
- **R8:** tests above plus all checks.
- **R9:** both decisions confirmed, naming requester and app; non-optimistic; inline errors; invalidation after success.
- **R10:** labelled Select; table with `scope='col'` headers and aria-label; `role=status` / `role=alert`; focus returns by ref; outline row buttons, destructive colour only on the confirm.
- **R11:** staff-side only. No end-user join call (`/auth/apps/{key}/join` is never used).

## Specialist input used
- **api-platform-engineer**
  - Adopted:
    - contract (fields, status/paging only, fixed oldest-first order, no body, 409 reasons in `details[0].reason`);
    - "do not synthesise the granted role";
    - PII handling;
    - `decided_by` as id only;
    - `admin` key 404;
    - invalidate the user's assignments on approve.
  - Rejected:
    - audit-log label changes: already present in `audit-log/data/*.ts`;
    - a 422 test for `status`: the UI only sends enum values, so the generic fallback covers it;
    - disabling Approve on badge conditions: the API is authoritative.
  - Open questions answered:
    - Q1: `_guard_privileged` cannot fire, per the identity consult F4; a generic 403 copy is used anyway.
    - Q2: tab.
    - Q3: `UserStatus` is `active | disabled` (`org-admin-api app/modules/users/models.py:11-13`); the UI flags `!== 'active'`.
    - Q4: generic "the app's default role".
    - Q5: no regeneration; see Approach §0.
- **identity-access-engineer**
  - Adopted:
    - permissions;
    - R-b: do not block self-approval (show "(you)");
    - R-c: hide for admin, show with a note for non-approval apps;
    - R-d: fixed 409 copy plus the email_unverified gate test;
    - R-f: invalidations without `me/permissions`;
    - R-g: PII as text only;
    - R-h: test list.
  - Changed:
    - R-a: two actions instead of three, because approve and reject share one permission;
    - R-e: no role name in the approve copy (only `default_role_id` exists and role names are not available; stale anyway);
    - R-g: the success toast names nobody (stricter R5).
  - Open questions answered:
    - Q1 and Q3: follow-ups;
    - Q2: generic cooldown copy;
    - Q4: tab.
- **frontend-developer**
  - Adopted:
    - tab placement and the files;
    - key factory under `appsKeys.detail`;
    - one parameterised dialog;
    - focus refs;
    - error copy (reworded);
    - no pending badge;
    - page clamp;
    - e2e fake design;
    - no snapshot regeneration.
  - Changed:
    - no `keepPreviousData` (stale rows from another filter);
    - row actions hidden instead of disabled when `admin:roles:assign` is denied (matches Revoke), with one note below the table;
    - unknown 409 reason → generic copy, not the server message.
  - Open questions answered:
    - Q1: always show with a note;
    - Q2: no count on the trigger;
    - Q3: show `display_name` and email;
    - Q4: `usersKeys.detail` covers role assignments;
    - Q5: follow-up;
    - Q6: "(by you)" only;
    - Q7: the e2e fake's stoktok is `approval`/active by default (`fake-api.ts:78`).

## Assumptions
- The snapshot's join-request contract equals b79cf77, based on the source comparison. The implementer confirms it by the scripted regeneration (Approach §0).
- `display_name` and email may both be shown to staff with `admin:users:read`, as on the Users screen.
- The cooldown default (7 days) is server config and may change, so the copy says "for a while".
- The tab is hidden (not disabled) when `admin:users:read` is denied, consistent with `Can`'s default. "Unknown" permission state renders it, and the API 403 is handled.
- The e2e test lives in `e2e/pages.e2e.ts`, next to the other apps tests.
- Size: about 450–550 changed lines including tests and the e2e fake, about 250 of them product code. This is one spec feature with no migration, so one slice.

## Needs owner's decision (non-blocking; safer option chosen)
1. **Tab visibility.** The tab is shown for every non-admin app, with a policy note when the policy is not `approval`, so old requests can still be rejected after a policy change. The alternative was an approval-only tab.
2. **Self-approval** is allowed by the API (USR-03g decision) and audited. The UI does not block it, only labels the row "(you)". Tell us if you want the API to refuse it.
3. **Approve copy** says "the app's default role", not a role name. The API response does not say whether a role was granted.
4. **Reject copy** mentions a cooldown without a number.
5. **No pending count** on the tab trigger, the apps list or the dashboard. That needs an org-admin-api endpoint.

## Follow-ups (not in this diff)
- org-admin-api:
  - `granted: bool` / `role_key` on the approve response;
  - a label (email/name) for `decided_by`;
  - expose the reject cooldown (or a staff action to clear it);
  - per-app pending count and/or a cross-app pending inbox;
  - an optional reject reason;
  - expiry/cap for stale pending requests.
- admin-pan:
  - PAN-020 regenerates the OpenAPI snapshot (ADM-015 stats, `admin:stats:read` in `ADMIN_PERMISSIONS`);
  - show the default role's name once role management is on the real API.

## Blocking questions
None.

## Split proposal
None.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/apps`: detail sheet › "Join requests" tab (non-admin apps) | Tab: `admin:users:read` (`apps.viewJoinRequests`); row actions: `admin:roles:assign` (`apps.decideJoinRequest`) | "Loading join requests…" / "No {status} join requests." / "Couldn't load join requests." + Retry / inline ForbiddenPanel / table + pager + status filter + policy/disabled notes | Approve → confirm → `POST …/approve`; Reject → confirm → `POST …/reject` | Approve: `appsKeys.joinRequestsAll(key)`, `usersKeys.detail(user_id)`. Reject: `joinRequestsAll(key)`. On 404/409/unknown outcome: `joinRequestsAll(key)`, plus `appsKeys.detail(key)` for `app_disabled`/`join_policy_changed`/`default_role_unusable`. Never `['me','permissions']`. |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/apps/{key}/join-requests` | path `key`; query `status` (`pending`/`approved`/`rejected`, always sent), `limit=20`, `offset` | `Page_JoinRequestRead_` | 403 (ForbiddenPanel), 404/5xx/network (error + Retry), 401 (client hook) | USR-03g |
| POST | `/api/v1/apps/{key}/join-requests/{request_id}/approve` | path `key`, `request_id` (UUID); no body | `JoinRequestRead` | 403, 404, 409 (`not_pending`, `app_disabled`, `join_policy_changed`, `user_disabled`, `email_unverified`, `default_role_unusable`, unknown), 422/other (fallback), network/5xx (unknown outcome) | USR-03g |
| POST | `/api/v1/apps/{key}/join-requests/{request_id}/reject` | path `key`, `request_id` (UUID); no body | `JoinRequestRead` | 403, 404, 409 `not_pending`, network/5xx | USR-03g |
