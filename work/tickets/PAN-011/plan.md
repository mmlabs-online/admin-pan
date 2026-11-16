Status: READY

# Plan: PAN-011, permission-aware UI and 403 handling

## Spec summary
- `docs/spec-v1.md` §2: "Staff sign in with their mmlabs Identity account; what they see and can do follows their `admin:*` permissions."
- `docs/spec-v1.md` §5.1: "Shell with navigation filtered by permission, signed-in user, and a clear page for 403 and for "email not verified" / "not a member"."
- CLAUDE.md R4: "Each route and action declares the `admin:<resource>:<action>` permission the API endpoint declares. Without it the UI hides or disables the control, but never relies on that: a `403` from the API is always handled and shown."
- Ticket goal (owner amendment, 2026-11-16): "Navigation, routes and actions declare their `admin:*` permission in one typed registry, generated from or checked against the OpenAPI `x-permission`. A tri-state `usePermission()` (`granted | denied | unknown`) sits behind a `PermissionSource` seam, which returns `unknown` in production until PAN-011b. Every API 403 shows a clear, code-specific message in place."
- Owner notes (2026-11-16): split, so real pre-hiding moves to PAN-011b. **No learned denials**: "Do not remember 403s to pre-disable controls. Only show the 403 clearly." The UI never reads or decodes the token.

**Scope conflict, recorded and already settled by the owner.** Spec §5.1 says "navigation filtered by permission". Until PAN-011b, production has no permission data, so navigation shows every item and the API enforces. The filtering logic ships now and is tested against a fake source. A spec note about this interim state is a follow-up for the owner or product-manager. The planner may not edit the spec.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Each route and action declares its permission (same as the API endpoint) | (a) `pnpm typecheck` passes. `ROUTE_PERMISSIONS` is declared `satisfies Record<AuthenticatedRouteId, Requirement>`, where `AuthenticatedRouteId` is derived from `FileRoutesById` in `src/routeTree.gen.ts`, so a new `_authenticated` route that is not declared fails typecheck. (b) `registry.test.ts › every permission requirement matches the x-permission of each operation it names`. (c) `registry.test.ts › ADMIN_PERMISSIONS equals the set of x-permission values in openapi.json`. (d) Reading the diff, every action control listed under "Action inventory" is wrapped in `<Can action=…>`, and every nav link carries `permission` taken from `ROUTE_PERMISSIONS`. (e) `nav-filter.test.ts › every nav link uses the requirement of its route`. |
| 2a | Hide/disable logic (`<Can>`, nav filter, route guard) exists and is tested against a fake `PermissionSource` | `can.test.tsx`, `nav-filter.test.ts`, `route-permission-guard.test.tsx`, `search-provider.test.tsx › hides denied nav items in the command menu`, plus one denied-case test per feature (see Tests). |
| 2b | In production the source returns `unknown`, so controls are visible and the API enforces | `source.test.ts › the production source answers unknown for every admin permission`. `can.test.tsx › with no provider (production default) every control renders`. `src/routes/_authenticated/route.tsx` mounts `<PermissionProvider>` with no `source` prop. |
| 2c | Every API 403 is handled in place, with copy chosen by `code` | `forbidden.test.ts` (copy per code, `required` shown only when it matches the key regex, server `message` never used). `forbidden-panel.test.tsx › a 403 query renders the forbidden panel with the required permission`. `handle-server-error.test.ts › 403 toasts the code-specific copy, not the server message`. |
| 2d | A 403 never signs the user out or retries | `forbidden-panel.test.tsx › a 403 never calls the unauthorized handler and is fetched once`. The existing `query-client.test.ts › does not retry 401, 403…` still passes. |
| 2e | A query error is checked before its data | `query-view.test.ts › error wins over stale data`. `forbidden-panel.test.tsx › data then a 403 on refetch replaces the data with the panel`. |
| 3 | Tests for allowed / denied cases | All the test files below. Each one has granted, denied and unknown cases. `pnpm test` is green. |
| R8 | All checks green | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/lib/permissions/registry.ts` | **create** | The one typed registry. It holds `ADMIN_PERMISSIONS`/`AdminPermission`, `ADMIN_PERMISSION_PATTERN`, `Requirement`, `ROUTE_PERMISSIONS` (keyed by route id) and `ACTIONS` (keyed by action id), all hand-written. |
| `src/lib/permissions/registry.test.ts` | **create** | Consistency against `src/api/openapi.json` (AC1). |
| `src/lib/permissions/source.ts` | **create** | `PermissionState`, the `PermissionSource` interface, `unknownPermissionSource` and the pure `evaluate(requirement, source)`. |
| `src/lib/permissions/source.test.ts` | **create** | Evaluator and production-default tests. |
| `src/context/permission-provider.tsx` | **create** | `PermissionProvider` (context; the default value is `unknownPermissionSource`), `usePermission(requirement)` and `useActionPermission(action \| action[])`. |
| `src/components/permissions/can.tsx` | **create** | `<Can>`: hide (default) or disable (render prop) when `denied`. |
| `src/components/permissions/can.test.tsx` | **create** | Allowed, denied and unknown cases. |
| `src/components/permissions/route-permission-guard.tsx` | **create** | `RoutePermissionGate` (pure: routeId → children or fallback) and `RoutePermissionGuard` (router-bound: deepest match, renders `<Outlet/>` or the forbidden page in the layout). |
| `src/components/permissions/route-permission-guard.test.tsx` | **create** | Route denied, unknown and none cases. |
| `src/components/forbidden-panel.tsx` | **create** | The shared in-place 403 state (`variant: 'page' \| 'inline'`), router-free. |
| `src/components/forbidden-panel.test.tsx` | **create** | Panel rendering, plus a 403 at the network layer through the real `createApiClient` and TanStack Query. |
| `src/lib/forbidden.ts` | **create** | `isForbidden(e)`, `forbiddenCopy(e)` (copy by `code`) and `routeForbiddenCopy(permission)`. |
| `src/lib/forbidden.test.ts` | **create** | Copy and safety tests. |
| `src/lib/query-view.ts` | **create** | `queryView(query)`: a discriminated view that checks `error` **before** `data`. |
| `src/lib/query-view.test.ts` | **create** | Error-before-data tests. |
| `src/components/layout/nav-filter.ts` | **create** | Pure `filterNavGroups(groups, check)` and hook `useVisibleNavGroups()`. |
| `src/components/layout/nav-filter.test.ts` | **create** | Filter tests, and the test that each nav link uses its route's requirement. |
| `src/test-utils/permissions.tsx` | **create** | `fakePermissionSource(granted)` and `WithPermissions` wrapper. Test-only, so no production code can mount a "granted" source. |
| `docs/adr/0004-permission-mirroring-and-403-handling.md` | **create** | A decision that outlives the ticket: registry, tri-state seam, hide vs disable policy, 403 pattern, no learned denials, no token reading. |
| `src/routes/_authenticated/route.tsx` | modify | Mount `<PermissionProvider>` inside `AuthGate`, and pass `<RoutePermissionGuard/>` as `AuthenticatedLayout` children. |
| `src/components/layout/types.ts` | modify | Add a required `permission: Requirement` to `NavLink` and to collapsible sub-items. |
| `src/components/layout/data/sidebar-data.ts` | modify | Each link takes `permission: ROUTE_PERMISSIONS['<route id>']`. |
| `src/components/layout/app-sidebar.tsx` | modify | Render `useVisibleNavGroups()` instead of `sidebarData.navGroups`. |
| `src/components/command-menu.tsx` | modify | Same filter, so the palette never lists a hidden route. |
| `src/context/search-provider.test.tsx` | modify | Add a denied case for the command menu. |
| `src/lib/handle-server-error.ts` | modify | A 403 (`kind: 'http'`) branch that toasts `forbiddenCopy`, never the server message. |
| `src/lib/handle-server-error.test.ts` | modify | 403 cases. |
| `src/lib/query-client.ts` | modify | Comment only: "403 is left to the caller" now points to `queryView` + `ForbiddenPanel` (ADR 0004). No behaviour change. |
| `src/features/organizations/components/organizations-primary-buttons.tsx` | modify | `<Can action='organizations.create' disable>`; remove the wrong `admin:orgs:write` comment. |
| `src/features/organizations/components/data-table-row-actions.tsx` | modify | `<Can>` on Edit, Suspend/Reactivate and Delete; hide the trigger when all are denied; remove the wrong comments. |
| `src/features/users/components/data-table-row-actions.tsx` | modify | `<Can>` on View details and Enable/Disable; hide the trigger when both are denied. |
| `src/features/users/components/data-table-bulk-actions.tsx` | modify | `<Can action='users.setStatus'>` on the bulk Disable button. |
| `src/features/apps/index.tsx` | modify | `RegisterAppButton` uses `<Can action='apps.register' disable>`. |
| `src/features/apps/components/apps-row-actions.tsx` | modify | `<Can>` on View (`apps.view`), Edit and Enable/Disable (`apps.update`); hide the menu trigger when `apps.update` is denied. |
| `src/features/apps/components/app-permissions-tab.tsx` | modify | "Add permission" uses `<Can action='apps.createPermission' disable>`. The admin-only `Switch` uses `<Can action='apps.updatePermission' disable>`; it is disabled, not hidden, because it also shows data. Fix the `admin:apps:write` comments: the API says `admin:roles:manage`. |
| `src/features/roles/index.tsx` | modify | `NewRoleButton` uses `<Can action='roles.create' disable>`. |
| `src/features/roles/components/roles-row-actions.tsx` | modify | `<Can>` on Assignments (`roles.viewAssignments`), Edit (`roles.update`) and Delete (`roles.delete`); hide the trigger when both menu items are denied. |
| `src/features/roles/components/role-assignments-sheet.tsx` | modify | "Assign role" uses `<Can action='roles.assign' disable>`; Revoke uses `<Can action='roles.revoke'>` (hide). |
| `src/features/reports/components/reports-primary-buttons.tsx` | modify | `<Can action='reports.create' disable>` (pending: always rendered). |
| `src/features/reports/components/reports-row-actions.tsx` | modify | `<Can>` on Edit, Run, Download and Delete (all pending). |
| `src/features/organizations/components/organizations-table.test.tsx` | modify | Denied and granted cases for the org actions. |
| `src/features/users/components/users-table.test.tsx` | modify | Denied and granted cases for the user actions. |
| `src/features/apps/apps.test.tsx` | modify | Denied and granted cases for the app actions. |
| `src/features/roles/roles.test.tsx` | modify | Denied and granted cases for the role actions. |
| `src/features/reports/components/reports-table.test.tsx` | modify | Pending actions stay visible under a deny-all source. |

The implementer must not touch other files unless they record why in `impl-log.md`. Known exception: if importing `openapi.json?raw` in the registry test does not typecheck, the implementer may add the smallest fix (e.g. `resolveJsonModule` in `tsconfig.app.json`) and must log it.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `registry.test.ts › ADMIN_PERMISSIONS equals the set of x-permission values in openapi.json` | No invented keys and no missing keys (AC1). Load the snapshot with `import raw from '@/api/openapi.json?raw'` and `JSON.parse`. |
| `registry.test.ts › every permission requirement matches the x-permission of each operation it names` | For every route and action of kind `permission`, each `operations` entry `"<METHOD> <path>"` exists in the snapshot and its `x-permission` equals `permission`. |
| `registry.test.ts › every key matches the API key pattern` | `^admin:([a-z][a-z0-9-]{0,47}:[a-z][a-z0-9-]{0,47}\|\*)$` (org-admin-api `admin_auth/deps.py:29`). |
| `registry.test.ts › pending requirements name a PAN ticket and carry no permission` | The shape of `pending` entries. |
| `source.test.ts › the production source answers unknown for every admin permission` | AC2b. |
| `source.test.ts › evaluate: none is granted, pending is unknown even under a deny-all source` | Semantics. |
| `source.test.ts › evaluate: permission returns what the source says (granted / denied / unknown)` | Uses the fake source. |
| `source.test.ts › evaluate many: denied only when every requirement is denied; granted if any is granted; otherwise unknown` | Aggregation for `<Can action={[…]}>`. |
| `can.test.tsx › with no provider (production default) every control renders` | AC2b. |
| `can.test.tsx › granted renders the control` / `denied hides it` / `unknown renders it` | AC3. |
| `can.test.tsx › denied in disable mode renders a disabled control described by a visible reason naming the permission` | `disabled`, `aria-describedby` → visible text "Requires admin:organizations:write". |
| `can.test.tsx › an array of actions hides only when all are denied` | Menu trigger rule. |
| `nav-filter.test.ts › denied links are removed; a collapsible whose children are all denied is removed; an empty group is removed` | Nav hide policy. |
| `nav-filter.test.ts › unknown keeps every item; none-kind items stay under a deny-all source` | Production behaviour; settings always visible. |
| `nav-filter.test.ts › every nav link uses the requirement of its route` | Nav and route declarations stay the same (AC1). Map `/` → `/_authenticated/`, `/x` → `/_authenticated/x/`, `/settings/account` → `/_authenticated/settings/account`. |
| `search-provider.test.tsx › hides denied nav items in the command menu` | With a fake source granting nothing, "Users" is absent and "Settings Account" is present. |
| `route-permission-guard.test.tsx › a denied route renders the fallback with the required permission, not the page` | Route guard, denied. |
| `route-permission-guard.test.tsx › an unknown or granted route renders the page` | Allowed. |
| `route-permission-guard.test.tsx › a none or pending route renders under a deny-all source` | Settings, dashboard, reports, audit-log. |
| `forbidden.test.ts › copy is chosen by code for permission_denied, admin_wildcard_required, self_assignment_forbidden, self_status_change_forbidden and unknown 403 codes` | AC2c. |
| `forbidden.test.ts › required is shown only when it matches the key pattern` | `details.required` of `'<img src=x>'`, `42` or a missing value gives no `required`. |
| `forbidden.test.ts › never uses the server message` | A server `message` of `"secret text"` appears nowhere in the copy. |
| `forbidden.test.ts › isForbidden is false for kind auth 403, 401 and 404` | The gate's 403s (`not_member`, `email_unverified`) are not treated as permission 403s. |
| `query-view.test.ts › error wins over stale data` | `{ data: [...], error: 403 }` gives `forbidden` (AC2e). |
| `query-view.test.ts › pending / success / non-403 error` | The other branches. |
| `forbidden-panel.test.tsx › renders title, description and the required permission as text` | R6: React text, no HTML. |
| `forbidden-panel.test.tsx › Try again and Go back call their handlers; they are absent when no handler is given` | User-triggered only, no automatic retry. |
| `forbidden-panel.test.tsx › a 403 query renders the forbidden panel with the required permission` | Network layer: `createApiClient({ fetch })` returns a 403 envelope; probe component `useQuery(organizationsListQueryOptions({}, client))` + `queryView` + `ForbiddenPanel`. |
| `forbidden-panel.test.tsx › data then a 403 on refetch replaces the data with the panel` | Revoked-access case (appsec finding 4). |
| `forbidden-panel.test.tsx › a 403 never calls the unauthorized handler and is fetched once` | `setUnauthorizedHandler(spy)`; the spy is not called; `fetch` is called once under `retry: (n, e) => shouldRetryQuery(n, e, { dev: false })`. |
| `handle-server-error.test.ts › 403 toasts the code-specific copy, not the server message` | Mutation path (AC2c). |
| `handle-server-error.test.ts › auth-kind 403s stay silent` | Existing behaviour kept. |
| `organizations-table.test.tsx › with only admin:organizations:read the row menu and New organization are hidden/disabled; with write they are shown` | Feature, denied and allowed. |
| `users-table.test.tsx › without admin:users:write Enable/Disable and bulk Disable are hidden` | Feature, denied and allowed. |
| `apps.test.tsx › without admin:apps:write and admin:roles:manage, Register app is disabled, the row menu is hidden and the admin-only switch is disabled` | Feature, denied and allowed. |
| `roles.test.tsx › without admin:roles:manage and admin:roles:assign, New role and Assign role are disabled and Edit, Delete and Revoke are hidden` | Feature, denied and allowed. |
| `reports-table.test.tsx › pending actions stay visible under a deny-all source` | Pending semantics. |

## Approach

### 1. Registry (`src/lib/permissions/registry.ts`). Decision: hand-written, checked against `openapi.json`
- `ADMIN_PERMISSIONS = ['admin:apps:read', 'admin:apps:write', 'admin:organizations:read', 'admin:organizations:write', 'admin:roles:assign', 'admin:roles:manage', 'admin:users:read', 'admin:users:write'] as const`. `AdminPermission` is its element type. This is exactly the set of `x-permission` values in the current snapshot (24 operations).
- `ADMIN_PERMISSION_PATTERN`: the API regex above.
- `type ApiOperation = \`${'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'} ${keyof paths & string}\`` (`paths` from `@/api`). A typo in a path fails typecheck; the test checks the method.
- The requirement shape:
  ```ts
  type Requirement =
    | { kind: 'permission'; permission: AdminPermission; operations: readonly ApiOperation[] }
    | { kind: 'pending'; ticket: `PAN-${string}`; reason: string } // no admin endpoint in our snapshot yet
    | { kind: 'none'; reason: string }                          // never calls an admin endpoint
  ```
- `type AuthenticatedRouteId = Extract<keyof FileRoutesById, \`/_authenticated/${string}\`>` (type-only import from `@/routeTree.gen`).
- `ROUTE_PERMISSIONS = { … } as const satisfies Record<AuthenticatedRouteId, Requirement>`, so completeness is checked at compile time.
- `ACTIONS = { … } as const satisfies Record<string, Requirement>` and `type ActionId = keyof typeof ACTIONS`.
- **Why hand-written and not generated:** there are eight keys and about 20 declarations. A codegen script would add a second generated artifact and a staleness check for no extra safety. The real risk is a declaration pointing at the wrong key, and only the per-operation test catches that, whether the keys are generated or not. Typing operations against `paths` also catches path typos at compile time. When `pnpm api:types` refreshes the snapshot (each real-API ticket, ADR 0001), the tests fail on any drift.

**Route declarations**
| Route id | Requirement |
|---|---|
| `/_authenticated/` (dashboard) | pending `PAN-020`: no stats API (spec §5.7 "gap") |
| `/_authenticated/users/` | `admin:users:read` · `GET /api/v1/users` |
| `/_authenticated/organizations/` | `admin:organizations:read` · `GET /api/v1/organizations` |
| `/_authenticated/apps/` | `admin:apps:read` · `GET /api/v1/apps` |
| `/_authenticated/roles/` | `admin:apps:read` · `GET /api/v1/apps` (the screen lists apps; the role catalog `GET /api/v1/apps/{key}/roles` is public, D17) |
| `/_authenticated/audit-log/` | pending `PAN-016`: org-admin-api main has `GET /api/v1/audit-logs` with `admin:audit:read` (`app/modules/audit/router.py:21`), but our snapshot does not. PAN-016 refreshes the snapshot and switches this entry. |
| `/_authenticated/reports/` | pending `PAN-021`: no reports API (spec §8 Q7) |
| `/_authenticated/settings`, `/settings/`, `/settings/account`, `/settings/appearance`, `/settings/display`, `/settings/notifications`, `/_authenticated/errors/$error` | none: local preferences and error pages; no admin endpoint |

**Action inventory**
| Action id | Requirement (permission · operations) | Control → mode |
|---|---|---|
| `users.view` | `admin:users:read` · `GET /api/v1/users/{user_id}` | row "View details" → hide |
| `users.setStatus` | `admin:users:write` · `PATCH /api/v1/users/{user_id}` | row Enable/Disable, bulk Disable → hide |
| `organizations.create` | `admin:organizations:write` · `POST /api/v1/organizations` | "New organization" → disable |
| `organizations.update` | `admin:organizations:write` · `PATCH /api/v1/organizations/{org_id}` | row Edit, Suspend/Reactivate → hide |
| `organizations.delete` | `admin:organizations:write` · `DELETE /api/v1/organizations/{org_id}` | row Delete → hide |
| `apps.view` | `admin:apps:read` · `GET /api/v1/apps/{key}` | row "View" → hide |
| `apps.register` | `admin:apps:write` · `POST /api/v1/apps` | "Register app" → disable |
| `apps.update` | `admin:apps:write` · `PATCH /api/v1/apps/{key}` | row Edit, Enable/Disable → hide |
| `apps.createPermission` | `admin:roles:manage` · `POST /api/v1/apps/{key}/permissions` | "Add permission" → disable |
| `apps.updatePermission` | `admin:roles:manage` · `PATCH /api/v1/apps/{key}/permissions/{permission_id}` | admin-only `Switch` → disable (it also shows data) |
| `roles.create` | `admin:roles:manage` · `POST /api/v1/apps/{key}/roles` | "New role" → disable |
| `roles.update` | `admin:roles:manage` · `PATCH /api/v1/apps/{key}/roles/{role_id}`, `PUT /api/v1/apps/{key}/roles/{role_id}/permissions` | row Edit → hide |
| `roles.delete` | `admin:roles:manage` · `DELETE /api/v1/apps/{key}/roles/{role_id}` | row Delete → hide |
| `roles.viewAssignments` | `admin:users:read` · `GET /api/v1/users/{user_id}/role-assignments` | row "Assignments" → hide |
| `roles.assign` | `admin:roles:assign` · `POST /api/v1/users/{user_id}/role-assignments` | sheet "Assign role" → disable |
| `roles.revoke` | `admin:roles:assign` · `DELETE /api/v1/users/{user_id}/role-assignments/{assignment_id}` | sheet "Revoke" → hide |
| `reports.create`, `reports.update`, `reports.run`, `reports.export`, `reports.delete` | pending `PAN-021` | Primary button → disable; row items → hide (never denied while pending) |

Use the exact path strings as they appear in `openapi.json`. The implementer checks each one against `keyof paths`.

### 2. Seam (`src/lib/permissions/source.ts`, `src/context/permission-provider.tsx`)
- `type PermissionState = 'granted' | 'denied' | 'unknown'`.
- `interface PermissionSource { check(permission: AdminPermission): PermissionState }`.
- `unknownPermissionSource` answers `'unknown'` for every key.
- `evaluate(req, source)`:
  - `none` → `granted`.
  - `pending` → `unknown`. The source is not consulted, because there is no key.
  - `permission` → `source.check(req.permission)`.
- `evaluateAll(reqs, source)`:
  - any `granted` → `granted`;
  - all `denied` → `denied`;
  - otherwise → `unknown`.
- Header comment (required, appsec rec. 3): the state is **advisory only**. It must never decide whether data is fetched or shown, never replace a confirmation (R9), and never replace 403 handling. `unknown` means "render as allowed; the API is the gate". Never fail closed.
- `PermissionProvider({ source?, children })`. The context default is `unknownPermissionSource`, so components outside a provider (tests, the mock screens) behave like production.
  - The provider holds no state of its own and persists nothing.
  - PAN-011b will build `source` from a TanStack Query entry, which is cleared by `clearOnAuthChange`.
- Hooks:
  - `usePermission(req): PermissionState`.
  - `useActionPermission(id: ActionId | readonly ActionId[]): PermissionState`.
- No token, no claims, no `getToken()`, no decoding, no storage (R3, ADR 0003). No learned denials (owner).

### 3. `<Can>` (`src/components/permissions/can.tsx`)
- `<Can action={id | id[]} fallback?={node}>{children}</Can>`: when `denied`, it renders `fallback ?? null`; otherwise it renders `children`.
- `<Can action={id} disable>{({ disabled, describedBy }) => <Button disabled={disabled} aria-describedby={describedBy}>…</Button>}</Can>`: when `denied`, it calls the render prop with `disabled: true` and the `useId()` id, and renders the reason next to it as visible text `Requires <permission>` (`text-sm text-muted-foreground`, React text). Otherwise it calls it with `{ disabled: false, describedBy: undefined }`.
- When `unknown`, nothing is marked "allowed" or "you have access" (no copy claims a grant).

**Hide vs disable policy, recorded in ADR 0004:**
- Nav links and row or menu actions are **hidden** when denied (spec §5.1 "navigation filtered").
- Page-level primary buttons and controls that also show data (switches) are **disabled** with a visible reason, so the page stays explained.
- Native `disabled` plus visible adjacent text was chosen over a focusable `aria-disabled`. It needs no click or keyboard guard, and the reason stays perceivable (R10).
- A dropdown whose items are all denied hides its trigger (`<Can action={[…all item actions]}>`). The separator between items moves inside the `<Can>` of the item it precedes, so no stray separators remain.

### 4. Nav (`src/components/layout/nav-filter.ts`)
- `filterNavGroups(groups, check: (req) => PermissionState)` works like this:
  - It drops `denied` links and sub-items.
  - It drops a collapsible with no remaining sub-items.
  - It drops a group with no items.
- `useVisibleNavGroups()` wraps it with `usePermission`'s source. Use `useMemo` on the source.
- `app-sidebar.tsx` and `command-menu.tsx` both use it.
- `types.ts`: `permission: Requirement` becomes required on `NavLink` and on collapsible sub-items. The collapsible parent has none; it is derived from its children.
- `sidebar-data.ts` references `ROUTE_PERMISSIONS['/_authenticated/…']`, never a string literal.

### 5. Route guard (`src/components/permissions/route-permission-guard.tsx`)
- `RoutePermissionGate({ routeId, children, fallback: (copy) => ReactNode })`:
  - It looks up `ROUTE_PERMISSIONS[routeId]`.
  - If the id is not under `/_authenticated/`, it renders `children` (fail open, as the type makes this unreachable).
  - When `denied`, it renders `fallback(routeForbiddenCopy(permission))`.
  - Otherwise it renders `children`.
- `RoutePermissionGuard()`:
  - It reads `useMatches({ select: (m) => m.at(-1)?.routeId })`.
  - It renders the gate with `children = <Outlet/>`.
  - Its fallback is the same `Header` block as `routes/_authenticated/errors/$error.tsx` (Search, ThemeSwitch, ConfigDrawer, ProfileDropdown), so the mobile sidebar trigger and sign-out stay. Below it goes `<Main><ForbiddenPanel variant='page' copy onBack={() => router.history.back()} /></Main>`.
  - It never navigates or redirects. The URL is kept, and there is no `/403` redirect built from data (appsec rec. 4).
- `routes/_authenticated/route.tsx` becomes: `<AuthGate><PermissionProvider><AuthenticatedLayout><RoutePermissionGuard/></AuthenticatedLayout></PermissionProvider></AuthGate>`. The provider sits inside the gate, so it is account-scoped.

### 6. 403 handling (`src/lib/forbidden.ts`, `src/lib/query-view.ts`, `src/components/forbidden-panel.tsx`, `src/lib/handle-server-error.ts`)
- `isForbidden(e)` is `isApiError(e, 403) && e.kind === 'http'`. Auth-kind 403s (`not_member`, `email_unverified`) stay with `AuthGate` (ADR 0003 D3).
- `forbiddenCopy(e): { title, description, required? }`. Copy is chosen by `code` from `org-admin-api app/core/errors.py:58-78`. The server `message` is never used.

| code | title | description |
|---|---|---|
| `permission_denied` | "You don't have permission to do this" | "Your admin role doesn't include the permission this needs." |
| `admin_wildcard_required` | "Only super admins can do this" | "This action needs the admin:* permission." |
| `self_assignment_forbidden` | "You can't change your own roles" | "Ask another administrator to change your role assignments." |
| `self_status_change_forbidden` | "You can't change your own account status" | "Ask another administrator to do this." |
| any other 403 | "You don't have permission to do this" | "The server refused this request." |

- `required` is set only when `details.required` is a string that matches `ADMIN_PERMISSION_PATTERN`. It is rendered as React text inside `<code>` (R6).
- `routeForbiddenCopy(permission)` gives the title "You don't have access to this page", the `permission_denied` description, and `required: permission`.
- `queryView(q)` returns `{ status: 'forbidden', copy }`, `{ status: 'error', error }`, `{ status: 'pending' }` or `{ status: 'success', data }`.
  - It checks `q.error` **first**. TanStack Query keeps the old `data` when a refetch fails.
  - Screens moving to the real API (PAN-013…016) must render through it (ADR 0004).
- `ForbiddenPanel({ copy, variant = 'page', onRetry?, onBack? })`:
  - It is router-free.
  - `page` variant: a `<section aria-labelledby>` with an `h2` title, a `role='alert'` paragraph with the description and the "Required permission: `<code>`" line, then "Go back" and "Try again" buttons, each rendered only when its handler is given.
  - `inline` variant: a single `role='alert'` block for dialogs that set `meta.handlesOwnErrors`, so the dialog stays open with the error and no success invalidation (R9).
  - Retry is user-triggered only.
- `handleServerError`: before the generic branch, `if (isForbidden(error)) { const c = forbiddenCopy(error); toast.error(c.title, { description: c.description + (c.required ? \` Required permission: ${c.required}.\` : '') }); return }`. This covers every mutation that reaches the global `MutationCache` today.
- `QueryCache.onError` stays as is: no 403 toast, because the screen renders the panel.
- `client.ts` is unchanged: only a 401 calls `notifyUnauthorized`, and `shouldRetryQuery` already refuses a 403. The tests pin both.
- R5: nothing new logs to the console, analytics or error reports. `details` and `required` reach only the DOM and the toast.
- **Where 403s can occur today.** No admin screen queries the API yet; they are on mock data until PAN-013…016. The 403 surfaces that exist now are: the global mutation handler (all mutations), the route guard, and the shared `queryView` + `ForbiddenPanel`, which are proven end to end in `forbidden-panel.test.tsx` through the real `createApiClient` and `organizationsListQueryOptions`. Each real-API ticket must render its queries through `queryView` (ADR 0004, follow-up below).

### 7. Feature wiring
- Replace each `{/* admin:… (planned name) */}` comment on the controls in the Action inventory with the `<Can>` wrapper. Remove the replaced comments only.
- Mutations stay in-memory (mock phase). No network calls are added (CLAUDE.md "Mock-data phase").

### 8. ADR `docs/adr/0004-permission-mirroring-and-403-handling.md`
Context, then the decision (sections 1–6 above, briefly), alternatives (generated keys; decoding the token: forbidden; a role-to-permission map in the UI: R1; learned denials: rejected by the owner 2026-11-16; probing endpoints; `aria-disabled` focusable controls), and consequences (controls visible in production until PAN-011b; each real-API ticket uses `queryView`).

### Rules
- **R1:** no faked permission data; production is `unknown`.
- **R2:** no HTTP added outside `src/api/`; the tests inject `fetch` into `createApiClient`.
- **R3:** the token is never read.
- **R4:** declarations plus 403 handling.
- **R5:** no logging.
- **R6:** text only.
- **R7:** only the listed files.
- **R8:** tests listed above.
- **R9:** never optimistic; 403 keeps dialogs open or toasts.
- **R10:** `role='alert'`, labelled section, visible reasons, semantic buttons.
- **R11:** untouched.

### Follow-ups (not in this diff)
- **PAN-011b:** a real `PermissionSource` from org-admin-api `GET /api/v1/me/permissions` (request in `org-admin-api-request.md`). It adds a `permits()` matcher that mirrors ADR-0003 exactly (exact match or `admin:*`) with the edge-case table, and refetches the source on a 403 `permission_denied`. Ideally the matcher is imported from mmlabs-auth later.
- **PAN-013/014/015/016:** render queries through `queryView` + `ForbiddenPanel`. Use `ForbiddenPanel variant='inline'` in dialogs with `handlesOwnErrors`. Remove the remaining stale `admin:…(planned name)` comments in providers, dialogs and `apps/data/access-store.ts` (several name the wrong key, e.g. `admin:apps:write` for role and permission writes, which are `admin:roles:manage`).
- **PAN-016:** refresh `openapi.json`, add `admin:audit:read` to `ADMIN_PERMISSIONS` and switch `/_authenticated/audit-log/` from pending.
- **Spec §5.1:** add a note on the interim state: navigation is not filtered until PAN-011b (owner or product-manager).

## Specialist input used
- **identity-access-engineer**
  - Option (c) adopted in full: declarations, the OpenAPI consistency test, the tri-state seam, 403 handling, and fake-source tests. Fail-open `unknown` adopted.
  - Option (a) is PAN-011b plus the org-admin-api request (owner).
  - `permits()` deferred to PAN-011b. With no granted set there is nothing to match, and the test fake uses plain set membership.
  - The "quiet banner when the source errors" is deferred to PAN-011b. The production source cannot error today.
- **appsec-engineer**
  - Adopted: one module with a typed key union; the key regex for display; tri-state with "advisory only" comment and test; copy by `code`, never server text; never sign out, never retry, never re-check the session; render in place with no `/403` redirect; error before data; mutation 403 keeps dialogs open (inline variant) and is never optimistic; no logging of `details`.
  - Rec. 5 (learned denials) rejected by the owner.
- **frontend-developer**
  - Adopted: `Requirement` with non-API kinds (as `pending` / `none`, not `undefined`, so missing declarations are type errors); nav `permission` field referencing the registry and the same evaluator in sidebar and command menu; a collapsible hides when all its children are hidden; `<Can>` with hide or disable; the provider inside `AuthGate`; a reusable in-layout `ForbiddenPanel` separate from the full-page `ForbiddenError` (left unchanged for `/(errors)/403`); `handleServerError` 403 branch with stable copy; the denied state tested per feature; audit-log and reports not given invented keys.
  - Changed: a hand-written registry checked against `openapi.json` instead of a generated `permissions.gen.ts` (reason in Approach §1). Route declarations keyed by route id in the registry instead of `staticData` in each route file, so completeness is a compile-time check and the declarations stay in one place. Native `disabled` with a visible reason instead of a focusable `aria-disabled`.
  - Rejected:
    - Learned denials (owner).
    - The lint-style ban on `admin:x:y` literals outside the registry: mock data and tests legitimately contain role keys such as `admin:support`.
    - Per-mutation `meta.forbiddenMessage`: code-based copy is enough, and the target is already named in the confirmation (R9).

## Assumptions
- UI copy is in English, like the rest of the UI (spec §8 Q3 is still open; PAN-024).
- `/roles` needs `admin:apps:read`: the real screen lists apps and then reads each app's public role catalog. `roles.viewAssignments` maps to `admin:users:read` (assignments are read per user). PAN-015 may revise both entries; the registry test will hold it to the API.
- The dashboard, reports and audit-log routes and the reports actions are `pending` (always rendered) until their API tickets. Settings and error pages are `none`.
- The `admin_wildcard_required` and `self_*` refusals depend on the target, so they are never declared up front. They are handled only as 403 copy.
- The owner accepted that controls stay visible in production until PAN-011b (ticket notes, 2026-11-16).
- `?raw` JSON import works in Vitest browser mode with the existing `vite/client` types.
- Size: about 450 production lines plus about 500 test lines and the ADR. This is above the rough guide, but most of it is tests and mechanical `<Can>` wrapping. The owner already split the ticket, so no further split is proposed.

## Blocking questions
None

## Split proposal
None. The owner already split the work: this ticket is PAN-011; real pre-hiding is PAN-011b.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| Every `/_authenticated/*` route (via `RoutePermissionGuard`) | Per `ROUTE_PERMISSIONS` (table above) | denied (fake source only) → in-layout `ForbiddenPanel` with "Required permission"; unknown, granted, none or pending → the page. Loading, empty and error states are unchanged (mock data). | "Go back" → `history.back()` | None |
| `/users`, `/organizations`, `/apps`, `/roles`, `/reports` | Per the Action inventory | Controls hidden or disabled when denied; visible when unknown (production) | Unchanged mock mutations | None (in-memory) |
| Sidebar and command menu | Per route | Denied links, empty collapsibles and empty groups removed | None | None |

## API calls used
None added. The registry only *references* existing operations of `src/api/openapi.json` (listed in the Route and Action tables) to check their `x-permission`. The network-layer test calls `GET /api/v1/organizations` (`organizationsListQueryOptions`, already in the codebase) against a stubbed `fetch`, with 403 codes `permission_denied` and `admin_wildcard_required`. The endpoint for real permissions (`GET /api/v1/me/permissions`) does not exist yet. It is requested in `work/tickets/PAN-011/org-admin-api-request.md` for PAN-011b and is not mocked in production code.
