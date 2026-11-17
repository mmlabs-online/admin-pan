## PAN-011b consult: identity-access-engineer

### Findings
1. **Server matcher.** `org-admin-api/app/modules/rbac/authz.py:12-23` and ADR-0003 §3 split `required` at the first `:` into `app` and `rest`. It returns false if either part is empty. Otherwise it returns `required ∈ granted || "<app>:*" ∈ granted`. There is no global `*`, no `<app>:<resource>:*` and no prefix or substring matching, and keys are case-sensitive. ADR-0003 pins these cases:
   - `{adm:*}` with `admin:x:y` → false
   - `{admin:*}` with `adm:x:y` → false
   - `{a:*}` with `a:` → false
   - `{a:*}` with `:x:y` → false
   - `{A:*}` with `a:x:y` → false
   - `[a:x:read]` with `a:x:read` → true

   A bare string as `granted` raises an error on the server.
2. **Endpoint.** `GET /api/v1/me/permissions` (`me_router.py`) goes through `current_admin`, which reloads the user and permissions from the DB on every request (`service.py:34-40`). Each response is therefore fresh when served.
   - The response is `{user_id: uuid, roles: [...], permissions: [...]}` (`schemas.py`). `admin:*` is returned unexpanded, and new fields may be added within v1.
   - It sends `Cache-Control: no-store`. A disabled or unverified user gets 401, which the client already routes through `notifyUnauthorized`.
   - `consumers.md:75-83` says to treat it as a UI hint only, not to decode the token for `sub`, and that the token's `roles` claim may lag by up to the token TTL (900 s) while this endpoint does not.
3. **Mount point.** `PermissionProvider` already sits inside `<AuthGate>` (`src/routes/_authenticated/route.tsx:9-15`). `ReadyGate` renders children only when `useAccessCheck` is `ok`, which means `getToken` succeeded. A query inside the provider therefore only runs after the token check passes. No gate change is needed.
4. **Auth-change clearing.** `clearOnAuthChange` (`src/lib/query-client.ts:26-34`, wired in `main.tsx:57`) cancels and clears the whole cache on every `client.onChange`. The permission query is covered once it lives in the same `QueryClient`.
5. **403 errors.** The client throws `ApiError` with `kind: 'http'`, `status` and `code` (`src/api/client.ts:91-94`). Nothing handles 403 globally today: the `QueryCache.onError` comment leaves it to callers, and the `MutationCache` sends it to `handleServerError`. The API also has subclasses of `PermissionDeniedError` that do not mean "your permissions changed": `self_status_change_forbidden` and `self_assignment_forbidden` (`app/core/errors.py:72-77`).
6. **Route panel retry is missing.** `route-permission-guard.tsx:27-28` renders `ForbiddenPanel` on `denied` with only `onBack`. This is PAN-011 appsec N1 and F2: there is no retry yet.

### Recommendations
- **R-a: `permits()` (AC2).** Put a pure `permits(granted: ReadonlySet<string>, required: string): boolean` in `src/lib/permissions/` that ports the Python logic exactly:
  - `i = required.indexOf(':')`; return false if `i <= 0 || i === required.length - 1`
  - return `granted.has(required) || granted.has(required.slice(0, i) + ':*')`
  - Build the `Set` once per response so a string can never reach the matcher (this replaces the TypeError guard).
  - Unit tests: the six ADR-0003 rows; `admin:*` grants every `ADMIN_PERMISSIONS` key; `admin:users:*` and bare `*` grant nothing; `stoktok:*` does not grant `admin:` keys; an empty set → false; unknown extra keys in the response are ignored, not rejected.
  - Do not expand `admin:*` client-side, and never derive permissions from `roles`. `roles` is display-only (R1, ADR 0004).
- **R-b: Source (AC1, AC4, AC5).** Add a `useMyPermissionsQuery()` in a feature or api-hooks module, built on `getApi()` and the generated `MePermissions` type. Have `PermissionProvider` derive the `PermissionSource` from it:
  - When `query.status === 'success'`: `check(p)` returns `permits(set, p) ? 'granted' : 'denied'`.
  - Anything else (`pending`, or `error` even if stale `data` remains after a failed refetch) returns `unknown`. TanStack v5 keeps old `data` on a refetch error. Gate on `status` rather than `data` so "source fails → unknown" holds literally (AC4).
  - Background refetches that are still `success` keep the last data.
  - No suspense and no spinner: render must never wait on this query.
  - Add a minimal runtime shape check: `permissions` is an array of strings and `user_id` is a string. If it fails, throw `invalid_response` so the source becomes `unknown`.
- **R-c: Cache key (AC3).** Use `['me', 'permissions', accountId]`, with `accountId` from `useAuth()`. It is already the library's persisted non-secret `mm_account_id`. `clear()` remains the primary protection, and the account segment is defence in depth against a response from account A arriving after a switch to B. Invalidate by the prefix `['me','permissions']`. Do not use `retry` beyond the existing `shouldRetryQuery`.
- **R-d: Invalidation triggers (AC3).**
  1. **Auth change:** already covered by `clearOnAuthChange`. Add a test that the query is gone and refetched after `onChange`.
  2. **403 burst:**
     - In the `QueryCache` and `MutationCache` `onError` (or one helper both call), match `isApiError(e) && e.kind === 'http' && e.status === 403 && (e.code === 'permission_denied' || e.code === 'admin_wildcard_required')`.
     - Exclude the permissions query itself, to prevent a refetch loop.
     - Exclude `self_*_forbidden` codes, because they do not signal changed grants.
     - On a match, call `invalidateQueries({ queryKey: ['me','permissions'] })`, throttled to at most once per window (about 30 s, leading edge).
     - Test it: N concurrent 403s → one refetch.
  3. **After admin-app writes:** expose `invalidateMyPermissions(qc)` and call it in `onSuccess` of role-assignment create/revoke, role permission PUT/PATCH/DELETE on app `admin`, and user status changes. Where those screens are still on mock data, record the call sites as follow-ups for PAN-013/015 (R7) rather than wiring mocks.
  4. **Route panel retry (N1):** pass `onRetry` to `ForbiddenPanel` from `RoutePermissionGuard`, calling `refetch()`/invalidate on the permission query.
- **R-e: Staleness bounds.**
  - Set a per-query `staleTime` of about 60 s (the global default of 10 s is also acceptable) and keep `refetchOnWindowFocus` as in production.
  - Use no `refetchInterval`, no persister and no `initialData`.
  - Combined with the 403 trigger and the panel retry, a stale `granted` costs one handled 403, and a stale `denied` lasts at most one focus or retry.
- **R-f: Self-actions (AC5).** For `users.setStatus` on the caller's own row, disable the control when `me.user_id === row.id`, with a visible reason, as ADR 0004 says for disabled controls.
  - Only when the query is `success`. Otherwise leave the control enabled; the API returns 403 `self_status_change_forbidden`, which `forbidden.ts:53` already handles.
  - `user_id` is used only for this UI disabling. Never use it to filter or scope data, put it in URLs or logs, or send it as an "acting as" parameter.
- **R-g: Tests (AC6).** Cover:
  - granted, denied and unknown, including `admin:*` granting everything
  - loading → unknown and error → unknown, including an error after an earlier success
  - malformed body → unknown
  - auth-change clear; the 403 burst throttle; the route panel retry flipping `denied` → `granted`
  - self-row disabled, and enabled while unknown
  - mock the API at the network layer (R8)

### What must never happen (enforce in review)
- Decoding the token or reading `sub` or `roles` from it (R3, ADR 0003).
- Persisting the response anywhere outside the in-memory Query cache: no zustand, no localStorage/sessionStorage/IndexedDB, no query persister (R3).
- Treating the source as authority:
  - gating whether data is fetched or shown on it
  - skipping 403 handling or R9 confirmations because a check says `granted`
  - failing closed on `unknown`
- Learned denials: a 403 only triggers a refetch; it is never written into the source (owner, PAN-011).
- Encoding server-only rules client-side, such as "privileged target needs `admin:*`". Those stay 403 `admin_wildcard_required` from the API (R1).

### Risks
- **Refetch loop:** if the 403 trigger is not throttled, or does not exclude the permission query and the `self_*` codes, it can loop.
- **Stale `denied` hiding a route:** mitigated by the retry and focus refetch. Without the N1 retry the user is stuck until reload.
- **Wildcard semantics:** `admin:*` is returned unexpanded. Any implementation that compares only against registry keys hides everything from super-admins. This is the PAN-015 identity finding.
- **`onChange` scope:** if `client.onChange` also fires on silent token refresh (about every 15 min), the whole cache, including permissions, is cleared and refetched. That is harmless for correctness but adds load; I did not verify which events fire it.
- **Snapshot choice:** a full OpenAPI regeneration pulls in `admin:audit:read` and `/audit-logs`, which reaches into PAN-016. Hand-patching only `/api/v1/me/permissions` and `MePermissions` (the PAN-013 precedent) stays inside R7. Either way, the `user_id` type must stay `string` (uuid) from the generated schema.

### Open questions
1. Self-actions scope: only the user status toggle on the own row, or also `roles.assign` on the own row (`self_assignment_forbidden`)? The ticket text says "self-actions" in the plural.
2. Throttle window for the 403 refetch: is 30 s acceptable, or should it reuse the 60 s `RECHECK_WINDOW_MS` pattern from `use-access-check.ts`?
3. ADR 0004's "Consequences" section should be amended to describe the real source, the `status`-gated unknown and the retry. Is that in this ticket, or a follow-up?

Files: /home/user/admin-pan/src/lib/permissions/source.ts, /home/user/admin-pan/src/context/permission-provider.tsx, /home/user/admin-pan/src/components/permissions/route-permission-guard.tsx, /home/user/admin-pan/src/lib/query-client.ts, /home/user/admin-pan/src/routes/_authenticated/route.tsx, /home/user/admin-pan/src/api/client.ts, /home/user/org-admin-api/app/modules/rbac/authz.py, /home/user/org-admin-api/app/modules/admin_auth/{me_router,schemas,service,deps}.py, /home/user/org-admin-api/docs/adr/0003-rbac-keys-and-matching.md, /home/user/org-admin-api/docs/consumers.md
