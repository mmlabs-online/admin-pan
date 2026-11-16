## Attempt 1

**Verdict: no blockers.** No 🔴 or 🟡 findings; 3 💭 notes. I reviewed the diff against org-admin-api origin/main. The R8 checks are the reviewer's job.

### Checks (all pass)
- **R5:**
  - Only `status` is registered with `useTableUrlState`. The email filter is held in local state (`users-table.tsx:54`, `use-table-url-state.ts:166-187`).
  - `usersSearchSchema` has no `email` key, so an old `?email=` is dropped.
  - A test checks that the email reaches the API but not the router search (`users-table.test.tsx:195-209`).
  - The query key holds the email, but only in memory: there is no persister, and devtools run in dev only.
  - `ApiError` holds no URL. The global error toast is generic.
- **R6:** all API data, including `error.message` (capped at 200 characters), is rendered as React text. There is no `href` built from data and no `dangerouslySetInnerHTML`.
- **R9:**
  - The confirmation names the target and its consequences (`users-status-dialog.tsx:59-67`).
  - The dialog closes and the toast shows only on success. Buttons are disabled and close is blocked while the request is pending. `retry: false`.
  - `usersKeys.all` is invalidated (`queries.ts:171-182`).
  - Errors are shown inline: 403 → ForbiddenPanel; 409 and 404 get specific copy and a refetch. `handlesOwnErrors` prevents a duplicate toast.
- **R4:** the list, the detail and the role assignments all go through `queryView`, so the error is checked before the data. Each has its own 403 state. Row actions and the assignments section use `<Can>` with keys that match the API (`assignments_router.py:25-28`).
- **R2:** feature code uses `getApi()` / `ApiClient` only. `test-utils/api.ts` is imported only by tests, and its fake fetch is injected and never replaces the global one.
- **Snapshot hand-patch:** exactly two operations gained a 409, matching `users/router.py:46-47` and `assignments_router.py:58-59`. The `schema.d.ts` changes match, and `last_super_admin` matches `errors.py:81`.

### Notes
- 💭 `users-status-dialog.tsx:634-636`: the success toast shows the full email. It is on screen only, so not an R5 issue. Optionally show the display name instead.
- 💭 `users-status-dialog.tsx:622`: the Disable/Enable action is chosen from the list-row snapshot, which may be stale. This is safe: the request sends an explicit status that the user confirmed, and it is idempotent. It is a UX issue only.
- 💭 `queries.ts:171-182`: audit-log queries are not invalidated after a change. Acceptable until audit-log uses the real API.

### Follow-ups
1. **org-admin-api:** `GET /users?email=` puts the email in API request URLs, so it can end up in access logs. Either redact query strings in the logs, or offer `POST /users/search`. This is recorded in ADR 0005.
2. **org-admin-api:** `_WRITE` and `_REVOKE` mutate the dict returned by `require_permission`. Add a test or a comment so the 409 does not leak onto other endpoints.
3. **admin-pan:** reuse the email-out-of-URL pattern for free-text filters in PAN-014 to PAN-016.
