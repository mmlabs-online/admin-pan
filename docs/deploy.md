# Deploy runbook (PAN-022)

admin-pan is a static site served by nginx at **https://admin-portal.mmlabs.online** (owner,
2026-11-16) through the shared Cloudflare Tunnel on the mmlabs home server (Mac, self-hosted runner
`macbook-runner`). How it runs is defined in `mmlabs-online/deployment` (`apps/admin-pan/`,
`.github/workflows/deploy-admin-pan.yml`). Only the owner merges in either repository. The first
release is public and holds the mock-data UI with mock sign-in (no Cloudflare Access); the
forgot-password, reset-password and verify-email pages talk to the real API.

## Flow

```
push branch release/vX.Y.Z (from main) ─► release.yml (GitHub runner, Environment `release`)
                                   ├─ guards: commit on main, not yet released, strict branch name,
                                   │          version new and higher, secrets and site key set
                                   ├─ create tag vX.Y.Z
                                   ├─ build mingming21400/admin-pan:vX.Y.Z (linux/amd64), push to Docker Hub
                                   ├─ smoke test of the pushed image@digest (scripts/smoke-image.sh)
                                   └─ open PR release/admin-pan-vX.Y.Z on mmlabs-online/deployment
                                        (only apps/admin-pan/release.env: image@digest + version)
owner merges that PR ─────────────► deploy-admin-pan (Mac runner)
                                   1. check release.env
                                   2. pull image, `up -d --wait` (health: /healthz)
                                   3. on failure: restore the previous release.env, redeploy, push the revert
```

The first release has no previous one: a failed v0.1.0 ends as a red `no-previous` run.

## Release a version

Create a branch `release/vX.Y.Z` from the current `main` and push it, on GitHub (branch dropdown,
type `release/v0.1.0`, "Create branch from main") or:

```bash
git fetch origin && git push origin origin/main:refs/heads/release/v0.1.0
```

Never commit to a release branch. The tag is pushed first, so a failed run still uses up its
version: pick the next patch.

## What is in the image

- **Build-time config** (public, rule R5): `VITE_API_BASE_URL=https://api.mmlabs.online` and
  `VITE_APP_KEY=admin` are hard-coded in `release.yml`; `VITE_TURNSTILE_SITE_KEY` comes from the
  repository variable of the same name. The Dockerfile validates all three, bakes them into the
  bundle and renders the CSP `connect-src` from the same API origin. One image per environment
  (ADR 0002).
- **Static files only**: nginx (unprivileged, uid 101, port 8080), no server code, no secrets, no
  source maps, no dotfiles.
- **Caching**: `/assets/*` immutable for a year; the app shell `no-cache`; `/reset-password`,
  `/verify-email`, `/forgot-password` `no-store`; unknown asset paths and dotfiles are 404 (not the
  app shell); other methods than GET/HEAD are 405. `/healthz` answers `ok`.
- **Headers** on every response (nginx owns them, `nginx/security-headers.conf`):

| Header | Value |
|---|---|
| Content-Security-Policy | `default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.mmlabs.online; frame-src https://challenges.cloudflare.com; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| Referrer-Policy | `no-referrer` |
| Cross-Origin-Opener-Policy / Cross-Origin-Resource-Policy | `same-origin` |
| Permissions-Policy | camera, microphone, geolocation, payment, usb, ... all `()` |
| X-Robots-Tag | `noindex, nofollow, noarchive` |

Why the external origins: Cloudflare Turnstile (script and widget frame), Google Fonts (owner,
2026-11-16: kept, not self-hosted), the API (`connect-src`).

## One-time setup (owner)

Values come from your own accounts; none are written in this repo.

1. Docker Hub: create the repository `mingming21400/admin-pan`, **public**.
2. This repo, Settings, Environments: create `release`. Deployment branches: selected branches,
   pattern `release/v*`. A required reviewer is optional. Add these Environment secrets:
   `DOCKERHUB_USERNAME`; `DOCKERHUB_TOKEN` (Docker Hub access token with Read & Write, not Admin);
   `DEPLOY_REPO_TOKEN` (fine-grained PAT on `mmlabs-online/deployment` only: Contents read/write,
   Pull requests read/write, with an expiry date). Note that this token can read every committed
   secret in the deployment repo (that repo's README, "Secrets").
3. This repo, Settings, Secrets and variables, Actions, Variables: repository variable
   `VITE_TURNSTILE_SITE_KEY`. Its value is the site key of the **same** Turnstile widget whose
   secret org-admin-api holds (`ORG_ADMIN_TURNSTILE_SECRET_KEY` in the deployment repo's
   `org-admin-api` Environment), copied from the Cloudflare dashboard. Release refuses an empty key
   or a test key (`1x...`, `2x...`, `3x...`).
4. Optional: repository rulesets so only you can create `release/v*` branches and `v*` tags.
5. Merge the deployment PR "admin-pan setup". deploy-admin-pan runs and skips with "No
   apps/admin-pan/release.env yet".
6. Merge the deployment PR that adds `admin-portal.mmlabs.online` to org-admin-api
   `TURNSTILE_ALLOWED_HOSTNAMES`. It redeploys org-admin-api in full with the same pinned image;
   check `https://api.mmlabs.online/readyz`.
7. Cloudflare, Turnstile, the widget used by org-admin-api, Hostname management: add
   `admin-portal.mmlabs.online`.
8. Cloudflare Zero Trust, Networks, Tunnels, the mmlabs tunnel, Public hostnames: add
   `admin-portal.mmlabs.online`, type `HTTP`, URL `admin-pan:8080`. No Access application (owner,
   2026-11-16). For this hostname keep Rocket Loader, Email Obfuscation, automatic Web Analytics
   injection and Zaraz **off** (they inject inline scripts the CSP blocks), and add no "Cache
   Everything" rule.
9. After the PAN-022 PR is merged: push `release/v0.1.0`, merge the release PR it opens in the
   deployment repo, and check `https://admin-portal.mmlabs.online/healthz`.
10. Register the origin (next section).

## Origin registration (app `admin`)

org-admin-api only answers CORS for origins registered on app `admin`.

**Prerequisite:** the deployed org-admin-api release contains ADM-002c, so the `ops-org-admin-api`
workflow in the deployment repo offers the command `set-admin-origins`.

1. Deployment repo, Actions, `ops-org-admin-api`, Run workflow on `main`: command
   `set-admin-origins`, origins `https://admin-portal.mmlabs.online` (no trailing slash, no
   wildcard), `dry_run` **on**.
2. Approve the `org-admin-api-ops` environment and read the run summary.
   - The `origins:` line shows the set **after** the change; any `- origin …` line is an origin
     this run would remove. The command **replaces** the set (at most 2 origins): if a
     `- origin` line names an origin that must stay, re-run with both origins.
   - Check the line `+ origin https://admin-portal.mmlabs.online`.
3. Run again with `dry_run` off. The API applies the change within 60 s.
4. Check: open `https://admin-portal.mmlabs.online/forgot-password`, submit an address you own and
   solve the widget. The email arrives and its link starts with
   `https://admin-portal.mmlabs.online/reset-password#token=`.

Fallback on the Mac: the command in org-admin-api `docs/deploy.md`, "Set admin origins", with
`--origin https://admin-portal.mmlabs.online`. Do not create DNS or a route for
`admin.mmlabs.online` (org-admin-api's "Host policy" still names it; follow-up there).

## Verify after deploy

- `curl -sI https://admin-portal.mmlabs.online/` and `.../reset-password`: every header from the
  table is present (Cloudflare did not strip or change it).
- `curl -s -o /dev/null -w '%{http_code}' https://admin-portal.mmlabs.online/assets/nope.js`
  returns `404`.
- In a browser: the sign-in page renders with its fonts and the console shows no CSP violations.
  `/forgot-password` renders the Turnstile widget and submits.
- If Turnstile fails only because of the CSP, record a follow-up. Do not loosen the CSP by hand.

## Rollback / redeploy / break-glass

- Rollback: revert the release PR's commit in the deployment repo; merging the revert redeploys the
  previous `release.env`.
- Redeploy: deployment repo, Actions, deploy-admin-pan, Run workflow on `main`.
- Take the site offline: remove the tunnel public hostname (Zero Trust, Tunnels, Public hostnames).
- Stop admin token issuance: `set-admin-origins` with `clear` (see Origin registration).

## Troubleshooting

- forgot-password 403 `origin_not_allowed`: the origin is not registered on app `admin`, or the 60 s
  delay has not passed.
- `turnstile_failed`: the hostname is missing in the Turnstile widget or in
  `TURNSTILE_ALLOWED_HOSTNAMES`.
- "Verification is not configured": the repository variable `VITE_TURNSTILE_SITE_KEY` was empty at
  build time; set it and cut a new release.
- "Could not reach the server": CSP `connect-src` and the API origin disagree (check the smoke
  output), or the origin is not registered.
- Local image check: `docker build --build-arg VITE_API_BASE_URL=https://api.mmlabs.online
  --build-arg VITE_APP_KEY=admin -t admin-pan:local .` then
  `bash scripts/smoke-image.sh admin-pan:local https://api.mmlabs.online`.
