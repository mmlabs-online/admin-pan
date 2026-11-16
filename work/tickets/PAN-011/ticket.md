# PAN-011: Permission-aware UI and 403 handling

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P1 |
| Areas | auth, ui, security |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Navigation, routes and actions declare their `admin:*` permission in one typed registry, generated from or checked against the OpenAPI `x-permission`. A tri-state `usePermission()` (`granted | denied | unknown`) sits behind a `PermissionSource` seam, which returns `unknown` in production until PAN-011b. Every API 403 shows a clear, code-specific message in place. Amended by the owner on 2026-11-16: the earlier wording "from the token's roles" is dropped, because the UI never reads the token.

## Spec reference
`docs/spec-v1.md` §5.1; CLAUDE.md R4

## Depends on
PAN-010; org-admin-api ADM-002, USR-02

## Acceptance criteria
- [ ] Each route and action declares its permission (same as the API endpoint)
- [ ] Hide and disable logic (`<Can>`, nav filter, route guard) exists and is tested against a fake `PermissionSource`. In production the source returns `unknown`, so controls are visible and the API enforces; real pre-hiding comes in PAN-011b. Every API 403 is handled: it shows an in-place forbidden state, with copy chosen by `code`; it never signs the user out or retries; and a query error is checked before its data.
- [ ] Tests for allowed / denied cases

## Notes / answers from owner
- 2026-11-16 (owner) answers to the consult questions:
  - **Split.** PAN-011 ships the declarations, the tri-state seam and the 403 handling. PAN-011b ships the real pre-hiding once org-admin-api has a "my permissions" endpoint.
  - **API request.** Write a prompt proposing `GET /api/v1/me/permissions` to org-admin-api. It is saved as `org-admin-api-request.md` in this folder and also covers resend for `admin` (PAN-010b).
  - **No learned denials.** Do not remember 403s to pre-disable controls. Only show the 403 clearly.

## Orchestrator notes (2026-11-16)
These facts were checked against org-admin-api `origin/main` 35c8825.
- The `aud=admin` access token carries `roles` as a list of role **keys**, not permissions (`app/modules/tokens/service.py:92`). Permissions are resolved on the server for each request (`require_permission`, `app/modules/admin_auth/deps.py:100`).
- The role catalog for app `admin` is refused (D17, ADR-0008). There is no endpoint that returns the caller's effective admin permissions.
- `@mmlabs/auth-client` does not expose the token value or its claims (PAN-010, ADR 0003). The UI must never decode the JWT (security reviews of PAN-010).
- So the goal's phrase "`usePermission()` from the token's roles" has no data source today. The consults and the planner must decide how PAN-011 can mirror permissions (R4), or whether it needs an org-admin-api endpoint first.
