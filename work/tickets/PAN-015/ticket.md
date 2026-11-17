# PAN-015: Apps, permissions, roles and assignments on the real API

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P1 |
| Areas | api, ui, auth |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Replace apps/roles mock data with the USR-02 admin endpoints (apps registry, permissions, roles, role assignments).

## Spec reference
`docs/spec-v1.md` §5.4

## Depends on
PAN-005, PAN-006, PAN-011; org-admin-api USR-02, USR-02b/c/d (done), ADM-002b (mounts the RBAC APIs in production)

## Acceptance criteria
- [ ] Every screen action maps to a USR-02 endpoint (missing ones become org-admin-api follow-ups)
- [ ] Revoke/assign with confirmation and query invalidation
- [ ] Loading, empty, error and 403 states are tested with the API mocked at the network layer, using a fake `fetch` injected into `createApiClient` (owner decision of 2026-11-16 in PAN-013: no MSW; ADR 0005)

## Notes / answers from owner
- Follow-up from PAN-005: the Members column uses mock counts; org-admin-api has no member count per app (gap) — add to USR-02 or drop the column.
- Follow-up from PAN-005: no "set default role" action yet; role keys stored as `<app>:<key>` — check against the API.

## Orchestrator notes (2026-11-17)
- **Dependencies** (checked against org-admin-api origin/main a417ddb): USR-02, USR-02b, USR-02c, USR-02d and ADM-002b are DONE and merged. PAN-005, PAN-006 and PAN-011 are DONE.
- **Member count.** org-admin-api ADM-016 (`member_count` on the apps list and detail) is still BACKLOG, P3. Do not fake member counts (R1). Either drop the Members column now, or show it as unavailable, and record the follow-up. The owner was not asked; this follows R1.
- **Follow the PAN-013 patterns:**
  - ADR 0005 server-side tables; only non-personal values in the URL; check which list filters the API actually supports before keeping any toolbar filter.
  - `queryView` / `ForbiddenPanel` (ADR 0004).
  - `<Can>` registry keys.
  - The `src/test-utils/api.ts` fake fetch.
  - Non-optimistic mutations with inline dialog errors and `handlesOwnErrors`.
- **Shared `ConfirmDialog` a11y fix.** The owner scoped it into PAN-014 (aria-disabled while pending, pending label/status, error linked via aria-describedby), and PAN-014 is BLOCKED. Do not take it over here. Apply the same pattern locally in any new dialog this ticket writes, and leave the shared component to PAN-014 (R7).
- **Snapshot.** The full regeneration is deferred to PAN-016. Hand-patch only what this ticket needs, as in PAN-013.
