Status: READY

# Plan: PAN-023, end-to-end smoke tests

## Spec summary
- Ticket goal: "Playwright e2e: sign in, open each main page, one safe action per page, axe accessibility check on each page."
- `docs/spec-v1.md` §6: "WCAG 2.2 AA (rule R10). Works on current Chrome, Edge, Firefox, Safari desktop; usable on a tablet." and "No secrets in the bundle; access token in memory only (R3, R5)."
- `docs/spec-v1.md` §5.1: "Login page using `@mmlabs/auth-client` (app key `admin`) … account picker / switch and logout … Shell with navigation filtered by permission".
- ADR 0003 (auth-client), line 19: "**No mock sign-in** (owner, 2026-11-16). Signing in always needs a real or local org-admin-api". ADR 0005 line 17: no MSW ("an extra dependency … for no gain over an injected `fetch`").
- ADR 0003 (bug tickets), line 27: regression tests use "Playwright e2e for multi-page flows once PAN-023 adds `pnpm e2e`". This ticket creates that command.

This ticket adds test infrastructure and fixes only the accessibility defects that axe reports (see "Accessibility scope"). It adds no product features and no new screens.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `pnpm e2e` runs against mocks in CI | (a) `.github/workflows/ci.yml` has a new `e2e` job that runs `pnpm install --frozen-lockfile`, `pnpm test:browser:install` and `pnpm e2e`, and uploads `playwright-report/` and `test-results/` on failure. (b) Locally, run `PLAYWRIGHT_CHROMIUM_PATH=<sandbox chromium> pnpm e2e`. It must pass with every spec listed under "Tests to write" and no `test.skip` or `test.only`. (c) The tests never reach a real backend. All API traffic goes to the fake origin `https://api.e2e.test`, served by `page.route`. The `noStrayRequests` fixture fails a test on any unmatched API request or any non-local request. (d) `git grep -n "e2e" src/` finds no test hook in app code. The only `src/` changes are the a11y fixes listed below. (e) `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` and `pnpm build` stay green, and `pnpm test` does not pick up `e2e/**`. |
| 2 | axe finds no serious/critical issues on main pages (R10) | `e2e/pages.e2e.ts` and `e2e/sign-in.e2e.ts` call `expectNoSeriousA11y(page, '<page id>')` on each page in the "Pages covered" table. The tags are WCAG 2.0/2.1/2.2 A and AA, and any violation with `impact` of `serious` or `critical` fails the test. The reviewer checks four things. (1) No `disableRules`, `.exclude()` or tag narrowing appears anywhere. (2) `e2e/support/a11y-known-issues.ts` is empty, or each entry names a single rule id, a single page id and an exact axe node target, with a reason and a follow-up line in impl-log. (3) A known-issue entry that no longer matches fails the run ("stale entry"). (4) A temporary edit that reverts one listed fix (for example the badge class) makes `pnpm e2e` fail. The implementer records that red run in impl-log. |

## Pages covered (the "main pages")
"Main pages" means `/sign-in` plus every sidebar entry (`src/components/layout/data/sidebar-data.ts:27-120`). The three public auth pages are also axe-checked, because the PAN-012c a11y review listed "Run axe on `/forgot-password`, `/reset-password` and `/verify-email` once PAN-023 is in" as a follow-up. They make no API calls and cost one line each.

| Page id | Route | Data today | Safe action (no mutation reaches any endpoint) | axe state |
|---|---|---|---|---|
| sign-in | `/sign-in` | fake auth API | Wrong password shows the alert "Email or password is incorrect." Then correct credentials land on the redirect target. | form idle, and with the error alert shown |
| dashboard | `/` | mock | Click tab "Activity" and assert `aria-selected=true` | after the action |
| reports | `/reports` | mock | Click tab "Overview" and assert it is selected | after the action |
| users | `/users` | fake API | Type a fragment in the email filter. Assert exactly one later `GET /api/v1/users` carries `email=<fragment>` and the row count drops to 1. Open that row's actions, choose Disable (or Enable), and check the confirm dialog names the email. Cancel. Assert zero `PATCH` calls and that focus returns to the row's actions trigger. | page, and again with the confirm dialog open |
| organizations | `/organizations` | mock | Open the create dialog (button found by role and name), then Cancel. Assert the dialog is gone. | page |
| apps | `/apps` | mock | Same as organizations, with the create/add app dialog | page |
| roles | `/roles` | mock | Same as organizations, with the create role dialog | page |
| audit-log | `/audit-log` | fake API | Open the first row's detail sheet, expand "Raw JSON", then close with Escape. Assert focus returns to the row button. | page, and again with the sheet open and Raw JSON expanded |
| settings-profile, settings-account, settings-display | `/settings`, `/settings/account`, `/settings/display` | local | none (axe only; the Settings group's action is on Appearance) | page |
| settings-appearance | `/settings/appearance` | local | Switch the theme to Dark and submit. Assert `<html>` gets class `dark`. Switch back to Light, then run axe. | page (light) |
| forgot-password, verify-email, reset-password | `/forgot-password`, `/verify-email`, `/reset-password` (no token) | none | none (axe only, signed out) | page |

Assertions use roles and headings (`getByRole('heading', { name: 'Users' })`), never mock row values, so PAN-014/015/020/021 can switch data sources without breaking these tests. On `/users` and `/audit-log` the tests may assert values from the fake's own fixtures.

Out of scope: error pages `/401…/503`, gate panels (not-member, unverified, picker), `/settings/notifications` (not in the nav), dark theme sweep, tablet width. These go to follow-ups.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `package.json` | Add devDeps `@playwright/test` pinned exactly at `1.59.1` (same as `playwright`, so one `playwright-core`) and `@axe-core/playwright` (latest 4.x, exact pin). Add script `"e2e": "playwright test"`. | AC1 |
| `pnpm-lock.yaml` | Regenerated by `pnpm add -D` | AC1 (`--frozen-lockfile` in CI) |
| `playwright.config.ts` (new) | `testDir: 'e2e'`, `testMatch: '**/*.e2e.ts'`, one `chromium` project. `use`: `baseURL: 'http://localhost:4173'`, `colorScheme: 'light'`, `locale: 'en-US'`, `timezoneId: 'UTC'`, `serviceWorkers: 'block'`, `trace: 'on-first-retry'`, `launchOptions.executablePath` from `PLAYWRIGHT_CHROMIUM_PATH` when set (same pattern as `vite.config.ts:42-52`). Also `forbidOnly: !!process.env.CI`, `retries: CI ? 1 : 0`, `workers: CI ? 2 : undefined`, and reporter `CI ? [['github'], ['html', { open: 'never' }]] : 'list'`. `webServer`: `command: 'pnpm exec vite build --mode e2e --outDir dist-e2e && pnpm exec vite preview --mode e2e --outDir dist-e2e --port 4173 --strictPort'`, `url: 'http://localhost:4173'`, `timeout: 180_000`, `reuseExistingServer: !process.env.CI`. | AC1 |
| `.env.e2e` (new, committed) | `VITE_API_BASE_URL=https://api.e2e.test`, `VITE_APP_KEY=admin`, `VITE_TURNSTILE_SITE_KEY=` (explicitly empty so a developer's `.env.local` cannot leak in; `.env.[mode]` outranks `.env.local`). Header comment: public placeholders only (R5); read only by `vite build --mode e2e`. | A production build (`DEV=false`) accepts only an https origin (`src/api/config.ts:34-40`) |
| `tsconfig.e2e.json` (new) | Settings as in `tsconfig.node.json`, plus `"lib": ["ES2023", "DOM"]` and `"types": ["node"]`. Include `e2e`, `playwright.config.ts`. | `pnpm typecheck` covers the e2e code (R8) |
| `tsconfig.json` | Add reference `{ "path": "./tsconfig.e2e.json" }` | same |
| `vite.config.ts` | `test.exclude: [...configDefaults.exclude, 'e2e/**']` (import `configDefaults` from `vitest/config`) | Vitest must never run Playwright specs |
| `eslint.config.js` | Add `'dist-e2e'` to `ignores` | Build output must not be linted |
| `.prettierignore` | Allow-list `!/e2e`, `!playwright.config.ts`, `!tsconfig.e2e.json` | Otherwise `format:check` skips the new code |
| `.gitignore` | Add `dist-e2e/` | Build output |
| `e2e/support/fake-api.ts` (new) | Network-layer fake for `https://api.e2e.test` (details under Approach) | AC1, ADR 0003 (no mock sign-in in the app) |
| `e2e/support/fixtures.ts` (new) | `test = base.extend<{ api; noStrayRequests; signIn }>`, re-exports `expect` | AC1 |
| `e2e/support/a11y.ts` (new) | `expectNoSeriousA11y(page, pageId)` | AC2 |
| `e2e/support/a11y-known-issues.ts` (new) | Typed list `KnownIssue[]`, empty unless the escape hatch is used (see Accessibility scope) | AC2 |
| `e2e/sign-in.e2e.ts` (new) | Sign-in flows and axe on `/sign-in` | AC1, AC2 |
| `e2e/pages.e2e.ts` (new) | One test per main page: navigate, safe action, axe. Includes the public auth pages. | AC1, AC2 |
| `e2e/sign-out.e2e.ts` (new) | Sign out through the profile menu and its confirm dialog | AC1 |
| `.github/workflows/ci.yml` | New job `e2e` (details under Approach) | AC1 |
| `README.md` | Under "Quick start": what `pnpm e2e` does, the sandbox `PLAYWRIGHT_CHROMIUM_PATH` note, and that it never needs an API | discoverability |
| `docs/adr/0006-e2e-smoke-tests.md` (new) | Records the e2e approach (see Approach step 9) | A decision that outlives the ticket (rule 7) |
| `src/features/users/data/data.ts`, `src/features/audit-log/data/data.ts`, `src/features/organizations/data/data.ts` | **Only if axe reports `color-contrast` on the destructive badge.** Change `text-destructive` to `text-red-800` in the shared destructive badge class, keeping the `dark:` classes. Change all three, because they use the identical string. | AC2 (PAN-016 a11y 🟡4, PAN-013 a11y note) |
| `src/features/audit-log/components/audit-log-detail-sheet.tsx` (and `src/features/users/components/users-detail-sheet.tsx:188` only if that sheet is ever opened by a test, which this plan does not do) | **Only if axe reports `scrollable-region-focusable`.** On the `overflow-x-auto` wrappers (`:137`, `:168`) and the `<pre>` (`:196`) add `tabIndex={0}`, `role='region'`, an `aria-label` ("Before and after", "Recorded values", "Raw JSON") and the existing focus-visible ring classes | AC2 (PAN-016 a11y 🟡3) |
| Other `src/` files | Only under the a11y fix budget below, each recorded in impl-log with the axe rule id and target | AC2 |

The implementer touches no other file without recording why in impl-log. `CLAUDE.md` still says "Playwright e2e later (PAN-023)". Do not edit it in this diff. List the one-line update as a follow-up for the orchestrator to raise with the owner.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `e2e/sign-in.e2e.ts › signs in through the real form and lands on the dashboard` | AC1. Real `@mmlabs/auth-client` against the fake. Asserts `POST /api/v1/auth/login` once, `POST /api/v1/auth/token` at least once, a heading on `/`, and no `/sign-in` in the URL. |
| `e2e/sign-in.e2e.ts › wrong password shows an error and stays on sign-in` | AC1. 401 `invalid_credentials` produces the alert text. The password field is cleared. |
| `e2e/sign-in.e2e.ts › a protected URL redirects to sign-in and back after login` | AC1. `/users` while signed out goes to `/sign-in?redirect=…`. After login the URL is `/users`. |
| `e2e/sign-in.e2e.ts › sign-in page has no serious or critical axe violations` | AC2, idle state and error-alert state |
| `e2e/sign-in.e2e.ts › session survives a reload (token in memory, re-fetched)` | AC1 and R3. After a reload, `GET /auth/accounts` and `POST /auth/token` are called again and the page renders. Also asserts `page.evaluate` over `localStorage`, `sessionStorage` and `document.cookie` finds no `access_token` value (`TOKEN` sentinel string absent). |
| `e2e/pages.e2e.ts › <page id>: opens, does its safe action, passes axe` | AC1 and AC2. One `test()` per row of "Pages covered", generated from a table, except users and audit-log, which get their own explicit tests below. |
| `e2e/pages.e2e.ts › users: server-side email filter, disable dialog cancels without PATCH` | AC1, AC2 (dialog open) |
| `e2e/pages.e2e.ts › audit-log: detail sheet with raw JSON passes axe and returns focus` | AC1, AC2 (sheet open) |
| `e2e/pages.e2e.ts › sidebar lists every main page` | AC1. Every nav link in the table is visible with `admin:*`, which guards against a page silently dropping out of the sweep. |
| `e2e/sign-out.e2e.ts › sign out confirms, calls logout once and returns to sign-in` | AC1. A protected URL afterwards redirects to `/sign-in`. |
| `e2e/support/a11y.ts` self-check: `e2e/a11y-helper.e2e.ts › fails on a serious violation and on a stale known issue` | AC2. Uses `page.setContent` with an `<img>` without alt (critical `image-alt`) and asserts the helper throws. Also asserts a stale known-issue entry throws. This proves the gate is not a no-op. |

There are no new Vitest unit tests. The only `src/` changes are class and attribute changes; the e2e axe run is their test, and the existing Vitest suites must stay green.

## Approach
1. **Deps and config.** `pnpm add -D -E @playwright/test@1.59.1 @axe-core/playwright@<latest 4.x>`. Add the `e2e` script, `playwright.config.ts`, `.env.e2e`, `tsconfig.e2e.json` plus its reference, the Vitest exclude, and the ESLint, Prettier and git ignore entries. Run `pnpm exec playwright --version` and record it. Run `pnpm why playwright-core` and record that it shows a single version.
2. **Build under test.** The `webServer` builds the production bundle with `--mode e2e` into `dist-e2e/` and serves it with `vite preview` on `:4173`. Vite sets `DEV=false` for builds, so this is the release code path. The only difference is the public origin string. `dist/` is never touched. `vite preview` has no CSP; `scripts/smoke-image.sh` stays the nginx and CSP gate (ADR 0006).
3. **Fake API (`e2e/support/fake-api.ts`).** It installs via `context.route('https://api.e2e.test/**', handler)` and does not import from `src/test-utils` (that pulls in Vitest).
   - **Route table** keyed `"METHOD /path"`, the same shape as `src/test-utils/auth.tsx:72-143`. Calls are recorded as `{ method, path, query: URLSearchParams, headers, body }`, and the fake exposes `count(key)`, `calls`, `unmatched` and a mutable `state`.
   - **Default routes:**
     - `GET /api/v1/auth/accounts`: exactly one account when signed in, else 401 `session_invalid`.
     - `POST /api/v1/auth/login`: password `Sentinel-Password-e2e` → `{ account_id, user }` and state becomes signed in. Any other password → 401 `invalid_credentials`.
     - `POST /api/v1/auth/token`: `{ access_token: <sentinel>, token_type: 'Bearer', expires_in: 900, audience: 'admin' }`.
     - `POST /api/v1/auth/logout`: 204, and state becomes signed out.
     - `GET /api/v1/me/permissions`: `MePermissions` with `permissions: ['admin:*']`.
     - `GET /api/v1/users`: `Page_UserRead_` from 3 fixture users, one of them `disabled` and none being the signed-in user. It filters by the `email` substring and `status` and honours `limit`/`offset`.
     - `GET /api/v1/audit-logs`: `Page_AuditLogRead_` with 2 entries. One has a `changes` before/after object, including a long value (about 200 chars, no spaces) so the detail tables and `<pre>` overflow as they would with real data.
   - **Types.** Fixture types use `import type { components } from '../../src/api/schema'`, so a schema change breaks `pnpm typecheck`.
   - **Bearer check.** Every non-`/auth/` route asserts `authorization === 'Bearer <sentinel>'`; otherwise it returns 401 `session_invalid` and records an error.
   - **CORS.** Every fulfilled response carries `access-control-allow-origin: <request Origin>`, `access-control-allow-credentials: true` and `vary: Origin`. An `OPTIONS` request gets 204 with allow-methods and allow-headers echoing `access-control-request-headers`. The fake answers `OPTIONS` itself even if Chromium's interception never shows it. Verify in the first run and record in impl-log which happened.
   - **Unmatched routes** return 501 envelope `not_faked` and are pushed to `unmatched`.
   - **No real cookie.** `mm_device` is HttpOnly and API-set; the stateful `accounts` list stands in for it (consult §1).
4. **Fixtures (`e2e/support/fixtures.ts`).**
   - `api`: a fresh fake per test.
   - `noStrayRequests` (auto): routes every request whose origin is not `http://localhost:4173` or the fake to `route.abort()` and records it. It listens to `pageerror` and to `console` messages of type `error`. Allowed console errors are only `Failed to load resource` for statuses the test itself triggers (401, 403). The fixture records the rest. In teardown it asserts that `api.unmatched`, stray requests, page errors and unexpected console errors are all empty, so it reports the cause rather than a timeout.
   - `signIn(path = '/')`: goes to `/sign-in?redirect=<path>`, fills Email/Password by label, clicks "Sign in", and waits for the page heading. It is used by every signed-in test; the real form is the only way in (ADR 0003, no mock sign-in, no storage seeding).
5. **axe helper (`e2e/support/a11y.ts`).**
   - **Settling.** Wait until no `role=status` element contains "Loading" and `document.getAnimations()` has nothing running (use `page.waitForFunction`, not sleeps).
   - **Run.** `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()`.
   - **Partition.** Split violations into blocking (`serious`/`critical`) and the rest. Moderate and minor go to `testInfo.attach('axe-moderate-minor', json)`.
   - **Known issues.** Remove blocking nodes matched by an entry in `a11y-known-issues.ts` with the same `pageId`, `rule` and exact `target` (joined selector). Fail if any blocking node remains. The message lists rule, impact, target and `failureSummary`, never page text, because text could hold an email (R5). Also fail if an entry for this `pageId` matched nothing (stale).
   - **Not allowed:** `disableRules`, `exclude()`, a page-wide or rule-wide entry.
6. **Specs.** Follow "Pages covered" and "Tests to write".
   - Navigate through the sidebar links where practical (the first test), and use `page.goto` for the rest.
   - Use web-first assertions. Wait for the actual request (`page.waitForRequest` with a predicate on the `email` param) instead of sleeping through the 300 ms debounce.
   - `test.use({ viewport: { width: 1280, height: 800 } })`.
7. **CI (`.github/workflows/ci.yml`).**
   - New job `e2e` on `ubuntu-24.04`, `timeout-minutes: 20`.
   - Steps: checkout, `pnpm/action-setup@v4` (version 10), `setup-node@v4` (`node-version-file: .node-version`, `cache: pnpm`), `sha256sum -c vendor/SHA256SUMS`, `pnpm install --frozen-lockfile`, `pnpm test:browser:install`, `pnpm e2e` with `env: CI: true`.
   - Then `actions/upload-artifact@v4` with `if: failure()`, paths `playwright-report/` and `test-results/`, `retention-days: 7`.
   - The job is independent of `check`. Permissions stay `contents: read`.
8. **Accessibility fixes.** See "Accessibility scope". The order is: run, fix within budget, re-run, record.
9. **ADR 0006 `docs/adr/0006-e2e-smoke-tests.md`**, in the style of ADR 0005:
   - The fake https origin is set only in `.env.e2e`.
   - The production build runs with `--mode e2e` and `vite preview`.
   - Playwright `route` is the only fake. There is no test code or hook in `src/`, no MSW, and no mock sign-in.
   - The axe gate: tags, serious/critical, and the known-issues policy with stale detection.
   - `smoke-image.sh` stays the CSP gate.
   - Alternatives rejected: vite dev plus a stub server, MSW, a real API in CI, an app-side test login.
10. **Sandbox run.**
    - Command: `PLAYWRIGHT_CHROMIUM_PATH=<path> pnpm e2e`. Use the same value `pnpm test` uses here. Earlier tickets used `/opt/pw-browsers/chromium`; the binary verified on disk is `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`.
    - If the protocol versions mismatch, record it and run `pnpm exec playwright install chromium` instead.
    - Record the full `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build && pnpm e2e` output summary in impl-log.

**Rules.**
- R1: no backend; the fake lives only in test code.
- R2: no HTTP added in `src/`, and the e2e code is outside the `src/**` lint scope.
- R3: real library sign-in; a test asserts the token is not persisted.
- R5:
  - `.env.e2e` holds public placeholders only.
  - Fake credentials are sentinels, not real.
  - axe failure output omits page text.
- R7: a11y fixes stay bounded as below.
- R8: all checks plus `pnpm e2e`.
- R10: the axe gate is the point of the ticket.

## Accessibility scope (R7 decision)
**How the known 🟡 items map to axe.** Light theme, the tag set above, serious/critical only.

| Earlier finding | Would axe flag it? | Treatment here |
|---|---|---|
| PAN-016 🟡4 / PAN-013 note: destructive badge contrast (`text-destructive` on `bg-destructive/10`, about 4.2:1 at 12 px) | Likely yes. `color-contrast` is serious (wcag2aa 1.4.3). The fake users list includes a `disabled` user so the badge renders. | **Fix** in the three `data.ts` files (`text-red-800`, about 7:1 on the tint). Dark mode is not swept; follow-up. |
| PAN-016 🟡3: scrollable regions in the audit-log detail sheet | Yes, if they overflow. `scrollable-region-focusable` is serious (wcag2a 2.1.1). The fake's long value plus the expanded Raw JSON makes them overflow. | **Fix** in `audit-log-detail-sheet.tsx` as listed. `users-detail-sheet.tsx:188` has the same pattern but no test opens it, so it is a follow-up unless flagged. |
| PAN-016 🟡1: DatePicker loses its label once a date is set | No. The button still has an accessible name, and `label-content-name-mismatch` is experimental and off by default. | Not fixed; stays a follow-up |
| PAN-016 🟡2: focus lost after Reset/Clear | No. axe does not test focus management. | Not fixed; stays a follow-up |
| PAN-010 🟡1: StatusPanel is a `role=status` live region holding interactive content | No. No axe rule covers interactive content in live regions, and StatusPanel is only on the gate panels, which are not swept. | Not fixed; stays a follow-up |
| PAN-012c 🟡1 / 💭6: auth page titles are `div`s, and `AuthLayout` has no `<main>` | No. `AuthLayout` already renders an `<h1>`. `heading-order`, `region` and `landmark-one-main` are best-practice / moderate, outside the WCAG tag set. They appear in the moderate/minor attachment. | Not fixed; stays a follow-up |
| PAN-011b 🟡2: self-row reason text about 2.3:1 | Would be `color-contrast`, but the fake users list never contains the signed-in user, so it does not render | Not fixed; stays a follow-up (needs a self-row test) |
| PAN-013 🟡4: empty actions header cell | No. `empty-table-header` is best-practice / minor. | Not fixed |

**Fix budget for violations nobody has seen yet.** After the two planned fixes, the implementer fixes any other serious/critical violation in `src/` if all of these hold:
- the fix is a local attribute or class change: `aria-label`, `aria-labelledby`, `role`, `tabIndex`, a contrast class, or alt text;
- it introduces no new component or behaviour;
- the extra `src/` diff for all such fixes stays ≤ about 80 changed lines across ≤ 6 files.

`src/components/ui/*` may be edited only for a root-cause a11y bug (CLAUDE.md: "edit only to fix bugs"), with a one-line comment. Each fix is listed in impl-log as `rule | page | target | file:line | change`.

**Escape hatch (narrow).** A violation that is over budget, would need a design or behaviour change, or comes from a third-party DOM (recharts, sonner) goes into `e2e/support/a11y-known-issues.ts`. Each entry has:
- one `rule`,
- one `pageId`,
- one exact axe `target`,
- a `reason`,
- a `followUp` string (the proposed ticket title).

The impl-log follow-ups list each entry. The reviewer gives REWORK for a rule-wide entry, a page-wide entry, a missing reason, or more than 5 entries in total. If more than 5 would be needed, stop and record an escalation note instead of growing the list.

## Specialist input used
`consult-frontend-developer.md`:
- **Adopted:**
  - §1: fake https origin, `context.route`, production `--mode e2e` build with `dist-e2e`, zero code in `src/`, CORS headers on fulfilled responses, exactly one account.
  - §2: page list and safe actions, with assertions on headings and roles.
  - §3: pin `@playwright/test@1.59.1`, add `@axe-core/playwright`, `executablePath` from `PLAYWRIGHT_CHROMIUM_PATH`, `*.e2e.ts` plus Vitest exclude, `tsconfig.e2e.json`, `.prettierignore`, separate CI job with artifacts, WCAG 2.2 AA tag set, serious/critical filter.
  - Recommendations #8 (fail on unmatched or stray requests and page errors) and #9 (ADR 0006).
  - Reuse of generated schema types.
- **Changed:**
  - The env file is `.env.e2e`, committed, with an explicit empty Turnstile key, to block `.env.local` leakage.
  - `console.error` is failed except expected `Failed to load resource`, because Chromium logs every 4xx as a console error.
  - Sign-in goes through the real form per test instead of `storageState`; only `mm_account_id` would be persisted, and per-test sign-in also exercises the token re-fetch.
- **Rejected:**
  - Dark theme and tablet width: not in the ACs; follow-ups.
  - `knip` changes: knip is not in CI; adjust `knip.config.ts` only if `pnpm knip` newly reports e2e files, and record it.
  - Error pages in the sweep: not "main pages"; follow-up.
- **Open questions answered:** see Assumptions. Q1 (scope): sidebar pages, `/sign-in` and the 3 public auth pages. Q2: fix budget plus a narrow known-issues list. Q7: `--mode e2e` build, smoke-image stays the CSP gate.

## Assumptions
- "Against mocks" in AC1 means a network-layer fake API in Playwright plus the screens' existing in-app mock data. No org-admin-api process is needed (ADR 0003 forbids only a mock sign-in inside the app; the real library still talks HTTP).
- `https://api.e2e.test` is acceptable as the build-time fake origin. `.test` is reserved (RFC 2606) and is never resolved, because Playwright answers every request.
- Light theme only, at 1280×800, in Chromium only. Spec §6 browser coverage (Firefox, Safari) and tablet width are follow-ups.
- Adding `e2e` to the required status checks, and gating `release.yml` on it, are owner actions outside this diff; list them as follow-ups.
- `vite build --mode e2e` produces `import.meta.env.DEV === false` (Vite's default `NODE_ENV=production` for builds). The implementer confirms this in the first run, because the https-only check depends on it.
- If Chromium's interception never surfaces CORS preflights to `route`, the explicit `OPTIONS` handler is harmless. Record which behaviour was observed.

## Blocking questions
None.

## Split proposal
None. The diff is mostly new test code (estimated 600 to 700 lines, plus the lockfile) for one feature, with no product behaviour change, so one review cycle is realistic. **Fallback:** if a11y fixes would exceed the budget, the extra fixes become **PAN-023b "Fix axe serious findings listed in e2e known issues"**. This ticket still lands with the narrow known-issues list, never a blanket disable.

## Screens
None. No screen behaviour changes. The only `src/` changes are the bounded a11y fixes above (classes and attributes), and the axe runs in `pages.e2e.ts` verify them.

## API calls used
None in `src/`. The e2e fake answers these existing calls only, typed from `src/api/schema.d.ts`: `GET /api/v1/auth/accounts`, `POST /api/v1/auth/login`, `POST /api/v1/auth/token`, `POST /api/v1/auth/logout` (library contract, org-admin-api USR-03/03b/08), `GET /api/v1/me/permissions` (USR-11), `GET /api/v1/users` (USR-01b), `GET /api/v1/audit-logs` (ADM-004). No endpoint is mocked in production code.

## Follow-ups to record (implementer copies to impl-log)
- `CLAUDE.md` Stack and commands: replace "Playwright e2e later (PAN-023)" with `pnpm e2e` (owner approval).
- Owner: add the `e2e` job to required checks, and consider gating `release.yml` on it.
- Axe sweep in dark theme and at tablet width; Firefox/WebKit projects (spec §6).
- Axe on error pages and gate panels (not-member, unverified, account picker).
- Still open from earlier reviews: PAN-016 🟡1, 🟡2; PAN-010 🟡1; PAN-012c 🟡1 and `<main>` in `AuthLayout`; PAN-011b 🟡2; `users-detail-sheet.tsx:188` scroll region if not fixed here.
- Every `a11y-known-issues.ts` entry, if any.
