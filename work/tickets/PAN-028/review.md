# Review — PAN-028

## Attempt 1 — 2026-11-17
Verdict: REWORK

### Checks (run by reviewer)
- pnpm typecheck: pass (`tsc -b`, exit 0)
- pnpm lint: pass (`eslint .`, exit 0)
- pnpm format:check: "All matched files use Prettier code style!" (exit 0). Working tree clean; every file in `git diff origin/main...HEAD --stat` is in the plan's file table or is a `work/` ticket/backlog file, so formatting touched nothing outside the plan.
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): 91 files, 676 tests passed (matches impl-log)
- `pnpm test src/features/apps` x5: 12 files / 126 tests passed on all 5 runs (no flakiness seen)
- pnpm build: built in 1.08s, exit 0
- pnpm e2e: 27 passed, including `apps join requests: …` (e2e/pages.e2e.ts:279)

### Acceptance criteria
- [ ] Join requests per app listed from the API, paginated, with the filters the API supports. Listing, status filter and pager are covered: app-join-requests-tab.test.tsx:37, :135, :175; e2e pages.e2e.ts:279; filters match org-admin-api b79cf77 `router.py` (`status` + `PageDep` only). FAILED on the page clamp, see Issues 1 and 2.
- [x] Approve and reject with a confirmation naming the requester; non-optimistic; list refreshed after success. Evidence: app-join-request-decision-dialog.test.tsx:67, :82, :103, :126 (row stays until the held refetch is released), :185 (invalidations; never `me/permissions`); queries.ts `useDecideJoinRequestMutation` has no `onMutate`/`setQueryData`; e2e pages.e2e.ts:279.
- [x] API errors shown inline (403, 404, 409). Evidence: dialog test :205 (403 ForbiddenPanel), :216 (404), :247 (table-driven 409 incl. unknown reason, no server text), :277 (email_unverified does not reach the auth gate), :298 (network); errors.test.ts `joinRequestDecisionError`.
- [x] Loading, empty, error and 403 states tested with the fake fetch. Evidence: app-join-requests-tab.test.tsx:53.

### Issues
#### Issue 1 — 🔴 blocker — correctness (deviation: setState during render)
- **Where**: src/features/apps/components/app-join-requests-tab.tsx:80-86
- **Expected**: The page clamp steps back to an existing page and always terminates.
- **Actual**: `setOffset(...)` is called during render whenever `q.isSuccess && offset !== 0 && !items.length`. React does not bail out on render-phase updates with an unchanged value (react-dom 19.2.5 `dispatchSetStateInternal` → `enqueueRenderPhaseUpdate`, no eager compare). If the computed target equals the current `offset`, the component re-renders forever and React throws "Too many re-renders", which crashes the sheet. This happens when a page comes back empty while `total > offset`. org-admin-api b79cf77 can return that: `repository.py:64-76` runs `count()` and the page `select` as two statements (READ COMMITTED), so a decision committed between them gives e.g. `{items: [], total: 21}` at offset 20 → target 20 === offset. I reproduced the loop in isolation with the same guard and formula (React 19.2.5, scratch script): total 20 → settles at 0; total 21 → throws "Too many re-renders". The effect version in the plan would not loop, because an effect `setState` with an equal value bails out. So the deviation is not "behaviour is the same" as impl-log states.
- **Fix instruction**: Compute `const target = q.data.total > 0 ? Math.floor((q.data.total - 1) / JOIN_REQUESTS_PAGE_SIZE) * JOIN_REQUESTS_PAGE_SIZE : 0` and call `setOffset(target)` only when `target !== offset` (keep the render-phase form, which lint accepts). When `target === offset`, show the normal empty row and do nothing else (no loop). Add the test from Issue 2(b).

#### Issue 2 — 🔴 blocker — tests (plan-listed test does not test the clamp)
- **Where**: src/features/apps/components/app-join-requests-tab.test.tsx:196-223
- **Expected** (plan, Tests table): "on offset 20 with total 21, deciding the only row → the refetch returns `items: [], total: 20` → the tab requests `offset=0` and shows rows (no empty page 2)".
- **Actual**: Page 2 is never empty in this test. With `total = 21` the server returns 3 rows at offset 20. The test then sets `total = 20` and clicks **Previous** by hand, so `offset=0` comes from the button and not from the clamp. Lines 80-86 never run in any test. The impl-log claim "is tested" is not supported.
- **Fix instruction**: Replace it with (a) a real clamp test: page 1 (offset 0) has 20 rows and total 21; Next → offset 20 returns one row; then make the server return `{items: [], total: 20}` for offset 20 and trigger a refetch without the pager, e.g. approve that row through the dialog (POST → `json(row)`) or `queryClient.invalidateQueries({queryKey: appsKeys.joinRequestsAll('stoktok')})`. Assert the offsets requested are `['0','20','20','0']` and rows are shown, with no "Showing 21–" text. (b) A no-loop test: offset 20 returns `{items: [], total: 21}`. The tab must not throw and must show "No pending join requests.", with no further `offset` request beyond the first refetch.

### Rules R1–R11
No violations found.
- R1/R11: only the three USR-03g endpoints; no end-user join call.
- R2: calls go through the injected `ApiClient`; types are `components['schemas']['JoinRequestRead']` and the generated query enum. queries.ts carries the same `exhaustive-deps` disable as the existing option builders (the key holds all `params` fields).
- R3: no auth changes; dialog test :277 pins that 409 `email_unverified` stays out of the gate.
- R4: registry.ts `apps.viewJoinRequests` (`admin:users:read`), `apps.decideJoinRequest` (`admin:roles:assign`); these match `x-permission` and `registry.test.ts` passes. Tab gated in app-detail-sheet.tsx:90-94,104-110; 403 handled inline.
- R5: query keys hold only key/status/paging (queries.test.tsx); toasts name nobody; tab test :262 and e2e assert no `@` in URLs.
- R6: text nodes only; XSS-text test :122.
- R7: no out-of-plan files.
- R9: both decisions confirmed, naming requester and app; non-optimistic; inline errors; invalidation.
- R10: labelled Select, `scope='col'`, `role=status/alert`, focus by ref; axe passes in e2e.

### Deviations judged
- `joinRequestDecisionError(error)` takes a single argument: accepted. None of the copy depends on the decision, and an unused parameter would fail lint.
- Page clamp done as setState during render: the form is acceptable (React's documented "adjust state while rendering" pattern), but as written it is unsafe. See Issue 1.
- `renderApps({ userId })`: accepted. The file is in the plan and the option is needed for "(you)" / "(by you)".

### Security / a11y blockers
None. No security-review.md or a11y-review.md was present at review time.

### Nits (do not block)
- errors.ts:51 `firstReason` is now exported but only used inside errors.ts (`joinRequestRefusal` lives in the same file). The export can be dropped.
- app-join-requests-tab.tsx:259 `colSpan={4}` is correct today (both column sets have 4 columns). A comment, or deriving it from the header, would keep it correct if a column is added.

### Follow-ups (out of scope)
- org-admin-api: the list's `count()` and page `select` are separate statements, so `total` and `items` can disagree under concurrent decisions. A consistent snapshot (one statement with a window count, or REPEATABLE READ) would remove the race. Also the follow-ups already in plan.md (`granted`/`role_key` on approve, a `decided_by` label, cooldown, pending count, reject reason).
- admin-pan: PAN-020 regenerates the OpenAPI snapshot (ADM-015).

## Attempt 2 — 2026-11-17
Verdict: REWORK

### Checks (run by reviewer)
- pnpm typecheck: pass (exit 0)
- pnpm lint: pass (exit 0)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): 91 files, 680 tests passed (matches impl-log)
- `pnpm test src/features/apps` x5: 12 files / 130 tests passed on all 5 runs. The `app-status-dialog.test.tsx` timeout reported in impl-log did not recur. Neither that test nor `app-status-dialog.tsx` is in `git diff origin/main...HEAD`, and PAN-027's review already marked it flaky. Judged unrelated to this diff.
- pnpm build: built in 1.29s
- pnpm e2e: 27 passed
- Working tree clean.

### Acceptance criteria
- [ ] Join requests per app listed from the API, paginated, with the filters the API supports. Listing, filter, pager, a11y pager and announcement are covered (tab test :37, :135, :175, :269, :297; e2e pages.e2e.ts:279). FAILED: the clamp's step-back branch still has no test (Issue 1).
- [x] Approve/reject with confirmation naming the requester; non-optimistic; refresh after success. Same evidence as attempt 1. The dialog now uses `requesterLabel` (app-join-request-decision-dialog.tsx:52-58), and the blank-name test is at tab test :246.
- [x] API errors shown inline (403, 404, 409). Same as attempt 1. Unmapped statuses now get fixed copy (errors.ts:298-302; errors.test.ts:315-317).
- [x] Loading, empty, error and 403 states. Tab test :53.

### Previous blockers
- Attempt-1 Issue 1 (render loop): FIXED. app-join-requests-tab.tsx:81-88 computes `target` and calls `setOffset` only when `target !== offset`. Tab test :225-244 ("empty page with total 21 at offset 20") gets `{items: [], total: 21}` at offset 20, shows "No pending join requests.", and makes no request beyond the second one (`n === 2`, stable after 300 ms). This is real coverage of the no-loop path.
- Attempt-1 Issue 2(a) (real clamp test): NOT FIXED. See Issue 1.

### Issues
#### Issue 1 — 🔴 blocker — tests (clamp step-back branch still never runs)
- **Where**: src/features/apps/components/app-join-requests-tab.test.tsx:196-223
- **Expected** (plan Tests table, and attempt-1 fix instruction 2(a)): page 2 comes back **empty** from a refetch that the pager did not trigger, and the clamp at app-join-requests-tab.tsx:87 (`setOffset(target)` with `target !== offset`) moves the tab to offset 0. The offsets requested are `['0','20','20','0']`.
- **Actual**: Only the test title changed ("an empty page 2 with total 20 makes the tab request offset 0"). The body is the same as attempt 1. With `total = 21`, offset 20 returns 3 rows (`offset >= total` is false), so page 2 is never empty. The test then sets `total = 20` and clicks **Previous** by hand (:217). Offset 0 comes from the button. The asserted offsets `['0','20','0']` show that no empty offset-20 response was ever fetched, so the `setOffset(target)` call at :87 never runs in any test. If you delete line 87, every test still passes. The impl-log line "empty page 2 with total 20 -> tab requests offset 0" is not true for this test.
- **Fix instruction**: Rewrite this test as follows, without using the pager after Next. Create `const queryClient = testQueryClient()` and pass it with `renderApps(client, { queryClient })`. Click Next and wait for `Showing 21–21 of 21`. Set `total = 20`, so offset 20 now returns `[]`. Then call `await queryClient.invalidateQueries({ queryKey: appsKeys.joinRequestsAll('stoktok') })` (import `appsKeys` from `../api/queries`). Instead of invalidating, you can also approve the visible row through the dialog with POST → `json(row)`. Assert that `Ada Lovelace` is visible, that offsets are `['0','20','20','0']`, and that `getByText(/Showing 21–/)` is not in the document. Do not click Previous. Keep the no-loop test at :225 as it is.

### Rules R1–R11
No violations found. R5: `requesterLabel` (data.ts:51-55) is used only for DOM text, `title` and `aria-label`. R6: text nodes only. R7: all changed files are in the plan or are `work/` files. R9/R10: pager uses `aria-disabled` and ignores the click (app-join-requests-tab.tsx:288-311). The polite `sr-only` status (:160-164) stays mounted outside the swapped region.

### Security / a11y findings (attempt 1, all 🟡) — status
- Security 1 (blank `display_name`): fixed. data.ts:51-55, tab :99, :199-203, dialog :52. Tested at tab test :246.
- Security 2 (server text in fallback): fixed. errors.ts:298-302. Tested at errors.test.ts:315.
- a11y 1 (pager focus loss): fixed. Tested at tab test :269. Note from impl-log: the pager unmounts while the next page loads, so focus is still lost on page change. Recorded as a follow-up.
- a11y 3 (filter change not announced): fixed. Tested at tab test :297.
- a11y 2 (Radix focus race): conditional; e2e focus assertion still green, not changed. Accepted.

### Nits (do not block)
- errors.ts `firstReason` export and `colSpan={4}` from attempt 1 are still open. Both are optional.
- The pager test clicks via `element().click()` because Playwright refuses aria-disabled targets. That is fine. A short comment would explain it.

### Follow-ups (out of scope)
- admin-pan: keep the previous page while the next one loads (`placeholderData: keepPreviousData`), so the pager does not unmount and focus survives page changes (impl-log observation).
- Attempt 1 follow-ups still apply (org-admin-api count/page snapshot; PAN-020 OpenAPI regen).
