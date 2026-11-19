# PAN-018: Organization members and invitations

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P3 |
| Areas | api, ui |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
In organization detail, show members (with roles) and pending invitations.

## Spec reference
`docs/spec-v1.md` §5.3

## Depends on
PAN-014 (DONE); org-admin-api USR-06 (DONE). **Unmet:** staff endpoints for an organization's members and invitations do not exist yet; requested 2026-11-19 (`work/org-admin-api-requests-2026-11-19.md` §1, sent by the owner). Update with the org-admin-api ticket ID once created.

## Acceptance criteria
- [ ] Members list with role and joined date
- [ ] Invitations list with status
- [ ] States tested

## Notes / answers from owner
- 2026-11-19: API request sent to org-admin-api by the owner. Open point for the owner there: invitations store only an email HMAC, so the list cannot show the invitee email unless a masked hint is stored.
