# Review: PAN-020

## Attempt 1 — 2026-11-18
Verdict: REWORK

Note: the attempt was resumed after an interruption. Everything below was checked against the committed tree (HEAD `4a40f30`, working tree clean), not against impl-log claims.

### Checks (run by reviewer)
- pnpm typecheck: pass (exit 0)
- pnpm lint: pass (exit 0)
- pnpm format:check: pass ("All matched files use Prettier code style!")
- pnpm test (full, `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): 97 files, 740 tests passed. This matches impl-log.
- `pnpm test src/features/dashboard` x5: 22/22 passed on every run.
- pnpm build: pass (built in 1.07s)
- pnpm e2e: 28 passed. This includes "dashboard … passes axe" on the fake `GET /api/v1/stats/dashboard`.
- pnpm audit --prod --audit-level high: "No known vulnerabilities found"
- **Snapshot:** regenerated from `/home/user/org-admin-api` at `c7b86dd` (its checkout is still clean) into the scratchpad with `python -m app.cli openapi`.
  - The result is byte-identical to `src/api/openapi.json` (`cmp` SAME).
  - `openapi-typescript` output into the scratchpad is byte-identical to `src/api/schema.d.ts`.
  - The drift is the planned USR-16 role-definitions paths and schemas, plus the USR-15 `cancelled` status and description edits.
- **Reviewer mutation 1:** I changed the `toKpis` organizations value to `by_status.suspended` (`view.ts:41`).
  - Red: `view.test` › toKpis, `kpi-cards.test`, and `dashboard-content.test` › success (3 failed).
  - Restored exactly: `git diff --quiet` was clean afterwards.
- **Reviewer mutation 2:** I removed the in-flight guard at `dashboard-content.tsx:48` (`if (!q.isFetching)`).
  - All 12 tests stayed green, which leads to Issue 1.
  - Restored exactly: `git diff --quiet` was clean afterwards.
- **PAN-017 session copy:** untouched. `git diff origin/main...HEAD -- src/features/users` is empty.

### Acceptance criteria
- [x] **KPIs, charts and attention counts come from the API.**
  - `data/stats.ts` and `recent-activity.tsx` are deleted, and `grep data/stats src/features/dashboard` is empty.
  - The single query is `api/queries.ts` (`GET /api/v1/stats/dashboard` via `getApi()`).
  - Field mapping matches org-admin-api `app/modules/stats/schemas.py` and `router.py:44-80`:
    - `view.ts:35` `users.total`, `:41` `organizations.by_status.active`, `:47` `apps.total`, `:53` `sign_ins_24h.succeeded`.
    - Detail lines use the `by_status` and `failed` fields.
    - Attention rows: `:79` `users.unverified` (the API sums it over all statuses, so the "(includes disabled users)" label is correct), `:84` `by_status.suspended`, `:89` `sign_ins_24h.failed`.
    - Charts use `sign_ups.by_month` and `members_per_app` in API order.
  - Tests: `view.test.ts`, and `dashboard-content.test.tsx` › success / sign-ups / members / attention. The e2e dashboard entry also covers it.
- [ ] **States tested.** Pending, success, zero-filled, empty, 403, 500 + Retry, stale-after-error and route-guard denied are all tested and green. **However,** the Refresh test's "a second click sends no extra request" does not verify its claim. See Issue 1.
- [x] **Owner (2026-11-18): `/` requires `admin:stats:read` and shows the 403 panel.**
  - `registry.ts:61`.
  - `route-permission-guard.test.tsx` › "`/` without admin:stats:read renders the fallback…".
  - API 403 → `ForbiddenPanel`: `dashboard-content.test.tsx` › 403.
- [x] **Owner (2026-11-18): no trend %, no Activity tab, no recent activity; factual sub-lines; spec updated.**
  - `dashboard-content.test.tsx` › success asserts the absences.
  - `kpi-cards.test.tsx` checks there is no `%`.
  - `docs/spec-v1.md` §5.7 and the §9 line are rewritten as planned.

### Issues
#### Issue 1 — 🔴 blocker — test does not verify its claim (R8, plan "each new logic test must fail if … removed")
- **Where:** `src/features/dashboard/components/dashboard-content.test.tsx:281-282`. The logic under test is at `src/features/dashboard/components/dashboard-content.tsx:48`.
- **Expected:** the test "Refresh: … a second click sends no extra request" fails when the `if (!q.isFetching)` guard is removed.
- **Actual:** `expect(seen).toHaveLength(2)` runs synchronously right after the DOM `click()`, before the queryFn could record a request.
  - With the guard removed, all 12 tests still pass (reviewer mutation 2).
  - With a 300 ms settle added after the click, the unguarded code fails with "expected [Request, Request, Request] to have a length of 2 but got 3", and the guarded code passes. So the guard works, but the test cannot see a regression.
- **Fix instruction:**
  1. In that test, after `;(busy.element() as HTMLElement).click()`, let pending work settle before asserting. For example: `await new Promise((r) => setTimeout(r, 200))`, then `expect(seen).toHaveLength(2)`.
  2. Re-run the mutation: remove `if (!q.isFetching)` at `dashboard-content.tsx:48` and confirm this test goes red. Restore the guard and confirm green.
  3. Record both results in impl-log.
  4. No production code change is needed.

### Rules R1–R11
- **R1:** no violations.
  - Every number shown is an API field. `view.ts` only formats (`formatCount`, `formatMonth`).
  - `partial = i === rows.length - 1` (`view.ts:63`) is a display marker that the API documents ("the last month is partial"), not a computed value.
  - No totals, percentages or series are derived.
- **R2:** no violations. Generated types only (`components['schemas']['DashboardStats']`), HTTP through `getApi()`, and the snapshot comes from the generator.
- **R4:** no violations.
  - The route permission is in the registry.
  - The audit-log link is hidden when `admin:audit:read` is denied (`attention-list.tsx:19`).
  - API 403s are handled.
- **R6:** no violations. There are no HTML sinks in `src/features/dashboard`.
- **R7:** no violations.
  - `src/features/audit-log/data/{schema,data}.ts` (schema.ts:34,51; data.ts:46,63) are out of plan but justified in impl-log.
  - They are forced by the regenerated `AuditAction` enum: `Record<AuditAction, Tone>` at `data.ts:25`, and the `Same<AuditAction, …>` assertion at `schema.ts:79`.
  - `work/backlog.md` and `ticket.md` are workflow state.
- **R10:** no violations.
  - Each chart has a table fallback with a caption and `scope=col` headers.
  - The partial month is stated in text.
  - The live status region exists.
  - axe is green in e2e.
  - Contrast of the theme `--muted-foreground` on `--card`: light is about slate-500 on white (about 4.8:1). Dark is `oklch(0.704…)` on `oklch(0.14…)`, well above 4.5:1.
- **R3, R5, R9, R11:** not affected. No emails on the page and no mutations.

### Security / a11y blockers
None provided to the reviewer for this attempt.

### Nits (do not block)
- During the initial load the Refresh button reads "Refreshing…" (`dashboard-content.tsx:52`, because `isFetching` is true while pending), while the status region says "Loading dashboard…". Consider "Refresh" plus aria-disabled while `view.status === 'pending'`.
- Plan Assumptions asked impl-log to record dark-theme contrast values. It did not. I checked them myself (see R10).
- impl-log's `git diff --stat src/api/` line has "+355/-?" placeholders instead of the real numbers.

### Follow-ups (out of scope)
- Same as the plan and impl-log:
  - the BUG (S2) for the sessions revoke copy in `src/features/users/data/sessions.ts` after USR-14;
  - org-admin-api: previous-period values, a daily sign-in series, an active-only unverified count / `email_verified` filter, per-app `status` in `members_per_app`, an org `status` filter, documenting `Cache-Control: no-store`, and seeding `admin:stats:read`;
  - admin-pan: the recent-activity card, attention links for suspended/unverified, the join-request UI for `cancelled`, a role-definitions screen, the README refresh-types block, and `X-Request-ID` on `ApiError`.

## Attempt 2 — 2026-11-18
Verdict: PASS

Checked against HEAD `6834c32` (the attempt-2 commit). The working tree was clean before and after every run (`git diff --quiet` was clean, and `git status --short` was empty apart from git-ignored `__screenshots__`).

### Checks (run by reviewer, `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`)
- pnpm typecheck: pass (exit 0)
- pnpm lint: pass (exit 0)
- pnpm format:check: pass ("All matched files use Prettier code style!")
- `pnpm test src/features/dashboard` x3: 5 files, 22/22 passed on each run.
- pnpm test (full) x5: 97 files, 740/740 passed on every run, all with exit 0.
  - **Flake:** I did not reproduce impl-log's single unidentified failure in 5 full runs, so it stays unidentified.
  - The dashboard tests passed 8 times in a row with no failure (3 targeted runs plus 5 full runs).
  - The attempt-2 diff only touches `src/features/dashboard`.
  - I judge it unrelated to this diff. No evidence ties it to PAN-020.
- pnpm build: pass (built in 1.16s)
- pnpm e2e: 28 passed. This includes the dashboard axe entry on the fake stats API, now with the h2 headings and the dashed partial bar.

### Blocker from Attempt 1 (Issue 1): fixed
- **The fix:** `src/features/dashboard/components/dashboard-content.test.tsx:283` adds a 200 ms settle after the DOM click, before `expect(seen).toHaveLength(2)` at `:284`.
- **Reviewer mutation:** I changed `if (!q.isFetching) void q.refetch()` to `void q.refetch()` (`dashboard-content.tsx:47`).
  - The test **fails**: "Refresh: … a second click sends no extra request", with "AssertionError: expected [ Request{}, Request{}, Request{} ] to have a length of 2 but got 3" at `dashboard-content.test.tsx:284:17`.
  - Result of that run: 1 failed / 21 passed.
  - Restored with `git checkout -- <file>`. `git diff --quiet` was clean afterwards, and the guarded code then passed 22/22 x3.
  - This matches the mutation impl-log records.

### a11y-review Attempt 1 fixes
- **🟡 2 (heading semantics): fixed.** The three section titles are now real headings:
  - `dashboard-content.tsx:98-103` "New sign-ups", `:121-126` "Needs attention", `:138-143` "Members per app".
  - Each is an `<h2 data-slot='card-title' className='leading-none font-semibold'>`, the same classes and slot as `CardTitle` (`src/components/ui/card.tsx:33-34`), so there is no visual change and `components/ui` is not edited.
  - The order is h1 "Dashboard" (`index.tsx:22`), then h2 sections, with KPI labels unchanged as planned.
- **🟡 1 (partial bar, 1.4.11): fixed.**
  - `charts.tsx:63-70`: the partial `Cell` now has `fillOpacity` 0.6 plus `stroke='currentColor' strokeDasharray='4'`.
  - `currentColor` comes from the wrapper's `text-muted-foreground` (`charts.tsx:49`): about 4.8:1 on white, and far higher in dark. That is a non-colour, ≥3:1 cue.
  - The partial month is still stated in text as well.
- **💭 3 (link name whitespace): fixed.**
  - `attention-list.tsx:25` adds `{' '}` between the label and count spans. It is visually inert in the `flex justify-between` row (`:8-9`).
  - Pinned by the updated expectation `dashboard-content.test.tsx:198`: "Failed sign-ins (last 24 h) 0, open in the audit log".

### Acceptance criteria
- Every criterion from Attempt 1 still holds. The "states tested" criterion is now met because its Refresh claim is verified by the mutation above.
- No acceptance-relevant production logic changed in attempt 2. It touches markup and presentation only.

### Scope / rules
- **Scope:** attempt 2 touches exactly the 4 source files named in the review and a11y findings, plus workflow state (`work/backlog.md`, `ticket.md`, `impl-log.md`). There are no out-of-plan changes.
- **R1–R11:** nothing new. There are no HTML sinks, no new data paths and no permission changes.
- **Security review:** Attempt 1 had no 🔴. Its 🟡 (the session copy in `src/features/users`) is a follow-up and is untouched by this diff, which is correct under R7.

### Nits (do not block)
- No unit test asserts the new heading semantics, for example `getByRole('heading', { level: 2, name: 'New sign-ups' })` in `dashboard-content.test.tsx`. The e2e axe run covers structure only indirectly.
- The 200 ms fixed wait at `dashboard-content.test.tsx:283` is time-based. It is reliable here (8/8 green, and the mutation shows red), but `expect.poll` over a short window or `vi.waitFor` with a negative check would be less arbitrary.
- The Attempt 1 nits are still open and optional: the "Refreshing…" label during the initial load, and the a11y 💭 4–7.

### Follow-ups (out of scope)
- Unchanged from Attempt 1. Also carry over the a11y follow-ups (axe on the loading/403 states and a dark-theme run, and a shared heading-capable `CardTitle`) and the security follow-ups (session revocation copy bug, the `cancelled` join-request option, the `generated_at` validity guard).
