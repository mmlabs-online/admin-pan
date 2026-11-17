# ADR 0006: Playwright e2e smoke tests with a network-layer fake API and an axe gate

Status: Accepted pending owner merge (PAN-023). Builds on [ADR 0003](0003-auth-client-integration.md) (no mock sign-in) and [ADR 0005](0005-server-side-tables.md) (no MSW).

## Context
Spec §6 asks for WCAG 2.2 AA (R10) and CI must prove that sign-in and every main page work. Sign-in always needs a real or local org-admin-api (ADR 0003), the owner rejected MSW (ADR 0005), and a production build accepts only an `https` API origin (`src/api/config.ts`).

## Decision
- **Production bundle under test.** `pnpm e2e` builds with `vite build --mode e2e --outDir dist-e2e` and serves it with `vite preview` on `:4173`. `.env.e2e` (committed, public placeholders only, R5) sets `VITE_API_BASE_URL=https://api.e2e.test`, `VITE_APP_KEY=admin` and an empty Turnstile key. `dist/` is never touched.
- **Playwright `route` is the only fake.** `e2e/support/fake-api.ts` answers every request to `https://api.e2e.test` (identity endpoints, `GET /me/permissions`, users, audit logs) with fixtures typed from the generated OpenAPI types, checks the Bearer token on admin routes, answers CORS, and records calls. Unmatched requests return 501 and fail the test. A fixture aborts and fails on any request to a non-local origin, a page error or an unexpected `console.error`. There is no test code or hook in `src/`, no MSW, and no mock sign-in: every test signs in through the real form.
- **axe gate.** `e2e/support/a11y.ts` runs axe with the WCAG 2.0/2.1/2.2 A and AA tags on every main page (and with a dialog or sheet open on users and audit log). Any `serious` or `critical` node fails the test; moderate and minor results are attached to the report. No `disableRules`, no `exclude`. `e2e/support/a11y-known-issues.ts` is the only escape hatch: one rule, one page, one exact node target, a reason and a follow-up per entry; an entry that no longer matches fails the run (stale).
- **Scope.** Chromium, light theme, 1280x800. `scripts/smoke-image.sh` stays the nginx and CSP gate, because `vite preview` sends no CSP.
- **CI.** A separate `e2e` job uploads `playwright-report/` and `test-results/` on failure.

## Alternatives rejected
- `vite dev` plus a stub server: not the release code path, needs a second process.
- MSW: owner decision (ADR 0005).
- A real org-admin-api in CI: not "against mocks", slower and flakier.
- An app-side test login or env hook: violates ADR 0003 and puts test code in the bundle.

## Consequences
- The fake duplicates API behaviour; typed fixtures make a schema change fail `pnpm typecheck`.
- axe cannot see focus management; those findings stay as follow-ups.
