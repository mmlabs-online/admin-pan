Status: READY

# Plan — PAN-022: Release and deploy to admin-portal.mmlabs.online

## Spec summary
`docs/spec-v1.md` §6.1 Deployment:
> - First release (owner, 2026-11-16): ship the mock-data UI publicly at `admin-portal.mmlabs.online` before real sign-in (PAN-010); it holds no real data.
> - Hostname on `*.mmlabs.online` — required, because the identity cookie flow only works same-site with `api.mmlabs.online` (org-admin-api identity-architecture §7). Hostname: `admin-portal.mmlabs.online` (owner, 2026-11-16). Its origin must be registered on app `admin` (`apps.origins`).
> - Static files in an nginx image; release/deploy like org-admin-api: branch `release/vX.Y.Z` from main → image on Docker Hub → PR on `mmlabs-online/deployment` → owner merges → Mac runner, Cloudflare Tunnel.

§6: "No secrets in the bundle; access token in memory only (R3, R5). Security headers via nginx (R6)."

Owner decisions (ticket notes, 2026-11-16), all binding for this plan:
- Hostname `admin-portal.mmlabs.online`. Public release of the mock-data UI with mock sign-in. No Cloudflare Access. PAN-010 dependency dropped.
- Image built against the real API: `VITE_API_BASE_URL=https://api.mmlabs.online`, `VITE_APP_KEY=admin`. Forgot, reset and verify go live.
- A separate deployment PR adds `admin-portal.mmlabs.online` to org-admin-api `TURNSTILE_ALLOWED_HOSTNAMES`. The owner runs `set-admin-origins` and adds the hostname to the Turnstile widget, following the runbook.
- Every `@mmlabs.online` address in mock data becomes `@example.com` (in scope).
- **No** demo banner and **no** redirect validation in this ticket. Redirect validation stays with PAN-010.
- Keep **Google Fonts**: allow `fonts.googleapis.com` and `fonts.gstatic.com` in the CSP. Do not self-host.
- Docker Hub image `mingming21400/admin-pan`, **public**.
- The first release (`release/v0.1.0`) is **not** part of this ticket. It is cut after the PAN-022 PR is merged.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Dockerfile + nginx config with SPA fallback and security headers (R6) | **With a Docker daemon** (`docker info` succeeds), from `/home/user/admin-pan`, run `docker build --build-arg VITE_API_BASE_URL=https://api.mmlabs.online --build-arg VITE_APP_KEY=admin -t admin-pan:review .` and then `bash scripts/smoke-image.sh admin-pan:review https://api.mmlabs.online`. It must exit 0 and print every check in the "Smoke matrix" below as `ok`. Also run the same build with `--build-arg VITE_API_BASE_URL=http://evil` and with no `VITE_API_BASE_URL`: both must fail in the build stage with the validation message. **Without Docker**, use the fallback below. |
| 2 | `release.yml` mirrors org-admin-api's flow; smoke test of the image | Read `.github/workflows/release.yml` side by side with `/home/user/org-admin-api/.github/workflows/release.yml`. The steps must be the same: guards (on main, not already tagged, strict `release/vX.Y.Z`, new and higher tag, non-empty secrets) → tag push → buildx `linux/amd64` push → smoke test of `$IMAGE@$DIGEST` → deployment PR that writes only `apps/admin-pan/release.env`. Only the deltas listed in Approach §4 may differ. The smoke step must call `scripts/smoke-image.sh` (the same script as AC1 and CI). Run `bash -n scripts/smoke-image.sh`, run `actionlint` on both workflows if it is installed, and parse each workflow with YAML (`python3 -c 'import sys,yaml; yaml.safe_load(open(sys.argv[1]))' <file>` or an equivalent). On the PAN-022 PR, the CI `image` job must be green. |
| 3 | Runbook `docs/deploy.md` | The file exists and has these sections: Flow, Release a version, What is in the image (build-time config, header table), One-time setup (owner), Origin registration, Verify after deploy, Rollback / redeploy / break-glass, Troubleshooting. Every owner step names a place (repo setting, dashboard path, workflow and inputs) and invents no values: no secret values, no site key, no SHAs. |
| 4 | Origin registration on org-admin-api app `admin` documented | `docs/deploy.md` "Origin registration" gives: the prerequisite (the deployed org-admin-api release contains ADM-002c, so `ops-org-admin-api` offers `set-admin-origins`); the run (origins `https://admin-portal.mmlabs.online`, `dry_run` on first, approve `org-admin-api-ops`, check the `+ origin https://admin-portal.mmlabs.online` line, then run with `dry_run` off); the warning that the set is **replaced** (at most 2 origins), so the dry run's current `origins:` line has to be read first; the 60 s delay; and a check (`/forgot-password` end to end, then the reset link host). |
| 5 | Deployment side prepared as a PR on `mmlabs-online/deployment`, following its conventions | In `/home/user/deployment` there are two local branches from `main`, each with one commit. **(A) `admin-pan-setup`** changes only `apps/admin-pan/compose.yml`, `.github/workflows/deploy-admin-pan.yml` and `.github/CODEOWNERS`. **(B) `org-admin-api-turnstile-admin-portal`** changes only `apps/org-admin-api/compose.yml`, one line. Check with `git diff --stat main..<branch>`. Neither branch name matches pr-scope's `^release/([a-z0-9-]+)-(v[0-9]\|sha-…)`. Run `bash ops/check-volume-safety.sh` on each branch: it prints "No volume-deleting commands found.". With docker compose available, write a temp file `ADMIN_PAN_IMAGE=mingming21400/admin-pan:v0.0.0@sha256:<64×0>` and run `docker compose -p admin-pan -f apps/admin-pan/compose.yml --env-file <tmp> config --quiet`, which must exit 0. Without the variable, `config` must fail with the `ADMIN_PAN_IMAGE is unset` message. Diff `deploy-admin-pan.yml` against `deploy-site.yml`: only the deltas in Approach §6 may differ. The tunnel route is a dashboard step (no file in `proxy/`), documented in the compose header and in `docs/deploy.md`. |
| 6 | Mock data uses `@example.com` (owner, 2026-11-16) | `grep -rnE '@mmlabs\.online' src` returns nothing. After `pnpm build`, `grep -rlE '@mmlabs\.online' dist` returns nothing; the smoke script asserts the same inside the image. Faker calls in `audit-logs.ts` and `reports.ts` use the `example.com` domain. |
| 7 | Production config baked in, CSP matches it (R5) | Smoke: the bundle in the image contains `https://api.mmlabs.online`, and the CSP `connect-src` is exactly `'self' https://api.mmlabs.online`. `release.yml` hard-codes the API URL and app key, and reads `VITE_TURNSTILE_SITE_KEY` from `vars`. A guard refuses an empty site key or a key that is not `0x…`. No `secrets.*` reaches `build-args`. |
| 8 | R8 green | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` all pass, with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` in the sandbox. |

**Fallback when no Docker daemon is reachable in the sandbox.** `/usr/bin/docker` exists, but the daemon may not run. The reviewer records which case applied.
1. Build with the production values and check `dist/`: `VITE_API_BASE_URL=https://api.mmlabs.online VITE_APP_KEY=admin pnpm build`, then:
   - `grep -rl 'https://api.mmlabs.online' dist/assets` finds at least one file;
   - `grep -rlE '@mmlabs\.online' dist` finds nothing;
   - `find dist -mindepth 1 \( -name '*.map' -o -name '.*' \)` finds nothing.
2. `bash -n scripts/smoke-image.sh`, plus `shellcheck scripts/smoke-image.sh` if it is installed.
3. Review `nginx/default.conf` and `nginx/security-headers.conf` statically against the "Smoke matrix", line by line:
   - every location that has its own `add_header` also has the `include`;
   - every `add_header` uses `always`;
   - the regex locations do not shadow `/assets/` hits.
   If `nginx` is installed, also run `nginx -t -p <tmp> -c <wrapper.conf>` with a tiny wrapper that has an `http {}` block including both files, after replacing `@API_ORIGIN@`.
4. Read the Dockerfile against Approach §2.
5. Mark the review as conditional: the PAN-022 PR's CI `image` job (the same build and `smoke-image.sh`) must be green before PASS is final. The orchestrator checks the PR's check runs after opening it.

## Files to create / modify

### Repo 1: admin-pan (`/home/user/admin-pan`, branch `ticket/PAN-022`)
| File | Change | Required because |
|---|---|---|
| `Dockerfile` | create | Multi-stage build: node build stage, then the nginx-unprivileged runtime stage (AC1) |
| `.dockerignore` | create | Keeps `.env*`, `.git`, `node_modules`, `dist`, `work/`, `.claude/`, `docs/` and test artifacts out of the build context, so no local env file is baked into the bundle (R5) |
| `nginx/default.conf` | create | Server config: SPA fallback, `/healthz`, caching, 404 and 405 rules (AC1) |
| `nginx/security-headers.conf` | create | One header snippet, included in every location (R6). The CSP holds the placeholder `@API_ORIGIN@`, rendered at build time |
| `scripts/smoke-image.sh` | create | The single smoke matrix, used by CI, `release.yml` and the reviewer (AC1, AC2, AC7) |
| `.github/workflows/release.yml` | create | Release flow that mirrors org-admin-api (AC2) |
| `.github/workflows/ci.yml` | modify: add an `image` job | Builds the image and smoke-tests it on every PR and push to main, so a broken Dockerfile or nginx config fails before a version tag is spent (consult architect R-5, appsec F) |
| `docs/deploy.md` | create | Runbook (AC3, AC4) |
| `docs/adr/0002-static-image-build-time-config.md` | create | Records decisions that outlive the ticket: an immutable static nginx image, `VITE_*` baked at build time (one image per environment), CSP `connect-src` rendered from the same build arg, headers owned by nginx |
| `.env.example` | modify: comments only | Says that release images bake `VITE_API_BASE_URL=https://api.mmlabs.online` and `VITE_APP_KEY=admin` in `release.yml`, with the site key from the repo variable `VITE_TURNSTILE_SITE_KEY`; see `docs/deploy.md`. No new keys |
| `README.md` | modify: one line | Links to `docs/deploy.md` ("Release and deploy") |
| `src/components/layout/data/sidebar-data.ts` | `admin@mmlabs.online` → `admin@example.com` | Owner: mock emails become `@example.com` |
| `src/components/profile-dropdown.tsx` | `admin@mmlabs.online` → `admin@example.com` | same |
| `src/features/dashboard/data/stats.ts` | `linh@`, `minh@`, `an@mmlabs.online` → `@example.com` | same |
| `src/features/apps/data/mock-data.ts` | `linh.tran@`, `minh.nguyen@`, `an.pham@mmlabs.online` → `@example.com` (lines 228–230, 313, 321–323). **Origins (`https://*.mmlabs.online`) stay unchanged**: they are not email addresses | same |
| `src/features/audit-log/data/audit-logs.ts` | faker `provider: 'mmlabs.online'` → `'example.com'` (line 23). The origins on line 221 stay | same |
| `src/features/reports/data/reports.ts` | template `…@mmlabs.online` → `…@example.com` (line 17) | same |
| `src/features/reports/components/reports-provider.tsx` | `CURRENT_USER_EMAIL = 'you@example.com'` | same |
| `src/features/reports/components/reports-test-fixtures.ts`, `src/features/reports/lib/csv.test.ts`, `src/features/audit-log/lib/format.test.ts`, `src/features/audit-log/components/audit-log-table.test.tsx` | test fixture emails → `@example.com` | Not shipped, but this keeps `grep '@mmlabs\.online' src` empty as a simple regression check (AC6). Origins in tests (`app-form-dialog.test.tsx`, `config.test.ts`) stay |

### Repo 2: mmlabs-online/deployment (`/home/user/deployment`)
The implementer creates two local branches from `main`, one commit each, with commit messages `admin-pan: add app folder and deploy workflow (PAN-022)` and `org-admin-api: allow Turnstile on admin-portal.mmlabs.online (PAN-022)`. The orchestrator pushes them and opens the two PRs. The owner reviews and merges. Nobody merges for him.

**PR A, branch `admin-pan-setup`** (setup; not `release/*`, because pr-scope would refuse a workflow or CODEOWNERS change on a release branch)
| File | Change | Required because |
|---|---|---|
| `apps/admin-pan/compose.yml` | create | The app folder (AC5) |
| `.github/workflows/deploy-admin-pan.yml` | create | Deploys on merge of a release PR (AC5) |
| `.github/CODEOWNERS` | add `/apps/admin-pan/  @didi-code0980` after the org-admin-api line | Repo convention: one line per app folder |

There is no `release.env`: the first release PR writes it, and until then deploy-admin-pan exits with its notice. There is no `proxy/` change: hostnames are set in the Cloudflare dashboard (`proxy/compose.yml` runs `cloudflared … --token`).

**PR B, branch `org-admin-api-turnstile-admin-portal`** (separate, owner-approved)
| File | Change | Required because |
|---|---|---|
| `apps/org-admin-api/compose.yml` | `TURNSTILE_ALLOWED_HOSTNAMES: '["ricotdin.mmlabs.online","ricotdin-staging.mmlabs.online","admin-portal.mmlabs.online"]'` | Without it, forgot-password tokens solved on our host are refused. The PR body must say that merging runs deploy-org-admin-api in full (backup, migrate as a no-op, replace) with the **same** pinned image |

Nothing in org-admin-api is changed; its doc drift goes to Follow-ups.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `scripts/smoke-image.sh` (the whole matrix below), run by CI job `image` and by `release.yml` | AC1, AC2, AC6, AC7: headers on every route class, SPA fallback, caching, 404/405, non-root, read-only runtime, baked config |
| Existing Vitest suite (`pnpm test`) | The email replacements break nothing. No new Vitest test: no logic changes in `src/` |

**Smoke matrix** (`scripts/smoke-image.sh <image-ref> <api-origin>`; `PORT` env var, default `18080`; uses `set -euo pipefail`, `curl` and `docker`. It records each failure, prints `ok <check>` or `FAIL <check>`, and exits 1 if anything failed. A `trap` always runs `docker rm -f`, and prints `docker logs` on failure. It never pulls; the caller pulls.)
1. `docker image inspect -f '{{.Config.User}}'` is not empty, `root` or `0`.
2. Run it the way production does: `docker run -d --name admin-pan-smoke --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -p 127.0.0.1:$PORT:8080 "$REF"`. Then poll `GET /healthz` for up to 30 s, until it answers 200 with body `ok`.
3. `GET /`:
   - 200 with `Content-Type: text/html`;
   - `Cache-Control: no-cache`;
   - header `Server` is exactly `nginx` (no version);
   - the CSP contains every one of these substrings: `default-src 'none'`, `script-src 'self' https://challenges.cloudflare.com`, `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, `font-src 'self' https://fonts.gstatic.com`, `connect-src 'self' <api-origin>;`, `frame-src https://challenges.cloudflare.com`, `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`, `form-action 'self'`;
   - the CSP does **not** contain `unsafe-eval` or `script-src 'self' 'unsafe-inline'`;
   - these headers are present: `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Permissions-Policy` (contains `camera=()`), `X-Robots-Tag: noindex, nofollow, noarchive`.
4. `GET /users` (deep link): 200, text/html, the body contains `<div id="root">`, the full header set, and `no-cache`.
5. `GET /reset-password`, `/verify-email`, `/forgot-password`: each 200, text/html, the full header set, and `Cache-Control: no-store`.
6. Real asset: take the first `/assets/*.js` path from the body of `/`. It returns 200 with a JavaScript content type, `Cache-Control: public, max-age=31536000, immutable`, and the full header set. This catches the `add_header` inheritance bug.
7. `GET /assets/does-not-exist.js` → 404 (not index.html). `GET /.env`, `/.git/config` and `/x.map` → 404 each.
8. `curl -X POST /` → 405.
9. Inside the container (`docker exec … sh -c`):
   - `grep -rl "<api-origin>" /usr/share/nginx/html/assets` finds something;
   - `grep -rlE '@mmlabs\.online' /usr/share/nginx/html` finds nothing;
   - `find /usr/share/nginx/html -name '*.map'` finds nothing.

Header checks are case-insensitive on header names and use `curl -sS -D - -o <body>`.

## Approach

### 1. Mock emails (do first; small)
Make the replacements in the file table. Then run `grep -rnE '@mmlabs\.online' src`, which must be empty, and `pnpm test`.

### 2. Dockerfile
1. `# syntax=docker/dockerfile:1`.
2. **Build stage** `FROM node:22-alpine@sha256:<digest> AS build`. Major 22 matches `.node-version`.
   - `WORKDIR /app`, `ENV CI=true PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.
   - `RUN npm install -g pnpm@10 --no-fund --no-audit`. Same major as CI's `pnpm/action-setup` `version: 10`; `package.json` has no `packageManager` field.
   - `COPY package.json pnpm-lock.yaml ./`, then `RUN pnpm install --frozen-lockfile`, then `COPY . .`.
   - `ARG VITE_API_BASE_URL`, `ARG VITE_APP_KEY`, `ARG VITE_TURNSTILE_SITE_KEY=`.
   - One `RUN` that does the following, in order.
     - Validate the args. Each value goes into the bundle or the nginx config, so validation prevents config injection.
       - `VITE_API_BASE_URL` must match `^https://[a-z0-9.-]+(:[0-9]{1,5})?$` (origin only, no trailing slash). Otherwise it fails with `VITE_API_BASE_URL must be an https origin`.
       - `VITE_APP_KEY` must match `^[a-z][a-z0-9-]*$`.
       - `VITE_TURNSTILE_SITE_KEY` must match `^[0-9A-Za-z_-]*$`; it may be empty, as in CI.
     - `pnpm build`.
     - Fail if `find dist -mindepth 1 \( -name '*.map' -o -name '.*' \)` prints anything.
     - Render the header snippet: `sed "s#@API_ORIGIN@#${VITE_API_BASE_URL}#g" nginx/security-headers.conf > /app/security-headers.conf`, then fail if `@API_ORIGIN@` is still present. Use sed, not envsubst: node:alpine has no gettext, and the value has already been validated.
3. **Runtime stage** `FROM nginxinc/nginx-unprivileged:<current stable>-alpine@sha256:<digest>`. It runs as uid 101, listens on 8080, keeps pid and temp files in `/tmp`, and ships busybox `wget` for the compose healthcheck.
   - `ENV NGINX_ENTRYPOINT_QUIET_LOGS=1`.
   - `USER root`.
   - `RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/*`.
   - `COPY --chown=root:root nginx/default.conf /etc/nginx/conf.d/default.conf`.
   - `COPY --from=build --chown=root:root /app/security-headers.conf /etc/nginx/snippets/security-headers.conf`.
   - `COPY --from=build --chown=root:root /app/dist /usr/share/nginx/html`.
   - `USER 101`, `EXPOSE 8080`.
   - No `/etc/nginx/templates` (no envsubst at start). No Dockerfile `HEALTHCHECK`: compose owns it, as for site and calechip.
4. Base image pins: use the tag and the `@sha256` digest. If the implementer cannot resolve digests in the sandbox, use tag-only pins, record it in `impl-log.md`, and add a follow-up (Dependabot `docker`). Never invent a digest.

### 3. nginx
`nginx/security-headers.conf` (exact values; the CSP is one line):
```nginx
add_header Content-Security-Policy "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' @API_ORIGIN@; frame-src https://challenges.cloudflare.com; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "no-referrer" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Resource-Policy "same-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), browsing-topics=()" always;
add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
```

`nginx/default.conf`. It is included inside the base image's `http {}`, so http-level directives are allowed here.
```nginx
server_tokens off;
log_format main_noquery '$remote_addr - [$time_local] "$request_method $uri $server_protocol" $status $body_bytes_sent "$http_user_agent"';

server {
  listen 8080;
  root /usr/share/nginx/html;
  autoindex off;
  charset utf-8;
  absolute_redirect off;
  port_in_redirect off;
  access_log /dev/stdout main_noquery;
  include /etc/nginx/snippets/security-headers.conf;

  if ($request_method !~ ^(GET|HEAD)$) { return 405; }

  location = /healthz { access_log off; default_type text/plain; return 200 "ok\n"; }
  location ~ /\.     { return 404; }
  location ~ \.map$  { return 404; }

  location /assets/ {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    try_files $uri =404;
  }
  location = /index.html {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "no-cache" always;
  }
  location ~ ^/(reset-password|verify-email|forgot-password)/?$ {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "no-store" always;
    try_files /index.html =404;
  }
  location / {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "no-cache" always;
    try_files $uri /index.html;
  }
}
```
Notes for the implementer:
- `try_files $uri /index.html` redirects internally to `location = /index.html`, so it gets `no-cache`.
- The token routes serve `/index.html` in place, so they get `no-store`.
- The `/healthz` location has no `add_header` of its own, so it inherits the server-level headers.
- If the smoke test shows the base image's entrypoint failing on a read-only filesystem, fix it in the Dockerfile and record it. Do not drop `--read-only` from the smoke run.

### 4. `.github/workflows/release.yml` (copy org-admin-api's file; only these deltas)
- Header comment: admin-pan wording, the secrets list, the repo variable, the Environment, and a pointer to `docs/deploy.md`.
- `permissions: {}` at the top level, `permissions: contents: write` on the job (only the tag push needs it). `concurrency: release`.
- `env: APP: admin-pan`, `IMAGE: mingming21400/admin-pan`, `API_BASE_URL: https://api.mmlabs.online`, `APP_KEY: admin`. Values are hard-coded per owner decision; they are public (R5).
- The job sets `environment: release`, so the three secrets live in a GitHub Environment limited to `release/v*` branches (consult appsec D).
- The guards step also checks `TURNSTILE_SITE_KEY: ${{ vars.VITE_TURNSTILE_SITE_KEY }}`. It must be non-empty and match `^0x[A-Za-z0-9_-]{10,}$`, which refuses Cloudflare's `1x…/2x…/3x…` test keys. Otherwise it fails with `::error::repository variable VITE_TURNSTILE_SITE_KEY is empty or not a production site key (see docs/deploy.md, One-time setup)`. `sort -V` stays as in org-admin-api: this repo is not scanned by volume-safety.
- `docker/build-push-action@v6`:
  - `platforms: linux/amd64`, `push: true`;
  - `tags: ${{ env.IMAGE }}:${{ steps.version.outputs.tag }}`;
  - `build-args`: `VITE_API_BASE_URL=${{ env.API_BASE_URL }}`, `VITE_APP_KEY=${{ env.APP_KEY }}`, `VITE_TURNSTILE_SITE_KEY=${{ vars.VITE_TURNSTILE_SITE_KEY }}`;
  - **no** `cache-from/cache-to: type=gha` (consult appsec D: no cache poisoning in the release path; the build is fast).
- Smoke step: `docker pull "$REF"`, then `bash scripts/smoke-image.sh "$REF" "$API_BASE_URL"`, with `REF=$IMAGE@$DIGEST`. If it fails, no PR is opened.
- Deployment PR step:
  - writes `ADMIN_PAN_IMAGE=$IMAGE:$TAG@$DIGEST` and `ADMIN_PAN_VERSION=$TAG`, and runs `git add "apps/$APP/release.env"` only;
  - branch `release/$APP-$TAG`;
  - body: "Deploys `…` (commit link). Merging runs deploy-admin-pan on the home server: pull, replace, health check."
- Keep the action refs exactly as org-admin-api has them (`actions/checkout@v4`, `docker/*@v3/v6`). SHA pinning is a follow-up (see Specialist input).

### 5. `.github/workflows/ci.yml`: add job `image`
A job separate from `check`: `runs-on: ubuntu-latest`, `timeout-minutes: 20`. Steps:
1. `actions/checkout@v4`.
2. `docker/setup-buildx-action@v3`.
3. `docker/build-push-action@v6` with `context: .`, `load: true`, `push: false`, `platforms: linux/amd64`, `tags: admin-pan:ci`, and build-args `VITE_API_BASE_URL=https://api.mmlabs.online` and `VITE_APP_KEY=admin`. No site key: CI does not need Turnstile, and repo variables may be missing on fork PRs.
4. `run: bash scripts/smoke-image.sh admin-pan:ci https://api.mmlabs.online`.

The `check` job stays unchanged.

### 6. Deployment repo (PR A)
`apps/admin-pan/compose.yml`, shaped like `apps/site/compose.yml` plus the hardening from `apps/tudocuatui`:
- **Header comment:**
  - "admin-pan (mmlabs-online/admin-pan) on the home server, project `admin-pan`. Public hostname admin-portal.mmlabs.online -> http://admin-pan:8080 (set in the Cloudflare dashboard, like the other apps; no Cloudflare Access, owner 2026-11-16)."
  - release.env provenance (`ADMIN_PAN_IMAGE=mingming21400/admin-pan:vX.Y.Z@sha256:<digest>`, `ADMIN_PAN_VERSION=vX.Y.Z`).
  - The manual command `docker compose -p admin-pan -f apps/admin-pan/compose.yml --env-file apps/admin-pan/release.env up -d --wait`.
  - "Static nginx (non-root) on :8080, read-only, no ports, no secrets, no volumes; every VITE_* value is baked into the image."
- `name: admin-pan`; service `admin-pan`:
  - `image: ${ADMIN_PAN_IMAGE:?ADMIN_PAN_IMAGE is unset - pass --env-file apps/admin-pan/release.env}`, `restart: unless-stopped`;
  - `read_only: true`, `tmpfs: [/tmp]`, `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`;
  - logging json-file `max-size: 10m`, `max-file: "3"`;
  - healthcheck `["CMD", "wget", "-q", "--spider", "http://127.0.0.1:8080/healthz"]`, interval 5s, timeout 3s, start_period 5s, retries 3;
  - `networks: [tunnel]`. No ports, no volumes, no `db` network.
- `networks: tunnel: external: true, name: web`, with the same comment as site.

`.github/workflows/deploy-admin-pan.yml` is a copy of `deploy-site.yml` with only these deltas:
- name, header comment, `paths: ['apps/admin-pan/**']`, `concurrency: deploy-admin-pan`, `APP_DIR: apps/admin-pan`, `PROJECT: admin-pan`;
- `if: github.ref == 'refs/heads/main'` on the job, `runs-on: [self-hosted, macbook-runner]`;
- pattern `^mingming21400/admin-pan:v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?@sha256:[0-9a-f]{64}$`, reading `ADMIN_PAN_IMAGE`;
- the `ADMIN_PAN_VERSION` match check, copied from deploy-org-admin-api;
- messages that say admin-pan; the `### deploy-admin-pan` summary and comment prefix;
- `actions/checkout@v7`, as in every workflow in that repo;
- no `-V`, `sort -V` or `down -v`.

Keep the TODO-operator check and the rollback and notify steps as they are.

### 7. `docs/deploy.md` (runbook; follows the shape of org-admin-api `docs/deploy.md`)
- **Flow:** a diagram like org-admin-api's: push `release/vX.Y.Z` → release.yml (guards, tag, build `mingming21400/admin-pan:vX.Y.Z` linux/amd64, smoke, PR `release/admin-pan-vX.Y.Z` that changes only `apps/admin-pan/release.env`) → owner merges → deploy-admin-pan (check release.env, pull, `up -d --wait`, health; on failure, restore the previous release and push the revert). A note: the first release has no previous one, so a failed v0.1.0 is a red `no-previous` run.
- **Release a version:** `git fetch origin && git push origin origin/main:refs/heads/release/vX.Y.Z`, or the GitHub branch dropdown. Never commit to a release branch. A failed run still uses up its version (the tag is pushed first), so pick the next patch.
- **What is in the image:**
  - baked config (API origin, app key `admin`, site key from the repo variable). One image per environment (ADR 0002);
  - the header table and the full CSP, with the reason for each external origin (Turnstile; Google Fonts, owner 2026-11-16; the API);
  - the caching rules, `/healthz`, non-root, read-only.
- **One-time setup (owner):** values come from the owner's own accounts; none are written in the repo. In order:
  1. Docker Hub: create the repository `mingming21400/admin-pan`, **public**.
  2. admin-pan repo, Settings → Environments → create `release`. Deployment branches: selected, pattern `release/v*`. Required reviewer: optional, the owner's choice.
     - Add these Environment secrets: `DOCKERHUB_USERNAME`; `DOCKERHUB_TOKEN` (a Docker Hub access token with Read & Write, not Admin); `DEPLOY_REPO_TOKEN` (a fine-grained PAT on `mmlabs-online/deployment` only, Contents read/write and Pull requests read/write, with an expiry date).
     - Warn: this token can read every committed secret in the deployment repo (that repo's README, "Secrets").
  3. admin-pan repo, Settings → Variables → Actions → repository variable `VITE_TURNSTILE_SITE_KEY`. Its value is the site key of the **same** Turnstile widget whose secret org-admin-api holds (`ORG_ADMIN_TURNSTILE_SECRET_KEY` in the deployment repo's `org-admin-api` Environment), copied from the Cloudflare dashboard.
  4. Optional: repository rulesets so only the owner can create `release/v*` branches and `v*` tags.
  5. Merge deployment PR A (admin-pan setup). deploy-admin-pan runs and skips with "No apps/admin-pan/release.env yet".
  6. Merge deployment PR B (`TURNSTILE_ALLOWED_HOSTNAMES`). It redeploys org-admin-api with the same image; check `https://api.mmlabs.online/readyz`.
  7. Cloudflare → Turnstile → the widget used by org-admin-api → Hostname management: add `admin-portal.mmlabs.online`.
  8. Cloudflare Zero Trust → Networks → Tunnels → the mmlabs tunnel → Public hostnames: add `admin-portal.mmlabs.online` → `HTTP` → `admin-pan:8080`. No Access application (owner, 2026-11-16).
     - For this hostname, keep Rocket Loader, Email Obfuscation, automatic Web Analytics injection and Zaraz **off**: they inject inline scripts that the CSP blocks.
     - Add no "Cache Everything" rule.
  9. After the PAN-022 PR is merged: push `release/v0.1.0`, merge the release PR it opens, and check `https://admin-portal.mmlabs.online/healthz`.
  10. Origin registration (next section).
- **Origin registration (app `admin`):**
  - Prerequisite: the deployed org-admin-api release includes ADM-002c, and `ops-org-admin-api` lists `set-admin-origins`.
  - Steps: deployment repo → Actions → `ops-org-admin-api` → Run workflow on `main` → command `set-admin-origins`, origins `https://admin-portal.mmlabs.online` (no trailing slash, no wildcard), `dry_run` on → approve `org-admin-api-ops` → read the summary.
    - The `origins:` line shows the current set. The command **replaces** the set (at most 2). If another origin must stay, list both.
    - Check `+ origin https://admin-portal.mmlabs.online`, then run again with `dry_run` off. The API applies it within 60 s.
  - Fallback on the Mac: the command from org-admin-api docs/deploy.md "Set admin origins", with `--origin https://admin-portal.mmlabs.online`.
  - Note that org-admin-api's "Host policy" still names `admin.mmlabs.online` (a follow-up there). Do not create DNS or a route for `admin.mmlabs.online`.
- **Verify after deploy:**
  - `curl -sI https://admin-portal.mmlabs.online/` and `…/reset-password`: all headers from the table are present, and Cloudflare did not strip or change them.
  - `curl -s -o /dev/null -w '%{http_code}' https://admin-portal.mmlabs.online/assets/nope.js` returns 404.
  - In a browser: the sign-in page renders with fonts and the console shows no CSP violations. `/forgot-password` renders the Turnstile widget and submits; the email arrives, and its link starts with `https://admin-portal.mmlabs.online/reset-password#token=`.
  - If Turnstile fails only because of the CSP, record a follow-up. Do not loosen the CSP by hand.
- **Rollback / redeploy / break-glass:**
  - Rollback: revert the release PR's commit in the deployment repo; merging the revert redeploys the previous `release.env`.
  - Redeploy: Actions → deploy-admin-pan → Run workflow on main.
  - Take the site offline: remove the tunnel public hostname.
  - Stop admin token issuance: `set-admin-origins` with `clear`.
- **Troubleshooting:**
  - forgot-password 403 `origin_not_allowed` → origin not registered, or still inside the 60 s delay.
  - `turnstile_failed` → hostname missing in the widget or in `TURNSTILE_ALLOWED_HOSTNAMES`.
  - "Verification is not configured" → empty site key variable.
  - "Could not reach the server" → CSP `connect-src` and the API origin disagree (check the smoke output).

### Rules
- **R1:** no server code; nginx only serves files.
- **R2/R3:** untouched. No new HTTP code. The token stays in memory.
- **R5:** only public `VITE_*` values, baked from explicit build args. `.dockerignore` keeps local `.env*` out. Secrets are used only by docker login and the PR step, never as build args.
- **R6:** headers in nginx, on every route class, checked by the smoke test.
- **R7:** only the files listed. Everything else goes to Follow-ups.
- **R8:** all checks green, plus the CI `image` job.
- **R11:** no new features.

## Specialist input used
- **software-architect**
  - Adopted:
    - R-1: multi-stage build, nginx-unprivileged on 8080, no runtime envsubst, `.dockerignore`.
    - R-2: `/healthz`, the `/assets/` 404, the `add_header` repetition.
    - R-3: build-time config.
    - R-4: release.yml deltas, `ADMIN_PAN_*` names.
    - R-5: smoke checks, docker build in CI.
    - R-6: PR A shape, the branch not named `release/*`, no `sort -V`, CODEOWNERS.
    - R-7: separate PR B (now owner-approved).
    - R-8: origin registration order.
    - R-9: runbook shape.
  - Port: 8080 (architect open question 2). Nothing else forces 3000, and it is the unprivileged default.
  - The optional `/version.txt` is not adopted: no requirement asks for it.
  - Superseded by owner decisions: the open questions on the image name and visibility, the real forgot/reset/verify flows, and the banner.
- **appsec-engineer**
  - Adopted:
    - A: the header snippet, `default-src 'none'`, HSTS without preload, no COEP, the token routes with `no-store`, dotfile and `.map` 404s, the 405 for other methods, the query-free access log.
    - C: image hardening and read-only compose.
    - D: `permissions: {}` at the top level, `environment: release`, variables for `VITE_*`, no gha cache, the smoke matrix.
    - E: PR A and PR B.
    - F: the image test in CI.
    - Mock emails → `@example.com` (owner confirmed).
  - Changed by owner decision:
    - B (self-host fonts) is rejected. Google Fonts are kept and allowed in `style-src` and `font-src`.
    - G (demo banner, sign-in text, redirect validation) is rejected for this ticket. Redirect validation stays with PAN-010.
  - Deferred to follow-ups, not adopted here:
    - SHA-pinning of actions and Dependabot. Not adopted because `release.yml` must mirror org-admin-api, CI's existing actions would also change, and the implementer cannot verify SHAs offline. Inventing them is worse than tag refs.
    - `pnpm audit` in CI: a CI policy change with known advisories that needs the owner's sign-off.
    - `provenance`/`sbom`: builder defaults are kept.

## Assumptions
- The Cloudflare tunnel forwards to `http://admin-pan:8080` on the `web` network. The container name and alias come from the compose service name, as for the other apps.
- The `release` GitHub Environment is acceptable friction (appsec open question 5). The required reviewer is left as the owner's choice in the runbook. If the owner prefers repo-level secrets, removing the `environment:` line is the only change.
- The deployed org-admin-api includes ADM-002c. The ops workflow already offers `set-admin-origins`. The runbook makes this a prerequisite check, not something this ticket assumes silently.
- Turnstile needs no `connect-src https://challenges.cloudflare.com`: the widget's requests run inside its iframe (appsec A). The post-deploy check in the runbook confirms it. A failure becomes a follow-up, not a hand edit.
- Mock **origins** under `*.mmlabs.online`, including `https://admin.mmlabs.online` for app `admin` in `apps/data/mock-data.ts`, are not "addresses" in the owner's sense and stay unchanged.
- The scope is about 700 changed lines in admin-pan (mostly config, the shell script and the runbook) plus about 180 in the deployment repo. That is over the ~500-line guide, but it is one spec feature (§6.1) with no screen and no logic. Splitting would ship an image without its release flow, or a release flow without its deploy target. So there is no split.

## Blocking questions
None.

## Split proposal
None.

## Screens
None. The UI is unchanged, apart from the mock email strings.

## API calls used
None added or changed. The existing public flows (`/forgot-password`, `/reset-password`, `/verify-email`, PAN-012/012b) go live because the image is built with `VITE_API_BASE_URL=https://api.mmlabs.online` and `VITE_APP_KEY=admin` (owner, 2026-11-16). They depend on the owner steps in the runbook: the origin on app `admin`, the Turnstile widget hostname, and PR B.

## Follow-ups (record in impl-log; not in this diff)
1. **org-admin-api:** update `docs/deploy.md` "Host policy" and the `set-admin-origins` examples from `admin.mmlabs.online` to `admin-portal.mmlabs.online`, and state that `admin.mmlabs.online` must have no DNS record or route.
2. **admin-pan CI/release:** SHA-pin all actions and add Dependabot (`github-actions`, `npm`, `docker`); add `pnpm audit --prod` with an owner-approved allowlist. Pin base image digests here if they were not pinned in this ticket.
3. **deployment:** SHA-pin `actions/checkout@v7` on the self-hosted runner, and pin `cloudflare/cloudflared:latest`. Move the committed tunnel token out of `proxy/compose.yml` and rotate it (appsec).
4. **PAN-010:** validate the sign-in `redirect`, drop the hash from the 401 redirect, and remove the mock sign-in. Its acceptance criteria should include that.
5. **admin-pan mock data:** the app `admin` mock origin still shows `https://admin.mmlabs.online`. Align it with `admin-portal` when that screen moves to the real API.
6. Template leftover `public/images/shadcn-admin.png`, and `@faker-js/faker` in the production bundle (size only).
