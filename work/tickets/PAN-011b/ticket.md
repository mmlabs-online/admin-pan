# PAN-011b: Hide or disable navigation and actions using the caller's real admin permissions

| Field | Value |
|---|---|
| State | DONE |
| Priority | P2 |
| Areas | auth, ui, security |
| Attempts | 0 |
| Created | 2026-11-16 |
| PR | https://github.com/mmlabs-online/admin-pan/pull/15 |

## Goal
Plug the real data source into the `PermissionSource` seam that PAN-011 built. The source is a TanStack Query on the new org-admin-api endpoint that returns the caller's effective admin permissions. With it, navigation, routes and actions hide or disable controls the staff member cannot use.

## Spec reference
`docs/spec-v1.md` §1 ("what they see and can do follows their `admin:*` permissions") and §5.1 ("navigation filtered by permission"). CLAUDE.md R4.

## Depends on
- PAN-011.
- org-admin-api USR-11 (`GET /api/v1/me/permissions`). DONE and merged as of 2026-11-16 (origin/main a417ddb).

## Acceptance criteria
- [ ] `PermissionSource` reads the new endpoint through `src/api/`. Request and response types come from the regenerated OpenAPI snapshot.
- [ ] `permits()` mirrors the server exactly: an exact match, or `admin:*`. It has unit tests covering the ADR-0003 edge cases.
- [ ] The permission query is cleared on every auth change and refetched after a 403 `permission_denied` or `admin_wildcard_required`.
- [ ] If the source fails, the UI fails open to `unknown` (controls stay visible and the API still enforces).
- [ ] Self-actions are disabled using `user_id` from the endpoint. The UI never decodes the token.
- [ ] Tests cover allowed, denied and unknown, plus the source error case.

## Notes / answers from owner
- 2026-11-16 (owner): split from PAN-011. PAN-011 ships the declarations, the seam and the 403 handling. This ticket ships the real pre-hiding once the API endpoint exists.

## Orchestrator notes (2026-11-17)
- **Dependencies.** PAN-011 is DONE. org-admin-api USR-11 is DONE and merged (origin/main 8a4efb2).
- **Endpoint.** `GET /api/v1/me/permissions` (`app/modules/admin_auth/me_router.py`) is Bearer `aud=admin`, self-scoped, with no `require_permission`, and sends `Cache-Control: no-store`. The response is `MePermissions {user_id, roles: [...], permissions: [...]}` (`app/modules/admin_auth/schemas.py`).
- **Snapshot.** `src/api/openapi.json` does not yet contain `/api/v1/me/permissions`. A full regeneration also brings in `/audit-logs` (`admin:audit:read`), which breaks `registry.test.ts` until PAN-016. Hand-patch just this path and schema (PAN-013 precedent), or regenerate and add `admin:audit:read` to the registry without wiring the screen. The planner decides.
- **Earlier reviews.**
  - PAN-011 appsec N1: the route-level `denied` hides the page, so the route panel needs a retry that refetches permissions.
  - PAN-011 security F2: the real source lives in TanStack Query, is cleared on auth change, is never persisted, refetches at most once per burst of `permission_denied`, and stays `unknown` while loading or on error.
  - PAN-015 identity: `permits()` must treat `admin:*` as granting every admin permission. Invalidate `['me','permissions']` after writes to the admin app.
- **No learned denials, and never read the token** (owner, PAN-011).
