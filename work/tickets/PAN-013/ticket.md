# PAN-013: Users screen on the real API

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Areas | api, ui |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | https://github.com/mmlabs-online/admin-pan/pull/12 |

## Goal
Replace Users mock data with `GET /api/v1/users`, `GET/PATCH /api/v1/users/{id}`: server-side pagination and filters, enable/disable mutation with query invalidation.

## Spec reference
`docs/spec-v1.md` §5.2

## Depends on
PAN-003, PAN-011; org-admin-api USR-01b, ADM-002 (done), ADM-002b (mounts the users API in production)

## Acceptance criteria
- [ ] List uses server-side `limit`/`offset`, `email`, `status`
- [ ] PATCH status with confirmation; errors shown; no optimistic success (R9)
- [ ] Loading, empty, error and 403 states are tested with the API mocked at the network layer, using a fake `fetch` injected into `createApiClient` (owner, 2026-11-16: no MSW dependency)

## Notes / answers from owner
- Follow-up from PAN-003: the `email` filter is kept in the URL (`?email=`); CLAUDE.md R5 says no full emails in URLs — decide whether to keep it out of the URL when wiring the API.
- Follow-up from PAN-003: user detail shows a sample "Apps & roles" preview; replace with real role assignments (USR-02).

## Owner answers (2026-11-16)
- **R5 email filter.** The typed email filter lives only in component state, debounced. `status`, `page` and `pageSize` stay in the URL. The URL must never contain the typed email (add a test for this).
- **Tests.** No MSW. Use the injected `fetch` pattern; the acceptance criterion was reworded to match.
- **Bulk status.** Remove the bulk Disable action and the row-selection column; the API has no bulk endpoint. Follow-up for org-admin-api: a bulk status endpoint, if wanted.
- **"Apps & roles".** Wire it to the real `GET /api/v1/users/{id}/role-assignments`, read-only. Show app, role_key, scope (raw org id), expiry and an active flag. The section has its own loading, error and 403 states. Assign and revoke are not in this ticket. Remove the sample preview data.

## Orchestrator notes (2026-11-16)
- Dependencies checked against org-admin-api `origin/main` d9e496f: USR-01b, ADM-002 and ADM-002b are DONE and merged. PAN-003 and PAN-011 are DONE here.
- Since PAN-011, admin queries must render through `queryView` / `ForbiddenPanel` (ADR 0004), and controls use `<Can>` with the registry keys.
- Auth: admin calls go through `fetchWithToken` (ADR 0003-auth-client-integration). The local org-admin-api checkout is `/home/user/org-admin-api`, detached at origin/main.
