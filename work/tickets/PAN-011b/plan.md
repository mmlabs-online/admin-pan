Status: READY

# Plan — PAN-011b: Hide or disable navigation and actions using the caller's real admin permissions

## Spec summary
- `docs/spec-v1.md` §1 (line 14): "Staff sign in with their mmlabs Identity account; what they see and can do follows their `admin:*` permissions."
- `docs/spec-v1.md` §5.1 (line 33): "Shell with navigation filtered by permission, signed-in user, and a clear page for 403 …"
- CLAUDE.md R4: "Without it the UI hides or disables the control, but never relies on that: a `403` from the API is always handled and shown."
- ADR 0004 (Decision, "Tri-state seam"): "The state is advisory: it never decides whether data is fetched or shown, never replaces a confirmation (R9) or 403 handling, and never fails closed." ADR 0004 Consequences: "PAN-011b adds a real source built from `GET /api/v1/me/permissions` (cleared on auth change) without touching the call sites."
- org-admin-api contract (origin/main 8a4efb2): `GET /api/v1/me/permissions` (`app/modules/admin_auth/me_router.py:15-26`) is Bearer `aud=admin`, self-scoped, has no `require_permission`, and sends `Cache-Control: no-store`. The response is `MePermissions` (`app/modules/admin_auth/schemas.py:6-17`): `user_id: uuid`, `roles: list[str]`, `permissions: list[str]` ("`admin:*` unexpanded … Additive within v1: new fields may appear"). The server matcher is `app/modules/rbac/authz.py:12-23`.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `PermissionSource` reads the new endpoint through `src/api/`. Request and response types come from the regenerated OpenAPI snapshot. | `src/api/openapi.json` contains `/api/v1/me/permissions` and `components.schemas.MePermissions`, copied verbatim from org-admin-api 8a4efb2 (see Approach step 1); `schema.d.ts` is the output of `pnpm api:types` (CI diff stays clean). `me-permissions.ts` calls `api.GET('/api/v1/me/permissions', { signal })` and its type is `components['schemas']['MePermissions']` (no hand-written interface). Tests: `me-permissions.test.tsx › requests GET /api/v1/me/permissions with the bearer client and no query string`; `registry.test.ts` stays green, unchanged. |
| 2 | `permits()` mirrors the server exactly: an exact match, or `admin:*`. Unit tests cover the ADR-0003 edge cases. | `src/lib/permissions/permits.test.ts`: the table in "Tests to write" (six ADR-0003 rows plus `admin:*`, `admin:users:*`, `*`, `stoktok:*`, empty set, case sensitivity, malformed keys). Code review: the body is a line-for-line port of `authz.py:20-23`. |
| 3 | The permission query is cleared on every auth change and refetched after a 403 `permission_denied` or `admin_wildcard_required`. | `query-client.test.ts › clearOnAuthChange removes the me/permissions query`; `me-permissions.test.tsx › a mounted provider refetches after an auth change` and `› account switch A→B: B is requested and A's data is never used`; `permission-refresh.test.ts` (throttle, codes, exclusions); `query-client.test.ts › a burst of three 403 permission_denied query errors triggers exactly one permission refetch` and `› a 403 from a mutation with handlesOwnErrors triggers the refetch`. |
| 4 | If the source fails, the UI fails open to `unknown` (controls stay visible and the API still enforces). | `me-permissions.test.tsx › loading, 500, network, 403, 404 and malformed body all give unknown`; `› success then a failed refetch gives unknown, not stale denied`; `route-permission-guard.test.tsx › with the source erroring the page renders, not the panel`. |
| 5 | Self-actions are disabled using `user_id` from the endpoint. The UI never decodes the token. | `users-table.test.tsx › own row: Disable is a disabled item with a visible reason and the trigger names it as your account`; `› own row stays enabled while user_id is unknown`; `› other rows stay enabled`. Grep in the diff: no `atob`, `jwt`, `split('.')` on tokens, no `sub` read. |
| 6 | Tests cover allowed, denied and unknown, plus the source error case. | All tests listed below pass under `pnpm test`; plus `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` (R8). |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/api/openapi.json` | Add only the path `/api/v1/me/permissions` and the schema `MePermissions`, copied by script from the org-admin-api 8a4efb2 OpenAPI output | AC1; R2 (types from the generated schema). Partial copy keeps PAN-016 scope out (see Decisions D1) |
| `src/api/schema.d.ts` | Regenerate with `pnpm api:types` | Generated from the snapshot; never hand-edited |
| `src/lib/permissions/permits.ts` (new) | Pure `permits(granted: ReadonlySet<string>, required: string): boolean` | AC2 |
| `src/lib/permissions/permits.test.ts` (new) | Edge-case table | AC2 |
| `src/lib/permissions/me-permissions.ts` (new) | `mePermissionsKeys`, `parseMePermissions`, `mePermissionsQueryOptions(accountId, api)`, `permissionSourceFrom(set)` | AC1, AC4 |
| `src/lib/permissions/permission-refresh.ts` (new) | `createPermissionRefresher(getClient, { windowMs, now })` — throttled 403 → invalidate | AC3 |
| `src/lib/permissions/permission-refresh.test.ts` (new) | Unit tests of the refresher | AC3 |
| `src/lib/query-client.ts` | Wire the refresher into `QueryCache.onError` and `MutationCache.onError` (before the `handlesOwnErrors` return) | AC3 |
| `src/lib/query-client.test.ts` | Add the burst, exclusion, mutation-path and clear tests | AC3 |
| `src/context/permission-provider.tsx` | Context value becomes `{ source, selfUserId, refresh, refreshing }`; existing `PermissionProvider` keeps its `source` prop and gains optional `selfUserId`/`refresh`/`refreshing`; add `MePermissionProvider` (query-backed) and `AuthPermissionProvider` (reads `accountId` from `useAuth()`); add `useSelfUserId()` and `usePermissionRefresh()` | AC1, AC4, AC5; route retry (PAN-011 appsec N1) |
| `src/context/me-permissions.test.tsx` (new) | Provider/source tests on a fake API | AC1, AC3, AC4, AC6 |
| `src/routes/_authenticated/route.tsx` | `<PermissionProvider>` → `<AuthPermissionProvider>` | Plug the real source into production |
| `src/components/permissions/route-permission-guard.tsx` | Export `RouteForbiddenPanel` (ForbiddenPanel + "Try again" that calls `usePermissionRefresh()`, plus a status line); `RoutePermissionGuard` uses it | PAN-011 appsec N1 / security F2: a stale `denied` must be recoverable |
| `src/components/permissions/route-permission-guard.test.tsx` | Add retry and fail-open tests | AC4, AC6 |
| `src/features/users/components/data-table-row-actions.tsx` | Self-row: Disable/Enable item disabled with a visible reason; trigger name says "your account" | AC5 |
| `src/features/users/components/users-table.test.tsx` | `renderUsers` gains an optional `userId`; add self-row tests | AC5, AC6 |
| `src/test-utils/permissions.tsx` | `WithPermissions` gains optional `userId` (passed as `selfUserId`) | Test support for AC5 |
| `docs/adr/0004-permission-mirroring-and-403-handling.md` | Append "Amendment (PAN-011b)" section (content in Approach step 9) | The source rules (status-gated unknown, throttle, retry, stale-grant consequence) outlive this ticket; the current text says production uses `unknownPermissionSource` |

No other files. In particular `can.tsx`, `nav-filter.ts`, `command-menu.tsx`, `app-sidebar.tsx`, `forbidden-panel.tsx`, `registry.ts` and the five `<Can disable>` call sites are **not** changed (see Decisions D2, D4).

## Tests to write
All Vitest browser mode; the API is faked at the network layer with `fakeApi` / `fakeIdentityApi` (ADR 0005, R8).

| Test (file › name) | Covers |
|---|---|
| `permits.test.ts › ADR-0003 table` — `{adm:*}`+`admin:x:y`→false; `{admin:*}`+`adm:x:y`→false; `{a:*}`+`a:`→false; `{a:*}`+`:x:y`→false; `{A:*}`+`a:x:y`→false; `{a:x:read}`+`a:x:read`→true | AC2 |
| `permits.test.ts › admin:* grants every ADMIN_PERMISSIONS key` | AC2, PAN-015 identity note |
| `permits.test.ts › admin:users:*, bare *, stoktok:* and Admin:* grant no admin key` | AC2 (no prefix/global wildcard, case-sensitive) |
| `permits.test.ts › malformed required (admin, admin:, :x) is false even with admin:*` | AC2 |
| `permits.test.ts › empty set denies; unrelated extra keys do not change the answer` | AC2 |
| `permission-refresh.test.ts › 403 permission_denied and admin_wildcard_required invalidate ['me','permissions']` | AC3 |
| `permission-refresh.test.ts › self_status_change_forbidden, self_assignment_forbidden, kind auth not_member, 401, 404, 500 do nothing` | AC3, no loops |
| `permission-refresh.test.ts › an error from the me/permissions query itself does nothing` | AC3, no loops |
| `permission-refresh.test.ts › second matching error inside 5 s does nothing; after 5 s it invalidates again` (injected `now`) | AC3 throttle |
| `permission-refresh.test.ts › skips while the permission query is already fetching` | AC3 throttle |
| `query-client.test.ts › clearOnAuthChange removes the me/permissions query` | AC3 |
| `query-client.test.ts › a burst of three 403 permission_denied query errors triggers exactly one permission refetch` (real `createQueryClient`, mounted `MePermissionProvider`, count requests) | AC3 |
| `query-client.test.ts › a 403 from a mutation with handlesOwnErrors triggers the refetch; the failed call is not retried` | AC3 |
| `query-client.test.ts › existing toast test still passes with an undefined query` (unchanged test) | regression |
| `me-permissions.test.tsx › requests GET /api/v1/me/permissions with the bearer client and no query string` | AC1, R5 |
| `me-permissions.test.tsx › granted, denied and unknown: success with [admin:users:read] gives granted for it, denied for admin:users:write, unknown for a pending requirement` | AC6 |
| `me-permissions.test.tsx › admin:* response grants every action` | AC2, AC6 |
| `me-permissions.test.tsx › loading (never-resolving fetch) gives unknown` | AC4 |
| `me-permissions.test.tsx › 500, network error, 403, 404 and malformed body (permissions not an array of strings, user_id missing) all give unknown, never denied` | AC4, AC6 |
| `me-permissions.test.tsx › success then a failed refetch gives unknown, not stale denied` | AC4 (appsec F2) |
| `me-permissions.test.tsx › an extra unknown field in the response is accepted` | additive v1 |
| `me-permissions.test.tsx › useSelfUserId is undefined while loading/on error and equals user_id on success` | AC5 |
| `me-permissions.test.tsx › a mounted provider refetches after an auth change` (renderWithAuth harness + `AuthPermissionProvider`, fire `onChange`) | AC3 |
| `me-permissions.test.tsx › account switch A→B: B is requested and A's permissions and user_id are never used for B` | AC3 (appsec F1) |
| `me-permissions.test.tsx › nothing is persisted and nothing is logged`: after load `localStorage`/`sessionStorage` hold no value containing the `user_id` or `admin:`; a `console.*` spy never sees them | R3, R5 |
| `route-permission-guard.test.tsx › Try again on a denied route refetches and renders the page when now granted` | N1, AC6 |
| `route-permission-guard.test.tsx › Try again that is still denied keeps the panel and announces "Still no access"` | N1, R10 |
| `route-permission-guard.test.tsx › Try again whose refetch errors renders the page (fail-open)` | AC4 |
| `route-permission-guard.test.tsx › "Checking your permissions…" is in a role=status region while fetching; a second click does not start a second request` | R10, no duplicate fetch |
| `route-permission-guard.test.tsx › with the source erroring the page renders, not the panel` | AC4 |
| `users-table.test.tsx › own row: Disable is a disabled item with a visible reason and the trigger names it as your account` (`userId` = alice's id in mixed case) | AC5 |
| `users-table.test.tsx › own row stays enabled while user_id is unknown` (no `userId`) | AC5 fail-open |
| `users-table.test.tsx › other rows stay enabled; Disable still opens the confirm naming the target` | AC5, R9 |

Existing tests (`can.test.tsx`, `nav-filter.test.ts`, `registry.test.ts`, `forbidden-panel.test.tsx`, `users-table.test.tsx`) must pass unchanged except the `renderUsers` signature.

## Approach

### Decisions (asked by the orchestrator, decided here)
- **D1 Snapshot: partial copy, not full regeneration.** Copy only `paths['/api/v1/me/permissions']` and `components.schemas.MePermissions`, then `pnpm api:types`. Reasons: (a) a full regeneration pulls in `/audit-logs` and `admin:audit:read`, which is PAN-016's scope (ADR 0004 Consequences: "PAN-016 adds `admin:audit:read` to the registry"), and any other upstream drift since the PAN-013 snapshot, in a diff that is not this ticket's (R7); (b) PAN-013 set the precedent; (c) R2 is still met: the JSON is copied by script from the API's own generator output (not retyped) and `schema.d.ts` is generated. Appsec R11 (full regen) is rejected for (a); its fallback condition ("copy the exact JSON fragments … record the commit") is adopted. AC1 says "regenerated snapshot": the types *are* regenerated; impl-log records the partial copy. Follow-up: PAN-016 refreshes the snapshot in full.
- **D2 Navigation during load: fail-open, no skeleton.** While the query is pending every check is `unknown` and the full nav renders (current `nav-filter.ts` behaviour); denied items disappear when data arrives. Reasons: ADR 0004's single rule "unknown renders as allowed" stays the only rule; the request runs right after the token check (`ReadyGate`) so the window is one small request; a skeleton would add a third nav state to two consumers (sidebar and command menu) plus an a11y loading announcement, and the route gate would need the same for consistency, which is scope beyond the ACs. Frontend consult item 3 rejected; recorded as an optional follow-up for the owner (spec §5.1 note) if the flash is visible in practice.
- **D3 Throttle window: 5 s, leading edge, and skip while a permission fetch is in flight.** A burst (several queries on one screen, or one click) is sub-second, so 5 s coalesces it; the in-flight check stops concurrent duplicates; the endpoint is a cheap self-scoped read, so the worst case under repeated clicks is one request per 5 s. A 30 s window (identity consult) would ignore a second, real revocation for longer with no load benefit that matters. The `RECHECK_WINDOW_MS` pattern is about token rechecks and not reused.
- **D4 `<Can>` a11y: no change in this ticket.** 🟡2 (dangling `describedBy`) is unreachable: `Can` with `disable` takes a single action, and `evaluate()` (`source.ts:25-27`) returns `denied` only for `kind: 'permission'` (`none` → granted, `pending` → unknown), so `denied` at `can.tsx:36` implies the span at `:38` renders. A test cannot fail before a fix, so it is not a fix. 🟡1 (native `disabled` vs focusable `aria-disabled`) contradicts an accepted decision: ADR 0004 "Hide vs disable" chose native `disabled` plus visible text and lists "Focusable `aria-disabled` controls" under Alternatives rejected. Reversing it touches five feature files and is an ADR change the a11y auditor and owner should take on its own. Both go to follow-ups (R7).
- **D5 Self-action scope: users status only.** The only real-API self-action today is `PATCH /api/v1/users/{user_id}` from the users row menu (PAN-013 DONE). `roles.assign` lives in `role-assignments-sheet.tsx` on mock data (PAN-015c is BACKLOG); mock user ids can never equal a real `user_id`, so wiring it now would be dead and untested against reality. Follow-up for PAN-015c: disable self-assignment with `useSelfUserId()`.
- **D6 ADR 0004: amend in this ticket.** Its Decision text says production uses `unknownPermissionSource` until PAN-011b; after this ticket that is false, and the new rules outlive the ticket (planner rule 7).
- **D7 Invalidation after admin-app writes:** no call site exists on the real API yet (role and role-permission mutations are mock until PAN-015b/015c; a users status change cannot change the caller's own grants and a self change is refused). No helper is added now; `mePermissionsKeys.all` is exported for those tickets. Follow-up for PAN-015b/015c.

### Steps
1. **Snapshot (D1).**
   - Confirm `git -C /home/user/org-admin-api rev-parse --short HEAD` is `8a4efb2` (or a descendant on main where `me_router.py` and `MePermissions` are unchanged; record the commit).
   - Generate the API document into a scratch file outside both repos, as in PAN-013 step 1: from `/home/user/org-admin-api`, with `UV_PROJECT_ENVIRONMENT` set to a temp dir, `uv run --frozen python -m app.cli openapi --output <scratch>/openapi-full.json`.
   - With a small `node -e` script, copy `paths['/api/v1/me/permissions']` and `components.schemas.MePermissions` (and any schema it `$ref`s — none expected) from the scratch file into `src/api/openapi.json`. Change nothing else. Keep the file unformatted (it is in `.prettierignore`).
   - Fallback if `uv` cannot run: write the fragment by hand following the shape of existing Bearer paths in the snapshot (e.g. `GET /api/v1/users/{user_id}`: `operationId`, `responses` 200 with `$ref`, 401 "Missing or invalid Bearer token"; no `x-permission`, no 403) from `me_router.py:15-26` and `schemas.py:6-17`; `user_id` is `{"format": "uuid", "type": "string", "title": "User Id"}`. Record "hand-written fragment" in impl-log.
   - `pnpm api:types`. Record `git diff --stat src/api/` in impl-log. `registry.test.ts` must stay green without edits: the new operation has no `x-permission`, and the test only collects present values.
2. **`permits()`** (`src/lib/permissions/permits.ts`). Line-for-line port of `authz.py:20-23`:
   ```ts
   export function permits(granted: ReadonlySet<string>, required: string): boolean {
     const i = required.indexOf(':')
     if (i <= 0 || i === required.length - 1) return false
     return granted.has(required) || granted.has(`${required.slice(0, i)}:*`)
   }
   ```
   `ReadonlySet` (not `string | string[]`) makes the server's `str` TypeError case impossible at the type level. No expansion of `admin:*`, never derived from `roles`.
3. **Query + source** (`src/lib/permissions/me-permissions.ts`).
   - `export type MePermissions = components['schemas']['MePermissions']`.
   - `mePermissionsKeys = { all: ['me', 'permissions'] as const, account: (accountId: string) => [...mePermissionsKeys.all, accountId] as const }`.
   - `parseMePermissions(data: unknown): MePermissions` — accepts only an object whose `user_id` is a string and whose `permissions` is an array of strings (`roles` is not read); otherwise throws `new ApiError({ kind: 'invalid_response', status: 0, code: 'invalid_response', message: … })`. Extra fields are allowed.
   - `mePermissionsQueryOptions(accountId: string, api: ApiClient = getApi())` → `queryOptions({ queryKey: mePermissionsKeys.account(accountId), queryFn: async ({ signal }) => parseMePermissions(unwrap(await api.GET('/api/v1/me/permissions', { signal }))), staleTime: 60_000 })`. No `placeholderData`, `initialData`, `refetchInterval`, persister, or suspense; `retry` and `refetchOnWindowFocus` stay global (`shouldRetryQuery` does not retry 4xx). Same `eslint-disable … exhaustive-deps` comment as `features/users/api/queries.ts` for the injected client.
   - `permissionSourceFrom(granted: ReadonlySet<string>): PermissionSource` → `{ check: (p) => (permits(granted, p) ? 'granted' : 'denied') }`.
4. **Provider** (`src/context/permission-provider.tsx`).
   - Context value: `{ source: PermissionSource; selfUserId: string | undefined; refresh: (() => void) | undefined; refreshing: boolean }`, default `{ source: unknownPermissionSource, selfUserId: undefined, refresh: undefined, refreshing: false }`.
   - `PermissionProvider({ source = unknownPermissionSource, selfUserId, refresh, refreshing = false, children })` — memoise the value; existing callers and `WithPermissions` keep working.
   - `MePermissionProvider({ accountId, api, children })`: `const q = useQuery(mePermissionsQueryOptions(accountId, api))`. Derive strictly on `q.status === 'success'` (TanStack v5 keeps `data` with `status: 'error'` after a failed refetch — appsec F2): success → `source = permissionSourceFrom(new Set(q.data.permissions))`, `selfUserId = q.data.user_id`; anything else → `unknownPermissionSource`, `undefined`. `useMemo` on `[q.status, q.data]` so `useVisibleNavGroups` (memo on `source`) does not thrash. `refresh = () => void q.refetch({ cancelRefetch: false })` (does not restart an in-flight fetch); `refreshing = q.isFetching`.
   - `AuthPermissionProvider({ children, api? })`: `const { accountId } = useAuth()`; renders `MePermissionProvider` with it. It sits under `AuthGate`, which renders children only when `ReadyGate` is `ok`, so `accountId` is set; if it is ever null, render `PermissionProvider` with the unknown source (no request). Calling `useAuth()` here makes the provider re-render on every auth event, which re-subscribes the observer to a fresh query after `clearOnAuthChange` and triggers the refetch; the `me-permissions.test.tsx` auth-change test pins it. If that test shows no refetch, key `MePermissionProvider` on a counter bumped by the auth client's `onChange` and record it in impl-log.
   - `useSelfUserId()`, `usePermissionRefresh()` return the context fields. `usePermissionSource`/`usePermission`/`useActionPermission` read `ctx.source`.
   - `user_id` is used only for self-row disabling: never logged, toasted, put in URLs, titles or storage, never used to filter or scope data (identity R-f, appsec R10).
5. **403 → refetch** (`src/lib/permissions/permission-refresh.ts`, `src/lib/query-client.ts`).
   - `PERMISSION_REFRESH_CODES = new Set(['permission_denied', 'admin_wildcard_required'])`, `PERMISSION_REFRESH_WINDOW_MS = 5_000`.
   - `createPermissionRefresher(getClient: () => QueryClient | undefined, { windowMs = PERMISSION_REFRESH_WINDOW_MS, now = Date.now } = {})` returns `(error: unknown, queryKey?: QueryKey) => void`: return unless `isForbidden(error)` (`src/lib/forbidden.ts:16`, i.e. `kind: 'http'` 403) and `PERMISSION_REFRESH_CODES.has(error.code)`; return if `queryKey?.[0] === 'me' && queryKey[1] === 'permissions'`; return if `now() - last < windowMs`; return if `client.isFetching({ queryKey: mePermissionsKeys.all }) > 0`; else set `last = now()` and `void client.invalidateQueries({ queryKey: mePermissionsKeys.all, refetchType: 'active' })`.
   - In `createQueryClient`: build the refresher with `() => client` and assign `const client = new QueryClient(...)`; `QueryCache.onError: (error, query) => { refresh(error, query?.queryKey); if (isTransient(error)) toast… }` (`query` may be undefined in the existing test); `MutationCache.onError: (error, _v, _c, mutation) => { refresh(error); if (mutation.meta?.handlesOwnErrors) return; handleServerError(error) }`.
   - The refresh never changes 403 display, never retries the failed call, and never records the denial (no learned denials, owner PAN-011). Errors of the permission query itself get only the existing transient toast; no second toast.
   - Auth change: `clearOnAuthChange` already clears the whole cache (`query-client.ts:26-34`); no change there, only the test.
6. **Route panel retry** (`route-permission-guard.tsx`).
   - `RouteForbiddenPanel({ copy })`: reads `usePermissionRefresh()`; local `retried` state; renders `<ForbiddenPanel copy={copy} onBack={() => router.history.back()} onRetry={refresh && (() => { setRetried(true); refresh() })} />` followed by `<p role='status' className='text-center text-sm text-muted-foreground'>{refreshing ? 'Checking your permissions…' : retried ? 'Still no access after checking again.' : ''}</p>` (always mounted so it is announced). `onBack` needs the router: keep `onBack` in `RoutePermissionGuard` and pass it as a prop to `RouteForbiddenPanel` so the component is testable without a router.
   - The button stays enabled (a natively disabled focused button drops focus); duplicate clicks do not start a second request because `refetch({ cancelRefetch: false })` joins the in-flight one.
   - Granted after retry → `RoutePermissionGate` renders the outlet; refetch error → `unknown` → outlet (fail-open). The gate is the only place route-level state hides content; page data queries never read permission state for `enabled` (reviewer greps `enabled:` near `usePermission`/`useActionPermission`).
7. **Self row** (`data-table-row-actions.tsx`).
   - `const selfId = useSelfUserId(); const isSelf = selfId !== undefined && selfId.toLowerCase() === user.id.toLowerCase()`.
   - Inside the existing `<Can action='users.setStatus'>`: when `isSelf`, render the `DropdownMenuItem` with `disabled` and no `onClick`, its label followed by a visible second line `<span className='block text-xs text-muted-foreground'>You can't change your own status</span>`. Radix skips disabled items in arrow navigation, so the trigger's sr-only text becomes `Open actions for {user.email} (your account)` on the self row only; other rows keep `Open actions for {user.email}` (existing tests).
   - Not hidden: the item stays visible. Advisory only: the R9 confirm dialog, `meta.handlesOwnErrors` and the mapped `self_status_change_forbidden` copy (`forbidden.ts:53`) are unchanged. While `user_id` is unknown the item is enabled.
8. **Wire it** (`src/routes/_authenticated/route.tsx`): replace `<PermissionProvider>` with `<AuthPermissionProvider>`. `test-utils/permissions.tsx`: `WithPermissions({ granted, userId?, children })` passes `selfUserId={userId}`.
9. **ADR 0004 amendment** (append, do not rewrite the original): "Amendment (PAN-011b, 2026-11-17)":
   - Production source: `AuthPermissionProvider` → TanStack Query `['me','permissions', accountId]` on `GET /api/v1/me/permissions` (in-memory cache only; cleared by `clearOnAuthChange`; no persister, no token reading; `roles` ignored).
   - `permits()` is a port of org-admin-api `authz.py`: exact key or `admin:*`.
   - State is derived from `status === 'success'` only; loading, any error (including an error after an earlier success, 403/404 on the endpoint) and a malformed body give `unknown`. During load the nav is fail-open (no skeleton).
   - 403 `permission_denied` / `admin_wildcard_required` (not `self_*`, not gate codes, not the permission query itself) invalidates the query at most once per 5 s and not while it is fetching.
   - The route 403 panel offers "Try again" that refetches the permission query.
   - `user_id` is used only to disable self-actions.
   - Consequences: a revoked permission keeps controls visible for up to `staleTime` (60 s) or until the next focus or 403, and the API still refuses; an endpoint outage shows everything (fail-open, intended); if org-admin-api ever withdraws the ADR-0008 USR-11 amendment, the endpoint's 403/404 degrade to `unknown`.
   - Update the Status line note to mention the amendment; leave the rest as is.

### Rules
- R1: no client-side business rules beyond the documented matcher; `admin_wildcard_required` cases stay with the API's 403. R2: the call goes through the `src/api/` client, typed from the generated schema. R3: no token decoding, no persistence; state lives only in the in-memory QueryClient. R4: advisory only, 403 still handled everywhere. R5: nothing logged; no ids in URLs. R6: no new HTML sinks. R7: scope as listed; follow-ups below. R8: tests listed. R9: confirmations unchanged, never skipped because of `granted`. R10: status region for retry, visible reason and accessible name on the self row.

## Specialist input used
- identity-access-engineer: R-a `permits()` port and tests — adopted. R-b status-gated source and shape check — adopted. R-c key `['me','permissions', accountId]` — adopted. R-d 403 trigger with exclusions — adopted; 30 s window — rejected for 5 s (D3); call sites after admin-app writes — follow-up (D7); route retry — adopted. R-e `staleTime` 60 s, no polling/persister — adopted. R-f self row via `user_id`, only on success — adopted. Open questions answered by D3, D5, D6.
- frontend-developer: item 1 query/source shape — adopted, with the source in a separate `MePermissionProvider` so the `source` prop and fakes keep working. Item 2 `useSelfUserId` in the context — adopted. Item 3 nav skeleton — rejected (D2). Item 4 refresher before `handlesOwnErrors` — adopted. Item 5 retry with `role='status'` — adopted; focus kept by not disabling the button. Item 6 partial snapshot via scripted copy — adopted (D1). Item 7 `<Can>` a11y — deferred (D4). Item 8 self row with visible reason and trigger name — adopted.
- appsec-engineer: F1/R1 account-keyed query, `signal` passed — adopted (plus the remount via `ReadyGate` on account switch, `auth-gate.tsx:61-81`). F2/R2 status-gated unknown — adopted. R3 shape validation — adopted, but entries are not filtered by `ADMIN_PERMISSION_PATTERN`: `permits()` is only asked registry keys, so extra keys cannot change any answer (and the server already filters to `admin:`). R4 test table — adopted. R5 memoised source — adopted. R6 refresher (codes, exclusions, in-flight skip, `refetchType: 'active'`) — adopted. R7 — follow-up (D7). R8 retry; fail-open on refetch error — adopted; "disable while fetching" replaced by `cancelRefetch: false` to keep focus. R9 case-insensitive `isSelf` — adopted. R10 no leakage — adopted with tests. R11 full regeneration — rejected (D1); fallback conditions adopted. ADR amendment — adopted (D6).

## Assumptions
- `components['schemas']['UserRead']` has `id` (uuid string) equal to the `user_id` the endpoint returns for the same person (both are the org-admin-api user id).
- `useAuth()` from `@mmlabs/auth-client/react` re-renders consumers on every `client.onChange` event; the auth-change test confirms it (fallback in step 4).
- The ADR-0008 USR-11 amendment upstream is treated as in force (USR-11 DONE and merged). If it is withdrawn, the UI degrades to `unknown` (tested).
- Size: about 250 lines of product code plus about 450 lines of tests and the ADR. One feature, no new screen; kept as one slice.
- Follow-ups (not in this diff):
  1. PAN-016: refresh `openapi.json` in full and add `admin:audit:read` (D1).
  2. PAN-015b / PAN-015c: on success of role-assignment create/revoke and role-permission writes for app `admin`, `invalidateQueries({ queryKey: mePermissionsKeys.all })` (D7, PAN-015 identity note).
  3. PAN-015c: disable self-assignment in the role assignments sheet using `useSelfUserId()` (D5).
  4. a11y / owner: revisit ADR 0004 "native disabled" vs focusable `aria-disabled` for `<Can disable>` (PAN-011 a11y 🟡1) and harden `describedBy` (🟡2, currently unreachable) (D4).
  5. Owner (optional): nav skeleton during the first permission load if the brief flash is a problem (D2).

## Blocking questions
None.

## Split proposal
None.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| All `/_authenticated/*` (shell: sidebar, command menu) | per `ROUTE_PERMISSIONS` / nav item `permission` (unchanged) | Loading: full nav (unknown). Error: full nav (unknown). Happy: denied items hidden. | None | — |
| Any route with `kind: 'permission'` (users, organizations, apps, roles) | `admin:users:read`, `admin:organizations:read`, `admin:apps:read` (unchanged) | Loading/error: page renders (unknown). Denied: `ForbiddenPanel` + "Try again" + status line. Happy: page. | Try again → refetch `GET /api/v1/me/permissions` (no mutation) | — |
| `/users` row menu | `admin:users:write` (`users.setStatus`, unchanged) | Own row with known `user_id`: Disable/Enable item disabled with reason "You can't change your own status"; unknown `user_id`: enabled; other rows: unchanged | Other rows: Disable/Enable → existing confirm → `PATCH /api/v1/users/{user_id}` (unchanged) | `['users']` (unchanged) |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/me/permissions` | none (Bearer `aud=admin` via `getApi()`; `signal` for cancellation) | `components['schemas']['MePermissions']` (`user_id`, `roles`, `permissions`) | 401 → existing `notifyUnauthorized` path; every other error (403, 404, 5xx, network, timeout, `invalid_response`) → source `unknown`; 5xx/network keep the existing transient toast | USR-11 (DONE, origin/main 8a4efb2) |
