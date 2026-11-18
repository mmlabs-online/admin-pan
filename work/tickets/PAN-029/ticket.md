# PAN-029: Filters and sort for the Organizations and Apps lists

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Areas | api, ui, a11y |
| Attempts | 0 |
| Created | 2026-11-18 |
| PR | — |

## Goal
Add server-side search, filters and sort to the `/organizations` and `/apps` tables using the query params org-admin-api now supports, replacing the "build without filters" decision of PAN-014 / PAN-015.

## Spec reference
`docs/spec-v1.md` §5.3 (Organizations), §5.4 (Apps, roles and access)

## Depends on
- PAN-014, PAN-015 (DONE).
- org-admin-api ADM-020 (DONE): `GET /api/v1/organizations` with `status`, `q`, `sort` (`created_at`, `name`, `slug`, each ± ).
- org-admin-api USR-18 (DONE): `GET /api/v1/apps` with `status`, `join_policy`, `org_mode`, `q`, `sort` (`key`, `name`, `created_at`, each ±).

## Acceptance criteria
- [ ] `/organizations`: text search (`q`), status filter and sortable columns send the API's params; the table shows only what the API returns (no client-side filtering or sorting of a page).
- [ ] `/apps`: text search (`q`), status, join policy and org mode filters, and sortable columns send the API's params.
- [ ] Filter, search and sort state lives in the route's URL search params (validated with zod; unknown values fall back to defaults) and changing any of them resets to the first page. No PII in the URL.
- [ ] Search input is debounced; a 422 from the API for a bad param is shown, not swallowed.
- [ ] Filter controls are labelled and keyboard reachable; sort state is exposed with `aria-sort`; the result count is announced (R10).
- [ ] States tested with the injected-fetch mock: request params per control, URL round-trip, page reset, empty result for a filter, error, 403; the e2e fake API accepts the new params.

## Notes / answers from owner
- 2026-11-18 (owner, "merge và làm tiếp"): proceed with the next API-ready work.
