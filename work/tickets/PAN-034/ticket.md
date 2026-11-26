# PAN-034: Filter users by app / role

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P3 |
| Areas | api, ui, a11y |
| Attempts | 0 |
| Created | 2026-11-25 |
| PR | — |

## Goal
Add "has a role in app X" and "has role R" filters to the `/users` list, sent as API query params, so staff can find everyone with a given access.

## Spec reference
`docs/spec-v1.md` §5.2.1 (Filter); §8 Q11.

## Depends on
- PAN-013 (DONE); PAN-032 recommended first.
- **org-admin-api: not planned yet.** Needs `GET /api/v1/users?app=<key>&role_id=<uuid>` (active assignments, combinable with `email`, `status` and pagination). The owner must add this ticket in org-admin-api first; record its ID here.

## Acceptance criteria
- [ ] An app filter and, once an app is chosen, a role filter (options from `GET /apps/{key}/role-definitions`) send `app` / `role_id` to `GET /users`; the table shows only what the API returns (no client-side filtering of a page).
- [ ] Filters combine with the existing email search and status filter; state lives in the route's URL search params (zod-validated, unknown values fall back to defaults); changing a filter resets to the first page.
- [ ] Clearing the app filter also clears the role filter.
- [ ] A 422 for a bad param and a 403 are shown, not swallowed.
- [ ] Filter controls are labelled and keyboard reachable; the result count is announced (R10).
- [ ] Tests (API mocked at the network layer): request params per control, URL round-trip, page reset, empty result, error, 403; the e2e fake API accepts the new params.

## Notes / answers from owner
- 2026-11-25: Q11 = yes.
