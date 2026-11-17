# PAN-023 consult (frontend-developer): Playwright e2e smoke + axe

Read-only. Nothing was run. node_modules is not installed in this checkout, so I could not read the auth-client library source. The library's endpoint shapes come from `src/test-utils/auth.tsx`, which follows the library's own contract tests.

## Findings

### 1. How a build can sign in with no real API

- **Sign-in and token calls.** `getAuthClient()` is built from `VITE_API_BASE_URL` and `VITE_APP_KEY` (`src/api/auth-client.ts:44-63`). Calls to `/api/v1/auth/*` go through `authTimeoutFetch` to `globalThis.fetch`. The access token stays inside the library (R3), and `mm_account_id` is the only value it persists.
- **Bearer calls.** Admin calls reach the same origin through `bearerFetch` (`src/api/client.ts:46-48`). There is no hook in the app to fake a session, and the owner forbade a mock sign-in (ADR 0003 line 19). So the network is the only seam.
- **A production build needs an https API origin.** `parseApiBaseUrl` rejects `http:` unless `dev` is true and the host is localhost (`src/api/config.ts:34-40`). `allowInsecureLocalhost` is also `import.meta.env.DEV` only (`src/api/auth-client.ts:52`). A `vite preview` build served on `http://localhost` therefore cannot point at a localhost API. It needs a fake https origin such as `https://api.e2e.test`.
- **Why `page.route` works.** Chromium never resolves that host, because Playwright answers every request to it. `client.ts:55` requires request origin to equal `baseUrl`, and `apiOrigins: [baseUrl]` lets the library send Bearer tokens there. So a single `context.route('https://api.e2e.test/**', …)` covers the library, the typed client and the permission query. This mirrors the existing unit pattern in `src/test-utils/auth.tsx:72-143`, which uses a route table keyed `"METHOD /path"` and a stateful `accounts` list.
- **Routes the fake must answer.**
  - `GET /api/v1/auth/accounts`: `{items:[{account_id,email,email_verified,display_name}]}`, or 401 `session_invalid` when signed out (`test-utils/auth.tsx:78-81`).
  - `POST /api/v1/auth/login`: `{account_id, user}`, and flips state to signed-in.
  - `POST /api/v1/auth/token`: `{access_token, token_type:'Bearer', expires_in:900, audience:'admin'}`.
  - `POST /api/v1/auth/logout`: 204.
  - `GET /api/v1/me/permissions`: `{user_id, permissions:['admin:*']}`, validated by `parseMePermissions` (`src/lib/permissions/me-permissions.ts:30-40`). `permits()` accepts `admin:*`, so every control is visible.
  - Data routes: `GET /api/v1/users` and `GET /api/v1/audit-logs` as `Page` `{items,total,limit,offset}`; `GET /api/v1/users/{id}` and `…/role-assignments` if the detail sheet is opened; `PATCH /api/v1/users/{id}` only if a mutation is tested.
- **CORS.** The page origin (`http://localhost:<port>`) differs from the fake origin. Calls use `credentials: 'include'` for the library and `mode: 'cors'`. Custom headers (`Authorization`, `X-MM-App`) trigger preflight. The fake should answer `OPTIONS` and add `Access-Control-Allow-Origin: <request origin>`, `Access-Control-Allow-Credentials: true` and `Access-Control-Allow-Headers` to every fulfilled response. Playwright can intercept preflights in Chromium, but this should be verified in the first spike.
- **`mm_device` cookie.** It is HttpOnly and set by the real API. The fake does not need to emulate it, because the stateful `accounts` list stands in for the session.
- **Production bundle stays clean.** The build can use `vite build --mode e2e --outDir dist-e2e` with `VITE_API_BASE_URL=https://api.e2e.test`, `VITE_APP_KEY=admin` and no Turnstile key, then `vite preview --outDir dist-e2e`. The only difference from the release build is the public https origin string. All faking lives in `e2e/` and is never imported by `src/`.
- **nginx headers.** `vite preview` has no CSP, so `scripts/smoke-image.sh` stays the nginx and CSP check. Running e2e inside the nginx image would exercise the real CSP, but needs Docker in the e2e job. I would not do it in v1.

#### Alternatives

| Option | Verdict |
|---|---|
| `vite dev` (DEV bundle, http localhost allowed) plus a tiny node stub API on `:8000` via the dev proxy (`vite.config.ts:28-35`) | Works, but the bundle is not production-like, includes devtools, and needs a second process. Lower fidelity. Fallback only. |
| MSW | Rejected by the owner (ADR 0005 line 6). |
| Real org-admin-api in CI | Not "against mocks" (the AC), and flaky. |
| `?e2e` or env hook in the app, or a test-only login | Violates the PAN-010 owner decision and the "nothing test-only in the bundle" constraint. |
| `page.addInitScript` overriding `fetch` | Redundant with `route`; it also hides the real transport. |

### 2. Main pages today (source: `src/routes/`, `src/features/`)

| Page | Data | Evidence |
|---|---|---|
| `/sign-in` | real auth API (faked in e2e) | `user-auth-form.tsx:75-95` |
| `/users` | real API | `users-table.tsx:64`; `features/users/api/queries.ts` |
| `/audit-log` | real API | `audit-log-table.tsx:76-79` |
| `/organizations` | still mock. `api/queries.ts` exists but only `queries.test.ts` uses it; the provider defaults to mock data (`organizations-provider.tsx:4,48`) | PAN-013 not wired yet |
| `/apps`, `/roles` | mock | `apps-table.tsx:16`; registry `ROUTE_PERMISSIONS` entries |
| `/` (dashboard), `/reports` | mock | `dashboard/data/stats.ts`; `reports-provider.tsx:4`; registry marks them `pending` PAN-020/021 |
| `/settings`, `/settings/account`, `/settings/appearance`, `/settings/display` | local preferences | registry `local` |
| `/forgot-password`, `/reset-password`, `/verify-email` | public auth pages | the ticket's "main pages" do not obviously include them. Optional: add them to the axe-only list (no API calls needed for `/forgot-password`). |
| `/401`, `/403`, `/404`, `/500`, `/503` | error pages | optional axe-only |

The nav lists Dashboard, Reports, Users, Organizations, Apps, Roles, Audit log and 4 settings pages (`src/components/layout/data/sidebar-data.ts:27-120`).

#### One safe action per page

Safe means no mutation reaches a real endpoint.

- **Sign-in:** submit with the fake accepting; a wrong-password 401 path is also cheap to cover.
- **Users:** type in the "Filter by email…" box (debounced 300 ms). Assert one `GET /api/v1/users?email=…` (the filter is server-side) and that the row count changes. Optionally open the disable dialog and Cancel, asserting no `PATCH`.
- **Audit log:** set a filter, or open a row's before/after detail sheet.
- **Organizations, Apps, Roles, Reports:** use the text filter or a row detail. For create-style buttons, open the dialog and Cancel (in-memory mocks anyway).
- **Dashboard:** a read-only widget interaction. I did not inspect which controls it has.
- **Settings:** the theme toggle on Appearance.
- **Sign-out:** a final test that confirms in the dialog and lands on `/sign-in`.

The implementer should pick the exact controls after reading each page. They must not depend on mock rows that will vanish when PAN-013 to PAN-015 switch to the real API. Assert on page headings and roles rather than mock data values.

### 3. Playwright, axe, CI, config

- **Version alignment.**
  - `playwright` is pinned at exactly `1.59.1` in devDependencies (`package.json:91`). The lockfile has `playwright@1.59.1` and `playwright-core@1.59.1` (`pnpm-lock.yaml:3005,3010`), and `@vitest/browser-playwright` peers on it.
  - Add `@playwright/test` pinned exactly at `1.59.1` so pnpm dedupes to one `playwright-core`. Add `@axe-core/playwright` (4.x; it peers on `playwright-core`).
  - `pnpm test:browser:install` (`playwright install chromium --with-deps`) already installs the matching browser for both runners.
- **Sandbox Chromium.** Mirror `vite.config.ts:42-52`: in `playwright.config.ts`, `use.launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH` when set. `/opt/pw-browsers/chromium-1243` exists, but I cannot confirm it is the build 1.59.1 expects. An executablePath override works when the protocol is compatible; flag this in the first sandbox run.
- **Keep e2e out of Vitest.** Vitest's default include is `**/*.{test,spec}.*`, so `e2e/*.spec.ts` would be picked up and run in the Vitest browser. Either name the files `*.e2e.ts` and set `testMatch` in `playwright.config.ts`, or add `test.exclude: [...configDefaults.exclude, 'e2e/**']` in `vite.config.ts`. I prefer both, with the exclude as the guard. Also add `e2e/**` to `coverage.exclude` (`vite.config.ts:57-64`).
- **Scripts.** `"e2e": "playwright test"`, optionally `"e2e:ui"`. The `webServer` command can be `pnpm exec vite build --mode e2e --outDir dist-e2e && pnpm exec vite preview --mode e2e --outDir dist-e2e --port 4173 --strictPort`, with the env set there. Use `reuseExistingServer: !process.env.CI`. Skip `tsc -b` here, because CI's check job already typechecks.
- **CI.** Add a separate `e2e` job in `.github/workflows/ci.yml`, parallel to `check` and `audit`, with the same setup steps: checkout, pnpm 10, setup-node with `.node-version`, `sha256sum -c vendor/SHA256SUMS`, `pnpm install --frozen-lockfile`.
  - Then `pnpm test:browser:install` and `pnpm e2e`.
  - Add `actions/upload-artifact` for `playwright-report/` and `test-results/` on failure (both are already git-ignored, `.gitignore:4-5`).
  - A separate job avoids lengthening `check` and shows e2e as its own status. If a required-checks list exists, add `e2e` to it (an owner action outside the repo).
  - Playwright config: `forbidOnly: !!process.env.CI`, `retries: CI ? 1 : 0`, `workers: CI ? 2 : undefined`, `trace: 'on-first-retry'`, one `chromium` project.
- **Tooling gates.**
  - `tsc -b` includes only `src` and `vite.config.ts` (`tsconfig.app.json:30`, `tsconfig.node.json:23`). Add `tsconfig.e2e.json` (include `e2e`, `playwright.config.ts`) and reference it from `tsconfig.json`, so e2e code is typechecked in `pnpm typecheck`.
  - `.prettierignore` is an allow-list (`/*` then `!/src` …, lines 1-16). Add `!/e2e` and `!/playwright.config.ts`, or e2e files are never format-checked.
  - ESLint (`**/*.ts`) already covers `e2e/`. The `src/**`-scoped R2 `no-restricted-*` rules (`eslint.config.js:70-112`) do not apply there, so `fetch` and `route` are fine.
  - `knip` (`knip.config.ts`) may need `entry` or `ignore` for `e2e/**` and `playwright.config.ts`, plus ignoreDependencies if needed.
  - `no-console` is an error everywhere (`eslint.config.js:43`).
- **Where files live.**
  - `playwright.config.ts` at the repo root.
  - `.env.e2e` with public placeholders only (`VITE_API_BASE_URL=https://api.e2e.test`, `VITE_APP_KEY=admin`), or inline env in the `webServer` command. Do not use `.env.*.local` (git-ignored).
  - `e2e/fixtures.ts`: a Playwright `test.extend` with a `fakeApi` fixture and a `signedIn` helper.
  - `e2e/support/fake-api.ts`: the route table. Do not import `src/test-utils`. It pulls in `vitest-browser-react` and `@mmlabs/auth-client`, and re-implementing about 60 lines is cleaner. Use the same keyed-route and call-recording shape.
  - `e2e/support/axe.ts`: the `expectNoSeriousA11y(page)` helper.
  - `e2e/*.e2e.ts` specs: `sign-in`, `pages`, `sign-out`.
- **axe.**
  - Use `new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'])` and fail on `violations.filter(v => v.impact === 'serious' || v.impact === 'critical')`. This matches the AC; keep moderate and minor as logged annotations.
  - Run axe only after the page settles: wait for `role=status` "Loading…" to disappear and for the h1 to be visible.
  - Also run it with one dialog or sheet open (Radix portals, `aria-hidden` siblings), and once on `/sign-in`.
  - Whether to also check dark theme is an owner or implementer choice; the theme is client-side (`ThemeProvider`).
- **Sign-in fixture.** Sign-in is fast: fill the form once per spec file through the real UI, or save `storageState` containing `mm_account_id`. The token is in memory only, so a reload re-runs `/auth/accounts` then `/auth/token`; the fake must stay "signed in" across reloads (stateful `accounts`). Keep one dedicated sign-in spec that drives the real form.

## Recommendations

| # | Recommendation | Ties to |
|---|---|---|
| 1 | Network-layer fake with `context.route` on the single fake https origin; production build in `--mode e2e` with `dist-e2e`; zero code in `src/`. | AC1; R2/R3; PAN-010 ruling |
| 2 | Pin `@playwright/test` exactly `1.59.1` (dedup with `playwright`), add `@axe-core/playwright`. | AC1 |
| 3 | Separate e2e files from Vitest by naming (`*.e2e.ts` or `testMatch`) and an `e2e/**` exclude in `vite.config.ts`. | R8 (existing `pnpm test` stays green) |
| 4 | Add a separate CI job `e2e` with report artifacts on failure. | AC1 |
| 5 | One shared `expectNoSeriousA11y` helper with the WCAG 2.2 AA tag set. Cover every sidebar route, `/sign-in`, and one open dialog or sheet. | AC2; R10 |
| 6 | Make the fake data-agnostic where a screen is mock today. Assert headings and roles, and filter-driven requests only on `/users` and `/audit-log`. | stable when PAN-013 to PAN-016 swap the data |
| 7 | Add `tsconfig.e2e.json`, the prettier allow-list entries, knip config and a `.env.example` note (not new vars). Document `pnpm e2e` in `README.md` and `CLAUDE.md` Stack and commands. | R8 |
| 8 | Assert in the fake that no request escapes (`route.abort` plus a failing test on unmatched `https://api.e2e.test` calls), mirroring `test-utils/auth.tsx:131` ("unexpected request"). Fail on `console.error` and `pageerror`. | R8; test reliability |
| 9 | Record the e2e config in a short ADR or an ADR 0003/0005 addendum: fake https origin, `--mode e2e`, no MSW, no test code in `src`. | owner visibility |

## Risks

- **Existing a11y debt (high chance of REWORK).** The mock pages have never been axe-checked. Likely serious findings: `color-contrast` (muted text, badges, recharts SVG on the dashboard), `scrollable-region-focusable`, `aria-allowed-attr`, `nested-interactive` from shadcn table row actions, `select-name` on page-size selects, and `landmark-unique`. Fixes touch the UI (R7: they must stay in the ticket plan or go to follow-ups). Decide up front whether to fix them or use a narrow, per-rule documented exclusion list. A blanket disable would defeat AC2.
- **CORS and preflight under `route.fulfill`** may need explicit headers; verify in the first spike. `redirect:'error'` and `credentials:'omit'` on the typed client (`client.ts:40-44`) have no effect on a fulfilled response.
- **Sandbox Chromium compatibility.** Chromium build 1243 versus 1.59.1 is unverified; fall back to `playwright install` if the protocol mismatches.
- **Library behavior I could not read:** auto-selection of a single account on boot, and `BroadcastChannel` and storage use in a fresh context. `test-utils/auth.tsx:166-168` passes `storage` and `broadcast:false` for tests, while the real app uses defaults. If a multi-account state appears, the gate shows "Choose an account" (`auth-gate.tsx:24-33`). The fake should return exactly one account.
- **Time-based behavior.** The 15 s auth timeout, the 60 s permission `staleTime` and the 300 ms email debounce can cause flakes; use web-first assertions and wait on the actual request instead of fixed sleeps.
- **Docker and CI cost.** `pnpm test:browser:install --with-deps` adds time to the e2e job. Cache `~/.cache/ms-playwright` keyed on the playwright version if it slows down.
- **Vite config coupling.** `vite.config.ts` already runs Vitest in browser mode. A mode-specific `.env.e2e` is picked up by `vite build --mode e2e` only. Do not let `vitest` read it.
- **Drift.** The fake duplicates the API shapes. Reuse the generated `components` types for `Page` and `MePermissions` (`import type` only from `src/api/schema.d.ts`) so schema changes break the typecheck.

## Open questions

1. Are the public auth pages (`/forgot-password`, `/verify-email`, `/reset-password`) and the error pages in scope for the axe sweep, or only the sidebar pages and `/sign-in`?
2. Which a11y findings may this ticket fix in the UI, and which go to follow-ups (R7)? Is a per-rule exclusion with a tracked follow-up acceptable?
3. Is the hostname `https://api.e2e.test` acceptable as the build-time fake origin, or does the owner prefer a different one?
4. Should e2e also run in dark theme and at tablet width (spec §6 says "usable on a tablet")?
5. Required status checks: does the owner add the `e2e` job to branch protection?
6. Should the release workflow (PAN-022) gate on `e2e`?
7. Any objection to a `--mode e2e` build rather than the Docker image for e2e, with `scripts/smoke-image.sh` remaining the nginx and CSP gate?

Files read: `/home/user/admin-pan/work/tickets/PAN-023/ticket.md`, `package.json`, `.github/workflows/ci.yml`, `vite.config.ts`, `Dockerfile`, `nginx/security-headers.conf`, `eslint.config.js`, `knip.config.ts`, `.prettierignore`, `.gitignore`, `tsconfig.app.json`, `tsconfig.node.json`, `docs/adr/0003-auth-client-integration.md`, `docs/adr/0004-permission-mirroring-and-403-handling.md`, `src/api/{auth-client,config,client,auth-hooks}.ts`, `src/test-utils/{auth.tsx,api.ts}`, `src/lib/permissions/{me-permissions,registry}.ts`, `src/features/auth/gate/*`, `src/features/users/api/queries.ts`, `src/main.tsx`, `src/components/layout/data/sidebar-data.ts`, `src/routes/_authenticated/route.tsx`.
