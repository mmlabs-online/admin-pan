## PAN-013 frontend consult: Users screen on the real API

I changed nothing; this is read-only. I read the Users feature, the route, the shared data-table, `queries.ts`, `query-view`, `ForbiddenPanel`, `Can`, `query-client`, `schema.d.ts` and `test-utils`.

### Findings

**1. API contract (generated `src/api/schema.d.ts`)**
- `GET /api/v1/users` takes `email?: string`, `status?: 'active'|'disabled'` (a single value, not an array), `limit`, `offset`. It returns `Page_UserRead_` = `{items,total,limit,offset}`.
- `GET /api/v1/users/{user_id}` returns `UserRead`.
- `PATCH /api/v1/users/{user_id}` takes `{status}` and returns the updated `UserRead`. An explicit null gives 422.
- There is **no bulk endpoint**, and no sort parameter. Server-side sort is also unavailable.
- The OpenAPI response lists only 401, 403 and 422 for these operations.
- `ACTIONS` already has `users.view` (`admin:users:read`) and `users.setStatus` (`admin:users:write`), and `ROUTE_PERMISSIONS` already maps `/_authenticated/users/`.

**2. Current Users screen is fully client-side**
- `UsersProvider` holds a `useState` copy of ~200 mock users and `setUsersStatus`. `UsersTable` uses `getPaginationRowModel`, `getFilteredRowModel`, `getSortedRowModel` and faceted models.
- `UsersStatusDialog` and the bulk dialog call `setUsersStatus` synchronously, close, and toast.
- `data/schema.ts` hand-writes the `User` type with zod. R2 says types must come from the generated schema.

**3. URL state**
- The route search schema is `page`, `pageSize`, `status[]` and `email`.
- `useTableUrlState` derives pagination from the URL. It holds `columnFilters` in local `useState` seeded from the URL. It resets `page` on any filter change.
- `DataTableToolbar` writes every keystroke straight into `setFilterValue`, so there is no debounce.
- `DataTablePagination` offers page sizes 10 to 50, which is within the API limit of 100. `toPageParams` in `src/api/page.ts` already converts `{pageIndex,pageSize}` to `{limit,offset}`.
- `ensurePageInRange` only works if `table.getPageCount()` comes from the server total.

**4. Existing query pattern**
- `organizations/api/queries.ts` has a keys factory (`all`, `list(params)`), a `*QueryOptions(params, api = getApi())` function with an eslint-disable for the injected client, and a `useXQuery` hook. Its comment describes the mutation shape: invalidate the `all` key and never go optimistic.
- Nothing in the app consumes `queryView` or `ForbiddenPanel` yet. Users will be the first consumer, so it sets the template for the later screens.
- `queryView` checks `error` before `data`, so a 403 on refetch beats stale rows.
- The global `MutationCache.onError` calls `handleServerError`, which toasts 403 and other API errors. A mutation can opt out with `meta: { handlesOwnErrors: true }`.
- The global `QueryCache.onError` toasts only transient errors (network, timeout, 5xx). It deliberately leaves 403 to `queryView`.

**5. Network-layer testing: MSW is NOT installed** (not in `package.json`, no usage in `src`). The existing pattern is `createApiClient({ baseUrl: 'https://api.test', fetch: vi.fn(async (req: Request) => Response) })`. `organizations/api/queries.test.ts` shows it. It inspects `seen[0].url` and returns real `Response` objects, including the 403 error envelope. `createApiClient` also accepts `bearerFetch`, and `getApi()` is lazy. `src/test-utils` has `auth.tsx`, `permissions.tsx` (`WithPermissions`), `cookies.ts` and `tanstack-table.ts`, but no query-client or API helper. The ticket's AC says "tested with MSW"; R8 only requires "API mocked at the network layer".

**6. Bulk actions.** The bulk Disable button loops "one PATCH per user" in its comment, but the code is a local `setUsersStatus`. The API has no bulk endpoint.

**7. `email` in the URL.** `?email=` currently holds the full filter text, which conflicts with R5 ("no full emails in URLs"). The API only offers `email` as a query-string parameter, so the request itself carries it regardless.

**8. Detail sheet.** It gets the row from provider state, which becomes a stale copy once the data comes from a query. The "Apps & roles" block is hard-coded sample data.

### Recommendations

**A. API layer** (new `src/features/users/api/queries.ts`, plus `mutations.ts`; follow the organizations pattern)
- Add `usersKeys = { all:['users'], list(params), detail(id) }`. Include `email` and `status` in `list(params)`.
- Add `usersListQueryOptions({email?,status?,limit,offset}, api)` and set `placeholderData: keepPreviousData` (import from `@tanstack/react-query`). That avoids a flash of the loading state when paging or filtering. Combined with `queryView`, a refetch that fails is shown as an error (and 403 as `ForbiddenPanel`), never as stale rows.
- Pass `isPlaceholderData` / `isFetching` through to the table so it can show a subtle busy state (`aria-busy` on the table, dimmed rows). Disable the row actions while the data is placeholder, so nobody confirms against a row that is about to go away.
- Add `useUsersQuery(params)` and optionally `userDetailQueryOptions(id)`.
- Replace the hand-written `User` type with `components['schemas']['UserRead']` (R2). Keep zod only for the route search schema.
- `useSetUserStatusMutation`: `mutationFn: ({id,status}) => unwrap(await api.PATCH('/api/v1/users/{user_id}', {params:{path:{user_id:id}}, body:{status}}))`.
  - Set `retry:false` and no `onMutate` (never optimistic, R9).
  - `onSuccess` calls `queryClient.invalidateQueries({ queryKey: usersKeys.all })`, which covers list and detail.
  - Leave error handling to the global `handleServerError` toast, or set `handlesOwnErrors` and show the error inline in the dialog (see D).

**B. List URL to API mapping**
- `limit` and `offset` come from `toPageParams(pagination)`. Pass `manualPagination: true` and `pageCount: Math.ceil(total / limit)` to the table. Also pass `manualFiltering: true`, and `rowCount: total` if preferred.
- Remove `getPaginationRowModel`, `getFilteredRowModel`, `getFacetedRowModel` and `getFacetedUniqueValues` from the table. Remove the column `filterFn`.
- Faceted status filter: the API accepts one status only.
  - Option 1: make the filter single-select (a radio or a select) and change the route `status` from `z.array(...)` to `userStatusSchema.optional()`.
  - Option 2: keep the multi-select UI. Send `status` only when exactly one value is selected, and drop the param when both are selected. Two options are exhaustive, so this is correct and simplest.
  - Option 2 is less invasive and keeps the URL schema. Pick one and document it.
- Sorting: the API has no sort, and client-side sort on one page is misleading. Set `enableSorting:false` on all columns, remove the sort buttons from the headers, and file a follow-up for org-admin-api (a `sort` parameter). Do not fake sorting (R1).
- Email filter: debounce about 300 ms. Hold the typed text in local state, and write to the URL and query only after the debounce. Trim it, and treat the empty string as `undefined`. Fix `ensurePageInRange` and reset the page on filter change (already done by `useTableUrlState`).
- `email` and R5 (the ticket asks for a decision): the API only accepts `email` as a query param, so the request URL contains the typed text whatever the UI does. The app-URL concern is the browser address bar and history, plus the Referrer-Policy (already `no-referrer` in the API client). Recommend keeping `?email=` out of the app URL: hold it in component or zustand state, with a short note in the ADR or plan. Admin-typed filter text is a partial email in many cases. The cost is that the filter is not shareable or bookmarkable and is lost on reload. If the owner prefers shareability, keep it and note the R5 exception. This needs an owner decision (see Open questions). If it moves out of the URL, drop `email` from `usersSearchSchema`, and the tests that assert `"email":"carol"` in the URL must change.

**C. States (via `queryView`)**
In `features/users/index.tsx`, compute `view = queryView(q)` and render by `view.status`:
- `pending`: skeleton rows, with `aria-busy` and an announced "Loading users" status.
- `forbidden`: `<ForbiddenPanel copy={view.copy} variant='page' onRetry={refetch} />`, and also hide the filters and table.
- `error`: a message plus a Retry button, with `role='alert'`.
- `success` with `items.length===0`: "No users match these filters" (when filters are set, with a Reset-filters action) vs "No users yet".
- Keep the toolbar mounted while pending and while errored (not forbidden), so typed filter text is not lost.
- `UsersProvider` should hold only dialog state (`open`, `currentRow`), not data. Remove `users` and `setUsersStatus`.
- The route is gated by the permission guard (`admin:users:read`), but the 403 from the API must still be handled (R4), which `queryView` does.

**D. PATCH status mutation (R9)**
- `UsersStatusDialog`:
  - Call the mutation from `handleConfirm`. Pass `isLoading={mutation.isPending}` (the existing `ConfirmDialog` disables both buttons during loading).
  - Do NOT close the dialog until success. On success call `onOpenChange(false)`, then `toast.success`.
  - On failure keep the dialog open and show the error (the global toast through `handleServerError`, or inline `role='alert'` text with `handlesOwnErrors`). A 403 should show the `ForbiddenPanel` `variant='inline'` copy.
  - A 404 (the user was deleted) should show the message and close after invalidating.
  - A 409/422 should show `error.message`.
- `ConfirmDialog`'s `handleConfirm: () => void` is a plain click handler; with `mutate` (not `mutateAsync`), errors do not become unhandled promise rejections.
- Detail sheet and `currentRow`: the stale row copy is a risk. Either re-read the row from the list data by id, or use `userDetailQueryOptions(id)` for the sheet (which also satisfies the `GET /users/{id}` comment in the sheet and `users.view`). Prefer the detail query: it shows the newest status after invalidation, and gives the sheet its own loading/error/403 state through `queryView`.

**E. Bulk actions**
- The API has no bulk endpoint, so recommend removing the bulk Disable action. The alternatives are worse: N sequential PATCH calls give partial failure, no atomic result and N audit entries, which is hard to confirm and report safely. `DataTableBulkActions`, the row-select column, the `rowSelection` state, and their tests would all go.
- If the owner insists, the minimum is: sequential PATCHes via `Promise.allSettled` with a result summary ("2 disabled, 1 failed: email"), no optimistic update, invalidate once at the end. This is more scope (R7).
- Record a follow-up for org-admin-api (`POST /users/bulk-status`, or similar). Spec §5.2 should be checked for a bulk requirement. The ticket's AC lists only single PATCH, so removing it is consistent with the ticket.

**F. Detail sheet**
- Keep "Apps & roles" as is or remove it? The ticket's note says replace it with real role assignments (USR-02). `GET /users/{id}/role-assignments` exists in the schema (the `roles.viewAssignments` action is registered), but the ticket's AC does not cover it. Recommend leaving the sample block clearly labelled "Preview" (it already is), or removing it, so the real screen does not show fake data next to real data. Fake data on a real screen conflicts with R1's spirit. Preferred: remove it and file a follow-up for USR-02 wiring. Ask the owner.

**G. Tests (R8): API mocked at the network layer**
- MSW is not installed, and adding a dependency changes the stack's tooling, so it needs an owner decision. The AC mentions MSW, which makes it a spec-versus-repo mismatch.
- Recommended default without a new dependency: a small `src/test-utils/api.ts` helper:
  - `fakeApi(handler: (req: Request) => Response | Promise<Response>)` returns `{ client: createApiClient({ baseUrl:'https://api.test', fetch }), seen }`.
  - It should be wired in through a `QueryClientProvider` and an injected `api`. Since `getApi()` is a module singleton and hooks take `api = getApi()`, hooks need an `api` injection point (as in `useForgotPasswordMutation(api: () => ApiClient = getApi)`), or the page-level components take an `api` prop or context.
  - A `renderWithQuery` helper with `new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})` is also needed. Check `src/test-utils/auth.tsx` first for reuse.
- If the owner approves MSW, use `msw/browser` with `setupWorker` (the repo runs in Vitest browser mode), a `worker.start({onUnhandledRequest:'error'})` in the test file, and `https://api.test` as the base URL. Check that `getApi()`'s `bearerFetch` is bypassed in tests (it calls `getAuthClient().fetchWithToken`), so the tests need `createApiClient` with a plain `fetch` anyway.
- Test list:
  - Query-options unit tests (like `organizations/api/queries.test.ts`): URL params `limit/offset/email/status`; page 3 with pageSize 10 gives `offset=20`; the email is trimmed; empty email and an unset status are omitted; `keepPreviousData` is set.
  - Screen tests: loading (a never-resolving fetch, so skeleton rows appear), empty, error (500, with Retry refetching), 403 (`ForbiddenPanel`, and stale rows are not shown after a refetch fails), pagination (next click requests `offset=10` and the URL search updates), filter (debounced; page reset), status facet (one status sends `status=disabled`).
  - Mutation tests: confirm sends `PATCH /api/v1/users/{id}` with body `{status:'disabled'}`; the dialog is open and the button disabled while pending; no status change shown before the response (the "no optimistic" assertion: hold the response, assert the badge still says Active); success closes, toasts and refetches the list (assert a second GET); failure (403, 404, 422) keeps the dialog open and shows the error with the row unchanged; cancel sends no request.
  - Permission test: without `admin:users:write`, Enable/Disable is hidden (existing test adapted); a 403 on PATCH is still shown (R4).
  - Remove the "mock users data has ~200 users" test with the mock file.
- The old `users-table.test.tsx` rewrites substantially. Its `Table` helper passes `data={users}` from the provider, which goes away.

**H. Housekeeping**
- Delete `data/users.ts` (mock) and `data/schema.ts` hand-written types once the screens use the generated ones. Check `data/data.ts` for `statusOptions`, `formatDate`, `formatDateTime`, `userLabel`; keep those.
- Add the `// Mock: replaced by ...` removal.
- `src/api/no-http-outside-api.test.ts` exists and will pass, since only `src/api` calls HTTP. The queries file goes through `getApi()`, which is fine.
- Keep `users.setStatus` and `users.view` in `<Can>` for the row actions and the dialog.

### Risks
- **Stale-row actions**: with `keepPreviousData`, rows from the previous page/filter stay visible while the next page loads. A user could confirm a PATCH against a row that is about to disappear. Mitigation: confirm on the row id (not index), and disable row actions while `isPlaceholderData`.
- **Disabled-user self-lockout**: nothing in the OpenAPI snapshot says the API blocks disabling the current admin's own account. A staff member could disable themselves. The UI should not hide this, since the API owns the rule (R1). Add a follow-up for the API to reject it, and make sure a 409 or 422 message is shown in the dialog.
- **Mock-only fields**: nothing visible. The `UserRead` shape matches the mock, so the swap is mechanical.
- **Status facet semantic mismatch** (multi-select UI versus single API value): if both statuses are selected and the UI sends no filter, the result is correct. If the UI sends only the first one, the result is silently wrong. Test this.
- **`ensurePageInRange` loop**: with `manualPagination`, a `pageCount` of 0 while loading is guarded by `pageCount > 0`, so it will not trigger. After a status change that shrinks the list, the last page may become empty, and `ensurePageInRange` will redirect (replace) to the first page. That is acceptable but should be tested.
- **Debounce versus tests**: use fake timers or `expect.poll`/`vi.waitFor`; otherwise tests are flaky.
- **`onUnhandledRequest`**: if MSW is added, `getAuthClient()` must not be invoked in tests, or tests would hit the real auth client.
- **Total count staleness**: the `total` changes after the invalidation, so pagination controls update only after the refetch. Acceptable.
- **R10**: the table needs a loading announcement (`role='status'`) and `aria-busy`. The pagination buttons' `sr-only` labels exist already. The email input has an `aria-label`. The Retry and Reset buttons need visible focus (the shadcn default provides it).

### Open questions (for the owner or planner)
1. Keep `?email=` in the app URL (shareable, but R5-sensitive) or keep the filter in memory only? Recommendation: in memory only. This is the follow-up decision the ticket asks for.
2. MSW: the AC says "tested with MSW", but it is not installed. Approve adding `msw` as a dev dependency, or amend the AC to "API mocked at the network layer using the injected `fetch` pattern" (R8's wording)? Recommendation: the injected `fetch` helper, which needs no new dependency and matches the existing `queries.test.ts` pattern. The AC wording should be updated either way.
3. Bulk Disable: remove it (the API has no bulk endpoint; recommended) or keep it as N PATCH calls with a partial-failure summary? Remove the row-selection column too?
4. Status facet: keep multi-select and send `status` only when exactly one is selected, or switch to single-select?
5. "Apps & roles" preview block: remove it, or keep it labelled as sample data until USR-02?
6. Sorting: confirm that column sorting is dropped (no API sort parameter), with a follow-up for org-admin-api.
7. Is the API expected to block disabling your own account? If not, record an org-admin-api follow-up.

### Files referenced
- /home/user/admin-pan/work/tickets/PAN-013/ticket.md
- /home/user/admin-pan/src/features/users/index.tsx
- /home/user/admin-pan/src/features/users/components/users-table.tsx
- /home/user/admin-pan/src/features/users/components/users-provider.tsx
- /home/user/admin-pan/src/features/users/components/users-status-dialog.tsx
- /home/user/admin-pan/src/features/users/components/users-detail-sheet.tsx
- /home/user/admin-pan/src/features/users/components/data-table-bulk-actions.tsx
- /home/user/admin-pan/src/features/users/components/users-table.test.tsx
- /home/user/admin-pan/src/features/users/data/schema.ts
- /home/user/admin-pan/src/routes/_authenticated/users/index.tsx
- /home/user/admin-pan/src/features/organizations/api/queries.ts and queries.test.ts
- /home/user/admin-pan/src/hooks/use-table-url-state.ts
- /home/user/admin-pan/src/components/data-table/toolbar.tsx and pagination.tsx
- /home/user/admin-pan/src/lib/query-view.ts, src/components/forbidden-panel.tsx, src/lib/query-client.ts, src/lib/handle-server-error.ts
- /home/user/admin-pan/src/lib/permissions/registry.ts
- /home/user/admin-pan/src/api/client.ts, src/api/index.ts, src/api/page.ts, src/api/schema.d.ts
- /home/user/admin-pan/src/features/auth/api/mutations.ts (mutation pattern with injected api)
- /home/user/admin-pan/src/test-utils/ (permissions.tsx, auth.tsx)
