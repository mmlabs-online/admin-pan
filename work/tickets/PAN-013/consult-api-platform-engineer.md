## PAN-013 API consult (api-platform-engineer, read-only)

### Findings

**1. Contract on origin/main (`app/modules/users/{router,schemas,service,repository}.py`)**

- `GET /api/v1/users` needs `admin:users:read`.
  - Query params: `email` (string, 1..254 chars, optional), `status` (`active` | `disabled`, a single value, optional), `limit` (1..100, default 20), `offset` (>=0, default 0).
  - Response is `Page<UserRead>` = `{items, total, limit, offset}`. `total` is the filtered count.
  - **`email` is a case-insensitive substring match** (`ILIKE %term%`, wildcards escaped). It is not an exact match.
  - **There is no sort parameter.** Order is fixed: `created_at DESC, id`. Any TanStack column sorting would only reorder the current page, so disable it (or leave it out).
  - An empty `email=` gives 422, so the client must omit the param when the box is empty.
- `GET /api/v1/users/{user_id}` needs `admin:users:read`. It returns `UserRead`, or 404 `not_found` ("User not found"). A non-UUID id gives 422.
- `PATCH /api/v1/users/{user_id}` needs `admin:users:write`.
  - Body is `{status: 'active'|'disabled'}` only. `extra=forbid`, and null or an unknown key gives 422. The response is the full `UserRead`.
  - **Setting the status the user already has is a 200 no-op.** No write happens and `updated_at` stays the same. It is idempotent, so a retry is safe.
  - Error codes (envelope `{error:{code,message,details}}`):
    - 403 `self_status_change_forbidden`: the actor cannot change their own status.
    - 403 `admin_wildcard_required`: the target holds a privileged assignment and the actor lacks `admin:*`. This applies to disable and to re-enable.
    - 403 `permission_denied`: the plain missing-permission case.
    - 409 `last_super_admin`: disabling the last active super-admin.
    - 404 `not_found`.
    - 422: validation.
  - Side effects of disabling:
    - The user's account sessions are revoked.
    - Reset and verify tokens are invalidated.
    - Admin tokens stop working on the next request.
    - Tell the user this in the confirm text; the existing copy only says "no longer able to sign in".
- `UserRead` fields: `id`, `email`, `status`, `email_verified_at`, `display_name`, `created_at`, `updated_at`. All are required, and `email_verified_at` and `display_name` are nullable.
- **Mock-to-API mapping: `src/features/users/data/schema.ts` already matches `UserRead` field for field.** The swap is mechanical. Per R2, replace the zod-derived `User` type with `components['schemas']['UserRead']`. Keep zod only for the URL search schema.

**2. Snapshot vs origin/main**

- I could not run `make openapi`, because the session is read-only. I compared by hand.
- Users paths, params and schemas match the source: `UserRead`, `UserStatus`, `UserStatusUpdate`, `Page_UserRead_`, the `x-permission` values, and `limit`/`offset` bounds all agree.
- One drift: **the snapshot's `PATCH /api/v1/users/{user_id}` has no `409` response.** The source adds it (`_WRITE["responses"][409] = "Last active super-admin"`). The same applies to the role-assignment DELETE. The snapshot has no `409` on that operation either.
- The error envelope is hand-written in `src/api/errors.ts` (flagged in ADR 0001), so this drift does not break types. It does mean the generated types will not tell you that 409 is possible.
- Recommendation: refresh the snapshot as part of PAN-013, per ADR 0001's "each real-API ticket refreshes the snapshot". Run the API's `make openapi OUT=...` from the same origin/main commit (d9e496f), then `pnpm api:types`. Diff the snapshot again afterwards.
- `registry.test.ts` already pins `users.view`, `users.setStatus` and `roles.viewAssignments` to the snapshot's `x-permission` values. Those keep passing.

**3. `?email=` vs R5**

- The partial string typed in the filter box can be a full address, and a full address in the URL is exactly what R5 forbids. It would reach browser history, copied links, and Referer headers. nginx sets Referrer-Policy, but history and links still leak it.
- Today the route search schema and `useTableUrlState` (`columnFilters: [{columnId:'email', searchKey:'email'}]`) put it in the URL.
- Recommended decision: **keep `email` out of the URL.**
  - Hold it in component state (debounced, about 300 ms; trim; omit when empty).
  - Keep `status`, page and page size in the URL. They carry no PII.
  - Needs a small change to `users-table.tsx`: drop the email entry from `useTableUrlState`, and use a controlled input that feeds the query.
  - Reset `offset` to 0 whenever the email or status filter changes.
- Unavoidable residue: the API call itself is `GET /users?email=...`, so the term lands in API access logs and the request URL. R5 is about the UI's own URLs, logs and error reports, so this is acceptable for the app. Record a follow-up for org-admin-api: either confirm its request logs strip query strings, or offer a `POST /users/search`. Also make sure `ApiError` and any error reporting never include the request URL or query. `ApiError` already holds no URL.
- The owner should confirm this decision (see Open questions).

**4. Pagination and the table**

- The table is currently client-side: `getPaginationRowModel` and `getFilteredRowModel` on the full mock array.
- It must become server-side:
  - Use `manualPagination` and `manualFiltering`, and set `pageCount = ceil(total / limit)`. Also set `rowCount` or `total`, so the pagination UI can show the count.
  - Map `page` (1-based in the URL) to `offset = (page - 1) * pageSize`, with `limit = pageSize`. Cap `pageSize` at 100. The default is 10, which is fine.
  - Use `placeholderData: keepPreviousData` so paging does not flash the loading state.
  - `ensurePageInRange` must use the server `total`. After a status filter or an offset past the end, the API returns an empty `items` with `total` > 0, so clamp the page.
- Facets: `getFacetedUniqueValues` is client-side and will only see the current page. Use the static `statusOptions` for the filter.
- The `status` filter is `type:'array'` (multi-select) in the table, but the API takes **one** status. Either make it single-select, or treat "both selected" or "none" as "omit the param". Prefer single-select with an "All" option.
- Remove row selection and `DataTableBulkActions` for status, unless they loop over PATCH calls. That would be N non-atomic calls with partial failures, and R9 forbids optimistic updates. Recommend no bulk status in PAN-013 (R7). If it stays, show per-row results.
- The provider `setUsersStatus(ids[], status)` and the in-memory `users` state go away. Replace them with `useMutation`.

**5. Cache keys and invalidation**

Follow `organizations/api/queries.ts`: a `usersKeys` object plus `queryOptions` factories with the injected `api` and the same eslint-disable comment.

```
usersKeys.all = ['users']
usersKeys.list(params) = ['users','list',{limit,offset,email?,status?}]   // normalise: drop undefined/empty keys so equal filters share a cache entry
usersKeys.detail(id) = ['users','detail',id]
usersKeys.assignments(id, params) = ['users','detail',id,'role-assignments',params]
```

- Putting assignments under `detail(id)` means invalidating `detail(id)` also refreshes them. Alternatively keep them separate. Pick one deliberately.
- PATCH `onSuccess`:
  - `queryClient.invalidateQueries({queryKey: usersKeys.all})`. That covers every list and detail. Lists need it because the status filter and the order are affected.
  - Optionally `setQueryData(usersKeys.detail(id), response)` first. The response is the full fresh `UserRead`, so this is safe and not optimistic.
  - `onError` and `onSettled` must not mutate the cache (R9).
- Do not invalidate on a 403 or 409 beyond showing the error. A 409 or 403 may mean the state changed, so a plain refetch of the detail is cheap and fine.
- The detail sheet currently holds a `currentRow` copy in the provider. That goes stale after a refetch.
  - Store only the selected `id`, and render from `useQuery(usersKeys.detail(id))`. The list row can be used as `initialData`/placeholder.
  - Note that a 403 on `GET /users/{id}` is not possible if the user could see the list, since both need `users:read`. But 404 is possible (a deleted user), and it must be handled.
- Query defaults: `retry` should not retry 4xx. Check `main.tsx`; I did not verify it.

**6. States and `queryView` (ADR 0004)**

- Wrap the list and the detail in `queryView`: `pending`, `error`, `forbidden` (render `ForbiddenPanel`), `success`. Handle an empty `items` as its own "No results" state.
- A 403 on PATCH comes through the mutation error. Show the API message in the dialog or a toast, and do not close the dialog on error. Map these codes to friendly text and fall back to `error.message`:
  - `self_status_change_forbidden`: "You can't change your own status."
  - `admin_wildcard_required`: "Only a super-admin can change this account."
  - `last_super_admin`: "Can't disable the last active super-admin."
- `ConfirmDialog.handleConfirm` is currently synchronous and closes the dialog. It needs a pending state (disable the button, `aria-busy`), and the error must be announced (R10, role=alert or a live region). Check whether `ConfirmDialog` supports an async confirm or loading state. If not, that is a shared-component change; keep it small.
- Controls use `<Can>` with the registry keys `users.view` and `users.setStatus`. Hide or disable the row action when `admin:users:write` is missing. Also disable the action on the signed-in user's own row, as a courtesy only (the API enforces it).

**7. "Apps & roles" section (USR-02, already done on main)**

- `GET /api/v1/users/{user_id}/role-assignments`:
  - Permission: `admin:users:read`, the same as the user detail. So no new gate is needed; it uses registry key `roles.viewAssignments`. It is already in `ACTIONS`.
  - Query: `app` (app key filter, pattern `^[a-z][a-z0-9-]{1,31}$`), `limit`, `offset`. Returns `Page<AssignmentRead>`.
  - `AssignmentRead`: `id`, `app` (key), `role_id`, `role_key`, `org_id` (null means app scope), `granted_by`, `expires_at`, `active` (computed with the DB clock), `created_at`.
- There is no `role_name` or `org_name` field. Show `app`, `role_key`, a scope ("All" if `org_id` is null, otherwise the org id, or resolve it through the organizations list later), an `expires_at` badge, and an `active` indicator. Expired assignments are returned with `active:false`, so the UI must show them as inactive instead of hiding them.
- Fetch it in the detail sheet as its own query with its own pending, error and 403 states. A failure there must not block the rest of the detail. Use `limit=100` (the max); if `total > items.length`, show "Showing 100 of N" (follow-up for pagination).
- Remove the `PREVIEW_APP_ROLES` constant and the "Preview" badge.
- Assign and revoke (`roles.assign`, `roles.revoke`, `admin:roles:assign`) belong to a later ticket. Keep them out of PAN-013 (R7).

**8. Misc contract notes**

- The OpenAPI response lists only 200/401/403/422 for these routes. 404 is not declared, so branch on `ApiError.status` and `code` rather than on generated response types.
- `openapi-fetch` `unwrap` already exists; the PATCH call is `api.PATCH('/api/v1/users/{user_id}', {params:{path:{user_id}}, body:{status}})`.
- `email_verified_at` null means unverified. The API refuses app tokens and joins for unverified accounts, which is useful to show but is not the status.
- The `Page` helper in `src/api/page.ts` should already handle `total`. Not read in detail; verify it.

### Recommendations (tied to acceptance criteria and rules)

1. AC1 (server-side `limit`/`offset`, `email`, `status`):
   - Build `src/features/users/api/queries.ts` on the organizations pattern: `usersKeys`, `usersListQueryOptions`, `useUsersQuery`, `userQueryOptions`, `useUserQuery`, `useUpdateUserStatus`.
   - Make the table `manualPagination`/`manualFiltering`, and use `keepPreviousData`.
   - Use a single-select `status`. No column sorting. Debounce and trim `email`, and omit it when empty.
   - Reset the offset on filter change.
2. R5: keep `email` out of the URL (component state). Keep `status`, `page` and `pageSize` in the URL. Update the route search schema accordingly and add a test that the URL never contains the typed email.
3. AC2 and R9:
   - The confirm dialog names the target email and states the side effects (all sessions revoked, tokens invalidated).
   - The mutation is not optimistic. The dialog stays open on error and shows the mapped API message.
   - On success: invalidate `usersKeys.all`, optionally `setQueryData` the detail, and show a toast.
   - Add a unit test for the error-code-to-text mapping.
4. AC3 and R8:
   - MSW tests for list loading, empty, error, 403 (`ForbiddenPanel`) and success.
   - PATCH tests for 200, 403 `self_status_change_forbidden`, 409 `last_super_admin`, 404, and 422.
   - Tests that query params carry `limit`/`offset`/`status`, and that the email param is omitted when empty.
   - A role-assignments test covering the loaded, empty, 403, and `active:false` cases.
5. R2: use the generated `UserRead` type. Remove the hand-written `User` type and the mock data (`data/users.ts`), or keep it only for tests. Refresh the snapshot and `schema.d.ts` (gets the missing 409), then run `pnpm api:types`.
6. R4: wrap controls in `<Can>` (`users.view`, `users.setStatus`, `roles.viewAssignments`). The API is the authority; always handle 403.
7. Detail: keep only the `id` in state, and render from `useUserQuery`.
8. R7: no bulk status change, no assign/revoke, and no org-name resolution in this ticket. Record them as follow-ups.

### Risks

- **Snapshot drift (the missing 409).** Low impact today, since errors are hand-parsed, but refresh it per ADR 0001 so CI stays honest.
- **Stale detail sheet.** If `currentRow` stays a copied object, it shows the pre-PATCH status after the list refetches. Use id-based state.
- **Client-side table left partly on.** Leaving `getFilteredRowModel`/`getPaginationRowModel` active on a 10-row page would filter the page again and show wrong counts. Switch them all to manual.
- **Email in the API request URL.** It is out of scope for the UI, but it is still logged server-side (see follow-up).
- **Disable is heavier than the copy suggests.** It revokes sessions and invalidates tokens. Update the confirm text.
- **Own-row and privileged-user cases are only knowable from the API response.** Do not try to predict them in the UI beyond the courtesy self-row disable.
- **Concurrency.** The API serializes status changes (it locks the admin app row, then the user row), so two admins racing is safe. The UI should just refetch after a 409.
- **Bulk actions.** If kept, they produce partial failures, and R9 conflicts with optimistic UI.
- **`total` vs `items` mismatch** if a user is created or deleted between pages. This is normal offset-pagination behaviour; clamp the page and do not treat it as an error.

### Open questions (for the owner or planner)

1. R5: confirm that `email` leaves the URL and lives in state only. This is the recommendation, but it changes the PAN-003 behaviour. Alternative: keep it in the URL and amend R5 to allow filters. That is a rule change and needs an explicit owner decision.
2. Should the `status` filter be single-select (matches the API) or stay multi-select with "both = no filter"?
3. Bulk enable/disable: remove it in PAN-013 (recommended), or keep it as sequential per-row PATCH calls with per-row results?
4. Follow-up for org-admin-api: ask whether request logs drop query strings, and whether a POST search is wanted. Also ask to declare 404 and 409 (and the error schema) in OpenAPI so the hand-written envelope can go away.
5. Should the "Apps & roles" section show the org id raw for org-scoped assignments? There is no org name in `AssignmentRead`. Resolving it needs `admin:organizations:read`, which the user may lack. Recommend raw id plus a copy button for now, as a follow-up.

### Files read (absolute paths)
- /home/user/admin-pan/work/tickets/PAN-013/ticket.md
- /home/user/admin-pan/src/api/openapi.json (users and role-assignment paths, `UserRead`, `UserStatus`, `UserStatusUpdate`, `Page_UserRead_`)
- /home/user/admin-pan/src/api/errors.ts
- /home/user/admin-pan/src/lib/query-view.ts
- /home/user/admin-pan/src/lib/permissions/registry.ts
- /home/user/admin-pan/src/features/organizations/api/queries.ts
- /home/user/admin-pan/src/features/users/data/schema.ts
- /home/user/admin-pan/src/features/users/index.tsx
- /home/user/admin-pan/src/features/users/components/{users-table,users-provider,users-status-dialog,users-detail-sheet}.tsx
- /home/user/org-admin-api/app/modules/users/{router,schemas,service,repository}.py
- /home/user/org-admin-api/app/modules/rbac/assignments_router.py
- /home/user/org-admin-api/app/core/errors.py
- /home/user/org-admin-api/app/modules/rbac/schemas.py (`AssignmentRead`, `AssignmentCreate`)

Not read in full (verify when planning): `src/api/page.ts`, `src/hooks/use-table-url-state`, `src/components/confirm-dialog`, `src/main.tsx` (query defaults), `src/routes/_authenticated/users/index.tsx`, `docs/adr/0001` and `0004` bodies beyond the grep hits, and the org-admin-api `docs/identity-architecture.md`.
