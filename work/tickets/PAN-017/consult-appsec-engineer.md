## PAN-017: AppSec consult at PLAN (read-only)

The API side is sound. All three routes need `admin:*`, refuse the caller's own account with a 403 and an audit row, check user and session ownership together (IDOR-safe 404), return a fixed allow-list of fields, and send `Cache-Control: no-store`. So the UI risks are about how it presents the data, not about access. Nothing found would block the plan as long as the points below go into it.

### Findings

**🟡 should-fix (put these in the plan)**

1. **The OpenAPI snapshot and the permission registry don't know these endpoints yet.**
   - `/home/user/admin-pan/src/api/openapi.json` has no `sessions` paths. The only user paths are `{user_id}` and `role-assignments`.
   - `/home/user/admin-pan/src/lib/permissions/registry.ts:7-19` (`ADMIN_PERMISSIONS`) has no `admin:*`.
   - R2 forbids hand-written types, so the plan must:
     - regenerate `openapi.json` and `schema.d.ts` from org-admin-api at 26b27be or later;
     - add `'admin:*'`, which `registry.test.ts:22` forces once the spec carries it;
     - add actions such as `users.sessions.view` = `perm('admin:*', 'GET /api/v1/users/{user_id}/sessions')` and `users.sessions.revoke` = `perm('admin:*', 'DELETE …/sessions/{session_id}', 'DELETE …/sessions')`.
   - `permits()` (`src/lib/permissions/permits.ts:12`) already allows `admin:*` when the exact key is granted.
   - The API source: `/home/user/org-admin-api/app/modules/users/router.py:75-80` (`require_permission("admin:*")`).

2. **The self-session 403 code has no copy.**
   - The API returns 403 `self_session_change_forbidden` on the list (`/home/user/org-admin-api/app/modules/sessions/staff_service.py:52-53`) and on both revokes (`:79-80`).
   - `forbiddenCopy` (`/home/user/admin-pan/src/lib/forbidden.ts:34-64`) has no case for it, so it falls to "The server refused this request."
   - Fix:
     - Add a case: "You can't manage your own sessions" / "Ask another administrator, or sign out from your own devices."
     - Like `data-table-row-actions.tsx:26-28`, use `useSelfUserId()` (`src/context/permission-provider.tsx:89`). For your own account, don't run the sessions query and don't render the revoke controls; show the note instead.
     - While `selfUserId` is still unknown, fail open and render the 403 copy if the API returns it.

3. **Revoke copy must not overclaim.**
   - API fact (`router.py:65-72`, org-admin-api spec §5.10):
     - Revoking only stops **new** access tokens.
     - Tokens already issued, admin `aud=admin` tokens included, stay valid up to 12 h plus 30 s.
     - It does not stop a new sign-in with the password.
   - Confirm and description text should say roughly: "They won't get new access to mmlabs apps on that device. Apps they already have open can keep working for up to 12 hours. This does not change their password. For a compromised account, disable the user instead."
   - Never say "signed out immediately".
   - The existing disable dialog already overclaims ("They will be signed out of every mmlabs app", `/home/user/admin-pan/src/features/users/components/users-status-dialog.tsx:69`). That goes in follow-ups, not this diff (R7).

4. **Double-submit on revoke-one surfaces a false error.**
   - `ConfirmDialog` guards on `isLoading` (`/home/user/admin-pan/src/components/confirm-dialog.tsx:88-94`), but `isPending` only flips on the next render. Two clicks in the same tick can send two DELETEs.
   - The second revoke-one then gets 404 `not_found`, and the UI shows an error after the revoke actually worked. Revoke-all is idempotent (204, no audit row), so it is harmless.
   - Fix: add a `useRef` in-flight guard in the session dialogs' `handleConfirm`, and add a test for two rapid clicks.

5. **Two different 404s share one code.**
   - "User not found" and "Session not found" are both `not_found`; they differ only in `message` (org-admin-api `app/core/errors.py:32-34`).
   - Don't branch on the message text. On any 404 from a revoke:
     - invalidate `usersKeys.detail(userId)`, which refetches both the user and the sessions;
     - show neutral copy: "This session is no longer active. It may have been revoked or expired. The list was refreshed."
   - If the user is gone, the sheet's existing 404 path (`users-detail-sheet.tsx:76-78`) takes over.
   - Note: revoke-one returns 204 even for a session that has silently expired but was never revoked (USR-10 security review). This is harmless.

6. **User-agent text is attacker-controlled (R6).**
   - Anyone can set it at first sign-in, up to 512 chars (`/home/user/org-admin-api/app/modules/sessions/models.py:53`).
   - Rules for the plan:
     - Render it only as a React text node. No `dangerouslySetInnerHTML`, never auto-link anything, no markdown.
     - Wrap it in `<bdi>` (or `dir='ltr'` with `unicode-bidi: isolate`) and strip C0/C1 controls and bidi overrides (U+202A–202E, U+2066–2069) before display, so "\u202E" tricks can't reorder neighbouring cells or fake a browser name.
     - Truncate visually with CSS and show the full value on demand as text (expander or tooltip). Using `title` is safe.
     - Label it "User agent (reported by the browser)", in muted monospace, so staff don't treat it as verified.
     - Don't add a UA-parsing dependency in this ticket. If the plan wants friendly names, a small local function with tests is enough. Spoofed input gives spoofed output either way.
     - `null` shows "Not recorded". The same rules apply to `ip`: plain text, `null` shows "Not recorded".

**💭 notes (already handled, keep them that way)**

7. **PII in memory, cache and logs.**
   - The client forces `cache: 'no-store'`, `credentials: 'omit'` and `referrerPolicy: 'no-referrer'` (`/home/user/admin-pan/src/api/client.ts:37-45`). Queries are cleared on every auth change (`/home/user/admin-pan/src/lib/query-client.ts:27-35`). ESLint has `no-console: error`. Mutation errors go only to toasts (`handle-server-error.ts`) and carry server messages, which contain no IP or user agent.
   - Recommended:
     - Use the key `[...usersKeys.detail(id), 'sessions', {limit, offset}]`: UUIDs only, never IP or user agent. Nesting it under `detail` means the existing `invalidateQueries(usersKeys.all)` after disable/enable (`queries.ts:109-110`) also refreshes sessions, which matters because disabling revokes sessions.
     - Give the sessions query `gcTime: 0` (or a few seconds) so IP and user agent don't stay cached for 5 minutes after the sheet closes.
     - Never put IP, user agent or session id into route search params, toasts, `aria-live` text, or external lookup links such as whois or geo-IP (R5: no PII in URLs or third parties).
     - Toast copy: "Revoked 1 session" or "Revoked all sessions for <label>", with no IP or user agent.

8. **Self-lockout and the in-memory token.** The API makes it impossible to revoke your own sessions, so the admin-pan session can't be cut from this screen. Indirect cases still work through the existing flow:
   - Another staff member revokes this admin's sessions. The in-memory `aud=admin` token keeps working until `exp`. The next `getToken` fails with `session_invalid`. Then:
     - `client.ts:100-101` calls `notifyUnauthorized`;
     - the gate takes over;
     - `clearOnAuthChange` wipes the cache.
   - Same browser, different staff account: revoke touches only the target's `account_sessions` rows, never the device session or other accounts on it (`test_revoke_all_shared_device_keeps_other_user`).
   - Nothing new is needed in `src/api/auth-client.ts`. The plan must not call any auth-client method (logout, `switchAccount`) from this feature.

9. **Non-optimistic updates and invalidation (R9).**
   - Follow `useSetUserStatusMutation` (`/home/user/admin-pan/src/features/users/api/queries.ts:107-127`): `meta: { handlesOwnErrors: true }`, no cache writes, and on success invalidate the sessions key.
   - Also invalidate `['audit', …]` if an audit query is mounted. Not required; the audit link is a navigation.
   - Keep the dialog open while the request is pending (`confirm-dialog.tsx:57-60`), and show 403 through `ForbiddenPanel` inline.
   - 403 `permission_denied` and `admin_wildcard_required` already refresh `me/permissions` (`src/lib/permissions/permission-refresh.ts:6-9`). No change needed.

10. **Confirm naming (R9).**
    - Revoke-one: name the user (label or email) and the session by created time and last seen. Showing IP and user agent there is fine, since they're already on screen.
    - Revoke-all: "Revoke all N sessions of <email>?", with N from `total`. Use destructive variants for both.

11. **Pagination.** Use `limit: 100, offset: 0`. If `total > items.length`, say so ("Showing 100 of N"). Revoke-all covers sessions that aren't shown.

### Recommendations (testable requirements for the plan)
- **R-a:** Regenerate the OpenAPI types, add `admin:*` to the registry with the two actions, and wrap the section in `<Can>`.
- **R-b:** Self account: no sessions request is sent and an explanatory note shows. Separately, a mocked API 403 `self_session_change_forbidden` shows the new copy.
- **R-c:** Tests (network-mocked, R8):
  - list states: loading, empty, error with Retry, 403 `permission_denied`, 403 self, 404 user;
  - revoke-one and revoke-all: confirm, cancel, pending (Escape blocked), success (invalidates and toasts), 403 inline, 404 (refetches and shows neutral copy);
  - a double-click sends only one DELETE.
- **R-d:** A user agent containing `<img src=x onerror=…>` renders as literal text, and one with U+202E renders with the override removed and isolated.
- **R-e:** Snapshot or assert that no toast, query key or URL contains the IP or user-agent string from the fixtures.
- **R-f:** Copy states the "up to 12 h, not a password change" limit. A unit test fixes the string so it can't drift into "signed out now".

### Risks
- **Residual:** staff may treat revoke as an incident response. Mitigate with copy (Finding 3) and point to disable plus password reset.
- **PII:** showing IP and user agent to staff is still open in the org-admin-api spec (Q6, §5.10 "Open: Q6"). The admin-pan spec Q6 is about 2FA, not PII, so the two specs track this differently.
- **Spoofed user-agent text:** social-engineering text could appear inside the trusted admin UI. This is mitigated only by labelling and display hygiene.

### Open questions
1. Does the owner accept showing full IP and user agent to `admin:*` staff (org-admin-api spec Q6), or should the UI mask them (e.g. `/24` IP, collapsed user agent)? This should be recorded on the ticket.
2. Should the UI name the user by email or by display name in confirm copy and toasts? The current status dialog uses the full email in toasts (`users-status-dialog.tsx:36-38`). That's allowed: R5 covers logs and URLs, not on-screen text.
3. Should "Last seen" show `device_last_seen_at` (the browser, shared by every account on it, refreshed hourly) or `last_used_at` (this account's last sign-in)? Recommendation: show both, clearly labelled.

### Follow-ups (out of scope)
- Fix the overclaiming disable copy in `/home/user/admin-pan/src/features/users/components/users-status-dialog.tsx:69`.
- The admin-pan spec §5.4 still lists sessions revoke as "identity-architecture §4" and doesn't mention USR-10 or the self-forbid. Update the spec reference.
