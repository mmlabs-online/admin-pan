# PAN-011b: appsec consult (PLAN stage)

I read the ticket, `src/lib/permissions/source.ts`, `src/context/permission-provider.tsx`, `src/components/permissions/route-permission-guard.tsx`, `src/lib/forbidden.ts`, `src/lib/query-client.ts`, `src/api/client.ts`, `src/main.tsx` and ADR 0004. On org-admin-api origin/main 8a4efb2 I read `me_router.py`, `MePermissions`, `rbac/authz.py permits()` and the ADR-0008 USR-11 amendment.

## Findings

1. **The cross-account cache leak through a mounted observer is the main risk.**
   - `clearOnAuthChange` (`src/lib/query-client.ts:27-35`) runs `cancelQueries()` then `clear()`.
   - In TanStack v5, `clear()` removes queries from the cache. A `useQuery` observer that is still mounted can keep returning its last result until it re-subscribes.
   - `PermissionProvider` sits under `AuthGate` in `src/routes/_authenticated/route.tsx`. If the gate does not remount on an `account-changed` event, account B can briefly (or longer) be evaluated against account A's `permissions` and `user_id`.
   - The visible effect is mild: controls are wrongly shown or hidden, and the API still enforces. But it breaks the "one account never sees another's" invariant, and the self-action check would compare against A's `user_id`.

2. **A refetch that fails keeps the old data.** After a background refetch error, TanStack keeps `data` and also sets `error`. If the source reads `data` whenever it exists, a stale denial survives a failed refetch. That fails closed, which contradicts ADR 0004 and the ticket's "unknown on error".

3. **The 403 → refetch path has no throttle yet.** `QueryCache.onError` in `src/lib/query-client.ts:45-49` and `MutationCache.onError` are the natural hook points. A screen with several queries that each return 403, or a user clicking a denied action repeatedly, would trigger N invalidations.
   - TanStack only dedupes fetches that are in flight. Back-to-back bursts each cause a new request.
   - It cannot loop by itself: 403s are not retried (`shouldRetryQuery`), and the permission endpoint has no `require_permission`, so it should not return 403. Still, the hook must exclude the permission query's own errors.

4. **The server matching rule is narrower than "prefix".** `permits()` in `app/modules/rbac/authz.py:12-23`:
   - matches exactly, or `<app>:*` for the same app;
   - has no global `*` and no `admin:users:*`;
   - returns false for a malformed key (no `:` or an empty part);
   - raises if `granted` is a single string.

   The UI copy must match this exactly. Any extra wildcard logic in the UI would show controls as granted that the API refuses (harmless), or the reverse (bad).

5. **The route panel has no way out of a stale denial.** `RoutePermissionGuard` only offers `onBack`. Once the source can return `denied`, a stale denial hides the whole page with no recovery path. This repeats PAN-011 appsec N1.

6. **The endpoint itself is sound.**
   - The token does not need decoding. The API client already forces `credentials:'omit'`, `cache:'no-store'`, `referrerPolicy:'no-referrer'` and an origin check (`src/api/client.ts:33-60`).
   - The server sends `Cache-Control: no-store`.
   - `MePermissions` is `extra="forbid"` on the server but described as "additive within v1", so the UI must tolerate extra fields.
   - The response contains no PII; `user_id` is an identifier.

## Recommendations

Each item should be pinned by a test (see the list under Risks).

**Source design (`src/lib/permissions/`, plus a hook in `src/api/` or `src/features/auth/`)**
- R1. Query key `['me','permissions', accountId]`. `accountId` is the library's selected account id, never anything taken from the token. Pass `signal` to `api.GET('/api/v1/me/permissions', { signal })` so `cancelQueries()` aborts in-flight requests.
- Do not use `placeholderData`/`keepPreviousData`. Do not use `initialData`. Do not attach a persister.
- `gcTime` may stay at the default. `staleTime` around 60 s. `refetchOnWindowFocus` stays as the global default. No polling.
- R2. Derive state strictly:
  - `status !== 'success'`, or `error != null`, or `isPending` → every check returns `unknown`. This includes the "data plus error" case after a failed refetch.
  - Only a successful, validated response can return `denied`.
- R3. Validate the response before use. Accept it only if `permissions` is an array of strings. Build a `Set` from entries that match `ADMIN_PERMISSION_PATTERN` or equal `admin:*`, and drop anything else. If the shape is invalid, the source returns `unknown`, not `denied`. Never use `in` on a string (the server raises a `TypeError` for exactly this).
- R4. Use a pure `permits(granted: ReadonlySet<string>, required: AdminPermission): boolean`, copied line for line from `authz.py`: exact match or `${app}:*`. Unit-test the ADR-0003 edge cases:
  - `admin:*` grants every admin key;
  - `admin:users:*` does not grant `admin:users:read`;
  - `*` grants nothing;
  - a `stoktok:*`-style other-app wildcard does not grant `admin:*` keys;
  - malformed keys (`admin`, `admin:`, `:x`) are false;
  - case-sensitive (`Admin:users:read` ≠ `admin:users:read`);
  - an empty list means denied.
- Keep `pending` requirements returning `unknown`. Keep `evaluateAll` unchanged.
- R5. Memoize the source object (`useMemo` on `data` and the error state) so it does not rebuild every render. This is not a security issue, but it avoids nav thrash.

**Refetch after a 403**
- R6. One helper, `requestPermissionRefresh(queryClient)`:
  - Called from `QueryCache.onError` and `MutationCache.onError` (before the `handlesOwnErrors` early return, so dialogs are covered too).
  - Only when `isForbidden(e)` and `e.code ∈ {permission_denied, admin_wildcard_required}`. Not for `self_*_forbidden` or gate codes.
  - Skip when the failing query's key starts with `['me','permissions']`.
  - Throttle: skip if a fetch is in flight, or if `dataUpdatedAt` or the last forced refresh is under about 5 s ago. Then `invalidateQueries({ queryKey: ['me','permissions'], refetchType: 'active' })`.
  - The 403 itself is still shown by `ForbiddenPanel` or a toast. The refresh never changes 403 handling, never retries the failed call, and never records the denial. That would be a learned denial, which the owner has forbidden.
- R7. After successful writes to admin-app roles, assignments or role permissions (PAN-015 area), invalidate `['me','permissions']`, as the PAN-015 identity notes say.

**Recovery from a stale denial**
- R8. When the route guard shows `denied`, `ForbiddenPanel` gets a "Try again" button that calls `refetch()` on the permission query only. Disable it while `isFetching`.
  - If the result is granted, or the refetch errors (which makes the state `unknown`, fail-open), the outlet renders.
  - This is the only extra gating the route level does. Data queries inside pages must never read the permission state to set `enabled`.
  - Add a grep-style test or lint note: no `enabled:` that depends on `usePermission` or `useActionPermission`.

**Self-actions and `user_id`**
- R9. `isSelf(targetId) = data?.user_id != null && data.user_id.toLowerCase() === targetId.toLowerCase()`.
  - If `user_id` is unknown, self-actions stay enabled (fail-open). The API's `self_assignment_forbidden` and `self_status_change_forbidden` 403s are already mapped in `src/lib/forbidden.ts`.
  - Disabling is advisory only. The R9 confirmation dialogs stay exactly as they are and are never skipped because something is "granted".
- R10. Never put `user_id` or the permission list in `console.*`, toasts, error reports, URLs, query strings, `document.title` or analytics. No `localStorage`, `sessionStorage` or zustand persist. The data lives only in the in-memory QueryClient. There is also no reason to show `user_id` in the UI.

**Snapshot**
- R11. Prefer a full regeneration of `src/api/openapi.json` and `schema.d.ts` from org-admin-api 8a4efb2, and add `admin:audit:read` to `ADMIN_PERMISSIONS` with no route or screen wiring.
  - R2 says types come from the generated schema, never hand-written copies. A hand-patched path is a hand-written copy that can drift from `extra="forbid"` and additive-field semantics.
  - If the planner still chooses to hand-patch, copy the exact JSON fragments from the API's `/openapi.json` at 8a4efb2 and record the commit in the plan and impl-log.
  - Either way, `registry.test.ts` must accept an operation with no `x-permission` (the self-scoped route) without treating it as missing.

## Risks

**Risks to accept or watch**
- **Stale grants.** If a staff member's role is revoked, controls stay visible for up to `staleTime`, or until the next 403 triggers a refresh. This is acceptable: the API enforces on every request (ADR-0008 per-request reload). Document it in ADR 0004 as a consequence.
- **Fail-open means an outage shows everything.** That is the intended trade-off (ADR 0004). A permission-endpoint failure must not toast loudly or block the app. The global `isTransient` toast fires for 5xx/network errors; that is fine, but do not add a second toast.
- **ADR-0008 USR-11 amendment is "pending owner confirmation".** If the owner rejects it, the endpoint could start requiring a permission or disappear. The UI must then degrade to `unknown`: 403 or 404 on this query becomes `unknown`, not `denied`. Add that to the tests.
- **StrictMode double mount and cross-tab events.** The auth-client `onChange` broadcast can fire `account-changed` in other tabs. The key-by-account approach (R1) covers this. Include the account id only as a cache key, never in any log.

**Tests that pin the invariants (Vitest browser mode, API mocked at the network layer)**
1. `permits()` table with the edge cases from R4.
2. Source state:
   - loading → `unknown`;
   - success → `granted`/`denied`;
   - 500, network, timeout, invalid shape, 403 and 404 → `unknown`;
   - success, then a failed refetch → `unknown` (not stale `denied`);
   - `pending` requirement → `unknown`.
3. Fail-open UI: with the source erroring, nav links, row actions and primary buttons are all visible and enabled. The route renders its page, not the panel.
4. Cross-account: render as account A (denied `admin:users:read`), fire `account-changed` to B (granted), and assert a fresh request is made and the A result is never used for B. Also assert `isSelf` uses B's `user_id`.
5. Sign-out clears the query; nothing about permissions is in `localStorage`/`sessionStorage` after load and after sign-out. Snapshot `Object.keys(localStorage)` = only `mm_account_id`.
6. 403 refresh:
   - 3 queries returning 403 `permission_denied` in one render lead to exactly 1 extra permission request;
   - a 403 `self_assignment_forbidden` leads to 0;
   - a gate 403 (`not_member`) leads to 0;
   - a 403 from a mutation with `handlesOwnErrors` leads to 1;
   - the failed data query is not retried.
7. Stale-denied recovery: route denied, then "Try again" → the permission request returns granted → page renders. A second variant where the refetch errors → page renders (fail-open). The button is disabled while fetching.
8. Advisory only:
   - a denied action is hidden or disabled, but a data query on the page still runs (its request is made) when the requirement is `denied` at action level;
   - a granted destructive action still opens the confirmation naming the target, and cancel makes no request.
9. Self-action: a row with `id === user_id` (mixed case) is disabled with a visible reason. With `user_id` unknown it stays enabled, and an API 403 `self_status_change_forbidden` shows the mapped copy.
10. No leakage: spy on `console.*` during the suite and assert the `user_id` value and the permission keys never appear. No request URL contains `user_id`.

## Open questions

1. Snapshot: full regeneration plus `admin:audit:read` in the registry (my recommendation), or hand-patch? The planner decides; the reasoning is in R11.
2. Throttle window for the 403 refresh: I suggest 5 s. Is there an owner preference?
3. Has the ADR-0008 USR-11 amendment been confirmed by the owner? If not, ADR 0004 should note the dependency and the 403/404 → `unknown` degradation.
4. Does `AuthGate` remount its children on `account-changed`? If it does, Finding 1 is partly mitigated. Keying by account id (R1) is still required as defence in depth.
5. Should ADR 0004 be amended in this ticket? It says `unknownPermissionSource` is used in production until PAN-011b. I recommend yes: record the source, the throttle, the fail-open-on-refetch-error rule and the stale-grant consequence.
