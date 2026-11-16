## Attempt 1 — 2026-11-16

### Files touched
| File | Required because |
|---|---|
| `src/api/openapi.json`, `src/api/schema.d.ts` | Snapshot refresh (ADR 0001): hand-patched fallback, see "Snapshot" below. +6 / +14 lines |
| `src/features/users/api/queries.ts` (+ `queries.test.tsx`) | Keys, `toUsersListParams`, list/detail/role-assignment query options, `useSetUserStatusMutation` |
| `src/features/users/data/schema.ts` (+ `schema.test.ts`) | Generated `User`/`UserStatus`/`RoleAssignment` types; `usersSearchSchema` without `email` |
| `src/features/users/data/errors.ts` (+ `errors.test.ts`) | `statusChangeError` mapping |
| `src/features/users/data/users.ts` | Deleted (mock data) |
| `src/routes/_authenticated/users/index.tsx` | Uses `usersSearchSchema`; no `email` key |
| `src/features/users/index.tsx` | `UsersTable` takes no `data` |
| `src/features/users/components/users-provider.tsx` | Server state removed; injectable `api` |
| `src/features/users/components/users-table.tsx` | Server-side table, debounced email in component state, `queryView` states |
| `src/features/users/components/users-columns.tsx` | Select column, `filterFn`/`sortingFn` removed; email sticky offset `inset-s-0` |
| `src/features/users/components/data-table-bulk-actions.tsx` | Deleted (owner: no bulk) |
| `src/features/users/components/users-status-dialog.tsx` | Real PATCH, pending/inline errors, close only on success |
| `src/features/users/components/users-detail-sheet.tsx` | Fetched user with row placeholder; real read-only "Apps & roles" |
| `src/features/users/components/users-table.test.tsx` (rewritten), `users-status-dialog.test.tsx`, `users-detail-sheet.test.tsx` | Screen tests on a fake `fetch` |
| `src/hooks/use-debounced-value.ts` (+ `.test.tsx`) | Debounced email filter |
| `src/test-utils/api.ts` | `fakeApi`, `json`, `apiError`, `testQueryClient` |
| `docs/adr/0005-server-side-tables.md` | ADR |

`users-dialogs.tsx` and `data-table-row-actions.tsx` needed no change (the sheet already received `open === 'view'`; `User` is imported from `../data/schema`, which still exports it).

### Snapshot
- Primary path ran: `uv run --frozen python -m app.cli openapi --output …` from `/home/user/org-admin-api` (HEAD d9e496f, `UV_PROJECT_ENVIRONMENT` in a temp dir; nothing written into that checkout).
- The full regeneration drifted far outside users (`git diff --stat`: openapi.json +2860/-405, schema.d.ts +1049/-584). It adds `/api/v1/audit-logs` with `admin:audit:read`, which the registry does not list yet (PAN-016 adds it per ADR 0004), so `registry.test.ts` went red ("ADMIN_PERMISSIONS equals the set of x-permission values"). Per the plan (keep only if green; no code change for it, R7) I discarded the full regeneration and used the plan's fallback: hand-added `"409": {"description": "Last active super-admin"}` between 403 and 422 for `PATCH /api/v1/users/{user_id}` and `DELETE …/role-assignments/{assignment_id}`, then `pnpm api:types`. Final `git diff --stat src/api`: openapi.json +6, schema.d.ts +14.
- The role-assignments GET and `AssignmentRead` were already in the old snapshot.

### Tests added / changed
- `users/api/queries.test.tsx`: keys normalisation; `toUsersListParams` (page/size/cap, email trim/omit, status single-only); list URL params; detail GET + 404; role-assignments `limit=100&offset=0`; list 403; mutation PATCH body + invalidates `['users']`.
- `users/data/schema.test.ts`: `usersSearchSchema` drops `email`.
- `users/data/errors.test.ts`: 403 codes, 409, 404, other, non-ApiError.
- `hooks/use-debounced-value.test.tsx`.
- `users-table.test.tsx` (14): loading, rows, empty, empty filtered, error + Retry, 403 panel, 403 on refetch replaces rows, next page offset, debounced/trimmed email, email never in URL, status single/both, no sort buttons, no checkboxes/bulk, no write permission.
- `users-status-dialog.test.tsx` (9): confirm copy, pending (buttons disabled, Escape ignored, badge unchanged until response), success + refetch, 403 self/wildcard, 409, 404 + refetch, cancel sends no PATCH, no stale error on reopen, enable sends `active`.
- `users-detail-sheet.test.tsx` (9): placeholder then fetched, 404, assignments loading/rows/empty/error/403/"Showing 100 of 130", no Preview.
- Removed with their subjects: mock data test, bulk test, email-in-URL test, preview test.

### Checks (actual output summary)
- pnpm typecheck: pass (`tsc -b`, no errors)
- pnpm lint: pass (`eslint .`, no output)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test: Test Files 64 passed (64); Tests 425 passed (425) (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`)
- pnpm build: pass (`built in 895ms`)
- `pnpm api:types` after the final snapshot leaves `src/api/schema.d.ts` unchanged vs. the committed-to-be copy (CI diff step passes)
- `msw` not in `package.json`; no `PREVIEW_APP_ROLES`; `users-table.tsx` has no paginated/filtered/sorted/faceted row models.
- Not run: pnpm e2e (none planned). `pnpm knip` was not run as a gate (it reports pre-existing unused types elsewhere).

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- org-admin-api: bulk status endpoint, if wanted (owner).
- org-admin-api: a `sort` parameter on `GET /users`.
- org-admin-api: declare `404`/`409` and the error envelope in OpenAPI.
- org-admin-api: confirm request logs strip query strings (email filter), or offer `POST /users/search`.
- org-admin-api: `org_name` on `AssignmentRead`.
- admin-pan: regenerate `src/api/openapi.json` from the API main (hand-patched here) together with PAN-016, which adds `admin:audit:read` to the registry and un-breaks `registry.test.ts` against the full snapshot.
- admin-pan: assign/revoke role assignments (`roles.assign`, `roles.revoke`); paginate assignments beyond 100; resolve org ids to names.
- admin-pan: `__screenshots__` under `src/features/users/components/` and `src/lib/permissions/` are git-ignored failure artifacts from test runs.

### Scope self-check
- Could the diff be smaller? No. Size is dominated by tests and the deleted mock/bulk files.
- Diff size: see `git diff --shortstat` (not committed, per orchestrator instructions).
