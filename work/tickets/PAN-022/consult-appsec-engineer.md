## PAN-022 security consult (PLAN stage, read-only)

I read the ticket, the PAN-009, PAN-012 and PAN-012b security follow-ups, `index.html`, `vite.config.ts`, `src/api/*`, the mock sign-in, the current `dist/`, the deployment repo (`proxy/`, `apps/site`, `apps/org-admin-api`, `deploy-site.yml`, `pr-scope.yml`, `docs/app-release.yml`) and org-admin-api's `release.yml`.

### Findings (current state)

1. **TLS ends at Cloudflare's edge.** The chain is browser → Cloudflare (TLS) → tunnel → `cloudflared` → plain HTTP on the docker `web` network → the container (`/home/user/deployment/proxy/compose.yml`, `apps/site/compose.yml`). nginx only sees HTTP. Headers nginx sends do pass through Cloudflare unchanged, so HSTS and CSP can be set in nginx. "Always Use HTTPS" is a Cloudflare setting, not an nginx one.

2. **What Vite's build needs from the CSP.** I checked `/home/user/admin-pan/dist`:
   - **Scripts:** only `<script type="module" crossorigin src="/assets/index-*.js">`. There are no inline scripts, no `eval` or `new Function` in the chunks, and no source maps (Vite's `build.sourcemap` is off by default). So `script-src 'self'` works without `'unsafe-inline'` or `'unsafe-eval'`.
   - **Styles:** three chunks create `<style>` elements at runtime (`dist/assets/dist-BtUXKFnh.js` is react-style-singleton from Radix remove-scroll, `dist-CMIWYBXv.js` is sonner's CSS injection, and React 19 hoists `<style>`). Without a nonce these need `style-src 'unsafe-inline'`. A per-request nonce is not practical for a static nginx site, and `sub_filter` with a fixed nonce is security theatre. Accept `'unsafe-inline'` for styles only. React `style={}` props go through CSSOM and are not blocked either way.
   - **Images and downloads:** Radix avatars and favicons need `img-src 'self' data:`. The CSV downloads (`audit-log-table.tsx:297`, `reports/lib/csv.ts:146`) are `blob:` links clicked to download. They need no CSP source, so do not add `blob:`.

3. **Google Fonts.** `index.html:34-39` loads CSS from `fonts.googleapis.com` and fonts from `fonts.gstatic.com`. Every visitor's IP and user agent goes to Google, two third-party origins have to be allowed in the CSP, and there is no SRI on the stylesheet.

4. **Turnstile.** `src/lib/turnstile-loader.ts:21` injects `https://challenges.cloudflare.com/turnstile/v0/api.js`. Cloudflare does not support SRI for it, so the CSP is the only control.

5. **Reset and verify tokens are in the URL fragment** (`useFragmentToken`). They never reach Cloudflare's or nginx's logs. `no-store` and `no-referrer` are still worth having for the page itself and for history/bfcache.

6. **The unvalidated sign-in redirect becomes reachable from the internet.** `src/routes/(auth)/sign-in.tsx:5-7` accepts any string, and `user-auth-form.tsx:74` passes it straight to `navigate({ to })`. This was deferred to PAN-010, but a public release makes `https://admin-portal.mmlabs.online/sign-in?redirect=…` a link anyone can craft on a real mmlabs hostname.

7. **The public bundle contains real-looking mmlabs addresses.** For example `admin@mmlabs.online` (`src/components/layout/data/sidebar-data.ts:22`, `src/components/profile-dropdown.tsx:36`); that is also the pgAdmin login email in the deployment README. Others: `linh.tran@`, `minh.nguyen@`, `an.pham@` (`src/features/apps/data/mock-data.ts:228-323`), `linh@`, `minh@`, `an@` (`src/features/dashboard/data/stats.ts:98-126`), and faker-generated `…@mmlabs.online` (`src/features/reports/data/reports.ts:17`). If any of them are real people or real logins, the release publishes phishing and credential-stuffing targets along with who is a super-admin.

8. **API base URL decides what goes live.** `src/api/index.ts` builds the API client only when it is first used, and no screen uses `getApi()` yet (`organizations/api/queries.ts` is not imported anywhere). The mock token `'mock-access-token'` therefore never reaches the API, and ADM-002 would refuse it anyway. But if the image is built with `VITE_API_BASE_URL=https://api.mmlabs.online`, forgot-password, reset-password and verify-email go live against the real Identity API (see Open questions).

9. **No `.dockerignore` exists.** With `COPY . .`, a developer's `.env.local` or `.env.production.local` in the build context would be read by `vite build` and silently change the shipped config. `.git`, `work/` and `.claude/` would also enter the build stage.

10. **The deployment repo holds the keys to everything** (README, "Secrets"). The Postgres passwords and the full Cloudflare tunnel token (`proxy/compose.yml:11`) are committed there. Any `DEPLOY_REPO_TOKEN` that can read the repo can read all of them. So the admin-pan `DEPLOY_REPO_TOKEN` secret is effectively a production secret, not just a "PR opener".

### Recommendations

**A. nginx config** (`nginx/default.conf` plus a `security-headers.conf` snippet)

nginx gotcha: a location that has any `add_header` of its own drops every `add_header` inherited from the server block. Put all headers in one snippet and `include` it in **every** location that adds its own headers, then test it (see F).

`security-headers.conf`:
```nginx
add_header Content-Security-Policy "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${API_ORIGIN}; frame-src https://challenges.cloudflare.com; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "no-referrer" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Resource-Policy "same-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), browsing-topics=()" always;
add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
```

Notes on the header values:
- **`connect-src`:** `${API_ORIGIN}` must be the same value as `VITE_API_BASE_URL`, an origin only, for example `https://api.mmlabs.online`.
  - Feed both from one Docker build `ARG`, and render the template at build time with `envsubst '${API_ORIGIN}'` in the Dockerfile, not at container start. That way the filesystem can be read-only.
  - In mock mode (empty base URL), render `connect-src 'self'`.
  - Do not add `https://challenges.cloudflare.com` to `connect-src` unless the Turnstile widget fails in testing. The widget's own requests run inside its iframe.
- **Fonts:** with self-hosted fonts (recommended, see below), `font-src 'self'` is enough. If the owner prefers to keep Google Fonts, add `https://fonts.googleapis.com` to `style-src` and `https://fonts.gstatic.com` to `font-src`, and keep the `preconnect` links.
- **`form-action 'self'`, not `'none'`:** all forms `preventDefault`, but `'self'` stays safe if one ever submits natively.
- **HSTS:**
  - `includeSubDomains` on `admin-portal.mmlabs.online` covers only its own subdomains, so it is harmless.
  - Do **not** add `preload`, and do not set HSTS on the apex from here. That is a zone-wide Cloudflare decision.
  - If Cloudflare zone-level HSTS is already on, keep the nginx header anyway: both are identical and it is defense in depth.
- **No COEP:** `require-corp` would break the Turnstile iframe.
- **Turnstile and `Permissions-Policy`:** do not list `private-state-token-*` or `attribution-reporting` features in `Permissions-Policy`. Cloudflare challenges may use them.
- **Trusted Types:** do not add `require-trusted-types-for 'script'` now. The Turnstile loader's `script.src` assignment would break. It could be a later `Content-Security-Policy-Report-Only` experiment.

Server block:
```nginx
server_tokens off;
server {
  listen 8080;                 # unprivileged port
  root /usr/share/nginx/html;
  autoindex off;
  charset utf-8;
  access_log /dev/stdout main_noquery;   # log_format main_noquery uses $uri, not $request (no query strings)
  include /etc/nginx/snippets/security-headers.conf;

  if ($request_method !~ ^(GET|HEAD)$) { return 405; }

  location ~ /\.      { return 404; }          # .env, .git, .well-known, … (no dotfiles are shipped)
  location ~ \.map$   { return 404; }          # belt and braces; the build also asserts there are no .map files

  location /assets/ {                          # hashed files: never fall back to index.html
    try_files $uri =404;
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
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
    try_files $uri /index.html;                # no $uri/ (no directory handling)
  }
}
```

Notes on the server block:
- `/assets/` returning a real 404 matters. Otherwise a stale chunk URL after a deploy gets `index.html` with `immutable` caching, Cloudflare caches it, and `nosniff` blocks it as script.
- `/images/` (favicons) can use `max-age=86400`.
- Remove the template leftover `public/images/shadcn-admin.png` if it is unused (R7: only if it is in the plan).
- `robots.txt` is optional. `X-Robots-Tag` plus the existing `<meta name="robots">` already prevents indexing, while `Disallow: /` alone can still leave the bare URL indexed. If you add it, use `User-agent: *` / `Disallow: /`.

**B. Fonts: self-host.** Add `@fontsource-variable/inter` and `@fontsource-variable/manrope`, import them in `main.tsx`, and delete the Google `preconnect`/`<link>` lines from `index.html`. That gives a smaller CSP and no visitor IPs going to Google. It adds two pinned dependencies, so log it in the plan; the PAN-012 follow-ups already ask for it.

**C. Dockerfile and image hardening**
- **Build stage:**
  - Use `node:<version from .node-version>-alpine@sha256:…`, with the same pnpm major as CI (10) via `corepack` and a pinned version.
  - Run `pnpm install --frozen-lockfile`.
  - Pass the build config as `ARG VITE_API_BASE_URL VITE_APP_KEY VITE_TURNSTILE_SITE_KEY API_ORIGIN`. All of them are public (R5), so never pass secrets as build args.
  - Run `pnpm build`, then fail the build if source maps or dotfiles slipped in: `test -z "$(find dist -name '*.map' -o -name '.*' -mindepth 1)"`.
- **Runtime stage:** `nginxinc/nginx-unprivileged:<1.x>-alpine@sha256:…`, which runs as uid 101 and listens on 8080, plus `USER 101`.
  - Copy only `dist/` (`--chown=root:root`, read-only) and the rendered config.
  - Do not copy `node_modules` or the source.
- **Add `.dockerignore`:** `.git`, `node_modules`, `dist`, `.env*` except `.env.example`, `work/`, `.claude/`, `coverage`, `.vitest-attachments`, `playwright-report`, `test-results`.
- **Deployment `apps/admin-pan/compose.yml`** (mirror `apps/site`):
  - `read_only: true`
  - `tmpfs: [/tmp]` (nginx-unprivileged keeps its pid and temp files in `/tmp`; check `client_body_temp_path` and the other temp paths point there)
  - `cap_drop: [ALL]`
  - `security_opt: ["no-new-privileges:true"]`
  - no `ports:`, `networks: [tunnel]` only (not `db`)
  - healthcheck `wget -q --spider http://127.0.0.1:8080/`, json-file log rotation like org-admin-api, and an optional `mem_limit`
- **Tunnel route:** `admin-portal.mmlabs.online` → `http://admin-pan:8080` is set in the Cloudflare dashboard (not in the repo, as for the other apps). Document it in `docs/deploy.md` and in the compose header comment.

**D. `release.yml`** (copy org-admin-api's flow; change only what follows)
- **Permissions:** top-level `permissions: {}` and job-level `contents: write` (only the tag push needs it).
- **Checkout:** keep `persist-credentials: false` and the guards: commit on main, strict `release/vX.Y.Z`, new and higher tag, non-empty secrets.
- **Pin every third-party action to a full commit SHA with a version comment:** `actions/checkout`, `docker/setup-buildx-action`, `docker/login-action`, `docker/build-push-action`. Do the same in `ci.yml` (`pnpm/action-setup`, `actions/setup-node`; PAN-009 follow-up 3). Enable Dependabot for `github-actions` so the pins get updated.
- **Secrets:**
  - Put `DOCKERHUB_*` and `DEPLOY_REPO_TOKEN` in a GitHub **Environment** (`release`) limited to `release/v*` branches, and preferably with the owner as required reviewer. Today any collaborator who can push a branch with a workflow could exfiltrate repo-level secrets, and per Finding 10 that means every prod DB password and the tunnel token.
  - Add repository rulesets so only the owner can create `release/v*` branches and `v*` tags.
  - `DOCKERHUB_TOKEN` should be a Docker Hub access token with Read & Write (not Admin), scoped to `mingming21400/admin-pan` if the account type allows it.
  - `DEPLOY_REPO_TOKEN` should be a fine-grained PAT on `mmlabs-online/deployment` only, with Contents and Pull requests read/write, and an expiry date.
- **Build:** pass the `VITE_*` values from repository **variables** (not secrets; they are public and should appear in logs for audit). `platforms: linux/amd64`. Drop `cache-from/cache-to: type=gha`: a static build is fast, and that removes cache poisoning from the release path. Optionally add `provenance: mode=max` and `sbom: true`.
- **Smoke test of the pushed digest:**
  - Run it the way production does: `docker run -d --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -p 127.0.0.1:8080:8080 "$REF"`.
  - `curl -fsSI /` must return 200 with all security headers. Grep that the CSP contains `frame-ancestors 'none'` and the exact `connect-src` origin.
  - `/sign-in` must return 200 `text/html` with `no-cache`, and `/reset-password` must have `no-store`.
  - `/assets/nope.js`, `/.env`, `/.git/config` and `/x.map` must each return 404, and `POST /` must return 405.
  - An existing `/assets/*.js` must return `immutable` plus the headers (this catches the `add_header` inheritance bug).
  - If the smoke test fails, no deployment PR is opened.
- **Deployment PR:** write `ADMIN_PAN_IMAGE=…@sha256:…` plus the version into `apps/admin-pan/release.env` only. `pr-scope.yml` then enforces that the branch only touches `apps/admin-pan/`.

**E. Deployment repo PR** (owner-approved)
- Add `apps/admin-pan/compose.yml` (as in C) and `.github/workflows/deploy-admin-pan.yml`, a copy of `deploy-site.yml` with the image regex `^mingming21400/admin-pan:v…@sha256:[0-9a-f]{64}$`.
- `deploy-site.yml` uses `actions/checkout@v7` unpinned, on a **self-hosted** runner. Pin the SHA in the new file even if the others are not pinned yet.
- If forgot/reset go live, a separate change in `apps/org-admin-api/compose.yml` adds `admin-portal.mmlabs.online` to `TURNSTILE_ALLOWED_HOSTNAMES`. That needs an org-admin-api redeploy; a `release/*` branch could not carry it because pr-scope only allows changes under that app's own folder.

**F. Tests in this repo** (R8)
- A small script test (or the release smoke step run in CI on every PR that touches `nginx/` or the `Dockerfile`) that builds the image and asserts the header and 404 matrix above.
- CI: `pnpm audit --prod --audit-level high` (PAN-009 follow-up). Known advisories such as `seroval` via TanStack router must be fixed or explicitly listed as accepted with the owner's sign-off. Do not leave CI red or silence it.

**G. Mock sign-in on a public hostname: risk and the text to add**
- **Risk is low but real.** No data is real and the mock token is never sent anywhere. What remains:
  - (a) Staff are trained to type their real mmlabs Identity password into an "mmlabs Admin" page that keeps it in form memory only. Nothing leaks, but it is a bad habit.
  - (b) Visitors and scanners see what looks like a real admin console on a mmlabs hostname, which brings confusion and bug-report noise.
  - (c) The open redirect (Finding 6).
  - (d) The real-looking addresses (Finding 7).
  - (e) The hostname will later serve the real console, so the mock must not survive into the release that wires PAN-010 or PAN-013 onward.
- **Add a persistent, non-dismissable banner on every page** (`role="status"`, AA contrast): "Demo build: sample data only, not connected to mmlabs systems. Any email signs you in. Do not enter your real password."
- **Add on the sign-in form:** the same line above the fields, and a password placeholder "any 7+ characters (demo)". Optionally prefill `demo@example.com`.
- **Make it build-driven.** Show the banner when `VITE_API_BASE_URL` is empty or when a `VITE_DEMO=true` flag is set (add it to `.env.example`). It then disappears automatically once real auth ships, and PAN-010's acceptance criteria should include "demo banner and mock sign-in removed".
- **Before public release** (small; the planner decides whether it is in this plan or a solo change first):
  - Validate `redirect` in the sign-in search schema: `startsWith('/')`, not `//` or `/\`, and same origin via `new URL(r, location.origin).origin === location.origin`, with a test.
  - Replace every `@mmlabs.online` address in mock data with `@example.com`.
- **Keep:** `<meta name="robots" content="noindex, nofollow">` plus the `X-Robots-Tag` header. Optionally keep `<meta name="referrer" content="no-referrer">` (the header covers it).

### Risks
- **🟡 `add_header` inheritance:** headers silently missing on `/assets/` or the token routes. Mitigated by the snippet include and the smoke matrix.
- **🟡 CSP drift:** the `connect-src` origin and `VITE_API_BASE_URL` disagreeing causes "Could not reach the server" on forgot/reset. Mitigated by one build arg and a smoke assert.
- **🟡 Secret blast radius:** the admin-pan `DEPLOY_REPO_TOKEN` can read all prod DB passwords and the tunnel token. Mitigated by the Environment, branch/tag rulesets and token expiry.
- **🟡 Public mock:** phishing look-alike, open redirect, real-looking emails (G).
- **💭 `style-src 'unsafe-inline'`** remains. It is acceptable: there are no HTML sinks (R6), and `script-src` is strict.
- **💭 Cloudflare caching:** it caches `.js`/`.css` and honours origin `Cache-Control`; HTML is not cached by default. Do not add a "Cache Everything" page rule for this host.
- **💭 Turnstile has no SRI:** accepted, and limited by the CSP.

### Open questions (owner)
1. **Which API base URL should the public build use?**
   - Empty (pure mock): forgot, reset and verify then show a config error. Hide the links, or accept that.
   - `https://api.mmlabs.online`: those three flows go live for real accounts. That needs:
     - `https://admin-portal.mmlabs.online` registered exactly in app `admin` `apps.origins` (no trailing slash, no wildcard);
     - a production Turnstile site key whose widget allows that hostname;
     - the hostname in org-admin-api's `TURNSTILE_ALLOWED_HOSTNAMES`;
     - confirmation that the reset and verify emails for app `admin` link to this host.
2. Are the `@mmlabs.online` addresses in the mock data real people or logins (especially `admin@mmlabs.online`)? If they are, they must be replaced before release.
3. Self-host the fonts (recommended, two new pinned dependencies) or allow-list Google Fonts?
4. Is HSTS already on at the Cloudflare zone level, and is "Always Use HTTPS" on for this host?
5. A `release` GitHub Environment with the owner as required reviewer: acceptable friction?
6. Should the demo banner and the redirect/email fixes go into PAN-022, or into a solo change before it (R7)?

### Follow-ups (out of scope)
- Deployment repo: the tunnel token is committed in `proxy/compose.yml:11`. Consider moving it to the Mac's `~/.config` like the app secrets, and rotating it. Also pin `cloudflare/cloudflared:latest` and `actions/checkout@v7` (self-hosted runner) to digest/SHA.
- PAN-010: redirect validation (if not done here), dropping the hash from the 401 redirect (`src/main.tsx:34`), removing the demo banner and mock sign-in.
- CI: SHA-pin the actions, add `pnpm audit`, Dependabot for actions and npm.

Paths: `/home/user/admin-pan/work/tickets/PAN-022/ticket.md`, `/home/user/admin-pan/index.html`, `/home/user/admin-pan/src/routes/(auth)/sign-in.tsx`, `/home/user/admin-pan/src/features/auth/sign-in/components/user-auth-form.tsx`, `/home/user/admin-pan/src/lib/turnstile-loader.ts`, `/home/user/admin-pan/.github/workflows/ci.yml`, `/home/user/deployment/apps/site/compose.yml`, `/home/user/deployment/.github/workflows/deploy-site.yml`, `/home/user/deployment/.github/workflows/pr-scope.yml`, `/home/user/deployment/proxy/compose.yml`, `/home/user/deployment/apps/org-admin-api/compose.yml`, `/home/user/org-admin-api/.github/workflows/release.yml`.
