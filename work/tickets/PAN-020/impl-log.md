## Attempt 1 — 2026-11-18

Note: this attempt was resumed after an interruption (a previous implementer run hit a usage limit). The partial working tree was reviewed against the plan and kept; the remaining steps were finished here.

### Snapshot verification
- Regenerated with `python -m app.cli openapi` from org-admin-api at `c7b86dd` (HEAD confirmed) into the scratchpad: byte-identical to `src/api/openapi.json` (`cmp` SAME).
- `pnpm api:types` re-run: `schema.d.ts` unchanged (stable).
- `git diff --stat src/api/`: openapi.json +355/-?, schema.d.ts +220/-?; 562 insertions, 13 deletions in total. Stats schemas (`DashboardStats` etc.) unchanged. Drift is the planned USR-16 role-definitions routes, USR-15 `cancelled` join-request status and description edits (ADM-019, USR-14).

### Snapshot drift edits (mechanical, required by typecheck)
- `src/features/audit-log/data/schema.ts`: added audit actions `app.join_request_cancelled`, `join_request_retention.purged` (the generated action enum gained them).
- `src/features/audit-log/data/data.ts`: tones for those two actions (`neutral`, `warning`).
- `joinRequestStatusOptions` needed no change. PAN-017 session revoke copy untouched.

### Files touched
| File | Required because |
|---|---|
| `src/api/openapi.json`, `src/api/schema.d.ts` | regenerated snapshot (R2) |
| `README.md` | snapshot line (`c7b86dd`, 2026-11-18) |
| `docs/spec-v1.md` | §5.7 rewrite and §9 line (owner answers) |
| `src/lib/permissions/registry.ts` | `/` requires `admin:stats:read` |
| `src/components/permissions/route-permission-guard.test.tsx` | `/` denied test, removed from the pending loop |
| `src/features/dashboard/api/queries.ts`, `queries.test.ts` (new) | single query on the API client |
| `src/features/dashboard/data/view.ts`, `view.test.ts` (new) | pure mappers |
| `src/features/dashboard/lib/format.ts`, `format.test.ts` | `formatMonth`/`formatCount` replace `formatChange` |
| `src/features/dashboard/components/dashboard-content.tsx`, `.test.tsx`, `test-data.ts` (new) | states, layout, fixtures |
| `src/features/dashboard/index.tsx` | shell only, tabs and mocks removed |
| `.../kpi-cards.tsx`, `kpi-cards.test.tsx`, `charts.tsx`, `attention-list.tsx` | API-shaped props, table fallback, no trends |
| `.../recent-activity.tsx`, `data/stats.ts` | deleted (owner answer, no mock) |
| `src/features/audit-log/data/{schema,data}.ts` | snapshot drift (above) |
| `e2e/support/fake-api.ts` | `GET /api/v1/stats/dashboard` fake with typed `STATS` |
| `e2e/pages.e2e.ts` | dashboard action: open sign-ups table, see "Nov 2026 (partial)" |

### Tests added / changed
- queries.test.ts, view.test.ts, format.test.ts, kpi-cards.test.tsx, dashboard-content.test.tsx (12 tests: pending, success, sign-ups table, members table, attention, zero-filled, empty, 403, 500 + Retry, refetch error hides stale numbers, Refresh), route-permission-guard.test.tsx, e2e dashboard entry (axe).
- Fixed in this attempt: the Refresh double-click test used `userEvent.click`, which Playwright refuses on an aria-disabled button; it now dispatches a DOM click after `await expect.element(...)`.

### Mutation runs (all restored afterwards)
- Swap `users.total` for `users.unverified` in `toKpis`: red (view.test, kpi-cards, dashboard-content x6).
- `partial = false` in `toSignupRows`: red (view.test x2, dashboard-content sign-ups).
- Hard-code the time zone passed to the chart: red (caption "Etc/UTC" not found); unmutated: green.

### Checks (actual output summary)
- pnpm typecheck: pass
- pnpm lint: pass
- pnpm format:check: pass
- pnpm test: 97 files, 740 tests passed; `pnpm test src/features/dashboard` run 3 times: 22/22 each
- pnpm build: pass
- pnpm e2e: 28 passed
- pnpm audit --prod --audit-level high: no known vulnerabilities found
- `grep -r "data/stats" src`: empty

### Out-of-plan files
None beyond the audit-log drift edits above (required to typecheck against the regenerated snapshot).

### Follow-ups (noticed, not done)
- Bug S2: sessions revoke copy in `src/features/users/data/sessions.ts` is partly stale after USR-14 (plan Follow-ups).
- org-admin-api: previous-period KPI values; daily sign-in series; active-only unverified count or `email_verified` filter; per-app `status` in `members_per_app`; `status` filter on `GET /organizations`; document `Cache-Control: no-store` on stats; seed `admin:stats:read` into a staff role.
- admin-pan: recent-activity card, attention links for suspended/unverified, join-request UI for `cancelled`, role-definitions screen, README refresh-types block, `X-Request-ID` on `ApiError`.

### Scope self-check
- Could the diff be smaller? No.
- Diff size (excluding src/api): +272 / -436 plus new files.

## Attempt 2 (REWORK)

### Changes
- `dashboard-content.test.tsx`: Refresh double-click test waits 200 ms after the second click before `expect(seen).toHaveLength(2)`. The zero-filled attention expectation now has the space ("… (last 24 h) 0, open in the audit log") from item 4.
- `dashboard-content.tsx`: the three section titles are real `<h2 data-slot='card-title' className='leading-none font-semibold'>` (the repo's `CardTitle` has no `asChild`; `components/ui` is not edited). `CardTitle` import removed. KPI labels untouched.
- `charts.tsx`: partial-month `Cell` has `fillOpacity` 0.6 plus `stroke='currentColor' strokeDasharray='4'` (non-colour cue).
- `attention-list.tsx`: `{' '}` between label and count spans.

### Mutation run (review Issue 1)
- Removed the guard (`if (!q.isFetching) void q.refetch()` -> `void q.refetch()`): FAIL, "expected [ Request{}, Request{}, Request{} ] to have a length of 2 but got 3".
- Restored exactly: PASS (22/22, three runs).

### Contrast values (a11y 1 / reviewer nit)
- Dark: muted-foreground oklch(0.704 0.04 256.8) on card oklch(0.14 0.04 259.2) = about 7.6:1; primary bar vs card about 16.2:1; partial bar at 0.6 about 10.1:1.
- Light: muted-foreground on white about 4.77:1. Partial bar at 0.6 blended on white is only about 2.3:1 on its own, so the contrast and the cue rely on the dashed `currentColor` stroke (muted-foreground, 4.77:1). Computed, not measured in a browser.

### Diff stat
- Attempt 2 only (git diff, working tree): 4 files, +30 / -7 (attempt-1 work is already in HEAD; its figure stays in Attempt 1: +272 / -436 excluding src/api, plus new files).

### Checks
- typecheck, lint, format:check: pass
- `pnpm test src/features/dashboard` x3: 22/22 each
- `pnpm test` full: 740/740 passed on two runs; one earlier full run showed 1 failed / 739 passed (failing test not captured; the immediate reruns were green) - possible flake, not identified
- pnpm build: pass
- pnpm e2e: 28 passed

### Follow-ups
- Unchanged. PAN-017 session copy and join-request status options deliberately not touched.
