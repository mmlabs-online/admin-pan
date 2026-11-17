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

## Attempt 2 (REWORK)

### Fixed
- Review blocker 1: the render-time page clamp now calls `setOffset` only when the target differs from the current offset (no "Too many re-renders" for `{items: [], total: 21}` at offset 20).
- Review blocker 2: the clamp test is replaced by two: empty page 2 with total 20 -> tab requests offset 0 (offsets `0,20,0`); empty page with total 21 at offset 20 -> no crash, empty row shown, no extra request.
- Security 1: `requesterLabel(r)` (`display_name?.trim() || email`) in `data/data.ts`, used by the tab (row text, title, button aria-labels) and the dialog; the email sub-line shows only for a non-blank name. Test: blank display_name falls back to the email, one occurrence, Approve label uses the email.
- Security 2: `joinRequestDecisionError` shows fixed copy for every unmapped status (403 still returns the forbidden alert); `errors.test.ts` 422 case updated.
- a11y 1: pager Previous/Next use `aria-disabled` (with disabled styling) and ignore clicks; test checks no `disabled` attribute, focusable, and a click sends no request. Note: Playwright `userEvent.click` refuses aria-disabled elements, so the test clicks the DOM element.
- a11y 3: an always-mounted `sr-only` `role=status aria-live=polite` paragraph outside the swapped region announces "N <status> join request(s) found." once loaded; test covers pending -> approved filter change.
- a11y 2 (conditional): not changed; the focus-to-heading unit/e2e tests were not flaky in any run.

### Observation (not changed)
- The pager unmounts while a new page loads (the query has no keepPreviousData, by design in queries.ts), so focus on Next is lost on page change regardless of aria-disabled. Follow-up if wanted.

### Checks
- pnpm typecheck, pnpm lint, pnpm format:check: clean
- pnpm test: 91 files, 680 tests passed
- `pnpm test src/features/apps` x5: 4 runs fully green (130/130); 1 run had one failure in the unrelated `app-status-dialog.test.tsx` "disable" test (15 s timeout, passed in the other 4 runs and in the full run).
- pnpm build: built
- pnpm e2e (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): 27 passed
- Not committed (per instruction).

## Attempt 3 — 2026-11-17 (REWORK, fixes review Attempt 2 Issue 1)

### Fixed
- Rewrote the clamp step-back test (`app-join-requests-tab.test.tsx`, "page clamp: a refetch that returns an empty page 2 steps the tab back to offset 0"). It renders with `testQueryClient()`, clicks Next (offset 20, "Showing 21–21 of 21"), sets the fake total to 20, calls `queryClient.invalidateQueries({ queryKey: appsKeys.joinRequestsAll('stoktok') })` (no Previous click), then asserts "Ada Lovelace" is visible, requested offsets are `['0','20','20','0']`, and no "Showing 21–" text. Product code unchanged.

### Mutation proof
- With `if (target !== offset) setOffset(target)` (tab.tsx:87) temporarily replaced by a comment: the test FAILED, `AssertionError: expected [ '0', '20', '20' ] to deeply equal [ '0', '20', '20', '0' ]` (1 failed | 13 passed).
- Line restored (verified identical to backup): `pnpm test src/features/apps/components/app-join-requests-tab.test.tsx` 14 passed.

### Checks
- pnpm typecheck, lint, format:check: clean
- pnpm build: built
- pnpm test (full): 91 files / 680 tests passed on the final run. Two earlier full runs each had one different unrelated failure (organizations-status-dialog, app-form-dialog; dialog tests, not in this diff), both green on rerun.
- `pnpm test src/features/apps` x3: 12 files / 130 tests passed each time.
- pnpm e2e (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): 27 passed
- Not committed. Pager-focus a11y item remains a follow-up.
