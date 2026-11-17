# PAN-015b: Roles and role permissions on the real API

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Areas | api, ui, auth |
| Attempts | 0 |
| Created | 2026-11-17 |
| PR | — |

## Goal
Replace the mock Roles screen with the real API, per app:
- list roles, including the `admin` app and disabled apps;
- create a role (POST, then PUT permissions);
- rename a role;
- replace a role's permissions;
- delete a role;
- set the app's default role.

Split from PAN-015 (owner, 2026-11-17).

## Spec reference
`docs/spec-v1.md` §5.4

## Depends on
- PAN-015 (apps and permissions).
- **A new org-admin-api ticket for a staff (Bearer) role listing with ids.** It must cover the `admin` app and disabled apps, and must not be the public catalog. The request is in `work/tickets/PAN-015/org-admin-api-request.md`.

## Acceptance criteria
- [ ] Every role action maps to an endpoint, and role ids come only from the API.
- [ ] Two-step create handles a failure after the role is created: the role exists, the user is told, and no POST is retried.
- [ ] Deleting a role asks for confirmation that names the role. 409 `conflict` (system role, default role, has assignments) is shown inline.
- [ ] Errors are mapped by code: 403 `admin_wildcard_required`, 409 `role_has_assignments`, 422 reasons.
- [ ] Loading, empty, error and 403 states are tested with the injected-fetch API mock.

## Notes / answers from owner
- 2026-11-17 (owner): split PAN-015 into three tickets. The `admin` app may be edited in the UI and the API decides: show a note that `admin:*` is needed and show the API's 403/409 inline.
