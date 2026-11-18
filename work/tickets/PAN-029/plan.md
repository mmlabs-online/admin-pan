Status: READY

# Plan: PAN-029, filters and sort for the Organizations and Apps lists

## Spec summary
- §5.3 Organizations: "List (paginated), create, detail, edit, suspend/reactivate, delete with confirmation." API: `/api/v1/organizations` CRUD.
- §5.4 Apps, roles and access: "Apps registry (join policy, org mode, origins, default role), …"
- §6: "Lists use server-side pagination (`limit` ≤ 100) and stay responsive with thousands of rows." and "WCAG 2.2 AA (rule R10)."
- ADR 0005: "Sorting is off unless the API offers a `sort` parameter." and "URL state holds only non-PII values (page, pageSize, enums)." Both APIs now offer `sort`, `q` and enum filters: org-admin-api ADM-020 and USR-18, both DONE. The generated snapshot already contains them: `src/api/schema.d.ts:2344-2359` (apps) and `:4977-4988` (orgs). The snapshot is not regenerated.

The spec does not mention filters on these two lists. The ticket adds them because the API offers them. Spec §7 says "Every admin task org-admin-api supports can be done in the UI", so there is no scope conflict.

API facts this plan relies on (consult-api-platform-engineer; org-admin-api @0757c27):
- Filters take one value each, and different filters are ANDed:
  - org `status`: `active|suspended`
  - app `status`: `active|disabled`
  - `join_policy`: `open|approval|closed`
  - `org_mode`: `none|required`
- `q` is a case-insensitive literal substring match:
  - orgs match name or slug; apps match key or name.
  - The API applies NFC, then trims, then requires 1..100 characters.
  - An empty or whitespace-only `q` returns 422.
- `sort` takes one key; a leading `-` means descending; ties break on `id` ascending.
  - orgs: `created_at|name|slug`, default `-created_at`.
  - apps: `key|name|created_at`, default `key`.
  - Any other value returns 422.
- `total` is the filtered count.
- Permission is checked before params, so a user without read permission gets 403, not 422.
- The seeded `admin` app always exists.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `/organizations`: `q`, status filter and sortable columns send the API's params; the table shows only what the API returns (no client filtering/sorting) | `organizations-table.test.tsx` › "search sends trimmed q after the debounce…", "status filter sends status…", "sort headers cycle…". Code check: no `getSortedRowModel`/`getFilteredRowModel`; `manualSorting: true`, `manualFiltering: true`. |
| 2 | `/apps`: `q`, status, join policy, org mode filters and sortable columns send the API's params | `apps-table.test.tsx` › "each filter sends its param…", "search…", "sort headers…" |
| 3 | State lives in validated URL search params; unknown values fall back to defaults; any change resets to page 1; no PII in the URL | `schema.test.ts` / `app-schema.test.ts` fallback cases; table tests "URL round-trip…", "every control resets page…"; `q` comment in both schemas (names, slugs and keys are not PII) |
| 4 | Search is debounced; an API 422 is shown, not swallowed | table tests "several keystrokes send one request after 300 ms", "422 shows the fixed alert and Reset filters…" |
| 5 | Controls labelled and keyboard reachable; `aria-sort` on sortable headers; result count announced | table tests "controls have accessible names…", "aria-sort reflects…", "status line announces the filtered count only on settled data"; e2e axe run on both list pages with the toolbar |
| 6 | Tested with injected fetch: params per control, URL round-trip, page reset, filtered-empty, error, 403; e2e fake API accepts the new params | the tests listed below, plus `pnpm test:e2e` (or the repo's e2e script) green with new assertions on `api.calls` query strings |
| R8 | All checks green | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/lib/list-search.ts` | **new.** `searchTermSchema` (zod: a number becomes a string, then trim, then 1..100, `.optional().catch(undefined)`), `toSearchTerm(v?: string): string \| undefined` (NFC, trim, `undefined` if empty), `SEARCH_MAX = 100`, `SEARCH_DEBOUNCE_MS = 300` | One normalisation of `q`, shared by both screens, so an empty `q` is never sent (it would be a 422) |
| `src/lib/list-search.test.ts` | **new** | Unit tests for the logic (R8) |
| `src/lib/list-sort.ts` | **new.** `toSortingState(sort, defaultSort): SortingState` (`'-name'` → `[{id:'name',desc:true}]`, `undefined` → the default sort parsed). `nextApiSort(prev: SortingState, next: SortingState, defaultSort): string \| undefined` (maps a TanStack toggle to the API string; see Approach §4; returns `undefined` when the result equals the default) | Three-state sort, with the default omitted from the URL and the request |
| `src/lib/list-sort.test.ts` | **new** | Unit tests (R8) |
| `src/components/data-table/sort-button.tsx` | **new.** `SortButton({column, title})`: ghost `Button` whose visible text is the title, with a direction icon (`aria-hidden`) and `onClick={column.getToggleSortingHandler()}`. Plain text when `!column.getCanSort()` | Header control. Existing `column-header.tsx` stays unchanged (its Asc/Desc/Hide menu has no "default" state and offers Hide) |
| `src/components/data-table/list-search-input.tsx` | **new.** Labelled `Input type='search'` with `maxLength={SEARCH_MAX}`. Local draft synced from the URL value; debounced commit; `onCommit(value \| undefined)` (Approach §3) | Debounced search that follows back/forward |
| `src/components/data-table/filter-select.tsx` | **new.** Generic single-select: visible `Label htmlFor` → shadcn `SelectTrigger id`; options plus "All" (sentinel `'all'` because Radix forbids `''`); `onChange(value \| undefined)` | Single-value API filters (never multi-select) |
| `src/features/organizations/data/schema.ts` | Search schema gains `q: searchTermSchema`; `status: organizationStatusSchema.optional().catch(undefined)`; `sort: z.enum(ORG_SORTS).optional().catch(undefined).transform(v => v === ORG_DEFAULT_SORT ? undefined : v)`. Compile-time guards against `OrganizationStatus` and the generated `sort` union (copy of `users/data/schema.ts:11-17`). Comment: `q` is an org name/slug, not PII, so it may sit in the URL (R5). Replace the stale "paging only" comment | AC3 |
| `src/features/organizations/data/schema.test.ts` | Add fallback cases | AC3 |
| `src/features/organizations/api/queries.ts` | `OrganizationsListParams` = `{limit, offset}` plus optional `status`, `q`, `sort`, typed from `paths['/api/v1/organizations']['get']['parameters']['query']`. `organizationsKeys.list` spreads the optional fields conditionally. `toOrganizationsListParams({pagination, q?, status?, sort?})` applies `toSearchTerm`, omits `undefined`, and omits the default sort. Update the stale comments (lines 19-20, 34) | AC1, R2 |
| `src/features/organizations/api/queries.test.ts` | Add mapping and key cases; keep the existing "nothing else" case | R8 |
| `src/features/organizations/components/organizations-columns.tsx` | New **Slug** column after Name (the slug moves out of the Name cell's sub-line). `SortButton` headers on `name`, `slug`, `created_at`. `enableSorting: false` on `status`, `description`, `actions` | Only API-sortable columns sort; a separate column is needed so `aria-sort` can show the slug sort |
| `src/features/organizations/components/organizations-toolbar.tsx` | **new.** `role='search'` `aria-label='Filter organizations'`. Holds `ListSearchInput` (label "Search organizations", placeholder "Name or slug"), `FilterSelect` "Status" (`organizationStatuses`, "All statuses"), and a "Reset filters" button shown when any filter or sort is set | Feature-level toolbar; shared `toolbar.tsx` stays unchanged (R7) |
| `src/features/organizations/components/organizations-table.tsx` | Derives `{q, status, sort}` from `organizationsSearchSchema.parse(search)`. One `setListSearch(patch, opts?)` helper that always sets `page: undefined`. Sets `manualSorting`, `sortDescFirst: false`, `enableMultiSort: false`, `state.sorting`, `onSortingChange`. Adds `aria-sort` on sortable `<th>` and `aria-busy={q.isFetching}`. Adds a 422 branch, a filtered-empty message, and status text that uses only settled data. Renders the toolbar. Replace the "ADR 0005 paging only" comment | AC1, AC3–AC5 |
| `src/features/organizations/components/organizations-table.test.tsx` | Add tests (below) | AC6 |
| `src/features/organizations/components/test-fixtures.tsx` | Only if needed: let `orgsServer` / harness accept a list handler so tests can return a filtered page or a 422 | Testability |
| `src/features/apps/data/app-schema.ts` | Same as orgs: `q`, `status`, `join_policy`, `org_mode`, `sort` (default `key` folded to `undefined`), compile-time guards against `AppStatus`, `JoinPolicy`, `OrgMode` and the generated sort union. `q` comment (app key/name, not PII). Replace the stale comment at :102-103 | AC3 |
| `src/features/apps/data/app-schema.test.ts` | Add fallback cases | AC3 |
| `src/features/apps/api/queries.ts` | `AppsListParams` = `{limit, offset}` plus optional `status`, `join_policy`, `org_mode`, `q`, `sort` (typed from `paths`). `appsKeys.list` spreads them conditionally, so the 3 other callers (`entitlement-form-dialog.tsx:104`, `roles/index.tsx:55`, `role-assign-dialog.tsx:127`) keep identical keys. Extend `toAppsListParams`. Update the stale comments (lines 31-32, 74) | AC2, R2 |
| `src/features/apps/api/queries.test.tsx` | Add mapping and key cases; keep the existing ones | R8 |
| `src/features/apps/components/apps-columns.tsx` | `SortButton` headers on `key`, `name`. New **Created** column (`<time dateTime>` + `formatDate`) after Origins, before actions, sortable. `enableSorting: false` on status, join_policy, org_mode, origins, actions. Update the stale "No sorting" comment (lines 7-8, sorting part only) | Apps `created_at` sort needs a visible column for `aria-sort` |
| `src/features/apps/components/apps-toolbar.tsx` | **new.** Same as orgs, with search "Search apps" (placeholder "Key or name") and three `FilterSelect`s: "Status" (`appStatusLabels`), "Join policy" (`joinPolicyOptions`), "Org mode" (`orgModeOptions`) | AC2 |
| `src/features/apps/components/apps-table.tsx` | Same changes as the organizations table | AC2–AC5 |
| `src/features/apps/components/apps-table.test.tsx` | Add tests (below) | AC6 |
| `src/features/apps/components/test-fixtures.tsx` | Only if needed (same reason as orgs) | Testability |
| `e2e/support/fake-api.ts` | Orgs and apps handlers, modelled on the users handler (`:344-358`): equality filters; `q` (trim, case-insensitive substring of name/slug or key/name); `sort` with `-` and an `id` tie-break; 422 `validation_error` envelope for empty/whitespace or >100-char `q`, unknown `sort` or unknown enum values. **No params: return exactly today's order** (fixture order) | AC6 ("the e2e fake API accepts the new params") |
| `e2e/pages.e2e.ts` | In the existing orgs and apps tests: type into the search box, expect the row count to change, assert one `api.calls` entry with `q=`; pick one filter and assert its param; run `expectNoSeriousA11y` on the list page with the toolbar | AC5, AC6 (minimal) |
| `docs/adr/0005-server-side-tables.md` | Append a short **Amendment (PAN-029)**: (a) non-PII free text (org name/slug, app key/name) may live in the URL as `q`; (b) when the API has `sort`, use `manualSorting` with a three-state header cycle, omit the default sort from URL and request, and set `aria-sort` on `<th>`. Not superseded | A decision that outlives the ticket (planner rule 7) |

No other files. In particular, `src/components/data-table/{toolbar,faceted-filter,column-header,index}.tsx`, `use-table-url-state.ts`, `query-view.ts`, `src/api/*` and the route files stay unchanged. The route files already pass `validateSearch: <schema>`, so only the schemas change.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/lib/list-search.test.ts` › "searchTermSchema: trims; '' / '   ' / 101 chars → undefined; number 123 → '123'; non-string → undefined" | AC3 fallback, router JSON-parsing of numeric `q` |
| `src/lib/list-search.test.ts` › "toSearchTerm: NFC + trim; whitespace → undefined" | never send empty `q` |
| `src/lib/list-sort.test.ts` › "toSortingState parses '-x' / 'x' / undefined → default" | sort mapping |
| `src/lib/list-sort.test.ts` › "nextApiSort: other column → asc; asc → desc; desc → default (undefined); the default column (orgs created_at desc) cycles asc ↔ default; apps key asc → '-key' → undefined" | three-state cycle |
| `organizations/data/schema.test.ts` › "search schema: bogus status/sort → undefined; '-created_at' → undefined (default); valid values kept; q trimmed; bad page → 1" | AC3 |
| `apps/data/app-schema.test.ts` › same for status, join_policy, org_mode, sort (`'key'` → undefined), q | AC3 |
| `organizations/api/queries.test.ts` › "toOrganizationsListParams sends q (trimmed), status, sort; omits blank q and the default sort" | AC1 |
| `organizations/api/queries.test.ts` › "list key includes only set filters; paging-only key unchanged" | key stability |
| `apps/api/queries.test.tsx` › "toAppsListParams sends q, status, join_policy, org_mode, sort; omits blank/default" | AC2 |
| `apps/api/queries.test.tsx` › "appsKeys.list({limit, offset}) equals the pre-PAN-029 key" | other callers unaffected |
| `organizations-table.test.tsx` › "default state still sends limit/offset only" (keep the existing test) | default request unchanged |
| `organizations-table.test.tsx` › "search sends trimmed q after the debounce; several keystrokes send one request; whitespace sends no q; URL gets q with page removed (replace)" | AC1, AC3, AC4 |
| `organizations-table.test.tsx` › "status filter (keyboard: focus, open, choose Suspended) sends status=suspended; All removes it" | AC1, AC5 |
| `organizations-table.test.tsx` › "sort headers: Name click → sort=name, again → -name, again → no sort; Created at from default → created_at; aria-sort ascending/descending/none; Status/Description have no sort button and no aria-sort" | AC1, AC5 |
| `organizations-table.test.tsx` › "URL round-trip: initial search {q, status, sort, page: 3} → request has them and offset 20; controls show them; re-rendering with a changed search (back/forward) updates input, select and request, and does not write the old draft back" | AC3, back/forward |
| `organizations-table.test.tsx` › "every control resets page: start at page 2, change q / status / sort → page absent, offset=0" | AC3 |
| `organizations-table.test.tsx` › "filtered empty: 'No organizations match these filters.' + Reset filters clears q/status/sort; unfiltered empty keeps 'No organizations yet.'" | AC6 |
| `organizations-table.test.tsx` › "422 shows the fixed alert (no API message echoed) and Reset filters; old rows are gone" | AC4 |
| `organizations-table.test.tsx` › "403 after a filter change shows the forbidden panel" and the existing error/Retry test | AC6 |
| `organizations-table.test.tsx` › "status line: 'N organizations match these filters, page 1 of M' only once settled; aria-busy true while fetching new filters" | AC5 |
| `organizations-table.test.tsx` › "controls have accessible names: Search organizations, Status; inside a search landmark" | AC5 |
| `apps-table.test.tsx` › the equivalents of the org tests, with `join_policy` and `org_mode` each sending its own param, sort on Key/Name/Created (default Key ascending shows `aria-sort='ascending'` with no URL `sort`), and filtered-empty using a fake response (unit tests do not depend on the admin app) | AC2–AC6 |
| `e2e/pages.e2e.ts` › organizations: search "glob" → 2 rows (header + Globex), call has `q=glob`; status Suspended → call has `status=suspended`; axe on the list | AC6 |
| `e2e/pages.e2e.ts` › apps: search "stok" → call has `q=stok`; join policy Closed → admin app still listed (always present), call has `join_policy=closed`; axe on the list | AC6 |

Assert request params, not row order: name order follows the server collation.

## Approach
1. **Shared helpers (`src/lib`)**:
   - `searchTermSchema`:
     - Preprocess `typeof v === 'number' ? String(v) : v`. TanStack Router JSON-parses search values, so a hand-typed `?q=123` arrives as a number.
     - Then `z.string().trim().min(1).max(SEARCH_MAX)`, `.optional().catch(undefined)`.
   - `toSearchTerm`: `v?.normalize('NFC').trim() || undefined`.
   - `list-sort.ts`, used with TanStack's built-in toggle (`sortDescFirst: false`, `enableSortingRemoval` default true):
     - The derived `sorting` always reflects the effective sort, including the default. So with no `sort`, orgs show `created_at` descending and apps show `key` ascending in `aria-sort`.
     - `nextApiSort(prev, next, default)`:
       - If `next` is empty (TanStack removed the sort after "desc"), the result is the default.
       - But if the removed entry *was* the default (`created_at desc` for orgs), the result is that column ascending. Without this, the default column could never leave its default.
       - Otherwise the result is `next[0]` as `id` or `-id`.
       - Finally, a result equal to the default becomes `undefined`.
2. **Schemas** (orgs, apps):
   - Enums use `z.enum([...])` with the users-style compile-time guards against generated types (R2), and `.optional().catch(undefined)` (unknown value → default).
   - `sort` also folds the explicit default to `undefined`.
   - Comment on `q`: org name/slug and app key/name are not PII, so `q` may be in the URL (R5, ADR 0005 amendment). It is still never logged and never echoed in error text.
3. **`ListSearchInput`** (back/forward safe):
   - `draft` state is seeded from `value` (URL `q`). A `dirty` ref is set on `onChange`.
   - `debounced = useDebouncedValue(draft, SEARCH_DEBOUNCE_MS)`.
   - Commit effect: when `dirty` and `toSearchTerm(debounced) !== value`, call `onCommit(toSearchTerm(debounced))` and clear `dirty`.
   - URL-sync effect: when `value` changes and differs from `toSearchTerm(draft)`, set `draft = value ?? ''` and clear `dirty`. A stale debounced value therefore never overwrites a back/forward navigation.
   - The parent's `onCommit` uses `navigate({replace: true, …})`.
   - `maxLength={100}`, `type='search'`, a visible or `sr-only` `<Label>` linked by `htmlFor`.
4. **Tables** (both):
   - Read state with `const s = <schema>.parse(search)`. The schema never throws, and the test harness passes raw objects.
   - `setListSearch(patch, {replace}?)` = `navigate({replace, search: prev => ({...prev, ...patch, page: undefined})})`. This is the only writer for q, filters, sort and reset. `q` commits with `replace: true`; selects, sort and reset push history entries.
   - Pagination stays on `useTableUrlState` (paging only, `globalFilter: {enabled: false}`, no `columnFilters`).
   - Query: `useQuery(listQueryOptions(toListParams({pagination, q: s.q, status: s.status, …, sort: s.sort}), api))`. Keep `keepPreviousData` and `ensurePageInRange` gated on `settled`.
   - `useReactTable` options: `manualSorting: true`, `sortDescFirst: false`, `enableMultiSort: false`, `state: {pagination, sorting: toSortingState(s.sort, DEFAULT)}`, `onSortingChange: u => setListSearch({sort: nextApiSort(sorting, functionalUpdate(u, sorting), DEFAULT)})`. No sorted or filtered row model.
   - `<TableHead aria-sort={…}>` only when `header.column.getCanSort()`.
   - `aria-busy={q.isFetching}`.
   - `filtered` = any of q/status (orgs) or q/status/join_policy/org_mode (apps). Sort alone is not a filter.
   - Body order:
     - pending
     - error with `isApiError(view.error, 422)`: `role='alert'` with the fixed text "The search or filters weren't accepted." and a "Reset filters" button. Retry cannot help a 422, and the API message is not shown (R5).
     - other errors (existing alert + Retry)
     - rows
     - empty: filtered → "No organizations/apps match these filters." plus "Reset filters"; unfiltered → existing text
   - Status line (single polite region):
     - pending, or `isPlaceholderData`: "Loading …".
     - settled: "N organizations match these filters, page x of y" when filtered, else the existing text; the empty texts as above.
     - The count is therefore announced only on settled data.
   - 403 (also after a filter change) is unchanged: `queryView` returns `forbidden` and the page renders `ForbiddenPanel`.
5. **Toolbars**: feature components under the table's existing layout. Controls are in DOM order before the table (keyboard reachable). The `FilterSelect` value comes from the URL, so it follows back/forward. The Reset button calls `setListSearch({q: undefined, status: undefined, …, sort: undefined})`.
6. **e2e fake API**: one helper per resource. `validate(query)` returns a 422 envelope or null; then filter, then sort only when `sort` is present (comparator plus an `id` tie-break), then `page(...)`. With no params the result is identical to today. The fake admin app stays as it is (`Admin console`).
7. **Rules**:
   - R1: only API params; no client filtering or sorting; nothing faked.
   - R2: params typed from `paths`; all HTTP still in `src/api`.
   - R4: no new permission. The list pages keep `admin:organizations:read` and `admin:apps:read`, and 403 is handled.
   - R5: `q` is non-PII by owner decision; never logged; the 422 text is fixed.
   - R6: no HTML rendering.
   - R7: shared data-table components and the hook are unchanged; additions are new files.
   - R8: tests listed above.
   - R9: no new mutations. Existing invalidation by `organizationsKeys.all` / `appsKeys.all` prefix still refetches filtered lists.
   - R10: labels, `aria-sort`, `aria-busy`, live count, `role=alert`, search landmark, axe in e2e.

## Specialist input used
- api-platform-engineer:
  - Adopted:
    - single-value enums with `.catch(undefined)` and generated-type guards
    - `q` normalisation in one place, never sent empty, `maxLength` 100
    - query keys with all params, `undefined` omitted
    - page reset in the same navigate call
    - three-state sort on API-sortable columns only, default omitted
    - `aria-sort`
    - distinct filtered-empty wording
    - 422 handled before the generic error
    - e2e fake: filters, q, sort, 422
    - the admin-app caveat
    - name-collation and `member_count`-sort follow-ups
  - Changed: show **fixed** 422 text, not `message` / `details` (owner decision; the frontend consult and R5 agree).
  - Not needed: regenerating the snapshot. It is current, per the caller.
- frontend-developer:
  - Adopted:
    - derive controls from the validated route search, not `useTableUrlState.columnFilters`
    - one reset helper per table
    - `useDebouncedValue` at 300 ms with `replace: true`
    - shadcn `Select` with "All"
    - conditionally spread key fields so the 3 other `/apps` callers keep identical keys
    - `aria-busy={isFetching}`, count only when `!isPlaceholderData`
    - feature-level toolbar so shared `toolbar.tsx` stays stable
    - keep the "limit/offset only" default test
    - assert params, not row order
    - e2e minimal assertions with no-param order unchanged
  - Chose a new `SortButton` over adapting `column-header.tsx`. This keeps the shared component unchanged (R7), and its Asc/Desc/Hide menu has no "back to default" state.
  - Open question 2 (slug sort): resolved with a separate Slug column.

## Assumptions
- URL key is `q` (not `filter`). Org/app names, slugs and keys are not PII, so `q` may be in the URL (owner decision; comment in the schemas; ADR 0005 amendment). Debounce 300 ms, `replace: true`, `maxLength` 100, trimmed, never sent empty or whitespace. There is no extra "search on Enter".
- Filters are single-select with an "All" option (labelled shadcn `Select`), never multi-select.
- Sort uses `manualSorting` with a three-state cycle: asc, desc, default. The column that holds the default sort cycles between its non-default direction and the default, so it never gets stuck. Only API-sortable columns sort: orgs name, slug, created_at; apps key, name, created_at. `aria-sort` sits on `<th>`. The default sort is omitted from URL and request.
- To make every API sort key a visible sortable header, orgs get a **Slug** column (moved out of the Name cell's sub-line) and apps get a **Created** column. Existing tests that use cell indexes or the slug sub-line are updated where needed. Row counts are unchanged.
- The 422 alert shows fixed text plus "Reset filters". The API message is not echoed.
- Unit-test fixtures need not contain the admin app. e2e expectations account for the always-present admin app in apps results.
- Status texts keep the current "N organizations" pattern. No pluralisation fix (out of scope).
- The Apps "Members" column (`member_count` now exists in `AppRead`) is not added here (R7). It is a follow-up.

## Blocking questions
None.

## Split proposal
None. This is one pattern applied to two screens: no migration, no new API, and the shared helpers are small. The estimate is roughly 450–550 production lines plus tests, which is over the rough guide. That is accepted because the apps half repeats the orgs half mechanically, and splitting would leave the shared helpers with a single user.

Fallback if the implementer's diff grows well beyond this: ship slice 1 (shared helpers + `/organizations` + e2e orgs + ADR amendment) and record slice 2 (`/apps`) as a follow-up ticket in impl-log. Do not cut tests to fit.

Follow-ups (record in impl-log, not in the diff):
- **org-admin-api**: `name` sort follows the DB collation (`C` in production may misorder Vietnamese or mixed-case names); propose `COLLATE` / ICU ordering.
- **org-admin-api**: `member_count` sort for apps (not offered; 422 today).
- **admin-pan**: an Apps "Members" column now that `AppRead.member_count` exists. The comment in `apps-columns.tsx:7` is stale.
- **admin-pan**: possibly reuse `ListSearchInput`, `FilterSelect` and `SortButton` on `/users` and `/audit-log` (users' multi-select status is lossy against a single-value API).
- **admin-pan**: stray `__screenshots__/` artefacts in `src/features/apps/**`.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/organizations` | `admin:organizations:read` (unchanged) | loading; empty (unfiltered "No organizations yet." / filtered "No organizations match these filters." + Reset); error + Retry; 422 alert + Reset filters; 403 `ForbiddenPanel`; happy with toolbar, sortable Name/Slug/Created at | search, status filter, sort, reset → URL only (no mutation) | none (existing mutations unchanged) |
| `/apps` | `admin:apps:read` (unchanged) | same, "No apps registered yet." / "No apps match these filters."; sortable Key/Name/Created | search, status / join policy / org mode filters, sort, reset → URL only | none |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/organizations` | `limit`, `offset`, optional `status` (`active\|suspended`), `q` (1..100, trimmed), `sort` (`created_at\|name\|slug`, `-` = desc; default `-created_at` omitted) | `Page_OrganizationRead_` via `paths['/api/v1/organizations']['get']` | 403 (forbidden panel), 422 (fixed alert + Reset filters), other (error + Retry) | ADM-020 (DONE) |
| GET | `/api/v1/apps` | `limit`, `offset`, optional `status` (`active\|disabled`), `join_policy` (`open\|approval\|closed`), `org_mode` (`none\|required`), `q`, `sort` (`key\|name\|created_at`, `-` = desc; default `key` omitted) | `paths['/api/v1/apps']['get']` response (`Page[AppRead]`) | 403, 422, other (as above) | USR-18 (DONE) |
