# PAN-016: Audit log on the real API

| Field | Value |
|---|---|
| State | DONE |
| Priority | P2 |
| Areas | api, ui |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Replace audit mock data with `GET /api/v1/audit-logs` and its filters; links from users/orgs to their history.

## Spec reference
`docs/spec-v1.md` §5.5

## Depends on
PAN-008, PAN-011; org-admin-api ADM-004

## Acceptance criteria
- [ ] Filters map to API query params; server-side pagination
- [ ] Before/after rendered as text only (R6)
- [ ] Links from user and org detail to their filtered audit log
- [ ] Loading, empty, error and 403 states are tested with the API mocked at the network layer, using a fake `fetch` injected into `createApiClient` (owner, 2026-11-16 in PAN-013: no MSW; ADR 0005)

## Notes / answers from owner
- Follow-up from PAN-008: decide whether the API or the UI masks emails of unknown accounts; add target-id filter for links from users/orgs.

## Owner answers (2026-11-17)
- **CSV export:** remove it, and record a follow-up asking org-admin-api for a server-side export endpoint. Do not fake it with a current-page export (R1).
- **Date filter:** use the browser's local time zone, and show the zone under the pickers. `from` is the start of the picked local day (inclusive). `to` is the start of the next local day after the picked day, so the whole picked day is included (the API's `to` is exclusive).

## Orchestrator notes (2026-11-17)
- **Dependencies.** PAN-008 and PAN-011 (and PAN-011b) are DONE here. org-admin-api ADM-004 is DONE; its main is at 8a4efb2.
- **API.** `GET /api/v1/audit-logs` is gated by `admin:audit:read` (`app/modules/audit/router.py`). Filters:
  - `actor_user_id` and `target_id` (both uuid);
  - `actor_kind`, `action`, `target_type` and `outcome` (enums);
  - `app_key`;
  - `from` / `to` (aware datetimes).

  There is no free-text filter, so no email goes into the URL (R5, ADR 0005).
- **Snapshot.** This ticket owns the full snapshot regeneration that was deferred from PAN-013 and PAN-011b. Regenerate `src/api/openapi.json` from 8a4efb2, run `pnpm api:types`, and add `admin:audit:read` to the permission registry. The `/audit-log` route then moves from `pending` to the real key. Earlier hand-patches (PAN-013's 409s, PAN-011b's `/me/permissions`) must survive or be superseded by the generated output, so diff carefully.
- **Organizations.** The Organizations screen is still on mock data (PAN-014 BLOCKED). An "org → audit history" link would pair mock org ids with real audit data. The planner decides: link only from Users (real ids) now, and add the org link as a PAN-014 follow-up.
- **Patterns to follow:** the PAN-013 patterns (server-side table, `queryView`, `<Can>`, the fake-fetch tests, debounced filters only for non-PII). Do not change the shared ConfirmDialog; that belongs to PAN-014.
