# ADR 0001: API client

Status: Accepted pending owner merge (PAN-009); auth seam amended by [ADR 0003](0003-auth-client-integration.md)

## Context
All data comes from org-admin-api (R1). We need one HTTP client (R2) with typed requests, one error type and a way to plug in authentication later (R3, PAN-010) without rewriting it.

## Decision
- `openapi-fetch` for the client and `openapi-typescript` for types; axios is removed.
- Types come from a committed snapshot `src/api/openapi.json` (dumped offline from org-admin-api with the users and RBAC flags on). `pnpm api:types` writes `src/api/schema.d.ts`; CI regenerates it and fails on a diff. Each "on the real API" ticket refreshes the snapshot.
- `VITE_API_BASE_URL` is an origin only, validated lazily on first use (https; http only for localhost in dev). OpenAPI paths already carry `/api/v1`.
- One `ApiError` for envelope errors, non-JSON errors, network, timeout and abort. It holds no request, headers, URL or body. The envelope type is hand-written (org-admin-api OpenAPI declares none), the only exception to R2's "no hand-written copies".
- Auth seam: `setAccessTokenProvider` and `setUnauthorizedHandler`. The client attaches `Authorization: Bearer`, never sends cookies or `X-MM-App`, and calls the handler once per auth generation on 401. 403 is thrown to the caller. No refresh or retry here; PAN-010 plugs in `@mmlabs/auth-client`.
- Query hooks per feature in `src/features/<feature>/api/`: a keys object, `queryOptions` factories and thin hooks (see organizations). Mutations use `useMutation` and invalidate `xKeys.all` on success; never optimistic (R9). Queries retry only network/timeout/5xx, at most 3 times in production; mutations never retry.
- ESLint forbids `fetch`, XHR, WebSocket, EventSource, `sendBeacon` and HTTP libraries outside `src/api/`; a unit test is the backstop.
- Dev-only Vite proxy `/api` to `:8000`, because admin Bearer paths have no CORS yet. It is not in `dist/`, so it is not a BFF.

## Alternatives
axios (loses types, leaks request config into errors); a hand-written fetch wrapper (more code to maintain); generating types from the production URL (not reproducible, misses flagged routers).

## Consequences
Hand-written `ApiError` until org-admin-api publishes an error schema; snapshot refresh per real-API ticket; deployed environments need org-admin-api CORS for admin origins.
