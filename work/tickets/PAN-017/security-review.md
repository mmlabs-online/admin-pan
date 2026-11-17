# PAN-017 security review

## Attempt 1

Scope: `git diff origin/main...HEAD` (commits ee5e43f..c4e0365), checked against org-admin-api 26b27be. Checks not run (reviewer's R8).

**Verdict: no blockers.** Every PLAN-consult requirement (R-a to R-f) and finding 1–11 is implemented and tested. Two 🟡, some 💭.

### Requirements traceability
- **R-a (met):** snapshot regenerated from 26b27be (impl-log.md:6,24); both sessions paths present; `UserSessionRead` matches `app/modules/sessions/schemas.py:9-21`. `ADMIN_PERMISSIONS` gains `'admin:*'` and `'admin:stats:read'` (`src/lib/permissions/registry.ts:8,18`); `users.viewSessions/revokeSession/revokeAllSessions` = `perm('admin:*', …)` (`registry.ts:101-109`); controls in `<Can>` (`user-sessions-tab.tsx:128,214`); tab hidden when denied (`users-detail-sheet.tsx:28`).
- **R-b (met):** self → no list request, note shown (`user-sessions-tab.tsx:40-50`; test `users-detail-sheet.test.tsx:334`); self id unknown → request goes out, 403 `self_session_change_forbidden` shows new copy (`src/lib/forbidden.ts:58-63`; test `user-sessions-tab.test.tsx:160`); permission refresher ignores this code (`permission-refresh.ts:6-9`), pinned by `permission-refresh.test.ts:39-43`.
- **R-c (met):** list loading/empty/error+Retry/404/403/403-self; revoke-one/all confirm, cancel, pending (Escape blocked), success, 403 inline, 404 neutral, 500 unknown outcome; double-click → one DELETE (`user-sessions-tab.test.tsx:253`), `useRef` guard (`user-session-revoke-dialog.tsx:33-49`).
- **R-d (met):** UA with `<img onerror>` renders as literal text; U+202E stripped and value in `<bdi>` (`user-sessions-tab.test.tsx:195,203`; `user-sessions-tab.tsx:206-212`); text node only.
- **R-e (met):** test asserts no IP, UA or session id in query keys, request URLs, toasts or status/live regions (`user-sessions-tab.test.tsx:457-484`); e2e checks URLs; toasts are fixed strings (`user-session-revoke-dialog.tsx:40-42`).
- **R-f (met):** `REVOKE_ONE_EFFECT`, `REVOKE_ALL_EFFECT`, `SESSIONS_NOTE` say "up to 12 hours", "not a password change", point to disabling (`src/features/users/data/sessions.ts:4-13`); test forbids "signed out", "immediately", "logged out" (`sessions.test.ts:24-32`).
- **404 (met):** `sessionRevokeError` maps any 404 to `gone` without reading the message (`errors.ts:62-74`); hook invalidates `usersKeys.detail(userId)` (`queries.ts:137`); fixed copy for unknown outcomes.
- **PII in memory (met):** key `['users','detail',id,'sessions',{limit,offset}]` (UUIDs only); `gcTime: 5_000` (`queries.ts:22,155`); tab resets to Details on close and inactive tab unmounts (`users-detail-sheet.tsx:25-27`); non-optimistic, `retry: false`, `handlesOwnErrors`.
- **IP rendering safe:** API stores `INET` (`models.py:52`), never reads `X-Forwarded-For` (`app/core/client_ip.py:18-26`); plain text in `<bdi>`.

**`ADMIN_PERMISSIONS` as "grant everything" in production? No.** Production uses it only to derive the `AdminPermission` type (`registry.ts:23`, `source.ts:6`, `forbidden.ts:7`); `permits()` (`permits.ts:6-13`) unchanged; adding `'admin:*'` changes nothing at runtime.

### Findings
1. 🟡 **Invisible bidi control characters committed in source and tests ("Trojan Source" hygiene, CWE-1007 class)** — `src/features/users/data/sessions.ts:22` (regex class written with literal U+061C, U+200E, U+200F, U+202A–202E, U+2066–2069), `sessions.test.ts:11,14`, `user-sessions-tab.test.tsx:205,211`. Works, but invisible to reviewers; GitHub warns on the PR. Fix: use `\uXXXX` escapes only (e.g. a class of `؜‎‏‪-‮⁦-⁩`) and build test inputs with escapes; optionally a lint/CI grep for literal U+202A–202E / U+2066–2069 in `src/`.
2. 🟡 **Sanitizer misses other invisible format characters** — `sessions.ts:18-24` keeps U+200B–U+200D, U+2060, U+FEFF (zero-width), U+2028/U+2029 (separators), U+FFF9–U+FFFB (interlinear annotation), U+E0000–U+E007F (tags). Low impact (`<bdi>` stops reordering), but enables lookalike/hidden-text spoofing. Fix: extend the strip set (with the `u` flag for the tag range), map U+2028/U+2029 to a space, one test per group.
3. 💭 Apps test fixture default grant now includes `admin:*` (`src/features/apps/components/test-fixtures.tsx:64`); suggest defaulting to `ADMIN_PERMISSIONS` without `'admin:*'`.
4. 💭 `keepPreviousData` placeholder (`queries.ts:154`) is safe only because the tab unmounts between users; if the sheet ever switches users without closing, add `key={user.id}` or restrict the placeholder to the same user.
5. 💭 Self check is case-insensitive; "Sign out" wording accurate; no auth-client calls in the feature.
6. 💭 Confirm dialog's `display_name` (`user-session-revoke-dialog.tsx:57`) is a text node but not bidi-isolated — pre-existing pattern (R7).

### Follow-ups (out of scope)
- `users-status-dialog.tsx:69` disable copy still overclaims.
- Shared `sanitizeDisplayText()` + `<bdi>` for all API free text.
- Owner decision on full IP/UA display (org-admin-api spec Q6) not yet recorded on the ticket.
- Spec §5.4 reference update for USR-10 and the self-forbid.
