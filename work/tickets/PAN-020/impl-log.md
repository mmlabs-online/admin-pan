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
