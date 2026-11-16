Status: READY

# Plan — PAN-013: Users screen on the real API

## Spec summary
`docs/spec-v1.md` §5.2 Users (mmlabs Identity):
> List with email search and status filter (paginated), detail, enable/disable with confirmation.
> API: `GET /api/v1/users`, `GET/PATCH /api/v1/users/{id}` (`admin:users:read`, `admin:users:write`) — **org-admin-api USR-01b** (done; …)

`docs/spec-v1.md` §6:
> Lists use server-side pagination (`limit` ≤ 100) and stay responsive with thousands of rows.

The owner answers of 2026-11-16 (ticket.md) add to this ticket:
- The typed email filter stays out of the URL.
- Tests use injected `fetch`, not MSW.
- Bulk status and row selection are removed.
- "Apps & roles" is wired read-only to `GET /api/v1/users/{id}/role-assignments`, which belongs to spec §5.4 ("role assignments per user"; only the read side here).

Dependencies, checked by the orchestrator against org-admin-api `origin/main` d9e496f: USR-01b, ADM-002, ADM-002b and USR-02 are DONE, and PAN-003 and PAN-011 are DONE here. The endpoints exist in `src/api/openapi.json` and in the API source.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | List uses server-side `limit`/`offset`, `email`, `status` | `queries.test.ts` › "toUsersListParams …" (4 tests) and "usersListQueryOptions sends limit/offset/email/status"; `users-table.test.tsx` › "next page requests offset=10 and updates ?page", "typed email is debounced, trimmed and sent as email=", "one status sends status=…; both statuses send none". The table has no `getPaginationRowModel`, `getFilteredRowModel`, `getSortedRowModel` or faceted models: grep `users-table.tsx`. |
| 1a | (owner) The URL never contains the typed email | `users-table.test.tsx` › "typed email never reaches the URL search" (the fake-navigate `search` JSON has no `email` key and no part of the typed text, while the API request does); `schema.test.ts` › "usersSearchSchema drops an email key". |
| 2 | PATCH status with confirmation; errors shown; no optimistic success (R9) | `users-status-dialog.test.tsx`: "confirm names the target and the side effects", "pending: dialog open, buttons disabled, badge unchanged until the response", "success closes, toasts and refetches the list", "403 self_status_change_forbidden / admin_wildcard_required shown inline, dialog stays open", "409 last_super_admin shown", "404 shown and list refetched", "cancel sends no PATCH". `errors.test.ts` covers the code → text mapping. |
| 3 | Loading, empty, error and 403 states tested with the API mocked at the network layer via a fake `fetch` injected into `createApiClient` (no MSW) | `users-table.test.tsx` › "loading", "empty (no filters)", "empty (filtered)", "error shows alert and Retry refetches", "403 renders ForbiddenPanel and hides the table", "403 on refetch replaces stale rows". `users-detail-sheet.test.tsx` covers the same for the detail and the Apps & roles section. `package.json` has no `msw`. |
| 4 | (owner) Bulk Disable and row-selection column removed | `users-table.test.tsx` › "no row-selection checkboxes and no bulk toolbar". `data-table-bulk-actions.tsx` is deleted. |
| 5 | (owner) "Apps & roles" is read-only from `GET /users/{id}/role-assignments`: app, role_key, scope (raw org id), expiry, active flag; own loading/error/403; preview data removed | `users-detail-sheet.test.tsx`: "assignments: loading", "rows with app-wide and org scope, expiry, Inactive for active:false", "empty", "error with Retry does not hide the user detail", "403 inline panel", "Showing 100 of 130". Grep shows no `PREVIEW_APP_ROLES` and no "Preview" badge. |
| R8 | Green checks | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`. The CI step `pnpm api:types && git diff --exit-code src/api/schema.d.ts` passes. |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/api/openapi.json` | Refresh the snapshot from org-admin-api d9e496f (see Approach step 1) | ADR 0001: each real-API ticket refreshes it. The snapshot lacks `409` on `PATCH /users/{user_id}` and on the role-assignment `DELETE` (API consult §2) |
| `src/api/schema.d.ts` | Regenerate with `pnpm api:types` | CI diffs it against the snapshot |
| `src/features/users/api/queries.ts` (new) | `usersKeys`, `toUsersListParams`, `usersListQueryOptions`, `userQueryOptions`, `userRoleAssignmentsQueryOptions`, `useSetUserStatusMutation` | AC1, AC2, AC5. Follows the organizations pattern (ADR 0001) |
| `src/features/users/api/queries.test.ts` (new) | Unit tests for keys, params and URLs | AC1, R8 |
| `src/features/users/data/schema.ts` | Rewrite. Delete the hand-written zod `userSchema`/`userListSchema`/`User`. Export `type User = components['schemas']['UserRead']`, `UserStatus`, `RoleAssignment = components['schemas']['AssignmentRead']`, `userStatusSchema` (zod, URL only) and `usersSearchSchema` (moved from the route) | R2 (generated types). The search schema becomes unit-testable (AC1a) |
| `src/features/users/data/schema.test.ts` (new) | `usersSearchSchema` strips `email` and keeps `page`/`pageSize`/`status` | AC1a |
| `src/features/users/data/errors.ts` (new) | `statusChangeError(error)` → `{ kind: 'forbidden', copy } \| { kind: 'message', text }` | AC2: one tested mapping |
| `src/features/users/data/errors.test.ts` (new) | Mapping tests | AC2, R8 |
| `src/features/users/data/users.ts` | **Delete** (mock data) | Mock phase ends. Nothing else imports it (grep) |
| `src/routes/_authenticated/users/index.tsx` | Import `usersSearchSchema` from `features/users/data/schema`. The `email` key is gone | AC1a |
| `src/features/users/index.tsx` | `UsersTable` no longer takes `data`. Drop the `useUsers().users` read | The list comes from the query |
| `src/features/users/components/users-provider.tsx` | Remove `users`, `setUsersStatus`, `initialUsers`. Add `api: ApiClient` (prop `api?`, default `getApi()`). Keep `open`/`currentRow` | Tests inject the client (AC3). Server state leaves the provider |
| `src/features/users/components/users-table.tsx` | Server-side table: query, `manualPagination`/`manualFiltering`, `rowCount`, no sorting, no selection, no bulk, email out of the URL, `queryView` states | AC1, AC1a, AC3, AC4 |
| `src/features/users/components/users-columns.tsx` | Remove the `select` column and the `filterFn`/`sortingFn`. Change the email column's sticky offset `inset-s-6` to `inset-s-0`, since the select column is gone | AC4. No API sort |
| `src/features/users/components/data-table-row-actions.tsx` | No logic change. Only the `User` import path or type changes, if needed for typecheck | Type source changes |
| `src/features/users/components/data-table-bulk-actions.tsx` | **Delete** | AC4 (owner) |
| `src/features/users/components/users-status-dialog.tsx` | Real PATCH via the mutation: pending, inline error, close only on success, new side-effect copy | AC2, R9 |
| `src/features/users/components/users-detail-sheet.tsx` | Render from `userQueryOptions(id)`, with the list row as `placeholderData`. Real "Apps & roles" section. Remove `PREVIEW_APP_ROLES` | AC5, stale-row risk |
| `src/features/users/components/users-dialogs.tsx` | Pass `open === 'view'` through so the sheet's queries run only while open. Otherwise unchanged | No fetch for a closed sheet |
| `src/features/users/components/users-table.test.tsx` | Rewrite as screen tests on a fake `fetch` | AC1, AC1a, AC3, AC4 |
| `src/features/users/components/users-status-dialog.test.tsx` (new) | Mutation flows | AC2 |
| `src/features/users/components/users-detail-sheet.test.tsx` (new) | Detail and Apps & roles states | AC3, AC5 |
| `src/hooks/use-debounced-value.ts` (new) | `useDebouncedValue<T>(value, delayMs)` | Debounced email filter (owner) |
| `src/hooks/use-debounced-value.test.tsx` (new) | Hook test | R8 |
| `src/test-utils/api.ts` (new) | `fakeApi(handler)` → `{ client, seen }`, `json(body, status?)`, `apiError(status, code, details?)`, `testQueryClient()` | Shared injected-fetch helpers (owner: no MSW). PAN-014 to PAN-016 reuse them |
| `docs/adr/0005-server-side-tables.md` (new) | ADR: server-side table pattern, PII-free URL state, feature-level API injection for tests | A decision that outlives this ticket (PAN-014 to PAN-016) |

Not touched: `src/components/confirm-dialog.tsx` already supports `isLoading`, which disables both buttons, and has a `children` slot for the inline error, so no shared change is needed. `src/components/data-table/*`, `src/hooks/use-table-url-state.ts` and `src/lib/*` are also untouched. Any other file the implementer has to touch must be recorded in impl-log with the reason (R7).

## Tests to write
All tests run in Vitest browser mode. The network layer is mocked by `createApiClient({ baseUrl: 'https://api.test', fetch })` from `src/test-utils/api.ts`. `QueryClient` uses `retry: false`. Requests are recorded in `seen: Request[]`.

| Test (file › name) | Covers |
|---|---|
| `src/features/users/api/queries.test.ts` › usersKeys.list normalises params (undefined/empty keys dropped; equal filters → equal key) | AC1, cache |
| › toUsersListParams: page 3 / size 10 → limit=10, offset=20; size capped at 100 | AC1 |
| › toUsersListParams: email trimmed; empty/whitespace email omitted | AC1 (an empty `email=` gives 422) |
| › toUsersListParams: status `['disabled']` → `status=disabled`; `['active','disabled']` or `[]` → no status | AC1, multi-select mapping |
| › usersListQueryOptions sends `GET /api/v1/users?limit=…&offset=…&email=…&status=…` and returns the Page | AC1 |
| › userQueryOptions sends `GET /api/v1/users/{id}`; a 404 rejects with ApiError status 404 | detail |
| › userRoleAssignmentsQueryOptions sends `GET /api/v1/users/{id}/role-assignments?limit=100&offset=0` | AC5 |
| › useSetUserStatusMutation sends `PATCH /api/v1/users/{id}` with body `{"status":"disabled"}` and invalidates `['users']` on success | AC2, R9 |
| › list 403 surfaces ApiError 403 | AC3 |
| `src/features/users/data/schema.test.ts` › usersSearchSchema drops an email key and keeps page/pageSize/status | AC1a |
| `src/features/users/data/errors.test.ts` › 403 codes → forbidden copy (`self_status_change_forbidden`, `admin_wildcard_required`, `permission_denied`); 409 `last_super_admin` → "You can't disable the last active super admin."; 404 → "This user no longer exists."; other ApiError → message (max 200 chars); non-ApiError → "Something went wrong." | AC2 |
| `src/hooks/use-debounced-value.test.tsx` › returns the initial value, then the last value after the delay, ignoring intermediate values | debounce |
| `src/features/users/components/users-table.test.tsx` › loading: a never-resolving fetch shows the "Loading users…" status | AC3 |
| › renders rows from the API (email, display name, status badge, "Not verified") | AC1 |
| › empty (no filters): "No users yet." | AC3 |
| › empty (filtered): "No users match these filters." | AC3 |
| › error (500): alert "Couldn't load users." plus Retry; Retry sends a second GET and shows rows | AC3 |
| › 403: ForbiddenPanel (page) with "Required permission: admin:users:read"; no table or toolbar | AC3, R4 |
| › 403 on refetch replaces stale rows (rows, then Retry/refetch returns 403 → panel, rows gone) | AC3, ADR 0004 |
| › next page requests offset=10 and updates `?page=2` in search | AC1 |
| › typed email is debounced, trimmed and sent as `email=` (one request after typing stops, `expect.poll` on `seen`) and resets page | AC1 |
| › **typed email never reaches the URL search** (type `alice@example.com`; the request URL has `email=alice%40example.com`; the `search` output has no `email` key and no "alice") | AC1a (owner) |
| › one status sends `status=disabled` and writes `"status":["disabled"]`; selecting both sends no status | AC1 |
| › column headers have no sort buttons | no API sort |
| › no row-selection checkboxes and no bulk toolbar | AC4 |
| › without `admin:users:write` (`WithPermissions granted={['admin:users:read']}`), Enable/Disable are hidden and View details shows | R4 |
| `src/features/users/components/users-status-dialog.test.tsx` › confirm names the target email and the side effects (signed out everywhere, sessions revoked, reset/verification links stop working) | AC2, R9 |
| › pending: PATCH held on a deferred promise → dialog open, Cancel and Disable disabled, row badge still "Active"; resolving closes the dialog and toasts "Disabled alice@example.com" | AC2 (no optimistic) |
| › success refetches the list (a second `GET /api/v1/users` is seen; the refetched row shows Disabled) | AC2, invalidation |
| › 403 `self_status_change_forbidden` → inline alert "You can't change your own account status", dialog open; server message not shown | AC2, ADR 0004 |
| › 403 `admin_wildcard_required` → inline "Only super admins can do this" | AC2 |
| › 409 `last_super_admin` → alert text shown; dialog open | AC2 |
| › 404 → "This user no longer exists." shown; list refetched | AC2 |
| › cancel sends no PATCH | R9 |
| › reopening after an error shows no stale error | dialog reset |
| › enable a disabled user sends `{"status":"active"}` | AC2 |
| `src/features/users/components/users-detail-sheet.test.tsx` › shows the list row immediately and then the `GET /users/{id}` result (the fetched display name replaces the row's) | detail by id |
| › detail 404 → "This user no longer exists." | detail |
| › assignments: loading status shown while user fields render | AC5 |
| › assignments rows: app, role_key, scope "App-wide" for `org_id: null` and the raw org id otherwise, expiry date or "Never", and "Active" / "Inactive" for `active:false` | AC5 |
| › assignments empty: "No role assignments." | AC5 |
| › assignments error (500): alert plus Retry; user fields still shown | AC5 |
| › assignments 403: inline ForbiddenPanel; user fields still shown | AC5, R4 |
| › total 130 with 100 items → "Showing 100 of 130" | AC5 |
| › no "Preview" badge or sample data | AC5 |

The removed tests and why:
- "mock users data has ~200 users": the mock file is deleted.
- "bulk disables …": bulk is removed.
- "filters by email and syncs it to the URL": the behaviour is reversed by the owner.
- "shows … apps & roles preview": the preview is gone.

## Approach
1. **Snapshot refresh (ADR 0001).**
   - Primary path:
     1. Confirm that `/home/user/org-admin-api` is at d9e496f (`git -C /home/user/org-admin-api rev-parse HEAD`).
     2. If `uv` exists (`command -v uv`), run this from that directory, with `UV_PROJECT_ENVIRONMENT` set to a temp dir outside both repos so nothing is written into the API checkout:
        `uv run --frozen python -m app.cli openapi --output /home/user/admin-pan/src/api/openapi.json`
        (This is what `make openapi OUT=…` runs. It uses code-default settings and needs no DB or `.env`.)
     3. `openapi.json` is in `.prettierignore`, so keep the output verbatim.
   - Fallback (no `uv`, or the dependency install fails, e.g. no network):
     1. Hand-add `"409": {"description": "Last active super-admin"}` between `403` and `422` in `responses` of `PATCH /api/v1/users/{user_id}` and of `DELETE /api/v1/users/{user_id}/role-assignments/{assignment_id}`. The source is `app/modules/users/router.py:47` and `app/modules/rbac/assignments_router.py:59`.
     2. Record in impl-log that the snapshot was hand-patched, and add a follow-up to regenerate it.
   - Either way, run `pnpm api:types`.
   - Record `git diff --stat src/api/openapi.json` in impl-log. If the full regeneration brings drift outside users and role-assignments, keep it only if typecheck and `registry.test.ts` stay green, list it in impl-log, and change no code for it (R7).
2. **Types (R2).** Rewrite `data/schema.ts` as listed in the Files table.
   - `User = components['schemas']['UserRead']` and `UserStatus = components['schemas']['UserStatus']`.
   - `userStatusSchema = z.enum(['active','disabled'])`, with a compile-time check that it equals `UserStatus`. For example: `const _check: z.infer<typeof userStatusSchema> extends UserStatus ? true : never = true`, or a `satisfies` on the tuple.
   - `usersSearchSchema = z.object({ page, pageSize, status: z.array(userStatusSchema).optional().catch([]) })`. Keep the current `.catch` defaults and drop `email`. zod `object` strips unknown keys, so an old `?email=` link is ignored.
   - Delete `data/users.ts`.
3. **Queries (`api/queries.ts`, organizations pattern).**
   - Key layout (decided):
     ```
     usersKeys.all            = ['users']
     usersKeys.lists()        = ['users','list']
     usersKeys.list(p)        = ['users','list', normalised {limit, offset, email?, status?}]
     usersKeys.detail(id)     = ['users','detail', id]
     usersKeys.roleAssignments(id, p) = ['users','detail', id, 'role-assignments', {limit, offset}]
     ```
     Assignments sit under `detail(id)` on purpose, so invalidating a user refreshes its section.
   - `toUsersListParams({ pagination, status, email })` is a pure function:
     - `toPageParams(pagination)` gives `limit` (≤ 100) and `offset`.
     - `email` is trimmed and omitted when empty.
     - `status` is sent only when exactly one value is selected.
   - `usersListQueryOptions(params, api = getApi())` uses `placeholderData: keepPreviousData`.
   - `userQueryOptions(id, api)` calls `GET /api/v1/users/{user_id}`.
   - `userRoleAssignmentsQueryOptions(id, api)` calls with `{limit: 100, offset: 0}`.
   - Keep the same eslint-disable comment as organizations for the injected client.
   - `useSetUserStatusMutation(api)`:
     - `mutationFn: ({ id, status }) => unwrap(await api.PATCH('/api/v1/users/{user_id}', { params: { path: { user_id: id } }, body: { status } }))`.
     - `meta: { handlesOwnErrors: true }`, because the dialog shows the error. This avoids a double toast from the global `MutationCache`.
     - No `onMutate` and no `setQueryData` (R9).
     - `onSuccess`: `invalidateQueries({ queryKey: usersKeys.all })`.
     - `onError`: only for status 404 or 409, also `invalidateQueries({ queryKey: usersKeys.all })`. This is a refetch, not a cache write; the state changed elsewhere.
4. **Provider.** `UsersProvider({ children, api })` puts `api ?? getApi()` (memoised) into context, next to `open`, `setOpen`, `currentRow` and `setCurrentRow`. Here `currentRow` is the list row snapshot. It is used only to name the target and as the sheet's `placeholderData`; it is never the source of truth. Production code passes no `api`; tests pass the fake client.
5. **Table (`users-table.tsx`).** Props `{ search, navigate }`.
   - **URL state.** Call `useTableUrlState` with `columnFilters: [{ columnId: 'status', searchKey: 'status', type: 'array' }]` only.
     - The email column filter then lives only in the hook's local `columnFilters` state. The hook stores the full `next` but patches only configured keys, so it never reaches the URL (owner, R5).
     - Typing still resets `page`.
     - Read `emailInput` from `columnFilters` and `email = useDebouncedValue(emailInput, 300)`.
   - **Query.**
     - `params = toUsersListParams({ pagination, status, email })`.
     - `q = useQuery(usersListQueryOptions(params, api))` and `view = queryView(q)`.
   - **Table options.**
     - `useReactTable({ data: q.data?.items ?? [], columns, rowCount: q.data?.total ?? 0, manualPagination: true, manualFiltering: true, enableSorting: false, enableRowSelection: false, getRowId, getCoreRowModel, state: { pagination, columnFilters, columnVisibility } })`.
     - No sorted, filtered, paginated or faceted models. With no faceted model the facet counts disappear, which is correct: they would only count the current page.
   - **Page range.** Call `ensurePageInRange(table.getPageCount())` only when `q.isSuccess && !q.isPlaceholderData`.
   - **Render.**
     - `forbidden`: `<ForbiddenPanel variant='page' copy={view.copy} onRetry={() => q.refetch()} />` only, with no toolbar and no table.
     - Otherwise the toolbar always renders, so the typed text survives loading and error. The table body depends on the state:

       | State | Table body |
       |---|---|
       | `pending` | One row with `<span role='status'>Loading users…</span>`. |
       | `error` | One row with `<div role='alert'>Couldn't load users.</div>` and a Retry button that calls `q.refetch()`. |
       | `success` with 0 items | "No users match these filters." when email or status is set, otherwise "No users yet." |
       | `success` | The rows. |

     - The `<Table>` gets `aria-busy={q.isFetching}`.
     - Remove `<DataTableBulkActions>`. Keep `DataTablePagination`; its page sizes 10 to 50 are ≤ 100.
6. **Status dialog (R9).** It uses `ConfirmDialog` as is.
   - **Confirm.** `handleConfirm` calls `mutation.mutate({ id: currentRow.id, status: next }, { onSuccess: () => { onOpenChange(false); toast.success(...) } })`, with `isLoading={mutation.isPending}`.
   - **Blocking close while pending.** `onOpenChange` ignores close requests while the mutation is pending, so Escape and the overlay cannot close it mid-request. On close it calls `mutation.reset()`, so a reopened dialog shows no stale error.
   - **Errors.** Render them in `children`, using `statusChangeError(mutation.error)`:
     - `forbidden`: `<ForbiddenPanel variant='inline' copy={…} />`. It has `role=alert` and never shows the server message (ADR 0004).
     - `message`: `<p role='alert'>{text}</p>`.
   - **Copy.** The disable copy (R9 names the target; consult API §1 side effects):
     > Disable **{email}** ({display_name})? They will be signed out of every mmlabs app: all their sessions are revoked and any password-reset or verification links stop working. They can't sign in until re-enabled.

     The enable copy is unchanged.
7. **Detail sheet.**
   - `useQuery({ ...userQueryOptions(currentRow.id, api), placeholderData: currentRow, enabled: open })` is rendered through `queryView`:
     - `pending` and `success` render the fields.
     - `error` shows "This user no longer exists." for 404, otherwise "Couldn't load this user." with Retry.
     - `forbidden` shows the inline `ForbiddenPanel`.
   - The "Apps & roles" section is wrapped in `<Can action='roles.viewAssignments'>`.
     - It runs its own `useQuery(userRoleAssignmentsQueryOptions(id, api))` with `enabled: open`, rendered through its own `queryView`. A failure in it never hides the user fields.
     - It shows a semantic `<table>` with a caption or `aria-labelledby` pointing at the section heading. Headers: App, Role, Scope, Expires, Status.
     - Scope is "App-wide" when `org_id === null`, otherwise `<code>{org_id}</code>`. Expires is `formatDateTime(expires_at)` or "Never". Status is a badge, "Active" or "Inactive"; inactive rows are shown, not hidden.
     - Other states: empty shows "No role assignments."; `total > items.length` shows "Showing {items.length} of {total}"; error shows `role=alert` plus Retry; 403 shows the inline `ForbiddenPanel`; loading shows `role=status` "Loading role assignments…".
     - No assign or revoke controls.
8. **Columns and row actions.** Remove the select column and the client `filterFn`/`sortingFn`. `DataTableColumnHeader` already renders plain text when the column cannot sort. Row actions keep `<Can>` with `users.view` / `users.setStatus`.
9. **Test helper.** Add `src/test-utils/api.ts` (pattern from `organizations/api/queries.test.ts` and `forbidden-panel.test.tsx`). Screen tests render this harness:
   ```
   <QueryClientProvider client={testQueryClient()}>
     <UsersProvider api={client}>
       <UsersTable/> + <UsersDialogs/>
     </UsersProvider>
   </QueryClientProvider>
   ```
   They also keep the existing fake `search`/`navigate` harness with an `<output data-testid='search'>`. Use `expect.poll` or `vi.waitFor` for debounce timing; do not use fixed sleeps.
10. **ADR 0005** (`docs/adr/0005-server-side-tables.md`, short, same format as 0004). It records:
    - Admin list tables are server-side: `manualPagination`/`manualFiltering`, `rowCount` from `total`, `keepPreviousData`, and no client sorting unless the API offers a sort.
    - URL state holds only non-PII params (page, pageSize, enums). Free-text filters that can hold an email stay in component state, debounced (R5, owner 2026-11-16).
    - Feature providers accept an injected `ApiClient`. Tests mock the network with a fake `fetch` via `src/test-utils/api.ts`, not MSW (owner 2026-11-16).
    - Queries render through `queryView`. Each independent section has its own states.
11. Run `pnpm format`, then all R8 checks.

How the rules are met:

| Rule | How this plan meets it |
|---|---|
| R1 | No faked sort, bulk or org names. Gaps go to follow-ups. |
| R2 | HTTP only via `api.GET/PATCH` from `src/api`, with generated types. |
| R4 | `<Can>` keys `users.view`, `users.setStatus` and `roles.viewAssignments`. Every 403 is rendered. |
| R5 | The email is out of the app URL; `ApiError` carries no URL. |
| R6 | All API strings are rendered as React text. |
| R7 | No assign/revoke and no bulk. |
| R8 | Tests as listed above. |
| R9 | Confirmation names the target; nothing is optimistic; the error is shown; invalidation on success. |
| R10 | `role=status`/`alert`, semantic table headers, the existing labelled inputs, and focus stays in the dialog on error. |

## Specialist input used
- **API consult.** Adopted:
  - §1 the contract: substring email, single status, no sort, empty `email` gives 422, the 409/403 codes, PATCH is idempotent.
  - §2 the snapshot refresh and the missing 409.
  - §3 email out of the URL (confirmed by the owner).
  - §4 manual pagination, `keepPreviousData`, clamp with the server total.
  - §5 the key layout. I chose assignments under `detail(id)`.
  - §6 `queryView` states, the error-code mapping, and no closing on error.
  - §7 the assignments fields; `active:false` is shown, `limit=100` with "Showing N of M".
  - §8 branch on `ApiError.status`/`code`, not on the generated responses.

  Adapted: the friendly 403 texts come from the existing `forbiddenCopy` (it already maps `self_status_change_forbidden` and `admin_wildcard_required`), so that copy is not duplicated. Rejected: optional `setQueryData` on PATCH success (invalidation is enough and simpler), and a "copy" button for the org id (not asked for; follow-up).
- **Frontend consult.** Adopted:
  - A, B: the queries file, manual table, removing the client row models, sorting off.
  - C: the `queryView` states, with the toolbar kept mounted except on 403.
  - D: `isLoading` on `ConfirmDialog`, close only on success; `handlesOwnErrors` with the inline error, per ADR 0004's dialog rule.
  - E: remove bulk (confirmed by the owner).
  - G: the test list and the injected-fetch helper (confirmed by the owner).
  - H: delete the mock and hand-written types.

  Status filter decided as **option 2: keep the multi-select facet**, send `status` only when exactly one value is selected. Both selected and none both mean "no filter", which is exact because there are only two values. This keeps the URL schema and the shared faceted component untouched. Rejected: disabling row actions while `isPlaceholderData` (the PATCH targets a row id and the API is idempotent; this would add table-meta plumbing for little gain).
- **Neither consult.** Rejected the courtesy disable of the signed-in user's own row. The UI does not know whether the auth `accountId` equals the user id, and guessing would mirror a business rule. The API returns `self_status_change_forbidden`, which is shown.

## Assumptions
- `uv` may be missing or offline. The fallback in Approach step 1 is acceptable, and impl-log records it.
- `render_openapi` needs no database or env, because it uses code-default settings (`app/cli.py:748`).
- The API accepts `limit=100` on role-assignments (OpenAPI max 100).
- `account_id` vs user id equality is unknown, so there is no self-row prediction (see above).
- An old bookmarked `?email=` is dropped by `usersSearchSchema` on parse. The address bar may keep it until the next navigation. This is acceptable: the UI never writes it.
- Size: this is larger than the ~500-line guide, mostly in tests and deletions. It is still one screen, and the owner put the Apps & roles section into this ticket. If review cycles get tight, that section is the natural cut (see Split proposal).
- Follow-ups. Record these in impl-log; they are not in the diff.
  - org-admin-api:
    - A bulk status endpoint, if wanted (owner).
    - A `sort` parameter on `GET /users`.
    - Declare `404`/`409` and the error envelope schema in OpenAPI.
    - Confirm request logs strip query strings, or offer a `POST /users/search`, because the email filter travels in the query string.
    - `org_name` (or a lookup) on `AssignmentRead`.
  - admin-pan:
    - Assign and revoke role assignments (`roles.assign`, `roles.revoke`).
    - Paginate role assignments beyond 100.
    - Resolve org ids to names.
    - Regenerate the snapshot if the fallback was used.

## Blocking questions
None

## Split proposal
None. It is one screen, and the owner answers place every part in this ticket. If the implementer cannot finish within one cycle, the cut is: slice A = list, filters, PATCH and detail (AC1 to AC4); slice B = the "Apps & roles" section (AC5) as PAN-013b. This plan covers both.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/users` (`/_authenticated/users/`), search `?page&pageSize&status[]` (no email) | `admin:users:read` (route); row actions `users.view` (`admin:users:read`), `users.setStatus` (`admin:users:write`) | loading: `role=status` row "Loading users…"; empty: "No users yet." / "No users match these filters."; error: `role=alert` "Couldn't load users." + Retry; 403: `ForbiddenPanel` page variant with Retry, no table; happy: paginated rows, `aria-busy` while fetching | email filter (debounced 300 ms, component state), status facet, paging, page size → new `GET /users`; row → View details / Enable / Disable | — |
| Detail sheet (on `/users`) | `admin:users:read`; section `roles.viewAssignments` (`admin:users:read`) | user: placeholder from the row → fetched; 404 "This user no longer exists."; error + Retry; 403 inline. Apps & roles: own loading/empty/error/403/happy, "Showing N of M" | none (read-only) | — |
| Status confirm dialog (on `/users`) | `users.setStatus` (`admin:users:write`) | pending: both buttons disabled and close blocked; error inline (`role=alert`), dialog stays open | Disable/Enable → `PATCH /api/v1/users/{id} {status}`. Confirm text names the email (and display name) and, for disable, the side effects (sessions revoked, links invalidated) | success: `['users']` (lists, details, assignments); error 404/409: `['users']` (refetch only) |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/users` | `limit` (1–100), `offset` (≥0), `email?` (trimmed, omitted if empty; substring, case-insensitive), `status?` (`active`\|`disabled`, sent only when exactly one is selected) | `components['schemas']['Page_UserRead_']` | 401 (client hook), 403 → ForbiddenPanel, 422/5xx/network → error state | USR-01b, ADM-002b |
| GET | `/api/v1/users/{user_id}` | path `user_id` (uuid) | `components['schemas']['UserRead']` | 403 inline, 404 `not_found` → "This user no longer exists.", other → error + Retry | USR-01b |
| PATCH | `/api/v1/users/{user_id}` | body `UserStatusUpdate` `{status}` | `components['schemas']['UserRead']` | 403 `self_status_change_forbidden` / `admin_wildcard_required` / `permission_denied` → inline ForbiddenPanel; 409 `last_super_admin`; 404 `not_found`; 422 and others → message (max 200 chars) | USR-01b |
| GET | `/api/v1/users/{user_id}/role-assignments` | `limit=100`, `offset=0` (no `app` filter) | `components['schemas']['Page_AssignmentRead_']` | 403 inline ForbiddenPanel; other → alert + Retry | USR-02 |
