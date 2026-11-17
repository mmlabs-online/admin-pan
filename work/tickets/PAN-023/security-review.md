# PAN-023 security review

## Attempt 1

**Security review: PASS, no blockers.** Scope: `git diff origin/main...HEAD`. The reviewer read the config, CI, dependency, `src/` and `e2e/` changes, plus `Dockerfile`, `.dockerignore`, `.gitignore`, `.env.example` and `src/api/config.ts`. `.env` / `.env.local` were not read. No checks were run here; R8 is the reviewer's.

### Findings

No 🔴 blockers.

🟡 **should-fix: `e2e/sign-in.e2e.ts:70-85` — the R3 storage assertion leaves out IndexedDB and only checks two values.**
- Risk: R3 bans the token from localStorage, sessionStorage, IndexedDB and cookies, allowing only `mm_account_id` to persist. The test only checks that `TOKEN` and `PASSWORD` are absent from localStorage, sessionStorage and `document.cookie`. A regression writing the token to IndexedDB, or persisting other data (the email, a re-encoded token), would pass.
- Fix: also collect `(await indexedDB.databases()).map(d => d.name)` and assert it is empty; assert every localStorage key is in an allowlist (`mm_account_id` plus the template's theme/font/direction keys); assert sessionStorage length is 0; assert `stored` does not contain `EMAIL`. In ticket scope (hardens a test this ticket adds).

💭 **`.dockerignore` does not exclude `dist-e2e/` and `e2e/`.** `COPY . .` (Dockerfile:14) brings them into the build stage; only `/app/dist` reaches the final image, so nothing ships. Add both to `.dockerignore` anyway.

💭 **`playwright.config.ts:29-32` and `.env.e2e` — env precedence and `reuseExistingServer` fail closed.** Exported `VITE_*` env vars beat `.env.e2e`, and locally `reuseExistingServer: !CI` reuses any server on :4173; either could point the bundle at a real API. The auto fixture `noStrayRequests` (`e2e/support/fixtures.ts:24-31`) aborts every non-local, non-`api.e2e.test` request, so nothing leaves the machine and the test fails. Acceptable; optionally document "unset `VITE_*` before `pnpm e2e`" in README/ADR 0006.

💭 **`.github/workflows/ci.yml:37-62` — actions pinned by major tag, not SHA**, matching existing jobs. Otherwise fine: inherits `permissions: contents: read`, no secrets, `sha256sum -c vendor/SHA256SUMS`, `--frozen-lockfile`, a timeout; failure artifacts (7 days) hold only fake sentinel values.

### Verified OK
- No test code in `src/` or the bundle; `e2e/` only type-imports `src/api/schema`; the fake is network-layer (`context.route`). `src/` edits are a11y-only and add no HTML sink (R6).
- `.env.e2e` holds only public placeholders, loads only under `--mode e2e`, and `.dockerignore` excludes `.env.*`.
- The e2e build writes to `dist-e2e/` (gitignored, eslint-ignored); `dist/` is untouched.
- `vite.config.ts`: the `configDefaults` import and `e2e/**` exclude affect tests only.
- Deps: `@playwright/test` 1.59.1 exact (single `playwright-core`), `@axe-core/playwright` 4.14.0 exact, `axe-core@4.14.1` locked with integrity; Docker build sets `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.
- Tests log no page text, bodies or headers; sign-in uses the real form (ADR 0003); the fake rejects admin calls without the Bearer token.

### Follow-ups (out of scope)
1. Pin all GitHub Actions to commit SHAs and enable Dependabot for `github-actions`.
2. Consider a warn-only CI dev-dependency audit (`pnpm audit --audit-level high` without `--prod`).
