# PAN-028 security review

## Attempt 1

Checks not run (reviewer's R8). **Verdict: no 🔴 blockers.** Two 🟡, a few 💭.

### Checked and correct
- **PII (R5):** query key holds only app key, status, limit, offset (`src/features/apps/api/queries.ts:65-71`); URL path only app key + `request_id` UUID; toasts are fixed strings (`app-join-request-decision-dialog.tsx:37-39`); no `console.*`; decision errors use fixed copy for 404, every 409 reason and unknown outcomes (`errors.ts:283-299`). Email and name only in DOM text, `title` and row-button `aria-label`.
- **R6:** email and display_name rendered as React text/attributes; no HTML sinks or data `href`.
- **R4:** registry list → `admin:users:read`, approve/reject → `admin:roles:assign` (`registry.ts:131-139`), matching `join_requests/router.py:19,27`; tab hidden for `admin`; list 403 → inline `ForbiddenPanel` (`app-join-requests-tab.tsx:160-161`); decision 403 → `ForbiddenPanel` in the dialog (`errors.ts:35-37`, dialog `:89-90`); `unknown` keeps controls (API is the gate).
- **R9:** confirm names requester and app; non-optimistic; `inFlight` guard (`dialog:32-35`) + ConfirmDialog ignores clicks while loading; Escape/Cancel blocked while pending; `retry: false`; no request body (`queries.ts:349-362`).
- **409 `email_unverified` vs AuthGate:** `conflict` → `kind: 'http'`; `GATE_CODES` applies only to `kind: 'auth'` (`src/api/client.ts:12-17,96-101`); never reaches AuthGate; mapped to fixed copy.
- **Invalidations:** success → `appsKeys.joinRequestsAll(appKey)`, approve also `usersKeys.detail(user_id)` (covers role-assignments); 404/409/unknown → list; `app_disabled`/`join_policy_changed`/`default_role_unusable` → app detail; `['me','permissions']` not invalidated (correct).
- **Self-approval:** allowed by the API; only the app's default role; audited; UI labels "(you)"/"(by you)" (`app-join-requests-tab.tsx:196,241-243`).

### Findings
1. 🟡 **Empty `display_name` not handled** — `app-join-requests-tab.tsx:94`, `:191-193`: `r.display_name ?? r.email` treats `""` as a name, so the button reads "Approve " with no target, the requester cell is empty and the email sub-line is skipped; the dialog uses a truthiness check (`dialog:51`). Risk: wrong-target decision for screen-reader users (R9/R10). Fix: one helper `requesterLabel = r => r.display_name?.trim() || r.email` in all three places; render the email sub-line only when the trimmed name is non-empty.
2. 🟡 **Some server text can still reach the dialog** — `errors.ts:298` → `fallback()` `:39`: unmapped statuses (e.g. 422 on a malformed `request_id`, 429) show `error.message.slice(0, 200)`. Not exploitable today (no PII in these messages), but contradicts the function's docstring; the test asserts server text for 422 (`errors.test.ts:315`). Fix: end `joinRequestDecisionError` with forbidden → `ForbiddenPanel`, else fixed copy ("The API refused this decision. Refresh the list and try again."); update the 422 test (or reword the docstring if intended).

### 💭 Notes
- After an unknown outcome Confirm stays enabled (`dialog:96-98`); a second POST is safe (row lock → 409 `not_pending`).
- Optional: "This is your own request." in the approve dialog when `user_id === selfId`.
- E2E fake (`e2e/support/fake-api.ts:280-334`) uses fixture users, no body, correct 409 envelope.

### Follow-ups (out of scope)
- org-admin-api: decide whether self-approval should be blocked or flagged in the audit log.
- admin-pan: add per-role member-list keys to the approve invalidation when the roles feature has them.
