# PAN-014: Organizations screen on the real API

| Field | Value |
|---|---|
| State | REVIEW |
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
PAN-004, PAN-011; org-admin-api ADM-001 (USR-06 for created_by); org-admin-api filters (`status`, `q`, `sort`) are a follow-up, not a blocker (owner, 2026-11-17)

## Acceptance criteria
- [ ] Server-side pagination and filters (as the API supports)
- [ ] Create/edit/suspend/delete call the API with confirmation where destructive
- [ ] 409 conflict mapped to the slug field
- [ ] Loading, empty, error and 403 states are tested with the API mocked at the network layer, using a fake `fetch` injected into `createApiClient` (owner decision of 2026-11-16 in PAN-013: no MSW; ADR 0005)

## Notes / answers from owner
- Follow-up from PAN-004: confirm slug/name length limits from the OpenAPI; consider typing the slug to confirm delete.

- From PAN-016 (F3): add the org detail link to the filtered audit log (`?targetType=organization&target=<org id>`), gated by `audit.view`. A full "org history" also needs an API `org_id` filter (PAN-016 F2).

## Owner answers (2026-11-16)
- **Filters.** Wait for the API to support filters. PAN-014 is BLOCKED until org-admin-api adds `status`, `q` (name/slug search) and `sort` to `GET /api/v1/organizations`. The request is in `org-admin-api-request.md` in this folder.
- **Delete.** Require typing the slug to confirm. The dialog says the deletion is permanent.
- **Shared ConfirmDialog a11y.** Fix it in this ticket, in a backward-compatible way:
  - `aria-disabled` plus an early return while pending, instead of native `disabled`;
  - a pending label and an sr-only status;
  - the inline error linked through `aria-describedby`.
  This also updates the users status dialog (the PAN-013 a11y follow-up).

## Owner answers (2026-11-17, unblock)
- **Stop waiting for API filters.** Build the screen now on the API as it is (org-admin-api main 33db316). Keep only the filters and sorting `GET /api/v1/organizations` actually supports; remove or hide the others, and keep the follow-up open against `org-admin-api-request.md` (`status`, `q`, `sort`). The other 2026-11-16 answers (typed-slug delete, shared ConfirmDialog a11y fix) still apply.
- **Snapshot.** PAN-016 already regenerated the snapshot fully from 8a4efb2. Regenerate it again from the current org-admin-api main if needed (it adds the app credential paths from USR-05a); do not hand-patch.

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
