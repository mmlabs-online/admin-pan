## PAN-029 consult: frontend-developer (read-only)

Consult report: PAN-029 (server-side search, filters, sort for /organizations and /apps). Read-only; no files changed.

## Findings

**API contract (already in the repo)**
- `/home/user/admin-pan/src/api/schema.d.ts:4977-4988` has `status`, `q`, `sort` for organizations. `:2344-2359` has `status`, `join_policy`, `org_mode`, `q`, `sort` for apps. No regeneration needed; the `ListParams` types in the queries files still need widening by hand.
- Org sort values: `created_at`, `name`, `slug`, each optionally prefixed `-` (default `-created_at`). App sort values: `key`, `name`, `created_at`, each optionally `-` (default `key`). Ties break by `id` ascending in both directions.
- `q` is NFC-normalised and stripped server-side, must be 1..100 chars after the strip, and empty or whitespace-only is 422 (`/home/user/org-admin-api/app/core/listing.py:12-27`). Matching is literal, case-insensitive substring: org name+slug (`organizations/repository.py:44`), app key+name (`rbac/router.py:70-78`).
- `GET /api/v1/apps` is also called (limit/offset only) by `src/features/organizations/components/entitlement-form-dialog.tsx:104`, `src/features/roles/index.tsx:55` and `src/features/users/components/role-assign-dialog.tsx:127`. They share `appsKeys.list`, so the new key shape must stay backward compatible.

**Current state**
- Both route search schemas are paging only: `src/features/organizations/data/schema.ts:41-44` and `src/features/apps/data/app-schema.ts:104-107` (`z.number().optional().catch(n)`). The route files `src/routes/_authenticated/{organizations,apps}/index.tsx` are already thin (`validateSearch` + component), so only the schemas change.
- Tables: `src/features/organizations/components/organizations-table.tsx:35-157` and `src/features/apps/components/apps-table.tsx:32-146`. Both use `manualPagination`, `enableSorting: false`, `manualFiltering: true`, one sr-only `role=status` line (`organizations-table.tsx:98-100`), a plain `TableHead`, and `aria-busy={view.status === 'pending'}`.
- Query keys contain only `{limit, offset}` (`src/features/organizations/api/queries.ts:27-31`, `src/features/apps/api/queries.ts:48-49`). Both list options use `placeholderData: keepPreviousData` (`organizations/api/queries.ts:59`, `apps/api/queries.ts:96`).
- `queryView` (`src/lib/query-view.ts:15`) maps every non-403 error to a generic error, rendered as "Couldn't load ..." + Retry (`organizations-table.tsx:124-132`). A 422 would be swallowed, which the ticket forbids. 422 is not retried (`src/lib/query-client.test.ts:22`).

**Users list pattern (`src/features/users/components/users-table.tsx`)**
- `useTableUrlState` with `globalFilter: {enabled: false}` and a `columnFilters` entry for `status` only (`:43-55`). The email stays in the hook's local state, deliberately not in the URL (PII, `:40-42`), debounced via `useDebouncedValue(emailInput, 300)` (`:57-59`).
- `toUsersListParams` (`src/features/users/api/queries.ts:64-79`) omits an empty `email` (a 422 otherwise) and sends `status` only when exactly one value is selected. The key (`:32-41`) conditionally spreads optional params.
- Distinct empty messages for filtered and unfiltered (`:99`, `:180-182`); `aria-busy={q.isFetching}` (`:118`); `ensurePageInRange` gated on `isSuccess && !isPlaceholderData` (`:85-88`).

**Existing data-table components**
- `src/components/data-table/toolbar.tsx`: the search Input is bound to `table.getColumn(searchKey).getFilterValue()` (`:36-46`), with no debounce of its own (debounce works only because the hook state lives outside). It has a global-filter branch (`:47-55`), a Reset button (`:70-82`) and always renders `DataTableViewOptions` (`:84`), which orgs and apps do not need.
- `src/components/data-table/faceted-filter.tsx`: it needs a TanStack `Column`, is multi-select, and `getFacetedUniqueValues()` (`:38`) is useless under `manualFiltering` (counts simply do not render, which is harmless). The API takes a single value per param, so multi-select is lossy (users' "exactly one value" rule). The `CommandInput` inside has only a placeholder, and the trigger button has no group semantics. Check against R10.
- `src/components/data-table/column-header.tsx`: a dropdown (Asc/Desc/Hide) over `column.toggleSorting`. Nothing in the repo sets `aria-sort`. `TableHead` gets none (`organizations-table.tsx:107`, `apps-table.tsx:98`). The org columns already use `DataTableColumnHeader` (`organizations-columns.tsx:14-15,30,47,62`) and render plain titles only because `enableSorting: false` is set at table level. Turning sorting on will make every column look sortable unless the unsortable ones opt out. The apps columns use plain string headers (`apps-columns.tsx:12-31`).
- `src/hooks/use-table-url-state.ts`: `columnFilters` is `useState(initialColumnFilters)` seeded once from the URL (`:110-111`) and does not resync on URL change (back/forward, links). It already resets `page` on filter change (`:184-190`). It has no sort support. The global-filter key defaults to `filter` (`:84`), whereas the ticket says `q` and the schema comments say old `?filter=` is dropped (`schema.ts:39-40`).
- `src/hooks/use-debounced-value.ts:4-11`: returns the initial value immediately, so a URL-seeded `q` is sent on first render without delay.

**Tests and e2e**
- `src/test-utils/api.ts`: `fakeApi(handler)` returns `{seen, client}`. Tests assert `new URL(req.url).searchParams`.
- `organizations-table.test.tsx:40-43` asserts the exact key set `['limit','offset']` for the default state. This is a useful regression guard if default values are omitted from the request.
- `src/features/organizations/components/test-fixtures.tsx:25-37` (`TableWithUrlState`, `opts.search`) and `users-table.test.tsx:39-52` already give a `search` state plus `navigate` and a `data-testid='search'` element, enough for URL round-trip and page-reset tests.
- `e2e/support/fake-api.ts:359,361` return `page(ORGS, query)` / `page(APPS, query)` and ignore all new params. The users handler (`:344-358`) is the template. All rows share one `stamp`, so `created_at` sort cannot be exercised there.

## Recommendations

1. **Search schemas (AC3).** Organizations: `{page, pageSize, q, status, sort}`. Apps: `{page, pageSize, q, status, join_policy, org_mode, sort}`.
   - `status`, `join_policy`, `org_mode`, `sort`: `z.enum([...]).optional().catch(undefined)`, so unknown values fall back to default.
   - `q`: `z.string().trim().max(100).optional().catch(undefined)` then `.transform(v => v || undefined)`; empty must never reach the API.
   - Derive enums from `components['schemas']` and add a drift test like the slug-limit one in `schema.test.ts`.
   - Omit `sort` from the URL when it equals the API default (`-created_at` for orgs, `key` for apps), which keeps default URLs clean and the existing "limit/offset only" test valid.
2. **Param mappers and keys (R2, AC1-2).**
   - Extend `toOrganizationsListParams` and `toAppsListParams` to `{pagination, q, status, sort, ...}`, mirroring `toUsersListParams` (trim `q`, omit empty).
   - Make new fields optional in `OrganizationsListParams`/`AppsListParams`, and conditionally spread them into `organizationsKeys.list` and `appsKeys.list`, as in `users/api/queries.ts:32-41`. The three other `appsListQueryOptions` callers then keep identical keys.
   - Org/app `q` is a name/slug/key substring, not an email, so URL and query key are acceptable under R5. Add a one-line comment saying so, so the reviewer does not flag it.
   - Update `src/features/organizations/api/queries.test.ts:46` and `src/features/apps/api/queries.test.tsx:66` ("sends nothing else").
3. **Sort via TanStack `manualSorting`.**
   - `manualSorting: true`; controlled `state.sorting` derived from the URL `sort` string (`-name` becomes `[{id:'name', desc:true}]`); `onSortingChange` writes the string back and drops `page`.
   - Only columns the API can sort get sorting: org `name`, `slug`, `created_at`; app `key`, `name`, `created_at`. Every other column gets `enableSorting: false` (status, description, join policy, org mode, origins, actions).
   - Header control: either adapt `column-header.tsx` (prop to hide the "Hide" item, since orgs/apps have no column toggling) or add a small `SortableHead` with a three-state button (none, asc, desc) and a name like "Sort by Name".
   - Set `aria-sort` (`ascending` / `descending` / `none`) on the `<th>` for sortable columns, read from `header.column.getIsSorted()` where `TableHead` is rendered (`organizations-table.tsx:107`, `apps-table.tsx:98`). Omit it on non-sortable columns.
4. **Filters and search input.**
   - Do not route `q`, `status`, `sort` through `useTableUrlState`'s `columnFilters` (it does not follow the URL, see Risks). Derive them from the validated route `search`, have controls call `navigate` themselves, and keep `useTableUrlState` for pagination only. Alternatively extend the hook with a tested `sorting` section that follows the URL.
   - Search Input: local state seeded from `search.q`, `useDebouncedValue(input, 300)`, write to the URL only when the trimmed debounced value changes, with `replace: true` so typing does not flood history. Use `maxLength={100}`, and never send an empty or whitespace-only value. Placeholder names what is matched ("Search by name or slug", "Search by key or name").
   - Filter controls: single-select (shadcn `Select` with an "All" option) is the honest fit for single-valued API params. If the faceted filter is reused, apply the users "exactly one value" rule and check its a11y. Add `aria-label` ("Status", "Join policy", "Org mode") and verify keyboard use.
   - Toolbar: reuse its layout/Reset pattern. Either add `viewOptions?: boolean` (default true, so users is unchanged) to `DataTableToolbar`, or build a small feature-level toolbar to keep the shared component stable (R7). Reset clears `q`, filters, `sort` and `page`.
5. **Page reset (AC3).** Route every change through one helper per table (for example `setFilters(patch)`) that always sets `page: undefined`. For `q`, reset when the debounced value commits, not per keystroke. Keep `ensurePageInRange` gated on `settled`.
6. **`placeholderData`.** Keep `keepPreviousData`, but:
   - Use `q.isFetching` for `aria-busy`, as users does (`users-table.tsx:118`). Today's `view.status === 'pending'` (`organizations-table.tsx:102`) stays false while old rows show for new filters.
   - Announce the count only when `!q.isPlaceholderData`.
   - A 403 or error on the new params already replaces stale rows because `queryView` checks `error` first.
7. **422 shown (AC4).** Add `isApiError(error, 422)` handling before the generic error row: a `role="alert"` with fixed text (for example "The search or filter wasn't accepted.") plus Retry. Do not echo API `msg`/`input` (R5; convention in `src/lib/password-errors.ts:19`). Stale rows are already hidden when `error != null`.
8. **Count and empty states (AC5).** Extend the sr-only status line (`organizations-table.tsx:88-94`, `apps-table.tsx:78-85`) with match wording when filtered. Add "No organizations match these filters." / "No apps match these filters." next to the existing unfiltered messages (like `users-table.tsx:181`). Keep a single polite live region, updated on settled data only.
9. **Tests (AC6, R8).** Use `fakeApi` and the `TableWithUrlState` harness.
   - Params per control (`q` after debounce, `status`, `join_policy`, `org_mode`, `sort` asc/desc), with exact `searchParams` and absent defaults. `q` trimmed; whitespace-only sends none.
   - URL round-trip: render with `search: {q, status, sort, page: 3}` and assert request and control values; then re-render with changed `search` and assert the controls follow.
   - Page reset: start at `page: 2`, change each control, assert `page` removed and `offset=0`.
   - Schema unit tests for fallbacks (`sort: 'bogus'`, `status: 'x'`, `q: ''`, `q` of 101 chars, bad `page`).
   - Filtered empty, error + Retry, 403 (also 403 on refetch after a filter change), 422 alert with old rows gone.
   - `aria-sort` values on sortable headers; no sort button on non-sortable headers.
   - Debounce: several keystrokes send one request.
   - Assert the request param for sort, not row order (server collation).
   - Keep the default-state "limit/offset only" test.
10. **e2e fake API (`e2e/support/fake-api.ts`).** Copy the users handler pattern (`:344-358`) into the organizations and apps handlers: filter by `status` (plus `join_policy`/`org_mode`), `q` as case-insensitive substring of name+slug / key+name, honour `sort` with the `-` prefix and id tiebreak, and return 422 for empty/over-long `q` or an unknown `sort`. No params must return exactly today's order (orgs in fixture order, apps by key) so the entitlement picker and dashboard stay unaffected. Give fake rows distinct `created_at` values only if an assertion needs it; check `STATS` and `e2e/pages.e2e.ts` first. Minimal scope: the handler update plus one or two assertions on `fake.calls` query strings.

## Risks

- `useTableUrlState` seeds `columnFilters` once (`:110-111`). Using it for `q`/`status` would break back/forward and deep-link round trips (see Recommendation 4).
- With `keepPreviousData`, `aria-busy` and the count announcement are wrong unless they use `isFetching` / `isPlaceholderData` (easy-to-miss a11y/correctness bug).
- Resetting the page on keystroke (instead of on the debounced commit) causes extra requests and jumps to page 1 mid-typing.
- The apps key shape is shared with three other features; new fields must be optional and omitted when unset.
- A user may type an email or personal name into `q`. Keep `q` out of logs, error reports and the 422 text.
- A reused multi-select faceted filter can silently mean "no filter" when two values are selected.
- `name` sort follows DB collation. The UI must not re-sort client-side, and tests must not assert an expected order.
- `__screenshots__/` artefacts exist in the repo from earlier failures; not part of this ticket (R7).

## Open questions

1. Confirm org/app `q` is URL state under the key `q` (not `filter`), per the ticket wording, given that users keeps its email out of the URL.
2. Org slug sort: separate Slug column, or a Slug entry in the Name header menu (slug is currently shown under the name)?
3. Status filters single-select with an "All" option (recommended) or multi-select?
4. Search placeholder should state what is matched (name+slug, key+name); description is neither searchable nor sortable. Acceptable?
5. Does the e2e fake data need distinct `created_at` values or an extra row, or is "accepts the params" enough?
6. 422 message: generic fixed text (recommended) or field/reason from `details`?

Files reviewed (absolute paths):
- /home/user/admin-pan/work/tickets/PAN-029/ticket.md
- /home/user/admin-pan/src/features/organizations/data/schema.ts
- /home/user/admin-pan/src/features/organizations/api/queries.ts
- /home/user/admin-pan/src/features/organizations/components/organizations-table.tsx
- /home/user/admin-pan/src/features/organizations/components/organizations-columns.tsx
- /home/user/admin-pan/src/features/organizations/components/test-fixtures.tsx
- /home/user/admin-pan/src/features/organizations/components/organizations-table.test.tsx
- /home/user/admin-pan/src/features/apps/data/app-schema.ts
- /home/user/admin-pan/src/features/apps/api/queries.ts
- /home/user/admin-pan/src/features/apps/components/apps-table.tsx
- /home/user/admin-pan/src/features/apps/components/apps-columns.tsx
- /home/user/admin-pan/src/features/users/api/queries.ts
- /home/user/admin-pan/src/features/users/components/users-table.tsx
- /home/user/admin-pan/src/features/users/components/users-table.test.tsx
- /home/user/admin-pan/src/hooks/use-table-url-state.ts
- /home/user/admin-pan/src/hooks/use-debounced-value.ts
- /home/user/admin-pan/src/components/data-table/toolbar.tsx
- /home/user/admin-pan/src/components/data-table/faceted-filter.tsx
- /home/user/admin-pan/src/components/data-table/column-header.tsx
- /home/user/admin-pan/src/lib/query-view.ts
- /home/user/admin-pan/src/test-utils/api.ts
- /home/user/admin-pan/e2e/support/fake-api.ts
- /home/user/admin-pan/src/api/schema.d.ts
- /home/user/org-admin-api/app/core/listing.py
- /home/user/org-admin-api/app/modules/rbac/router.py
- /home/user/org-admin-api/app/modules/organizations/router.py, schemas.py, repository.py
