## Attempt 1 — 2026-11-18

### Files touched
| File | Required because |
|---|---|
| `src/lib/list-search.ts` (+ `.test.ts`) | One `q` normalisation (`searchTermSchema`, `toSearchTerm`, limits, debounce ms) |
| `src/lib/list-sort.ts` (+ `.test.ts`) | Three-state sort mapping, default omitted |
| `src/components/data-table/sort-button.tsx` | Sortable header button |
| `src/components/data-table/list-search-input.tsx` | Debounced, back/forward-safe search box |
| `src/components/data-table/filter-select.tsx` | Single-value filter select with "All" |
| `src/features/organizations/data/schema.ts` (+ `schema.test.ts`) | `q`, `status`, `sort` in the URL schema, generated-type guards |
| `src/features/organizations/api/queries.ts` (+ `queries.test.ts`) | Typed params, keys, `toOrganizationsListParams` |
| `src/features/organizations/components/organizations-columns.tsx` | Slug column, `SortButton` headers, `enableSorting: false` elsewhere |
| `src/features/organizations/components/organizations-toolbar.tsx` | New feature toolbar (search landmark) |
| `src/features/organizations/components/organizations-table.tsx` (+ `.test.tsx`) | manual sort, URL-driven filters, aria-sort/aria-busy, 422 / filtered-empty / status line |
| `src/features/organizations/components/test-fixtures.tsx` | `back` option ("Simulate back" button) for the back/forward test |
| `src/features/apps/data/app-schema.ts` (+ `app-schema.test.ts`) | Same for apps (`q`, `status`, `join_policy`, `org_mode`, `sort`) |
| `src/features/apps/api/queries.ts` (+ `queries.test.tsx`) | Typed params; keys spread filters conditionally |
| `src/features/apps/components/apps-columns.tsx` | `SortButton` headers, new Created column |
| `src/features/apps/components/apps-toolbar.tsx` | New feature toolbar |
| `src/features/apps/components/apps-table.tsx` (+ `.test.tsx`) | Same as orgs table |
| `src/features/apps/components/test-fixtures.tsx` | `back` option |
| `e2e/support/fake-api.ts` | orgs/apps handlers: filters, `q`, `sort`, 422; no-param order unchanged |
| `e2e/pages.e2e.ts` | search/filter/reset assertions on `api.calls`, axe with toolbar |
| `docs/adr/0005-server-side-tables.md` | Amendment (PAN-029) |

### Tests added / changed
- list-search.test.ts, list-sort.test.ts (as planned).
- organizations `schema.test.ts`, `queries.test.ts`; apps `app-schema.test.ts`, `queries.test.tsx` (mapping, keys, fallbacks).
- organizations-table.test.tsx: search/debounce/one request, whitespace sends nothing, status filter by keyboard + All, sort cycle + aria-sort, URL round-trip + back, page reset, filtered empty + Reset, 422 fixed alert + Reset, 403 after filter change, status line only when settled + aria-busy, accessible names. Replaced the old "no search box, facet or sort buttons" test (now false).
- apps-table.test.tsx: each filter sends its own param, search, sort (default Key ascending without URL sort), round-trip/back, page reset, filtered empty/422/403, accessible names. Replaced the old "no search box, facets or sort buttons" test.
- e2e: orgs search `q=glob`, status Suspended, Reset, axe; apps search `q=stok`, join policy Closed (admin app still listed), Reset, axe.

Mutation proofs (break, see fail, restore; sources restored and diff-checked):
- blank q sent (`q !== undefined && {q}` instead of the trimmed term): `toOrganizationsListParams sends q (trimmed)...` fails.
- page not reset (drop `page: undefined` in `setListSearch`): `every control resets the page` fails.
- default sort sent (drop the `!== ORG_DEFAULT_SORT` guard): `toOrganizationsListParams sends q...` fails.
- other /apps callers' keys (`status: p.status ?? null` always in key): both `appsKeys` tests fail.

### Checks (actual output summary)
- pnpm typecheck: clean.
- pnpm lint: clean (0 errors, 0 warnings).
- pnpm format then format:check: "All matched files use Prettier code style!"
- pnpm test: 111 files, 929 tests passed.
- pnpm build: built OK.
- pnpm e2e: 30 passed.

### Out-of-plan files
`src/features/*/components/test-fixtures.tsx` were listed as "only if needed"; both got a `back` option. None else.

### Deviations from the plan
- No "Reset filters" button inside the 422 alert or the filtered-empty row. The toolbar's Reset button is visible in exactly those states (a filter or sort is set) and a second button with the same name would be ambiguous for assistive tech and tests. Tests click the toolbar button.
- Slug sub-line removed from the Name cell (Slug column), as planned.

### Follow-ups (noticed, not done)
- org-admin-api: `name` sort follows the DB collation (`C` may misorder Vietnamese or mixed-case names); propose `COLLATE` / ICU ordering.
- org-admin-api: `member_count` sort for apps (422 today).
- admin-pan: Apps "Members" column (`AppRead.member_count` exists).
- admin-pan: reuse `ListSearchInput`, `FilterSelect`, `SortButton` on `/users` and `/audit-log`.
- admin-pan: stray `__screenshots__/` artefacts under `src/features/**/components`.

### Scope self-check
- Could the diff be smaller? No; the apps half mirrors the orgs half and tests were not cut.
- Diff size: about +1500 / -90 lines including tests (production code roughly 600).
