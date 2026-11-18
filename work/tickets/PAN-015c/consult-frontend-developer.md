## PAN-015c consult: frontend-developer (read-only)

## PAN-015c consult (frontend-developer, read-only)

### Findings
1. **API behaviour (org-admin-api `/home/user/org-admin-api/app/modules/rbac/`)**
   - `POST /users/{id}/role-assignments` (`assignments_router.py:42-55`) takes `{role_id, org_id?, expires_at?}` with `extra="forbid"`; `expires_at` is `AwareDatetime`, so an offset is mandatory (`schemas.py:275-283`). It returns 201 with `AssignmentRead`. The permission is `admin:roles:assign`.
   - Revoke is `DELETE …/role-assignments/{assignment_id}` (204, same permission).
   - Error codes come from `service.py:1427-1554, 1557-1566, 1587`:
     - 422: `unknown_role`, `org_id_not_allowed`, `unknown_org`, `expiry_not_allowed` (super-admin cannot expire), `expires_in_past`.
     - 403: `admin_wildcard_required` (any admin-app role, or a role holding an `is_admin` permission, needs `admin:*`) and `self_assignment_forbidden` (own admin-app roles).
     - 409: "Role is already assigned" (an expired duplicate is silently re-used), "changed concurrently", `last_super_admin` on revoke.
     - 404: user or assignment gone (the revoke target may already be revoked).
   - The `unknown_role` 422 is not in the ticket's code list. Map it as "role no longer exists" and refetch the role list.
   - `GET /users?email=` is a case-insensitive substring match (`users/repository.py:71-72`), not exact. Several users can match, which is why the explicit pick matters.
   - `RoleHolderRead` (`schemas.py:298-311`) is `AssignmentRead` plus `user_id`, `email`, `display_name`, `user_status`. `total` counts assignments, not users, and `active` is only "not expired". Disabled users are listed.
2. **Current UI**
   - Read-only `RoleAssignments` is at `users-detail-sheet.tsx:190-278`, mounted inside `<Can action='roles.viewAssignments'>` (`:113`). It has no Actions column. It fetches a fixed `limit 100, offset 0` (`users/api/queries.ts:18, 97-112`). Rows carry `a.id`, `a.app`, `a.role_key`, `a.org_id`, `a.expires_at` and `a.active`.
   - The registry already has `roles.assign` and `roles.revoke`, both `admin:roles:assign` (`registry.ts:181-188`). `roles.viewAssignments` lists only the user endpoint (`:177-180`).
   - `rolesKeys` is nested under `appsKeys.detail(app)` (`roles/api/queries.ts:20-32`), and `useRoleMutationOptions` invalidates `rolesKeys.all(app)` plus `mePermissionsKeys.all` when the app is admin (`:118-144`).
   - `RolesDialogType` is `'create'|'rename'|'permissions'|'delete'|'default'` (`roles-provider.tsx:7-12`). The dialogs, `focusOpener` and the confirm-restore effect are in `roles-dialogs.tsx:13-50`. The row menu is `roles-row-actions.tsx:54-103`.
   - The session-revoke dialog is the template for revoke (`user-session-revoke-dialog.tsx`). It uses `ConfirmDialog` with `destructive`, an `inFlight` ref, `pendingText`, an inline `error` slot, cancel blocked while pending, and no PII in toasts.
   - The sessions tab is the template for focus and paging (`user-sessions-tab.tsx:37-112`). It has a self-user guard (`useSelfUserId`), a `focusAfter` ref plus effect, a heading ref, a page clamp, and `queryView` for loading, forbidden and error states.
   - Test helpers: `fakeApi`, `json`, `apiError`, `testQueryClient` (`src/test-utils/api.ts`).
   - e2e fake-api (`e2e/support/fake-api.ts`):
     - Users' role-assignments are a static empty page (`:362-367`).
     - There are `role-definitions` list and detail routes (`:489-492`) but no holders route.
     - There is no POST or DELETE for assignments.
     - `GET /users` already does substring filtering (`:342-356`). `SELF_USER_ID` is at `:28`.
   - The org-scope field `org_mode` is zod `'none'|'required'` (`app-schema.ts:48`).

### Recommendations
**A. Structure (AC1, AC2, R9, R10)**
- New files in `src/features/users/components/`:
  - `user-role-assignments.tsx`. Move `RoleAssignments` out of `users-detail-sheet.tsx`. Add an "Assign role" button (`<Can action='roles.assign'>`) and a per-row "Revoke" button (`<Can action='roles.revoke'>`). Add an Actions column to the table. Name each button per row, e.g. `aria-label="Revoke {role_key} for {app}"`. Keep per-row button refs by assignment id and use the `focusAfter` pattern from the sessions tab. After a successful revoke, focus the "Apps & roles" heading (give it `tabIndex={-1}`). After assign, focus the heading or the new row.
  - `user-role-assign-dialog.tsx` (a form `Dialog`, not `ConfirmDialog`).
  - `user-role-revoke-dialog.tsx` (copy the session-revoke dialog). The description names the email, `role_key`, app and scope ("App-wide" or the org id; show the org name if cheaply known).
- Local `useState` for the open dialog, as in the sessions tab. Do not extend `UsersProvider`, which is built around the table.
- Self guard: when `selfId === user.id`, hide or disable assign and revoke for **admin-app** rows (API 403 `self_assignment_forbidden`). Show a note, as in `user-sessions-tab.tsx:40-49`. Non-admin-app roles on yourself are allowed.
- Raise or paginate the 100 cap. Today there is only a "Showing N of total" line (`:269-273`). If total > 100, the revoke list is incomplete. At minimum keep the note; ideally add offset paging like the sessions tab.

**B. Assign dialog (AC1)**
- Shared `AssignRoleDialog` with a fixed-or-picked contract: `{ fixedUser?: User, fixedRole?: {app, role} }`. See Open question 1. The user sheet fixes the user and picks role and org. The role-holders sheet fixes the role and picks the user.
- **User picker** (only where the user is not fixed):
  - A search input and a results list. Use a radio group or listbox, not a combobox that auto-highlights.
  - Fire only on an explicit "Search" or Enter, or on debounce with a minimum of 3 characters. Use `usersListQueryOptions({limit:10, offset:0, email})` (`users/api/queries.ts:68`).
  - No `keepPreviousData` for the picker: spread the options and override `placeholderData: undefined`. This avoids stale results being pickable under a new term.
  - Selection is state `{id, email, display_name}`. It is never defaulted, never auto-selected when there is a single match, and Submit is `aria-disabled` until a user is selected.
  - After selecting, show a "Selected: email (Change)" summary. Editing the search must not silently keep a selection that is no longer visible.
  - Empty state: "No users match". Also show "more results, refine the search" when `total > 10`.
  - R5: the email appears only in the query string (API contract, same as the users table) and in the dialog. Never in toasts, router search or logs.
- **Role picker across apps:**
  - Load `GET /apps` (all pages) and then `role-definitions` for the chosen app (limit 100, page through, as in `appAllPermissionsQueryOptions` at `roles/api/queries.ts:81-111`).
  - Two selects: App, then Role. Reset Role and Org when App changes.
  - Reuse `roleDefinitionsQueryOptions` keys (`rolesKeys.list`). Add a fetch-all variant `rolesKeys.allDefs(app)`, because a paged select would hide roles.
  - Role options need `id`, `key` and `name`. Label them "name (key)".
  - Admin-app roles: keep them selectable, with an advisory "needs admin:*" hint. The API's 403 `admin_wildcard_required` is always handled (R4). Privileged non-admin roles can't be detected in the UI, so rely on the 403.
  - Both lookups need `admin:apps:read`, which `roles.assign` does not imply. Decide the gate (Open question 3) and show a ForbiddenPanel inline if either lookup 403s.
- **Org picker:**
  - Render only when the selected app's `org_mode !== 'none'`. For `none`, send no `org_id`.
  - Default is "App-wide" (null). An org is chosen explicitly via search over `GET /organizations?q=` (`admin:organizations:read`; handle 403 inline). Use the same explicit-selection list as the user picker, and send the selected `id` only.
  - Clear a stale org when the app changes.
- **Expiry:**
  - Use `<input type='datetime-local'>`, optional, with a label and helper text "Local time; leave empty for no expiry".
  - Convert in a pure helper, e.g. `data/assignment-schema.ts`: `new Date(value)`. Reject `isNaN` (a bad value would otherwise throw `RangeError` on `toISOString`). Send `.toISOString()` (UTC `Z`, so the offset is explicit).
  - Client-side check for "in the past" is advisory only; the API's `expires_in_past` is authoritative. Disable the field with a hint when the role is `admin:super-admin` on the admin app (`expiry_not_allowed`).
  - Zod schema + unit test for the helper (R8).
- **Submit and errors:**
  - `retry: false`, the `inFlight` ref guard, `pendingText='Assigning…'`, and no Escape or overlay close while pending.
  - Add `data/errors.ts` with `assignmentError(error)` returning `{fields, alert}`, in the same shape as `roleCreateError` (`roles/data/errors.ts:30`):
    - 422 `org_id_not_allowed` / `unknown_org` → field error on org
    - 422 `expires_in_past` / `expiry_not_allowed` → field error on expiry
    - 422 `unknown_role` → role-gone alert plus refetch
    - 403 `admin_wildcard_required` → "Only an admin:* holder can grant this role."
    - 403 `self_assignment_forbidden` → own admin roles message
    - 409 `conflict` → "Already assigned (or changed concurrently)"
    - 404 → user gone
    - other 403 → `ForbiddenPanel`
    - unknown outcome → "couldn't confirm; check the list"
  - Match on `error.code` and the `details` reason via `firstReason` as in `roles/data/errors.ts:53-60`. Never render raw `message` except sliced text (`serverText`).
- **Effect note (AC4):** after a successful grant or revoke on a **non-admin** app, show a persistent `role='status'` line in the "Apps & roles" section, plus a toast: "Takes effect in {app} within 15 minutes for sessions already signed in." Never use "immediately". For the admin app, the existing revoke copy (`data/sessions.ts`) says admin access ends on the next admin request, so use that wording for admin rows and the 15-minute wording only for other apps. Put the strings in `data/` and unit-test them, as `sessions.test.ts` does for revoke copy.

**C. Holders sheet (AC5)**
- Add `'holders'` to `RolesDialogType`. Add a "Assignments" item to `roles-row-actions.tsx`, wrapped in `<Can action='roles.viewAssignments'>`. Add the holders endpoint to that registry entry (same `admin:users:read`). If `registry.test.ts` cross-checks endpoints with the OpenAPI schema, update it.
- New `RoleHoldersSheet` rendered in `roles-dialogs.tsx` under the `currentRow` block with `key={role-holders-${id}}`, using `closeWithRow` and `returnFocus` → `focusOpener(currentRow.key)`. A `Sheet` (Radix Dialog) uses the same focus-return pattern as the rename and permissions dialogs.
- Query in `roles/api/queries.ts`:
  - `roleHoldersQueryOptions(app, roleId, {limit, offset}, api)`, key `[...rolesKeys.all(app), 'holders', roleId, {limit, offset}]`. Add `rolesKeys.holdersAll(app)` and `rolesKeys.holders(...)`.
  - `placeholderData: keepPreviousData` within the same role only.
  - Page size 20, with the sessions-tab pager (offset state, "Showing a–b of total", clamp on empty page, Next/Prev focus handling).
- States, via `queryView`: loading (`role='status'`), empty ("No one holds this role"), error with Retry (`role='alert'`), and 403 with `ForbiddenPanel` inline. Disabled users appear, so show `user_status`. Show expired rows as "Expired" (`active=false`); the endpoint doc says `active` ignores user, org and app status, so do not label it "effective".
- Heading and copy count "assignments", not users (`schemas.py:298-300`). Table columns: user (email and display name), scope, expires, status.
- The holders list contains emails (PII). Render as text only (R6), with no email in toasts or logs.
- Revoke from this sheet is not in the AC; leave as a follow-up (R7).

**D. Query keys and invalidation (R9)**
- Add `usersKeys.roleAssignmentsAll(id) = [...detail(id), 'role-assignments']` and invalidate that (not `detail`, which refetches the user and the sheet).
- Assign and revoke mutation hooks go in `users/api/queries.ts` (`useAssignRoleMutation(userId, api)`, `useRevokeRoleAssignmentMutation(userId, api)`). Use `meta.handlesOwnErrors`, `retry:false`, and never optimistic.
- On success, invalidate `usersKeys.roleAssignmentsAll(userId)` and `rolesKeys.holdersAll(app)` (the app key is taken from the dialog or row). Import `rolesKeys` from the roles feature, which is the same cross-feature direction as `users → apps`.
- On 404, 409, 422 `unknown_role` and unknown outcome, invalidate the same keys, as `useSessionRevokeOptions` does (`users/api/queries.ts:159-175`).
- `mePermissionsKeys` invalidation: assign and revoke cannot change the signed-in user's own permissions on the admin app, because `self_assignment_forbidden` blocks self changes. It is optional and harmless on `app === ADMIN_APP_KEY`. Adding it is cheap, but it is not needed for correctness. If the owner wants it (the task mentions it), copy the admin-only condition from `roles/api/queries.ts:126`.

**E. Tests (R8, AC6)**
- Use `fakeApi` plus `testQueryClient` and inject the client through `UsersProvider` or `RolesProvider` (`api` prop).
- Unit tests:
  - expiry helper (empty → null, valid → ISO with `Z`, invalid → error, past → advisory)
  - `assignmentError` mapping for every code
  - the effect-copy strings
  - key builders
- `user-role-assign-dialog.test.tsx`:
  - the user is never auto-picked when one match is returned
  - Submit is disabled until a user is selected
  - the org picker is absent when `org_mode='none'` and present when `'required'`
  - the POST body has `role_id`, `org_id` and an offset-bearing `expires_at`, and empty expiry means no `expires_at`
  - a double click sends one POST
  - each error code shows the right message
  - the 15-minute note appears for a non-admin app, never for "immediately"
  - the list refetches after success
- Revoke dialog: it names user, role and scope; Cancel sends no DELETE; one DELETE on a double click; 404, 409 `last_super_admin` and 403 are shown; focus returns to the heading or row.
- Holders sheet: loading, empty, error with Retry, 403, paging with a page clamp, an app/role switch not showing stale rows, and a disabled-user row.
- Self guard on admin-app rows, and `Can` hiding without `admin:roles:assign`.
- e2e `fake-api.ts`:
  - make the per-user assignments stateful (replace the static `page([], query)` at `:365`)
  - add `POST …/role-assignments` returning 201 with a full `AssignmentRead`, and `DELETE …/{assignment_id}` returning 204 (404 when gone)
  - add `GET …/role-definitions/{role_id}/assignments` next to `:489-492`
  - add 409/422/403 branches only if an e2e spec needs them
  - extend `e2e/pages.e2e.ts` minimally: open the user sheet, assign, see the row, revoke

### Risks
- **Spec ambiguity:** AC1 (pick the user from `GET /users?email=`) does not fit the user detail sheet, where the user is already known. See Open question 1. Building the picker in the wrong place wastes the ticket.
- **Stale or silent picks:** substring search can return several users, and a stale placeholder page could be selected. Mitigated by no `keepPreviousData` and no default selection.
- **Over-trusting UI gating:** the UI cannot know whether a non-admin role holds an `is_admin` permission, so `admin_wildcard_required` will appear for staff without `admin:*`. It must be handled as a normal result, not hidden.
- **Timezone:** `datetime-local` has no offset. `toISOString()` sends UTC, and the displayed value in the table uses `formatDateTime`; make sure the helper text says local time to avoid off-by-hours surprises.
- **100-row cap** on the user's assignments hides rows that can't be revoked.
- **Expired duplicate re-grant:** the API re-uses an expired assignment (same id), so the id may be unchanged after assign. Do not key UI state on a "new id" appearing.
- **Cross-app lookup permissions:** apps and organizations lookups need other permissions, so a staff member with only `admin:roles:assign` sees a broken picker unless the 403 is handled inline.
- **Stale invalidation:** forgetting `rolesKeys.holdersAll(app)` leaves an open holders sheet out of date after a grant or revoke.
- **PII:** emails in the holders table and the picker are visible by design; keep them out of toasts, keys that are logged, and URLs other than the API's own query string.

### Open questions
1. Where does the user picker go? Recommendation: an "Assign" button in the holders sheet (role fixed, user picked), plus "Assign role" in the user sheet (user fixed, role and org picked), both through one dialog. The alternative is a picker only in the holders sheet. Needs the owner's call (AC1 vs. the owner note of 2026-11-17).
2. Should revoke also be available from the holders sheet? It is not in the AC. I assume no.
3. Which permission gates the Assign button? `admin:roles:assign` only, or also `admin:apps:read` (apps and role lookups) and `admin:organizations:read` (org lookup)? Does the registry's `perm()` support multiple permissions? I did not check; if not, handle 403 inline in the picker.
4. For `org_mode='required'` apps, is an app-wide (no org) assignment acceptable in the UI? The service code I read does not force `org_id` (`service.py:1511-1517`). Check the spec or the org-admin-api side, then decide whether "App-wide" stays the default.
5. Should the admin-app roles be offered in the role picker for staff who lack `admin:*`? The API rejects them with 403, so hiding them would need a new `admin:*` check (the sessions tab uses `useActionPermission('users.viewSessions')` as a stand-in for `admin:*`).
6. Is invalidating `me/permissions` on the admin app required at all, given self-assignment is forbidden? I recommend optional.

Files referenced:
- /home/user/admin-pan/work/tickets/PAN-015c/ticket.md
- /home/user/admin-pan/src/features/users/components/users-detail-sheet.tsx
- /home/user/admin-pan/src/features/users/api/queries.ts
- /home/user/admin-pan/src/features/users/components/user-sessions-tab.tsx
- /home/user/admin-pan/src/features/users/components/user-session-revoke-dialog.tsx
- /home/user/admin-pan/src/features/roles/api/queries.ts
- /home/user/admin-pan/src/features/roles/components/roles-dialogs.tsx
- /home/user/admin-pan/src/features/roles/components/roles-provider.tsx
- /home/user/admin-pan/src/features/roles/components/roles-row-actions.tsx
- /home/user/admin-pan/src/features/roles/data/errors.ts
- /home/user/admin-pan/src/lib/permissions/registry.ts
- /home/user/admin-pan/src/test-utils/api.ts
- /home/user/admin-pan/e2e/support/fake-api.ts
- /home/user/org-admin-api/app/modules/rbac/assignments_router.py
- /home/user/org-admin-api/app/modules/rbac/service.py
- /home/user/org-admin-api/app/modules/rbac/schemas.py
