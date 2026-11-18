# PAN-015b: Roles and role permissions on the real API

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Areas | api, ui, auth |
| Attempts | 0 |
| Created | 2026-11-17 |
| PR | https://github.com/mmlabs-online/admin-pan/pull/27 |

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
- org-admin-api USR-16 (DONE, merged): `GET /api/v1/apps/{key}/role-definitions` and `GET …/role-definitions/{role_id}` (`admin:apps:read`), covering the `admin` app and disabled apps.

## Acceptance criteria
- [ ] Every role action maps to an endpoint, and role ids come only from the API.
- [ ] Two-step create handles a failure after the role is created: the role exists, the user is told, and no POST is retried.
- [ ] Deleting a role asks for confirmation that names the role. 409 `conflict` (system role, default role, has assignments) is shown inline.
- [ ] Errors are mapped by code: 403 `admin_wildcard_required`, 409 `role_has_assignments`, 422 reasons.
- [ ] Loading, empty, error and 403 states are tested with the injected-fetch API mock.

## Notes / answers from owner
- 2026-11-17 (owner): split PAN-015 into three tickets. The `admin` app may be edited in the UI and the API decides: show a note that `admin:*` is needed and show the API's 403/409 inline.
