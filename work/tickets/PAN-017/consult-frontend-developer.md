PAN-017 consult (frontend-developer, read-only). No files changed. API source read at /home/user/org-admin-api (26b27be): app/modules/users/router.py:65-152, app/modules/sessions/staff_service.py, app/modules/sessions/schemas.py:9-21. Not verified: the regenerated OpenAPI itself (I read the Python code, not /openapi.json) and the other diffs between c41ef57 and 26b27be.

## Findings

**API contract**
- Three ops: `GET /api/v1/users/{user_id}/sessions` (Page<UserSessionRead>, `Cache-Control: no-store`), `DELETE …/sessions/{session_id}` (204), `DELETE …/sessions` (204). Fields: `id, created_at, last_used_at, device_last_seen_at, ip|null, user_agent|null` (schemas.py:12-21).
- All three declare `require_permission("admin:*")`, not `admin:users:*` (router.py:75-80). After regeneration `x-permission` is the literal `admin:*`. Only super admins can use this feature.
- **Self is blocked on the list too.** staff_service.py:52-53 raises `SelfSessionChangeForbiddenError` (403, code `self_session_change_forbidden`) on list, revoke-one and revoke-all (:79-80). On the mutations the denial is also written as a `denied` audit row (:83-86). Self-revoke is therefore impossible by design.
  - `forbiddenCopy` (src/lib/forbidden.ts:34-64) has no case for this code, so it would show the generic "The server refused this request."
  - A self 403 is not in GATE_CODES (src/api/client.ts:12-17), so it can't sign anyone out of admin-pan.
- A target holding an admin-app role or an `is_admin` permission needs `require_super` (staff_service.py:54-55, :81-82). The caller already needs `admin:*`, so `admin_wildcard_required` is effectively unreachable. `forbiddenCopy` already maps it (forbidden.ts:42-46).
- Revoke-one: 404 if the user or the session is missing; the API doesn't say which. Revoke-all: 404 only for a missing user. With no active sessions it returns 204 and writes no audit row (:123-124), so it is idempotent.
- What revoking does (router.py:65-72):
  - It blocks only new `/auth/token` calls (401 `session_invalid`).
  - Access tokens already issued, including `aud=admin` ones, stay valid until `exp`: 12 h in production plus 30 s.
  - It does not stop signing in again with the password.
  - IP and user agent are recorded at the browser's first sign-in and shared by every account on that browser.
  - Sessions are per account, not per device. A device may carry other people's accounts (staff_service.py:3), so a row is "this account on this browser".
- Disabling a user already revokes all their sessions (src/features/users/components/users-status-dialog.tsx:69). A disabled user's list should normally be empty.

**Where the code is today**
- The users sheet is one scroll column with no tabs: fields, then `RoleAssignments`, then audit links (users-detail-sheet.tsx:63-124). `SheetContent` has the default narrow width (:65).
- Apps and organizations use `Tabs` (src/features/apps/components/app-detail-sheet.tsx:82-115, `sm:max-w-2xl` at :55). The apps sheet puts a gated trigger and content inside `<Can>` (:90-94, :105-110).
- `UsersDialogs` keeps the sheet mounted after close, keyed by user id (src/features/users/components/users-dialogs.tsx:14-19). Any `tab` or `offset` state held in `UsersDetailSheet` or the tab therefore survives close and reopen for the same user.
- Dialog and pager patterns to reuse:
  - Revoke dialog: src/features/apps/components/app-credential-revoke-dialog.tsx. It has an `inFlight` ref (:27-40), `onOpenChange` ignored while pending (:48-52), `pendingText` and a `destructive` ConfirmDialog (:55-57), and the error slot with `ForbiddenPanel` or `role=alert` (:67-75).
  - Focus-by-ref: app-credentials-tab.tsx:37-50 (row ref on cancel, stable heading `tabIndex=-1` on success).
  - Render-time pager clamp and `aria-disabled` pager buttons: app-join-requests-tab.tsx:79-88 and :288-311.
  - Error mappers: src/features/apps/data/errors.ts `isUnknownOutcome` (:220-229) and `credentialRevokeError` (:257-265). organizations already cross-imports `isUnknownOutcome` (src/features/organizations/data/entitlement-errors.ts:3).
  - Mutation invalidation on 404/409/unknown outcome: src/features/apps/api/queries.ts:177-198 and :308-313.
- The credentials pager uses `disabled` on Previous/Next (app-credentials-tab.tsx:216-233). A button that disables itself on click drops keyboard focus. The join-requests version (`aria-disabled` plus an onClick guard) is the fixed pattern; do not copy the credentials one.
- Join-requests deliberately has no `keepPreviousData` (queries.ts:156-158). Without it, a page change flips `queryView` to `pending` and unmounts the table and pager, which also drops focus on Next. Sessions revoking removes rows, so the clamp is needed (the credentials list never loses rows).
- Self detection already exists: `useSelfUserId()` with a case-insensitive compare (src/features/users/components/data-table-row-actions.tsx:26-28).
- Permissions: `permits()` is exact key or `<app>:*` (src/lib/permissions/permits.ts:6-13), so `permits({'admin:*'}, 'admin:*')` is true and a non-super is false. `ADMIN_PERMISSION_PATTERN` already allows `admin:*` (registry.ts:24-25).
- `registry.test.ts:22-28` requires `ADMIN_PERMISSIONS` to equal the set of all `x-permission` values. After regeneration that set gains `admin:*` and `admin:stats:read`, so the test fails until both are added.
- e2e fake (e2e/support/fake-api.ts): it has `GET /api/v1/users` (:236) but no `GET /api/v1/users/{id}`, no role-assignments and no sessions routes. The `me/permissions` fake returns `admin:*` (:230-235) and `SELF_USER_ID` is `…2222` (:25). Per-install mutable state and fixed per-id routes are the pattern (:255-340).
- Existing detail-sheet tests answer unknown paths with an empty Page (users-detail-sheet.test.tsx:44-54, :101).

## Recommendations

**1. Regeneration at 26b27be.** Do it as its own first step: `pnpm api:types` (package.json:20) after replacing src/api/openapi.json, then `pnpm typecheck` to enumerate breakage. Knock-on edits:
- `ADMIN_PERMISSIONS` (registry.ts:7-19): add `'admin:*'` and `'admin:stats:read'`, keeping alphabetical order.
  - `admin:stats:read` is claimed by no ACTIONS or ROUTE entry. The `/` route stays `pending` PAN-020 (:59-63), so don't wire it here (R7). Note it in the impl-log.
  - `registry.test.ts` itself needs no change once the array matches.
  - `permits.test.ts:17-20` still holds. `source.test.ts:14` and `nav-filter` are unaffected.
- `member_count: int` is required on `AppRead` (rbac/schemas.py:97). Fix every full `AppRead` literal. The `Partial<AppRead>` overrides stay fine.
  - e2e/support/fake-api.ts:74-87 (the `app()` builder): add `member_count: 0`.
  - src/features/apps/components/test-data.ts (~:19, :32, :45 builders).
  - src/features/organizations/components/test-data.ts:95-103 (`app()`).
  - `Grep` also hit src/features/apps/data/mock-data.ts, access-store.ts and schema.ts for `default_role_id: |org_owner_role_id: `. Check whether they are legacy mock types or real `AppRead` builders when `tsc` flags them.
  - Tests may assert exact request or response shapes; run the apps suite.
- `src/features/apps/components/test-fixtures.tsx:64` grants `ADMIN_PERMISSIONS` as "everything". Once `admin:*` is in the array it is a wildcard grant of everything, including keys omitted in future "all but X" tests. Today it is only a default, so harmless, but call it out in the log.
- Don't touch dashboard or stats UI. Any new endpoint or schema surprise goes to follow-ups (R7).

**2. Registry (R4, rule R2).** Add three actions to `ACTIONS` (registry.ts:96-188), all `perm('admin:*', …)`:
- `users.viewSessions`: `GET /api/v1/users/{user_id}/sessions`.
- `users.revokeSession`: `DELETE /api/v1/users/{user_id}/sessions/{session_id}`.
- `users.revokeAllSessions`: `DELETE /api/v1/users/{user_id}/sessions`.

`registry.test.ts:30-41` will then verify them against the regenerated spec. Since the permission is `admin:*`, the UI hides the Sessions tab without it and shows no static "needs admin:*" note, unlike app-credentials-tab.tsx:115. A `403` is still handled.

**3. Placement.** Convert the users sheet to Tabs: "Details" (fields, apps & roles, audit) and "Sessions".
- Gate the trigger and content with `<Can action='users.viewSessions'>` exactly like apps (app-detail-sheet.tsx:90-94, :105-110).
- Widen `SheetContent` to `sm:max-w-2xl` and use `overflow-x-auto` on the table (users-detail-sheet.tsx:65).
- The sessions tab component mounts only while selected (Radix `TabsContent`), so nothing is fetched or cached before the user asks. This matters because IP and user agent are PII.
- Reset the tab to "details" when the sheet closes (or when `open` flips to false). Otherwise the persisted `tab` state (UsersDialogs keeps the sheet mounted) would reopen straight onto a PII list. Either clear state in `onOpenChange` or keep the tab state inside content that unmounts.
- Alternative: a stacked section like `RoleAssignments`. That is acceptable but cramped: six columns plus actions in a narrow sheet, and the pager and revoke-all button need room. Tabs are the better fit.

**4. Query layer (src/features/users/api/queries.ts, extending `usersKeys` at :19-35).**
- Add `sessions: (id, p) => [...usersKeys.detail(id), 'sessions', p]`. Because it is nested under `detail(id)`, the existing status-mutation invalidation of `usersKeys.all` (:108-110) also refreshes sessions after a disable, and a user 404 reaches the detail query.
- `userSessionsQueryOptions(id, {limit, offset}, api)` with the same `eslint-disable exhaustive-deps` comment style (:64, :76).
- Page size 20 (limit ≤ 100 per R2); show the pager only when `total > size`.
- Use `keepPreviousData` so the pager and table don't unmount on page change (keeps focus). While `q.isPlaceholderData`, make the row Revoke buttons and revoke-all `aria-disabled` so nobody confirms against a page that isn't the one they see.
- Set a small `gcTime` (e.g. 30 s, or 0) so sessions with IPs don't linger in the cache after the tab closes.
- Two mutation hooks:
  - `useRevokeUserSessionMutation(userId, api)`, mutationFn `{ sessionId }`.
  - `useRevokeAllUserSessionsMutation(userId, api)`.
- Both use `meta: { handlesOwnErrors: true }`, are never optimistic (R9), and follow the shared `useMutationOptions` shape (apps/api/queries.ts:181-198), invalidating `usersKeys.sessions` or `detail(userId)` on:
  - success;
  - 404 or 409;
  - `isUnknownOutcome` (as in queries.ts:308-313).
- Use `api.DELETE` with the generated path types (R2). Both return 204, so `unwrap` must handle empty bodies as it does for credentials (queries.ts:323-329).

**5. Columns and PII display (R5, R6, R10).** Use a semantic `<Table aria-label='Sessions of {email}'>` with `scope='col'` headers, as in the credentials tab (:132-143):
- **Created**: `created_at`.
- **Last sign-in**: `last_used_at`, "last sign-in of this account on this device".
- **Browser last seen**: `device_last_seen_at`. The API refreshes it only hourly, so add a helper hint ("updated at most hourly"). The ticket's single "last seen" is ambiguous: show these two columns with precise labels, or just Last sign-in plus a tooltip. I'd show both.
- **IP**: text, or "Unknown" when null.
- **Browser (user agent)**: raw text in a wrapping cell (`break-words`, optionally `line-clamp-2`). Never HTML or an href. `null` becomes "Unknown". `title` is mouse-only, so rely on wrapping rather than a tooltip for the full string.
- Actions column: `<span className='sr-only'>Actions</span>`.
- Use `formatDateTime` from src/features/users/data/data.ts:24-29 inside `<time dateTime>`.
- One section note, from the API's own text: "IP and browser are recorded when the browser first signed in and are shared by every account on that browser."
- Do not put IP or user agent in toasts, logs, aria-labels, test names (use fake values) or URLs. The API itself never logs them (staff_service.py:49). Row button label: `Revoke session created {formatDateTime(created_at)}`, with no IP.

**6. Revoke copy and dialogs.** Two dialogs, rendered from one `dialog` state union (`{kind:'one', session} | {kind:'all'} | null`). That makes them mutually exclusive and lets the tab own the focus refs, like `revoking` in app-credentials-tab.tsx:33.
- Revoke-one: title "Revoke session?". Desc: "Revoke the session of {email} ({display_name}) created {created}, last signed in {last_used}, from {ip or 'an unknown IP'}? Their browser can't get new access tokens for this account. Tokens it already holds keep working for up to 12 hours, and they can sign in again with their password." Confirm "Revoke session", pending "Revoking…", `destructive`.
- Revoke-all: title "Revoke all sessions?". Desc: "Revoke every session of {email} ({display_name}) on every device? They can't get new access tokens on any browser. Tokens already issued keep working for up to 12 hours, and they can sign in again with their password. To lock the account out, disable it instead." Don't hard-code a session count (it may be stale); show the total as a read-only badge in the tab header.
- Naming the user is required by R9, and a session is named by its dates.
- Revoke-all button: enabled only when the list succeeded and `total > 0`.
- Each dialog needs an `inFlight` ref and onOpenChange blocked while pending (credential-revoke dialog :27-52). Each also needs `revoke.reset()` on cancel.
- Add `sessionRevokeError(error, 'one'|'all')` in src/features/users/data/errors.ts. Statuses and codes in order:
  - `isUnknownOutcome` gives "We couldn't confirm the revoke. Check the list; revoking again is safe." (as in `credentialRevokeError`).
  - 404 on one gives "This session or user no longer exists. The list has been refreshed."
  - 404 on all gives "This user no longer exists."
  - `isForbidden` gives the `ForbiddenPanel` copy.
  - Fallback is the sliced API message (errors.ts:19-20 pattern).

  Add `self_session_change_forbidden` to `forbiddenCopy`: title "You can't manage your own sessions", description "Use Sign out to end your own session." Add it to forbidden.test.ts.

**7. Self.** Compare the sheet's user id to `useSelfUserId()` as in data-table-row-actions.tsx:26-28.
- If self, render in the Sessions tab only the note "You can't manage your own sessions. Use Sign out in the user menu." and do not call the list or any mutation, since each denied call is audited (staff_service.py:83-86).
- If `selfId` is `undefined` (me/permissions not loaded or failed), still let the query run. A `self_session_change_forbidden` 403 then renders the mapped `ForbiddenPanel` inline and nothing breaks.
- Revoking another user's sessions never signs the current staff member out. Revoking another staff account's sessions only stops that person from refreshing, so their open admin-pan keeps working up to about 12 h. The copy in item 6 covers this, and no auth-change or sign-out handling is needed. Do not call `client.onChange` or clear the query client (src/lib/query-client.ts:27-35); no account change happened.
- The only auth-adjacent risk is a plain 401 mid-flow, which the global client hook already handles (src/api/client.ts).

**8. Focus (R10), modelled on credentials and join-requests.**
- After success of revoke-one or revoke-all: focus the section `<h3 tabIndex={-1}>` through a `heading` ref. The row button is gone, and a re-checked `el?.isConnected` fallback as in join-requests (:65-67) is safer.
- After cancel or failure: focus the originating row's Revoke button (refs by session id in a `Map`, never a selector from API data), or the revoke-all button. The effect runs on `dialog === null` (app-credentials-tab.tsx:44-50).
- Pager buttons: use the `aria-disabled` plus guarded-onClick version (join-requests :288-311). Keep an `aria-live` "Showing a–b of N" status (:212 / :284). Add an sr-only status for result changes (e.g. "N sessions").
- Success toast without PII: "Session revoked." and "All sessions of {email} revoked." Email is already the list's own label, so it is acceptable here as in users-status-dialog.tsx:36-38. If you want to be stricter on R5, use `userLabel`.

**9. Pager clamp (PAN-028 lessons).** Copy the render-time clamp from app-join-requests-tab.tsx:79-88:
- When `q.isSuccess && offset !== 0 && items.length === 0`, set the offset to `floor((total-1)/size)*size`, or 0 when total is 0.
- Revoke-all also sets `offset` to 0 explicitly. The clamp then covers the case where the list shrank because another admin also revoked.
- Keep `total` from the response, not `items.length`.
- Revoking a middle row leaves the page valid but short; the refetch handles it.
- Do not use `disabled` on pager buttons and do not skip `keepPreviousData` (see Findings).

**10. States and tests (R8, R10).** Test file next to code; the API is mocked via `fakeApi` as in users-detail-sheet.test.tsx:46-54 with `WithPermissions`.
- States: loading; error with Retry; empty ("No active sessions"); list with all columns plus null ip and user agent; 403 `ForbiddenPanel`.
- Tab and permissions: tab hidden without `admin:*` (note `granted` with only `admin:users:read` shows Details but no Sessions); self shows the note and makes zero requests to `/sessions` (assert on the fake).
- Revoke one: confirm names the user and the session; Cancel does not call the API; focus returns to the row button; success refetches and focuses the heading; 404 shows the message and refetches; 5xx or network shows the unknown-outcome copy and refetches; a 403 `self_session_change_forbidden` shows the mapped panel; double-click Confirm sends one DELETE.
- Revoke all: same plus `total === 0` disables the button.
- Pager: 21 items, page 2, revoke the only row, see page 1; revoke all after page 2 shows empty list page 1.
- Unit tests: `sessionRevokeError`, `forbiddenCopy` new case, query key shape.
- Update the existing detail-sheet tests: the tab refactor changes roles and structure, and the default "empty page" fake (users-detail-sheet.test.tsx:101) will now also be asked for sessions.
- `pnpm test` snapshots under __screenshots__ (users-detail-sheet) may change; check them.

**11. e2e (PAN-023 fake, e2e/support/fake-api.ts).** Add to the fake:
- `GET /api/v1/users/{id}` and `GET …/role-assignments` for the three users. Verify what the fake does for unmatched routes; the sheet issues both today.
- Per-install sessions state per user (a few rows, one with `ip: null`, one long user agent in the style of `LONG` at :121): `GET …/sessions` returns `page(items, query)`.
- `DELETE …/sessions/{sid}` removes the row, returns 404 for unknown (not a no-op), and returns `null`/204 like :274-278.
- `DELETE …/sessions` clears.
- For `SELF_USER_ID` (:25, not in `USERS`), respond `403 self_session_change_forbidden` with the full envelope (`json(403, {error:{code,…}})`, helper at :172-173). The fake needs a self row only if you want an e2e of the self note; otherwise the unit test suffices.
- An e2e spec is only needed if PAN-017's acceptance criteria require it ("States tested" is satisfied by Vitest per R8). A smoke spec (open user, Sessions tab, revoke one) is cheap given these routes; I'd add it only if the existing `e2e` suite already covers the apps credential flow.

## Risks
- **Super-admin only.** Any other staff member sees no Sessions tab at all, which may surprise the owner (the ticket says "admin"). Spec §5.4 should be checked for the intended permission; org-admin-api owns it.
- **Regeneration scope.** 26b27be may also change other schemas (ADM-017 reports?, anything else after c41ef57). Run typecheck and the full suite right after regeneration and keep unrelated fixes minimal (R7).
- **`ADMIN_PERMISSIONS` containing `admin:*`.** Any test or fixture that treats it as "all granted" now grants a wildcard. Search for places that remove one key from it to test denial (none found today in `src`, only test-fixtures.tsx:64 as a default).
- **Stale self detection.** If `me/permissions` hasn't loaded, a self request fires and the API writes a `denied` audit row for the list too? No: list denial isn't audited (only `_lock_and_guard`, i.e. mutations, records denials). So a stray list for self is harmless; mutations are blocked by hiding the whole section for self.
- **Misleading "revoked" semantics.** Staff may expect revoke to log the user out immediately. Copy must keep the 12 h caveat; the API says tokens stay valid until `exp`.
- **PII in cache and screenshots.** IP and UA must stay out of committed screenshot fixtures and test names; use obviously fake values (e.g. `203.0.113.7`).
- **Sheet width change** for all users sheet content: the screenshot tests in src/features/users/components/__screenshots__/ will need review.

## Open questions
1. Is the `admin:*`-only gate intended (spec §5.4 vs USR-10)? If a finer key is planned in org-admin-api, the three actions would change later; proposing a follow-up there is outside this repo.
2. Which two timestamps should be shown (both `last_used_at` and `device_last_seen_at`, or only one)? I recommend both with distinct labels.
3. Should revoke-all show the number of sessions? Recommended no in the confirm copy, yes as read-only in the header.
4. Is an e2e spec in scope for this ticket, or does it follow with PAN-023?
5. Does the owner want a "current session" marker? The API doesn't offer one (the actor can't list their own sessions), so no.

Key paths: /home/user/admin-pan/src/features/users/components/users-detail-sheet.tsx, users-dialogs.tsx, /home/user/admin-pan/src/features/users/api/queries.ts, /home/user/admin-pan/src/features/users/data/errors.ts, /home/user/admin-pan/src/lib/permissions/registry.ts, /home/user/admin-pan/src/lib/forbidden.ts, /home/user/admin-pan/src/features/apps/components/app-credentials-tab.tsx, app-credential-revoke-dialog.tsx, app-join-requests-tab.tsx, /home/user/admin-pan/e2e/support/fake-api.ts, /home/user/org-admin-api/app/modules/users/router.py, /home/user/org-admin-api/app/modules/sessions/staff_service.py.
