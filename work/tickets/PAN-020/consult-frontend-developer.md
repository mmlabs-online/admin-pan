## PAN-020 consult (frontend-developer, read-only)

### Findings

**API (org-admin-api c7b86dd, app/modules/stats/):**
- GET /api/v1/stats/dashboard returns one document. Permission is `admin:stats:read` (router.py:43). The response header is `Cache-Control: no-store` (router.py:46). The counts are approximate, not one snapshot (service.py:3).
- `sign_ups.by_month` is 12 zero-filled entries. `month` is a "YYYY-MM" string in the Asia/Ho_Chi_Minh zone, and the last month is partial (repository.py:16, router.py:32-33).
- `sign_ins_24h` is a rolling 24 h window of event counts, not distinct users. Failed sign-ins include unknown emails but exclude 429 and Turnstile refusals (router.py:29-32).
- `members_per_app` lists every app, including `admin` and disabled apps. Per the endpoint description, `admin:stats:read` therefore exposes the app list without `admin:apps:read` (router.py:26-27).
- There is **no** previous-period data, no trend, no "recent activity", no daily series, no per-day sign-ins and no "suspended organizations" link filter. Available counts: `users.by_status{active,disabled}`, `users.unverified`, `organizations.by_status{active,suspended}`, `apps.by_status{active,disabled}`.

**Snapshot state in admin-pan:**
- `src/api/openapi.json:9141-9214` and `src/api/schema.d.ts:1160-1173, 1942-1964, 5164` already contain `/api/v1/stats/dashboard`, `DashboardStats`, `SignIns24h` and `SignUps`. The description text matches c7b86dd.
- README.md:54 still says the snapshot is `4c01328`. Either the snapshot was partly refreshed already, or the README is stale. Diff the snapshot against a fresh dump from c7b86dd before assuming a regeneration is needed.
- `registry.ts:60-65` still has `'/_authenticated/'` as `pending`, ticket PAN-020, reason "No stats API".

**Existing widgets and where each stands (all fed from `src/features/dashboard/data/stats.ts`):**

| Widget | File | API data? |
|---|---|---|
| KPI Users | kpi-cards.tsx, stats.ts:13-20 | `users.total` is available. `change_pct` / "vs last month" is **not** available. |
| KPI Active organizations | stats.ts:21-27 | `organizations.by_status.active` is available. No change figure. |
| KPI Registered apps | stats.ts:28-34 | `apps.total` or `apps.by_status.active`. No change figure. |
| KPI Sign-ins (24 h) | stats.ts:35-41 | `sign_ins_24h.succeeded` and `.failed`. No change figure. |
| Sign-ups chart (monthly) | charts.tsx:26-48 | `sign_ups.by_month` is available. The data key changes from `{month:'Dec', signups}` to `{month:'2026-11', count}`, so the tick label needs formatting. |
| Members per app chart | charts.tsx:84-103 | `members_per_app` is available (`member_count`, plus `name`). |
| Attention: unverified emails | attention-list.tsx, stats.ts:140-145 | `users.unverified` is available. |
| Attention: suspended orgs | stats.ts:146-151 | `organizations.by_status.suspended` is available. |
| Attention: failed sign-ins 24 h | stats.ts:152-157 | `sign_ins_24h.failed` is available. |
| Sign-ins this week (daily, Activity tab) | charts.tsx:50-82, index.tsx:106-118 | **No API data.** The API only gives a 24 h aggregate. |
| Recent admin activity | recent-activity.tsx, stats.ts:94-130 | **Not in the stats endpoint.** It would need `GET /api/v1/audit-logs?limit=5`. |

`kpi-cards.test.tsx:3,17-24` imports the `kpis` mock and tests `formatChange`. `format.ts` holds only `formatChange`. `index.tsx:23-30` imports all the mocks directly, and its subtitle says "Sample data until the API provides stats" (index.tsx:46).

### Recommendations

Each is tied to an acceptance criterion (AC1 = KPIs, charts and attention counts come from the API; AC2 = states tested) or a rule.

1. **Query layer (R2, AC1).**
   - Add `src/features/dashboard/api/queries.ts`, modelled on `src/features/audit-log/api/queries.ts:13-69`.
   - It exports a `dashboardKeys` factory with a key such as `['stats','dashboard']`, and `dashboardQueryOptions(api = getApi())`.
   - The queryFn is `unwrap(await api.GET('/api/v1/stats/dashboard', { signal }))`.
   - The type comes from `components['schemas']['DashboardStats']`. Do not hand-write a copy.
   - Replace the `Kpi`, `MonthlySignups` and `AppMembers` types in `data/stats.ts` with derived ones. Delete `data/stats.ts` and its "mock" header once nothing imports it.

2. **Cache and refresh (AC1).**
   - Set `staleTime` to about 60 s on this query. The global default is 10 s (`query-client.ts:45`), and the endpoint is not cheap.
   - Keep the default `refetchOnWindowFocus` (PROD only, `query-client.ts:44`).
   - Show "Updated <time>" from `generated_at` and add a manual Refresh button that calls `refetch()`. Use `isFetching` for a busy state.
   - Do not poll. The API says the counts are approximate.
   - Do not use `keepPreviousData`. `queryView` already checks the error before the data, so a revoked permission does not leave stale numbers on screen (`query-view.ts:11-14`).

3. **Drop the invented trends (R1).**
   - Remove `change_pct`, the `Trend` icons and `formatChange`, and their test (`kpi-cards.tsx:26,40-46`, `format.ts`, `kpi-cards.test.tsx:7-13`).
   - Show a factual sub-line in place of the trend. For example: "N active · M disabled" for users, "N active · M suspended" for organizations, "N active · M disabled" for apps, and "N succeeded · M failed" for sign-ins.
   - If the owner wants trends, that is a follow-up for org-admin-api (a previous-period field). Do not compute a trend client-side from `by_month`, because the last month is partial.
   - Label the sign-in KPI as event counts in a rolling 24 h window, not distinct users.

4. **Sign-ins "this week" daily chart (R1).**
   - Remove the Activity tab and `SignInsChart` (index.tsx:50-56,106-118, charts.tsx:50-82).
   - Either drop the tabs entirely, or replace the Activity tab with a 24 h succeeded vs failed panel (two numbers plus a share). A two-bar chart carries so little data that two numbers in the KPI card are better.
   - Recommended: drop the tabs, show one page, and mention the daily series as a follow-up for org-admin-api.
   - Note the e2e effect: `e2e/pages.e2e.ts:31-36` runs `selectTab(p,'Activity')` for the dashboard. That action must be removed or replaced.

5. **Recent activity (R1, R4).**
   - Recommended: remove the widget from this ticket. Its permission is a different one (`admin:audit:read`), so it would give the page two independent failure and 403 paths, and the ticket's acceptance criteria only cover KPIs, charts and attention counts.
   - Record it as a follow-up: a "recent activity" card using `GET /api/v1/audit-logs?limit=5` through `auditLogsQueryOptions`, rendered only when `usePermission(ACTIONS['audit.view'])` is not denied, with its own inline 403.
   - If the owner wants it now, reuse `auditLogsQueryOptions` and `ForbiddenPanel variant='inline'` (`forbidden-panel.tsx:26-33`). Use `actor_label` and `target_type`. Never render emails beyond what the API sends (R5). Show an "anonymous" fallback for a null actor.
   - Whichever way: update spec §5.7 (spec-v1.md:55-56), which still says "recent admin activity" and "API: none yet — gap".

6. **Attention list (AC1, R4).**
   - Build the items from the API: `users.unverified`, `organizations.by_status.suspended` and `sign_ins_24h.failed`. Optionally add `users.by_status.disabled`.
   - Links (`AttentionItem.to`) must only target filters that exist:
     - Suspended organizations: check the organizations list search. I could not find a status filter in its route. Otherwise link without a filter.
     - Disabled users: `/users?status=disabled` is supported (`GET /users` accepts `status`).
     - Unverified emails: `GET /users` has no verification filter (schema.d.ts:5193-5198), so link to plain `/users` and say so in the label, or render the count without a link.
     - Failed sign-ins: link to `/audit-log` with `action=auth.login_failed`. The action value is `auth.login_failed` (audit/actions.py:73). Verify that the audit `action` filter takes that value, and set `from` to the local day, because the search schema only takes days (search.ts:30-31). The 24 h window will not match a day filter exactly, so prefer a label such as "Failed sign-ins (last 24 h)" and a link to the audit log with `outcome` and `action` only.
   - Hide or disable a link when the user lacks the destination's read permission (R4). Counts are still shown, since they come from stats. Reuse `usePermission(ACTIONS[...])`.
   - Show a count of 0 as "None" with no link styling. Add `aria-label` text so a screen reader hears "38 users with unverified email" (the current link text reads in a confusing order, attention-list.tsx:14-21).

7. **Route permission (R4, AC2).**
   - `registry.ts:61-65` becomes `perm('admin:stats:read', 'GET /api/v1/stats/dashboard')`. The `registry.test.ts` drift check compares it with `x-permission` in `openapi.json:9213`, and it already exists there.
   - `RoutePermissionGuard` then shows `RouteForbiddenPanel` when the permission is known to be missing (`route-permission-guard.tsx:26-33`).
   - The Dashboard is the landing route (`/`, sidebar `sidebar-data.ts:32-34`), so a staff user without `admin:stats:read` lands on a 403. Check the post-login redirect and the nav filter (`nav-filter.test.ts:68`). Consider redirecting such a user to the first route they are allowed to see. That is a UX call; list it as an open question rather than doing it here.
   - Add `// Route permission: admin:stats:read` at the top of the feature index (as `audit-log/index.tsx:10` does). Add a `ROUTE_PERMISSIONS` entry only, not an `ACTIONS` entry (no mutations).

8. **States (R8, AC2, R10).** Use `queryView(useQuery(dashboardQueryOptions()))` once in the page and branch on four states.
   - **pending**: card skeletons, with a visually hidden `role='status'` "Loading dashboard…". Set `aria-busy` on the region.
   - **forbidden**: `ForbiddenPanel variant='page'` with `onRetry={refetch}` (as `audit-log-table.tsx:111-118`).
   - **error**: an inline `role='alert'` message with a Retry button. Show the API message and the `X-Request-ID` if `ApiError` exposes it (check `src/api/errors.ts`). Never expose tokens or emails (R5).
   - **success**: the layout.
   - Handle the user-visible failure while keeping the screen usable: the sidebar and header must still render. Keep `Header`/`Main` in `Dashboard()` and put the branches inside `Main`.
   - Guard against a short or empty `by_month` or `members_per_app` with an empty-state message in each chart card. An empty app list is possible on a fresh database.

9. **Chart accessibility (R10).**
   - The current wrappers use `role='img'` with a static `aria-label` (charts.tsx:28-31, 52-55, 86). That hides all values from screen readers and from keyboard users.
   - For each chart add a visually hidden `<table>` or a `<details>` "Show as table" next to it. Include a `<caption>` and `<th scope='col'>` headers. Use "Month | New accounts" for sign-ups and "App | Members" for members per app.
   - Alternatively, always render the table and let the chart be `aria-hidden='true'`. Pick one pattern for both charts. The table is also what the tests assert on, which is far easier than reading SVG.
   - The sign-ups caption must say: "last 12 months, Asia/Ho_Chi_Minh time zone; the current month is partial". Read the zone from `sign_ups.time_zone` rather than hard-coding it. Mark the final bar and the table row "(partial)".
   - Format months from "YYYY-MM" with a local formatter (for example `Intl.DateTimeFormat('en', { month: 'short', year: '2-digit' })` on a date built in UTC), not `new Date('2026-11')`, which can shift by zone. Put the formatter in `lib/format.ts` and unit-test it (R8 logic).
   - Bar colour is `fill-primary` with the Tailwind class; `axis.stroke='#888888'` on white is about 3.5:1, below the 4.5:1 required by R10. Use a theme token such as `currentColor` with `text-muted-foreground`.
   - Members per app: use `name` for the Y axis label only if short. Otherwise use `app_key`, and show the name in the table. The Y axis is `width={80}` (charts.tsx:90), so long keys will clip.
   - Chart is not the only place the numbers appear: the table gives the exact values, so the tooltip is not load-bearing.

10. **Members per app semantics.**
    - Include the `admin` app and disabled apps, because the API does (router.py:26-27). Mark disabled apps in the table, and optionally put `apps.by_status` as subtitle.
    - "Users with a role in each app" (index.tsx:88) should be reworded to the API's definition: "distinct active users with a non-expired role in each app".

11. **Tests (R8, AC2).**
    - Replace `kpi-cards.test.tsx` with tests on API-shaped fixtures. Put the fixture in `src/features/dashboard/api/fixtures.ts` or in `src/test-utils/`, typed as `components['schemas']['DashboardStats']`.
    - Pass an injected `api` as the audit log does (`audit-log-table.tsx:52`), or mock at the network layer as the other features do (R8 says "API mocked at the network layer" for real-API screens).
    - Cases: loading status; success, with KPI numbers, the attention counts and the chart tables; empty `members_per_app`; 403 (panel with required permission `admin:stats:read`, Retry refetches); 500 error with Retry; refetch error after success hides the stale numbers; `enabled` links hidden without destination permissions.
    - Unit tests for the month formatter and any ratio helper.
    - The `registry.test.ts` drift test will cover the permission.

12. **e2e fake route (`e2e/support/fake-api.ts`).**
    - Add `'GET /api/v1/stats/dashboard'` to the `routes` map (fake-api.ts:204-256). Type the fixture with `components['schemas']['DashboardStats']` (as the file does at lines 8-17).
    - Without it the fake answers 501 `not_faked` and records the call as unmatched, and the dashboard test would fail (`pages.e2e.ts:31-36`; `sign-out`/`sign-in` flows also land on `/`). Check `fixtures.ts` for whether `unmatched` entries fail tests.
    - Make the numbers consistent with the existing fake data, for example 3 users (2 active, 1 disabled), 3 orgs (2 active, 1 suspended), 3 apps, and `members_per_app` for admin, calechip and stoktok, so cross-screen e2e checks make sense. 12 zero-filled months.
    - `e2e/pages.e2e.ts:35`: change the `action` for the dashboard, and add an e2e check that the chart table or details toggle opens and axe passes (`expectNoSeriousA11y`). Add one fake-403 scenario only if the fixtures allow per-test route override. Otherwise leave 403 to the Vitest tests.
    - The fake must return `Cache-Control` nothing special; CORS headers are added by the harness (fake-api.ts:499-503).

13. **Snapshot refresh knock-on (ADR 0001, README.md:45-54).**
    - First diff a fresh dump from c7b86dd against `src/api/openapi.json`. If the only differences are unrelated to stats, still commit the refreshed pair (`openapi.json` and `schema.d.ts`) in this ticket, because "each real-API ticket refreshes the snapshot".
    - Update README.md:54 to `c7b86dd` and its date.
    - After `pnpm api:types`, run `pnpm typecheck`. Other features' types may change (for example `AppRead.member_count` and any renamed schemas, `MePermissions`), and `registry.test.ts` re-checks every `x-permission` and operation key against the new snapshot, so renamed or removed operations fail there.
    - CI regenerates `schema.d.ts` and fails on a diff, so both files must be committed together and generated with the pinned `openapi-typescript@7.13.0`.
    - Check that `ADMIN_PERMISSIONS` still equals the set of `x-permission` values (`registry.ts:7-21`): the `admin:stats:read` entry is already listed, and any permission new in c7b86dd would fail the equality test.
    - The dump command requires the users and RBAC flags (README.md:48-49). Check whether c7b86dd needs further flags, and whether the README command still produces the same shape.

14. **Housekeeping.** Update `work/tickets/PAN-020/ticket.md` Notes (line 26 says "no stats endpoint yet", which is now false), docs/spec-v1.md:56 and :91, and the page subtitle (index.tsx:46: remove "Sample data until the API provides stats"). Spec §5.7 and the ticket disagree only on "recent activity"; per CLAUDE.md the spec wins, so flag the descope.

### Risks
- **Descoping vs spec**: spec §5.7 promises sign-in trends, "attention items" and recent activity. The API gives a 24 h aggregate only, so the daily sign-in chart and trend deltas go away, and recent activity is a different endpoint with a different permission. The owner should confirm (Open questions 1-2).
- **Misleading numbers**: the sign-in KPI counts events, not users, and the last sign-up month is partial. Without the labels in Recs 3 and 9 the dashboard would read as "sign-ups fell". Counts are not one snapshot, so the numbers may be off by a few between cards.
- **Landing-page 403**: a staff user with `admin:users:read` but without `admin:stats:read` lands on a 403 at `/` after sign-in. This is a regression from today's mock dashboard, which every user can open.
- **Information exposure**: `admin:stats:read` reveals the app list including the `admin` app and disabled apps, without `admin:apps:read`. It is the API's decision and R4 says the UI mirrors it, so show it; just do not add links into the Apps screen that the user cannot open.
- **Snapshot drift**: the repository snapshot appears partially ahead of the README. Regeneration can touch types for other features, and CI fails on a `schema.d.ts` diff.
- **Chart a11y regression**: recharts SVG with only a static label does not meet R10. Without the table fallback the accessibility auditor will block the PR.
- **Timezone bugs**: parsing "YYYY-MM" with `new Date()` shifts the month near the zone boundary. Use a UTC-based formatter.
- **e2e flake**: `ResponsiveContainer` renders at 0 size in an unsized container in the Vitest browser tests. Give the wrapper a fixed height and assert on the table instead of SVG text.

### Open questions
1. Drop the "Sign-ins this week" daily chart and the Activity tab, and request a daily sign-in series from org-admin-api as a follow-up? (Recommended: yes.)
2. Recent admin activity: remove from PAN-020 and ticket it separately (needs `admin:audit:read`), or keep it here with its own inline 403? (Recommended: separate follow-up.)
3. Are trend percentages wanted at all? If so, org-admin-api needs a previous-period field. Replace with the factual sub-lines in the meantime? (Recommended: yes.)
4. What should a user without `admin:stats:read` see on `/`: a 403 panel, a redirect to the first permitted route, or a stripped-down welcome page?
5. "Active organizations" and "Registered apps" KPIs: show `by_status.active` or `total`? (Recommended: the headline is active, with the breakdown in the sub-line.)
6. Is the unverified-email attention item allowed to be a non-link (no list filter exists), or should an `email_verified` filter be requested for `GET /users`?
7. Does the owner want the README snapshot line, spec §5.7 and §8 gaps list (spec-v1.md:56, :91) updated as part of this ticket? (Recommended: yes.)

### Files
- /home/user/admin-pan/work/tickets/PAN-020/ticket.md
- /home/user/admin-pan/src/features/dashboard/index.tsx
- /home/user/admin-pan/src/features/dashboard/data/stats.ts
- /home/user/admin-pan/src/features/dashboard/components/kpi-cards.tsx
- /home/user/admin-pan/src/features/dashboard/components/charts.tsx
- /home/user/admin-pan/src/features/dashboard/components/attention-list.tsx
- /home/user/admin-pan/src/features/dashboard/components/recent-activity.tsx
- /home/user/admin-pan/src/features/dashboard/components/kpi-cards.test.tsx
- /home/user/admin-pan/src/features/dashboard/lib/format.ts
- /home/user/admin-pan/src/lib/permissions/registry.ts
- /home/user/admin-pan/src/lib/query-view.ts
- /home/user/admin-pan/src/components/forbidden-panel.tsx
- /home/user/admin-pan/src/components/permissions/route-permission-guard.tsx
- /home/user/admin-pan/src/features/audit-log/api/queries.ts (pattern to copy)
- /home/user/admin-pan/e2e/support/fake-api.ts
- /home/user/admin-pan/e2e/pages.e2e.ts
- /home/user/admin-pan/src/api/openapi.json, /home/user/admin-pan/src/api/schema.d.ts, /home/user/admin-pan/README.md
- /home/user/org-admin-api/app/modules/stats/{router,service,repository,schemas}.py
