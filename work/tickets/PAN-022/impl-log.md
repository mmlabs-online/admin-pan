
## Attempt 1 — 2026-11-16

### Files touched
| File | Required because |
|---|---|
| `Dockerfile`, `.dockerignore`, `nginx/default.conf`, `nginx/security-headers.conf` | Image with SPA fallback and R6 headers (AC1) |
| `scripts/smoke-image.sh` | Single smoke matrix for CI, release and review (AC1, AC2, AC6, AC7) |
| `.github/workflows/release.yml` | Release flow mirroring org-admin-api (AC2) |
| `.github/workflows/ci.yml` | New `image` job (build + smoke) |
| `docs/deploy.md`, `docs/adr/0002-static-image-build-time-config.md` | Runbook and decision record (AC3, AC4) |
| `.env.example`, `README.md` | Comments / one link |
| `src/**` (13 files: sidebar-data, profile-dropdown, dashboard stats, apps mock-data, audit-log data and 2 tests, reports data/provider/fixtures/csv test) | Mock emails `@mmlabs.online` -> `@example.com` (AC6); origins untouched |

Deployment repo (`/home/user/deployment`, local branches from main, one commit each, not pushed):
- `admin-pan-setup` = `fca5003c8df2ba451e2c1ffba1b499dbd61bcb1f`: `apps/admin-pan/compose.yml`, `.github/workflows/deploy-admin-pan.yml`, `.github/CODEOWNERS` (+1 line).
- `org-admin-api-turnstile-admin-portal` = `387a2822911ec75205abbe3a0a31aa93ce6a16f5`: `apps/org-admin-api/compose.yml`, one line (adds `admin-portal.mmlabs.online`).
- Checks: `bash ops/check-volume-safety.sh` -> "No volume-deleting commands found." on both; `docker compose config --quiet` with a dummy env file (not committed) exits 0; without the variable it fails with "ADMIN_PAN_IMAGE is unset"; deploy-admin-pan.yml diffed against deploy-site.yml (only the planned deltas); YAML parses. actionlint not installed. Checkout left on main.

### Tests added / changed
- `scripts/smoke-image.sh` (whole matrix) run for real against the built image: all checks `ok`, "smoke test passed", exit 0. Run with `--read-only --tmpfs /tmp --cap-drop ALL` as in production; the base entrypoint needed no change.
- Negative builds: `VITE_API_BASE_URL=http://evil` and missing `VITE_API_BASE_URL` both fail in the build stage with "VITE_API_BASE_URL must be an https origin".
- Existing test emails changed to `@example.com`; no new Vitest tests (no logic change).

### Checks (actual output summary)
- pnpm typecheck: clean
- pnpm lint: clean
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): 45 files, 274 tests passed
- pnpm build: built
- pnpm api:types: no diff in src/api
- `grep -rnE '@mmlabs\.online' src` and `dist`: empty
- Docker daemon was available: image built and smoke-tested (see above). Base images pinned by tag+digest (resolved with `docker buildx imagetools inspect`): `node:22-alpine@sha256:1314fb30...`, `nginx-unprivileged:1.30.6-alpine@sha256:f5116ed4...`.
- Sandbox note: `npm install -g pnpm` inside the build fails here (proxy CA, SELF_SIGNED_CERT_IN_CHAIN). I built with a scratchpad copy of the Dockerfile that only adds `COPY --from=ca` + `NODE_EXTRA_CA_CERTS` (`--build-context ca=/root/.ccr`). The committed Dockerfile is otherwise identical; CI/GitHub runners do not need this.
- release.yml diffed against org-admin-api's: only planned deltas; YAML parses (release.yml, ci.yml). `bash -n` on the smoke script ok; shellcheck/actionlint not installed.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- org-admin-api: update `docs/deploy.md` "Host policy" and `set-admin-origins` examples from `admin.mmlabs.online` to `admin-portal.mmlabs.online`; state that `admin.mmlabs.online` must have no DNS/route.
- admin-pan CI/release: SHA-pin actions, add Dependabot (`github-actions`, `npm`, `docker` - bumps the base digests), `pnpm audit --prod` with an owner-approved allowlist.
- deployment: SHA-pin `actions/checkout@v7`, pin `cloudflare/cloudflared:latest`, move the committed tunnel token out of `proxy/compose.yml` and rotate it.
- PAN-010: validate sign-in `redirect`, drop the hash from the 401 redirect, remove mock sign-in.
- admin-pan mock data: app `admin` mock origin still `https://admin.mmlabs.online`; align with `admin-portal` when that screen goes real.
- Template leftovers: `public/images/shadcn-admin.png`, `@faker-js/faker` in the production bundle (size).
- Docker build warns `SecretsUsedInArgOrEnv` for `VITE_APP_KEY` / `VITE_TURNSTILE_SITE_KEY` (false positive: both are public by design, R5).

### Scope self-check
- Could the diff be smaller? No; every file is in the plan.
- Diff size: mostly new config/script/docs files (about 700 lines in admin-pan), 188 + 1 lines in the deployment repo.

## Attempt 2 (REWORK)

### Fixed
- review Issue 1: `nginx/default.conf` `/assets/` Cache-Control no longer has `always`, so a 404 is not `immutable`. `scripts/smoke-image.sh` asserts the `/assets/does-not-exist.js` 404 has no `immutable`/`max-age=31536000`. Also (optional nit) `full_headers` is now checked on the 404 and 405 responses.
- review Issue 2: `docs/deploy.md` set-admin-origins bullet replaced with the exact text from review.md.
- security 1: `release.yml` guard message now points to GitHub Environment `release`, not repository secrets.
- security 2: `Dockerfile` uses one `validate` function for all three args: rejects embedded newlines (`wc -l`), empty when required, then whole-value `grep -Eqx` (empty allowed only for the optional Turnstile key).

### Out-of-plan files (required)
- `.github/workflows/ci.yml` (jobs `check`, `image`) and `.github/workflows/release.yml`: `runs-on: ubuntu-latest` -> `ubuntu-24.04`. Reason: `ubuntu-latest` is now Ubuntu 26.04 and Playwright 1.59.1 has no Chromium for it, so `pnpm test:browser:install` fails on every CI run (orchestrator request).

### Checks (actual)
- typecheck, lint: clean; format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH set): 45 files, 274 tests passed
- pnpm build: built; pnpm api:types: no diff
- Docker build (scratchpad copy with proxy CA only) + `scripts/smoke-image.sh`: "smoke test passed", incl. "asset 404 is not cached as immutable" and 404/405 security headers.
- Negative builds all fail in the build stage: http://evil, missing API URL ("parameter not set"), empty APP_KEY, Turnstile `a;b`, API URL with embedded newline ("VITE_API_BASE_URL is invalid"). Positive build with empty Turnstile key succeeds.
- Deployment repo: no change needed.
