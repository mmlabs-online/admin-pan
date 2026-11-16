# Security review — PAN-022

## Attempt 1

**Verdict: no blockers.** 2 small should-fix items and notes. Built the image from a scratchpad copy of the Dockerfile (only change: proxy CA, sandbox-only) and ran `scripts/smoke-image.sh`: passed. Edge cases checked by hand. Nothing in either repo edited.

### Verified by running the image (read-only, `--cap-drop ALL`, `--tmpfs /tmp`, no-new-privileges)
- **Headers on every response:** CSP, XFO DENY, HSTS etc. on `/`, deep links, `/index.html`, token routes, `/assets/*`, `/images/*`, `/healthz`, 404 (`/.env`, `/x.map`, `/.well-known/x`, `/assets/`), 400 (`/%2e%2e/...`), 405 (POST, OPTIONS, TRACE). `add_header` inheritance handled (snippet re-included in every location that adds `Cache-Control`; `return`-only locations inherit server-level headers).
- **CSP:** `connect-src 'self' https://api.mmlabs.online` from the same build arg as the bundle (build fails if the placeholder is not rendered); Google Fonts in `style-src`/`font-src`; Turnstile in `script-src`/`frame-src`; `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`, `form-action 'self'`; no `unsafe-eval`, no `unsafe-inline` in `script-src`; built `index.html` has one external module script, no inline script.
- **Caching:** token pages (incl. trailing slash / query) `no-store`; shell `no-cache`; assets `public, max-age=31536000, immutable`; missing `/assets/` → 404; dotfiles and `*.map` → 404.
- **Runtime:** uid 101; read-only root FS; `Server: nginx` without version; access log uses `$uri`; compose healthcheck works in the read-only container.
- **Build-arg validation:** non-https or missing URL fails the build (see finding 2).
- **Bundle:** no `@mmlabs.online`, no source maps. `.dockerignore` excludes `.env`/`.env.*` (keeps `.env.example`), `.git`, `.github`, `.claude`, `work`, `docs`.
- **Secrets:** nothing committed in admin-pan; deployment diffs only reference `github.token`.
- **release.yml:** top-level `permissions: {}`, job `contents: write`; `release` Environment; `persist-credentials: false`; guards (on main, not already tagged, strict branch name, new/higher tag, non-empty secrets, production site key `0x…`); smoke on the pushed `image@digest` before the deployment PR, which pins the digest.
- **Deployment repo:** compose read-only, `cap_drop ALL`, no-new-privileges, tmpfs `/tmp`, no ports/volumes/secrets; image only from `release.env` with strict `name:vX.Y.Z@sha256` + version cross-check; `deploy-admin-pan.yml` differs from `deploy-site.yml` only as planned; Turnstile change adds only `admin-portal.mmlabs.online`.

### Findings
1. 🟡 **Guard error steers the owner toward repository secrets** (`.github/workflows/release.yml:76`) — "repository secret for $name is empty" would lead to repo-level `DOCKERHUB_TOKEN`/`DEPLOY_REPO_TOKEN`, readable by any workflow on any branch. Fix: `echo "::error::secret for $name is empty in GitHub Environment 'release' (not a repository secret; see docs/deploy.md, One-time setup)"`.
2. 🟡 **Build-arg validation checks lines, not the whole value** (`Dockerfile:17`, same on 19 and 21) — `printf '%s\n' "$v" | grep -Eq '^…$'` passes if any line matches; `https://a.com<LF>evil; script-src *` passes. Not exploitable today (values hard-coded) but a broken control. Fix: reject newlines/empty first (e.g. `case "$V" in *"$(printf '\n')"*|'') …; exit 1;; esac`), keep `grep -Eqx` for the pattern.
3. 💭 `style-src 'unsafe-inline'` (`nginx/security-headers.conf:1`) — accepted (Radix, sonner, next-themes); scripts locked down.
4. 💭 nginx config writable by the nginx user in the image — mitigated by `read_only: true`; optional `chown -R root:root /etc/nginx && chmod -R go-w /etc/nginx` in the runtime stage.
5. 💭 pnpm not pinned exactly (`npm install -g pnpm@10`, `Dockerfile:8`; CI `version: 10`) — pin via `packageManager` + corepack.
6. 💭 Image is public on Docker Hub before the smoke test (`release.yml:99-119`) — never deployed (only the digest PR deploys); matches org-admin-api.
7. 💭 Smoke does not assert security headers on 404, 405 and `/healthz` (`scripts/smoke-image.sh:112-120`) — add `full_headers "$WORK/nf.h"` / `"$WORK/post.h"`.
8. 💭 Deployment compose has no resource limits — optional `mem_limit: 128m`, `pids_limit: 100`.
9. 💭 The branch also carries the `/solo` verify-email a11y commit (e6b0428) — no security concern; mention in the PR.

### Follow-ups (out of scope)
- Action pinning (admin-pan): SHA-pin `docker/*`, `actions/*` in `release.yml`/`ci.yml`; Dependabot for `github-actions`, `npm`, `docker`; `pnpm audit --prod` in CI.
- Deployment repo: SHA-pin `actions/checkout@v7`, pin `cloudflared`; move the committed tunnel token in `proxy/compose.yml` to a secret and rotate it (highest-impact item outside this diff).
- Trusted Types after PAN-010.
- Make the `release/v*` branch and `v*` tag rulesets mandatory.
- PAN-010: validate sign-in `redirect`, remove mock sign-in, keep token in memory only.
- org-admin-api docs: Host policy / `set-admin-origins` examples → `admin-portal.mmlabs.online`; `admin.mmlabs.online` must have no DNS record or route.
- Mock data: app `admin` mock origin still `https://admin.mmlabs.online`.

## Attempt 2

**Verdict: no blockers.** 🟡 1 and 🟡 2 closed; the rework adds no new risk. Built HEAD's Dockerfile from a scratchpad copy (proxy CA only); `scripts/smoke-image.sh` passed (43 ok); manual curl of the hardened container; hostile build args tried in a busybox harness and via real `docker build`. Merge commit cb9ccfd only touches work/ files.

### Re-checked
- **🟡 1 closed:** `release.yml:76` now points to the GitHub Environment `release` (matches `docs/deploy.md:74-75`).
- **🟡 2 closed:** `validate()` (`Dockerfile:17-23`) rejects any newline (`wc -l != 0`), empty required values, and requires a whole-value match (`grep -Eqx`); unset required args fail under `set -u`. Rejected API URLs: `&`, `|`, `\`, `;`, `#`, `"`, `'`, `$`, space, `*`, CR, `https://a.com"; add_header X 1; #`; Turnstile: `a<LF>b`, `<LF>`, `a;b`. The URL pattern admits none of sed's or nginx's special characters, so the CSP line cannot be broken out of; hostile values fail before `pnpm build`/`sed`. Positive cases still pass.
- **Asset caching fixed** (`nginx/default.conf:22`): real asset → `public, max-age=31536000, immutable`; `/assets/does-not-exist.js`, `HEAD /assets/nope.css`, `/assets/` → 404 without Cache-Control, still with full security headers.
- **Smoke additions** (`scripts/smoke-image.sh:116-124`): security headers on 404/405; asset 404 not immutable. `/healthz` still not asserted (headers present by hand).
- **`ubuntu-24.04` pins** (`ci.yml:17,37`, `release.yml:36`): no security impact; justified in impl-log.

### Findings
1. 💭 Asset 404s send no Cache-Control (`nginx/default.conf:20-24`) — Cloudflare may cache a 404 for `.js`/`.css` ~3 min during a deploy (availability only). Optional `error_page 404 = @asset404` with `Cache-Control: no-store`.
2. 💭 Host pattern loose but not injectable (`Dockerfile:21`) — accepts `https://-`, `https://..`, ports > 65535. Optional tighter regex.

### Still open from attempt 1 (unchanged)
3 (`style-src 'unsafe-inline'`, accepted), 4 (nginx config ownership), 5 (pnpm exact pin), 6 (image public before smoke), 8 (no compose resource limits).

### Follow-ups (carried over)
- SHA-pin Actions in `ci.yml`/`release.yml`; Dependabot (github-actions, npm, docker); `pnpm audit --prod` in CI.
- Deployment repo: move the committed tunnel token to a secret and rotate it (highest impact); SHA-pin `actions/checkout`, pin `cloudflared`.
- Mandatory `release/v*` / `v*` rulesets. Trusted Types after PAN-010.
- PAN-010: validate sign-in `redirect`, remove mock sign-in, token in memory only.
- org-admin-api docs and admin-pan mock data: `admin.mmlabs.online` → `admin-portal.mmlabs.online`; old host with no DNS record/route.
