## Consult: identity-access-engineer, PAN-011 (permission-aware UI and 403 handling)

### Findings
1. **The API never exposes permissions to the client.**
   - Each admin request reloads the caller and resolves `effective_permissions(user, "admin")` from the database (`/home/user/org-admin-api/app/modules/admin_auth/service.py:27-33`; ADR-0008 §3 says "no permissions claim").
   - The token's `roles` claim holds role keys only (`/home/user/org-admin-api/app/modules/tokens/service.py:73,92`).
   - Every admin route is `current_admin` plus exactly one `require_permission`. ADR-0008 §6 test `test_route_auth_classes.py` fails on any other route unless it is on an explicit allow-list.
   - No `/me`-style endpoint exists or is planned in docs or work.
2. **None of the existing endpoints can stand in for one.**
   - `GET /users/{id}/role-assignments` needs `admin:users:read`, which not every staff member holds.
   - It also needs the caller's user id, which only the token `sub` holds.
   - It returns roles, not permissions.
   - No admin route lists the `admin` app's roles with their permissions, and the public catalog refuses `admin` (D17).
3. **The client cannot read the token.**
   - `@mmlabs/auth-client` gives `getToken()` / `fetchWithToken()` and no claims (README §7).
   - ADR 0003 and the PAN-010 security reviews forbid decoding the JWT.
   - The library has no `permits()` copy (grep in `/home/user/mmlabs-auth/ts/src` finds nothing).
4. **What admin-pan already has today:**
   - 24 `x-permission` annotations in `/home/user/admin-pan/src/api/openapi.json`, the full declaration source.
   - `errors.ts` keeps `details.required` on 403 `permission_denied` (`/home/user/admin-pan/src/api/errors.test.ts:41`).
   - 403 is not retried and not toasted (`src/lib/query-client.test.ts`).
   - A `ForbiddenError` page and `/403` route from the template.
   - `clearOnAuthChange` empties the query cache on every auth event (ADR 0003).
5. **Some 403s have nothing to do with the route permission.** The ADM-002b guards return 403 for reasons the declared key cannot predict:
   - `admin_wildcard_required`, with `details.required = "admin:*"`.
   - `self_assignment_forbidden` and `self_status_change_forbidden`.

   So even with a perfect permission source, R4's "a 403 from the API is always handled" carries real weight.
6. **Scope conflict.** The spec says "Shell with navigation filtered by permission" (§5.1) and "what they see and can do follows their `admin:*` permissions" (§1). AC2 says "Hidden/disabled controls without permission". Neither can be met for real without a data source. The goal line "`usePermission()` from the token's roles" cannot be built as written.

### The three options

**(a) New org-admin-api endpoint returning the caller's effective admin permissions. Recommended. Needs an org-admin-api ticket (`USR-XX`, authorization area).**
- **Path:** `GET /api/v1/me/permissions`, or `GET /api/v1/admin/me`. Not under `/api/v1/auth/*`, which is the cookie class.
- **Shape:** `{"user_id": uuid, "roles": ["admin:…"], "permissions": ["admin:users:read", …]}`.
  - Permissions are sorted and come straight from `effective_permissions`, with `admin:*` returned unexpanded.
  - Include `user_id` so the UI can disable self-actions (G "self_*" refusals) without decoding the token.
  - No email (R5/R11).
- **Auth class:** Bearer, `aud=admin`, `current_admin` only, with no `require_permission`. Any token holder is entitled to know their own permissions, and token issue already requires at least one admin role.
  - This is a new sub-case ("authenticated, self-scoped, no permission") in ADR-0008 §6.
  - It needs an ADR-0008 amendment and an explicit allow-list entry in `test_route_auth_classes.py`.
  - Do not invent a dummy permission for it.
- **Freshness:** use the same per-request reload as enforcement, so the answer is exactly as fresh as the next check.
  - Send `Cache-Control: no-store`.
  - The usual R6 401 envelope applies. No 403 case is needed.
- **Admin-pan caching and invalidation:**
  - One TanStack Query `['me', 'permissions', accountId]` in `src/api/`. Types come from the regenerated OpenAPI (R2).
  - `staleTime` around 60 s, with `refetchOnWindowFocus`.
  - Already cleared on any auth change (`clearOnAuthChange`) and on account switch.
  - Invalidate on any 403 `permission_denied` or `admin_wildcard_required` (the view is stale), and after role-assignment or user-status mutations.
  - The caller cannot change their own admin roles (`self_assignment_forbidden`). Changes come from other staff, so staleTime plus refetch-on-403 bounds the drift. This matches the accepted 15-minute token window in ADR 0003.
- **Matcher:** a local `permits(granted, required)` that mirrors ADR-0003 exactly: exact match or `admin:*`, no global `*`, no `<app>:<resource>:*`, reject a string `granted`. Unit-test it against the ADR-0003 edge-case table. Better still, ask mmlabs-auth to export the matcher later as a follow-up, so the semantics cannot drift.

**(b) Map role keys from the token to permissions. Reject.**
- It needs the token claims, which means decoding (forbidden).
- It needs a role-to-permission catalog for `admin`, which is refused (D17).
- The fallback, a hard-coded role-to-permission map in the UI, is a business rule faked in the UI (R1/R4). It silently drifts whenever a super-admin edits admin roles.
- Probing endpoints to discover permissions is also rejected: noisy `admin_permission_denied` logs, and still a guess.

**(c) 403-driven UI with per-route and per-action declarations but no pre-hiding. Deliverable now, inside PAN-011.**
- **Declarations:** each route and action declares its `admin:<resource>:<action>` as typed constants. Add a test that checks each declared key against the `x-permission` of the operation it calls in `openapi.json`. This meets AC1 now and catches drift on every OpenAPI regeneration.
- **Seam:** build the hook as `usePermission(key): 'granted' | 'denied' | 'unknown'`, fed by a `PermissionSource` interface.
  - Today's source always returns `'unknown'`.
  - Components treat `'unknown'` as "show/enable, rely on the API".
  - When (a) lands, swap the source and nothing else changes.
- **403 handling:**
  - Route-level query 403: render the in-place Forbidden panel inside the layout. Name the missing permission from `details.required` (a key, not PII) and keep the URL.
  - Mutation 403: inline or toast error naming the action, never optimistic (R9).
  - Map `admin_wildcard_required`, `self_assignment_forbidden` and `self_status_change_forbidden` to specific messages.
  - Do not hand any 403 to the 401 or session-recheck path (already true in `client.ts`).
- **Tests:** denied cases come from MSW 403 envelopes. Allowed cases come from a test-only `PermissionSource` that returns `'granted'` or `'denied'`, so the hide/disable code is built and tested now even though production has no real source.
- **Not recommended:** an in-memory "learned denials" cache from 403s used to pre-hide. It is extra state, goes stale on grants, and gives little benefit.

### Recommendations
1. **R4 / AC1:** deliver option (c) in PAN-011 now: declarations, the OpenAPI consistency test, the `usePermission` + `PermissionSource` seam and 403 handling.
2. **AC2:** split it.
   - PAN-011 delivers "API 403 still handled" in full.
   - PAN-011 also delivers the hide/disable logic tested against a fake source.
   - Real pre-hiding of navigation and actions moves to a new **PAN-011b**, `Depends on: org-admin-api USR-XX (caller's effective permissions)`.
   - Reword the ticket goal to drop "from the token's roles".
3. **AC3:** allowed and denied tests per route and action through the fake source, 403 tests at the network layer (MSW), and `permits()` unit tests once (a) lands.
4. **R1/R4:** propose an org-admin-api ticket for option (a) with the shape, auth class and ADR-0008 amendment above. Never fake the data in the UI.
5. **R3:** with option (a), still never read the token in React. The permission set lives only in the query cache. It is not a secret, but it is cleared on every auth event.
6. **When the source errors:** fail open to `'unknown'` (show controls, rely on 403) plus a quiet banner. Do not fail closed, because a transient error would hide the whole UI for legitimate staff. Enforcement stays on the server either way.

### Risks
- **Until PAN-011b, the UI shows controls that a staff member cannot use.** UX cost only, not a security risk, since the API enforces every call. The owner should accept it explicitly.
- **The client `permits()` copy can drift from the server's.** Pin it with the ADR-0003 edge-case table, and longer term import it from mmlabs-auth.
- **The permission view can be stale for up to the staleTime after a revoke.** It is bounded by refetch-on-403 and does not matter for security.
- **Option (a) creates a new auth-class sub-case.** If it is added without the ADR amendment and the allow-list entry, the deny-by-default test fails, or someone adds a fake permission to get it through.
- **Declared keys can drift as the API evolves** (e.g. `admin:roles:assign` vs `admin:roles:manage`). The OpenAPI consistency test is the guard.

### Open questions (for the owner)
1. Accept splitting AC2? PAN-011 = declarations + 403 handling + tested seam; PAN-011b = real pre-hiding after the new org-admin-api endpoint. Or should PAN-011 be `BLOCKED` until that endpoint exists? Recommendation: split.
2. Approve proposing org-admin-api `USR-XX`: `GET /api/v1/me/permissions` (Bearer `aud=admin`, self-scoped, no `require_permission`, ADR-0008 amendment), returning `user_id`, `roles` and `permissions`?
3. Spec §5.1 says "navigation filtered by permission". Is "visible but answers 403" acceptable in the meantime, or should the spec note the interim state?

### Files referenced
- `/home/user/admin-pan/work/tickets/PAN-011/ticket.md`
- `/home/user/admin-pan/docs/adr/0003-auth-client-integration.md`
- `/home/user/admin-pan/src/features/auth/gate/use-access-check.ts`
- `/home/user/admin-pan/src/api/auth-hooks.ts`
- `/home/user/admin-pan/src/api/openapi.json`
- `/home/user/admin-pan/docs/spec-v1.md` (§1 line 14, §5.1 line 33)
- `/home/user/org-admin-api/app/modules/admin_auth/deps.py`
- `/home/user/org-admin-api/app/modules/admin_auth/service.py`
- `/home/user/org-admin-api/app/modules/rbac/authz.py`
- `/home/user/org-admin-api/app/modules/rbac/router.py`
- `/home/user/org-admin-api/app/modules/rbac/assignments_router.py`
- `/home/user/org-admin-api/app/modules/tokens/service.py`
- `/home/user/org-admin-api/docs/adr/0008-admin-api-authentication.md`
- `/home/user/mmlabs-auth/ts/README.md` (§3, §7, §8)
