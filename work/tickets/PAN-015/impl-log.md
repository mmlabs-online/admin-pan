## Attempt 1 — 2026-11-17

### Files touched
| File | Required because |
|---|---|
| `src/features/apps/api/queries.ts` (new) | Keys, list/detail/permissions query options, app and permission mutations (plan §2) |
| `src/features/apps/api/queries.test.tsx` (new) | Unit tests for the above |
| `src/features/apps/data/app-schema.ts` (new) | Generated type aliases, limits, zod form schemas, `appsSearchSchema` (§3) |
| `src/features/apps/data/app-schema.test.ts` (new) | Boundaries, drift against `openapi.json`, search schema, "imports no mock store" guard |
| `src/features/apps/data/errors.ts` (new) + `errors.test.ts` (new) | `appFormError`, `appStatusError`, `permissionFormError`, `permissionAdminError` (§4) |
| `src/features/apps/data/data.ts` | Types from `app-schema.ts`; added `permissionScopeLabels` and `ADMIN_APP_NOTE`; removed `isHttpsOrigin` |
| `src/features/apps/data/schema.ts`, `access-store.ts` | Header comments only (kept for the Roles mock page) |
| `src/features/apps/components/apps-provider.tsx` | `api` + `currentRow` snapshot context |
| `src/features/apps/components/apps-dialogs.tsx` | Explicit close handlers; focus return to the opener (see Deviations) |
| `src/features/apps/components/apps-table.tsx`, `apps-columns.tsx`, `apps-row-actions.tsx`, `app-status-badge.tsx` | Server-side paging table on the real API; no Members column, no filters or sorting; a11y fixes |
| `src/features/apps/components/app-form-dialog.tsx` | Register/edit on the create/update mutations |
| `src/features/apps/components/app-status-dialog.tsx` | Enable/disable on the update mutation with `ConfirmDialog` pending/error |
| `src/features/apps/components/app-detail-sheet.tsx` | Detail sub-query, Overview, Permissions tab only |
| `src/features/apps/components/app-permissions-tab.tsx` | Paged permissions list, add trigger, admin-only switch |
| `src/features/apps/components/app-permission-form-dialog.tsx` (new), `app-permission-admin-dialog.tsx` (new) | Add-permission dialog and admin-only confirm (§9.3, §9.4) |
| `src/features/apps/components/app-roles-tab.tsx` | Deleted: it read mock roles; no staff role list in the API |
| `src/features/apps/apps.test.tsx` | Deleted: asserted mock behaviour |
| `src/features/apps/components/test-data.ts`, `test-fixtures.tsx` (new) | API-shaped fixtures; `renderApps`; `appsServer` fake handler |
| `src/features/apps/components/apps-table.test.tsx`, `app-form-dialog.test.tsx`, `app-status-dialog.test.tsx`, `app-detail-sheet.test.tsx`, `app-permissions-tab.test.tsx` | Component tests on `fakeApi` |
| `src/features/apps/index.tsx` | Subtitle; `RegisterAppButton` exported (test fixture) with `data-register-app` |
| `src/routes/_authenticated/apps/index.tsx` | `validateSearch: appsSearchSchema` (page/pageSize only) |
| `src/lib/permissions/registry.ts` | `apps.view` also names `GET /api/v1/apps/{key}/permissions` |
| `e2e/support/fake-api.ts`, `e2e/pages.e2e.ts` | Apps fixtures and handlers; new apps e2e test |

### Tests added / changed
- `queries.test.tsx` › keys, `toAppsListParams`, GET URLs, create/update bodies, invalidation on success and 404/409 (not 500), permission writes, `['me','permissions']` only for the admin app.
- `app-schema.test.ts` › app key, name, origins (duplicates, caps), permission segments, drift guard against `openapi.json`, `appsSearchSchema`, no mock-store import.
- `errors.test.ts` › every mapper in the plan (409, 422 reasons and `validation_error`, 403, 404, fallback).
- `apps-table.test.tsx` › loading, rows, empty, error + Retry, 403, 403 on refetch, paging, clamp, no search/facets/sort, no Members, live region, read-only vs write, no `text-red-500`.
- `app-form-dialog.test.tsx` › validation, register, 409 key / `origin_taken`, 422 origins, pending + double click (one POST), edit changed-fields-only and no-op, org mode 422, admin app note and 403/409, 404, no stale error, focus returns to Register app.
- `app-status-dialog.test.tsx` › disable/cancel, enable, pending + double click + badge only after refetch, 403/404/409 inline and linked, admin app, focus returns to the row's actions button.
- `app-detail-sheet.test.tsx` › fetch on open with list-row placeholder, Overview, org owner role, admin note, 404/403/error + Retry, tabs.
- `app-permissions-tab.test.tsx` › lazy fetch, loading/empty/error/403, rows, pager, add (body, focus return), add errors + double click, admin app, toggle confirm (cancel, confirm, flips after refetch, focus), toggle 409s, locked rows, read-only.
- `e2e/pages.e2e.ts` › "apps: list from the API; detail sheet and permissions pass axe; disable dialog cancels without writes".

### Checks (actual output summary)
- pnpm typecheck: pass (`tsc -b`, no output)
- pnpm lint: pass (`eslint .`, no output)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): Test Files 79 passed (79); Tests 579 passed (579). `src/features/apps` run 4 times in a row: 66/66 each time.
- pnpm build: pass (`✓ built in 2.53s`)
- pnpm e2e: 24 passed (54.3s), including the new apps test; no unmatched calls (`noStrayRequests`).
- `grep -rn msw src package.json`: nothing. `grep -rln "access-store\|mock-data" src/features/apps`: only `data/access-store.ts`, `data/schema.ts` and `app-schema.test.ts` (the guard's own text).

### Out-of-plan files
None. Everything touched is in the plan's list. Not committed (per the orchestrator's instruction).

### Deviations from the plan (all inside planned files)
- **Permission mutation hooks** take the app key as their first argument (`useCreatePermissionMutation(appKey, api)`, `useUpdatePermissionMutation(appKey, api)`), not in the variables, so the invalidation scope is known when the options are built. Bodies and endpoints are as planned.
- **Focus return.** The plan assumed Radix returns focus to the opener. It does not: Radix `Dialog` focuses only a `DialogTrigger`, and these dialogs are opened by plain buttons or menu items that unmount. Without a fix focus lands on `<body>` (a flaky rAF-based first attempt was replaced). Final design:
  - `AppFormDialog` and `AppPermissionFormDialog` take a `returnFocus` prop, called from `onCloseAutoFocus` (deterministic).
  - The two `ConfirmDialog`s (status, admin-only toggle) have no such hook and the shared component is out of scope, so `apps-dialogs.tsx` and `app-permissions-tab.tsx` focus the opener from an effect after the dialog closes. The register dialog falls back to the Register app button (`data-register-app`).
- **Clamp test** asserts the search state becomes `{}` (page 1 is the default and leaves the URL), not `"page":1`.
- **`RegisterAppButton`** is exported from `src/features/apps/index.tsx` so `test-fixtures.tsx` can render it without the router shell.
- `data/data.ts` also exports `ADMIN_APP_NOTE`, shared by the form, sheet and status dialog.
- Tests under an open modal query the hidden sheet with `includeHidden: true` / `screen` locators (the modal hides the rest of the page from the a11y tree).

### Follow-ups (noticed, not done)
- org-admin-api: `status`, `join_policy`, `q`, `sort` on `GET /api/v1/apps` (request stays open in `org-admin-api-request.md`); declare 404/409 responses and the error envelope in OpenAPI; a reason code for "key taken" (409 `details: null` today).
- org-admin-api: ADM-016 `member_count` on apps list and detail, then restore the Members column and Overview row.
- PAN-015b: staff role list, role names instead of ids in the Overview, default role / org owner role pickers, then delete the mock store (`access-store`, `mock-data`, `schema.ts`, `data-table-view.tsx`).
- admin-pan, not in this goal (the API supports them): permission scope edit, permission description edit, permission delete, app delete.
- a11y: `organizations/components/data-table-row-actions.tsx` still uses `text-red-500!` on Delete (PAN-014 a11y); audit the users and roles menus too.
- Shared `ConfirmDialog` has no close-focus hook, so every caller opened from a menu item must restore focus by hand; consider an `onCloseAutoFocus` prop (PAN-014 owns the component).
- PAN-027: app credentials on the detail sheet.

### Scope self-check
- Could the diff be smaller? No: the plan is a rewrite of the mock-backed Apps feature; deletions (`apps.test.tsx`, `app-roles-tab.tsx`) and the removal of Members/filters already shrink it. Tests make up about half of the added lines.
- Diff size: about +3,760 / -650 lines including new files and tests (`git diff --stat` with new files intent-to-add; 33 files; working tree only, nothing staged or committed).
