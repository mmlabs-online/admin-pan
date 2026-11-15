# PAN-009: API client, error envelope and generated OpenAPI types

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Areas | architecture, api, security |
| Attempts | 1 |
| Created | 2026-11-11 |
| PR | https://github.com/mmlabs-online/admin-pan/pull/2 |

## Goal
One HTTP client in `src/api/` (base URL from `VITE_API_BASE_URL`, error envelope, `Page<T>`), types generated from org-admin-api `/openapi.json`, and a pattern for TanStack Query hooks per feature.

## Spec reference
`docs/spec-v1.md` §2; CLAUDE.md R2, R5

## Depends on
PAN-001

## Acceptance criteria
- [x] `pnpm api:types` generates `src/api/schema.d.ts` from org-admin-api OpenAPI (file committed)
- [x] Client parses `{error:{code,message,details}}` and non-JSON errors into one error type; unit tests
- [x] 401 triggers re-auth hook point, 403 is surfaced to the caller
- [x] No `fetch`/axios use outside `src/api/` (lint rule or test)
- [x] Local dev documented: real API on :8000 or mocks

## Notes / answers from owner
None yet.
