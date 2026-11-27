# PAN-034b: Apps — set an app's default, org-owner and super-admin roles

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Areas | ui, api, auth, security |
| Attempts | 0 |
| Created | 2026-11-27 |
| PR | — |

## Goal
Slice 2 of PAN-034 (split by the planner, 2026-11-27, for PR size): let staff set an app's Default role, Org owner role and Super-admin role from admin-pan, and show those roles by key in the app detail sheet. Unblocks simap's `org_owner_role_id = simap:admin` (org-admin-api `docs/consumers.md` "Org apps without self-service org creation (simap)", step 4).

## Spec reference
`docs/spec-v1.md` §5.4. Owner's original ticket text: `work/tickets/PAN-034/ticket.md` (scope items 3 and 4).

## Depends on
PAN-034 (slice 1: the `super` permission-requirement kind, ADR 0004 amendment). org-admin-api USR-06c, USR-38 (MERGED on `main` a77e819).

## Scope
3. **Edit app**: let staff set Default role, Org owner role and Super-admin role. Selects list the app's roles by key and name, with a "None" option where clearing is allowed. Disable the Super-admin field without `admin:*` and say why. Send only the fields that changed.
4. **App detail sheet** (`app-detail-sheet.tsx`): show those three roles by key (e.g. `simap:admin`), not by raw id.

Design decisions already made by the PAN-034 planner (S0–S5): see the "Split proposal" section of `work/tickets/PAN-034/plan.md`. Refusal codes by (field, reason): `work/tickets/PAN-034/consult-api-platform-engineer.md` §B.

## Out of scope
- No org-admin-api change; no new endpoints.

## Acceptance criteria
- [ ] A staff user can set simap's Org owner role to `simap:admin` from the UI; the detail sheet then shows "simap:admin".
- [ ] Every API refusal for `PATCH /api/v1/apps/{key}` role changes shows a specific message, chosen by (field, reason); nothing fails silently.
- [ ] Tests cover the role-field PATCH diff (only changed fields; untouched roles never sent as `null`) and the refusal-message mapping, including the reasons shared by several fields.

## Notes / answers from owner
- 2026-11-27: split from PAN-034 by the planner; the orchestrator accepted the split (the owner can revert it by merging the two).
- Known API-side risk (identity consult F6 in PAN-034): org-admin-api refuses an org owner role that holds an `is_admin` permission (422 `org_owner_role_id`/`role_has_admin_permissions`), while its simap recipe gives `simap:admin` "one admin-only key". If simap's real role holds one, the PATCH will be refused; the fix belongs in org-admin-api (doc or rule), not in the UI.
