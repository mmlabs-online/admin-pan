# PAN-011b: Hide or disable navigation and actions using the caller's real admin permissions

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Areas | auth, ui, security |
| Attempts | 0 |
| Created | 2026-11-16 |
| PR | — |

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
