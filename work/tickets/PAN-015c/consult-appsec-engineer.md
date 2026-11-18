## PAN-015c consult: appsec-engineer (read-only)

## Security consult: PAN-015c, role assignments (assign, revoke, per-role holders)

I checked admin-pan's current code and org-admin-api at 0757c27. Nothing was edited.

**What the API does (confirmed in its code):**
- `POST /users/{id}/role-assignments` and `DELETE /users/{id}/role-assignments/{aid}` both need `admin:roles:assign`. Privileged roles also need `admin:*`. "Privileged" means the role is in app `admin`, or it holds an `is_admin` permission (`app/modules/rbac/service.py:1557-1566`).
- `self_assignment_forbidden` only applies to **admin-app** roles (`service.py:1565`).
- The 422 reasons are in `details[].reason`, not in the top-level `code` (`service.py:1350-1351`).
- Expiry is rejected for `admin:super-admin` and when it is in the past, judged by the database clock (`service.py:1518-1529`).
- Granting a role the user already holds but has expired just updates `expires_at` (`service.py:1530-1540`). A duplicate active grant is a 409 `conflict`.
- Assign checks only that the user exists, not their status or verification (`service.py:1423`).
- `GET /users?email=` is a **substring ILIKE** match (`app/modules/users/repository.py:72`).
- The holders endpoint sends `Cache-Control: no-store` because its rows carry emails (`app/modules/rbac/router.py:281`).
- `RoleDefinitionRead.privileged` is available as a UI hint (`app/modules/rbac/schemas.py:240-245`).

## Findings

🔴 **F1. Wrong-user risk in the user picker (substring match).** Typing `an@x.com` also matches `joan@x.com`.
- **Requirement:**
  - The picker shows a list of results with full email, display name, status badge and a short id.
  - Nothing is selected until the operator clicks or presses Enter on one row. This holds even when there is exactly one result or an exact match.
  - Changing the search text clears the selection.
  - The selection stores the user **id** taken from the row the operator chose, never "first item" or "last response".
  - Earlier searches are cancelled through the AbortSignal, or a late response is ignored by comparing the query text.
- **Tests:**
  - With 1 result, Submit stays disabled until that row is chosen.
  - Editing the text after a selection clears it.
  - A late response for an old query does not change the selection.
- **Assign from the user sheet:** the target user is fixed (`users-detail-sheet.tsx:190`, `currentRow.id`). Capture the id when the dialog opens. Do not read it from sheet state while the dialog is open.

🔴 **F2. Map 422 errors by `details[].reason`.** The AC lists `org_id_not_allowed`, `unknown_org`, `expires_in_past` and `expiry_not_allowed` as if they were codes. Matching on `error.code` will never hit them.
- **Fix:** reuse the `firstReason(error)` helper (used in `src/features/roles/data/errors.ts:92`) and show the error on the right field: org or expiry.
- **Naive timestamps:** Pydantic `AwareDatetime` rejects them with a generic validation 422. Never send one (see F6).
- **Test:** one test per reason, using the injected-fetch mock with `{"error":{"code":"validation_error","details":[{"field":"expires_at","reason":"expires_in_past"}]}}`.

🔴 **F3. R9 confirmation for revoke, and for privileged grants.**
- **Revoke confirm text** names:
  - the user: display name **and** email (the display name is user-chosen and can impersonate someone else);
  - the role: name and key;
  - the app;
  - the scope: org **name**, or "App-wide". A bare UUID is not enough.
- **Grant:** confirm when `privileged === true` or when the app is `admin`. The copy says the role grants admin access and needs `admin:*`. A grant changes access, so R9 applies to it too.
- **Mutations:** never optimistic. Keep `retry: false` (the default at `src/lib/query-client.ts:47`) and set `meta.handlesOwnErrors`.
- **Double submit:** disable the confirm/submit button and block closing via Esc or the overlay while `isPending`. Ignore a second submit while one is in flight.
- **Unknown outcome** (network failure or timeout, `isUnknownOutcome`): say "may have been applied". Invalidate, never auto-retry.
- **After success, invalidate:**
  - `usersKeys.roleAssignments(userId, …)`, i.e. `usersKeys.detail(userId)`;
  - the holders key for that app and role.
- **On 404 or 409:** refetch the same keys.
- **Tests:** cancel sends no request; while pending the button is disabled and a second click sends no extra request; failure shows the mapped error and the row is still listed.

🟡 **F4. Privilege-escalation UX.**
- **Gate privileged roles:** use `privileged` from `role-definitions`. If the caller lacks `admin:*`, disable those roles in the role select, with the reason as text (not color alone). Still handle the 403 `admin_wildcard_required` (`src/lib/forbidden.ts:42`).
- **Self-assignment:** when the target user id is the signed-in account id, disable assign and revoke for admin-app roles, with the reason. Still handle the 403 `self_assignment_forbidden` (`forbidden.ts:47`).
- **API gap:** the API **allows** self-grants of non-admin product roles, including non-privileged ones. That is a separation-of-duties gap. The UI must not hide it as if it were blocked. Raise it as a follow-up (see below).
- **Last super-admin:** show the 409 `last_super_admin` in the dialog. `src/features/users/data/errors.ts:13` already maps it; reuse that.
- **Tests:** a privileged role is disabled without `admin:*`; a mocked 403 for either code shows `forbiddenCopy` in the dialog.

🟡 **F5. Emails in query keys, caches, toasts and URLs (R5).**
- **Picker search:** the email filter lives in `usersKeys.list` (`src/features/users/api/queries.ts:27-36`).
  - Keep picker searches in component state only. No email in the URL; follow the pattern of `src/features/users/data/schema.ts:20-21`.
  - Use a separate key prefix with a short `gcTime`, like `SESSIONS_GC_TIME_MS` (`queries.ts:22`).
- **Holders query:**
  - key = `['roles', appKey, 'role-definitions', roleId, 'holders', {limit, offset, active?, org_id?}]`, with no emails in it;
  - short `gcTime`, matching the API's `no-store` intent.
- **Toasts:** success toasts name the role and app, and may use the display name. **Do not put the email in toasts.** They are announced through aria-live and visible on screen shares.
- **Errors:** never show the server `message` for mapped codes. The generic path at `src/lib/handle-server-error.ts:27` only covers mutations without `handlesOwnErrors`.
- **Logs:** no `console.*` with assignment payloads.
- **Devtools:** they are dev-only (`src/routes/__root.tsx:19`). Keep it that way.

🟡 **F6. Expiry and timezones.**
- **Input:** use `datetime-local`. Label it with the operator's IANA zone, e.g. "Expires (Asia/Ho_Chi_Minh, UTC+07:00)".
- **Conversion:** `new Date(local).toISOString()` gives an ISO string with `Z`, so the offset is included.
- **Validation:** check the value in zod before sending:
  - it must be in the future;
  - it must be a valid local time, because local times skipped by a DST change shift silently.
  - The server stays the authority: its clock decides `expires_in_past`.
- **Super-admin:** hide or disable expiry for `admin` / `super-admin`, as a hint only. The server enforces `expiry_not_allowed`.
- **Display:** `formatDateTime` (`src/features/users/data/data.ts:24-29`) prints local time without a zone. Use `timeZoneName: 'short'` for expiry in the table, the confirmations and the holders sheet.
- **Tests:** the zod schema rejects past times and empty-but-touched values; the request body contains `Z` or `+hh:mm`; super-admin expiry is disabled.

🟡 **F7. Untrusted display names and emails (R6).**
- `display_name` and `email` come from self sign-up. Render them only as React text: no `dangerouslySetInnerHTML`, no `href`/`mailto:` built from them.
- Wrap them in `<bdi>` (or `dir='auto'` with `unicode-bidi: isolate`) in the picker, the holders table and the confirmations. This blocks RTL-override spoofing such as making `moc.x@nimda` read as an admin address.
- Truncate visually and keep the full value in an accessible name.
- **Test:** a name with HTML and `U+202E` renders as literal text inside `<bdi>`.

🟡 **F8. Disabled and unverified targets.** The API lets you assign a role to a disabled or unverified user, and the holders list includes disabled users (`schemas.py:298-311`).
- Show `user_status` or verification in the picker and in the holders rows.
- When the target is disabled, the assign dialog says so ("they can't sign in until re-enabled"). Do not block it, since the API owns that rule.

🟡 **F9. Permissions per control (R4).**
- **Picker:** needs `admin:users:read` as well as `roles.assign` (`admin:roles:assign`, `src/lib/permissions/registry.ts:181-188`).
- **Holders sheet:** needs `admin:users:read`. Add a registry entry for `GET /api/v1/apps/{key}/role-definitions/{role_id}/assignments`.
- **Holders 403:** use the `ForbiddenPanel`/`queryView` pattern, as in `users-detail-sheet.tsx:207`.
- **If revoke is offered from the holders sheet:** the DELETE path must use that row's `user_id` and `id`, not any user in context. The confirmation names that row's holder.

💭 **F10. 15-minute propagation copy.** After a grant or revoke on a non-admin app, the copy says it takes effect within 15 minutes for sessions already signed in. For the admin app, do not say it is immediate either. `me/permissions` is not refetched for the target user. Phrase the copy to the API's actual behavior; ask the API owner if unsure.

💭 **F11. Holders `total`.** It counts assignments, not people (`router.py:259-261`). Label it "N assignments" so staff are not misled about the access footprint.

## Recommendations (testable checklist for the plan)
1. Picker: explicit selection only; text change clears it; stale responses ignored; selection is by id (F1).
2. Error mapper `assignmentErrorMessage(error)`:
   - 403 → `forbiddenCopy`;
   - 409 `last_super_admin` / `conflict`;
   - 422 by `details[].reason`;
   - unknown outcome → "may have been applied";
   - it has unit tests (F2).
3. Confirmation for revoke and for privileged grants names the user (display name + email in `<bdi>`), role, app and scope (org name). Pending state disables everything; never optimistic; invalidate on success, 404/409 and unknown outcome (F3).
4. Privileged roles and self-targeted admin-app roles are disabled with a text reason, and the 403 is still handled (F4).
5. No emails in URL, query keys of the holders query, toasts or logs; short `gcTime` for picker and holders data (F5).
6. Expiry: zod schema (future, valid local time), sent as ISO with an offset, zone labelled, disabled for super-admin (F6).
7. All user-supplied strings render as text inside `<bdi>` (F7).
8. Holders sheet: loading, empty, error (with Retry), 403 and pagination (`limit` ≤ 100), all tested with the injected-fetch mock.

## Risks
- **Self-grant of product roles:** an operator with `admin:roles:assign` can give themselves any non-privileged role in any product app. The API allows it; this is a separation-of-duties gap, not a UI bug.
- **Stale `privileged` flag:** permissions can change between loading the role list and submitting. The server re-checks, so the UI must treat the 403 as normal, not as a bug.
- **Wrong user on substring matches:** even with explicit selection, look-alike accounts remain a risk. Showing email, status and id is the main mitigation.

## Open questions
1. Does "Assign" also exist on the Roles screen? A picker is only needed there. In the user sheet the target user is already fixed. The AC's picker requirement suggests yes; the planner should confirm the entry points.
2. Should every grant be confirmed, or only privileged ones? R9 lists revoke explicitly and says "access-changing"; my recommendation is to confirm at least privileged grants.
3. Org selection when `org_mode != none`: the picker needs `admin:orgs:read` (or the matching permission). If the operator lacks it, should we hide org scope, or offer app scope only?
4. Is there a reliable "current account id" in the auth store to compare with the target `user_id` for the self-assignment hint?

## Follow-ups (out of scope)
- **org-admin-api:** decide whether `self_assignment_forbidden` should cover all apps, or at least privileged roles in any app. Today it covers only admin-app roles (`service.py:1565`).
- **org-admin-api (optional):** an exact-email lookup (`email_exact=`) to reduce wrong-user picks.
- **admin-pan:** add a time zone to `formatDateTime` across the app (currently `src/features/users/data/data.ts:24-29`).
- **admin-pan:** the `/users` list keeps the typed email in its query key (`src/features/users/api/queries.ts:33`). It is in memory only, but consider a short `gcTime`.
