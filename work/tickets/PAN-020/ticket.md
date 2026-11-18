# PAN-020: Dashboard stats on the real API

| Field | Value |
|---|---|
| State | REVIEW |
| Priority | P3 |
| Areas | api, ui |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Replace dashboard mock stats with an org-admin-api stats endpoint.

## Spec reference
`docs/spec-v1.md` §5.7

## Depends on
PAN-002, PAN-011; org-admin-api ADM-015 (DONE, merged; `GET /api/v1/stats/dashboard`, `admin:stats:read`)

## Acceptance criteria
- [ ] KPIs, charts and attention counts come from the API
- [ ] States tested

## Notes / answers from owner
- (2026-11-11) org-admin-api had no stats endpoint; ADM-015 now provides `GET /api/v1/stats/dashboard`.

## Owner answers (2026-11-18)
- **Landing page without `admin:stats:read`:** `/` requires `admin:stats:read`; a user without it sees the 403 panel after sign-in (no redirect, no stripped-down welcome page).
- **Widgets the API cannot feed:** drop the "vs last month" trend percentages, the daily "Sign-ins this week" chart/tab and the "Recent admin activity" card; show factual sub-lines from the API instead (e.g. "N active · M disabled"). Record org-admin-api follow-ups (previous-period values, daily sign-in series) and update spec §5.7 to match.
