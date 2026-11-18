## PAN-029 consult: api-platform-engineer (read-only)

## Findings

**API semantics (org-admin-api @0757c27; both tickets DONE; plans in work/tickets/ADM-020/plan.md and USR-18/plan.md)**
- Organizations list: app/modules/organizations/router.py:41-75, repository.py:31-55. Params: `status`, `q`, `sort`, `limit` (1..100, default 20), `offset`.
- Apps list: app/modules/rbac/router.py (list_apps, params at ~66-87), rbac/repository.py:~96-110, schemas.py:29-30. Params: `status`, `join_policy`, `org_mode`, `q`, `sort`, `limit`, `offset`.
- **Filters are single-value.** `status`, `join_policy` and `org_mode` are each `Enum | None` (no list type). They are NOT multi-value and repeated params are not supported. With repeated params FastAPI keeps only the last value, so don't send them as arrays. Multiple different filters are ANDed. Allowed values:
  - org status: `active|suspended`
  - app status: `active|disabled`
  - join_policy: `open|approval|closed`
  - org_mode: `none|required`
  (rbac/models.py:38-52, organizations/models.py:10-12.)
- **`q`**:
  - Matching: case-insensitive substring (ILIKE `%q%` with ESCAPE `\`) via `ilike_any`. `%`, `_` and `\` are escaped, so they match literally.
  - Orgs match `name` OR `slug`. Apps match `key` OR `name`. Not `description`.
  - The value is NFC-normalized and then trimmed (app/core/listing.py:16-17), then must be 1..100 chars after trimming. Length is counted after the trim.
  - Empty or whitespace-only `q` returns **422**, so the UI must omit `q` when the box is blank. 101+ chars returns 422.
- **`sort`**:
  - Orgs: `created_at|-created_at|name|-name|slug|-slug`; default `-created_at`.
  - Apps: `key|-key|name|-name|created_at|-created_at`; default `key`.
  - Tie-break is always `id ASC`, in both directions.
  - Lookup is case-sensitive; `NAME`, `id` and `member_count` give 422.
  - `name` sorts by the DB collation, so production order may differ from what staff expect if the collation is `C`. This is an open API follow-up.
  - Only one sort key at a time.
- **Totals and pagination**: `total` is the filtered count. The response shape is unchanged, `Page[T]`. Apps still carry `member_count`, batched per page.
- **422 shape**: standard envelope `{error:{code:'validation_error', message, details:[{type,loc,msg}]}}` (admin-pan src/api/errors.test.ts:62-72 already parses it). Permission is checked BEFORE param validation, so a user without read permission gets 403, not 422, even with bad params.
- **Unknown query param names are ignored** (200). USR-18's "unknown values → 422" applies to values of the known params only (USR-18 plan AC3).
- **Seeded `admin` app**: always present (key `admin`, name `mmlabs Admin`, active, closed, none). It shows up in filter results, e.g. `status=active`, `join_policy=closed`, `org_mode=none`, or `q=admin`. A "no results" test or empty-state expectation must account for it.

**admin-pan state**
- The snapshot is already current. src/api/schema.d.ts:2344-2359 (apps) and :4977-4988 (orgs) include `status`/`join_policy`/`org_mode`/`q`/`sort`, and the types are single-valued unions. No regeneration is needed. Verify that src/api/openapi.json agrees (I only read schema.d.ts).
- The list params are still paging only:
  - src/features/organizations/api/queries.ts:19-41 has the type `{limit, offset}`, a query key that spells out only limit/offset (lines 27-31), and `toOrganizationsListParams` taking `{pagination}` only.
  - src/features/apps/api/queries.ts:31-33, 48-49, 74-80 are the same.
  - The `exhaustive-deps` eslint-disable at organizations/api/queries.ts:49 is for the injected `api`.
- URL schemas:
  - organizations/data/schema.ts:39-44 and apps/data/app-schema.ts:102-107 are `{page, pageSize}` only, with `.catch()` fallbacks.
  - users/data/schema.ts:21-25 uses `status: z.array(userStatusSchema).catch([])` (an array, which is a bad model for these single-value API filters) and a compile-time guard against the generated enum (lines 11-17), which is worth copying.
  - The users table keeps the typed email filter out of the URL (R5). `q` for orgs/apps is a name/slug/key, not PII, so it may be in the URL (the ticket allows it).
- organizations-table.tsx:33-69: `enableSorting:false`, `manualFiltering:true`, `globalFilter:{enabled:false}`, and a `role=status` live region that says "No organizations yet." for ANY empty result (lines 87-94, 147-149). This would be wrong for a filtered-empty result. apps-table.tsx has the same pattern (not read in detail).
- src/hooks/use-table-url-state.ts: `onGlobalFilterChange` (136-159) and `onColumnFiltersChange` (161-191) already reset `page` to undefined. The global filter key defaults to `filter` and is held in local state (`useState`) seeded once from the URL. That state does not resync on browser back/forward or a link edit, so the URL round trip can break. Also `trim` is local only; it does not apply NFC.
- The e2e fake API ignores filter params: e2e/support/fake-api.ts:359 and 361 call `page(ORGS, query)`. It needs filter, `q` and `sort` handling and 422 for empty `q`/bad `sort`. e2e/pages.e2e.ts:178, 213, 258 match on `c.path.startsWith(...)`, so check they still pass with query strings.

## Recommendations
1. **AC "unknown values fall back to defaults" (R2, types from the schema).** Define zod enums for each filter, keyed to the generated types with the users-style compile-time guard (users/data/schema.ts:11-17). Shape:
   - `status: enum.optional().catch(undefined)`, same for `join_policy` and `org_mode`
   - `sort: enum.optional().catch(undefined)`, with the default omitted from the URL and applied in `to*ListParams`
   - `q: z.string().trim().min(1).max(100).optional().catch(undefined)`
   Use `.catch(undefined)`, not `.catch([])`. Single-valued select (or radio-style) controls, not multi-select facets.
2. **Normalize `q` in one place.** Do NFC, trim, and drop if empty, in `to*ListParams`, so an empty or whitespace `q` is never sent (it would be 422 by design). Truncate or block input at 100 characters. A `maxLength=100` on the input is a good guard (the API counts NFC code points after trim).
3. **Query keys must include all params**: `{limit, offset, status, q, sort, ...}` (queries.ts:27-31 for orgs; apps equivalent). Omit undefined so key and request stay identical. Keep `keepPreviousData` (already there). The page also needs `ensurePageInRange` once `total` shrinks, which already exists.
4. **Page reset**: every filter, search or sort change sets `page: undefined` in the same `navigate` call. Use a debounced draft input state (e.g. 300 ms) that writes the URL once per settled value. Don't write the URL per keystroke, because that triggers a request per keystroke. Keep the input draft in sync with the URL on back/forward (the existing `useState` seeding in the hook does not). Use `replace: true` for debounced `q` writes if you want to avoid history spam.
5. **Sort**:
   - Enable server sort for orgs (`created_at`, `name`, `slug`) and apps (`key`, `name`, `created_at`). Other columns (status, members, join policy…) are NOT sortable; do not set `enableSorting` on them.
   - Cycle asc, desc, then default. The default sort is omitted from the URL and equals the API default (orgs `-created_at`, apps `key`).
   - Map TanStack sort state to the API string (`-` prefix for desc). Use `manualSorting: true`.
   - Expose `aria-sort` on the `<th>` via a real button in the header, with an accessible name; announce the sort change in the live region.
6. **Result-count and empty states**:
   - Live region: "N organizations matching filters" vs the unfiltered text.
   - Differentiate "No organizations match these filters" (with a "Clear filters" action) from "No organizations yet".
   - Remember that the `admin` app is always present in apps results.
7. **422** must be shown, not swallowed:
   - `queryView` has only `forbidden`/`error` states. The generic "Couldn't load..." message plus Retry is wrong for 422, since retry cannot help.
   - Detect `isApiError(e, 422)` and show the `message`/field from `details`, with a "Reset filters" action. A hand-edited URL such as `?q=%20` is already neutralised by zod, so a 422 should be rare; keep it for defense in depth and for a collation or limit mismatch.
8. **Tests (R8)**: assert on the exact request URL/params per control: `status`, `join_policy`, `org_mode`, `q` trimmed or absent, and `sort`. Also cover the URL to state round trip, page reset, a filtered-empty result, 422, 403 and error. Build the 422 mock with the envelope shape above. Assert that the injected fetch sees no client-side reordering (the table shows API order).
9. **e2e fake API**: implement `status`/`join_policy`/`org_mode` equality filters, `q` substring on (name, slug) / (key, name) after trim, `sort` including `-` and the id tie-break, and 422 `validation_error` for empty `q`, over-length `q` and unknown values. Include the seeded `admin` app in APPS if it isn't there.
10. **Docs**: update the stale comments (queries.ts:19-20, 31-32; table comments; schema comments) and mock/ADR 0005 notes. If ADR 0005 (paging-only decision) is superseded, say so.

## Risks
- Using the array-style `status` pattern from users would silently be wrong: repeated params keep only the last value, so a multi-select would show rows for one selected value while the chips show several.
- Debounce vs. URL sync: if the draft input is seeded once from the URL (the hook's `useState`), back/forward navigation will leave the input and results out of step.
- Empty `q` = 422 by design. Any code path that forwards `''` (clearing the box, whitespace) will produce a visible error.
- Case-sensitive `sort` values: casing from URL input must not be altered. zod `.catch` handles it.
- `name` sort collation depends on the production DB (ADM-020 plan "Needs owner's decision"): staff may report odd order for Vietnamese or mixed-case names. This is an API issue, not UI. Record as an API follow-up; do not sort client-side.
- Offset pagination over a mutable sort key (`name`) can duplicate or skip a row between pages (API plan, accepted).
- Apps list includes the always-present `admin` app, which can confuse empty-state wording and tests.
- Unknown query param names are ignored by the API, so a typo (e.g. `join-policy`) in client code returns 200 with unfiltered data. Only the generated-type check (`params: {query}`) catches this, so keep calls typed from the schema.

## Open questions
1. Should `q` be in the URL (ticket says allowed, no PII; org/app names are fine) and should it persist on page reload? Confirm that "filter" is the URL key for `q`, or rename to `q` for clarity and drop the old `filter` key (currently dropped by the schema).
2. Single-select dropdowns with an "All" option for each enum (recommended), or a segmented toggle? Spec §5.3/§5.4 UI wording may say. Not read.
3. Debounce delay (300 ms suggested) and whether to also search on Enter.
4. Is `member_count` sort wanted for apps? The API does not offer it (422), so it must go to the org-admin-api follow-up list (R1), not be faked in the UI.
5. Should changes to the list from mutations (e.g. suspend while `status=active` filter is on) leave the row visible until refetch? R9 invalidation already refetches, so the row will disappear. The a11y live region should announce the new count.
