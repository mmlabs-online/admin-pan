Status: READY

# Plan: PAN-015c, role assignments (assign, revoke, holders of a role) on the real API

## Spec summary
`docs/spec-v1.md` §5.4 Apps, roles and access:
> Apps registry (join policy, org mode, origins, default role), roles and their permissions, role assignments per user (app scope or one org), revoke sessions.

Ticket goal (owner split, 2026-11-17):
- **User detail sheet:** assign and revoke roles.
- **Roles screen:** a per-role "Assignments" sheet (holders of the role) on the new endpoint.

The owner note says "keep" the holders sheet. It does not exist today: PAN-015b deleted the mock `role-assignments-sheet.tsx` (PAN-015b plan A10). This ticket **builds** it.

**API facts at org-admin-api 0757c27** (read-only; the consults cite exact lines; admin-pan's snapshot is already at 0757c27, so **no regeneration**):

**Endpoints**

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/users/{user_id}/role-assignments?limit&offset` | `admin:users:read` | `Page[AssignmentRead]`, newest first |
| POST | `/users/{user_id}/role-assignments` | `admin:roles:assign` | Body `AssignmentCreate {role_id, org_id?, expires_at?}`, `extra=forbid`, `expires_at` is `AwareDatetime`. Returns 201 `AssignmentRead`. |
| DELETE | `/users/{user_id}/role-assignments/{assignment_id}` | `admin:roles:assign` | 204. The row is scoped to the user. |
| GET | `/apps/{key}/role-definitions/{role_id}/assignments?active&org_id&limit&offset` | `admin:users:read` | See below |

- `AssignmentRead` fields: `id, app, role_id, role_key, org_id|null, granted_by|null, expires_at|null, active, created_at`.
- `active` means "not expired", computed with the database clock (`schemas.py:294`).
- The holders endpoint returns `Page[RoleHolderRead]`, which is `AssignmentRead` plus `user_id, email, display_name, user_status`.
  - It sends `Cache-Control: no-store`.
  - `total` counts **assignments**, not users.
  - `active` is "not expired" only, not "effective in tokens".
  - It returns 404 for an unknown app, or a role not of that app.
- `GET /users?email=` is a case-insensitive **substring** match.
- `GET /organizations?q=` matches a substring of name or slug, trimmed to 1..100 characters.
- **Re-granting an expired duplicate** returns 201 with the **same** id and `created_at`.
- `admin:*` is also needed (403 `admin_wildcard_required`) when the role is privileged. A role is privileged when it is an admin-app role or holds an `is_admin` permission. This is the same rule as `RoleDefinitionRead.privileged`.
- `self_assignment_forbidden` applies only to the **admin** app, for grant and revoke.

**Errors**

| Status | `error.code` | `details[0].reason` | When |
|---|---|---|---|
| 403 | `admin_wildcard_required` | — | Privileged role without `admin:*` |
| 403 | `self_assignment_forbidden` | — | Own admin-app role |
| 403 | other (e.g. `permission_denied`) | — | Missing permission |
| 409 | `last_super_admin` | — | Revoke only |
| 409 | `conflict` | — | Already assigned, or changed concurrently |
| 422 | `unprocessable` | `org_id_not_allowed`, `unknown_org`, `expires_in_past`, `expiry_not_allowed`, `unknown_role` | — |
| 422 | `validation_error` | — | Naive datetime, bad UUID, extra field |
| 404 | `not_found` | — | User (assign) or assignment (revoke) |

The OpenAPI snapshot does not document 404/409 on assign or 404 on revoke. Handling is by status and code at runtime.

**Effect timing**
- Production access tokens last **12 h** (org-admin-api ADR-0005, USR-13 amendment 2026-11-17).
- App roles are baked into app tokens when the token is minted (ADR-0001).
- Admin-app permissions are read on every request.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Assign picks the user explicitly from `GET /users?email=` (never auto-picks). It picks the role, the org only when `org_mode` is not `none`, and an optional expiry sent as ISO with an offset. | **`role-assign-dialog.test.tsx` (role fixed, holders sheet):**<br>› "one search result is not selected; Submit aria-disabled until the row is chosen"<br>› "editing the search text clears the selection"<br>› "a late response for an old term never changes the selection or the list"<br>› "POST goes to the picked row's user id"<br>› "rows show email, display name and status in `<bdi>`"<br><br>**`role-assign-dialog.test.tsx` (user fixed, user sheet):**<br>› "app then role; roles loaded from every role-definitions page"<br>› "org picker absent for org_mode none, POST body has no org_id"<br>› "org_mode required: App-wide by default; a searched org is chosen explicitly; body has its id"<br>› "expiry sent as toISOString (ends in Z); empty expiry → no expires_at key"<br>› "expiry disabled for admin:super-admin"<br><br>**`assignments.test.ts`:**<br>› "toExpiresAt …" |
| 2 | Revoke asks for confirmation naming the user, role and scope, and is never optimistic. | **`role-assignment-revoke-dialog.test.tsx`:**<br>› "confirm names display name + email, role name and key, app, and org name (or App-wide); Cancel sends no DELETE; focus returns to the row's Revoke"<br>› "two synchronous clicks send one DELETE"<br>› "row stays until the refetch after 204"<br>› "failure keeps the row and shows the mapped error"<br><br>**`users/api/queries.test.tsx`:**<br>› "revoke has retry false and no cache write before success" |
| 3 | Errors are mapped by code. The 403 and 409 codes are read from `error.code`. The 422 reasons are read from `details[].reason`, and 422 `unknown_role` and 404 are added. | `users/data/errors.test.ts` › one case per code and reason (Tests table). Component spot checks in the assign and revoke dialog tests (403 `admin_wildcard_required` inline panel, 422 `expires_in_past` on the expiry field, 409 `conflict`, 404). |
| 4 | **(Corrected, owner decision via orchestrator.)** After a grant or revoke the UI states when it takes effect, and never claims it is immediate. Non-admin app: "Users already signed in to {app} may keep (or not yet get) this change until their current token expires, up to 12 hours." Admin app: "This takes effect on their next admin request." | `assignments.test.ts` › "assignmentEffect: non-admin names the app and 'up to 12 hours'; admin says 'next admin request' and has no hours; neither matches /immediate\|instantly\|right away\|15 minutes\|signed out/i". `user-role-assignments.test.tsx` › "after a stoktok grant the status region shows the 12-hour note; after an admin revoke it shows the next-admin-request note". |
| 5 | The per-role holders sheet uses the new endpoint and has its own loading, empty, error and 403 states. | **`role-holders-sheet.test.tsx`:**<br>› "GET …/role-definitions/{id}/assignments?limit=20&offset=0"<br>› "loading"<br>› "empty"<br>› "error + Retry"<br>› "403 inline panel"<br>› "404 role gone + roles list invalidated"<br>› "paging + clamp"<br>› "'N assignments' wording"<br>› "Not expired / Expired"<br>› "disabled user badge"<br>› "no email in query keys"<br><br>**`roles-table.test.tsx`:**<br>› "Assignments item shown with admin:users:read, hidden when denied" |
| 6 | States are tested with the injected-fetch API mock. | All component tests use `fakeApi`, `json`, `apiError` and `testQueryClient` from `src/test-utils/api.ts` (ADR 0005). |
| — | Privileged and self guards are advisory only; 403 is always handled. | `role-assign-dialog.test.tsx`:<br>› "privileged role disabled with text reason when admin:* denied; enabled when unknown"<br>› "admin app + self target: Submit aria-disabled with reason; stoktok + self allowed"<br><br>`user-role-assignments.test.tsx` › "self: Revoke on admin rows aria-disabled with reason; non-admin rows enabled" |
| — | Checks pass | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` and `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm e2e` (no `unmatched` calls) |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/lib/permissions/registry.ts` | Add `'roles.viewHolders': perm('admin:users:read', 'GET /api/v1/apps/{key}/role-definitions/{role_id}/assignments')`. Keep `roles.viewAssignments`, `roles.assign` and `roles.revoke` unchanged; renaming them is a follow-up. | R4; `registry.test.ts` checks it against `x-permission` |
| `src/features/users/data/assignments.ts` | **New.** Effect copy, expiry helper and schema, zone label, scope label, aliases (Approach §3). | AC1, AC4 |
| `src/features/users/data/assignments.test.ts` | **New** | R8 |
| `src/features/users/data/data.ts` | Add `formatDateTimeZone(iso)`: the same as `formatDateTime` plus `timeZoneName: 'short'`. | Expiry shown with its zone (appsec F6) |
| `src/features/users/data/errors.ts` | Add `assignRoleError` and `revokeAssignmentError` (Approach §4). | AC3 |
| `src/features/users/data/errors.test.ts` | Add cases | R8 |
| `src/features/users/api/queries.ts` | Keys `roleAssignmentsAll`, paged `roleAssignments`, user picker and org picker queries, assign and revoke mutations (Approach §2). Remove `ASSIGNMENTS_PAGE`. | AC1, AC2, R2, R9 |
| `src/features/users/api/queries.test.tsx` | Replace the `limit=100` test; add new ones | R8 |
| `src/features/roles/api/queries.ts` | Keys `holdersOf` and `holders`; `allRoleDefinitionsQueryOptions` (all pages); `roleHoldersQueryOptions` (Approach §2). | AC1, AC5 |
| `src/features/roles/api/queries.test.tsx` | Add cases | R8 |
| `src/features/users/components/user-role-assignments.tsx` | **New.** The "Apps & roles" section moves here from the sheet. It adds paging, Assign, Revoke per row, a notice region, focus handling and the self and privileged hints (Approach §5). | AC1, AC2, AC4 |
| `src/features/users/components/user-role-assignments.test.tsx` | **New.** The existing assignment tests move here from `users-detail-sheet.test.tsx`, plus the new tests. | R8 |
| `src/features/users/components/users-detail-sheet.tsx` | Delete the local `RoleAssignments`. Render `<Can action='roles.viewAssignments'><UserRoleAssignments user={user} userId={currentRow.id} open={open} /></Can>`. Drop unused imports. | Move |
| `src/features/users/components/users-detail-sheet.test.tsx` | Remove the 5 `assignments:` tests, which moved. Keep one smoke test: "Apps & roles section renders inside Details". | Move |
| `src/features/users/components/role-assign-dialog.tsx` | **New.** The shared form dialog with user-fixed or role-fixed targets, pickers, a confirm phase for privileged grants, and errors (Approach §6). | AC1, AC3, R9 |
| `src/features/users/components/assign-pickers.tsx` | **New.** `UserPicker` and `OrgPicker` on one internal explicit-selection `PickList` (Approach §7). | AC1 |
| `src/features/users/components/role-assign-dialog.test.tsx` | **New** | AC1, AC3, AC4 |
| `src/features/users/components/role-assignment-revoke-dialog.tsx` | **New.** Built on `ConfirmDialog` (Approach §8). | AC2, R9 |
| `src/features/users/components/role-assignment-revoke-dialog.test.tsx` | **New** | AC2, AC3 |
| `src/features/users/components/assignment-test-data.ts` | **New.** API-shaped fixtures and an `assignmentsServer(overrides)` fake handler for the tests in this ticket. | Tests |
| `src/features/roles/components/role-holders-sheet.tsx` | **New** (Approach §9) | AC5 |
| `src/features/roles/components/role-holders-sheet.test.tsx` | **New** | AC5 |
| `src/features/roles/components/roles-provider.tsx` | Add `'holders'` to `RolesDialogType` | Host |
| `src/features/roles/components/roles-row-actions.tsx` | Add an "Assignments" item (lucide `Users` icon, `aria-hidden`) under `<Can action='roles.viewHolders'>`, placed after Permissions. | AC5, R4 |
| `src/features/roles/components/roles-dialogs.tsx` | Mount `RoleHoldersSheet` under `currentRow` with `key={role-holders-${id}}`, `open === 'holders'`, `onOpenChange={closeWithRow}` and `returnFocus={() => focusOpener(currentRow.key)}` | AC5, R10 |
| `src/features/roles/components/roles-table.test.tsx` | Add "Assignments item shown with admin:users:read; hidden when denied; opens the sheet" | R4 |
| `e2e/support/fake-api.ts` | Stateful per-user assignments, POST and DELETE, a holders route per role (Approach §10) | `noStrayRequests`, e2e |
| `e2e/pages.e2e.ts` | One assign → revoke test (Approach §10) | E2E, axe |

Not touched:
- `src/api/*` (snapshot current);
- `confirm-dialog.tsx`;
- organizations and apps feature code (their query option and key exports are reused);
- `roles-columns.tsx`;
- `docs/adr/0003-auth-client-integration.md` (follow-up F1);
- `src/lib/forbidden.ts` (it already maps `admin_wildcard_required` and `self_assignment_forbidden`).

No new ADR: ADR 0004 (permission mirror) and ADR 0005 (injected fetch, paging) cover the patterns.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `users/data/assignments.test.ts` › "assignmentEffect('stoktok'): contains 'Users already signed in to stoktok', 'until their current token expires' and 'up to 12 hours'" | AC4 |
| › "assignmentEffect('admin'): contains 'next admin request'; does not contain 'hours'" | AC4 |
| › "no effect text matches /immediate\|instantly\|right away\|15 minutes\|signed out\|logged out/i" | AC4 guard (BUG-001 style) |
| › "APP_TOKEN_MAX_HOURS is 12 and is the only source of the number in the copy" | One constant |
| › "toExpiresAt: '' → {ok, value:null}; '2099-01-02T03:04' → value ends with 'Z' and equals new Date(v).toISOString(); 'garbage' → error 'Enter a valid date and time.'; a past value → error 'Pick a time in the future.' (now injected)" | AC1, appsec F6 |
| › "toExpiresAt round-trip check: a value whose local re-format differs is rejected (helper takes the Date factory, so it can be tested)" | DST |
| › "zoneLabel() names the IANA zone and the UTC offset, e.g. 'Asia/Ho_Chi_Minh, UTC+07:00'" | F6 |
| › "scopeLabel: null → 'App-wide'; with an org name → name; without → 'Organization {id}'" | AC2 |
| `users/data/errors.test.ts` › "assignRoleError: 403 admin_wildcard_required → forbidden copy 'Only super admins can do this'; 403 self_assignment_forbidden → forbidden copy; 403 permission_denied → forbidden" | AC3 |
| › "assignRoleError: 409 conflict → alert 'This user already has this role in this scope, or it changed at the same time. The list was refreshed.'" | AC3 |
| › "assignRoleError: 422 unprocessable reason org_id_not_allowed → org; unknown_org → org; expires_in_past → expires_at; expiry_not_allowed → expires_at; unknown_role → role; other reason → alert REJECTED" (built with `apiError(422,'unprocessable',[{field,reason}])`) | AC3 |
| › "assignRoleError: 422 with the reason as the top-level code and no details does not map to a field (the mapper reads details)" | AC3 |
| › "assignRoleError: 422 validation_error loc body.expires_at / body.org_id / body.role_id → field; else REJECTED" | AC3 |
| › "assignRoleError: 404 → 'This user no longer exists.'; unknown outcome → 'We couldn't confirm whether the role was granted. Check the list before trying again.'; server message never shown" | AC3 |
| › "revokeAssignmentError: 404 → gone; 409 last_super_admin → fixed copy; 409 conflict → changed-meanwhile; 403 both codes → forbidden; unknown outcome → 'may have been applied' copy; other → fixed copy" | AC3 |
| `users/api/queries.test.tsx` › "userRoleAssignmentsQueryOptions sends GET …/role-assignments?limit=20&offset=40; key ['users','detail',id,'role-assignments',{limit,offset}]" | Paging |
| › "userPickerQueryOptions: GET /users?email=ann&limit=10&offset=0; no placeholderData; gcTime 5000" | F1, F5 |
| › "orgPickerQueryOptions: GET /organizations?q=ac&limit=10&offset=0; key under ['organizations']" | AC1 |
| › "assign POSTs exactly {role_id} / {role_id, org_id, expires_at} to the given user id; retry false (a 500 is sent once)" | AC1, R9 |
| › "assign success invalidates ['users','detail',id,'role-assignments'] and ['apps','detail',app,'roles','holders'] but not ['users','detail',id] itself or ['me','permissions']" | R9 |
| › "assign 409 / 404 / unknown outcome invalidate the same keys; 422 unknown_role also invalidates ['apps','detail',app,'roles']" | R9 |
| › "revoke DELETEs …/role-assignments/{aid}; retry false; success, 404, 409 and unknown outcome invalidate assignments + holders; 404 also invalidates the user detail" | AC2, R9 |
| `roles/api/queries.test.tsx` › "rolesKeys.holdersOf(app) = [...all(app),'holders']; holders(app,id,p) under it; no email in any key" | Keys, F5 |
| › "roleHoldersQueryOptions: GET …/role-definitions/{id}/assignments?limit=20&offset=0; gcTime 5000; placeholder kept only for the same app and role" | AC5 |
| › "allRoleDefinitionsQueryOptions pages limit=100 until total (130 → offset 0 and 100); cap throws invalid_response" | AC1 |
| `user-role-assignments.test.tsx` (moved) › "loading; rows with App-wide and org scope, expiry with zone and Expired; empty; error + Retry; 403 inline" | Existing states |
| › "total 45: pager 'Showing 1–20 of 45'; Next sends offset=20; empty page clamps back" | Paging |
| › "Assign role button under roles.assign; hidden when denied; Revoke column hidden when denied" | R4 |
| › "Revoke button labelled 'Revoke {role_key} in {app}' per row; disabled while placeholder data shows" | R10 |
| › "self: admin-app rows' Revoke aria-disabled with visible 'You can't change your own admin roles'; stoktok rows enabled" | Self guard |
| › "admin:* denied: admin-app rows' Revoke aria-disabled with 'Needs admin:*'; unknown → enabled" | Privileged guard |
| › "after a stoktok grant: toast 'Role stoktok:viewer granted in stoktok.' (no email) and the status region shows assignmentEffect('stoktok'); list refetched; focus on the heading" | AC4, R5 |
| › "after an admin revoke: status shows assignmentEffect('admin')" | AC4 |
| `role-assign-dialog.test.tsx` (user fixed) › "title names the user (display name + email in bdi); no user picker" | AC1 |
| › "app select lists apps with ' — disabled' text; changing the app resets the role and org" | AC1 |
| › "roles load from every role-definitions page (130 roles → 2 requests); labelled 'name (key)'; privileged ones say 'needs admin:*'" | AC1 |
| › "admin:* denied → privileged options disabled with text reason; admin:* unknown → enabled" | Guard |
| › "org_mode none: no org field, body has no org_id" | AC1 |
| › "org_mode required: 'App-wide' is selected by default; searching 'ac' lists orgs; nothing picked until chosen; body org_id = picked id; 'Use app-wide' clears it" | AC1 |
| › "org search 403 → inline panel, App-wide still possible" | R4 |
| › "expiry: label shows the zone; empty → no expires_at; set → ends in Z; past → field error and no POST" | AC1 |
| › "admin:super-admin selected → expiry disabled with 'admin:super-admin can't expire' and cleared" | AC1 |
| › "non-privileged grant: one POST on Submit; double-click sends one; pending 'Granting…', close blocked" | R9 |
| › "privileged (or admin app) → confirm phase names user, role, app, scope and the admin:* note; Back sends nothing; Confirm sends one POST" | R9 |
| › "admin app + self target → Submit aria-disabled with the self reason, no POST; stoktok + self → allowed" | Self guard |
| › "disabled target user → note 'This account is disabled; they can't sign in until it is re-enabled.'; submit still allowed" | appsec F8 |
| › "403 admin_wildcard_required → inline ForbiddenPanel; 422 expires_in_past → expiry field error focused; 422 unknown_org → org field; 422 unknown_role → role field + role list refetched; 409 conflict → alert; 404 → alert; network → couldn't-confirm alert, no auto retry" | AC3 |
| › "the effect hint shows under the summary before Submit" | AC4 |
| `role-assign-dialog.test.tsx` (role fixed) › "title names role and app; no app or role selects" | AC1 |
| › "search fires on Search or Enter only, trims, never sends an empty email; 1 result is not auto-selected; Submit aria-disabled until chosen" | AC1, F1 |
| › "editing the text after a selection clears it" | F1 |
| › "slow response for 'an' resolved after searching 'ann' does not show or select 'an' rows" | F1 |
| › "selection shows 'Selected: {email} (Change)'; POST path uses that row's id" | F1 |
| › "'More than 10 users match. Refine the search.' when total > 10; 'No users match.' when empty; search 403 → inline panel" | States |
| › "a display name with '<b>x</b>' and U+202E renders as literal text inside bdi" | R6 |
| › "the email never appears in a toast, the router URL or a request other than the users search" | R5 |
| `role-assignment-revoke-dialog.test.tsx` › "names 'Ada (ada@x)' in bdi, 'Viewer (stoktok:viewer)', 'stoktok' and 'Acme Corp' (org fetched) / 'App-wide'; role name falls back to the key when the lookup fails" | AC2 |
| › "org lookup 403 or organizations.view denied → 'Organization {id}', no org request" | AC2 |
| › "shows assignmentEffect for the app" | AC4 |
| › "Cancel sends no DELETE; confirm sends one DELETE (double click too); close blocked while pending" | AC2, R9 |
| › "admin:super-admin row → adds 'The API refuses to revoke the last active super admin.'" | identity F4 |
| › "409 last_super_admin inline, dialog stays open; 403 admin_wildcard_required / self_assignment_forbidden inline panel; 404 → onDone('gone') + notice; unknown outcome → may-have-been-applied text" | AC3 |
| › "privileged role (from the role lookup) with admin:* denied → Confirm aria-disabled with 'Needs admin:*'" | Guard |
| `role-holders-sheet.test.tsx` › "title 'Assignments of {name} ({key})', description says total counts assignments" | AC5, F11 |
| › "loading status; empty 'No one holds this role.'; error + Retry; 403 inline panel; 404 'This role or app no longer exists.' + roles list invalidated" | AC5 |
| › "rows: display name + email in bdi, user status badge (Disabled), scope, expiry with zone, 'Not expired' / 'Expired' (never 'Active')" | AC5 |
| › "status line '{total} assignments'; pager 20 per page, Next offset=20, clamp" | AC5 |
| › "Assign button (roles.assign) opens the dialog with the role fixed; success refetches holders and shows the effect notice; focus back to the heading" | AC1, AC4 |
| › "no Revoke control in the sheet" | Scope |
| `roles-table.test.tsx` › "Assignments item shown with admin:users:read; hidden when admin:users:read is denied; opens the holders sheet" | R4 |
| `e2e/pages.e2e.ts` › "role assignments: ada sheet → Assign role stoktok:viewer (one POST, exact body); row shown; effect note; axe; revoke confirm names ada and stoktok:viewer, Cancel sends no DELETE, Confirm sends one; roles → stoktok:viewer → Assignments sheet passes axe; no email in any request URL other than /users?email=" | E2E |

## Approach

### 1. Order of work
1. Registry entry.
2. `assignments.ts`, the error mappers, the `data.ts` helper and their tests.
3. Query keys, options and mutations in users and roles, with tests.
4. Pickers and the assign dialog.
5. The revoke dialog.
6. `UserRoleAssignments`, and the move out of the sheet.
7. Holders sheet, row action and dialogs host.
8. e2e.
9. Run all checks.

### 2. Queries and keys (R2, R9)

**Users** (`users/api/queries.ts`)
- **Keys:**
  - `usersKeys.roleAssignmentsAll(id) = [...detail(id), 'role-assignments']`
  - `roleAssignments(id, p) = [...roleAssignmentsAll(id), {limit, offset}]` (same shape as today)
  - `userPicker(email) = [...usersKeys.all, 'picker', {email, limit: 10, offset: 0}]`
- **`ASSIGNMENTS_PAGE_SIZE = 20`.**
- **`userRoleAssignmentsQueryOptions(id, params, api)`.** `placeholderData` keeps the previous page only when `prevQuery.queryKey[2] === id`.
- **`PICKER_GC_TIME_MS = 5_000`.**
- **`userPickerQueryOptions(email, api)`:**
  - `GET /api/v1/users` with `{email, limit: 10, offset: 0}`;
  - **no** `placeholderData`;
  - `gcTime: PICKER_GC_TIME_MS`;
  - passes the `signal`.
- **`orgPickerQueryOptions(q, api)`:**
  - `GET /api/v1/organizations` with `{q, limit: 10, offset: 0, sort: 'name'}`;
  - key `[...organizationsKeys.all, 'picker', {q}]`, so organization writes invalidate it;
  - no placeholder; short `gcTime`.
- **Mutations.** Shared `useAssignmentMutationOptions()`:
  - `meta: {handlesOwnErrors: true}`, `retry: false`, never optimistic, no cache writes.
  - It invalidates `usersKeys.roleAssignmentsAll(userId)` and `rolesKeys.holdersOf(app)`, taking `userId` and `app` from the mutation **variables**:
    - on success;
    - on 404, 409 and `isUnknownOutcome`.
  - 422 `unknown_role` also invalidates `rolesKeys.all(app)`.
  - Revoke 404 also invalidates `usersKeys.detail(userId)`, because the user may be gone.
  - `['me','permissions']` is **not** invalidated (Assumption A7).
- **`useAssignRoleMutation(api)`.** Variables `{userId, app, body: AssignmentCreate}`. POST to `/api/v1/users/{user_id}/role-assignments`. The body includes `org_id` / `expires_at` only when set.
- **`useRevokeAssignmentMutation(api)`.** Variables `{userId, app, assignmentId}`. DELETE.
- The user id is a variable (not a hook argument) because in the holders sheet it is picked.

**Roles** (`roles/api/queries.ts`)
- **Keys:**
  - `rolesKeys.holdersOf(app) = [...all(app), 'holders']`
  - `holders(app, roleId, p) = [...holdersOf(app), roleId, {limit, offset}]`
  - `allDefinitions(app) = [...all(app), 'all']`
- **`allRoleDefinitionsQueryOptions(app, api)`.** Same loop and cap as `appAllPermissionsQueryOptions`, over `GET …/role-definitions?limit=100&offset=n`.
- **`HOLDERS_PAGE_SIZE = 20`, `HOLDERS_GC_TIME_MS = 5_000`.**
- **`roleHoldersQueryOptions(app, roleId, p, api)`:**
  - `placeholderData: (prev, q) => q?.queryKey[2] === app && q?.queryKey[5] === roleId ? prev : undefined`;
  - `gcTime: HOLDERS_GC_TIME_MS`.

### 3. `users/data/assignments.ts`
- **Aliases** from `components['schemas']`: `Assignment = AssignmentRead`, `AssignmentCreate`, `RoleHolder = RoleHolderRead`.
- **Effect copy:**
  ```ts
  // Production access tokens last 12 h (org-admin-api ADR-0005, USR-13 amendment
  // 2026-11-17). App roles are copied into app tokens when minted (ADR-0001);
  // admin permissions are read on every request. Pinned by assignments.test.ts.
  export const APP_TOKEN_MAX_HOURS = 12
  export function assignmentEffect(app: string): string
  ```
  - `admin`: "This takes effect on their next admin request."
  - Other apps: `Users already signed in to ${app} may keep (or not yet get) this change until their current token expires, up to ${APP_TOKEN_MAX_HOURS} hours.`
- **Expiry:**
  - `toExpiresAt(local, now = new Date())` returns `{ok: true, value: string | null} | {ok: false, error}`.
    - Empty → `null`.
    - Invalid → error.
    - Round-trip re-format mismatch (DST gap) → "This time doesn't exist in your time zone."
    - `<= now` → "Pick a time in the future."
    - Otherwise `new Date(local).toISOString()`.
  - `zoneLabel()` → `${Intl.DateTimeFormat().resolvedOptions().timeZone}, UTC±hh:mm`.
  - The client check is advisory; the server clock decides `expires_in_past`.
- **`scopeLabel(orgId, orgName?)`.**
- **`SUPER_ADMIN_ROLE_KEY`:** import it from `roles/data/role-schema.ts`.

### 4. Error mappers (`users/data/errors.ts`; ADR 0004)
**Reuse** `message`, `fallback`, `firstReason`, `bodyFields`, `isUnknownOutcome`, `FormError` and `AppAlert` from `apps/data/errors.ts`, and `isForbidden`/`forbiddenCopy` from `src/lib/forbidden.ts`. The server `message` is never rendered.

**`assignRoleError(error): FormError<'user' | 'role' | 'org' | 'expires_at'>`**, first match wins:

| Error | Field or alert | Copy |
|---|---|---|
| Unknown outcome | alert | couldn't-confirm |
| 403 | forbidden alert | `forbiddenCopy` |
| 409 (any) | alert | "This user already has this role in this scope, or it changed at the same time. The list was refreshed." |
| 422 `unprocessable` `org_id_not_allowed` | org | "This app doesn't use organizations; grant it app-wide." |
| 422 `unprocessable` `unknown_org` | org | "This organization no longer exists." |
| 422 `unprocessable` `expires_in_past` | expires_at | "This time is already past by the server's clock. Pick a later time." |
| 422 `unprocessable` `expiry_not_allowed` | expires_at | "admin:super-admin can't have an expiry." |
| 422 `unprocessable` `unknown_role` | role | "This role no longer exists. The role list was refreshed." |
| 422 `unprocessable`, any other reason | alert | `REJECTED` |
| 422 `validation_error` | fields from `bodyFields` (`role_id`→role, `org_id`→org, `expires_at`→expires_at) | Otherwise `REJECTED` |
| 404 | alert | "This user no longer exists." |
| anything else | alert | "Something went wrong. Try again." |

**`revokeAssignmentError(error)`** returns `{kind: 'gone'} | AppAlert`:

| Error | Result |
|---|---|
| 404 | gone |
| 403 | forbidden |
| 409 `last_super_admin` | "This is the last active super admin. Grant admin:super-admin to someone else first." |
| 409 other | "This assignment changed at the same time. The list was refreshed; try again." |
| Unknown outcome | "We couldn't confirm the revoke; it may have been applied. Check the list; revoking again is safe." |
| Other | "The API refused this revoke. Refresh the list and try again." |

### 5. `UserRoleAssignments` (user sheet, "Apps & roles")
**Props:** `{user: User, userId: string, open: boolean}`. It uses `useUsers().api`.

**Shape.** Follow `user-sessions-tab.tsx`:
- `offset` state, page size 20, keep-previous within the user, clamp when settled;
- the heading has `tabIndex={-1}` and a ref;
- a per-row button ref map by assignment id;
- a `focusAfter` ref plus effect;
- `queryView` states as today (copy unchanged);
- the pager "Showing a–b of total" with Previous/Next using `aria-disabled`.

**Columns:** App, Role, Scope (unchanged: "App-wide" or the org id in `<code>`), Expires, Expiry, and an sr-only "Actions" header.
- **Expires:** `formatDateTimeZone`, or "Never".
- **Expiry:** "Not expired" / "Expired". Rename from Active/Inactive: `active` is "not expired" (`schemas.py:294`).

**Header.** "Assign role" button under `<Can action='roles.assign'>`. It opens `RoleAssignDialog` with `target={kind: 'user', user}`. The user is captured when the dialog opens, and the dialog is mounted only while open.

**Per-row Revoke** (`<Can action='roles.revoke'>`):
- `aria-label="Revoke {role_key} in {app}"`.
- `aria-disabled` with a visible reason (`<span className='text-xs text-muted-foreground'>`) when:
  - the row is placeholder data;
  - `a.app === ADMIN_APP_KEY` and the target is self (`useSelfUserId()`, case-insensitive): "You can't change your own admin roles";
  - `a.app === ADMIN_APP_KEY` and `usePermissionSource().check('admin:*') === 'denied'`: "Needs admin:*". `unknown` fails open.
- Non-admin rows on self stay enabled. The API allows them; this is follow-up F3.

**Notice** (`role='status'`, persistent until the next action):
- After a successful grant or revoke: `"{Granted|Revoked} {role_key} in {app}. " + assignmentEffect(app)`.
- After `gone`: "This assignment no longer exists; it may already have been revoked. The list was refreshed."

**Toast:** "Role {role_key} granted in {app}." / "Role {role_key} revoked in {app}." No email (R5).

**Focus:**
- success → the heading;
- revoke cancel → the row's Revoke button, if still connected, else the heading;
- assign cancel → the Assign button.

**Sheet change.** `users-detail-sheet.tsx` only swaps in this component. The `<Can action='roles.viewAssignments'>` wrapper stays.

### 6. `RoleAssignDialog` (`role-assign-dialog.tsx`)
**Props:**
```ts
{
  api: ApiClient
  target:
    | { kind: 'user'; user: User }
    | { kind: 'role'; app: App; role: RoleDefinition }
  onDone: (r: { result: 'success'; app: string; roleKey: string } | { result: 'cancel' }) => void
}
```
It is a form `Dialog` (not `ConfirmDialog`), mounted only while open. Use react-hook-form + zod (as `role-create-dialog.tsx`) for `{appKey, roleId, orgId | null, expiresLocal}`. The pickers set values through `setValue`. The picked user lives in component state as `{id, email, display_name, status}`.

**Title:**
- user-fixed: "Assign a role to {display name}" (`<bdi>`), with a description line showing the email (`<bdi>`) and a status badge;
- role-fixed: "Assign {name} ({key})", with description "in {app name}".

**Fields, user-fixed:**
1. **App.** Select from `appsListQueryOptions({limit: 100, offset: 0}, api)`.
   - Options read `{name} ({key})`, plus " — disabled".
   - Show a note when total > 100.
   - 403 → inline `ForbiddenPanel`.
   - Changing the app resets role, org and expiry.
2. **Role.** Select from `allRoleDefinitionsQueryOptions(appKey, api)`, enabled when an app is chosen.
   - Option label `{name} ({key})`.
   - Privileged roles get the visible text " — needs admin:*". They are `disabled` when `check('admin:*') === 'denied'`.
   - Loading/error/403 shown inline, with Retry.

**Fields, role-fixed:**
- **User:** `<UserPicker>` (§7). App and role are shown read-only.
- **Picker permissions** (checked separately, never with the array form: `evaluateAll` is OR):
  - users search: `useActionPermission('users.view')`;
  - org search: `useActionPermission('organizations.view')`.
  - `denied` → show the reason text and disable that picker. A 403 is handled inline anyway.

**Fields, both modes:**
3. **Org.** Rendered only when `app.org_mode !== 'none'`.
   - A radio "App-wide" (default) / "One organization".
   - "One organization" reveals `<OrgPicker>`.
   - The body sends `org_id` only when an org is explicitly picked.
4. **Expiry.** `<input type='datetime-local'>` with `<Label>` "Expires (optional)" and hint "Your time zone: {zoneLabel()}. Leave empty for no expiry.", linked by `aria-describedby`.
   - Disabled and cleared when the role key is `admin:super-admin`, with the visible text "admin:super-admin can't expire."
   - Validated by `toExpiresAt` on submit.

**Notes under the fields:**
- Target user `status === 'disabled'` → "This account is disabled; they can't sign in until it is re-enabled."
- Self guard: `app === 'admin'` and the target id equals `useSelfUserId()` → "You can't change your own admin roles." Submit is `aria-disabled`.

**Summary line** (`aria-live='polite'`):
- Text: "Grant {role name} ({key}) in {app} to {display name} ({email}), {scope}{, until …}."
- Followed by `assignmentEffect(app)`.
- Submit stays `aria-disabled` until the user, role and valid expiry are set.

**Submit:**
- If the role is `privileged` or the app is `admin` → **confirm phase** inside the dialog (R9, appsec F3):
  - It repeats the summary, with user names in `<bdi>`.
  - It adds "This role gives admin-level access. Granting it needs admin:*."
  - Buttons "Back" and "Grant role".
- Otherwise POST directly.
- One POST guarded by an `inFlight` ref; `pendingText` "Granting…".
- `onOpenChange` ignores close while pending.

**Success:**
- toast (no email);
- `onDone({result: 'success', app, roleKey})`.

**Errors:** `assignRoleError` → `setError(field, …, {shouldFocus: true})`, or an inline alert (`role='alert'`) / `ForbiddenPanel variant='inline'`. The dialog stays open, and the confirm phase returns to the form. Nothing is retried automatically.

**R6.** Names, emails and keys render as text; user-supplied strings go in `<bdi>`.

### 7. Pickers (`assign-pickers.tsx`)
**`PickList<T>`** is the shared explicit-selection list:
- A labelled search input plus a "Search" button. The search is submitted on Enter or on the button, never while typing.
- The trimmed term must be non-empty. The org term is capped at 100 characters.
- The submitted term lives in state; the query runs on the submitted term.
- **Typing clears** both the selection and the submitted term (F1).
- Results render only when `query.queryKey` matches the current submitted term and `!isPlaceholderData`. Stale responses are therefore never shown or selectable. The query's `signal` cancels superseded fetches.
- Results are a `radiogroup` (`role='radiogroup'` with a label). **Nothing is pre-checked**, even with a single result. Selection stores the row's `id`, taken from the clicked row.
- States:
  - "Searching…" (`role='status'`);
  - "No {users|organizations} match.";
  - "More than 10 match. Refine the search." when `total > 10`;
  - 403 → inline panel;
  - error → Retry.
- After selection: "Selected: … (Change)".

**`UserPicker`** rows:
- `<bdi>{email}</bdi>`;
- display name (`<bdi>`) or "No display name";
- `UserStatusBadge`;
- a short id (the first 8 characters, in `<code>`).

**`OrgPicker`** rows: name (`<bdi>`), slug, and status.

**R5.** Search terms stay in component state and the API query string only. They never go in router search, toasts or logs.

### 8. `RoleAssignmentRevokeDialog` (`ConfirmDialog`, from `user-session-revoke-dialog.tsx`)
**Props:** `{api, user: User, assignment: Assignment, onDone: (r: 'success' | 'cancel' | 'gone') => void}`.

**Lookups.** They are non-blocking, and failures fall back silently:
- `roleDefinitionQueryOptions(app, role_id)` for the role name and `privileged`;
- when `org_id` is set and `organizations.view` is not denied, `organizationQueryOptions(org_id)` for the org name.

**Title:** "Revoke {role_key}?"

**Description:**
- "Revoke **{role name}** ({role_key}) in {app} from {display name} ({email}) — scope: {scopeLabel}?" User strings go in `<bdi>`.
- Then `assignmentEffect(app)`.
- For `admin:super-admin`, add "The API refuses to revoke the last active super admin."

**Confirm button.** "Revoke role", destructive, `pendingText="Revoking…"`, with an `inFlight` guard and close blocked while pending. It is `aria-disabled` with the reason "Needs admin:*" when the role (from the lookup) is privileged and `admin:*` is denied, or when it is an admin-app row on self. Normally the row button is already disabled in that case.

**Errors.** `revokeAssignmentError` inline. `gone` → `onDone('gone')`.

### 9. `RoleHoldersSheet` (roles screen)
**Props:** `{app: App, role: RoleDefinition, open, onOpenChange, returnFocus}`. `SheetContent` uses `onCloseAutoFocus` → `returnFocus`, the same pattern as the other role dialogs. The api comes from `useRoles()`.

**Header:**
- Title "Assignments of {name} ({key})".
- Description: "Who holds this role in {app name}. One user can be listed once per organization and once app-wide, so the count is of assignments, not people."
- `<Can action='roles.assign'>` "Assign" button → `RoleAssignDialog` with `target={kind: 'role', app, role}`.

**Query.** `roleHoldersQueryOptions(app.key, role.id, {limit: 20, offset}, api)`, enabled while open.

**States:**
- loading `role='status'` "Loading assignments…";
- empty "No one holds this role.";
- error `role='alert'` with Retry;
- 403 → `ForbiddenPanel variant='inline'`;
- 404 → "This role or app no longer exists." with no Retry, and invalidate `rolesKeys.all(app.key)`.

**Table.** Semantic, labelled by the title:
- User: display name and `<bdi>` email, plus `UserStatusBadge`;
- Scope: `scopeLabel(org_id)`, which gives "App-wide" or "Organization {id}";
- Expires (with zone) / "Never";
- Expiry: "Not expired" / "Expired".

**Paging.** A sr-only status "{total} assignments"; the sessions-tab pager and clamp.

**Notice and focus.** After an assign succeeds: notice `role='status'` with "Granted … " + `assignmentEffect(app.key)`, and focus moves to the heading. On cancel, focus goes to Assign.

**Not included:**
- no Revoke in this sheet (follow-up F6);
- no emails in toasts or keys;
- no links carrying emails.

**Row action and host** are as in the files table.

### 10. E2E
**`fake-api.ts`:**
- A per-install `assignments: Record<userId, AssignmentRead[]>`, empty at start.
- `GET /users/{id}/role-assignments` serves `page(assignments[id], query)`.
- `POST /users/{id}/role-assignments` for every user:
  1. Find the role by `role_id` across `ROLES`; none → 422 `unprocessable` with `[{field: 'role_id', reason: 'unknown_role'}]`.
  2. The same role and org already exists → 409 `conflict`.
  3. Otherwise push a row (fixed id `eeeeeee{n}-…`, `granted_by: SELF_USER_ID`, `active: true`, `created_at: stamp`) and return 201.
  4. Register the row's `DELETE` route, which returns 404 once the row is gone.
- `GET /apps/{key}/role-definitions/{role_id}/assignments` for each role: a page of `RoleHolderRead` built by joining `assignments` with `USERS`.

**`pages.e2e.ts`, new test:**
1. `signIn('/users')` and open ada's sheet.
2. "Assign role": pick Stoktok, then `stoktok:viewer`. No org field is shown (stoktok `org_mode` none). Run axe on the dialog. Submit.
3. Expect exactly one POST with body `{"role_id": <viewer id>}`. The row appears, and the status text contains "up to 12 hours".
4. Revoke: the confirm contains `ada@people.e2e.test` and `stoktok:viewer`. Cancel → no DELETE. Confirm → one DELETE, and the row leaves.
5. Go to `/roles?app=stoktok` → Actions for stoktok:viewer → Assignments. The sheet shows "No one holds this role." Run axe.
6. Assert that no request URL except `GET /api/v1/users?email=…` contains an email.

### Rules
- **R1:** data from the API only. Names the API does not return are looked up from existing endpoints or shown as ids; no faking.
- **R2:** generated types only; HTTP only through `src/api`; Page params ≤ 100.
- **R3:** unchanged.
- **R4:**
  - `<Can>` on `roles.assign`, `roles.revoke`, `roles.viewHolders` and `roles.viewAssignments`;
  - separate `useActionPermission` calls for the pickers;
  - `admin:*` and self are advisory (unknown fails open);
  - every 403 is rendered.
- **R5:**
  - no email in toasts, router URLs, holders keys or logs;
  - picker terms only in component state and the API query string;
  - short `gcTime` on picker and holders data.
- **R6:** text only; `<bdi>` for user-supplied strings.
- **R7:** no holders revoke; no filters; no org names in tables; no `me/permissions` changes.
- **R8:** the tests above, plus all checks.
- **R9:**
  - confirmation for revoke and for privileged or admin grants, naming the user, role, app and scope;
  - the plain grant form shows an explicit summary;
  - never optimistic; `retry: false`; in-flight guards;
  - invalidate on success, 404, 409 and unknown outcome.
- **R10:**
  - labelled inputs with linked errors;
  - radiogroup pickers;
  - `aria-disabled` with visible reasons;
  - live regions;
  - focus return;
  - semantic tables.

## Specialist input used
**api-platform-engineer.** Adopted:
- the endpoint, permission and error tables;
- 422 by `details[].reason`;
- `unknown_role` and 404;
- replace-in-place refetch (we never key on a new id);
- the `roles.viewHolders` entry;
- the "build, not keep" correction;
- full role-definition paging;
- the `active` wording;
- `no-store` → short `gcTime`;
- the user-sheet pager;
- the follow-ups.

Changed:
- the AC4 copy follows the orchestrator's wording;
- `me/permissions` invalidation is dropped (A7).

**frontend-developer.** Adopted:
- the move to `user-role-assignments.tsx`;
- the shared assign dialog with a fixed user or fixed role;
- separate revoke dialog on `ConfirmDialog`;
- no `keepPreviousData` in pickers;
- local dialog state, not `UsersProvider`;
- the `focusAfter` pattern;
- the holders sheet in `roles-dialogs.tsx`;
- invalidating `roleAssignmentsAll` rather than `detail`;
- the e2e plan.

Changed:
- search fires on explicit Search or Enter, not on debounce: a fixed request per term, deterministic tests, and less PII traffic;
- the row action uses `roles.viewHolders`, not `roles.viewAssignments`;
- the "15 minutes" copy is replaced.

**identity-access-engineer.** Adopted:
- the 12 h finding and the one constant;
- admin-app "next admin request";
- `privileged` from role-definitions with `admin:*` `denied` → disable, `unknown` → open;
- the self guard on admin rows only;
- separate permission checks (OR semantics);
- the super-admin revoke note;
- `forbiddenCopy` reuse;
- `me/permissions` not needed.

**appsec-engineer.** Adopted:
- F1 explicit selection by id, with text change clearing it and stale responses ignored;
- F2 reason mapping;
- F3 confirmation for revoke and privileged grants, naming the user with display name + email;
- F4 disabled with text reasons;
- F5 no emails in toasts or URLs, short `gcTime`;
- F6 datetime-local with the zone labelled, future and valid checks, `Z` offset, super-admin disabled;
- F7 `<bdi>`;
- F8 disabled-user note;
- F11 "assignments" wording.

Deferred:
- `formatDateTime` zone app-wide (follow-up F8); new code uses `formatDateTimeZone`.

## Assumptions
- **A1. AC4 wording (owner decision via orchestrator, 2026-11-18).** The production TTL is 12 h, so the copy never says "15 minutes".
  - Non-admin apps: "Users already signed in to {app} may keep (or not yet get) this change until their current token expires, up to 12 hours."
  - Admin app: "This takes effect on their next admin request."
  - The ticket AC4 text and admin-pan `docs/adr/0003-auth-client-integration.md:21` (which says 15 min) are out of date. Recorded as follow-up F1; not edited here (R7).
- **A2. AC3.** The 422 reasons are read from `details[].reason` (code `unprocessable`). 422 `unknown_role` and 404 are added to the mapping.
- **A3. Entry points.** There is one shared assign dialog.
  - User sheet: the user is fixed; pick app, role and org.
  - Holders sheet: the role is fixed; pick the user.
  - Revoke only from the user sheet.
- **A4. Org scope on `org_mode = 'required'` apps.** "App-wide" stays the default. The API does not force `org_id` (`service.py:1511-1517`), and it decides.
- **A5. Grant confirmation.** A separate confirm step only for privileged roles or the admin app. Plain grants show an explicit summary next to Submit.
- **A6. User-sheet paging is in scope.** It is small: it copies the sessions pager and removes the 100-row cap that hid revoke targets.
- **A7. `['me','permissions']` is not invalidated.** A grant or revoke cannot change the caller's own admin permissions (self admin changes are forbidden; other apps don't feed admin permissions).
- **A8. Picker search** needs explicit Search or Enter, returns 10 results per search, and has no paging inside the picker ("refine the search").
- **A9. Disabled users and apps** can be targeted, since the API allows it. A note is shown.
- **A10. Holders sheet scope** shows the org id, not the name (names in `AssignmentRead`/`RoleHolderRead` are follow-up F4). It has no `active`/`org_id` filters (follow-up F7).
- **A11. UI copy is English** (spec §8 Q3 open).
- **A12. Size.** This is about 1,600–2,000 changed lines with tests, above the ~400 guide. It is one spec feature (§5.4 assignments), the owner already split it out of PAN-015, and it follows established patterns (PAN-015b shipped at a similar size). Fallback in the Split proposal.

## Blocking questions
None.

## Split proposal
Not needed up front (A12). **Fallback, if a rework runs long** (the orchestrator decides only after a REWORK): move the holders sheet (§9), its row action and the `roles.viewHolders` entry into PAN-015d. In that case the role-fixed mode of the assign dialog ships with it. User-sheet assign and revoke stay in this ticket.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/users` → detail sheet → "Apps & roles" | `admin:users:read` (`roles.viewAssignments`); assign/revoke `admin:roles:assign` (+ `admin:*` for privileged, advisory) | "Loading role assignments…"; "No role assignments."; alert + Retry; inline 403; paged table (20); notice; self/admin:* reasons | Assign role → `POST …/role-assignments`; Revoke → confirm → `DELETE …/role-assignments/{id}` | `['users','detail',id,'role-assignments']`, `['apps','detail',app,'roles','holders']` (+ user detail on revoke 404; + `['apps','detail',app,'roles']` on 422 `unknown_role`) |
| Assign dialog (both modes) | `admin:roles:assign`; lookups: `admin:apps:read` (apps, roles), `admin:users:read` (user search), `admin:organizations:read` (org search) | Each lookup has loading / empty / error / 403 inline; pending (close blocked); field errors; inline alert/403; confirm phase for privileged grants | `POST /users/{id}/role-assignments` | as above |
| Revoke confirm | `admin:roles:assign` | Pending; inline 409/403/unknown; 404 → gone notice | `DELETE /users/{id}/role-assignments/{aid}` | as above |
| `/roles?app=` → row "Assignments" → holders sheet | `admin:users:read` (`roles.viewHolders`) | "Loading assignments…"; "No one holds this role."; alert + Retry; inline 403; 404 role/app gone; paged (20); notice after assign | Assign → assign dialog (role fixed) | `['apps','detail',app,'roles','holders']`, user's assignments |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/users/{user_id}/role-assignments` | `limit=20`, `offset` | `Page_AssignmentRead_` | 403, 404, other | USR-03 |
| POST | `/api/v1/users/{user_id}/role-assignments` | `AssignmentCreate {role_id, org_id?, expires_at? (ISO, Z)}` | `AssignmentRead` (201) | 403 `admin_wildcard_required` / `self_assignment_forbidden` / other; 409 `conflict`; 422 `unprocessable` reasons `org_id_not_allowed` / `unknown_org` / `expires_in_past` / `expiry_not_allowed` / `unknown_role`; 422 `validation_error`; 404; unknown outcome | USR-03, USR-16 |
| DELETE | `/api/v1/users/{user_id}/role-assignments/{assignment_id}` | — | 204 | 404 (gone); 409 `last_super_admin` / `conflict`; 403 both codes / other; unknown outcome | USR-03 |
| GET | `/api/v1/apps/{key}/role-definitions/{role_id}/assignments` | `limit=20`, `offset` | `Page_RoleHolderRead_` | 403, 404, other | USR-17 |
| GET | `/api/v1/apps/{key}/role-definitions` | `limit=100`, `offset` (all pages) | `Page_RoleDefinitionRead_` | 403, 404, other | USR-16 |
| GET | `/api/v1/apps/{key}/role-definitions/{role_id}` | — (revoke confirm name/privileged) | `RoleDefinitionRead` | any → fall back to key | USR-16 |
| GET | `/api/v1/apps` | `limit=100`, `offset=0` | `Page_AppRead_` | 403, other | USR-02 |
| GET | `/api/v1/users` | `email` (trimmed, non-empty), `limit=10`, `offset=0` | `Page_UserRead_` | 403, other | ADM-002 / USR |
| GET | `/api/v1/organizations` | `q` (1..100), `sort=name`, `limit=10`, `offset=0` | `Page_OrganizationRead_` | 403, other | ADM-020 |
| GET | `/api/v1/organizations/{org_id}` | — (revoke confirm org name) | `OrganizationRead` | any → fall back to id | ADM-001 |

Not used: the holders `active`/`org_id` filters; `GET /me/permissions` invalidation.

## Follow-ups (record in ticket / backlog; not in this diff)
- **F1. Owner/admin-pan.** Update the ticket's AC4 wording, and `docs/adr/0003-auth-client-integration.md:21` ("valid up to 15 minutes after logout or a role change"), to the 12 h production TTL and admin-request semantics.
- **F2. org-admin-api.** Document 404 and 409 on `POST /users/{id}/role-assignments` and 404 on DELETE in the OpenAPI.
- **F3. org-admin-api.** Decide whether `self_assignment_forbidden` should cover all apps, or at least privileged roles in any app. Today a staff member with `admin:roles:assign` can grant themselves non-admin product roles (separation of duties).
- **F4. org-admin-api.** Return role name and org name (or slug) in `AssignmentRead` / `RoleHolderRead`, so the UI shows names instead of ids without extra lookups.
- **F5. org-admin-api.** An exact-email user lookup (e.g. `email_exact=`) to reduce wrong-user picks from substring matches.
- **F6. admin-pan.** Revoke from the holders sheet, using the row's `user_id` and `id`, and naming that holder.
- **F7. admin-pan.** Holders sheet filters (`active`, `org_id`), and a link from a holder row to the user sheet by id.
- **F8. admin-pan.** Time zone in `formatDateTime` across the app. The `/users` list query key keeps the typed email; consider a short `gcTime`.
- **F9. admin-pan.** Rename the registry key `roles.viewAssignments` → `users.viewRoleAssignments` for clarity.
