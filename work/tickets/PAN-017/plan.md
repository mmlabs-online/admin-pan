Status: READY

# Plan — PAN-017: User sessions: list and revoke

## Spec summary
`docs/spec-v1.md` §5.4 Apps, roles and access:
> Apps registry (join policy, org mode, origins, default role), roles and their permissions, role assignments per user (app scope or one org), **revoke sessions**.
> API: **org-admin-api USR-02** (backlog), sessions revoke (identity-architecture §4).

The ticket adds "list" because staff must see a session before revoking it. The API ships list and revoke together in USR-10 (DONE), so this does not conflict with the spec. The spec's API line and §9 ("API gaps … admin sessions list/revoke") are now out of date. That goes to follow-ups; the planner does not edit the spec.

API facts this plan relies on (org-admin-api at 26b27be, read in `app/modules/users/router.py:65-152`, `app/modules/sessions/schemas.py:9-21`, `app/modules/sessions/staff_service.py`, `app/modules/audit/actions.py:42-43`):
- `GET /api/v1/users/{user_id}/sessions` returns `Page[UserSessionRead]` with `Cache-Control: no-store`, ordered `created_at DESC, id DESC`, active sessions only.
- `DELETE /api/v1/users/{user_id}/sessions/{session_id}` returns 204. `DELETE /api/v1/users/{user_id}/sessions` returns 204, and also 204 when there is nothing to revoke.
- All three require `x-permission: admin:*`.
- A staff member calling any of them on their own account gets 403 `self_session_change_forbidden`. A denied revoke writes an audit row; a denied list does not.
- 404 `not_found` is returned for an unknown user. For revoke-one it is also returned for an unknown, already-revoked or other user's session; the message is the only difference.
- Fields: `id`, `created_at`, `last_used_at` ("Last sign-in of this account on this device"), `device_last_seen_at` ("Browser last seen; refreshed at most hourly"), and `ip|null` and `user_agent|null` ("Recorded when this browser first signed in; shared by every account on it"). The API applies no masking. `user_agent` is client-controlled text, up to 512 characters.
- Revoking stops **new** access tokens only. Tokens already issued, `aud=admin` ones included, stay valid up to 12 h plus 30 s. Revoking is not a password change (`_REVOKE_LIMITS`, router.py:65-72).
- Audit actions `user.session_revoked` and `user.sessions_revoked` are new.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Sessions list (created, last seen, user agent, IP) | `user-sessions-tab.test.tsx` › "fetches GET …/sessions?limit=20&offset=0 only when the Sessions tab is opened", › "list: columns Created, Last sign-in, Browser last seen, First sign-in IP, First sign-in browser; null ip/ua show 'Not recorded'", › "user agent with HTML renders as literal text", › "user agent with U+202E is sanitized and isolated in <bdi>". e2e `users sessions: …` (below). In the UI: open a user, choose the Sessions tab, see the table. |
| 2 | Revoke one / all with confirmation | `user-sessions-tab.test.tsx` revoke-one and revoke-all tests: the confirm names the user's email and the session by created and last sign-in date; Cancel sends no DELETE and returns focus to the trigger; Confirm sends exactly one DELETE (also on two synchronous clicks); success refetches, toasts with no PII and focuses the heading; 404 closes with neutral copy and refetches; 403 inline; unknown outcome shows copy and refetches. `sessions.test.ts` › "revoke copy states up to 12 hours and not a password change, never 'signed out' or 'immediately'". e2e `users sessions: …`. |
| 3 | States tested | `user-sessions-tab.test.tsx`: loading, empty, error with Retry, 404 user, 403 `permission_denied`, 403 `self_session_change_forbidden`, pager with keepPreviousData, page clamp. `users-detail-sheet.test.tsx`: tab gating, self note with zero requests, tab reset on close. All API mocked at the network layer (`fakeApi`, R8). |
| 4 | (orchestrator) Snapshot regenerated from org-admin-api 26b27be; knock-on edits only | `cmp` of a fresh generator run against `src/api/openapi.json` reports identical. `pnpm api:types && git diff --exit-code src/api/schema.d.ts` is clean. `registry.test.ts` passes unchanged. The impl-log lists the diff stat and each drift item (R7). |
| 5 | (orchestrator) Gating, self rules and the 403 copy | `users-detail-sheet.test.tsx` › "Sessions tab hidden when users.viewSessions is denied (admin:users:read + admin:users:write only)", › "self: Sessions tab shows the note and sends no …/sessions request". `forbidden.test.ts` new case. `permission-refresh.test.ts` › "self_session_change_forbidden does not refresh permissions". |
| 6 | (orchestrator) PII hygiene | `user-sessions-tab.test.tsx` › "no IP, user agent or session id in query keys, request URLs, toasts or status regions". `queries.test.tsx` › "sessions query: gcTime ≤ 5000, key holds only ids and paging". |
| 7 | All checks green (R8) | `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`), `pnpm build`, and `pnpm e2e` (same env var). |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/api/openapi.json` | Regenerated by the generator from org-admin-api 26b27be. No hand edits. | R2. The sessions operations are missing from the snapshot. |
| `src/api/schema.d.ts` | Regenerated with `pnpm api:types`. | R2 |
| `src/lib/permissions/registry.ts` | `ADMIN_PERMISSIONS` gains `'admin:*'` and `'admin:stats:read'`, sorted. New `ACTIONS`: `'users.viewSessions': perm('admin:*', 'GET /api/v1/users/{user_id}/sessions')`, `'users.revokeSession': perm('admin:*', 'DELETE /api/v1/users/{user_id}/sessions/{session_id}')`, `'users.revokeAllSessions': perm('admin:*', 'DELETE /api/v1/users/{user_id}/sessions')`. Nothing else, including the stale `/_authenticated/` stats reason. | R4. `registry.test.ts:22` fails on the new snapshot without both keys. `admin:stats:read` is drift (R7): PAN-020 owns the stats UI. |
| `src/lib/forbidden.ts` | New `case 'self_session_change_forbidden'`: title "You can't manage your own sessions", description "Ask another administrator, or use Sign out to end your own session." | The API returns the code on list and revokes. |
| `src/lib/forbidden.test.ts` | Add the code to the title test and to the "never uses the server message" list. | R8 |
| `src/lib/permissions/permission-refresh.test.ts` | New test: a 403 `self_session_change_forbidden` does not invalidate `me/permissions`. Test-only; `permission-refresh.ts` is unchanged. | Pins the "must not trigger a refresh" decision. |
| `src/features/audit-log/data/schema.ts` | Add `'user.session_revoked'` and `'user.sessions_revoked'` to `auditActionSchema`, after `'user.enabled'`. | The `Same<>` guard fails to compile on the new `AuditAction` enum. Drift (R7). |
| `src/features/audit-log/data/data.ts` | Add both to `actionTones` as `'warning'`. | The typed `Record<AuditAction, Tone>` fails to compile. Drift (R7). |
| `src/features/apps/components/test-data.ts` | Add `member_count: 0` to the three `APPS` literals. | `AppRead.member_count` is now required. Drift (R7); no Members column. |
| `src/features/organizations/components/test-data.ts` | Add `member_count: 0` to the `app()` builder. | Same as above. |
| `e2e/support/fake-api.ts` | (a) Add `member_count: 0` to the `app()` builder (drift). (b) Add `GET /api/v1/users/{id}` and `GET …/role-assignments` (empty page) for each of `USERS`, so the sheet opens in e2e. (c) Add per-install sessions state with GET, DELETE-one and DELETE-all routes (Approach §9). | e2e for this ticket; the fixture fails on unmatched routes. |
| `e2e/pages.e2e.ts` | New, separate test `users sessions: …` (Tests table). | Lead requirement: e2e with focus assertions. |
| `src/features/users/data/schema.ts` | `export type UserSession = components['schemas']['UserSessionRead']` | R2: generated type, never a hand copy. |
| `src/features/users/data/sessions.ts` (new) | `sanitizeUserAgent()`, `REVOKE_ONE_EFFECT`, `REVOKE_ALL_EFFECT`, `SESSIONS_NOTE` copy constants. | R6, honest revoke copy, one place to test. |
| `src/features/users/data/sessions.test.ts` (new) | Unit tests for the above. | R8 |
| `src/features/users/data/errors.ts` | `sessionRevokeError(error)`. | Maps codes to fixed copy. |
| `src/features/users/data/errors.test.ts` | Tests for `sessionRevokeError`. | R8 |
| `src/features/users/api/queries.ts` | `SESSIONS_PAGE_SIZE = 20`, `SESSIONS_GC_TIME_MS = 5_000`, keys `usersKeys.sessionsAll(id)` and `usersKeys.sessions(id, p)`, `userSessionsQueryOptions`, `useRevokeUserSessionMutation`, `useRevokeAllUserSessionsMutation`. | Data layer (R2, R9). |
| `src/features/users/api/queries.test.tsx` | Key shape, request URL, gcTime and invalidation tests. | R8 |
| `src/features/users/components/users-detail-sheet.tsx` | Tabs **Details** (current content, unchanged) and **Sessions** (gated). Widen to `w-full gap-0 sm:max-w-2xl` like the apps and orgs sheets. Reset the tab to `details` when `open` is false. | Placement, R4, PII on reopen. |
| `src/features/users/components/users-detail-sheet.test.tsx` | Existing tests still pass (Details is the default tab). New tests: gating, self, reset. | R8 |
| `src/features/users/components/user-sessions-tab.tsx` (new) | Tab body: note, table, pager, clamp, row and all revoke triggers, focus, notice, dialog host. | AC1, AC2 |
| `src/features/users/components/user-session-revoke-dialog.tsx` (new) | One `ConfirmDialog` for both targets (`{kind:'one', session}` and `{kind:'all'}`). | AC2, R9 |
| `src/features/users/components/user-sessions-tab.test.tsx` (new) | Tab and dialog tests. | AC3, R8, R10 |

No other files. If typecheck after regeneration flags a file outside this list, the implementer fixes it only with the same kind of mechanical literal or map entry and records it in the impl-log as drift. If a fix needs a behaviour change, stop and report to the orchestrator (R7).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `sessions.test.ts` › "sanitizeUserAgent removes C0/C1 controls and bidi controls (U+202A–202E, U+2066–2069, U+200E, U+200F, U+061C) and trims" | R6, Finding 6 (appsec) |
| `sessions.test.ts` › "sanitizeUserAgent keeps ordinary text, including `<img src=x onerror=…>` as characters" | R6 (escaping is React's job; the function must not mangle it) |
| `sessions.test.ts` › "revoke copy states up to 12 hours and not a password change, never 'signed out' or 'immediately'" | Asserts on `REVOKE_ONE_EFFECT` and `REVOKE_ALL_EFFECT`: contain `up to 12 hours` and `not a password change`, do not match `/signed out\|immediately\|logged out/i`. |
| `errors.test.ts` › "sessionRevokeError: 404 → gone; 403 → forbidden copy (self code mapped); network/timeout/5xx/invalid_response → unknown-outcome copy; other → fixed fallback, never the server message" | Error mapping |
| `forbidden.test.ts` › existing tests extended with `self_session_change_forbidden` | New copy, no server message |
| `permission-refresh.test.ts` › "self_session_change_forbidden does not refresh permissions" | Self code is not a grants change |
| `queries.test.tsx` › "usersKeys.sessions nests under detail(id) and holds only {limit, offset}" | PII hygiene, invalidation by prefix |
| `queries.test.tsx` › "userSessionsQueryOptions sends GET /api/v1/users/{id}/sessions?limit=20&offset=0; gcTime ≤ 5000; placeholderData keepPreviousData" | Contract, PII cache |
| `queries.test.tsx` › "revoke one sends DELETE …/sessions/{sid}, invalidates sessionsAll on success; on 404 invalidates detail(id); on 500 invalidates sessionsAll" | R9 invalidation |
| `queries.test.tsx` › "revoke all sends DELETE …/sessions with no body and invalidates sessionsAll" | R9 |
| `users-detail-sheet.test.tsx` › "Details is the default tab; existing fields, roles and audit links are inside it" | Refactor safety |
| `users-detail-sheet.test.tsx` › "Sessions tab hidden when users.viewSessions is denied (granted admin:users:read + admin:users:write)" | R4 |
| `users-detail-sheet.test.tsx` › "Sessions tab shown with admin:*; no …/sessions request until it is selected" | Lazy fetch (PII) |
| `users-detail-sheet.test.tsx` › "self: Sessions tab shows the note and sends no …/sessions request" (`WithPermissions userId={ALICE.id}` in mixed case) | Self rule, case-insensitive compare. Mutation-proof: fails if the `isSelf` branch is removed. |
| `users-detail-sheet.test.tsx` › "closing the sheet resets the tab: reopen the same user → Details selected, no new …/sessions request" | Tab reset |
| `user-sessions-tab.test.tsx` › "loading status while the list is pending" | State |
| `user-sessions-tab.test.tsx` › "empty: 'No active sessions.' and Revoke all is aria-disabled" | State |
| `user-sessions-tab.test.tsx` › "error: alert 'Couldn't load sessions.' with Retry; Retry refetches" | State |
| `user-sessions-tab.test.tsx` › "404: 'This user no longer exists.' and no Retry" | State |
| `user-sessions-tab.test.tsx` › "403 permission_denied: ForbiddenPanel, no table" | State, R4 |
| `user-sessions-tab.test.tsx` › "403 self_session_change_forbidden (self id unknown): shows 'You can't manage your own sessions'" | Fail-open self path |
| `user-sessions-tab.test.tsx` › "list: columns Created, Last sign-in, Browser last seen, First sign-in IP, First sign-in browser; null ip/ua show 'Not recorded'" | AC1. Use fake values (`203.0.113.7`, `2001:db8::1`). |
| `user-sessions-tab.test.tsx` › "user agent with HTML renders as literal text" (ua `<img src=x onerror=alert(1)>`: text visible, no `img` element in the table) | R6 |
| `user-sessions-tab.test.tsx` › "user agent with U+202E is sanitized and isolated in <bdi>" (cell `textContent` has no U+202E; the element is a `BDI`) | R6 |
| `user-sessions-tab.test.tsx` › "revoke one: confirm names email and the session dates and states the 12-hour limit; Cancel sends no DELETE and focus returns to the row's Revoke button" | AC2, R9, R10 |
| `user-sessions-tab.test.tsx` › "revoke one: Confirm sends one DELETE, refetches, toasts 'Session revoked.', focuses the 'Active sessions' heading" | AC2, R9, R10 |
| `user-sessions-tab.test.tsx` › "revoke one: two synchronous clicks on Confirm send one DELETE" (`const el = await confirm.element(); el.click(); el.click()` while the DELETE is held pending) | In-flight guard. Mutation-proof: the implementer removes the `inFlight` check, sees the test fail, and records that in the impl-log. |
| `user-sessions-tab.test.tsx` › "revoke one: pending → confirm shows 'Revoking…', Escape does not close" | R9 |
| `user-sessions-tab.test.tsx` › "revoke one: 404 closes the dialog, shows 'This session is no longer active…' in a status region, refetches the list, focuses the heading" | 404 handling |
| `user-sessions-tab.test.tsx` › "revoke one: 403 permission_denied and 403 self_session_change_forbidden show inline in the dialog" | R4 |
| `user-sessions-tab.test.tsx` › "revoke one: 500 shows the unknown-outcome copy and refetches the list" | Unknown outcome |
| `user-sessions-tab.test.tsx` › "revoke all: confirm names the email, says every browser and the 12-hour limit; Cancel sends no DELETE and focus returns to Revoke all; Confirm sends one DELETE …/sessions, returns to offset 0, focuses the heading" | AC2 |
| `user-sessions-tab.test.tsx` › "pager: total 25 shows 'Showing 1–20 of 25'; Next keeps the table and pager mounted with focus on Next while page 2 loads, row Revoke buttons aria-disabled during the placeholder" (page 2 response held) | keepPreviousData vs focus. Mutation-proof against removing keepPreviousData. |
| `user-sessions-tab.test.tsx` › "page clamp: revoking the only row on page 2 (total 21 → 20) requests offset 0" (offsets requested `['0','20','20','0']`) | PAN-028 lesson |
| `user-sessions-tab.test.tsx` › "page clamp: empty page with total 21 at offset 20 shows the empty row and makes no further request" (request count stable after 300 ms) | `target !== offset` guard. Mutation-proof: the implementer removes the guard, the test fails, and that is recorded. |
| `user-sessions-tab.test.tsx` › "no IP, user agent or session id in query keys, request URLs, toasts or status regions" (scan `queryClient.getQueryCache().getAll()` keys, `seen` URLs except the DELETE path's own session id, `[data-sonner-toast]` text and every `[role=status]` / `[aria-live]` text) | PII hygiene. The DELETE-one URL necessarily holds the session id, so the scan checks only that no IP or UA appears in any URL. |
| `pages.e2e.ts` › "users sessions: Sessions tab lists ada's sessions and passes axe; revoke one: confirm names ada, Cancel sends no DELETE and focus returns to the row Revoke; Confirm sends one DELETE, the row leaves, focus on the 'Active sessions' heading; revoke all: Cancel returns focus to Revoke all, Confirm sends one DELETE …/sessions and shows 'No active sessions.'; no IP or user agent in any request URL" | e2e with focus assertions (separate test) |

Every `.element()` call is preceded by `await expect.element(...)` on the same locator (lesson).

## Approach
1. **Regenerate the snapshot first, as its own step.**
   ```
   cd /home/user/org-admin-api && git rev-parse --short HEAD   # must print 26b27be
   UV_PROJECT_ENVIRONMENT=/tmp/claude-0/-home-user/ce8daed7-26f0-593f-9bf8-a95df9f28817/scratchpad/oaa-venv \
   DATABASE_URL=postgresql+asyncpg://x:x@localhost/x \
   /root/.local/bin/uv run python -m app.cli openapi --output /home/user/admin-pan/src/api/openapi.json
   cd /home/user/admin-pan && pnpm api:types && pnpm typecheck
   ```
   - Write nothing into org-admin-api.
   - Record in the impl-log: `git diff --stat src/api`, the list of new paths, new schemas and new `x-permission` values, and each typecheck error with its fix.
   - Expected drift: the 3 sessions operations and `UserSessionRead`; `GET /api/v1/stats/dashboard` with `DashboardStats` and sub-schemas, plus `admin:stats:read`; `AppRead` gaining required `member_count` (with an `AppFields` base); 2 new `AuditAction` values.
   - Fix only what the Files table lists. Anything else goes under "Stop" in the Files note.
2. **Registry.** Add the two keys and the three actions (Files table). `permits(set('admin:*'), 'admin:*')` is true, and `permits` without `admin:*` is false (verified at `permits.ts:10-12`), so no change to `permits`. In the impl-log, note that `test-fixtures.tsx:64`'s default grant of `ADMIN_PERMISSIONS` now includes the wildcard.
3. **Data layer** (`users/api/queries.ts`):
   - `sessionsAll: (id) => [...usersKeys.detail(id), 'sessions'] as const`; `sessions: (id, p: {limit, offset}) => [...usersKeys.sessionsAll(id), p] as const`. The keys hold UUIDs and numbers only. Because they nest under `detail(id)`, the existing disable/enable invalidation of `usersKeys.all` also refreshes sessions.
   - `userSessionsQueryOptions(id, {limit, offset}, api)` sends `api.GET('/api/v1/users/{user_id}/sessions', { params: { path, query }, signal })` with `placeholderData: keepPreviousData` and `gcTime: SESSIONS_GC_TIME_MS` (5 000 ms). The short gcTime keeps IP and UA in memory for a few seconds after the tab unmounts, not 5 minutes.
   - `useRevokeUserSessionMutation(userId, api)` takes `mutationFn(sessionId)` and calls `unwrap(api.DELETE('/api/v1/users/{user_id}/sessions/{session_id}', …))`. `useRevokeAllUserSessionsMutation(userId, api)` does the same for `…/sessions`. Both use `meta: { handlesOwnErrors: true }`, `retry: false`, and no cache writes (R9).
   - On success, invalidate `sessionsAll(userId)`. On 404, invalidate `detail(userId)`, which refetches user, roles and sessions. On `isUnknownOutcome`, invalidate `sessionsAll(userId)`. Import `isUnknownOutcome` from `@/features/apps/data/errors`; organizations already does this.
   - Do not invalidate the audit query. The audit log is a separate route and refetches once stale.
4. **Errors and copy.**
   - `sessionRevokeError(error)` returns `{kind:'gone'}` on 404, `{kind:'forbidden', copy: forbiddenCopy(error)}` on `isForbidden`, the message "We couldn't confirm the revoke. Check the list; revoking again is safe." on `isUnknownOutcome`, and otherwise the fixed text "The API refused this revoke. Refresh the list and try again." It never uses the server message.
   - `sessions.ts`:
     - `SESSIONS_NOTE` = "IP and browser are recorded when the browser first signed in and are shared by every account on that browser. Browser last seen updates at most hourly. Revoking stops new access tokens only; tokens already issued stay valid for up to 12 hours."
     - `REVOKE_ONE_EFFECT` = "That browser can't get new access tokens for this account. Tokens it already holds stay valid for up to 12 hours, so apps already open there (including this admin app) can keep working until then. This is not a password change: they can sign in again with their password. To lock the account, disable it instead."
     - `REVOKE_ALL_EFFECT` = "No browser can get new access tokens for this account. Tokens already issued stay valid for up to 12 hours, so open apps can keep working until then. Other accounts on the same browsers stay signed in. This is not a password change: they can sign in again with their password. To lock the account, disable it instead."
   - `sanitizeUserAgent(s)`: replace `[\u0000-\u001F\u007F-\u009F]` with a space, remove `[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]`, then trim. An empty result renders "Not recorded".
5. **Sheet** (`users-detail-sheet.tsx`):
   - `const [tab, setTab] = useState('details')`.
   - Reset during render: `if (!open && tab !== 'details') setTab('details')`. This is the guarded render-phase form, as in PAN-028. Because `UsersDialogs` keeps the sheet mounted, reopening would otherwise land on the PII list. The Sessions content unmounts, so its query goes inactive and is collected after 5 s.
   - `const showSessions = useActionPermission('users.viewSessions') !== 'denied'`, like the organization sheet. Pass `Tabs value={showSessions ? tab : 'details'}`.
   - Tabs always render. The **Details** tab holds exactly today's body: fields or the user error, Separator, `RoleAssignments`, and audit links. The **Sessions** tab holds `<UserSessionsTab user={user} />`, and its `TabsContent` mounts only while selected (Radix default).
   - `SheetContent className='w-full gap-0 sm:max-w-2xl'` with an inner `min-h-0 flex-1 overflow-y-auto` wrapper, copied from `app-detail-sheet.tsx:55-115`.
6. **Tab** (`user-sessions-tab.tsx`):
   - **Self.** `selfId = useSelfUserId()`; `isSelf = selfId !== undefined && selfId.toLowerCase() === user.id.toLowerCase()`. If `isSelf`, render the heading and the note "You can't manage your own sessions here. Ask another administrator, or use Sign out to end your own session." Render nothing else and call no hook that fetches. Split it so the query lives in an inner component that mounts only when not self. Each denied revoke is audited by the API, so not calling at all is the right default. When `selfId` is unknown the query runs and a 403 shows the mapped panel (fail open).
   - **Header.** `<h3 ref={heading} tabIndex={-1}>Active sessions</h3>`, then `SESSIONS_NOTE` in muted text. At the right, the **Revoke all** button inside `<Can action='users.revokeAllSessions'>`. It is `aria-disabled` (with a guarded onClick) unless `q.isSuccess && !q.isPlaceholderData && total > 0`.
   - **sr-only status** (`role='status' aria-live='polite'`): "`{total}` active session(s)." This holds counts only.
   - **Notice region** (`role='status'`, visible): set to "This session is no longer active. It may have been revoked or expired. The list was refreshed." after a revoke-one 404, or "This user no longer exists." after a revoke-all 404. It is cleared when a dialog opens and on success. It holds no PII.
   - **States** via `queryView`:
     - forbidden: `ForbiddenPanel` inline;
     - pending: "Loading sessions…" (`role=status`);
     - error: 404 shows "This user no longer exists."; otherwise "Couldn't load sessions." with Retry (`role=alert`);
     - success: the table.
   - **Table.** `<Table aria-labelledby={headingId}>` with `TableHead scope='col'`:
     - **Created**, **Last sign-in** (`last_used_at`), **Browser last seen** (`device_last_seen_at`): each `<time dateTime>` + `formatDateTime`.
     - **First sign-in IP**: `<bdi className='font-mono text-xs'>` or "Not recorded".
     - **First sign-in browser**: `<bdi className='font-mono text-xs break-all text-muted-foreground'>{sanitizeUserAgent(ua)}</bdi>`, full text wrapping, no truncation, no `title`, no link, no parsing library.
     - **Actions**: sr-only header. Row button **Revoke** inside `<Can action='users.revokeSession'>`, with `aria-label={`Revoke session created ${formatDateTime(s.created_at)}`}` (dates only, no IP or UA). It is `aria-disabled` with a guarded onClick while `q.isPlaceholderData`. Refs live in a `Map` keyed by `s.id`, never a selector built from data.
     - Empty: one row "No active sessions.".
   - **Pager.** `SESSIONS_PAGE_SIZE = 20`. It is shown when `total > 20`: "Showing a–b of N" (`role=status aria-live=polite`) plus Previous and Next using the `aria-disabled` + guarded-onClick pattern (`app-join-requests-tab.tsx:288-311`), not `disabled`. Use `total` from the response.
   - **Clamp** (render phase, PAN-028 lesson). `if (q.isSuccess && !q.isPlaceholderData && offset !== 0 && q.data.items.length === 0) { const target = total > 0 ? Math.floor((total - 1) / SIZE) * SIZE : 0; if (target !== offset) setOffset(target) }`. This covers revoking the last row on a page, a focus refetch (`refetchOnWindowFocus` in prod) after another admin's revoke, and expiry.
   - **Dialog state.** A single `useState<{kind:'one'; session: UserSession} | {kind:'all'} | null>`. `focusAfter` ref plus an effect on `dialog === null`, as in `app-join-requests-tab.tsx:58-68`:
     - success or gone: focus the heading;
     - cancel: focus the row button (if `isConnected`), or Revoke all, else the heading.
     - On a revoke-all success, also `setOffset(0)`.
7. **Dialog** (`user-session-revoke-dialog.tsx`). Props are `user`, `target` and `onDone(result: 'success'|'cancel'|'gone')`. Use `ConfirmDialog` with `destructive`, `pendingText='Revoking…'` and `isLoading={m.isPending}`. Add an `inFlight` ref guard in `handleConfirm`. `onOpenChange` ignores close while pending and calls `m.reset()` on cancel (copied from `app-credential-revoke-dialog.tsx:27-52`).
   - **One.** Title "Revoke this session?". Desc "Revoke the session of {email}{display_name ? ` (${display_name})` : ''} created {formatDateTime(created_at)}, last signed in {formatDateTime(last_used_at)}?" followed by `REVOKE_ONE_EFFECT`. Confirm "Revoke session".
   - **All.** Title "Revoke all sessions?". Desc "Revoke every active session of {email}{…} on every browser?" followed by `REVOKE_ALL_EFFECT`. Confirm "Revoke all sessions". No count, since it may be stale.
   - **Outcome.**
     - Success: `toast.success('Session revoked.')` or `'All sessions revoked.'`, with no email, IP, UA or id, then `onDone('success')`.
     - Error `gone`: `onDone('gone')`; the hook already invalidated.
     - Error `forbidden`: inline `ForbiddenPanel` in the error slot.
     - Error `message`: `<p role='alert'>`. The dialog stays open.
   - Never call any auth-client method and never clear the query client: no account change happens here.
8. **Rules.**
   - R1: API only.
   - R2: generated types; the only HTTP is via `api.GET`/`api.DELETE`.
   - R3: untouched.
   - R4: `<Can>`/`useActionPermission` mirror `admin:*`; every 403 is still handled.
   - R5: no IP, UA or session id in toasts, URLs, query keys, aria-live text or logs; there is no `console` (lint).
   - R6: text nodes only, `<bdi>`, sanitized UA.
   - R7: drift is listed.
   - R9: confirm names the target; never optimistic; invalidate after.
   - R10: semantic table, focus management, `aria-disabled` pager, announced statuses.
   - R11: staff-only admin feature.
9. **e2e fake** (`fake-api.ts`).
   - For each `u` of `USERS`: `GET /api/v1/users/${u.id}` returns `json(200, u)`; `GET …/role-assignments` returns `page([], query)`.
   - Sessions state: `ada` has 2 rows. One has `ip: '203.0.113.7'` and a long UA (`'Mozilla/5.0 (E2E) ' + LONG`). The other has `ip: null, user_agent: null`. Use distinct `created_at`, ids `aaaaaaa{n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`. `bob` and `cy` have none.
   - `GET …/sessions` returns `page(rows, query)`.
   - `DELETE …/sessions/${id}` (registered per row) removes the row and returns `null` (204), or `envelope(404, 'not_found')` if it is already gone.
   - `DELETE …/sessions` empties the list and returns `null`.
10. **e2e test** (separate, in `pages.e2e.ts`).
    - Sign in at `/users`. Open the ada actions menu, then View details, then `selectTab(page, 'Sessions')`. Expect 2 data rows and run `expectNoSeriousA11y(page, 'users-sessions')`.
    - Click the first row's Revoke. The alertdialog contains `ada@people.e2e.test` and "up to 12 hours". Run axe `'users-session-revoke'`. Cancel: hidden, the row button is focused, 0 DELETE calls.
    - Revoke again and confirm: exactly 1 DELETE to `/api/v1/users/{ada}/sessions/{id}`, the "Active sessions" heading is focused, 1 data row.
    - Click Revoke all and Cancel: Revoke all is focused. Revoke all and confirm: 1 DELETE to `…/sessions`, "No active sessions." visible.
    - Finally no call path or query contains `203.0.113.7` or `Mozilla`.
11. Run `pnpm format`, then all checks. Record the mutation checks (inFlight guard, clamp guard, keepPreviousData, self branch) in the impl-log with their failing outputs.

## Specialist input used
- **api-platform-engineer.** Adopted:
  - endpoint, fields and error facts;
  - "first sign-in" labels;
  - 404 means refetch;
  - `self_session_change_forbidden` must not trigger a refresh;
  - short gcTime;
  - regeneration as an isolated step with the drift recorded.

  Its open questions are decided:
  - Q1: `permits` accepts `admin:*` as a required key, verified at `permits.ts:10-12`. `permits.test.ts:27-29` covers only keys without a second segment.
  - Q2: the regeneration is inside PAN-017 as drift.
  - Q3: owner decision; the default is full values (below).
  - Q4: audit enum entries are in this ticket because typecheck forces them; only tones are added, no new labels.
  - Q5: no include-revoked option; the API has none.
- **appsec-engineer.** Adopted all six should-fix items:
  - registry and regeneration;
  - self copy plus no request for self, failing open when unknown;
  - non-overclaiming copy, pinned by a unit test;
  - `inFlight` ref with a test of two synchronous clicks;
  - one neutral 404 path that invalidates `detail(id)` and never branches on the message;
  - UA as text only, sanitized, in `<bdi>`, "Not recorded" for null.

  Also adopted: notes 7–11 (key nested under detail, PII hygiene in toasts, keys, URLs and aria-live; no auth-client calls; not optimistic; confirm names the target).

  Adapted:
  - The confirm names the user by email (plus display name), as `users-status-dialog` does. Toasts carry no email at all, which is stricter.
  - Revoke-all shows no count, because it may be stale (the frontend's view).
  - Pagination: 20 per page with a pager, not 100 with "Showing 100 of N", so every session stays revocable one by one (spec §6 server-side pagination).

  The overclaiming disable copy goes to follow-ups.
- **frontend-developer.** Adopted:
  - Tabs with Details and Sessions, using `useActionPermission !== 'denied'`, sheet widened;
  - tab reset on close;
  - query layer with keepPreviousData plus `aria-disabled` actions during the placeholder;
  - mutation hooks;
  - one dialog-state union;
  - focus refs;
  - `aria-disabled` pager;
  - clamp with `target !== offset`;
  - e2e fake routes.

  Changed:
  - One dialog component for both kinds instead of two, which means less code.
  - Revoke-one 404 closes the dialog with a neutral tab notice instead of an in-dialog message, which matches "treat as already gone".
  - No IP in the confirm text: the session is named by its dates, so less PII is repeated.
  - Fallback copy is fixed text, not the server message.
  - gcTime is 5 s.

  Its open questions are decided:
  - Q1: the `admin:*` gate mirrors the API; owner note below.
  - Q2: both timestamps are shown with distinct labels.
  - Q3: no count in the confirm; the total appears only as the sr-only count and pager text.
  - Q4: an e2e test is in scope (lead requirement).
  - Q5: no current-session marker.

## Assumptions
- org-admin-api 26b27be is the pinned source. USR-10 is DONE and merged (ticket header).
- Spec §8 Q3 (UI language) is open; labels are English like the rest of the app.
- `formatDateTime` (users/data/data.ts) is acceptable for all three timestamps.
- Showing the staff user's email in the confirm dialog is allowed. R5 covers logs, URLs and analytics, and `users-status-dialog` already does it.
- Revoke-all on a user with zero sessions is prevented in the UI (`aria-disabled`). The API would answer 204 anyway.

## Needs owner's decision (non-blocking; safer default applied)
1. **Full IP and user agent, or masked?** org-admin-api spec Q6 is still open. **Default: show the full values as the API returns them, provisionally.** Rendering is confined to the two cells in `user-sessions-tab.tsx`, so masking later is a one-place change. Only `admin:*` holders see them, nothing is cached beyond 5 s, and they appear in no URLs, toasts or keys.
2. **Super-admin only.** The API requires `admin:*`, so other staff never see the Sessions tab. The UI mirrors this. A finer key would be an org-admin-api change.
3. **Spec text.** §5.4's API line and §9's "API gaps" list are out of date (USR-10 is done). Update them via `/idea` or the product-manager.

## Blocking questions
None

## Split proposal
None. It is one spec feature with no backend or migration. The regeneration knock-on is mechanical (literal fields and map entries). The product diff is estimated at about 450 lines, slightly over the guide, mostly the tab component and dialog. Splitting list from revoke would ship a PII list with no action, so it stays one slice. Comparable scope (PAN-028) went through one cycle.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/users` → user detail sheet → **Sessions** tab | Tab and list: `admin:*` (`users.viewSessions`). Hidden when denied, still handles 403. Self: note only, no request. | Loading "Loading sessions…"; empty "No active sessions."; error "Couldn't load sessions." + Retry; 404 "This user no longer exists."; 403 `ForbiddenPanel` (permission_denied, self, admin_wildcard_required copies); happy: table + pager | Row **Revoke** → confirm → `DELETE …/sessions/{session_id}` (`admin:*`, `users.revokeSession`) | Success: `usersKeys.sessionsAll(id)`. 404: `usersKeys.detail(id)`. Unknown outcome: `sessionsAll(id)`. |
| same | same | same | **Revoke all** → confirm → `DELETE …/sessions` (`admin:*`, `users.revokeAllSessions`); offset → 0 | same |
| `/users` detail sheet → **Details** tab | unchanged (`admin:users:read`, etc.) | unchanged | unchanged | unchanged |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/users/{user_id}/sessions` | path `user_id`; query `limit=20`, `offset` | `components['schemas']['Page_UserSessionRead_']` (items `UserSessionRead`) | 401 (global client hook), 403 `permission_denied` / `self_session_change_forbidden` / `admin_wildcard_required`, 404 `not_found`, 5xx/network (error + Retry) | USR-10 |
| DELETE | `/api/v1/users/{user_id}/sessions/{session_id}` | path ids; no body | 204, empty | 401, 403 (inline), 404 → gone (refetch, neutral notice), 5xx/network → unknown outcome (refetch), other → fixed fallback | USR-10 |
| DELETE | `/api/v1/users/{user_id}/sessions` | path `user_id`; no body | 204, empty | as above (404 = user gone) | USR-10 |

## Follow-ups (not in this diff, R7)
- `users-status-dialog.tsx:69` overclaims ("signed out of every mmlabs app"). Fix it with the same 12-hour wording.
- Spec §5.4 and §9 text (owner note 3).
- `registry.ts` `/_authenticated/` reason "No stats API" is stale. PAN-020 owns it, along with `admin:stats:read`.
- Apps Members column using `AppRead.member_count`: separate ticket.
- Move `isUnknownOutcome` from `features/apps/data/errors.ts` to `src/lib` (two features now cross-import it).
- `app-credentials-tab.tsx` pager uses `disabled`; switch it to the `aria-disabled` pattern.
- `apps/components/test-fixtures.tsx:64` default grant now contains `admin:*` (a wildcard). Future "all but X" tests must not use it.
