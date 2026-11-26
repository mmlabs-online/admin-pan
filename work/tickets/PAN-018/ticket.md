# PAN-018: Organization members and invitations

| Field | Value |
|---|---|
| State | DONE |
| Priority | P3 |
| Areas | api, ui |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | https://github.com/mmlabs-online/admin-pan/pull/35 |

## Goal
In organization detail, show members (with roles) and pending invitations.

## Spec reference
`docs/spec-v1.md` §5.3

## Depends on
PAN-014; org-admin-api USR-06

## Acceptance criteria
- [ ] Members list with role and joined date
- [ ] Invitations list with status
- [ ] States tested

## Notes / answers from owner
- 2026-11-26 (owner): accepted plan assumptions A1–A7 as-is (joined date = role grant date; flat rows per assignment; inviter/acceptor/granter ids hidden; page size 20; invitations default to Pending; 404 in a tab shows a message only; revoke/invite/remove are follow-up tickets).
