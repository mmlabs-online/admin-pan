## Attempt 1 — 2026-11-17
Verdict: PASS

### Checks (run by reviewer)
- pnpm typecheck: pass (`tsc -b`, no errors)
- pnpm lint: pass (`eslint .`, no output)
- pnpm format:check: pass ("All matched files use Prettier code style!")
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): Test Files 79 passed (79), Tests 579 passed (579). Matches impl-log.
- pnpm build: pass (`✓ built in 1.59s`)
- pnpm e2e: 24 passed (57.7s), including `e2e/pages.e2e.ts:178` "apps: list from the API; detail sheet and permissions pass axe; disable dialog cancels without writes" and the sweep entry `apps: opens, does its safe action, passes axe`.
- Greps: `grep -rn msw src package.json` finds nothing. `grep -rln "access-store\|mock-data" src/features/apps` finds only `data/access-store.ts`, `data/schema.ts` and the guard test `data/app-schema.test.ts`. No `dangerouslySetInnerHTML`, `innerHTML` or `href=` in `src/features/apps`. No `fetch(` outside `src/api` (all HTTP goes through `api.GET/POST/PATCH` in `src/features/apps/api/queries.ts`).

### Acceptance criteria
- [x] Every screen action maps to a USR-02 endpoint (missing ones become org-admin-api follow-ups). Evidence: `api/queries.ts:55-197` covers GET list/detail/permissions, POST/PATCH app, and POST/PATCH permission, all with generated types. `lib/permissions/registry.ts:109-124` matches `require_permission` in org-admin-api `app/modules/rbac/router.py:40,63,91,105,123,154` (apps:read, apps:write, roles:manage). Removed because the API has no support: filters (`app-schema.ts:104-107`, `apps-table.tsx:30-40`), Members (`apps-columns.tsx:244-246`) and the Roles tab (`app-detail-sheet.tsx:82-85`). Tests: `apps-table.test.tsx` › "no search box, facets or sort buttons" and "no Members column"; `app-detail-sheet.test.tsx` › "tabs are Overview and Permissions only"; `app-schema.test.ts` › "imports no mock store". Follow-ups are listed in impl-log and plan.
- [x] Revoke/assign with confirmation and query invalidation. Revoke/assign moved to PAN-015c (owner). The access-changing actions here are enable/disable and the admin-only toggle. Both use a `ConfirmDialog` that names the target and are non-optimistic (`app-status-dialog.tsx:52-100`, `app-permission-admin-dialog.tsx:30-87`). Invalidation runs on success and on 404/409 (`queries.ts:106-126`); admin-app permission writes also invalidate `['me','permissions']` (`queries.ts:144-150`). Tests: `app-status-dialog.test.tsx` › "disable: … cancel sends nothing" and "pending: … the badge changes only after the refetch; a double click sends one PATCH"; `app-permissions-tab.test.tsx` › "toggle opens a confirm … the switch flips only after the refetch"; `queries.test.tsx` › the three invalidation tests.
- [x] Loading, empty, error and 403 states tested with a fake `fetch` injected into `createApiClient` (no MSW). Evidence: every component test uses `fakeApi` from `src/test-utils/api.ts` through `renderApps` (`components/test-fixtures.tsx`). Table: `apps-table.test.tsx` loading, empty, error + Retry, 403, 403 on refetch. Sheet: `app-detail-sheet.test.tsx` 404/403/error. Permissions tab: `app-permissions-tab.test.tsx` › "loading / empty … / error + Retry / 403 inline". Every dialog has an inline 403 test.
- [x] Owner: the admin app stays editable, the `admin:*` note is shown, and the API's 403/409 appear inline. `app-form-dialog.tsx:354-364`, `app-status-dialog.tsx:203-220` and `app-permission-form-dialog.tsx:208-224`. Tests: `app-form-dialog.test.tsx` › "admin app: …"; `app-status-dialog.test.tsx` › "admin app: …"; `app-permissions-tab.test.tsx` › "admin app: …".

### API rules verified against org-admin-api 33db316
- App create: 409 `conflict` with `details: null` means the key is taken; 409 `origin_taken` comes from `service.py:138-142,348-353`. Mapped in `errors.ts` (`appFormError`, 409 branch).
- App update (`service.py:393-494`): a no-op needs no `admin:*` (line 409). The UI sends only the changed fields and sends no request when nothing changed (`app-form-dialog.tsx:101-118`). The admin-app invariants raise 409 (lines 410-419), mapped to the admin-rule alert. `apex_not_allowed`, `too_many_origins` and `loopback_not_allowed` reasons come from lines 145-163. `org_mode_required` (field `org_owner_role_id`) and `role_has_org_permissions` (field `default_role_id`) are both mapped to Org mode. That is right for this form, because the user can only change `org_mode` here.
- Permission create (`service.py:829-867`): prefix, wildcard, admin-app, reserved-scope 422 reasons and 409 for a taken key all match `permissionFormError`. The UI never sends `scope`, so the API default applies.
- Permission update (`service.py:869-960`): the two `ConflictError`s for "default/org owner role holds" and `RoleHasAssignmentsError` (code `role_has_assignments`, reason `role_has_assignments`, `core/errors.py:93-94`) match `permissionAdminError`. The 422s on wildcard and admin-app permissions match the locked switches (`app-permissions-tab.tsx:207`).

### Deviations in impl-log (judged)
- **Permission hook signatures** `useCreatePermissionMutation(appKey, api)` and `useUpdatePermissionMutation(appKey, api)`: accepted. The invalidation scope must be known when the options are built, and the hooks are always used for one app (the sheet is keyed by app). Covered by `queries.test.tsx`.
- **Focus return**: accepted. The diagnosis is correct: Radix `DialogContent` `onCloseAutoFocus` prevents the default and focuses `triggerRef`, which is null without a `DialogTrigger`.
  - The `returnFocus` + `onCloseAutoFocus` design for the two form dialogs is deterministic.
  - The effect-based restore for the two `ConfirmDialog`s (`apps-dialogs.tsx:29-41`, `app-permissions-tab.tsx:202-214`) runs after `open` flips to false, once focus is no longer trapped. It is tested in real Chromium: `app-status-dialog.test.tsx` › "after success focus returns to the row's actions button", and the toggle test ends with `sw` `toHaveFocus()`.
  - It leaves the shared `ConfirmDialog` untouched, as the orchestrator note requires (PAN-014 owns it).
  - The selectors use `aria-label` built from app/permission keys. Those match `^[a-z][a-z0-9-:*]…$` and cannot break the attribute selector.
- **Clamp test asserts `{}`**: accepted. Page 1 is the default and `useTableUrlState` drops it from the URL.
- **`RegisterAppButton` exported, `data-register-app`**: accepted (needed by the test fixture and as the focus fallback).
- **`ADMIN_APP_NOTE` in `data.ts`**: accepted.
- **`includeHidden` / `screen` locators under a modal**: accepted. The modal sets `aria-hidden` on the rest of the page, so this is how the real a11y tree behaves. The assertions still target the dialog by role.

### Scope
Every changed file is in the plan's file list, plus workflow files (`work/backlog.md`, `ticket.md`, `plan.md`, `impl-log.md`). No unjustified out-of-plan change. `confirm-dialog.tsx`, `features/roles/**`, `mock-data.ts` and the OpenAPI snapshot are untouched, as planned.

### Issues
#### Issue 1 — 🟡 should-fix — a11y focus return (detail sheet)
- **Where**: `src/features/apps/components/app-detail-sheet.tsx:51-52`; `src/features/apps/components/apps-dialogs.tsx:66-71`
- **Expected**: when the detail sheet closes (Escape or X), focus returns to the row's "View {key}" button. That is the same R10 rule this ticket applies to the form and status dialogs.
- **Actual**: the sheet is a Radix `Dialog` opened by a plain button with no `DialogTrigger`, so focus falls to `<body>` on close. This was already true on main, so it is not a regression.
- **Fix instruction**: in `apps-dialogs.tsx`, pass a `returnFocus={() => document.querySelector<HTMLElement>(`[aria-label="View ${currentRow.key}"]`)?.focus()}` to `AppDetailSheet`. In the sheet, call it from `SheetContent onCloseAutoFocus={(e) => { e.preventDefault(); returnFocus() }}`. Add a test in `app-detail-sheet.test.tsx`: Escape closes the sheet and focus is on "View stoktok". This does not block the verdict. If it is not done here, record it as a follow-up.

### Rules R1–R11
No violations found.
- R1: no client filter, sort or search; no Members; no roles from mock or catalog; the disable copy matches the API's behaviour (`auth/service.py`, `repository.py:50`).
- R2: generated types only (`app-schema.ts:7-12`), and HTTP goes only through `src/api` via `getApi()`/the injected client.
- R3: untouched.
- R4: `<Can>` keys match the API's `require_permission`, and 403 is handled in the list, sheet, tab and every dialog.
- R5: the URL holds page/pageSize only.
- R6: origins and descriptions render as text.
- R7: scope respected.
- R8: all six checks green.
- R9: confirmations name the target, nothing is optimistic, errors are inline, and invalidation runs after success and 404/409.
- R10: pending uses `aria-disabled` with sr-only status, errors are linked, live regions are present, and focus is restored for the dialogs. See Issue 1 for the sheet.

### Security / a11y blockers
None. The orchestrator copies any items from `security-review.md` / `a11y-review.md` here if those reviews find blockers.

### Nits (do not block)
- `src/features/apps/data/data.ts:54`: `ADMIN_APP_NOTE` says "no localhost". The API refuses loopback admin origins only in staging/production (org-admin-api `service.py:159`). Consider "no localhost in staging or production".
- `src/features/apps/data/errors.ts:209`: a 409 `conflict` "Permission was changed concurrently" (`service.py:950`) is shown as "default role or org owner role holds this permission". This is rare and harmless, but the text is wrong for that case.
- `src/features/apps/components/app-form-dialog.tsx:139-143`: `setError('org_mode', …, { shouldFocus: true })` cannot move focus, because `SelectDropdown` does not forward `field.ref`. The error is still announced (`role=alert` via `FormMessage`).
- `src/features/apps/components/apps-dialogs.tsx:53-59`: the edit dialog is keyed by `currentRow.key`. If the same row's edit is reopened within the 500 ms clear delay after a save, the form keeps the pre-save defaults. This is an edge case.
- `src/features/apps/components/app-permissions-tab.tsx:393-395`: the "Always admin only" reason is `sr-only`, so sighted users see a disabled switch with no visible reason. Consider a visible hint or tooltip.
- `impl-log.md` says "Not committed", but the work is in commit 3972004 (committed by the orchestrator). This is a record mismatch only.

### Follow-ups (out of scope)
- Issue 1, if not fixed in this ticket: focus return for the apps detail sheet, and the same check for other features' detail sheets (organizations, audit-log).
- Everything in impl-log Follow-ups stands:
  - org-admin-api list filters, OpenAPI 404/409 declarations and a "key taken" reason code;
  - ADM-016 `member_count`;
  - PAN-015b roles and mock-store removal;
  - permission scope/description edit and delete, and app delete;
  - `text-red-500!` in organizations row actions;
  - a `ConfirmDialog` close-focus hook (PAN-014);
  - PAN-027 credentials.
