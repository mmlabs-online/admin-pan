# PAN-011: appsec consult (PLAN stage)

Read-only. I checked admin-pan (working tree) and org-admin-api at `origin/main` 35c8825.

## Findings

1. **The goal as written can't be built, and shouldn't be.** "`usePermission()` from the token's roles" would need the UI to read JWT claims. That breaks ADR 0003 and the PAN-010 security reviews. It also wouldn't work: the token carries role keys, not permissions. The role-to-permission mapping for app `admin` isn't exposed anywhere:
   - `GET /api/v1/apps/admin/roles` returns 404 (D17).
   - `GET /apps/{key}/permissions` lists the permissions that exist, not who holds them.
   - `GET /users/{id}/role-assignments` needs `admin:users:read`, which makes it circular.
   - The UI doesn't know its own `sub` without decoding the token.

   This is a ticket-vs-architecture conflict for the planner/owner to settle. Right now nothing in the API can tell the UI what the caller is allowed to do.

2. **The required permission keys are already machine-readable.** Each guarded operation in `src/api/openapi.json` has `x-permission` (set by `require_permission`, `org-admin-api app/modules/admin_auth/deps.py:28,106`). Current keys:
   - `admin:apps:read|write`
   - `admin:organizations:read|write`
   - `admin:users:read|write`
   - `admin:roles:manage|assign`

   No audit-log endpoint exists yet, so there's no key for it. Each route and action can declare its key and have a test prove it matches the endpoint's `x-permission`, so nobody hand-copies keys.

3. **The API's 403s don't leak anything, and the current client handles them mostly safely.**
   - 403 is checked before 404/422 (ADR-0008), so a 403 doesn't reveal whether the resource exists.
   - `details.required` is a permission key that's already public in the OpenAPI.
   - The codes are `permission_denied`, its subclass `admin_wildcard_required` (`details.required = "admin:*"`), `self_assignment_forbidden` and `self_status_change_forbidden` (`app/core/errors.py:58-78`). There's also `origin_not_allowed` on the `/auth/*` cookie class.

   Current admin-pan behaviour:
   - `src/api/client.ts:92` calls `notifyUnauthorized` only on a 401, so a 403 never signs the user out or re-checks the session. Correct.
   - `shouldRetryQuery` (`src/lib/query-client.ts:16`) doesn't retry non-transient errors, and mutations use `retry: false`. Correct.
   - `handleServerError` (`src/lib/handle-server-error.ts:15`) toasts the server's `message` (`"Missing permission"`, `"Requires admin:*"`). Safe, but it's generic, and nothing yet shows a 403 screen state.

4. **🟡 Stale data after access is revoked.** When a refetch fails, TanStack Query keeps the last successful `data` next to `error`. A screen that renders `data` before it checks `error` keeps showing records the API now refuses (the main risk is `refetchOnWindowFocus` in prod). For a 403, the screen must show the forbidden state *instead of* the data, not as a toast on top of it.

5. **Account switch is already covered for query data.** `clearOnAuthChange` clears the whole query cache on every auth event. Any permission state PAN-011 adds has to live inside that cache, or be keyed by `accountId` and cleared by the same subscription. Otherwise account A's permissions can apply to account B.

## Recommendations (what PAN-011 can safely ship now)

1. **Declare permissions in one module** (e.g. `src/lib/permissions.ts`): a typed `AdminPermission` union and a map of route/action to key. Add a unit test that checks each key against the `x-permission` of the operation the feature calls in `openapi.json`. Validate keys with the API's regex `^admin:([a-z][a-z0-9-]{0,47}:[a-z][a-z0-9-]{0,47}|\*)$`.

2. **Make `permits()` match the server exactly** (ADR-0003): an exact match, or `admin:*` grants everything. No prefix or glob matching, and no other app's wildcard. Unit-test both the allowed and denied cases.

3. **Make `usePermission(key)` return three states: `'granted' | 'denied' | 'unknown'`.** Until a data source exists it returns `'unknown'`, and `'unknown'` means show the control enabled, because the API is the gate. Never fall back to "deny all" (it locks everyone out) or to "allow and skip handling" (it hides real 403s). Add a code comment and a test stating that the hook is advisory only: it must never decide whether data is fetched or shown, and never replace a confirmation (R9).

4. **Add one shared 403 handler** (an `isForbidden(error)` helper plus a `<Forbidden>` state component) and use it on every screen with an API query:
   - Pick the copy by `code`, not by echoing server text:
     - `permission_denied`: "You don't have permission for this (requires `<required>`)". Show `required` only if it matches the regex above; React text only, never HTML (R6).
     - `admin_wildcard_required`: "Only super-admins can do this".
     - `self_*`: "You can't change your own access".
     - Any other or unknown 403 code: a generic message.
   - Never sign out, never call `notifyUnauthorized`, never re-check the session, never retry automatically. Add a test for each of these.
   - Render the forbidden state in place on the current URL. Don't navigate to `/403` with a `redirect` param, which avoids building redirect URLs from data.
   - For queries, check `error` before `data` (Finding 4).
   - For mutations, keep the dialog open with the error shown and don't invalidate as if it succeeded. That fits R9 and `meta.handlesOwnErrors` dialogs.

5. **Optionally, learn from 403s**, but only from `permission_denied` with a valid `details.required`. Store it as a "known denied" entry inside the query cache, keyed by `accountId`, so `clearOnAuthChange` wipes it on account switch. Memory only.
   - Never learn from `admin_wildcard_required` or `self_*`: those depend on the target, not the route.
   - This is UX only. A stale "denied" hides a control the user now holds, so give the forbidden state a "Try again" button that clears the entry.

6. **Logging:** don't send `details`, account id or email to the console, analytics or error reports (R5).

7. **Testing:** mock 403 at the network layer for each screen that's on the real API (R8). Cover each code, data shown then revoked, and account switch clearing any learned or loaded permission state.

## Risks

- **Treating the mirror as a control.** Anyone reading `usePermission` as "the check" may gate data display or skip handling a 403 on it. The tri-state hook and the "error before data" rule are there to stop that.
- **Drift.** Hand-copied keys go stale when the API renames them. The OpenAPI `x-permission` test prevents this.
- **A future "my permissions" endpoint** (proposed below for org-admin-api) must be designed so that:
  - it uses the Bearer `aud=admin` class and returns only the caller's own effective admin permissions, read per request like `require_permission`;
  - it returns no role internals and nothing about other users;
  - it sends `Cache-Control: no-store`;
  - it's exempted from the route-guard test explicitly (ADR-0008 fails any route without `require_permission`), not by weakening the test;
  - adding it doesn't add a permissions claim to the token, which ADR-0008 rejects.

  On the client, it must live in a TanStack Query entry (so it's cleared on auth change), never be persisted, and be refetched after any `permission_denied`, at most once per denial burst to avoid loops. The results are still advisory, and every 403 is still handled.
- **Unknown state:** if PAN-011 ships with `'unknown'`, every control shows. That's safe because the API enforces, but the "hidden/disabled" acceptance criterion isn't met until the endpoint exists.

## Open questions (planner/owner)

1. Should PAN-011 be split?
   - **PAN-011a (ship now):** permission declarations, `permits()`, the tri-state hook, shared 403 handling and tests.
   - **PAN-011b:** hiding and disabling controls, blocked on a new org-admin-api ticket for an endpoint like `GET /api/v1/auth/me/permissions` or `GET /api/v1/me/permissions` (Bearer `aud=admin`, own permissions only).

   Or accept learning from 403s (Recommendation 5) as the interim way to hide controls?
2. The ticket goal needs rewording to drop "from the token's roles", which conflicts with ADR 0003 and the PAN-010 reviews. Owner sign-off?
3. Should a forbidden page name the missing key (`details.required`) to staff? It's safe from a security standpoint. Copy and language: spec §8 Q3.

## Follow-ups (out of scope)

- org-admin-api: an endpoint returning the caller's effective admin permissions (constraints above).
- org-admin-api: no audit-log endpoint or `x-permission` yet. The `audit-log` screen can't declare a key until it exists.

Files: `/home/user/admin-pan/work/tickets/PAN-011/ticket.md`, `/home/user/admin-pan/src/api/client.ts`, `/home/user/admin-pan/src/lib/query-client.ts`, `/home/user/admin-pan/src/lib/handle-server-error.ts`, `/home/user/admin-pan/src/api/openapi.json`, `/home/user/org-admin-api/app/core/errors.py` (origin/main), `/home/user/org-admin-api/app/modules/admin_auth/deps.py` (origin/main), `/home/user/org-admin-api/docs/adr/0008-admin-api-authentication.md`.
