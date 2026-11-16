# PAN-022 consult: software-architect (admin-pan mode)

## Findings

**Deployment repo (`/home/user/deployment`)**
1. A static frontend is set up the same way each time. `apps/site/compose.yml` and `apps/calechip/compose.yml` each define one service: image `${X_IMAGE:?…}` read from `release.env`, `restart: unless-stopped`, a `wget --spider` healthcheck on `127.0.0.1:<port>`, only the external `web` network (called `tunnel`), and no ports, volumes or secrets. `apps/tudocuatui/compose.yml` adds settings we should copy: `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`, and json-file logging capped at 10m x 3.
2. Deploy workflow: `deploy-site.yml` is the right template because it has no env file and no migrate step. Its steps are: check the `release.env` regex, then `config`, `pull`, `up -d --wait`, roll back to the previous `release.env` on an unhealthy start and push the revert, then comment on the PR. If there is no `release.env`, it exits with a notice and deploys nothing. Newer workflows (org-admin-api, tudocuatui) add `if: github.ref == 'refs/heads/main'`, `runs-on: [self-hosted, macbook-runner]`, a strict `vX.Y.Z` pattern and a check that `*_VERSION` matches the image tag. deploy-site lacks these, so take them from the newer workflows.
3. There is no tunnel route file to change. `proxy/compose.yml` runs `cloudflared … run --token`, so public hostnames are set in the Cloudflare dashboard, as `apps/org-admin-api/compose.yml` line 2 says ("set in the Cloudflare dashboard, like the other apps"). The "proxy/tunnel route" acceptance criterion is a dashboard step for the owner plus a comment in our compose file. No file goes in `proxy/`.
4. `pr-scope.yml` applies only to head refs matching `^release/([a-z0-9-]+)-(v[0-9]|sha-…)`. Those PRs may change only `apps/<app>/`. With `APP=admin-pan`, the release PR `release/admin-pan-vX.Y.Z` may touch only `apps/admin-pan/`. The setup PR must not use a `release/…` branch name, because it also adds a workflow and a CODEOWNERS line.
5. `volume-safety` greps `.github/workflows`, `apps`, `proxy`, `ops`, `postgres` and `pgadmin` for `down … -v`, `--volumes`, `volume rm|prune`, `--renew-anon-volumes` and a standalone `-V`. The `-V` pattern catches `sort -V`. org-admin-api's `release.yml` uses `sort -V`, which is fine there, but it must not be copied into `deploy-admin-pan.yml`.
6. `CODEOWNERS` has one line per app folder (`/apps/<app>/ @didi-code0980`).
7. There is a conflict with org-admin-api:
   - `apps/org-admin-api/compose.yml` hard-codes `TURNSTILE_ALLOWED_HOSTNAMES: '["ricotdin.mmlabs.online","ricotdin-staging.mmlabs.online"]'`, so a Turnstile token solved on `admin-portal.mmlabs.online` will be refused.
   - The API holds one Turnstile secret (`ORG_ADMIN_TURNSTILE_SECRET_KEY`), so admin-pan must use the site key of that same widget, with our hostname added to the widget.
   - `ops-org-admin-api.yml` already has `set-admin-origins` (with dry_run and clear), so origin registration is an ops run, not code.

**org-admin-api release flow** (`/home/user/org-admin-api/.github/workflows/release.yml`, `docs/deploy.md`)
8. The flow, in order:
   - Trigger: push of `release/v*`.
   - Guards: the commit is on main, the commit is not already tagged, the version is valid semver and higher than the last tag, and the secrets are non-empty.
   - The tag is created and pushed before the build, which reserves the version.
   - buildx `linux/amd64` with gha cache, then push.
   - Smoke test: run the pushed image by digest and poll a health URL. If it fails, no PR is opened.
   - Clone deployment with `DEPLOY_REPO_TOKEN`, write only `apps/<APP>/release.env` (`*_IMAGE=img:tag@digest`, `*_VERSION=tag`), then `gh pr create`.
9. `docs/deploy.md` "Host policy" (around lines 503–506) reserves **`https://admin.mmlabs.online`** for the admin UI, and all its `set-admin-origins` examples use that host. The owner chose **`admin-portal.mmlabs.online`** (spec §6.1). The org-admin-api docs are now stale. We cannot edit that repo, so this is a follow-up for org-admin-api.

**admin-pan (`/home/user/admin-pan`)**
10. The build reads `VITE_API_BASE_URL`, `VITE_APP_KEY` and `VITE_TURNSTILE_SITE_KEY` (`src/api/config.ts`, `src/components/turnstile.tsx`). `parseApiBaseUrl` throws when the value is missing, and in production it requires https. "Mock mode" therefore does not mean "no API URL". The real public flows from PAN-012/012b (`/forgot-password`, `/reset-password`, `/verify-email`) are live code. Forgot-password sends `X-MM-App` and needs an `Origin` registered on the `admin` app (403 `origin_not_allowed` otherwise). The links in the emails are built from the validated Origin (`{Origin}/reset-password#token=…`), and the token sits in the fragment, so nginx never logs it.
11. Sign-in is a mock (`user-auth-form.tsx`): it accepts any email and password, stores `'mock-access-token'` in memory, and sends nothing to the network.
12. External origins used at runtime:
    - `https://challenges.cloudflare.com` (Turnstile script and iframe)
    - `https://fonts.googleapis.com` / `https://fonts.gstatic.com` (`index.html`)
    - the API origin
    - Radix, recharts and sonner set inline `style` attributes.
    - `index.html` has no inline scripts and already sets `noindex` and `referrer=no-referrer`.
13. CI uses Node from `.node-version` (`22`) and pnpm 10. `package.json` has no `packageManager` field. `@faker-js/faker` is a devDependency but is imported by mock data, so it ends up in the bundle (size only; harmless). Mock data shows internal app names and origins (`spacem`, `seatmgt`, `surveyai.app`, …).

## Recommendations

**R-1. Image shape** (AC1; R5, R6)
- Multi-stage Dockerfile. Build stage: `node:22-alpine` (matches `.node-version`), `corepack enable` with an exact pnpm 10.x pin (same major as `ci.yml`), copy the lockfile, `pnpm install --frozen-lockfile`, copy the source, `pnpm build`.
- Runtime stage: `nginxinc/nginx-unprivileged:<stable>-alpine`. It is non-root (uid 101), listens on 8080 and includes busybox `wget` for the healthcheck. Pin both base images to a tag, and ideally to a digest. Copy only `dist/` and the nginx config.
- Do not use the official image's `/etc/nginx/templates` envsubst at startup. It needs a writable config directory and would make the image differ from what the smoke test checked.
- Add a `.dockerignore` excluding `node_modules`, `dist`, `.git`, `work/`, `coverage`, test artifacts and **every `.env*` except `.env.example`**. Otherwise a developer's `.env.local` or `.env.production` would silently be baked into the bundle.
- A Dockerfile `HEALTHCHECK` is optional. The compose healthcheck is the one the deploy relies on, as for site and calechip.

**R-2. nginx config** (AC1; R6)
- `server_tokens off`, `absolute_redirect off`, `port_in_redirect off` (TLS ends at Cloudflare).
- `location = /healthz` returns 200 `ok` with `access_log off`.
- `location /assets/`: `try_files $uri =404`, `Cache-Control: public, max-age=31536000, immutable`. A missing chunk must return 404, not index.html; with `nosniff`, an HTML fallback gives confusing MIME errors after a deploy.
- `location /`: `try_files $uri /index.html`, with `Cache-Control: no-cache` on index.html. This is the SPA fallback that `/reset-password` and `/verify-email` email links depend on.
- Security headers in one `include security-headers.conf` repeated in **every** location that has its own `add_header`, all with `always`. nginx drops inherited `add_header` as soon as a location sets one; this is the usual way the CSP silently disappears from index.html.
  - `Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' <API_ORIGIN>; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`
  - `Referrer-Policy: no-referrer`
  - `X-Content-Type-Options: nosniff`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Strict-Transport-Security: max-age=31536000` (harmless behind Cloudflare)
- Write `<API_ORIGIN>` into the CSP at **build time** from the same build arg as `VITE_API_BASE_URL` (envsubst in the build stage), so the bundle and the CSP cannot disagree.

**R-3. VITE_* config: bake at build time, no runtime config** (AC2; R5)
- All three values are public, there is one environment, and baking keeps the image immutable, read-only and identical to what was smoke-tested.
- Runtime config (`/config.js` generated at container start, or calechip's `/version.json`) would add an entrypoint, a writable filesystem and a fetch before boot, for a staging need we do not have.
- Trade-off: the image is tied to one environment, and a future staging needs its own build. That is reversible later.
- In `release.yml`, pass build args `VITE_API_BASE_URL=https://api.mmlabs.online`, `VITE_APP_KEY=admin` and `VITE_TURNSTILE_SITE_KEY`, for example from **repository Variables** (`vars.*`, not secrets, since they are public).
- Add a guard step that fails the run when any of them is empty, like the existing secret guards.

**R-4. `release.yml`** (AC2): copy org-admin-api's file line for line, changing only the following.
- `APP: admin-pan`. The image name is suggested as `IMAGE: mingming21400/admin-pan` (needs owner confirmation; see Open question 1).
- The VITE build args, and `platforms: linux/amd64`.
- `release.env` contents: `ADMIN_PAN_IMAGE=$IMAGE:$TAG@$DIGEST` and `ADMIN_PAN_VERSION=$TAG`, with `git add` on that file only (pr-scope).
- Optional: bake `$TAG` into a static `/version.txt` so the deployed version can be checked.
- PR body: "Merging runs deploy-admin-pan on the home server."

**R-5. Smoke test** (AC2): run the pushed digest the way production runs it: `docker run -d --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -p 127.0.0.1:8080:8080 "$IMAGE@$DIGEST"`. Then check:
- the image user is not root (`docker inspect -f '{{.Config.User}}'`);
- `/healthz` returns 200;
- `/` returns 200 with `Content-Security-Policy` containing `frame-ancestors 'none'` and the API origin, plus `Referrer-Policy` and `nosniff`;
- `/reset-password` returns 200 and the index.html body (SPA fallback), and still carries the CSP header (catches the add_header problem);
- `/assets/does-not-exist.js` returns 404;
- the bundle contains `https://api.mmlabs.online` (`docker exec … grep -rl`).

If any check fails, no deployment PR is opened. Also run `docker build` in `ci.yml`, or as a step of this smoke test on PRs, so a broken Dockerfile fails before a version tag is spent. This is optional and must stay inside the plan.

**R-6. Deployment-repo setup PR** (AC5): branch name not matching `release/*`, e.g. `admin-pan-setup`. Files:
- `apps/admin-pan/compose.yml`:
  - `name: admin-pan`; service `admin-pan`; `image: ${ADMIN_PAN_IMAGE:?ADMIN_PAN_IMAGE is unset - pass --env-file apps/admin-pan/release.env}`; `restart: unless-stopped`.
  - `read_only: true`, `tmpfs: [/tmp]`, `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`, json-file logging 10m x 3.
  - healthcheck `wget -q --spider http://127.0.0.1:8080/healthz` (5s/3s/5s/3, like site).
  - `networks: [tunnel]` (external `web`), no ports, no volumes, no `db` network.
  - Header comment in the site/org-admin-api style: release.env provenance, the manual command, and "Public hostname admin-portal.mmlabs.online -> http://admin-pan:8080 (set in the Cloudflare dashboard)".
- `.github/workflows/deploy-admin-pan.yml`: deploy-site's steps with org-admin-api's hardening:
  - `if: github.ref == 'refs/heads/main'`, `runs-on: [self-hosted, macbook-runner]`;
  - pattern `^mingming21400/admin-pan:v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?@sha256:[0-9a-f]{64}$` and the `ADMIN_PAN_VERSION` match check;
  - `paths: ['apps/admin-pan/**']`, concurrency group `deploy-admin-pan`, the same rollback and notify steps;
  - nothing that trips volume-safety (no `-V`).
- `.github/CODEOWNERS`: add `/apps/admin-pan/  @didi-code0980`.
- No `release.env`. The first release PR writes it, and until then deploy-admin-pan skips with its notice.
- No `proxy/` change. A README table entry is optional.

**R-7. Turnstile hostname as its own PR.** Adding `admin-portal.mmlabs.online` to `TURNSTILE_ALLOWED_HOSTNAMES` in `apps/org-admin-api/compose.yml` (forgot-password, AC4/AC5) belongs in a **separate** deployment PR. Merging anything under `apps/org-admin-api/**` runs deploy-org-admin-api in full (backup, migrate, replace) with the same image. Bundling it with the admin-pan setup PR would mix responsibilities. Offer it only with the owner's approval.

**R-8. Origin registration runbook** (AC4, in admin-pan `docs/deploy.md`). Order matters, so the origin is never trusted while nobody serves it:
1. Owner merges the setup PR.
2. Owner adds the tunnel hostname `admin-portal.mmlabs.online` → HTTP → `admin-pan:8080`, with no Access app (owner decision 2026-11-16).
3. Push `release/v0.1.0` and merge the release PR it opens; `https://admin-portal.mmlabs.online/healthz` answers 200.
4. In the deployment repo: Actions → `ops-org-admin-api` → `set-admin-origins`, origins `https://admin-portal.mmlabs.online`, `dry_run` on first, approve `org-admin-api-ops`, check the `+ origin` line, then run with `dry_run` off.
5. Wait 60 s, then test `/forgot-password` end to end.

Note in the runbook that `set-admin-origins` replaces the whole set (at most 2). Record a follow-up for org-admin-api to update its "Host policy" and its examples from `admin.mmlabs.online` to `admin-portal.mmlabs.online`, and to keep `admin.mmlabs.online` without any DNS record or route.

**R-9. Runbook `docs/deploy.md`** (AC3), in the shape of org-admin-api's: the flow diagram, how to release (branch from main, never commit to it), the one-time owner setup listed under Open questions, rollback (revert the release PR in deployment), and the smoke check after deploy. Check the headers with `curl -sI https://admin-portal.mmlabs.online/reset-password`, which confirms Cloudflare did not strip or change them.

## Risks
1. **Mock sign-in on a public mmlabs host.** It looks like a real Identity login, accepts anything and opens a full admin UI. Staff may type real passwords; nothing is sent, but it trains bad habits and looks like phishing. A "Preview: simulated sign-in, mock data, do not enter your real password" banner is advisable, but that is a UI change outside this ticket (R7), so it needs an owner decision.
2. **A registered admin origin raises the stakes of XSS.** Any script that runs on `admin-portal.mmlabs.online` can drive the admin login flow. The CSP (R-2) and Cloudflare edge settings are the main protections. Cloudflare Rocket Loader, Email Obfuscation, Web Analytics auto-injection and Zaraz inject inline scripts: either the CSP blocks them, or someone loosens the CSP to make them work. Keep them off for this hostname.
3. **nginx `add_header` inheritance**: the CSP quietly missing on some routes. The smoke checks in R-5 cover it.
4. **Forgot-password depends on changes in another repo.** It is broken until the Turnstile widget hostname, `TURNSTILE_ALLOWED_HOSTNAMES` (an org-admin-api redeploy) and origin registration are all done. Reset and verify only need the origin, because the email links are built from the origin.
5. **Build-context leakage**: a local `.env.production` or `.env.local` baked into a release. `.dockerignore` and the explicit build args with the empty-value guard prevent it.
6. **Version burn**: the tag is pushed before the build, so a failed run consumes the version. This is the accepted org-admin-api pattern. A docker build in CI (R-5) makes it rarer.
7. **First deploy has no rollback**: with no earlier release, a failed v0.1.0 ends as a red "no-previous" run. That is expected and should be documented.
8. **Information exposure in the public mock data**: it lists internal app names and origins. Low impact, but it is public; owner to accept.

## Open questions (owner)
1. Docker Hub repository name: `mingming21400/admin-pan` is suggested. Public or private? Private only works if the Mac's Docker is logged in, as it is for the other private images.
2. Container port: 8080 (the unprivileged nginx default) or 3000 to match site and calechip? Either works; it must match the tunnel target and the healthcheck.
3. Should the public release turn on the real forgot, reset and verify pages? That means registering the admin origin now, adding the hostname to the Turnstile widget, and the separate `TURNSTILE_ALLOWED_HOSTNAMES` PR (R-7). If not, those pages will show errors (403 or "Verification is not configured").
4. Is an origin registered on `admin` today? `set-admin-origins` replaces the whole set. Does the deployed org-admin-api (v0.1.5) include ADM-002c?
5. Add a preview banner to the mock sign-in (Risk 1)? That would be a separate ticket.

**Settings the owner must create (no values invented here):**
- admin-pan repo **Secrets**: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` (push to the chosen Docker Hub repository), `DEPLOY_REPO_TOKEN` (fine-grained PAT on `mmlabs-online/deployment` only: Contents read/write, Pull requests read/write, the same kind org-admin-api uses).
- admin-pan repo **Variables**: `VITE_TURNSTILE_SITE_KEY` (site key of the widget whose secret org-admin-api holds). Optionally also `VITE_API_BASE_URL` and `VITE_APP_KEY`, or hard-code those two in `release.yml`.
- Docker Hub: create the repository.
- Cloudflare: tunnel public hostname `admin-portal.mmlabs.online` → `http://admin-pan:<port>`; add the hostname to the Turnstile widget; keep CSP-breaking edge features off for this hostname.
- Deployment repo: run `set-admin-origins` (needs the `org-admin-api-ops` environment, which already exists per the org-admin-api runbook).

Files read: `/home/user/admin-pan/work/tickets/PAN-022/ticket.md`, `/home/user/admin-pan/docs/spec-v1.md`, `/home/user/admin-pan/src/api/config.ts`, `/home/user/admin-pan/index.html`, `/home/user/deployment/apps/site/compose.yml`, `/home/user/deployment/apps/tudocuatui/compose.yml`, `/home/user/deployment/apps/org-admin-api/compose.yml`, `/home/user/deployment/.github/workflows/deploy-site.yml`, `/home/user/deployment/.github/workflows/pr-scope.yml`, `/home/user/deployment/ops/check-volume-safety.sh`, `/home/user/deployment/.github/workflows/ops-org-admin-api.yml`, `/home/user/deployment/.github/CODEOWNERS`, `/home/user/org-admin-api/.github/workflows/release.yml`, `/home/user/org-admin-api/docs/deploy.md`.
