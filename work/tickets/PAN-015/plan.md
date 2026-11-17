Status: READY

# Plan — PAN-015: Apps registry and app permissions on the real API

## Spec summary
`docs/spec-v1.md` §5.4 Apps, roles and access:
> Apps registry (join policy, org mode, origins, default role), roles and their permissions, role assignments per user (app scope or one org), revoke sessions.
> API: **org-admin-api USR-02** (backlog), sessions revoke (identity-architecture §4).

§6: "Lists use server-side pagination (`limit` ≤ 100) and stay responsive with thousands of rows."
§7: "Every admin task org-admin-api supports can be done in the UI, without raw API calls."

Scope set by the owner. This ticket covers only the **apps registry and app permissions**:
- **2026-11-17 split:** roles go to PAN-015b and assignments to PAN-015c.
- **2026-11-17 unblock:** "Build the Apps screen now on the API as it is (org-admin-api main 33db316). Keep only the filters and sorting `GET /api/v1/apps` actually supports; remove or hide the others, and keep the follow-up open against `org-admin-api-request.md`."
- **The `admin` app:** "Editable in the UI, and the API decides. Show a note that `admin:*` is needed, and show the API's 403/409 inline."
- **Credentials:** app credentials are PAN-027. Do not wire `/apps/{key}/credentials` (R7).
- **Members (orchestrator note, R1):** ADM-016 `member_count` is still BACKLOG. Do not fake member counts.

**API facts verified at org-admin-api 33db316** (read-only checkout: `app/modules/rbac/{router,schemas,service,repository,scopes,origins,models}.py`, ADR-0015):

- **`GET /api/v1/apps`** (`admin:apps:read`)
  - Takes only `PageDep` (`limit` 1..100, `offset`) (`router.py:40-48`).
  - No `status`, `join_policy`, `q` or `sort` parameter. The order is fixed by `key` (`repository.py:82-85`).
  - The `admin` app and disabled apps are included.
- **`GET /api/v1/apps/{key}`** (`admin:apps:read`) returns 200 or 404.
- **`POST /api/v1/apps`** (`admin:apps:write`) returns 201 `AppRead`.
  - Body `AppCreate {key, name, join_policy=open, org_mode=none, origins=[]}`, `extra=forbid`.
  - `key` matches `^[a-z][a-z0-9-]{1,31}$` (max 32). `name` is 1..255 (NFC, no control characters). Origins: ≤ 20.
  - 409 `conflict` with `details: null` = key taken. 409 `conflict` with `details=[{field:"origins",reason:"origin_taken"}]` = origin taken (`service.py:138-142,348-365`).
  - No `admin:*` needed.
- **`PATCH /api/v1/apps/{key}`** (`admin:apps:write`, `service.py:393-494`). Partial `AppUpdate`: `name`, `status`, `join_policy`, `org_mode`, `origins`, `default_role_id`, `org_owner_role_id`. Null is accepted only for the two role ids.
  - **Admin app:** any real change needs `admin:*` (403 `admin_wildcard_required`); a no-op PATCH needs nothing. The admin app must stay active, closed, `org_mode=none`, with no default role (409 `conflict`).
  - **Admin app origins:** 422 `unprocessable` reasons `apex_not_allowed`, `too_many_origins`, `loopback_not_allowed`.
  - **Org mode:** 422 `org_mode_required` (field `org_owner_role_id`) when `org_mode` leaves `required` while an org owner role is set. 422 `role_has_org_permissions` (field `default_role_id`) when `org_mode` becomes `required` and the default role holds org-scope permissions.
  - **Origins:** 409 `origin_taken`. 409 `conflict` "App was changed concurrently". 404.
- **`GET /api/v1/apps/{key}/permissions`** (`admin:apps:read`) returns `Page[PermissionRead {id, key, description|null, is_admin, scope}]`, ordered by `key` (`repository.py:190-196`). 404 for an unknown app.
- **`POST /api/v1/apps/{key}/permissions`** (`admin:roles:manage`, `service.py:829-867`).
  - Body `PermissionCreate {key, description?, is_admin?, scope?}`.
  - `key` matches `^<app>:(<seg>:<seg>|\*)$` with `<seg>` = `[a-z][a-z0-9-]{0,47}`, max 160. Description is max 500.
  - `admin:*` is needed when the app is `admin`, or the permission is `is_admin`, or it is a non-reserved `scope=app` permission on an `org_mode=required` app.
  - When `scope` is omitted, the reserved key decides, else `org` on `org_mode=required` apps, else `app` (`scopes.py`).
  - Errors: 409 `conflict` (key taken); 422 `prefix_mismatch`, `wildcard_must_be_admin`, `admin_app_permission_must_be_admin`, `reserved_scope`.
- **`PATCH /api/v1/apps/{key}/permissions/{permission_id}`** (`admin:roles:manage`, `service.py:869-960`).
  - Any `is_admin` change needs `admin:*`; so does any change on the admin app.
  - false→true is refused with 409 `conflict` when the default role or the org owner role holds the permission ("The app's … role holds this permission"), and with 409 `role_has_assignments` (`details=[{field:"is_admin",…}]`) when a role holding it has assignments.
  - true→false on `<app>:*` or on admin-app permissions is 422 (`wildcard_must_be_admin` / `admin_app_permission_must_be_admin`).
  - 404.
- **Effect of a disabled app.** The API refuses sign-in, join and tokens for that app (`auth/service.py:87`, `membership/service.py:45`). Its origins drop out of CORS (`repository.py:50`), and the public role catalog answers 404. Tokens already issued are not revoked; they last until they expire.
- **Roles.** There is no staff role list with ids at 33db316, which is why roles are split to PAN-015b. The only list is the public catalog (D17: no ids, 404 for the `admin` and disabled apps, rate-limited).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Every screen action maps to a USR-02 endpoint (missing ones become org-admin-api follow-ups) | **Mapping** (Screens / API calls below), with no mock left in the Apps feature: `grep -rn "access-store\|mock-data" src/features/apps --include=*.tsx --include=*.ts` hits only `data/access-store.ts` and `data/mock-data.ts` themselves (kept for the Roles mock page, PAN-015b). `app-schema.test.ts` › "the apps feature imports no mock store" enforces this. **Removed because the API has no support:** the search box and join-policy facet (no list filters), the Members column and row (ADM-016), and the Roles tab (no staff role list, PAN-015b). Each is recorded under Follow-ups. **Tests:** `apps-table.test.tsx` › "no search box, facets or sort buttons", › "no Members column"; `app-detail-sheet.test.tsx` › "tabs are Overview and Permissions only". |
| 2 | Revoke/assign with confirmation and query invalidation | Revoke/assign moved to PAN-015c (owner 2026-11-17). This ticket has two access-changing actions: **enable/disable app** and **admin-only toggle**. Both use a confirmation that names the target, are never optimistic, show the API error inline, and invalidate on success. **Tests:** `app-status-dialog.test.tsx` › "disable: names the app and key, sends PATCH {status:'disabled'} only after confirm; cancel sends nothing", › "the badge changes only after the refetch"; `app-permissions-tab.test.tsx` › "toggle opens a confirm naming the key; cancel sends nothing; confirm sends PATCH {is_admin:true}; the switch flips only after the refetch"; `queries.test.tsx` › invalidation tests. |
| 3 | Loading, empty, error and 403 states tested with the API mocked at the network layer via a fake `fetch` injected into `createApiClient` (no MSW; ADR 0005) | All component tests use `src/test-utils/api.ts` (`fakeApi`, `json`, `apiError`, `testQueryClient`) through `renderApps(client)` (`test-fixtures.tsx`). **Table:** `apps-table.test.tsx` covers loading, empty, error + Retry, 403 page panel, and 403 on refetch. **Detail sheet:** `app-detail-sheet.test.tsx` covers detail loading/404/403. **Permissions tab:** `app-permissions-tab.test.tsx` covers loading, empty, error + Retry, and 403. **Dialogs:** each has inline 403 tests. `grep -rn msw src package.json` finds nothing. |
| — | Owner: the `admin` app is editable, a note says `admin:*` is needed, and the API's 403/409 are shown inline | `app-form-dialog.test.tsx` › "admin app: shows the admin:* note; controls stay enabled; 403 admin_wildcard_required shows the inline panel; 409 shows the admin-app rule". `app-status-dialog.test.tsx` › "admin app: note shown; 409 shows the admin-app rule inline". `app-permissions-tab.test.tsx` › "admin app: note shown; 403 admin_wildcard_required on add is inline". |
| — | Filters: only what the API supports | The URL holds only `page` and `pageSize`. `app-schema.test.ts` › "appsSearchSchema keeps page/pageSize and drops filter/join_policy"; `queries.test.tsx` › "toAppsListParams sends limit/offset only". |
| — | PAN-014 lessons applied | `app-form-dialog.test.tsx` › "a double click sends one POST (sync guard)". `app-status-dialog.test.tsx` › "a double click sends one PATCH" and › "after success focus returns to the row's actions button". `app-permissions-tab.test.tsx` › "after adding, focus returns to Add permission". The "Disable" menu item uses `text-red-700 dark:text-red-400` (not `text-red-500`); `apps-table.test.tsx` › "the Disable menu item has no text-red-500 class". |
| — | E2E green | `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm e2e` passes, including the new apps test. The `noStrayRequests` fixture reports no `unmatched` calls. |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/apps/api/queries.ts` | **New.** Keys, list/detail/permissions query options, app and permission mutations (Approach §2) | AC1–3; R2, R9 |
| `src/features/apps/api/queries.test.tsx` | **New** | R8 |
| `src/features/apps/data/app-schema.ts` | **New.** Generated type aliases, key/limit constants, zod form schemas, `appsSearchSchema` (Approach §3). The name differs from `schema.ts`, which stays as the Roles mock shape. | R2 |
| `src/features/apps/data/app-schema.test.ts` | **New.** Boundaries, drift against `openapi.json`, search schema, and the "no mock import" guard | R8 |
| `src/features/apps/data/errors.ts` | **New.** `appFormError`, `appStatusError`, `permissionFormError`, `permissionAdminError` (Approach §4) | AC2; R4, R9 |
| `src/features/apps/data/errors.test.ts` | **New** | R8 |
| `src/features/apps/data/data.ts` | Import the `AppStatus`/`JoinPolicy`/`OrgMode` types from `app-schema.ts`. Add `permissionScopeLabels`. **Remove `isHttpsOrigin`**: it is wrong against the API (loopback http is allowed), and its only caller is rewritten. Keep `KEY_SEGMENT_PATTERN` and `formatDate` (the Roles mock uses them). | R2; R1 (no rule the API does not have) |
| `src/features/apps/data/schema.ts` | Header comment only: "Mock-phase shapes for the Roles screen (`access-store`) until PAN-015b/c; the Apps screen uses `app-schema.ts`." | Clarity; the file stays because `features/roles` imports `Role` |
| `src/features/apps/data/access-store.ts` | Header comment only: "used by the Roles screen" (no longer by Apps) | Clarity |
| `src/features/apps/components/apps-provider.tsx` | Context `{ api, open, setOpen, currentRow, setCurrentRow }`. `api?` prop defaults to `getApi()`. `currentRow: App` (list-row snapshot) replaces `currentId`. | ADR 0005, PAN-014 pattern |
| `src/features/apps/components/apps-dialogs.tsx` | Explicit close handlers (`setOpen(null)`, then clear the row after 500 ms), as in `organizations-dialogs.tsx`. Mounts the form, status and detail sheet. | Provider change |
| `src/features/apps/components/apps-table.tsx` | Rewrite on the `organizations-table.tsx` shape (Approach §5) | AC1, AC3 |
| `src/features/apps/components/apps-columns.tsx` | Columns Key, Name, Status, Join policy, Org mode, Origins (count), actions. **Drop Members** and `filterFn`. Plain string headers; no sorting. | R1, ADR 0005 |
| `src/features/apps/components/apps-row-actions.tsx` | Take `App` (generated). View (`apps.view`) and a menu (`apps.update`: Edit, Disable/Enable). Trigger `aria-label="Actions for {key}"`. Disable item `text-red-700 dark:text-red-400`. Icons `aria-hidden`. | R4, R10 (PAN-014 a11y 🟡1) |
| `src/features/apps/components/app-status-badge.tsx` | Type import from `app-schema.ts` | R2 |
| `src/features/apps/components/app-form-dialog.tsx` | Rewrite on the create/update mutations (Approach §6) | AC1; owner (admin app); R9, R10 |
| `src/features/apps/components/app-status-dialog.tsx` | Rewrite on the update mutation with `ConfirmDialog` `isLoading`/`pendingText`/`error` (Approach §7) | AC2; R9 |
| `src/features/apps/components/app-detail-sheet.tsx` | Rewrite: detail sub-query, Overview, Permissions tab; **no Roles tab, no Members** (Approach §8) | AC1, AC3; R1 |
| `src/features/apps/components/app-permissions-tab.tsx` | Rewrite: paged list from the API, Add permission dialog trigger, admin-only switch + confirm (Approach §9) | AC1–3 |
| `src/features/apps/components/app-permission-form-dialog.tsx` | **New.** Add-permission dialog (Approach §9.3); replaces the inline form | AC1; R10 (focus returns to the trigger) |
| `src/features/apps/components/app-permission-admin-dialog.tsx` | **New.** Admin-only toggle confirm (Approach §9.4) | AC2; R9 |
| `src/features/apps/components/app-roles-tab.tsx` | **Delete.** It read mock roles; the API has no staff role list (PAN-015b). | R1 |
| `src/features/apps/index.tsx` | `AppsContent` unchanged apart from the provider. Fix the subtitle: "Registered apps, their join policy, org mode, origins and permissions." | Provider change |
| `src/routes/_authenticated/apps/index.tsx` | `validateSearch: appsSearchSchema` (imported). Drop `filter` and `join_policy`. | AC "filters"; ADR 0005 |
| `src/lib/permissions/registry.ts` | `apps.view` also names `'GET /api/v1/apps/{key}/permissions'` (`admin:apps:read`). No other change. | R4; `registry.test.ts` checks it against `x-permission` |
| `src/features/apps/components/test-data.ts` | **New.** API-shaped fixtures (`APPS: App[]`: `admin`, `calechip` (org_mode required), `stoktok`; `PERMISSIONS`; `appsPage()`, `permissionsPage()`) | Tests |
| `src/features/apps/components/test-fixtures.tsx` | **New.** `renderApps(client, { granted?, search? })`, as `organizations/components/test-fixtures.tsx` | Tests |
| `src/features/apps/components/apps-table.test.tsx` | **New** (replaces `apps.test.tsx`) | AC1, AC3 |
| `src/features/apps/components/app-form-dialog.test.tsx` | Rewrite on `fakeApi` | AC1; owner |
| `src/features/apps/components/app-status-dialog.test.tsx` | **New** | AC2 |
| `src/features/apps/components/app-detail-sheet.test.tsx` | **New** | AC1, AC3 |
| `src/features/apps/components/app-permissions-tab.test.tsx` | **New** (covers the tab, the add dialog and the toggle dialog) | AC1–3 |
| `src/features/apps/apps.test.tsx` | **Delete.** It asserts mock behaviour (client filters, auto default-role grant). | Mock phase ends for Apps |
| `e2e/support/fake-api.ts` | Add `APPS: AppRead[]` (same three keys), `PERMISSIONS` per app, and handlers `GET /api/v1/apps` (paged) plus `GET /api/v1/apps/<key>` and `GET /api/v1/apps/<key>/permissions` for each fixture key (built in a loop into `routes`). No write handlers. | The page now calls the API; `noStrayRequests` fails on unmatched calls |
| `e2e/pages.e2e.ts` | New test (Approach §10). The sweep entry `apps` (open/cancel Register app) is unchanged. | Keeps `pnpm e2e` meaningful |

Not touched:
- `features/roles/**`, `apps/data/mock-data.ts` and `apps/components/data-table-view.tsx`. The Roles mock page still imports them (PAN-015b).
- `confirm-dialog.tsx`. PAN-014 already shipped `pendingText`/`error`; use the props as they are.
- `src/api/openapi.json` and `schema.d.ts`. They are already at 33db316, so no patch is needed.

No ADR: ADR 0004 and 0005 already cover the patterns.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `apps/api/queries.test.tsx` › "appsKeys: list = ['apps','list',{limit,offset}]; detail(key) = ['apps','detail',key]; permissions(key,p) is under detail(key)" | Keys |
| › "toAppsListParams maps pageIndex/pageSize to limit/offset and sends nothing else" | Filters |
| › "list GET /api/v1/apps?limit=10&offset=20; detail GET /api/v1/apps/stoktok; permissions GET /api/v1/apps/stoktok/permissions?limit=50&offset=0" | R2 |
| › "create POSTs AppCreate; update PATCHes /apps/{key} with the given body only" | AC1 |
| › "app mutations invalidate ['apps'] on success and on 404/409; not on 500" | R9 |
| › "permission create POSTs /apps/{key}/permissions; update PATCHes /permissions/{id}; both invalidate ['apps','detail',key] on success and on 404/409" | R9 |
| › "permission writes on app 'admin' also invalidate ['me','permissions']; on 'stoktok' they do not" | PAN-011b |
| `apps/data/app-schema.test.ts` › "app key: accepts ab, a-1, 32 chars; rejects a, 1a, A, a_b, 33 chars" | Limits |
| › "name trims; rejects whitespace-only; 255 ok, 256 rejected" | Limits |
| › "origins: ≤ 20 entries; each non-empty, ≤ 255; duplicates (case-insensitive, trailing '/' ignored) rejected on the second entry; http://localhost:5173 accepted" | Origins (API decides the hosts) |
| › "permission resource/action: 1..48 chars `[a-z][a-z0-9-]*`; description ≤ 500, optional" | Limits |
| › "APP_KEY_PATTERN/APP_KEY_MAX/NAME_MAX/ORIGINS_MAX equal AppCreate, and the built permission key pattern equals PermissionCreate.key.pattern in openapi.json" (`?raw` import, as `registry.test.ts`) | Drift guard |
| › "appsSearchSchema keeps page/pageSize and drops filter/join_policy" | ADR 0005 |
| › "the apps feature imports no mock store" (`import.meta.glob('../**/*.{ts,tsx}', {query:'?raw'})`; no file other than `access-store.ts`/`mock-data.ts`/`schema.ts` imports `access-store`, `mock-data` or `./schema`/`../data/schema`) | AC1, R1 |
| `apps/data/errors.test.ts` › "appFormError: 409 conflict, details null, create → key; 409 origin_taken → origins; 409 conflict on edit of 'admin' → admin rule alert; other edit 409 → changed-meanwhile alert" | 409 |
| › "…: 422 unprocessable apex_not_allowed / too_many_origins / loopback_not_allowed → origins; role_has_org_permissions / org_mode_required → org_mode; unknown reason → alert" | 422 |
| › "…: 422 validation_error maps body.key/name/join_policy/org_mode/origins(.n); unmapped → alert" | 422 |
| › "…: 403 permission_denied and admin_wildcard_required → forbidden alert; 404 → 'This app no longer exists.'; other ApiError → message ≤ 200; non-ApiError → generic" | R4 |
| › "appStatusError: 409 on 'admin' → 'The admin app must stay active.'; other 409; 403; 404; other" | Status |
| › "permissionFormError: 409 → action field 'A permission with this key already exists.'; 422 validation body.key → action, body.description → description; 422 unprocessable (prefix_mismatch / admin_app_permission_must_be_admin / reserved_scope) → alert; 403; 404" | Add |
| › "permissionAdminError: 409 role_has_assignments → revoke-first text; 409 conflict → 'default or org owner role holds it' text; 422 wildcard_must_be_admin / admin_app_permission_must_be_admin → 'always admin only'; 403; 404 'This permission no longer exists.'" | Toggle |
| `apps-table.test.tsx` › "loading: a never-resolving fetch shows 'Loading apps…' and aria-busy" | AC3 |
| › "sends limit/offset only and renders rows (key, name, status badge text, join policy, org mode, origin count)" | AC1 |
| › "empty: 'No apps registered yet.'" | AC3 |
| › "error shows an alert and Retry refetches" | AC3 |
| › "403 shows the page ForbiddenPanel and no table" / "403 on refetch replaces stale rows" | AC3, R4 |
| › "next page sends offset=10 and writes page=2 to the URL" / "clamps to page 1 when the page comes back empty" (asserts `"page":1`) | ADR 0005 |
| › "no search box, facets or sort buttons" / "no Members column" | AC1, R1 |
| › "live region announces '{total} apps, page 1 of n'" | R10 |
| › "read-only (admin:apps:read): Register app disabled with 'Requires admin:apps:write', no row menu, View present; write: menu with Edit and Disable/Enable" | R4 |
| › "the Disable menu item has no text-red-500 class" | PAN-014 a11y |
| `app-form-dialog.test.tsx` › "client validation (key pattern/length, name, origins ≤ 20 and duplicates); no request sent" | Form |
| › "register sends POST {key,name,join_policy,org_mode,origins}, closes, toasts, refetches the list" | AC1 |
| › "409 key taken sets the error on Key, focuses it, keeps values; 409 origin_taken shows the origins error linked to the fieldset" | 409 |
| › "422 validation_error on origins shows the API message on the origins fieldset" | 422 |
| › "pending: 'Registering…', aria-disabled, sr-only status, Escape does not close; a double click sends one POST (sync guard)" | R9, R10, PAN-014 lesson |
| › "edit: prefilled; key readOnly + aria-readonly; sends PATCH with changed fields only; no change → closes without a request" | AC1 |
| › "edit org_mode: 422 role_has_org_permissions shown on Org mode" | ADR-0015 |
| › "admin app: shows the admin:* note; controls stay enabled; 403 admin_wildcard_required shows the inline panel; 409 shows the admin-app rule" | Owner |
| › "edit 404 shows 'This app no longer exists.' and refetches" / "reopening after a failure shows no stale error" | Concurrency, reset |
| `app-status-dialog.test.tsx` › "disable: names the app and key, sends PATCH {status:'disabled'} only after confirm; cancel sends nothing" | AC2, R9 |
| › "enable: offered for disabled apps; sends PATCH {status:'active'}" | AC2 |
| › "pending: dialog open, buttons aria-disabled, 'Disabling…'; the badge changes only after the refetch; a double click sends one PATCH" | R9 |
| › "403 / 404 / 409 shown inline and linked via aria-describedby; dialog stays open" | R4, R10 |
| › "admin app: note shown; 409 shows the admin-app rule inline" | Owner |
| › "after success focus returns to the row's actions button (not body)" | PAN-014 lesson |
| `app-detail-sheet.test.tsx` › "fetches GET /apps/{key} when opened; shows the list row while loading; then the fetched values" | AC1 |
| › "Overview: key, name, status, join policy, org mode, default role id or 'None', origins as a plain list (no links), created/updated as <time>; no Members" | R1, R6 |
| › "404 → 'This app no longer exists.'; 403 → inline ForbiddenPanel; error → Retry" | AC3 |
| › "tabs are Overview and Permissions only" | R1 (no Roles tab) |
| `app-permissions-tab.test.tsx` › "fetches permissions only when the tab is opened" | Lazy fetch |
| › "loading / empty 'No permissions yet.' / error + Retry / 403 inline" | AC3 |
| › "rows show key, description or 'No description', scope label, admin-only switch with name 'Admin only: {key}'" | AC1 |
| › "more than 50: 'Showing 1–50 of 120'; Next sends offset=50; Previous goes back" | §6 paging |
| › "add: dialog builds '{app}:{resource}:{action}', sends POST {key, description, is_admin}; '' description omitted; closes, toasts, refetches; focus returns to Add permission" | AC1, PAN-014 lesson |
| › "add: 409 → Action field error; 403 admin_wildcard_required inline; pending aria-disabled; double click one POST" | Errors |
| › "admin app: is_admin checked and disabled with the reason; note shown" | Owner, API rule mirror |
| › "toggle opens a confirm naming the key; cancel sends nothing; confirm sends PATCH {is_admin:true}; the switch flips only after the refetch; focus returns to the switch" | AC2, R9 |
| › "toggle: 409 conflict (default role holds it) and 409 role_has_assignments shown inline; dialog stays open" | Error mapping |
| › "'{app}:*' and admin-app permissions: switch checked and disabled with 'Always admin only'" | API rule mirror |
| › "read-only (no admin:roles:manage): Add permission disabled with reason; switches disabled" | R4 |
| `e2e/pages.e2e.ts` › "apps: list from the API; detail sheet and permissions pass axe; disable dialog cancels without writes" | E2E, axe |

## Approach

### 1. Order of work
1. Data layer: `app-schema.ts`, `errors.ts`, `queries.ts` and their unit tests.
2. Provider, table, columns, row actions, route.
3. Dialogs.
4. Sheet and permissions.
5. Test fixtures and component tests.
6. e2e.
7. Run all six checks.

Leave the Roles feature compiling, untouched, on its mock store.

### 2. Queries (`api/queries.ts`, R2/R9)
- **Types.** `AppsListParams = { limit: number; offset: number }`. Bodies are `components['schemas']['AppCreate' | 'AppUpdate' | 'PermissionCreate' | 'PermissionUpdate']`.
- **Keys.**
  - `appsKeys.all = ['apps']`
  - `lists() = [...all,'list']`
  - `list(p) = [...lists(), {limit, offset}]`
  - `detail(key) = [...all,'detail',key]`
  - `permissions(key, p) = [...detail(key),'permissions',{limit, offset}]`
- **`toAppsListParams({ pagination })`** returns `toPageParams(pagination)` only. This is the documented place to add `status`/`join_policy`/`q`/`sort` when the API ships them.
- **Query options.** All take an `api = getApi()` argument, with the eslint-disable comment for the injected client, as in organizations.
  - `appsListQueryOptions(params, api)` uses `keepPreviousData`.
  - `appQueryOptions(key, api)`.
  - `appPermissionsQueryOptions(key, p, api)` uses `keepPreviousData`.
  - `PERMISSIONS_PAGE_SIZE = 50` is exported.
- **App mutations.** `useCreateAppMutation(api)` sends POST `AppCreate`. `useUpdateAppMutation(api)` takes `{ key, body: AppUpdate }` and sends PATCH. Both use the PAN-014 options helper: `meta:{handlesOwnErrors:true}`, `onSuccess` invalidates `appsKeys.all`, and `onError` invalidates on 404/409. Never optimistic.
- **Permission mutations.** `useCreatePermissionMutation(api)` takes `{ appKey, body }`; `useUpdatePermissionMutation(api)` takes `{ appKey, permissionId, body }`.
  - The same meta applies.
  - The invalidation target is `appsKeys.detail(appKey)`, which also refreshes the permissions pages.
  - When `appKey === 'admin'`, also invalidate `mePermissionsKeys.all` (from `@/lib/permissions/me-permissions`), on success only.

### 3. `data/app-schema.ts`
- **Generated aliases.**
  - `App = AppRead`, `AppStatus`, `JoinPolicy`, `OrgMode`
  - `Permission = PermissionRead`, `PermissionScope`
- **Constants and their source.**

  | Constant | Value | Source |
  |---|---|---|
  | `APP_KEY_PATTERN` | `/^[a-z][a-z0-9-]{1,31}$/` | `AppCreate.key` |
  | `APP_KEY_MAX` | 32 | `AppCreate.key` |
  | `NAME_MAX` | 255 | `AppCreate.name` |
  | `ORIGINS_MAX` | 20 | `origins.py` |
  | `ORIGIN_MAX` | 255 | `origins.py` |
  | `PERMISSION_SEGMENT_PATTERN` | `/^[a-z][a-z0-9-]{0,47}$/` | permission key pattern |
  | `DESCRIPTION_MAX` | 500 | `PermissionCreate.description` |

  Also export `ADMIN_APP_KEY = 'admin'`.
- **`appFormSchema`** (zod):
  - `key`: `.trim().min(1,'Key is required.').max(32,…).regex(APP_KEY_PATTERN,'Use 2–32 lowercase letters, digits and hyphens, starting with a letter.')`
  - `name`: `.trim().min(1).max(255)`
  - `join_policy`: `z.enum(['open','approval','closed'])`
  - `org_mode`: `z.enum(['none','required'])`
  - `origins`: `z.array(z.object({ value: z.string().trim().min(1,'Enter an origin.').max(255) })).max(20,'Use at most 20 origins.')`, plus a `superRefine` that flags duplicates (compare lowercased values without a trailing `/`) on the later entry.
  - **No host or scheme rule.** The API owns the D19 rules and allows loopback http. Its 422 is shown on the fieldset.
- **`permissionFormSchema`:** `resource` and `action` (each `.trim().min(1).regex(PERMISSION_SEGMENT_PATTERN, …)`), `description` (`.trim().max(500)`, optional), `is_admin: z.boolean()`.
- **`appsSearchSchema`** = `{ page, pageSize }` only, as `organizationsSearchSchema`.

### 4. Error mappers (`data/errors.ts`, by status, code and `details[].reason`; ADR 0004)
**Shared helper.** Same shape as `organizations/data/errors.ts`: a result of `{ fields, alert }`, with alert `{kind:'forbidden',copy} | {kind:'message',text}`, and a `fallback`:
- forbidden → `forbiddenCopy`, which already covers `admin_wildcard_required` ("Only super admins can do this… admin:*");
- 404 → "This app no longer exists.";
- other `ApiError` → `message.slice(0,200)`;
- anything else → "Something went wrong."

Read `details` defensively: it must be an array of objects with a string `field`/`reason`.

**`appFormError(error, { mode, appKey })`.** Fields are `key | name | join_policy | org_mode | origins`. The first matching rule wins.

| Condition | Result |
|---|---|
| 409, `details[0].reason === 'origin_taken'` | `origins`: "One of these origins is already registered to another app." |
| 409 `conflict`, `mode==='create'` | `key`: "An app with this key already exists." (fixed text; never the server text) |
| 409, `appKey==='admin'` | alert: "The admin app must stay active, closed, with org mode None and no default role." |
| 409, otherwise | alert: "This app was changed by someone else. Close the dialog and try again." |
| 422 `unprocessable`, reason `apex_not_allowed` | `origins`: "The admin app can't use https://mmlabs.online." |
| 422 `unprocessable`, reason `too_many_origins` | `origins`: "The admin app can have at most 2 origins." |
| 422 `unprocessable`, reason `loopback_not_allowed` | `origins`: "The admin app can't use localhost origins in this environment." |
| 422 `unprocessable`, reason `role_has_org_permissions` | `org_mode`: "The default role holds org-scoped permissions, so org mode can't be Required." |
| 422 `unprocessable`, reason `org_mode_required` | `org_mode`: "This app has an org owner role, so org mode must stay Required." |
| 422 `unprocessable`, other reason | alert: "The API rejected these values." |
| 422 `validation_error` | Map `loc[0]==='body'` and `loc[1]` in the five fields (`origins` also when `loc` has an index) → `msg.slice(0,200)`. If none map, use the alert above. |
| anything else | `fallback` |

**`appStatusError(error, appKey)`:**
- 409 → "The admin app must stay active." for `admin`, else the changed-meanwhile text;
- otherwise `fallback`.

**`permissionFormError(error)`.** Fields are `resource | action | description`.
- 409 → `action`: "A permission with this key already exists."
- 422 `validation_error`: `body.key` → `action`; `body.description` → `description`.
- 422 `unprocessable` → alert. Reasons:
  - `prefix_mismatch` → "The key must start with the app key.";
  - `admin_app_permission_must_be_admin` / `wildcard_must_be_admin` → "This permission must be admin only.";
  - `reserved_scope` → "This key has a fixed scope.";
  - other → "The API rejected these values."
- 404 → "This app no longer exists."
- Otherwise `fallback`.

**`permissionAdminError(error)`:**
- 409 `role_has_assignments` → "A role that holds this permission has assignments. Revoke them first, then try again."
- 409 `conflict` → "The app's default role or org owner role holds this permission. Remove it from that role first."
- 422 → "This permission is always admin only."
- 404 → "This permission no longer exists."
- Otherwise `fallback`.

### 5. Table (`apps-table.tsx`, ADR 0005; template `organizations-table.tsx`)
Copy the organizations table structure:
- `useTableUrlState` with `globalFilter: { enabled: false }`;
- `useQuery(appsListQueryOptions(toAppsListParams({pagination}), api))` and `queryView`;
- table options `manualPagination`, `manualFiltering`, `enableSorting:false`, `enableRowSelection:false`, `rowCount`;
- `getRowId: row => row.key`;
- the page clamp only when `isSuccess && !isPlaceholderData`;
- a page `ForbiddenPanel`;
- no toolbar.

Live region and markup:
- **Live region.** A persistent sr-only `role=status`: "Loading apps…", then "{total} apps, page n of m", or "No apps registered yet."
- **Rows.** The error row has `role=alert` and Retry. The table has `aria-label='Apps'` and `aria-busy` only while pending. The wrapper is `overflow-x-auto`.

### 6. Register/edit dialog (`app-form-dialog.tsx`)
**Form.** react-hook-form with `zodResolver(appFormSchema)`. Mutations come from `useApps().api`.
- **Defaults.**
  - Create: `{key:'', name:'', join_policy:'approval', org_mode:'none', origins:[]}`. The mock's choice is kept and always sent explicitly.
  - Edit: the values from `currentRow`.
- **Key field.** On edit it is `readOnly` + `aria-readonly`, not disabled, with the text "The key cannot be changed." On create it says "Lowercase; used as the permission prefix and the X-MM-App value. Cannot be changed later."

**Submit.**
- **Guard.** A synchronous `const inFlight = useRef(false)` is checked first; the handler returns if it is set (PAN-014 lesson). It is reset in `finally`.
- **Create** sends `{key, name, join_policy, org_mode, origins: values.map(o => o.value.trim())}`.
- **Edit** builds a body of **changed fields only** (`name`, `join_policy`, `org_mode`, `origins` compared in order against `currentRow`).
  - If the body is empty, close without a request.
  - This keeps admin-app no-ops free of `admin:*` and avoids empty audit noise.
- **Success.** Toast "App {key} registered." / "App {key} updated.", reset the form and the mutations, then close.
- **Failure.**
  - Apply `appFormError`. The first field error uses `shouldFocus`. For `origins`, call `form.setError('origins', …)` and then `form.setFocus('origins.0.value')` if any input exists.
  - The alert renders as `ForbiddenPanel variant='inline'` or `<p role='alert'>`.

**Origins fieldset.**
- `<fieldset aria-describedby={originsErrorId when an error exists}>` with a `<legend>`. The help text is "Browser origins allowed to call the API for this app (CORS): https://mmlabs.online or its subdomains, or http(s)://localhost for development."
- The array/root error renders in `<p id={originsErrorId} role='alert'>`. Per-entry errors use `FormMessage`.
- "Add origin" appends `''`. "Remove origin n" uses an `aria-label`.

**Org mode on edit.** The description reads "Changing org mode does not reclassify existing permissions." This is from ADR-0015 Consequences, so it is accurate.

**Admin app** (`currentRow?.key === 'admin'`). Show a static note above the footer (`<p>`, not an alert): "Changes to the admin app need the admin:* permission. It must stay active, closed, with org mode None, at most 2 origins and no localhost. Removing this console's own origin locks everyone out of it." The controls stay enabled.

**Pending.**
- The submit button gets `aria-disabled` plus the early return, with the label "Registering…" / "Saving…".
- An sr-only `role=status` announces the pending state.
- `Dialog onOpenChange` ignores close while pending. Any other close resets the form, the mutations and the alert.

### 7. Status dialog (`app-status-dialog.tsx`)
- `ConfirmDialog` with `handleConfirm` and **no `form=`**. Props: `isLoading`, `pendingText` ("Disabling…" / "Enabling…"), `error` (from `appStatusError`), and `destructive` when disabling.
- **`handleConfirm`.** It has its own `useRef` in-flight guard, then calls `update.mutate({key, body:{status}})`. On success: close, then toast "App {key} disabled." / "App {key} enabled."
- **`handleOpenChange`.** It blocks close while pending and resets on close, as `organizations-status-dialog.tsx` does.
- **Copy** (R1: claims nothing the API does not do):
  - **Disable.** "Disable **{name}** ({key})? Users can't sign in to it, join it or get new tokens for it, and its browser origins stop being allowed, until it is enabled again. Tokens already issued keep working until they expire."
  - **Enable.** "Enable **{name}** ({key})? Users can sign in to it and get tokens for it again."
  - **Admin app.** Append "The admin app must stay active; the API refuses to disable it."
- **Focus.** After a successful close, focus must land on the row's "Actions for {key}" trigger. The row stays: the list is unfiltered, ordered by key, and `getRowId` is the key. Radix normally restores focus there.
  - The test asserts `document.activeElement` is that button.
  - If Radix restores to `<body>` because the menu item unmounted, the dialogs component focuses it explicitly: in the close handler, use `requestAnimationFrame` and `document.querySelector` on the trigger by `aria-label`, falling back to the "Register app" button.
- This ticket has **no row-removing action** (no delete). The PAN-014 "focus after the row disappears" fallback is the "Register app" button above.

### 8. Detail sheet (`app-detail-sheet.tsx`)
**Query.** `useQuery({...appQueryOptions(currentRow.key, api), placeholderData: currentRow, enabled: open})` with `queryView`. `const app = q.data ?? currentRow`.
- `forbidden` → inline `ForbiddenPanel`.
- `error` → `role=alert`: "This app no longer exists." for a 404, else "Couldn't load this app." with Retry.

**Tabs.** Controlled `value` state, with **Overview** and **Permissions** only.

**Roles tab, until PAN-015b.**
- **Removed.** The API has no staff role list with ids. The public catalog has no ids, answers 404 for the `admin` and disabled apps, and is rate-limited.
- **No catalog scrape, no mock roles (R1).**
- The Overview shows what the API returns about roles: `default_role_id` and, for `org_mode='required'`, `org_owner_role_id`. Each is a `<code>` id or "None", with the help text "Role names and the role list arrive with role management."

**Overview.**
- A `<dl>` with Key, Name, Status badge, Join policy, Org mode, Default role (id/None), Org owner role (only when org mode is Required), Created and Updated (`<time dateTime={iso}>{formatDate(iso)}</time>`). **No Members.**
- **Origins** section: a `<ul>` of plain text (never links, R6), or "No origins registered."
- **Admin app:** the same `admin:*` note as the form, read-only wording.

### 9. Permissions tab
**9.1 List.** `useQuery({...appPermissionsQueryOptions(app.key, {limit:50, offset}, api), enabled: open && tab === 'permissions'})`, where `offset` is local state reset when the app changes.
- **States.**
  - Loading: `<p role=status>` "Loading permissions…".
  - Error: `role=alert` with Retry.
  - 403: inline panel.
  - Empty: "No permissions yet."
- **Table.** Semantic `<table>` with `<th scope=col>` Key, Description ("No description" muted when null), Scope ("App"/"Org" via `permissionScopeLabels`), Admin only. The wrapper is `overflow-x-auto`.
- **Pager** (only when `total > 50`):
  - "Showing a–b of n" in a polite status;
  - Previous/Next buttons, disabled at the ends (native `disabled` is fine here; not a pending state).
- **Header text.**
  - "Admin-only permissions can't be held by the app's default role."
  - Admin app: "Admin app permissions are always admin only; changing them needs admin:*."
  - Org mode Required: "New permissions are org-scoped unless their key is reserved (ADR-0015)."

**9.2 Add trigger.** `<Can action='apps.createPermission' disable>` around the "Add permission" button. It opens `AppPermissionFormDialog` (a nested Radix `Dialog`, so focus returns to the trigger on close).

**9.3 `app-permission-form-dialog.tsx`.**
- **Fields.** Resource, Action, the read-only key preview "Key: {app}:{resource}:{action}", Description (optional), and an "Admin only" checkbox.
- **Admin app.** The checkbox is forced checked and disabled. Its description reads "Admin app permissions are always admin only."
- **Checkbox hint.** "Admin-only permissions need admin:* to create."
- **Body.** `{key, is_admin, ...(description ? {description} : {})}`. Never send `scope`: the API default applies, and choosing it is a follow-up.
- **Mechanics.** The same as §6: `useRef` in-flight guard, pending `aria-disabled` and "Adding…", sr-only status, close blocked while pending, reset on close.
- **Errors.** `permissionFormError` → `setError` with `shouldFocus`, plus an inline alert or `ForbiddenPanel`.
- **Success.** Toast "Permission {key} added." and close.

**9.4 Admin-only switch and `app-permission-admin-dialog.tsx`.**
- **Switch.** It is wrapped in `<Can action='apps.updatePermission' disable>`, with `aria-label="Admin only: {key}"`. `checked` is always the API value (no optimistic flip). `onCheckedChange` opens the confirm for that permission.
- **Locked rows.** For `{app}:*` and for admin-app permissions the switch is checked and disabled, with `aria-describedby` pointing at "Always admin only". This mirrors the API's 422 (R4 mirror; the API still decides).
- **Confirm dialog.** `ConfirmDialog` with `handleConfirm` (no `form=`), a `useRef` guard, `isLoading`, `pendingText` "Saving…" and `error` from `permissionAdminError`.
  - **Make admin only** (destructive). Title "Make {key} admin only?" Description: "Admin-only permissions can't be held by the app's default role. The API refuses if the default or org owner role holds {key}, or if a role holding it has assignments. This needs admin:*."
  - **Allow for members.** Title "Allow {key} for members?" Description: "{key} can then be added to member roles. No role gets it automatically. This needs admin:*."
  - **Success.** Toast, then close; focus returns to the switch (Radix).
- These descriptions replace the mock copy, which claimed the default role is updated automatically. The API never does that (D9).

### 10. E2E
**`fake-api.ts` fixtures.**
- `APPS` with fixed UUIDs, all `default_role_id: null` except stoktok:
  - `admin` "Admin console" (active, closed, none, `['https://admin-portal.mmlabs.online']`);
  - `calechip` "Calechip" (active, open, required);
  - `stoktok` "Stoktok" (active, approval, none, two origins).
- `PERMISSIONS` by key: two for stoktok (one admin), one for admin (`admin:*`), and none for calechip.

**`fake-api.ts` handlers.**
- `'GET /api/v1/apps'` returns `page(APPS, query)`.
- A loop adds `GET /api/v1/apps/${key}` and `GET /api/v1/apps/${key}/permissions` for each app.

**New test in `pages.e2e.ts`.**
1. `signIn('/apps')`, check the heading, then expect 4 rows.
2. Click "View stoktok". The sheet is visible; switch to the Permissions tab and wait for the key `stoktok:…`. Run `expectNoSeriousA11y(page, 'apps-sheet')`, then press Escape.
3. Open "Actions for stoktok", then "Disable". The alertdialog contains `stoktok`. Run `expectNoSeriousA11y(page, 'apps-disable-dialog')`, then Cancel.
4. Expect no POST/PATCH/DELETE in `api.calls` under `/api/v1/apps`.

Add no `a11y-known-issues` entries.

### Rules
- **R1:** no client-side filter, search or sort; no Members; no roles from the catalog or mock; copy matches the API's behaviour (disable effect, no automatic default-role grants).
- **R2:** generated types; HTTP only through `src/api`.
- **R4:** `<Can>` keys `apps.view`, `apps.register`, `apps.update`, `apps.createPermission`, `apps.updatePermission`, and the route `admin:apps:read`. A 403 is handled in the list, the sheet, the tab and every dialog. `admin:*` is never mirrored as a gate (owner).
- **R5:** the URL holds only page and pageSize.
- **R6:** origins and descriptions render as text.
- **R7:** no credentials, no delete app/permission, no scope editing, no default-role picker.
- **R8:** all six checks.
- **R9:** confirmations name the target; nothing is optimistic; errors are inline; invalidation after success and after 404/409.
- **R10:** §5–§9 (aria-disabled pending, linked errors, live regions, focus return, contrast-safe destructive item).

## Specialist input used
- **api-platform-engineer** (2026-11-16/17, API at a417ddb). Adopted:
  - the action→endpoint table and permissions;
  - the error-code table, including the correction that role DELETE is generic `conflict`;
  - the origins rules ("do not duplicate host rules"), which is why `isHttpsOrigin` is removed;
  - the key regexes and caps;
  - cache keys and invalidation;
  - dropping filters and Members;
  - rewriting the misleading admin-only copy (D9);
  - the follow-ups.

  Outdated:
  - (a) "List order is unspecified" is wrong at 33db316: apps and permissions are ordered by `key`. Tests may assert order, but only of what the fake returns.
  - (b) `PermissionRead` now has a required `scope`, and `AppRead`/`AppUpdate` have `org_owner_role_id` (ADR-0015). Both are shown read-only, and the new 422 reasons are mapped.
  - (c) The snapshot drift notes no longer apply: the snapshot was regenerated at 33db316.
  - (d) The roles, assignments and owner questions are answered by the split and the unblock.
  - (e) "Branch only on `details[0].reason`" is adopted, plus the create-vs-edit context for the 409 with `details: null`.
- **frontend-developer** (2026-11-16). Adopted:
  - sub-query detail with list-row placeholder;
  - lazy permissions fetch;
  - "x of y" paging instead of a silent cut;
  - `aria-readonly` key;
  - `aria-disabled` pending with reset on close;
  - a11y details (sr-only actions header, `overflow-x-auto`, unique row labels, badge text, `<time>`, origins `<ul>` without links);
  - the test list, minus roles.

  Outdated or rejected:
  - (a) The three-way split is superseded by the owner's 15/15b/15c split.
  - (b) Deleting `access-store`, `mock-data`, `schema.ts` and `data-table-view.tsx` is **not possible yet**: the Roles mock page (PAN-015b) still imports them. They are kept with a header comment.
  - (c) Delete app is not added (not in the goal; R7).
  - (d) The snapshot is not hand-patched (already regenerated).
- **identity-access-engineer** (2026-11-16). Adopted:
  - admin-app rules and the `admin:*` note with controls enabled;
  - no client predicates beyond the key regexes and the forced `is_admin` for `{app}:*` and admin-app permissions;
  - mapping by code with fixed copy;
  - invalidating `['me','permissions']` after admin-app permission writes (PAN-011b has since landed, so this is live, not a no-op).

  Partly adopted:
  - "Never show the server message" is followed for every mapped case. Unmapped `ApiError`s fall back to `message.slice(0,200)`, as in PAN-014, where the reviewer accepted it.

  Outdated:
  - F1/F2 (role list, holders) moved to PAN-015b/c.
  - Rec. 10 (PAN-011b order) is moot: it landed.
- **PAN-014 review/a11y lessons** (orchestrator brief):
  - `useRef` submit guards;
  - `text-red-700 dark:text-red-400` instead of `text-red-500`;
  - focus to a stable element;
  - no `ConfirmDialog form=` is used. If the implementer introduces one, its `onSubmit` must return while pending.

## Assumptions
- **Copy.** UI copy is English (spec §8 Q3 open).
- **Defaults.**
  - The default page size is 10 for apps and 50 for the permissions tab. Both are ≤ 100.
  - The register form defaults to `join_policy: 'approval'` (the mock's choice) and always sends it.
- **Edit sends changed fields only.** A no-op edit closes without a request.
- **Delete is excluded.** `DELETE /apps/{key}` and `DELETE /permissions/{id}` exist but are not in the ticket goal (R7).
- **Description is add-only.** Permission description is set on add only; editing it is a follow-up.
- **Admin-only copy.** Showing "needs admin:*" on the admin-only toggle is accurate for every `is_admin` change (`service.py:898-903`).
- **No hand patch.** The OpenAPI snapshot lacks 404/409 response entries for some routes. That is harmless, because `unwrap` reads the envelope at runtime.
- **Roles page still on mock data.** The Roles page keeps showing mock apps until PAN-015b. This is acceptable in the mock phase, and the two screens share no state.

## Blocking questions
None.

## Split proposal
- **Size.** This is about 1,500 changed lines excluding tests and deletions, well over ~400. It is one spec feature (§5.4 apps + permissions) and mostly a rewrite of existing mock files. This matches PAN-013, PAN-014 and PAN-016, and the owner already split roles (15b) and assignments (15c) off this ticket.
- **Why permissions are not split off.**
  - The detail sheet's Permissions tab reads the mock store by mock `app.id`, which never matches real apps. Shipping the API apps list without the tab would leave the tab either empty-wrong or removed.
  - The orchestrator's brief also scopes the permission writes, including the `['me','permissions']` invalidation, into this ticket.
- **Slice (this plan):** everything above.
- **Fallback if a rework runs long.** The add-permission dialog and the admin-only toggle (§9.2–9.4) can move to a new ticket, keeping the list read-only. The orchestrator decides that only after a REWORK, not now.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/apps` (`?page`, `?pageSize`) | `admin:apps:read` (route registry) | Loading row and live region; "No apps registered yet."; alert with Retry; page `ForbiddenPanel` (also on refetch); paged table | Register app → `POST /apps` (`apps.register`); View → sheet (`apps.view`) | `['apps']` |
| Register/edit dialog | `admin:apps:write` (+ `admin:*` for `admin`, decided by the API) | Pending (aria-disabled, close blocked); field errors (zod, 409 key/origins, 422 fields/origins/org_mode); inline 403/404/409 admin rule; admin-app note | Edit → `PATCH /apps/{key}` with changed fields (`apps.update`) | `['apps']` (success, 404, 409) |
| Enable/disable confirm | `admin:apps:write` | Pending; inline 403/404/409; admin-app note | `PATCH /apps/{key} {status}` (`apps.update`) | `['apps']` |
| Detail sheet: Overview | `admin:apps:read` | List row while loading; 404 text; inline 403; error + Retry | — | — |
| Detail sheet: Permissions tab | `admin:apps:read` | Loading status; "No permissions yet."; error + Retry; inline 403; pager > 50 | Add permission → `POST /apps/{key}/permissions` (`apps.createPermission`); admin-only switch → confirm → `PATCH /apps/{key}/permissions/{id} {is_admin}` (`apps.updatePermission`) | `['apps','detail',key]`; plus `['me','permissions']` when key = `admin` |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/apps` | `limit`, `offset` only | `Page_AppRead_` | 401 (auth layer), 403 `permission_denied`, 5xx/network | USR-02 |
| GET | `/api/v1/apps/{key}` | — | `AppRead` | 404, 403, other | USR-02 |
| POST | `/api/v1/apps` | `AppCreate {key, name, join_policy, org_mode, origins}` | `AppRead` (201) | 409 `conflict` (key; `origin_taken`); 422 `validation_error`; 403; other | USR-02 |
| PATCH | `/api/v1/apps/{key}` | `AppUpdate`, changed subset of `{name, join_policy, org_mode, origins}` or `{status}` | `AppRead` | 403 `admin_wildcard_required`/`permission_denied`; 409 admin invariant / `origin_taken` / concurrent; 422 `unprocessable` (`apex_not_allowed`, `too_many_origins`, `loopback_not_allowed`, `role_has_org_permissions`, `org_mode_required`) / `validation_error`; 404 | USR-02, ADM-002b/c, ADR-0015 |
| GET | `/api/v1/apps/{key}/permissions` | `limit=50`, `offset` | `Page_PermissionRead_` | 404, 403, other | USR-02 |
| POST | `/api/v1/apps/{key}/permissions` | `PermissionCreate {key, description?, is_admin}` (no `scope`) | `PermissionRead` (201) | 409 `conflict`; 422 `prefix_mismatch`/`admin_app_permission_must_be_admin`/`wildcard_must_be_admin`/`reserved_scope`/`validation_error`; 403 `admin_wildcard_required`; 404 | USR-02, ADM-002b, ADR-0015 |
| PATCH | `/api/v1/apps/{key}/permissions/{permission_id}` | `PermissionUpdate {is_admin}` | `PermissionRead` | 409 `conflict` (default/owner role holds it), 409 `role_has_assignments`; 422 `wildcard_must_be_admin`/`admin_app_permission_must_be_admin`; 403 `admin_wildcard_required`; 404 | USR-02, USR-02d, ADM-002b |

Not used: `/apps/{key}/credentials*` (PAN-027), `DELETE /apps/{key}`, `DELETE …/permissions/{id}`, roles endpoints (PAN-015b), assignments (PAN-015c), the public catalog `GET /apps/{key}/roles`.

## Follow-ups (record in ticket / backlog; not in this diff)
1. **org-admin-api, apps list.** `status`, `join_policy`, `q`, `sort` on `GET /api/v1/apps`. Keep `org-admin-api-request.md` open. Declare the `_with_409` and 404 responses and the error envelope in OpenAPI. Add a reason code for "key taken" (409 `details: null` today).
2. **org-admin-api ADM-016.** `member_count` on the apps list and detail. Then restore the Members column and Overview row.
3. **PAN-015b.** Staff role list (request in `org-admin-api-request.md`). Then the Roles tab or page, default role / org owner role pickers (`PATCH default_role_id`/`org_owner_role_id`), role names instead of ids in the Overview, and deleting the mock store (`access-store`, `mock-data`, `schema.ts`, `data-table-view.tsx`).
4. **admin-pan, not in this goal (the API supports these).**
   - Permission scope edit (ADR-0015: org→app needs `admin:*`; app→org is refused while the default role holds it).
   - Permission description edit.
   - Permission delete (409 while held).
   - App delete (409 for `admin` or when assignments exist; "disable it instead").
5. **admin-pan a11y.** `organizations/components/data-table-row-actions.tsx` still uses `text-red-500!` on Delete (PAN-014 a11y 🟡1). Audit users and roles menus too.
6. **PAN-027.** App credentials on the apps detail sheet.
