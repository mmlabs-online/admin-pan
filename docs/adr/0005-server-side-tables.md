# ADR 0005: server-side tables, PII-free URL state, injected API in tests

Status: Accepted pending owner merge (PAN-013). Builds on [ADR 0001](0001-api-client.md) and [ADR 0004](0004-permission-mirroring-and-403-handling.md).

## Context
Spec §6: lists use server-side pagination (`limit` ≤ 100) and stay responsive with thousands of rows. R5: no full emails in URLs. The owner asked (2026-11-16) for no MSW dependency. PAN-013 to PAN-016 each wire a list screen, so they need one pattern.

## Decision
- **Server-side tables.** `manualPagination` and `manualFiltering`, `rowCount` from the API `total`, `placeholderData: keepPreviousData`, and no client row models (no sorted, filtered, paginated or faceted). Sorting is off unless the API offers a `sort` parameter. `ensurePageInRange` runs only on settled data, not on placeholder data.
- **URL state holds only non-PII values** (page, pageSize, enums). A free-text filter that can contain an email stays in component state and is debounced (300 ms) before it is sent as a query parameter. The `*SearchSchema` drops unknown keys, so an old `?email=` link is ignored.
- **Queries render through `queryView`** (ADR 0004). Each independent section (for example a detail sheet's role assignments) has its own loading, empty, error and 403 states, so one failing section never hides the rest.
- **Feature providers accept an injected `ApiClient`** (default `getApi()`). Tests mock the network with a fake `fetch` passed to `createApiClient` via `src/test-utils/api.ts` (`fakeApi`, `json`, `apiError`, `testQueryClient`), not with MSW.

## Alternatives rejected
- Client-side filtering and sorting of one fetched page: wrong results beyond the page and misleading facet counts.
- Email in the URL: shareable but leaks PII into history, logs and referrers (R5).
- MSW: an extra dependency and service-worker setup for no gain over an injected `fetch` (owner decision).

## Consequences
- The email filter is not shareable by link and is lost on reload; `status`, `page` and `pageSize` survive.
- The email travels in the API query string (substring match); org-admin-api should confirm its request logs drop query strings, or offer a `POST` search (follow-up).
