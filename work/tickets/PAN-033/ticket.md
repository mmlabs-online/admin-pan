# PAN-033: Bulk assign a role to selected users

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Areas | api, ui, ux, auth, security, a11y |
| Attempts | 0 |
| Created | 2026-11-25 |
| PR | — |

## Goal
Let staff select users on the current `/users` page and assign one role (app, role, scope, expiry) to all of them in one bulk API call, after a confirmation naming every target, and show the result per account.

## Spec reference
`docs/spec-v1.md` §5.2.2 (Bulk role assignment from the list); §8 Q9, Q10, Q12.

## Depends on
- PAN-013, PAN-015c (DONE); PAN-032 recommended first (staff verify results in the Access column).
- **org-admin-api: not planned yet.** Needs a bulk endpoint (e.g. `POST /api/v1/apps/{key}/role-definitions/{role_id}/assignments:bulk` `{org_id?, expires_at?, user_ids[1..100]}` → per-user `{status: created|unchanged|failed, assignment_id?, error?}`, `admin:roles:assign`, refuses `admin`-app roles). The owner must add this ticket in org-admin-api first; record its ID here. No client-side per-user loop (Q9 = A).

## Acceptance criteria
- [ ] Row checkboxes (labelled with the user's email) and a "select all on this page" checkbox; selection is limited to the current page and clears on page, filter or search change. A bulk action bar ("N selected · Assign role…") appears only with `admin:roles:assign`.
- [ ] The dialog reuses the PAN-015c role picker (app → role → scope by org mode → optional expiry); `admin` app roles are not offered (Q10), and the API's refusal is still handled.
- [ ] Confirmation (R9) names role key, app, scope, expiry, the account count and every target email (scrollable); disabled users are flagged with a warning; nothing is applied before confirm and nothing is optimistic.
- [ ] Exactly one bulk request per run (≤100 users); while it runs the dialog shows a status and cannot be submitted twice.
- [ ] Result view lists each account as assigned / unchanged (already had it) / failed with the API's reason; it is announced and keeps focus; failed accounts stay selected. Request-level errors (4xx/5xx, 403) are shown in the error envelope's message.
- [ ] On success the users list, affected users' role assignments, role holders and (for any change to the caller) `/me/permissions` queries are invalidated.
- [ ] Tests (API mocked at the network layer): selection and clearing, permission-hidden bar, confirm/cancel, single request payload, mixed per-user results, request-level error, 403; keyboard flow and announcements.

## Notes / answers from owner
- 2026-11-25: Q9 = A (bulk endpoint, per-user results, already-assigned = unchanged). Q10: disabled users allowed with a warning; no `admin` app roles in bulk; max 100 per run. Q12: bulk revoke later, separate ticket (out of scope here).
