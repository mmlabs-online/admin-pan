## PAN-015c consult: api-platform-engineer (read-only)

**Consult report for PAN-015c (api).** I checked the ticket's ACs against org-admin-api at 0757c27, `src/api/schema.d.ts` (the generated types in admin-pan) and existing admin-pan code. Two ACs need correcting (the "15 minutes" note and the "keep the holders sheet" premise). Several details are missing from the ACs.

## Findings

**Endpoints (org-admin-api `app/modules/rbac/`)**
- `GET /users/{user_id}/role-assignments?app=&limit=&offset=`
  - Permission `admin:users:read` (`assignments_router.py:25-39`).
  - Returns `Page[AssignmentRead]`: `id, app, role_id, role_key, org_id|null, granted_by|null, expires_at|null, active, created_at`.
  - Order is `created_at desc, id`. 404 if the user is missing. admin-pan already reads it with `limit=100` (`src/features/users/api/queries.ts:18,97-112`).
- `POST /users/{user_id}/role-assignments` (`assignments_router.py:42-55`)
  - Permission `admin:roles:assign`. Body `{role_id, org_id?, expires_at?}`, `extra=forbid`. `expires_at` is an `AwareDatetime` (`schemas.py:275-283`).
  - Returns 201 `AssignmentRead`.
- `DELETE /users/{user_id}/role-assignments/{assignment_id}` returns 204. Permission `admin:roles:assign`. The row is scoped to the user, so another user's assignment id gives 404 (`repository.py:595-606`).
- `GET /apps/{key}/role-definitions/{role_id}/assignments?active=&org_id=&limit=&offset=` (`router.py:254-281`)
  - Permission `admin:users:read`. Returns `Page[RoleHolderRead]`, which is `AssignmentRead` plus `user_id, email, display_name, user_status`.
  - It sets `Cache-Control: no-store` because rows carry emails. `total` counts assignments, not distinct users (the same user can appear once per org and once app-wide).
  - 404 for an unknown app, or a role that is not of that app.
  - `active` here means "not expired" only. It ignores user, org and app status, and the schema says it is "not effective in tokens" (`schemas.py:306-311`). The UI must not label it "can sign in" or "effective".
- `GET /users?email=` (`users/router.py:26-41`, `users/repository.py:72`)
  - **The match is a case-insensitive substring (`ilike %x%`), not exact.** Results are `Page[UserRead]`, `email` min 1 and max 254, and an empty value is 422.
  - This is the reason for the "pick explicitly" AC, and it is correct. Never auto-select even when there is exactly one hit, and show the full email (and status) in each choice.

**Errors (envelope `{error:{code,message,details}}`)**

All the ticket's codes exist and match the API.

| Status | Code | Cause (`rbac/service.py`) |
|---|---|---|
| 403 | `admin_wildcard_required` | `details:{required:"admin:*"}`. Any grant or revoke on the admin app, or on a role holding an `is_admin` permission, needs `admin:*` on top of `admin:roles:assign` (`service.py:1557-1566`). |
| 403 | `self_assignment_forbidden` | Admin app only, `user_id == actor`. Super-admins are included. |
| 403 | plain missing permission | A different code. A generic fallback is needed. |
| 409 | `last_super_admin` | Revoke only (`service.py:1581-1587`). |
| 409 | `conflict` | "Role is already assigned" when an active duplicate exists for (user, role, org). The same code is used for "Assignment was changed concurrently". Branch on the message only for display. |
| 422 | `org_id_not_allowed` | The app's `org_mode` is `none`. |
| 422 | `unknown_org` | |
| 422 | `expiry_not_allowed` | `admin:super-admin` cannot expire. |
| 422 | `expires_in_past` | |
| 422 | `unknown_role` | **Missing from the AC.** The role was deleted; the response has `details[0].reason="unknown_role"`. |
| 404 | `not_found` | Unknown user on assign (message "User not found"). Unknown assignment on revoke ("Assignment not found"). |
| 422 | `validation_error` | Naive datetimes, bad UUIDs or extra fields. |

- Each 422 is `UnprocessableError` with `details:[{field, reason}]`. `code` is `unprocessable`, so the 422 reasons are in `details[0].reason`, not in `error.code` (`errors.py:42-49`, `service.py:1350`). The 403 and 409 codes are in `error.code`.
- The mapper must read both `code` and `details[0].reason`. admin-pan's existing `firstReason` helpers (`src/features/roles/data/errors.ts:92`) already do this.
- Guard-denied attempts are audited as `denied`. That is not UI-visible.

**Replace-in-place.** Re-assigning an expired duplicate succeeds with 201 and reuses the same assignment `id` and `created_at` (`service.py:1530-1541`). The UI must refetch the list and must not assume a new row. It is not a 409.

**Snapshot typing gaps (`src/api/schema.d.ts`)**
- The assign operation documents only 201/401/403/422 (`:5887-5931`). The real 404 and 409 are undocumented. Revoke documents 409 but not 404 (`:5934-5990`).
- With `openapi-fetch`, handle errors by status and code at runtime through `unwrap` and `isApiError`, not by the typed error union. Add tests that return 404 and 409 on assign.
- `AssignmentCreate` (`:1074-1084`) types `expires_at` and `org_id` as plain `string | null`. The UI has to enforce the offset itself.

**Auth and effect timing**
- The admin app's own authorization is resolved per request in `AdminAuthService.principal` (`admin_auth/deps.py:85`). A role change to the `admin` app therefore takes effect on the next admin request, not after a TTL. admin-pan's existing sessions copy says the same (`src/features/users/data/sessions.ts:1-12`).
- **The AC's "15 minutes" is wrong for production.**
  - `ACCESS_TOKEN_TTL_SECONDS` defaults to 900, but production sets 43200 (12 h), per `docs/consumers.md:158,395`, `docs/deploy.md:224`, ADR-0005 and `.env.example:62`.
  - The existing admin-pan copy already says "up to 12 hours".
  - The note must say "until the user's current access token for that app expires, up to 12 hours", not "within 15 minutes". Do not hard-code a number as a promise. Reuse the style pinned in `sessions.test.ts`.
  - For `admin` app roles, say it applies on the next admin request.

**admin-pan code state**
- The permission registry (`src/lib/permissions/registry.ts:177-188`):
  - `roles.viewAssignments` is `admin:users:read` mapped to `GET /users/{id}/role-assignments`.
  - `roles.assign` and `roles.revoke` are `admin:roles:assign`.
  - There is **no** action for the holders endpoint. Add `roles.viewHolders` (`admin:users:read`, `GET /api/v1/apps/{key}/role-definitions/{role_id}/assignments`). Do not reuse `roles.viewAssignments`, which names a different endpoint.
- `src/features/users/components/users-detail-sheet.tsx:189-278` has `RoleAssignments` as a read-only table.
  - It fetches only the first 100 rows and shows "Showing N of total" beyond that.
  - There is no pager, so a user's revoke target past row 100 is unreachable.
  - There is no actions column.
  - It shows `a.org_id` as a raw UUID and `a.app` and `role_key` as raw keys.
  - The whole section is wrapped in `<Can action='roles.viewAssignments'>`.
- **The roles feature has no "per-role Assignments sheet" today.**
  - `src/features/roles/components/roles-row-actions.tsx:55-102` offers only Permissions, Rename, Set as default and Delete.
  - `roles-columns.tsx:6` says "No Assignments column: the API has no assignment count".
  - There is no assignments or holders code in `src/features/roles/`.
  - The ticket's "keep the per-role sheet" is therefore a build, not a keep. The goal text and the plan should say so (the owner note at ticket line 36 also assumes it exists).

## Recommendations

1. **AC1 (assign).** Keep it, and add these points.
   - Reuse `GET /users?email=` with a debounced input of at least 1 character. Never send an empty value.
   - Show a result list of `email`, `display_name` and `status`, and require an explicit click. Disabled users can be picked, since the API allows it (`_grant_locked` has no status check). Show a status badge.
   - The role picker comes from `GET /apps/{key}/role-definitions` for the chosen app, paginated with `limit` ≤ 100. Page through all roles, as PAN-015b does for permissions. The app picker needs `org_mode` from the app object.
   - Show the org picker only when `app.org_mode !== 'none'`. It is optional, because `org_id` null means app-wide. The org list is `GET /organizations` (paginated, likely `admin:organizations:read`; confirm the permission). Use a searchable, paginated picker, never "first 100".
   - Expiry uses a datetime-local input converted with `new Date(v).toISOString()`, which always has an offset (`Z`). Block past values in the UI as a hint only; the API's `expires_in_past` is the truth. For `admin:super-admin`, hide the expiry field as an advisory hint (`expiry_not_allowed`).
   - Hide or disable the whole Assign control without `roles.assign`. Roles of the admin app or roles with admin permissions may need `admin:*`, which the UI cannot know, so always handle 403 inline.
2. **AC2 (revoke).**
   - Confirmation names the user's email, `app`, `role_key` and the scope (app-wide, or the org name or id).
   - It is non-optimistic and has a single-flight guard (the same double-click pattern as `user-session-revoke-dialog.tsx`).
   - On 404, invalidate and show "already revoked". On `last_super_admin` or `self_assignment_forbidden`, show inline and keep the dialog open.
   - Revoking an expired or inactive row is allowed and works.
3. **AC3 (errors).** Add `422 unknown_role` and `404 user/assignment not found` and a generic 403, 401 and network or unknown-outcome fallback. Map by `error.code` first, then `details[0].reason` for 422. Show the API `message` for `conflict`. Put the mapper in `src/features/users/data/errors.ts`, with tests like the existing `errors.test.ts`.
4. **AC4 (propagation note).** Replace "15 minutes" with the wording above: ≤ 12 h in production for other apps, next request for the admin app. Pin the copy with a test, and never say "immediately". Show it for every successful grant or revoke on a non-admin app, in the success status region.
5. **AC5 (holders sheet).**
   - Add the new `roles.viewHolders` registry entry and a `roleHoldersQueryOptions` with a paged query. The key must include `app`, `role_id`, `active` and `org_id`, and `placeholderData` must not cross roles.
   - Render `email`, `display_name`, `user_status`, scope, expiry and `active` ("Not expired" or "Expired"). Page with the repo's pager and clamp an empty page (like `UserSessionsTab`).
   - Add `gcTime` of a few seconds like sessions: the rows hold emails and the response is `no-store`.
   - Optionally add an active filter (`active=true|false`) and an org filter.
   - Handle 404 as "role no longer exists" and refetch the list.
   - Test loading, empty, error, 403 and 404.
   - Each holder row can link to the user sheet or `/users?email=` (never put the full email in a URL per R5, so use the user id).
6. **AC6 (tests).** Cover these cases in the injected-fetch mock:
   - 201 assign with the request body (`expires_at` ends in `Z` or an offset, `org_id` absent when the app is `none`).
   - Each 403, 409 and 422 case, including `unknown_role`.
   - The replace-in-place 201 refetch.
   - Revoke 204, and 404 and 409 on revoke.
   - Search results are never auto-picked, including the case of a single hit.
7. **Data layer.** Add `useAssignRoleMutation` and `useRevokeAssignmentMutation`, both with `retry:false` and `meta.handlesOwnErrors`. Invalidate `usersKeys.detail(userId)` (which covers `role-assignments`) and the holders keys of the affected role. Also invalidate `['me','permissions']` when the app is `admin` and the target is the current user (not possible for self, since the API forbids it, but other admins' changes don't matter). Treat unknown-outcome errors by refetching, like `useSessionRevokeOptions`.
8. **Pager in the user sheet.** Raise the 100-row limitation. Either page the user's assignments with the Page contract, or at least show a pager when `total > items.length`. Otherwise revoke is impossible for the 101st assignment.
9. **Follow-ups for org-admin-api (R1 and R7, do not fake in UI).**
   - Document 404 and 409 on assign and 404 on revoke in the OpenAPI.
   - Consider returning role and org names in `AssignmentRead`. Today the UI shows raw org UUIDs and has to join with the org and app lists.

## Risks

- **Wrong propagation wording** if "15 minutes" ships. It would be false in production (12 h).
- Role-assignment rows on the holders sheet expose emails. Do not log or cache them long term (R5). The API sends `no-store`.
- Substring search could lead to granting to the wrong account (for example `ann@x.com` versus `joann@x.com`). Explicit selection and full email display mitigate this. Also show the email in the success toast and the confirmation.
- Privileged grants fail with 403 for staff without `admin:*`. Hiding controls from the registry alone will not cover this, so the 403 inline handling is mandatory (R4).
- The 100-row cap on the user's assignments can hide revoke targets.
- Concurrency: the API serializes on an app lock, so rare `conflict` ("changed concurrently") can happen. Show a refetch hint.
- The `active` flag can mislead (see above).

## Open questions

1. Confirm the roles screen has no holders sheet today (I found none), so PAN-015c builds it. Is the owner fine with that?
2. Which permission does `GET /organizations` need for the org picker, and should the assign form hide the org field if the admin lacks it?
3. Should assign allow picking `admin` app roles in this ticket? It requires `admin:*`, and `self_assignment_forbidden` and `last_super_admin` apply. The AC covers it, but confirm it is in scope.
4. Should the holders sheet show disabled users (the API lists them) with a badge, or filter them out client-side? Recommend show with a badge.
5. Is paging the user's assignments in scope here (see recommendation 8)?

Files: /home/user/admin-pan/work/tickets/PAN-015c/ticket.md, /home/user/admin-pan/src/features/users/components/users-detail-sheet.tsx, /home/user/admin-pan/src/features/users/api/queries.ts, /home/user/admin-pan/src/lib/permissions/registry.ts, /home/user/admin-pan/src/features/roles/components/roles-row-actions.tsx, /home/user/admin-pan/src/api/schema.d.ts, /home/user/org-admin-api/app/modules/rbac/service.py, /home/user/org-admin-api/app/modules/rbac/assignments_router.py, /home/user/org-admin-api/app/modules/rbac/router.py, /home/user/org-admin-api/app/core/errors.py.
