## Attempt 1 — 2026-11-16
Verdict: PASS

Reviewed: `git diff origin/main...HEAD` at HEAD 800e498 (PAN-013 code commit 800e498 plus the orchestrator's work/ commits). Contract checked against org-admin-api d9e496f: `app/modules/users/router.py`, `app/modules/users/schemas.py`, `app/modules/rbac/assignments_router.py`, `app/modules/rbac/schemas.py:238`, `app/core/errors.py:58-90`.

### Checks (run by reviewer)
- pnpm typecheck: pass (`tsc -b`, no output)
- pnpm lint: pass (`eslint .`, no output)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): Test Files 64 passed (64), Tests 425 passed (425). Matches impl-log.
- pnpm build: pass ("built in 919ms")
- CI types diff: `openapi-typescript src/api/openapi.json` into a scratch file is byte-identical to the committed `src/api/schema.d.ts`.
- Snapshot: the 409 responses are on `PATCH /api/v1/users/{user_id}` and `DELETE /api/v1/users/{user_id}/role-assignments/{assignment_id}` only. This matches `router.py:47` and `assignments_router.py:59` in the API. The hand-patched fallback and the reason (the full regeneration breaks `registry.test.ts` with `admin:audit:read`) are recorded in impl-log, with a follow-up.
- pnpm e2e: not planned.

### Acceptance criteria
- [x] AC1 List uses server-side `limit`/`offset`, `email`, `status`. Evidence:
  - `queries.ts:42-58` (`toUsersListParams`: trims email, omits it when empty, sends status only when exactly one is selected; `toPageParams` caps the limit at 100) and `queries.ts:61-73`.
  - `users-table.tsx:66-81`: `manualPagination`, `manualFiltering`, `rowCount` from `total`, `enableSorting: false`, core row model only.
  - Tests (pass): `queries.test.tsx` "page 3 / size 10 …", "trims the email …", "sends status only when exactly one …", "usersListQueryOptions sends limit/offset/email/status"; `users-table.test.tsx` "next page requests offset=10 and updates ?page", "typed email is debounced, trimmed and sent as email=", "one status sends status=disabled; both statuses send none".
  - Param names and types match `list_users` (`email` min_length 1, `status: UserStatus`).
- [x] AC1a (owner) The typed email never reaches the URL. Evidence:
  - `useTableUrlState` is configured with `status` only (`users-table.tsx:54`), so the email filter stays in the hook's local state.
  - `usersSearchSchema` has no `email` (`data/schema.ts:21-25`).
  - Tests (pass): `users-table.test.tsx` "typed email never reaches the URL search"; `schema.test.ts` "drops an email key".
- [x] AC2 PATCH status with confirmation, errors shown, no optimistic success (R9). Evidence:
  - `users-status-dialog.tsx:30-48`: the dialog closes only in `onSuccess`, close is ignored while pending, and `reset()` runs on close. The confirm text names the email and display name plus the disable side effects.
  - `queries.ts:107-129`: no `onMutate` and no `setQueryData`; it invalidates `['users']` on success and refetches on 404/409; `handlesOwnErrors` avoids a double toast.
  - Error codes match `app/core/errors.py` (`self_status_change_forbidden`, `admin_wildcard_required`, `last_super_admin` as 409).
  - Tests (pass): all 9 in `users-status-dialog.test.tsx` (copy, pending with Escape blocked and the badge unchanged, success plus refetch, 403 ×2 without the server text, 409, 404 plus refetch, cancel sends no PATCH, no stale error on reopen, enable sends `active`); `errors.test.ts` (2).
- [x] AC3 Loading, empty, error and 403 are tested with a fake `fetch` injected into `createApiClient`. Evidence:
  - The helper is `src/test-utils/api.ts:9-23`.
  - List tests (pass) in `users-table.test.tsx`: "loading", "empty (no filters)", "empty (filtered)", "error shows an alert and Retry refetches", "403 renders ForbiddenPanel and hides the table", "403 on refetch replaces stale rows".
  - The Apps & roles section has the same states tested in `users-detail-sheet.test.tsx`.
  - There is no `msw` in `package.json`.
- [x] AC4 (owner) Bulk Disable and the selection column are removed. Evidence:
  - `data-table-bulk-actions.tsx` is deleted, and the select column is gone from `users-columns.tsx`.
  - Test (pass): "has no row-selection checkboxes and no bulk toolbar".
- [x] AC5 (owner) "Apps & roles" is read-only and real. Evidence:
  - `users-detail-sheet.tsx:143-239`: shows app, role_key, scope ("App-wide" or the raw org id), expiry or "Never", and Active/Inactive. It has its own loading, empty, error with Retry, and 403 states, plus "Showing N of M". It is gated by `<Can action='roles.viewAssignments'>` (registry: `admin:users:read`, which matches `assignments_router.py:26`).
  - There is no `PREVIEW_APP_ROLES` (grep).
  - Tests (pass): 7 assignment tests in `users-detail-sheet.test.tsx`, including "has no Preview badge or sample data".

### Issues
None blocking.

### Rules R1–R11
No violations found.
- R2: HTTP goes only through `api.GET`/`api.PATCH` from `@/api`. Types come from `components['schemas']` (`data/schema.ts:5-7`), and the hand-written zod user schema is deleted. `getApi()` uses `fetchWithToken` (`src/api/index.ts:19-24`).
- R4: row actions keep `<Can>`. Every 403 renders `ForbiddenPanel`, and the no-write test passes.
- R5: no email in the app URL. The email does travel in the API query string; this is the API's design, and a follow-up is recorded.
- R6: API strings are rendered only as React text.
- R7: the changed files match the plan. `users-dialogs.tsx` and `data-table-row-actions.tsx` were listed but needed no change, as explained in impl-log. The work/ files belong to the orchestrator.
- R9: met, as shown under AC2.

### Security / a11y blockers
None. No security-review.md or a11y-review.md was present at review time.

### Nits (do not block)
- `users-detail-sheet.tsx:68-82`: the user GET's own 403 and generic-error-with-Retry branches have no test. Only 404 is tested. The plan did not list these tests, but they are cheap to add.
- `users-table.test.tsx` "typed email is debounced, trimmed and sent as email=, and resets the page": the test starts on page 1, so the page-reset part of its name is not actually asserted.
- `users-table.tsx:84-87`: `ensurePageInRange` is a new function on every render, so the effect runs on every render. This is harmless because it only navigates when the page is out of range.
- Typing resets `page` right away, but the email is applied 300 ms later. On page 2 or later, this makes one extra request (offset 0, old email) before the debounced one.
- `users-status-dialog.tsx:27`: the direction (disable or enable) comes from the list-row snapshot. If the status changed elsewhere, the dialog offers the old action. This is harmless because PATCH is idempotent and the list refetches after the action.

### Follow-ups (out of scope)
- org-admin-api: a bulk status endpoint, if wanted (owner).
- org-admin-api: a `sort` parameter on `GET /users`.
- org-admin-api: declare 404/409 and the error envelope schema in OpenAPI.
- org-admin-api: confirm that request logs strip query strings (the email filter), or offer `POST /users/search`.
- org-admin-api: `org_name` on `AssignmentRead`.
- admin-pan: fully regenerate `src/api/openapi.json` together with PAN-016 (`admin:audit:read` in the registry).
- admin-pan: assign and revoke role assignments; paginate assignments beyond 100; resolve org ids to names.
