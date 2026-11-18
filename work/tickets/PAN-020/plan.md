Status: READY

# Plan: PAN-020, Dashboard stats on the real API

- **API reference:** org-admin-api `c7b86dd` (read-only checkout at `/home/user/org-admin-api`, detached). ADM-015 (`GET /api/v1/stats/dashboard`, `admin:stats:read`) is DONE and merged there.
- **Code cited:** `app/modules/stats/{router,schemas,service,repository}.py`, `app/modules/users/router.py:65-73` (USR-14 revoke wording).
- **Snapshot:** `src/api/openapi.json` is **regenerated** at `c7b86dd` with the generator, then `pnpm api:types` (Approach §1).

## Spec summary
- `docs/spec-v1.md` §5.7 (line 55): "Dashboard: KPIs (users, active orgs, apps, sign-ins), sign-up and sign-in trends, members per app, items needing attention, recent admin activity."
- §5.7 (line 56): "API: none yet — **gap** (stats and reports endpoints)." This is stale: ADM-015 is done.
- §9 (line 91): "API gaps to raise in org-admin-api (no ticket there yet): admin sessions list/revoke, dashboard stats, reports, member count per app."
- **Owner answers (ticket, 2026-11-18). These override the parts of §5.7 they conflict with:**
  - `/` requires `admin:stats:read`. A user without it sees the 403 panel after sign-in: no redirect, no stripped-down page.
  - Drop the "vs last month" trend percentages, the daily "Sign-ins this week" chart/tab and the "Recent admin activity" card. Show factual sub-lines from the API instead ("N active · M disabled").
  - Record org-admin-api follow-ups for previous-period values and a daily sign-in series.
  - Update spec §5.7 to match. The implementer edits it as listed below; the owner told us to, so this is not R7 creep.
- **API semantics** come from `router.py:24-35` (the endpoint description) and the api-platform consult §2:
  - Sign-ins: event counts over a rolling 24 h window, not distinct users. Failed sign-ins include unknown emails and exclude 429 and Turnstile refusals.
  - Sign-ups: last 12 months, `month` = `"YYYY-MM"` in `sign_ups.time_zone` (`Asia/Ho_Chi_Minh`). The last month is partial. Includes CLI-created accounts.
  - `members_per_app`: every app, including `admin` and disabled apps. `member_count` counts distinct `active` users with a non-expired role.
  - Counts are approximate. Clients ignore unknown keys.

## Acceptance criteria → verification
| # | Criterion (ticket) | How the reviewer verifies it |
|---|---|---|
| 1 | KPIs, charts and attention counts come from the API | `dashboard-content.test.tsx` › "success: one GET /api/v1/stats/dashboard …", › "sign-ups table …", › "members table …", › "attention …". `view.test.ts` checks every mapping on a fixture where every number is distinct. `data/stats.ts` and `recent-activity.tsx` are deleted, and `grep -r "data/stats" src` is empty. e2e `pages.e2e.ts` › "dashboard: …" runs on the fake `GET /api/v1/stats/dashboard`. |
| 2 | States tested | `dashboard-content.test.tsx`: pending, success, zero-filled, empty charts, 403, 500 + Retry, "a refetch error after success hides the stale numbers", Refresh. `route-permission-guard.test.tsx` › "`/` without admin:stats:read renders the 403 fallback". e2e with axe. |
| 3 | Owner 2026-11-18: 403 panel on `/` without `admin:stats:read` | `registry.ts` `'/_authenticated/'` becomes `perm('admin:stats:read', 'GET /api/v1/stats/dashboard')`. `registry.test.ts` (unchanged) checks it against `x-permission`. The route-guard test above covers it. An API 403 shows `ForbiddenPanel` (test 403). |
| 4 | Owner 2026-11-18: no trend %, no daily sign-ins tab, no recent activity; factual sub-lines; spec updated | `dashboard-content.test.tsx` › "success …" asserts the absence of "vs last month", of the tab "Activity" and of "Recent admin activity", and checks the exact sub-lines. Diff of `docs/spec-v1.md` §5.7 and line 91. |

Checks (R8): `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` and `pnpm e2e` (both with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`), `pnpm build`.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/api/openapi.json` | Regenerated with the generator at `c7b86dd`. No hand edits | R2. Each real-API ticket refreshes the snapshot (ADR 0001) |
| `src/api/schema.d.ts` | `pnpm api:types` | R2. CI diffs it against the snapshot |
| `README.md` | Line 54 only: "Snapshot: org-admin-api main (`c7b86dd`) as of 2026-11-18, generated with `python -m app.cli openapi`." | Snapshot provenance |
| `docs/spec-v1.md` | Rewrite §5.7 (lines 55-56) per Approach §9. Line 91: remove "dashboard stats" and "member count per app" (ADM-015 / ADM-016 are done) | Owner answer 2026-11-18 |
| `src/lib/permissions/registry.ts` | `'/_authenticated/': perm('admin:stats:read', 'GET /api/v1/stats/dashboard')`. No `ACTIONS` entry (the page has no mutations) | R4, owner answer |
| `src/components/permissions/route-permission-guard.test.tsx` | Remove `'/_authenticated/'` from the "none or pending" loop. Add the denied test for `/` | The existing test asserts that `/` is pending and would fail |
| `src/features/dashboard/api/queries.ts` (new) | `dashboardKeys`, `dashboardStatsQueryOptions(api = getApi())`, type `DashboardStats` | R2: one query on the single client |
| `src/features/dashboard/api/queries.test.ts` (new) | Key, URL, staleTime, error | R8 logic |
| `src/features/dashboard/data/view.ts` (new) | Pure mappers `toKpis`, `toSignupRows`, `toAttentionItems` and their types | Mapping logic kept testable (R8) |
| `src/features/dashboard/data/view.test.ts` (new) | Mutation-proof mapping tests | R8 |
| `src/features/dashboard/lib/format.ts` | Replace `formatChange` with `formatMonth(month, style)` and `formatCount(n)` | Month labels, UTC-safe |
| `src/features/dashboard/lib/format.test.ts` (new) | Formatter tests | R8 |
| `src/features/dashboard/components/test-data.ts` (new) | `STATS: DashboardStats` fixture (distinct numbers), `zeroStats()`, `withStats(over)` | Test fixtures, typed from the generated schema |
| `src/features/dashboard/components/dashboard-content.tsx` (new) | Query + `queryView` branching + Refresh/Updated bar + layout (Approach §4) | AC1, AC2. Testable without the `Header` providers |
| `src/features/dashboard/components/dashboard-content.test.tsx` (new) | State and content tests | AC1, AC2 |
| `src/features/dashboard/index.tsx` | Keep `Header`/`Main` and the `<h1>`. New subtitle. Render `<DashboardContent />`. Remove `Tabs`, the mocks and `RecentActivity`. Add the comment `// Route permission: admin:stats:read` | AC1, owner answer |
| `src/features/dashboard/components/kpi-cards.tsx` | Props `items: Kpi[]` from `view.ts`. Drop the trend icon and `formatChange`. Render `value` + `detail` sub-line | Owner answer (no trend %) |
| `src/features/dashboard/components/kpi-cards.test.tsx` | Rewrite on `toKpis(STATS)`. The `formatChange` test is deleted | R8 |
| `src/features/dashboard/components/charts.tsx` | Remove `SignInsChart`. `SignupsChart` / `MembersByAppChart` take API-shaped rows, get a `<details>` table fallback and contrast-safe axes, and mark the partial month (Approach §5) | AC1, R10 |
| `src/features/dashboard/components/attention-list.tsx` | Rows are links only when `to` is set and the destination route is not denied. Accessible text (Approach §6) | AC1, R4, R10 |
| `src/features/dashboard/components/recent-activity.tsx` | **Delete** | Owner answer |
| `src/features/dashboard/data/stats.ts` | **Delete** (mock) | AC1. No mock data left |
| `e2e/support/fake-api.ts` | Add `'GET /api/v1/stats/dashboard'` with a typed fixture consistent with `USERS`/`ORGS`/`APPS` | e2e. Unmatched requests fail the test (`fixtures.ts:45`) |
| `e2e/pages.e2e.ts` | Dashboard entry: replace `selectTab(p,'Activity')` with "open the sign-ups data table and see the partial month". axe still runs | The Activity tab is removed |

No other files. In particular, leave these alone:
- `src/components/ui/*`, `src/api/client.ts` and `src/api/index.ts`, `query-view.ts`, `forbidden-panel.tsx`, the sidebar data;
- `src/features/users/data/sessions.ts` (see Follow-ups: USR-14 copy bug);
- `src/features/apps/data/data.ts` (`joinRequestStatusOptions`; see below).

**Expected snapshot drift (R7: mechanical only, no UI use).** Confirm it against the generated file and record `git diff --stat src/api/` plus a one-line summary per item in impl-log:
- USR-16: `GET /api/v1/apps/{key}/role-definitions` and `…/{role_id}`, `RoleDefinitionRead`, and `Page_RoleDefinitionRead_`. They need `admin:apps:read`, so `ADMIN_PERMISSIONS` stays unchanged.
- USR-15: the `status` query enum on `GET /api/v1/apps/{key}/join-requests` gains `cancelled`, and `POST /auth/apps/{key}/join` gets description text.
  - `JoinRequestStatus` (`apps/api/queries.ts:36`) widens automatically.
  - `joinRequestStatusOptions`' literal union is a subset and should still typecheck. Change it **only if** typecheck fails, and only the type, with no new option or label.
- Description edits: ADM-019 apps PATCH 409 text, and the USR-14 wording on the three sessions routes.
- Not in scope: other drift that breaks types. The implementer may only make mechanical fixes to typed fixtures, each recorded with its reason. Anything more → stop and record.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `queries.test.ts` › "dashboardStatsQueryOptions: key ['stats','dashboard'], staleTime 60_000; queryFn sends one GET https://api.test/api/v1/stats/dashboard with no query string and returns the body" | R2, cache |
| `queries.test.ts` › "a 403 envelope rejects with ApiError status 403 code permission_denied" | error path |
| `format.test.ts` › "formatMonth full: '2026-01' → 'Jan 2026', '2025-12' → 'Dec 2025', '2026-03' → 'Mar 2026'; tick: '2026-11' → 'Nov 26'" | UTC-safe labels |
| `format.test.ts` › "formatMonth returns the input unchanged for '2026-13', '2026-1', 'abc', ''" | robustness |
| `format.test.ts` › "formatCount: 0 → '0', 1284 → '1,284', 1234567 → '1,234,567'" | numbers |
| `view.test.ts` › "toKpis maps each field once: users total / active / disabled; orgs active / suspended / total; apps total / active / disabled; sign-ins succeeded / failed. Exact `value` and `detail` strings on a fixture with all-distinct numbers" | AC1. Swapping any field fails |
| `view.test.ts` › "toSignupRows: 12 rows in API order; only the last has partial=true and label 'Nov 2026 (partial)'; one row → that row is partial; [] → []" | partial month |
| `view.test.ts` › "toAttentionItems: unverified=users.unverified (label says it includes disabled users, no `to`); suspended=organizations.by_status.suspended (no `to`); failed=sign_ins_24h.failed with to '/audit-log' and search {action:'auth.login_failed'}" | AC1, links only to existing filters |
| `kpi-cards.test.tsx` › "renders four cards with label, formatted value and the detail sub-line; no trend icon or %" | AC1, owner |
| `dashboard-content.test.tsx` › "pending: role=status 'Loading dashboard…', the region has aria-busy=true, no KPI numbers" | AC2 |
| `dashboard-content.test.tsx` › "success: one GET /api/v1/stats/dashboard; KPI values and sub-lines; 'Updated' <time dateTime=generated_at>; no 'vs last month', no tab 'Activity', no 'Recent admin activity'" | AC1, owner |
| `dashboard-content.test.tsx` › "sign-ups: 'Show data as table' opens a table with caption naming the fixture time zone (fixture uses 'Etc/UTC', not the default), th scope=col 'Month' / 'New accounts', 12 rows, the last 'Nov 2026 (partial)'; the card text names the partial month" | AC1, R10, tz from data |
| `dashboard-content.test.tsx` › "members per app: table rows App name, key, Members for every entry including 'admin'; the caption says it includes the admin app and disabled apps" | AC1, decision 3 |
| `dashboard-content.test.tsx` › "attention: counts from the API; 'Failed sign-ins (last 24 h)' is a link to /audit-log?action=auth.login_failed when admin:audit:read is granted; with only admin:stats:read it is plain text with the count; unverified and suspended rows are never links" | R4, decision 5 |
| `dashboard-content.test.tsx` › "zero-filled document: every KPI shows '0', the attention counts show '0', the tables show 0 rows of counts (not blank)" | AC2 edge |
| `dashboard-content.test.tsx` › "empty members_per_app → 'No apps yet.'; empty by_month → 'No sign-up data.'" | AC2 edge |
| `dashboard-content.test.tsx` › "403 permission_denied: ForbiddenPanel with 'Required permission: admin:stats:read'; Try again sends a second GET; the KPIs are absent" | AC2, R4 |
| `dashboard-content.test.tsx` › "500: role=alert 'Couldn't load the dashboard.' + Retry; Retry sends a second GET and then shows the KPIs" | AC2 |
| `dashboard-content.test.tsx` › "a refetch error after success hides the stale numbers: success → Refresh → 500 → alert shown and '1,284' gone" | queryView rule |
| `dashboard-content.test.tsx` › "Refresh: sends exactly one more GET; while fetching the button is aria-disabled with 'Refreshing…' announced; a second click during the fetch sends no extra request" | refresh |
| `route-permission-guard.test.tsx` › "`/` without admin:stats:read renders the fallback 'Denied: admin:stats:read'; with admin:stats:read renders the page" | owner answer |
| `registry.test.ts` (unchanged) | the `x-permission` of `GET /api/v1/stats/dashboard` equals `admin:stats:read` |
| `e2e/pages.e2e.ts` › "dashboard: opens, does its safe action, passes axe" (updated action) | e2e + axe |

Test style: `await expect.element(...)` before using `.element()`. No SVG assertions; tables only (ResponsiveContainer can render at 0 size in the browser tests). Each new logic test must fail if its mapping is swapped or removed. The implementer runs a quick manual mutation (swap two fields in `toKpis`, drop `partial`, hard-code the time zone) and records that the tests went red.

## Approach

### 1. Snapshot regeneration (first step)
1. Run from the read-only checkout and do not modify it:
   ```
   cd /home/user/org-admin-api && DATABASE_URL=postgresql+asyncpg://x:x@localhost/x \
     UV_PROJECT_ENVIRONMENT=/tmp/claude-0/-home-user/ce8daed7-26f0-593f-9bf8-a95df9f28817/scratchpad/oaa-venv \
     /root/.local/bin/uv run python -m app.cli openapi --output /home/user/admin-pan/src/api/openapi.json
   ```
   The generator renders with `app_env="local"` (`app/cli.py:778`), so the users/RBAC routes are included.
2. Run `pnpm api:types`. Re-running it must leave no diff.
3. Check `/api/v1/stats/dashboard` and `DashboardStats` / `AppMembers` / `MonthCount` / `SignIns24h` / `SignUps` are unchanged from the current snapshot (the consults say they are).
4. Record the drift as listed under Files.

### 2. Registry (R4)
- `'/_authenticated/'` gets `perm('admin:stats:read', 'GET /api/v1/stats/dashboard')`. This change has three effects:
  - `RoutePermissionGuard` renders `RouteForbiddenPanel` on `/` when the permission is known to be denied (owner answer). There is no redirect, and the guard never navigates (`route-permission-guard.tsx:70`).
  - The sidebar's Dashboard link (`sidebar-data.ts` uses `ROUTE_PERMISSIONS['/_authenticated/']`) is hidden when the permission is denied. `nav-filter.test.ts` stays green because it compares by reference.
  - When the state is `unknown` (the `/me/permissions` call failed), the page renders and any API 403 goes through `queryView` → `ForbiddenPanel`.
- `admin:*` already satisfies the check through the permission source (PAN-011).

### 3. Query (`api/queries.ts`)
```ts
export type DashboardStats = components['schemas']['DashboardStats']
export const dashboardKeys = { all: ['stats'] as const, dashboard: () => [...dashboardKeys.all, 'dashboard'] as const }
export const DASHBOARD_STALE_TIME = 60_000
export function dashboardStatsQueryOptions(api: ApiClient = getApi()) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps  (injected client, as audit-log)
  return queryOptions({ queryKey: dashboardKeys.dashboard(), staleTime: DASHBOARD_STALE_TIME,
    queryFn: async ({ signal }) => unwrap(await api.GET('/api/v1/stats/dashboard', { signal })) })
}
```
- Leave `refetchOnWindowFocus` at the global default (PROD only), and leave retry at the global `shouldRetryQuery`, which does not retry 4xx.
- No `refetchInterval` and no `keepPreviousData`.
- No invalidation from other features' mutations: the numbers are approximate and staleTime is short.

### 4. Page (`dashboard-content.tsx`; `index.tsx` keeps the shell)
- **`index.tsx`:**
  - `Header` (unchanged) and `Main`, containing the `<h1>Dashboard</h1>`.
  - Subtitle: "The mmlabs ecosystem at a glance. Counts are approximate."
  - Then `<DashboardContent />`.
  - The sidebar, header and title stay usable in every state.
- **`DashboardContent({ api = getApi() })`:**
  - `const q = useQuery(dashboardStatsQueryOptions(api)); const view = queryView(q)`.
  - **Toolbar:**
    - On success: "Updated `<time dateTime={generated_at}>{format(new Date(generated_at), 'MMM d, HH:mm')}</time>`" (date-fns, browser-local).
    - A `Button variant='outline' size='sm'` labelled "Refresh" (`RefreshCw` icon, aria-hidden).
      - While `q.isFetching`: `aria-disabled`, label "Refreshing…", and the click is ignored.
      - Otherwise: `void q.refetch()`.
    - An sr-only `<p role='status' aria-live='polite'>` holds "Loading dashboard…", "Refreshing…" or "".
  - **Region:** `<section aria-label='Dashboard statistics' aria-busy={view.status==='pending' || q.isFetching}>`.
  - **pending:** four `Skeleton` cards and two skeleton chart cards, all `aria-hidden`.
  - **forbidden:** `<ForbiddenPanel variant='page' copy={view.copy} onRetry={() => void q.refetch()} />`.
  - **error:** `<div role='alert'>` with "Couldn't load the dashboard." and a `Retry` button that calls refetch.
    - No server message is shown, matching `audit-log-table.tsx:182`.
    - The global toast already fires for transient errors (`query-client.ts:53`).
  - **success:**
    - `KpiCards items={toKpis(data)}`.
    - A muted note under it, the API caveats as one sentence: "Sign-ins are events in the last 24 h, not people. Failed sign-ins include unknown emails and exclude requests refused by rate limiting or Turnstile."
    - Grid row 1: the "New sign-ups" card (`lg:col-span-4`) and the "Needs attention" card (`lg:col-span-3`).
    - Grid row 2: the "Members per app" card (full width, `lg:col-span-7`).

### 5. View mappers (`data/view.ts`) and charts
- **`toKpis(s)` returns `Kpi[]`** (`{ key, label, value: number, detail: string }`). No arithmetic; every number is a field the API sends:
  | key | label | value | detail |
  |---|---|---|---|
  | users | "Users" | `users.total` | `"{by_status.active} active · {by_status.disabled} disabled"` |
  | organizations | "Active organizations" | `organizations.by_status.active` | `"{by_status.suspended} suspended · {total} total"` |
  | apps | "Registered apps" | `apps.total` | `"{by_status.active} active · {by_status.disabled} disabled"` |
  | sign_ins_24h | "Sign-ins (24 h)" | `sign_ins_24h.succeeded` | `"{failed} failed"` |
  Numbers go through `formatCount` (`toLocaleString('en-US')`).
- **`toSignupRows(s)`** returns `{ month, label: formatMonth(month,'full') + (partial ? ' (partial)' : ''), tick: formatMonth(month,'tick'), count, partial }[]`.
  - API order is kept; there is no re-sorting or re-bucketing.
  - `partial = index === length - 1` (the API documents that the last month is the current one).
- **`toAttentionItems(s)`** returns `{ id, label, count, to?, search? }[]`:
  - `unverified`: "Users with unverified email (includes disabled users)", `users.unverified`, no link (`GET /users` has no verification filter).
  - `suspended`: "Suspended organizations", `organizations.by_status.suspended`, no link (`organizationsSearchSchema` has no status filter, and neither does the API).
  - `failed-sign-ins`: "Failed sign-ins (last 24 h)", `sign_ins_24h.failed`, `to: '/audit-log'`, `search: { action: 'auth.login_failed' }`. `auditLogSearchSchema.action` accepts that value (`audit-log/data/schema.ts:52`).
- **`formatMonth(month, style)`:**
  - Parse `/^(\d{4})-(0[1-9]|1[0-2])$/`; anything else → return the input.
  - Build `new Date(Date.UTC(y, m - 1, 1))`.
  - Format with `Intl.DateTimeFormat('en-US', { month: 'short', year: style === 'full' ? 'numeric' : '2-digit', timeZone: 'UTC' })`.
  - Never `new Date('2026-11')`.
- **`SignupsChart({ rows, timeZone })`:**
  - Card description: "mmlabs accounts created per month, last 12 months ({timeZone}). Includes CLI-created accounts. {last.label without suffix} is partial (month so far)." The partial-month text is omitted when there are no rows.
  - The chart wrapper has `role='img'` and `aria-label='Bar chart of new accounts per month; the data is in the table below'`.
  - Bars: `XAxis dataKey='tick'`, `Bar dataKey='count'`, and `<Cell>` per row. The partial row gets `fillOpacity={0.45}`. The text label is what conveys "partial", so the opacity is not colour-only information.
  - Below the chart: `<details><summary>Show data as table</summary><table>`, using the `components/ui/table` primitives.
    - `<caption>`: "New accounts per month ({timeZone}); the last month is partial".
    - `<th scope='col'>` "Month" / "New accounts". Rows show `label` and `formatCount(count)`.
  - Empty rows: the text "No sign-up data." and no chart.
- **`MembersByAppChart({ items })`:**
  - Card description: "Distinct active users with a non-expired role in each app (app scope or any organization). Includes the admin app and disabled apps."
  - Y axis uses `app_key`, `width={96}`.
  - Table columns: "App" (`name`), "Key" (`app_key`, mono), "Members". The caption is the same sentence as the description.
  - Entries are in API order (by key).
  - Empty: "No apps yet."
- **Axis contrast (R10):**
  - Remove `stroke: '#888888'`.
  - Use `axis = { stroke: 'currentColor', tick: { fill: 'currentColor' }, fontSize: 12, tickLine: false, axisLine: false }`, with the chart wrapper `className='text-muted-foreground'`.
  - Tooltip: the recharts default is OK, because the table carries the values.

### 6. Attention list
- `AttentionList({ items })` decides per row: `const audit = usePermission(ROUTE_PERMISSIONS['/_authenticated/audit-log/'])`.
  - The mapping from `to` to a requirement is a small `Record<'/audit-log', Requirement>`.
  - A row is a `Link` only when `item.to` is set and the state is not `'denied'`.
- **Link row:**
  - `<Link to={item.to} search={item.search} className=…focus-visible…>`.
  - Contents: `<span>{label}</span>`, then `<span className='font-semibold'>{formatCount(count)}</span>`, then `<span className='sr-only'>, open in the audit log</span>`, then the chevron (aria-hidden).
  - The visible text is part of the accessible name (WCAG 2.5.3).
- **Plain row:** the same layout in a `<div>` with no chevron.
- A count of 0 still shows "0".

### 7. e2e
- **`fake-api.ts`:** `type DashboardStats = components['schemas']['DashboardStats']`. Constant `STATS`:
  - `generated_at: '2026-11-18T03:00:00Z'`.
  - `users`: `{ total: 3, by_status: { active: 2, disabled: 1 }, unverified: 0 }`. This matches `USERS`, where all are verified.
  - `organizations`: `{ total: 3, by_status: { active: 2, suspended: 1 } }`.
  - `apps`: `{ total: 3, by_status: { active: 3, disabled: 0 } }`.
  - `sign_ins_24h`: `{ window_start: '2026-11-17T03:00:00Z', window_end: '2026-11-18T03:00:00Z', succeeded: 4, failed: 1 }`.
  - `sign_ups`: `{ time_zone: 'Asia/Ho_Chi_Minh', by_month }`, with 12 fixed months `'2025-12'…'2026-11'`, hard-coded (no `Date`).
  - `members_per_app`: `APPS.map(a => ({ app_key: a.key, name: a.name, member_count: a.member_count }))`.
  - Route: `'GET /api/v1/stats/dashboard': () => json(200, STATS)`.
- **`pages.e2e.ts`:** the dashboard entry's `action` becomes:
  1. Click `getByText('Show data as table').first()`.
  2. Expect `getByRole('cell', { name: 'Nov 2026 (partial)' })` to be visible.
  
  Then axe runs as today. Sign-in/out tests that land on `/` now hit the fake route instead of a 501.

### 8. Removing the mock
- Delete `data/stats.ts` and `components/recent-activity.tsx`. Remove `formatChange`.
- `kpi-cards.tsx` imports `Kpi` from `../data/view`.
- No `Tabs` on the page anymore.

### 9. Spec text (`docs/spec-v1.md`)
- **§5.7, replacing lines 55-56:**
  > Dashboard: KPIs (users, active orgs, registered apps, sign-ins in the last 24 h) with factual breakdowns from the API (e.g. "N active · M disabled"), new accounts per month (last 12 months), members per app, and items needing attention (unverified emails, suspended organizations, failed sign-ins in the last 24 h). The dashboard (`/`) requires `admin:stats:read`; without it staff see the 403 page (owner, 2026-11-18). Not in v1 (owner, 2026-11-18, PAN-020): change vs a previous period, a daily sign-in series, recent admin activity — follow-ups for org-admin-api / a later ticket. Reports: define, run and export operational reports (see Q7).
  > API: `GET /api/v1/stats/dashboard` (`admin:stats:read`) — **org-admin-api ADM-015** (done). Reports: **gap** (ADM-017 proposed).
- **Line 91:** remove "dashboard stats" and "member count per app".

### Rules
- **R1:** all data comes from one API document. No client-side totals, percentages or derived series, and no faked fields. Removed widgets are recorded as follow-ups.
- **R2:** generated types only, and HTTP goes through `getApi()` via the feature query module. The snapshot comes from the generator.
- **R3/R5:** untouched. No new `VITE_*` variables. No emails anywhere on the page.
- **R4:** the route permission is in the registry; the 403 panel shows on `/` when the permission is denied; API 403s are handled in the page. The attention link is hidden when `admin:audit:read` is denied.
- **R6:** React text only.
- **R7:** the snapshot drift is mechanical, as listed. The sessions copy and the join-request UI are untouched (Follow-ups).
- **R8:** see the test list.
- **R9:** no mutations.
- **R10:**
  - a table fallback with caption and `scope=col` for each chart;
  - partial month in text;
  - axis colour from the theme token;
  - an announced status for loading and refresh;
  - visible-text-in-name links;
  - axe in e2e.
- **R11:** staff-only counts.

## Specialist input used
- **api-platform-engineer:**
  - Adopted:
    - single query + generated types (rec 1-2);
    - field mapping (rec 3);
    - drop `change_pct`, the daily chart and recent activity (rec 4, now the owner's answer);
    - no client computation (rec 5);
    - route permission and 403 (rec 6);
    - staleTime 60 s, no polling, `generated_at` shown (rec 7);
    - no retry on 4xx (rec 8, already global);
    - caveat copy (rec 11);
    - spec update (rec 12).
  - Rejected:
    - Request id in the error state (rec 9): `ApiError` has no request-id field (`src/api/errors.ts:36-53`), and adding one is client work outside this ticket. Generic error copy as on other screens.
    - `refetchOnWindowFocus: false` (rec 7): the frontend recommendation to keep the global default (PROD only) is used; the 60 s staleTime bounds the cost.
  - Retained without change: the "fallback landing route" (rec 6) is superseded by the owner's 403-panel answer.
- **frontend-developer:**
  - Adopted:
    - query module pattern (rec 1);
    - refresh/`generated_at` (rec 2);
    - factual sub-lines (rec 3);
    - drop the tabs entirely (rec 4);
    - remove recent activity (rec 5);
    - attention links only to existing filters with permission gating (rec 6);
    - registry route entry, no `ACTIONS` (rec 7);
    - `queryView` four states with Header/Main kept (rec 8);
    - table fallback, UTC month formatter, partial marker, time zone from data, axis contrast (rec 9);
    - members semantics wording, include admin/disabled (rec 10);
    - tests on API-shaped fixtures, asserting tables not SVG (rec 11);
    - e2e fake route consistent with existing fakes (rec 12);
    - snapshot refresh + README (rec 13).
  - Changed:
    - "Disabled users" attention row: not added. The users KPI sub-line already shows it (rule 1, no extras).
    - Request id: rejected, same reason as above.
    - Table pattern: `<details>` per chart, so the visible layout is unchanged and the table is reachable by keyboard and screen readers.

## Assumptions
- At `c7b86dd` the stats schemas equal the current snapshot (both consults). Only the drift listed under Files appears.
- `components['schemas']['DashboardStats']` and friends are emitted under these names (they are in `schema.d.ts:935-2092` today).
- `text-muted-foreground` on `bg-card` meets 4.5:1 in light and dark themes (shadcn defaults). The implementer checks it with axe in e2e (light theme) and records the values for dark.
- UI labels are in English, as on every screen (spec §8 Q3 open).
- `admin:stats:read` is granted to no role today (ADM-015). In practice only `admin:*` holders see the dashboard; everyone else gets the 403 panel on `/`. The owner accepted this.

## Needs owner's decision (non-blocking; the safer option is planned)
1. **Apps KPI:** planned headline `apps.total`, labelled "Registered apps", with the "N active · M disabled" sub-line. The alternative is `by_status.active`.
2. **Organizations KPI:** planned headline `by_status.active` ("Active organizations", per spec), with "M suspended · T total".
3. **Members per app:** planned to show every entry the API returns, including `admin` and disabled apps, with a caption saying so. The API gives no per-entry status, so disabled apps cannot be marked. A per-entry `status` would need an org-admin-api follow-up.
4. **Unverified emails:** labelled "(includes disabled users)", because the API counts them. The alternative is an active-only figure from the API (follow-up).
5. **Attention links:** only "Failed sign-ins" links (to `/audit-log?action=auth.login_failed`), and only when `admin:audit:read` is not denied.
   - Unverified and suspended rows are plain text: no list filter exists for them.
   - The audit link shows all failed sign-ins, not just the last 24 h, because the audit filter is day-based.
6. **Role seeding:** grant `admin:stats:read` to a staff role? This is an ops action in org-admin-api by a super-admin, not code.

## Blocking questions
None.

## Split proposal
None. One spec feature (§5.7 dashboard part), no API change. Roughly 350 lines of production code and 450 of tests, mostly deletion and rewrite of the mock widgets plus the regenerated snapshot (generated, not counted).

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/` (Dashboard) | `admin:stats:read` (route guard: `RouteForbiddenPanel` when denied; API 403 → `ForbiddenPanel` page variant + Try again) | Skeletons + "Loading dashboard…" (aria-busy) / per-chart "No sign-up data." and "No apps yet."; zero-filled shows 0 / alert "Couldn't load the dashboard." + Retry; a refetch error hides stale numbers / 403 panel naming `admin:stats:read` / KPIs + sub-lines, caveat note, sign-ups chart + table (partial month, time zone), attention list, members chart + table, "Updated …" + Refresh | Refresh → refetch (GET only). Attention "Failed sign-ins" → `/audit-log?action=auth.login_failed` (only when `admin:audit:read` is not denied) | — (read-only) |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/stats/dashboard` | none | `DashboardStats` (`UserStats`, `OrganizationStats`, `AppStats`, `SignIns24h`, `SignUps` / `MonthCount`, `AppMembers[]`) | 401 (client's auth path; can now also follow a staff session revoke, USR-14), 403 `permission_denied` → ForbiddenPanel, 5xx/network → alert + Retry (global toast) | ADM-015 (DONE, `c7b86dd`) |

## Follow-ups (out of scope, R7)
- **Bug (record with `/bug`, S2): sessions revoke copy is now partly wrong after org-admin-api USR-14.**
  - The copy is in `src/features/users/data/sessions.ts:5,8,11`: "Revoking stops new access tokens only; tokens already issued stay valid for up to 12 hours", and "…apps already open there (including this admin app) can keep working…".
  - The API at `c7b86dd` (`app/modules/users/router.py:65-73`) now says revoke "ends the user's admin (`aud=admin`) tokens bound to those sessions on their next admin request". Tokens of other apps still last up to 12 h.
  - The fix updates the copy and its tests (`sessions.test.ts:43-49`, `user-sessions-tab.test.tsx:228,378`). Not changed in PAN-020.
- **org-admin-api:**
  - previous-period values for the KPIs (trend %);
  - a daily sign-in series (succeeded/failed per day);
  - an active-only unverified count, or an `email_verified` filter on `GET /users`;
  - a `status` field per `members_per_app` entry;
  - a `status` filter on `GET /organizations`;
  - document `Cache-Control: no-store` in the stats OpenAPI response;
  - seed `admin:stats:read` into a staff role (ops).
- **admin-pan:**
  - recent admin activity card using `GET /api/v1/audit-logs?limit=5` with its own `audit.view` gating, if the owner wants it back;
  - suspended-orgs and unverified-users attention links once list filters exist;
  - join-request UI for the new `cancelled` status (USR-15): filter option and label, since `joinRequestStatusLabel` shows "Unknown" for it today;
  - role-definitions screen (USR-16);
  - README "Refreshing API types" command block (lines 47-50) still shows the old inline command; replace it with `python -m app.cli openapi --output …`;
  - expose `X-Request-ID` on `ApiError` for error states.
