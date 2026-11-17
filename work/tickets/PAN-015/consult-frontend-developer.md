## PAN-015 consult (frontend-developer, read-only)

I read the code and the openapi snapshot. I ran nothing. Snapshot facts are from `/home/user/admin-pan/src/api/openapi.json`. I did not check org-admin-api main (a417ddb), which is where the snapshot may be stale.

### Findings

**1. The API shape does not match the mock screens (the central issue).**
- Apps:
  - `GET /apps` takes only `limit` and `offset`, so there are no filters. The mock toolbar (search plus status/join-policy facets) has no API support.
  - `GET /apps/{key}` works. `PATCH /apps/{key}` takes `name`, `join_policy`, `org_mode`, `origins`, `status`, and `default_role_id` (nullable). `key` is immutable.
  - `DELETE /apps/{key}` exists. The mock has no "delete app" action, but the API does.
  - `AppCreate` limits:
    - key matches `^[a-z][a-z0-9-]{1,31}$`.
    - name is 1-255 characters.
    - origins has max 20 items.
  - `default_role_id` is already in `AppRead` and `AppUpdate`. That settles the PAN-005 "set default role" question: the action exists as `PATCH {default_role_id}`.
- Permissions:
  - `GET /apps/{key}/permissions` is a `Page`, under `admin:apps:read`. `POST` and `PATCH`/`DELETE` by `permission_id` are under `admin:roles:manage`.
  - `PermissionRead` has no `app_id`. The `description` can be null.
  - `PermissionCreate` limits:
    - key matches `^<app>:<res>:<action>|<app>:*$`, max 160 characters.
    - description is max 500 characters.
    - A `:*` key is always stored `is_admin=true`.
  - The mock's side effect "non-admin permission is auto-granted to the default role" lives in the store. The API owns that rule, so after a mutation just refetch. Do not mirror the rule.
- Roles:
  - **The only list is the public catalog** `GET /apps/{key}/roles`. It is unauthenticated, rate-limited with 429, and returns 404 for disabled apps or the `admin` app.
  - `RoleCatalogEntry` has `key`, `name`, `is_system` and `permissions` (key strings). **It has no `id`.** It is not a `Page` and has no `app_id`.
  - `PATCH` and `DELETE` on a role, and `PUT .../permissions` (body `{permission_keys}`), are addressed by `role_id`. The assignment `POST` body also needs `role_id`.
  - `RoleRead` (with `id`) is returned only from `POST` and `PATCH`. So an admin has no way to list role ids. Candidate workarounds, none good:
    - Take ids from `AssignmentRead.role_id` (only for roles that are already assigned).
    - Read `app.default_role_id` (default role only).
    - Take ids from the create response (only for roles created in this session).
  - This blocks edit, delete, "edit permissions" and assign for any existing role. It needs an org-admin-api follow-up: either an admin `GET /apps/{key}/roles` that returns `RoleRead[]`, or an `id` on `RoleCatalogEntry`. Verify on main first.
  - Role keys: `<app>:<name>` is confirmed by the `RoleCreate` pattern `^[a-z][a-z0-9-]{1,31}:[a-z][a-z0-9-]{0,47}$`, max 160 characters. `RoleCreate` has no permissions, so create is two calls (POST, then PUT permissions). A partial failure is possible.
  - `RoleUpdate` takes only `name`. Key and app are immutable.
- Assignments:
  - **They exist only per user**: `GET/POST /users/{user_id}/role-assignments` (`GET` filters by `app`; there is no `role_id` filter) and `DELETE .../{assignment_id}`. All are under `admin:roles:assign`.
  - **There is no "who holds this role" endpoint.** The mock `RoleAssignmentsSheet` (list of holders per role, assign by email, org dropdown from mock orgs) cannot be built on the real API.
  - `AssignmentRead` has `active`, `app`, `role_key`, `role_id`, `org_id`, `expires_at` and a nullable `granted_by`.
  - Assigning by email is impossible: `AssignmentCreate` needs a `user_id` in the path. The user comes from `GET /users`, which has `email` and `status` filters per PAN-013. Check this.
  - The correct home for assign and revoke is the user detail sheet (PAN-013's `RoleAssignments`, currently read-only).
- Member count: there is no endpoint. This agrees with the orchestrator note. Drop the column and the Overview row, and record a follow-up on ADM-016.
- Permission registry (`src/lib/permissions/registry.ts`): the route `/_authenticated/roles/` is mapped to `admin:apps:read` / `GET /apps`. That is consistent with roles being app-scoped. The actions are `roles.*` = `admin:roles:manage` and `roles.assign` / `roles.revoke` = `admin:roles:assign` (partly seen, partly inferred). Keep these.

**2. Mock-only code to delete.**
- `access-store.ts` (and `resetAccessStore`).
- `mock-data.ts`, including `CURRENT_STAFF_ID`, the users/orgs lookups and `app_member_counts`.
- Hand-written types in `schema.ts` (R2): `Role`, `RolePermission`, `RoleAssignment`, `AccessData`, `Permission.app_id`, and `role_permissions` as a join table. Replace them with `components['schemas'][...]`. Keep only the zod form schemas and the label maps in `data.ts`.
- `data-table-view.tsx` (the roles table imports it from apps).
- The "Preview" or mock counts in the columns: `permission_count` and `assignment_count` come from mock joins. The permission count is derivable from `RoleCatalogEntry.permissions.length`. The assignment count is not available, so drop it.
- `__screenshots__/roles.test.tsx/...`: delete.
- "(planned name)" comments.

### Size and split recommendation

Count at the moment: 2 pages, 2 detail sheets, 5 dialogs/forms (app form, app status, role form with permissions picker, role delete, assignments sheet with assign form and revoke confirm), the app permissions tab with add and toggle admin, and about 14 mutations (`register`, `update`, `status`, `delete` app; `create`, `update-admin`, `delete` permission; `create`, `update`, `replace-permissions`, `delete` role; `assign`, `revoke`), plus 5 query shapes. The tests alone would be several hundred lines of fake-fetch setup. That is too much for one reviewable PR (PAN-013 had one list, one sheet sub-query and one mutation). The roles part also depends on an API gap (no role ids). Propose a split into three tickets in this order:

- **PAN-015a: Apps registry.**
  - Table with server-side pagination only. Detail sheet via `GET /apps/{key}` with Overview and Permissions (read-only list). Register and edit form dialog (name, join_policy, org_mode, origins; key read-only on edit).
  - Enable/disable app as a status dialog (access-changing, R9). Optionally the default-role dropdown, but it depends on role ids, so defer it to b.
  - Delete app with typed-key confirmation. Check the 409 rule first. Add it only if the owner wants it, because the mock had no delete.
  - Remove the Members column. Mutations: register, update, delete.
- **PAN-015b: Permissions and roles (per app).**
  - Roles page becomes an app picker (required `app` in the URL, since the catalog is per app) and a roles table from the catalog. Role create/edit form with a permissions checklist fed by `GET /apps/{key}/permissions` (page through all pages, limit 100).
  - Permission add/edit/delete on the app sheet's Permissions tab (the toggle `is_admin` becomes PATCH).
  - Set default role. Role delete. Mutations: about 7.
  - **Blocked on the role-id gap**, unless the owner accepts a catalog follow-up and ships create-only plus read. Record it as a dependency on an org-admin-api ticket.
- **PAN-015c: Assignments.**
  - Move assign/revoke to the user detail sheet (`users/` feature). Role picker from per-app catalog/role ids (so also blocked on the id gap), org picker from `GET /organizations`, and a `user_id` already known from context. Revoke confirmation. Mutations: 2.
  - The "role to holders" sheet is dropped (no API). Record the follow-up.

If the owner insists on one PR, at least cut the delete-app flow and set-default-role, and keep assignments for last. I do not recommend one PR.

### Recommendations (tied to ACs and rules)

1. **AC1, R1, R7.** Produce a mapping table in the plan: every action to endpoint, permission, and the registry key. Mark as follow-ups: role ids, holders-by-role, `member_count`, and filters on `GET /apps`. Do not filter client-side within a page (ADR 0005).
2. **Data flow (apps).**
   - `appsKeys.all/lists()/list(p)/detail(key)/permissions(key)`.
   - The list uses `keepPreviousData`, `toPageParams`, `queryView(q)`, `ForbiddenPanel variant='page'`, `ensurePageInRange` only when `isSuccess && !isPlaceholderData`, `manualPagination`, `enableSorting: false`, and `getRowId` on `key`.
   - Persistent sr-only `role='status'` live region (loading → "N apps, page n of m" / "No apps yet."). Do not put `role='status'` on the visible message row. `aria-busy` only while pending.
   - The detail sheet uses a sub-query by key, as the users sheet does, not the list row. Permissions are fetched lazily when the tab opens, and `useQuery enabled: open`.
   - The permissions tab needs its own pagination (limit 100). If total exceeds 100, show "x of y" with a pager, not a silent cut (PAN-013 sheet note).
3. **Form dialogs, AC2 and R9** (apply the PAN-014 pattern).
   - Fields:
     - App: `key` immutable on edit (readOnly with `aria-readonly`, not disabled). Origins as a textarea with one per line, or a tag input; max 20; no scheme check needed beyond API validation, but never render an origin as `href` (R6).
     - Role form: key is `<app>:<name>`, so show the app prefix as a fixed prefix and the user types only the suffix.
   - Mutation hooks use `meta: { handlesOwnErrors: true }` and invalidate `all` on success.
   - Error mapping by status and code (verify the codes on main): 409 → `form.setError('key', static message, { shouldFocus: true })`; 422 → map `loc`/`field` to fields, the rest to a form-level `role='alert'`; 403 → inline `ForbiddenPanel`; 404 → alert plus invalidate.
   - Pending: `aria-disabled` plus an early return (not native `disabled`), "Saving…" label, sr-only status, Escape and outside-click blocked, and `form.reset()` plus `mutation.reset()` on close.
   - Clear stale errors on reopen. Fix the toggle-style `onOpenChange` bug if present in `apps-dialogs.tsx`/`roles-dialogs.tsx` (I did not read them; PAN-014 found the same bug in organizations).
   - Role create is two calls (POST, then PUT permissions). Handle partial failure: if the PUT fails after the POST succeeded, keep the dialog on an "edit permissions" state with the role id, and tell the user the role exists. Do not retry the POST. Invalidate the list either way.
   - Role permissions edit: a checkbox group inside a `fieldset`/`legend`, grouped by resource, with a "N selected" status. Max 200. Send the full set (PUT replaces).
   - The `<app>:*` permission is always `is_admin`. Disable that toggle and explain why.
4. **Destructive flows (R9).**
   - Each one is a confirmation that names the target:
     - Disable app: lists the effect.
     - Delete app: typed key.
     - Delete role: shows `role.key` and warns that its assignments go away (check cascade versus 409 on main).
     - Delete permission: names the key, and warns that roles lose it.
     - Revoke assignment: names the user email (no full email in logs/URLs, fine in UI), the role and the scope.
     - System roles (`is_system`): hide or disable delete, and show why. A 409 or 403 from the API is still handled.
   - Non-optimistic, inline API error, `invalidate` after success. Role delete also invalidates the app's assignments views.
   - After a row disappears, move focus to the table region (`tabIndex={-1}`) or the primary button.
   - Apply `aria-disabled` and the error link (`aria-describedby`) locally in new dialogs. Do not touch the shared `ConfirmDialog` (PAN-014 owns it, R7).
5. **a11y from the start (PAN-013 lessons).**
   - Actions column header as `<span className='sr-only'>Actions</span>`.
   - Table wrapper `overflow-x-auto`, not `overflow-hidden`.
   - Row action triggers with unique `aria-label` (`Actions for app {key}`).
   - Text on every badge (Default / System / status).
   - `<time dateTime>` for dates. Tabs in the sheet are fine (Radix tabs).
   - Contrast check on destructive badges.
   - Sheet inline loading states announced, with background refetch not hiding the old content.
   - Errors tied to inputs with `aria-invalid`/`aria-describedby` (shadcn `FormMessage` does this; check that server-set errors render).
   - Origins list: a `<ul>`, no links.
6. **Test list (R8)** with `fakeApi` and `testQueryClient`, asserting on `seen` requests. Rewrite `apps.test.tsx`, `roles.test.tsx` and both form-dialog tests; delete the mock-based ones.
   - Per list: rows from the API, loading, empty, error plus Retry, 403 `ForbiddenPanel`, 403 on refetch replacing stale rows, next page sends `offset`, no sort buttons, no checkboxes, live-region content, permission gating (read-only user: no row menu, Register disabled with reason).
   - Detail sheet: loading, error and 403 of the sub-query, the permissions tab lazy-fetch, and a paged permissions list.
   - Forms: client validation boundaries (key 2-32 chars and the pattern, name 255/256, origins 20/21, permission key pattern, description 500/501, role key pattern); success body exact; 409/422/403/generic error; pending and `aria-disabled`; Escape blocked; reset on reopen; no double submit.
   - Destructive: no request on cancel; typed-key gating; 204 handling (confirm the client handles an empty body; PAN-014 flagged the same); 404/409/403 inline; list invalidated after success; the page clamps after the last row is deleted.
   - Roles: catalog rendering (including the 429 and 404 cases and the "disabled app" empty state), `permission_keys` PUT body replaces fully, partial failure after POST, a system role cannot be deleted.
   - Units: `toAppsListParams`, error mappers, the form zod schemas, the query keys, and a test that `src/features/{apps,roles}` no longer imports `access-store` or `mock-data`.
7. **Housekeeping.**
   - Snapshot: hand-patch only the needed 404/409 responses (full regeneration is PAN-016). Check the snapshot against org-admin-api main for role ids, filter params and 409 codes first.
   - Registry: confirm `roles.view` or keys for permissions are covered (permission add/edit/delete need keys; they appear not to exist yet; I saw only `apps.*` and `roles.*` lines, truncated at 30 results).
   - Route search: keep only `page`/`pageSize` for apps; roles gets `app` (an app key is not personal data, fine in the URL).

### Risks
- **Role ids are not discoverable** (blocks edit/delete/permissions/assign on existing roles). The highest risk to the whole roles scope. Mitigate with the split and an early org-admin-api follow-up.
- **The public role catalog** is rate-limited (429) and hides disabled apps (404), so the Roles page for a disabled app will look like an error. Map 404 to an explicit "no catalog for disabled apps" message, and handle 429 with Retry. It also sends ETag/304: make sure the client handles 304 (check `src/api/client.ts`; TanStack with `fetch` may get a cached body or an error).
- **Role create is non-atomic** (POST then PUT).
- **Holders-by-role** cannot be done. The ticket's AC "revoke/assign with confirmation" must be re-scoped to per-user (user sheet). This changes the PAN-005 UX (owner should know).
- **Mutations of permissions or roles change the staff's own access** (the admin app's own `admin` app roles/permissions: `admin:*`). Guard: a staff member can revoke or delete their own admin access, or disable app `admin`. Check whether the API refuses it (409/403). The UI should name the consequence, and re-fetch `me/permissions` (if the permissions store caches it) after a mutation that targets app `admin`. I did not check how `src/lib/permissions` loads and refreshes permissions.
- **Origins editing** can lock out the admin SPA itself (CORS is allowed only for `apps.origins` of `admin`). Warn on edit of the `admin` app, or exclude it, and check what the API does.
- **Large PR** if not split: reviewer fatigue, and R8's fake-fetch tests become slow.
- **Deleting the shared store** breaks the cross-imports between roles and apps (the roles feature imports from `features/apps/data`).

### Open questions
1. Does org-admin-api main have an admin roles list that returns ids, or an `id` on `RoleCatalogEntry`? If not, who opens the follow-up (and is 15b blocked until then)?
2. Is there any holders-by-role or `GET /role-assignments?role_id=` endpoint on main? If not, accept per-user assignment only (owner decision)?
3. `DELETE /apps/{key}`, role and permission: cascade or 409 when roles, assignments or members exist? Also, is the `admin` app protected? Exact codes (`conflict`?) and the 422 `details` shape?
4. Approve the split into 15a/15b/15c (or a different cut) and the order?
5. Does the owner want "delete app" (the API has it, the mock did not)? Typed-key confirmation?
6. `GET /apps` filters on main (`status`, `q`)? If not, pagination only.
7. Is `admin:roles:manage` correct for permission create/edit/delete as the snapshot says (rather than `admin:apps:write`)? The registry should match.

Key files:
- /home/user/admin-pan/work/tickets/PAN-015/ticket.md
- /home/user/admin-pan/src/api/openapi.json (apps at 1527, roles catalog at 2075, assignments at 3588; schemas at 57, 252, 918, 1063)
- /home/user/admin-pan/src/lib/permissions/registry.ts
- /home/user/admin-pan/src/features/apps/data/access-store.ts
- /home/user/admin-pan/src/features/apps/data/schema.ts
- /home/user/admin-pan/src/features/apps/components/app-detail-sheet.tsx
- /home/user/admin-pan/src/features/roles/components/role-assignments-sheet.tsx
- /home/user/admin-pan/src/features/roles/components/roles-table.tsx
- /home/user/admin-pan/src/features/users/api/queries.ts
- /home/user/admin-pan/src/features/users/components/users-detail-sheet.tsx
- /home/user/admin-pan/work/tickets/PAN-014/consult-frontend-developer.md
- /home/user/admin-pan/work/tickets/PAN-013/a11y-review.md
