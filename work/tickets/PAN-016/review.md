## Attempt 1 — 2026-11-17
Verdict: PASS

### Checks (run by reviewer)
- pnpm typecheck: clean (`tsc -b`, no output).
- pnpm lint: clean (`eslint .`, no problems).
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): 70 files passed, 491 tests passed. This matches impl-log.
- pnpm build: "built in 1.25s".
- pnpm e2e: not in the plan.
- Snapshot regeneration, done by the reviewer:
  - org-admin-api HEAD is `8a4efb2`.
  - Command: `UV_PROJECT_ENVIRONMENT=<scratchpad>/oaa-venv uv run python -m app.cli openapi --output <scratchpad>/openapi.json`. Its output is byte-identical (`cmp`) to `src/api/openapi.json`.
  - `openapi-typescript src/api/openapi.json` into the scratchpad is byte-identical to `src/api/schema.d.ts`.
  - `git status` in org-admin-api is clean afterwards.

### Acceptance criteria
- [x] **Filters map to API query params; server-side pagination.**
  - `api/queries.ts:27-50` maps `actor→actor_user_id`, `target→target_id`, `targetType→target_type`, `actorKind→actor_kind`, `app→app_key`, `action`, `outcome`, and `from`/`to`. These match `audit/router.py:25-33` (aliases `from`/`to`).
  - Tests: `queries.test.ts` › "maps each URL filter to its API param", "omits empty and invalid values", "GETs /api/v1/audit-logs with the query string".
  - Tests: `audit-log-table.test.tsx` › "each filter control sends its param", "next page requests offset=20 and updates ?page", "changing a filter resets page".
  - The table uses `manualPagination` and `manualFiltering`. Grep finds no `getPagination/Sorted/FilteredRowModel` in the feature.
- [x] **(owner) Local day boundaries, `to` = start of the next local day, zone note shown.**
  - Code: `lib/format.ts` `toAuditRange` and `localZoneLabel`; the note is at `audit-log-filters.tsx:154-157`.
  - Tests: `format.test.ts` › toAuditRange (4 cases, including the year rollover) and localZoneLabel.
  - Tests: `audit-log-table.test.tsx` › "from and to days become local-day instants", "date pickers show the local time zone note", "from after to shows an inline error and sends no request".
- [x] **(owner) CSV export removed.** Grep finds no `toCsv`, `Export CSV` or `downloadCsv`. Test "has no export button and no sortable headers". Follow-up F1 is recorded.
- [x] **Before/after rendered as text only (R6).**
  - `audit-log-detail-sheet.tsx` renders every value as a text node (`formatValue` → `JSON.stringify`). No `dangerouslySetInnerHTML` or `innerHTML` in the feature.
  - Test "R6: HTML payloads in changes, user_agent and actor_label render as text".
  - Tests "renders from/to changes as a Field/Before/After table" and "renders a flat map as Field/Value".
- [x] **Links from user detail to the filtered audit log.**
  - `users-detail-sheet.tsx:96-122` is gated by `<Can action='audit.view'>`.
  - Tests: `users-detail-sheet.test.tsx` › "with admin:audit:read shows … links" (asserts the hrefs) and "without admin:audit:read the links are hidden".
  - Test: deep link "a ?target=&targetType=user deep link sends target_id and target_type and shows the values".
  - The org link is deferred to PAN-014 (orchestrator note, plan follow-up F3), because Organizations still runs on mock ids. This is accepted as a recorded deferral. The orchestrator should make sure PAN-014 picks it up.
- [x] **Loading, empty, error and 403 tested with a fake `fetch` injected into `createApiClient`.**
  - `audit-log-table.test.tsx` uses `fakeApi`, with these tests: "loading…", "empty (no filters)", "empty (filtered)", "error shows alert and Retry refetches", "422 shows the rejected-filters message with Reset", "403 renders ForbiddenPanel and hides the table", "403 on refetch replaces stale rows".
  - `package.json` has no `msw`.
- [x] **(orchestrator) Snapshot regenerated from 8a4efb2; `admin:audit:read` registered; `/audit-log` no longer pending.**
  - Snapshot: byte-identical regeneration (see Checks).
  - Registry: `registry.ts:10` (permission), `:70-73` (route), `:142` (`audit.view`).
  - `route-permission-guard.test.tsx` no longer lists `/audit-log/` as pending. `registry.test.ts` passes.
  - The PAN-013 409s and the PAN-011b `MePermissions` patch are in the generated output (impl-log (b)/(c)). Typecheck is green.
- [x] **R8 green checks:** see above.

### Issues
None.

### Scope
- Every changed source file is in the plan's file table.
- `src/api/errors.ts` also gains `export type ErrorEnvelopeWire`. It is type-only and justified under Out-of-plan files.
- The `work/` files are orchestrator and workflow artefacts.
- No dependency changes.

### Rules R1–R11
No violations found.
- **R1:** only `GET /api/v1/audit-logs`; no faked export.
- **R2:** all HTTP goes through `getApi()`/`unwrap` in `api/queries.ts`. Types come from `components['schemas']`. Zod enums are for URL validation only, with compile-time equality guards (`data/schema.ts`). The envelope type is tied to the generated `ErrorEnvelope`.
- **R3:** untouched.
- **R4:** route, nav and action are all gated on `admin:audit:read`, and the 403 shows `ForbiddenPanel`.
- **R5:** the URL holds only enums, an app key, uuids and days. Invalid text such as an email is never committed (test asserts no `@`/`%40` in requests or the search).
- **R6:** text only; no `href` is built from data.
- **R9:** no mutations.
- **R10:** labelled selects and inputs, `aria-invalid` and `aria-describedby`, a persistent live region, a View button instead of a row `onClick`, and `th scope` in the changes tables.

### Security / a11y blockers
None reported to the reviewer. Areas are `api, ui`, so the orchestrator owns any accessibility-auditor pass.

### Nits (do not block)
- **Text filter can disagree with the active filter.** `audit-log-filters.tsx` `TextFilter`: when a valid value is already in the URL and the user then types invalid text, the inline error shows. The list, however, keeps filtering by the previous valid value. Consider noting "still filtering by …" or clearing the committed value.
- **Pagination footer shows a stale total during an inverted range.** `audit-log-table.tsx:76-79`: the query is disabled but still has `keepPreviousData`, so the footer keeps the previous `rowCount`. The body correctly shows "Fix the date range to load entries."
- **Zone note is not linked to the date pickers.** `audit-log-filters.tsx:154`: the note "Dates use your time zone…" could be linked via `aria-describedby` on the date groups, so screen-reader users hear it with the pickers.
- **Type test direction differs from the plan.** `errors.test.ts:214-219` checks generated → zod-inferred; the plan said the reverse. With `details: unknown` on both sides the two directions are equivalent, so this is fine.

### Follow-ups (out of scope)
- org-admin-api: F1 server-side audit export endpoint (owner, 2026-11-17).
- org-admin-api: F2 `org_id` filter on `GET /audit-logs`.
- PAN-014: F3 org detail → `/audit-log?targetType=organization&target=<org id>`.
- org-admin-api: F4 subject-user filter, so role grants and revokes show in "Events about this user".
- org-admin-api: F5 `GET /audit-logs/{id}`.
- admin-pan: F6 amend ADR 0001's hand-written envelope note.
- admin-pan: F7 invalidate `['audit-logs']` after users and roles mutations.
- admin-pan: F8 "Filter by this actor/target" shortcuts in the detail sheet.
- admin-pan: F9 unused `/auth/orgs…` and invitation paths in the snapshot.
