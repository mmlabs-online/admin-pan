## Attempt 1 — 2026-11-17

### OpenAPI snapshot
Not regenerated (plan Approach §0). The orchestrator already diffed org-admin-api b79cf77 against `src/api/openapi.json` (c41ef57): the join-request paths and schemas are identical; only ADM-015 stats differ. I did not re-run the regeneration. `src/api/openapi.json` and `schema.d.ts` are untouched.

### Files touched
| File | Required because |
|---|---|
| `src/lib/permissions/registry.ts` | `apps.viewJoinRequests` (admin:users:read), `apps.decideJoinRequest` (admin:roles:assign); `ADMIN_PERMISSIONS` untouched |
| `src/features/apps/api/queries.ts` | page size, `JoinRequestStatus`/params, `appsKeys.joinRequests*`, `appJoinRequestsQueryOptions`, `useDecideJoinRequestMutation` |
| `src/features/apps/data/app-schema.ts` | `JoinRequest` generated type |
| `src/features/apps/data/data.ts` | `joinRequestStatusOptions`, `joinRequestStatusLabel` |
| `src/features/apps/data/errors.ts` | `joinRequestDecisionError`, `joinRequestRefusal`; `firstReason` exported |
| `src/features/apps/components/app-join-requests-tab.tsx` (new) | tab body |
| `src/features/apps/components/app-join-request-decision-dialog.tsx` (new) | approve/reject confirm |
| `src/features/apps/components/app-detail-sheet.tsx` | 4th tab, hidden for `admin` and without admin:users:read; description |
| `src/features/apps/components/test-data.ts` | `JOIN_REQUESTS`, `joinRequestsPage`, `SELF_USER_ID` |
| `src/features/apps/components/test-fixtures.tsx` | answers `GET …/join-requests`; `renderApps` takes `userId` (self id) |
| `src/features/apps/components/app-join-requests-tab.test.tsx` (new) | list tests |
| `src/features/apps/components/app-join-request-decision-dialog.test.tsx` (new) | dialog/mutation tests |
| `src/features/apps/components/app-detail-sheet.test.tsx` | tab count tests (4 / 3 / hidden when denied) |
| `src/features/apps/data/errors.test.ts` | `joinRequestDecisionError` cases |
| `src/features/apps/api/queries.test.tsx` | key-shape test |
| `e2e/support/fake-api.ts` | stateful join-request routes |
| `e2e/pages.e2e.ts` | `apps join requests: …` test |

### Tests added / changed
- app-join-requests-tab.test.tsx: lazy fetch URL; loading/empty per filter/error+Retry/403; rows, badges, (you); XSS text; status filter + Decided/(by you); pager; page clamp; read-only note; policy/disabled notes; no email in URLs or query keys.
- app-join-request-decision-dialog.test.tsx: approve and reject copy; Cancel/Escape focus return; one POST, no body, double click, non-optimistic, toast, heading focus (both decisions); pending state; invalidations (never me/permissions); 403; 404; table-driven 409 incl. unknown reason; email_unverified not an auth-gate event; network failure; focus after 409 drop.
- errors.test.ts, queries.test.tsx, app-detail-sheet.test.tsx as above.
- e2e: `apps join requests: …`.

### Checks (actual output summary)
- pnpm typecheck: pass (tsc -b, no output)
- pnpm lint: pass (eslint ., no output)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): 91 files, 676 tests passed
- `pnpm test src/features/apps` x3: 12 files / 126 tests passed on each of the 3 runs
- pnpm build: built
- pnpm e2e: 27 passed

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- org-admin-api: `granted`/`role_key` on the approve response; a label for `decided_by`; expose the reject cooldown; pending count / cross-app inbox; optional reject reason.
- admin-pan: PAN-020 regenerates the snapshot (ADM-015 stats).

### Deviations from the plan (small)
- `joinRequestDecisionError(error)` takes one argument, not `(error, decision)`: the copy does not depend on the decision, and an unused parameter fails lint.
- Page clamp is done by setting state during render (guarded), not in an effect, because `react-hooks/set-state-in-effect` fails lint on the effect version. Behaviour is the same and is tested.
- `renderApps` got a `userId` option (test-fixtures is in the plan) to exercise "(you)" / "(by you)".

### Scope self-check
- Could the diff be smaller? No: each file is listed in the plan.
- Diff size: not measured (the directory is not a git repository here); roughly 900 lines including tests.
