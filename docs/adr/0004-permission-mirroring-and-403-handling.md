# ADR 0004: permission mirroring and 403 handling

Status: Accepted pending owner merge (PAN-011). Builds on [ADR 0003](0003-auth-client-integration.md).

## Context
R4: each route and action declares the `admin:<resource>:<action>` permission its API endpoint declares; the UI hides or disables without it but never relies on that, and a 403 is always handled. The API owns authorization. Today the UI has no permission data: the `aud=admin` token carries role keys, not permissions, the UI never reads the token (R3, ADR 0003), and org-admin-api has no "my permissions" endpoint yet (requested in `work/tickets/PAN-011/org-admin-api-request.md`, PAN-011b).

## Decision
- **One typed registry** (`src/lib/permissions/registry.ts`): `ADMIN_PERMISSIONS`, `ROUTE_PERMISSIONS` (keyed by route id, completeness checked by `satisfies Record<AuthenticatedRouteId, Requirement>`) and `ACTIONS`. A requirement is `permission` (key plus the API operations it names, typed against `paths`), `pending` (no admin endpoint in the snapshot yet; names a PAN ticket) or `none` (never calls an admin endpoint). `registry.test.ts` checks every entry against the `x-permission` of `src/api/openapi.json`.
- **Tri-state seam.** `PermissionSource.check()` answers `granted | denied | unknown`. Production uses `unknownPermissionSource` until PAN-011b, so every control is visible and the API enforces. The state is advisory: it never decides whether data is fetched or shown, never replaces a confirmation (R9) or 403 handling, and never fails closed.
- **Hide vs disable.** Nav links and row or menu actions are hidden when denied. Page-level primary buttons and controls that also show data are disabled with a visible reason ("Requires admin:..."). Native `disabled` plus visible text, not a focusable `aria-disabled` (no click guard needed, reason stays perceivable, R10). A menu whose items are all denied hides its trigger.
- **403 pattern.** Only `kind: 'http'` 403s are permission 403s; gate 403s (`not_member`, `email_unverified`) stay with `AuthGate`. Copy is chosen by `code`; the server `message` is never shown; `required` is shown only if it matches the key pattern, as React text (R6). Queries render through `queryView` (error is checked before data) and `ForbiddenPanel`; mutations toast through `handleServerError`; dialogs that handle their own errors use `ForbiddenPanel variant='inline'`. A 403 never signs out and never retries. Routes render the panel in the layout; the URL is kept and there is no `/403` redirect.
- **No learned denials** (owner, 2026-11-16): a 403 is never remembered to pre-disable controls.
- **No token reading.** No decoding, no role-to-permission map in the UI (R1).

## Alternatives rejected
- Generated permission keys: eight keys and about 20 declarations; a second generated artifact adds no safety over the per-operation test.
- Decoding the token: forbidden (R3, ADR 0003).
- A role-to-permission map in the UI: duplicates API business rules (R1).
- Learned denials: rejected by the owner.
- Probing endpoints to discover permissions: side effects and load.
- Focusable `aria-disabled` controls: need click and keyboard guards.

## Consequences
- Until PAN-011b, controls and navigation are visible in production; the interim state is a spec §5.1 note for the owner.
- Each real-API ticket (PAN-013 to PAN-016) renders its queries through `queryView` + `ForbiddenPanel`, and PAN-016 adds `admin:audit:read` to the registry.
- PAN-011b adds a real source built from `GET /api/v1/me/permissions` (cleared on auth change) without touching the call sites.
