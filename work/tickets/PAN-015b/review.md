## Attempt 1 — 2026-11-18
Verdict: PASS

Reviewed commit 3433e3b (branch `claude/great-edison-3g2y0h`) against `origin/main`.

### Checks (run by reviewer)
- pnpm typecheck: clean (`tsc -b`, no output).
- pnpm lint: clean (`eslint .`, no output).
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`), run twice: Test Files 104 passed (104), Tests 811 passed (811) both times (71.1 s, 72.4 s). No flakes.
- pnpm build: "✓ built in 1.30s".
- pnpm e2e: 29 passed (1.4m), including `roles: calechip by default; switch to stoktok; permissions dialog and delete confirm pass axe; Cancel sends no writes`.
- These match impl-log.md.

### Mutation proofs (run by reviewer; tree restored, `git status --porcelain` empty afterwards)
| Mutation | Result |
|---|---|
| `queries.ts:126` `if (app === ADMIN_APP_KEY)` → `if (true)` | FAILS "create/rename/replace/delete on app 'admin' invalidate ['me','permissions']; on 'stoktok' they do not" |
| `queries.ts:156` create `retry: false` → `retry: 3` | FAILS "create has retry: false and a failing POST is sent once" |
| `queries.ts:53-54` placeholder keeps another app's rows | FAILS the queries placeholder test and "app switch shows loading, not the previous app's rows" |
| `role-create-dialog.tsx:119` drop the `inFlight` guard | FAILS "double-click on Create sends one POST …" |
| `role-permissions-dialog.tsx:76` `ready` without `permsQ.isSuccess` | FAILS "with 130 app permissions, Save stays aria-disabled until both pages loaded …" |
| `role-permissions-dialog.tsx:72` `fresh` = `roleQ.isSuccess` only (placeholder row counts) | FAILS "Save is aria-disabled until the fresh role detail … seeded from the detail, not the list row" |
| `role-permissions-dialog.tsx:96` PUT keeps only keys in the loaded list | FAILS "a key the role holds but the app list lacks is shown flagged and kept unless unchecked" |
| `role-create-dialog.tsx:123` `if (!createdRef.current)` → `if (true)` | Survives (13/13). Not a gap: in the partial phase there is no submit button and implicit Enter submission is blocked, so `onSubmit` cannot run again. That is shown by "partial: pressing Enter in a field sends nothing" and by "Retry … sends only the PUT (POSTs 1, PUTs 2)", which goes through `retry()` → `savePermissions`. The guard is defence in depth. |
| `role-delete-dialog.tsx:35` drop the `inFlight` guard | Survives (4/4). `ConfirmDialog`'s `isLoading` guard still blocks the second click (`confirm-dialog.tsx:89-92`). Defence in depth. |

### Acceptance criteria
- [x] **Every role action maps to an endpoint, and role ids come only from the API.**
  - `queries.ts:46` GET role-definitions, `:69` GET detail, `:151` POST roles, `:166` PATCH, `:187` PUT permissions, `:202` DELETE.
  - Set default: `role-default-dialog.tsx:113` `PATCH /apps/{key} {default_role_id: currentRow.id}`.
  - Tests: `queries.test.tsx` › "create POSTs {key,name}; rename PATCHes …; all to the given id"; `role-create-dialog.test.tsx` › "POST {key,name} then PUT {permission_keys} to the id from the POST response"; `roles-table.test.tsx` › "row actions use the row's API id in the path".
  - The mock store is deleted (`access-store.ts`, `mock-data.ts`, `schema.ts`, `data-table-view.tsx`), and `role-schema.test.ts` › "has no mock store under features/apps or features/roles" guards it.
  - `rolesSearchSchema` (`role-schema.ts`) holds only `app/page/pageSize`.
- [x] **Two-step create handles a failure after the role is created.** The role exists, the user is told, and no POST is retried.
  - `role-create-dialog.tsx`: `createdRef` is set at `:125` before the PUT. `setCreated` at `:150` enters the partial phase. The alert at `:203-224` names the role. Key and name are `readOnly` (`:244`, `:267`). The partial footer offers only Retry (PUT) or Close (`:306-328`). The mutation has `retry: false` (`queries.ts:156`).
  - Tests, all green: "POST 201 then PUT 403 … exactly one POST", "partial: Retry … POSTs 1, PUTs 2", "partial: pressing Enter … no second POST", "partial: Close leaves the role; no further request", "double-click on Create sends one POST", "POST 500: couldn't-confirm alert; … no automatic POST".
- [x] **Deleting a role asks for confirmation that names the role. 409 `conflict` is shown inline.**
  - The confirmation title and description name `{name} ({key})` and the app (`role-delete-dialog.tsx:62-70`). The 409 maps to fixed text plus API text ≤ 200, as plain text (`errors.ts:121-125`). It renders in the `ConfirmDialog` `error` slot, linked by `aria-describedby` (`confirm-dialog.tsx:71,99`).
  - Tests: "confirm names 'Operator (stoktok:operator)'; Cancel sends nothing" and "409 conflict shows the fixed reason text plus the API message inline (role=alert, aria-describedby); dialog stays open".
  - Per plan A1 (accepted mapping), delete 409s are generic `conflict`.
- [x] **Errors are mapped by code:** 403 `admin_wildcard_required`, 409 `role_has_assignments`, 422 reasons.
  - Mappers: `errors.ts:89-118` (PUT: `role_has_assignments` by code or reason, `unknown_permission` names `details[].key` ≤ 10, `wildcard_super_admin_only`) and `:132-160` (default: four 422 reasons; 409 admin vs other). A 403 goes through `fallback` → `forbidden` → inline `ForbiddenPanel`.
  - Unit tests: `errors.test.ts` (one block per mapper).
  - Component tests: `role-permissions-dialog.test.tsx` › "409 role_has_assignments … 403 admin_wildcard_required inline"; `role-rename-dialog.test.tsx` › "admin app: 403 admin_wildcard_required inline"; `role-default-dialog.test.tsx` › "422 role_has_admin_permissions / … fixed copy inline".
- [x] **Loading, empty, error and 403 states are tested with the injected-fetch API mock.** `roles-table.test.tsx` covers:
  - "loading: a never-resolving fetch shows 'Loading roles…' and aria-busy"
  - "empty: 'No roles in Legacy yet.'"
  - "error shows an alert and Retry refetches"
  - "403 shows the page ForbiddenPanel and no table"
  - "404 …"
  - "apps list 403 … error … no apps"

  Dialog states are tested too: permission-list error and Retry, and detail 403. All use `fakeApi`.
- [x] **Owner note: the admin app is editable, with an `admin:*` note.**
  - `index.tsx:117-123`. Controls stay enabled ("admin app selected: admin:* note shown; New role and row actions stay enabled").
  - The only disabled item is "Set as default" on admin, with a visible reason (`roles-row-actions.tsx:229-245`), as plan A4 says.
- [x] **`['me','permissions']` is invalidated only for the admin app.** `queries.ts:124-127` runs on success only. Proven by mutation (table above).
- [x] **No silent permission loss on the full-replace PUT.**
  - The selection is a set of keys seeded from the fresh detail (`role-permissions-dialog.tsx:72-74`). It is never filtered by the loaded list: the picker keeps unknown keys checked (`role-permission-picker.tsx:36-37, 91-102`), and the PUT sends `[...selected]` (`:96`).
  - Save waits until the detail is fresh and every permissions page has loaded (`:76`; the paging loop is `queries.ts:88-109`, with a 50-page cap).
  - Proven by the three mutations above.

### Issues
None blocking.

### Rules R1–R11
- **R1:** no assignment counts or client-side catalogue; hints only mirror API fields. No violation.
- **R2:** HTTP only through the injected `ApiClient` (`src/api`). Types are generated aliases (`role-schema.ts:5-10`). The snapshot was regenerated, not hand-edited. Pages use `limit` ≤ 100.
- **R3:** unchanged. No token or storage use in the diff (grep: no `localStorage`, `sessionStorage` or `fetch(` in `features/roles` or `features/apps`).
- **R4:**
  - Registry: `roles.create/rename/setPermissions/setDefault/delete`, and the route lists the role-definitions reads (`registry.ts`).
  - Gates: `<Can>` on New role, Rename, Set as default and Delete. The Permissions dialog is read-only without `roles.setPermissions`.
  - Handling: 403 is handled in the page, the table, the detail and every dialog.
- **R5:** the URL holds only `app`, `page` and `pageSize`. No new env vars.
- **R6:** no `dangerouslySetInnerHTML` or `innerHTML`. Server messages are rendered as text and cut to 200 characters (`errors.ts:21`). The only new link is the internal `<Link to='/roles' search={{app}}>`.
- **R7:** the diff stays within the plan's file list. The two out-of-plan files (`role-alert-view.tsx`, `role-name-cell.tsx`) are justified in impl-log (shared renderer; the react-refresh lint rule). The `detailObjects` export is a justified deviation.
- **R8:** all checks are green, and logic and screen states are tested.
- **R9:**
  - Delete, set default and permission removal each confirm by naming the target (role key and name, app, removed keys).
  - Nothing is optimistic. Errors show inline.
  - The roles queries are invalidated on success and on 404/409/unknown outcome; the app is also invalidated on PUT 404/409/422.
- **R10:**
  - Labelled App select and inputs; actions triggers named "Actions for {key}"; `aria-disabled` while pending; status live regions.
  - Focus returns to the row (or to New role after a delete), tested in "focus to New role" and "focus returns to the row's actions button".
  - The e2e axe checks of the permissions dialog and the delete confirm pass.
- **R11:** no violation.

### Security / a11y blockers
None. No `security-review.md` or `a11y-review.md` was provided to this review.

### Nits (do not block)
- `role-permissions-dialog.tsx:204-211`: while the app's permission list is still loading, the picker gets `permissions=[]`. Every held key is then shown under "Not in this app's permission list" with the hint "The role holds this, the app list lacks it". The picker is disabled and "Loading…" is shown, so nothing is lost, but the text is wrong for that moment. Consider rendering a loading line instead of the picker until `permsQ.isSuccess`, or suppressing the "lacks it" hint while the list loads. The 130-permission test would need its "held key shows" step adjusted.
- `index.tsx:129-140`: when `?app=` is beyond the first 100 apps and `extra` is still loading, nothing shows under the picker. A "Loading app…" status would help.
- `role-create-dialog.tsx:123` (the `createdRef` check in `onSubmit`) is unreachable in the partial phase, so no test can discriminate it (see the mutation table). Harmless defence in depth; a short comment would explain why it stays.

### Follow-ups (out of scope)
- From impl-log, agreed:
  - org-admin-api `details.reason` on role-delete and PUT 409 `conflict`s, plus `assignment_count`.
  - Clear default role and an `org_owner_role_id` picker.
  - Role names in the app Overview.
  - PAN-015c holders sheet.
  - Filters ticket.
  - App picker beyond 100 apps.
  - e2e fake API CORS preflight missing `PUT`.
  - `apps-dialogs.tsx` `closeStatus` synchronous focus restore.
- Plan A1 (AC3/AC4 wording vs API: delete 409 is always generic `conflict`) should be reported to the owner so the ticket wording can be corrected.
