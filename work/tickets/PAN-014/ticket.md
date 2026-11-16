# PAN-014: Organizations screen on the real API

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P1 |
| Areas | api, ui |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Replace Organizations mock data with `/api/v1/organizations` CRUD; 409 on duplicate slug shown on the field.

## Spec reference
`docs/spec-v1.md` §5.3

## Depends on
PAN-004, PAN-011; org-admin-api ADM-001 (USR-06 for created_by)

## Acceptance criteria
- [ ] Server-side pagination and filters (as the API supports)
- [ ] Create/edit/suspend/delete call the API with confirmation where destructive
- [ ] 409 conflict mapped to the slug field
- [ ] Loading, empty, error and 403 states are tested with the API mocked at the network layer, using a fake `fetch` injected into `createApiClient` (owner decision of 2026-11-16 in PAN-013: no MSW; ADR 0005)

## Notes / answers from owner
- Follow-up from PAN-004: confirm slug/name length limits from the OpenAPI; consider typing the slug to confirm delete.

## Orchestrator notes (2026-11-16)
- **Dependencies** (checked against org-admin-api origin/main a417ddb): ADM-001 is DONE, and the organizations router already has list, get, create, patch and delete with `admin:organizations:read/write`. PAN-004 and PAN-011 are DONE.
- **USR-06 is still BACKLOG.** It only provides `created_by`. Leave `created_by` out (or show it as not available) instead of waiting for it. Record a follow-up.
- **Follow the PAN-013 patterns:**
  - ADR 0005 server-side table, with only non-personal values in the URL
  - `queryView` / `ForbiddenPanel` (ADR 0004)
  - `<Can>` registry keys
  - `src/test-utils/api.ts` fake fetch
- **Mutations** use the same non-optimistic pattern, with inline errors in dialogs.
- **Snapshot.** The full OpenAPI regeneration is deferred to PAN-016. If organizations needs snapshot changes, hand-patch them as in PAN-013.
