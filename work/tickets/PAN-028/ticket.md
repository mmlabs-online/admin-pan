# PAN-028: App join requests (list, approve, reject)

| Field | Value |
|---|---|
| State | DONE |
| Priority | P2 |
| Areas | api, ui, auth |
| Attempts | 2 |
| Created | 2026-11-17 |
| PR | https://github.com/mmlabs-online/admin-pan/pull/22 |

## Goal
For apps whose join policy needs approval, let staff see pending join requests and approve or reject them. Backed by org-admin-api USR-03g.

## Spec reference
`docs/spec-v1.md` §5.4 (apps: join policy); org-admin-api USR-03g

## Depends on
PAN-015 (Apps on the real API); org-admin-api USR-03g (DONE, merged in c41ef57): `GET /api/v1/apps/{key}/join-requests` (`admin:users:read`), `POST /api/v1/apps/{key}/join-requests/{request_id}/approve` and `/reject` (`admin:roles:assign`).

## Acceptance criteria
- [ ] Join requests per app listed from the API, paginated, with the filters the API supports
- [ ] Approve and reject with a confirmation naming the requester; non-optimistic; list refreshed after success
- [ ] API errors shown inline (403, 404, 409)
- [ ] Loading, empty, error and 403 states tested with the fake fetch (ADR 0005)

## Notes / answers from owner
- 2026-11-17: owner asked to build what the API already offers first.

## Orchestrator notes (2026-11-17)
- Snapshot check done by the orchestrator: regenerated org-admin-api b79cf77 OpenAPI into the scratchpad and diffed it against `src/api/openapi.json` (c41ef57). The only differences are `/api/v1/stats/dashboard` and the stats schemas (ADM-015). The join-request paths and schemas are identical, so no regeneration in this ticket; the plan's pre-coding diff step is already satisfied.
