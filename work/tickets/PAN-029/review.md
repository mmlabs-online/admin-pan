# Review: PAN-029

## Attempt 1
Verdict: PASS

Reviewed commit 837d476 against `origin/main`.

### Checks (run by reviewer)
- pnpm typecheck: clean (`tsc -b`, no output).
- pnpm lint: clean (`eslint .`, no output).
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`):
  - Run 1: 110/111 files, 928/929 tests. The one failure was `roles/components/role-default-dialog.test.tsx` › "confirm names the role…": a `toast.success` assertion with 0 calls.
  - Run 2: 111/111 files, 929/929 tests.
  - Three extra runs of the roles, apps and organizations folders: 330/330 twice. One run had a single failure in `organizations-status-dialog.test.tsx` › "suspend: confirm…".
  - Both flaky files then passed 5/5 when run alone.
  - Neither file nor its component is in the diff. They fit the dialog/toast timing flakiness already recorded in PAN-027 and PAN-028. Judged unrelated.
  - The total matches impl-log (929).
- pnpm build: built OK (`vite build`, ✓ built).
- pnpm e2e: 30 passed. This matches impl-log.
- `git status --porcelain` after all mutation runs: clean.

### Acceptance criteria
- [x] **AC1** `/organizations` sends `q`, `status` and `sort`, and shows only what the API returns. Evidence:
  - Params: `organizations/api/queries.ts:52-70` (trimmed `q`, never empty; default `-created_at` omitted). Keys at `:38-49`.
  - No client-side filtering or sorting: `organizations-table.tsx:88-92` (`manualSorting`, `manualFiltering`), and no sorted or filtered row model (grep is empty).
  - Tests: `organizations-table.test.tsx:192` (search), `:233` (status by keyboard, All removes it), `:261` (sort cycle), `queries.test.ts` › "toOrganizationsListParams sends q (trimmed)…".
- [x] **AC2** `/apps` sends `q`, `status`, `join_policy`, `org_mode` and `sort` as single values. Evidence:
  - `apps/api/queries.ts:101-125`.
  - `apps-table.test.tsx` › "each filter sends its own param; All removes it", "search sends trimmed q…", "sort headers: default Key ascending…".
  - The 3 other `/apps` callers (`entitlement-form-dialog.tsx:104`, `roles/index.tsx:55`, `role-assign-dialog.tsx:127`) keep the key `['apps','list',{limit,offset}]`: `queries.ts:63-75` uses conditional spreads, and `queries.test.tsx` › "appsKeys.list({limit, offset}) equals the pre-PAN-029 key".
- [x] **AC3** URL state is validated with zod, unknown values fall back, and every change resets the page. Evidence:
  - Schemas: `organizations/data/schema.ts:40-88` and `apps/data/app-schema.ts:103-148`. These use `.catch(undefined)` with compile-time guards against the generated enums and sort unions, and fold the default sort to `undefined`.
  - Fallback tests: `schema.test.ts` and `app-schema.test.ts`.
  - Page reset: a single writer, `setListSearch`, with `page: undefined` (`organizations-table.tsx:60-67`, `apps-table.tsx:56-63`). Tests: `organizations-table.test.tsx:346` and apps "page resets on q / each select / sort".
  - Back/forward: `organizations-table.test.tsx:314` and the apps "URL round-trip…" test.
  - `q` holds only an org name/slug or an app key/name, so no PII. This is commented in both schemas and in the ADR 0005 amendment.
- [x] **AC4** Search is debounced, and a 422 is shown without the API text. Evidence:
  - Debounce: `list-search-input.tsx:272` (`useDebouncedValue(draft, 300)`). Test: `organizations-table.test.tsx:192` (one request).
  - 422 branch: `organizations-table.tsx:182-185`, `apps-table.tsx:188-191`, with fixed text. Tests: `:412` and apps "…422 fixed alert…" assert that "server text" is absent.
- [x] **AC5** Labels, keyboard access, `aria-sort` and the announced count. Evidence:
  - Labels: `filter-select.tsx` (`Label htmlFor` → trigger `id`), `list-search-input.tsx` (`Label htmlFor`), toolbar `role='search'`.
  - `aria-sort` only on sortable `<th>`: `organizations-table.tsx:160-164`, `apps-table.tsx:168-172`.
  - Polite status line on settled data only, plus `aria-busy={q.isFetching}`.
  - Tests: `organizations-table.test.tsx:458`, `:486`, `:261`, and the apps equivalents.
  - e2e axe passes with the toolbar on both pages.
  - a11y-review.md: no 🔴.
- [x] **AC6** The injected-fetch tests cover params per control, URL round-trip, page reset, filtered-empty, error and 403. Evidence:
  - The tests listed above, plus `:438` (403 after a filter change) and the existing error/Retry tests.
  - The e2e fake API accepts the new params, returns 422 on bad values, and keeps the no-param order (`e2e/support/fake-api.ts:292-345, 414-434`).
  - `e2e/pages.e2e.ts:154-178, 219-242` assert `q=glob`, `status=suspended`, `q=stok` and `join_policy=closed` on `api.calls`.

#### Mutation checks (reviewer, each restored with `git checkout`)
| Mutation | Result |
|---|---|
| drop `page: undefined` (orgs / apps) | "every control resets the page" / "page resets on…" fail |
| `aria-sort` mapping broken (orgs / apps) | sort-header tests fail |
| 422 alert echoes `error.message` (orgs); 422 branch removed (apps) | 422 tests fail |
| drop `\|\| q.isPlaceholderData` from the status line | "status line … only once settled" fails |
| `toAppsListParams` drops `org_mode` | 4 tests fail |
| `appsKeys.list` always adds `q: null` | both key tests fail |
| `nextApiSort` sends the default column back to the default only | list-sort and orgs sort-header tests fail |
| org `status` schema accepts any string | schema fallback test fails |
| `ListSearchInput` URL-sync effect disabled | both round-trip tests fail |
| `filtered` ignores status (orgs) / org_mode (apps) | 422 and status-line tests fail / filtered-empty test fails |
| default `key` sort sent for apps | mapping test fails |
| no debounce at all (`debounced = draft`) | orgs search test fails |
| debounce delay 0 ms | **all pass** (see Nit 1) |
| `dirty.current = false` removed from URL sync | all pass. This is an equivalent mutation: setting the draft restarts the debounce timer, so a stale draft cannot commit either way. No issue. |

### Issues
None blocking.

### Rules R1–R11
No violations found.
- **R1**: only API params; nothing filtered or sorted on the client.
- **R2**: params typed from `paths`; HTTP still only in `src/api`.
- **R4**: permissions unchanged; 403 handled.
- **R5**: the 422 text is fixed; `q` is non-PII.
- **R6**: no HTML sinks.
- **R7**: the shared data-table components (`toolbar`, `faceted-filter`, `column-header`, `index`, `use-table-url-state`, `query-view`), `src/api` and the routes are unchanged. Only new files were added under `src/components/data-table/`.
- **Plan scope**: `test-fixtures.tsx` was planned as "only if needed". Removing the Reset button from the 422 and empty rows is a justified deviation: the toolbar Reset button shows in every state where a filter or sort is set, which covers those rows.

### Security / a11y blockers
None. a11y-review.md has no 🔴; its 🟡 items are for the orchestrator to triage.

### Nits (do not block)
1. **Debounce test.** The "several keystrokes send one request" test (`organizations-table.test.tsx:192`) still passes with a 0 ms debounce, because `userEvent.type` sends the keystrokes as one burst. It proves that keystrokes are coalesced, but not the 300 ms delay. Asserting that no `q` request exists shortly after typing (before 300 ms) would pin the delay.
2. **`replace: true` is not tested.** The search commit uses `replace: true` (`organizations-table.tsx`, `onQ`), but the test harness `navigate` ignores `replace`, so nothing asserts it.
3. **Test name claims more than it checks.** `organizations-table.test.tsx:314` says "does not write the old draft back", but the test types nothing before the simulated back. The behaviour is correct by construction (see the mutation table), but the name overstates the test.
4. **Typing while pressing back.** If the user types while a back navigation changes only other params (`q` unchanged), the pending draft still commits with `replace`, onto the entry the user went back to. This is an edge case and acceptable.

### Follow-ups (out of scope)
- As recorded in impl-log:
  - name-sort collation and `member_count` sort (org-admin-api)
  - an Apps "Members" column
  - reuse of `ListSearchInput`, `FilterSelect` and `SortButton` on `/users` and `/audit-log`
  - stray `__screenshots__/`
- Flaky dialog/toast tests (`role-default-dialog.test.tsx`, `organizations-status-dialog.test.tsx`; earlier `app-status-dialog`, `app-form-dialog`) under full-suite load. Worth a dedicated ticket to stabilise toast assertions with `expect.poll`.
