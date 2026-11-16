# Review — PAN-022

## Attempt 1 — 2026-11-16
Verdict: REWORK

Reviewed `git diff origin/main...HEAD` on `claude/great-edison-3g2y0h` (implementation commit `a36c741`). Not in this review's scope: the `solo:` a11y commit `e6b0428` (PR #5) and the orchestrator bookkeeping (`work/**`, `docs/spec-v1.md` §6.1/§8, which match the owner decisions in ticket.md). Deployment repo: local branches `admin-pan-setup` (`fca5003`) and `org-admin-api-turnstile-admin-portal` (`387a282`), diffed against `main`. I exported each with `git archive` into the scratchpad and did not switch the checkout.

### Checks (run by reviewer)
- pnpm typecheck: clean (`tsc -b`)
- pnpm lint: clean (`eslint .`)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): 45 files, 274 tests passed. Matches impl-log.
- pnpm build: built. `grep -rlE '@mmlabs\.online' dist` is empty. No `*.map` or dotfiles in `dist`.
- api:types drift: I regenerated from `src/api/openapi.json` into the scratchpad and ran prettier. Identical to `src/api/schema.d.ts`. `src/api` is untouched by the branch.
- pnpm e2e: not planned.
- Docker build: I used the scratchpad copy `Dockerfile.review`. `diff Dockerfile Dockerfile.review` shows only two added lines in the build stage: `COPY --from=ca ca-bundle.crt /tmp/proxy-ca.crt` and `ENV NODE_EXTRA_CA_CERTS=/tmp/proxy-ca.crt`, built with `--build-context ca=/root/.ccr`. The runtime stage is identical. Building with `VITE_API_BASE_URL=https://api.mmlabs.online VITE_APP_KEY=admin` exits 0. The only warnings are the two `SecretsUsedInArgOrEnv` false positives, already noted in the impl-log.
- `scripts/smoke-image.sh admin-pan:review https://api.mmlabs.online`: all 37 checks `ok`, "smoke test passed", exit 0. Mutation check: with the wrong origin (`https://api.example.org`) it prints `FAIL` for the CSP connect-src check and the bundle check, then "smoke test FAILED", exit 1, and the container is removed.
- Negative builds (all exit 1 in the build stage):
  - `http://evil`: "VITE_API_BASE_URL must be an https origin (no path, no trailing slash)"
  - URL missing: same message
  - trailing slash: same message
  - `VITE_APP_KEY=Adm;in`: "must match ^[a-z][a-z0-9-]*$"
  - site key `a"b`: "has invalid characters"
- Extra probes on the running image (`--read-only --cap-drop ALL`):
  - The security headers are on `/healthz`, 404 and 405 responses.
  - The access log has no query string (`$uri`).
  - Runs as uid 101; `/usr/share/nginx/html` is read-only.
- Workflows: YAML parses (`release.yml`, `ci.yml`, `deploy-admin-pan.yml`). `bash -n scripts/smoke-image.sh` is ok. actionlint, shellcheck and nginx are not installed.
- Deployment repo:
  - `bash ops/check-volume-safety.sh` prints "No volume-deleting commands found." on both branches.
  - `docker compose -p admin-pan -f apps/admin-pan/compose.yml --env-file <dummy outside repo> config --quiet` exits 0. Without the env file it exits 1 with "ADMIN_PAN_IMAGE is unset - pass --env-file …".
  - PR B's `TURNSTILE_ALLOWED_HOSTNAMES` still parses as a JSON list of 3 hosts.

### Acceptance criteria
- [ ] AC1 Dockerfile + nginx config with SPA fallback and security headers. The headers, SPA fallback, 404s/405, non-root and read-only all pass (smoke run above). FAILED on caching of asset 404s, see Issue 1.
- [x] AC2 `release.yml` mirrors org-admin-api. I diffed it against `/home/user/org-admin-api/.github/workflows/release.yml`; the only deltas are the planned ones in Approach §4:
  - header comment;
  - `permissions: {}` at the top, `contents: write` on the job;
  - `environment: release`;
  - env `API_BASE_URL`/`APP_KEY`;
  - site-key guard `^0x[A-Za-z0-9_-]{10,}$`;
  - `build-args` (no `secrets.*`) and no gha cache;
  - the smoke step calls `scripts/smoke-image.sh "$REF" "$API_BASE_URL"` on `$IMAGE@$DIGEST`;
  - `ADMIN_PAN_*` lines, with `git add` of `apps/$APP/release.env` only;
  - PR body.

  The CI `image` job (`.github/workflows/ci.yml:36-52`) runs the same script. **Conditional:** the CI `image` job on the PR is still required. See the note at the end.
- [ ] AC3 Runbook `docs/deploy.md`. All required sections are present: Flow, Release a version, What is in the image (with header table), One-time setup, Origin registration, Verify, Rollback/redeploy/break-glass, Troubleshooting. It names a place for every step and invents no values. The documented rollback can fail because of Issue 1.
- [ ] AC4 Origin registration documented. It covers: the ADM-002c prerequisite, dry_run on then off, `org-admin-api-ops` approval, the `+ origin` line, replace with at most 2 origins, 60 s (it matches `origin_registry.py` TTL 60 s), and the forgot-password check. FAILED on accuracy, see Issue 2.
- [x] AC5 Deployment side.
  - `admin-pan-setup` changes only `apps/admin-pan/compose.yml`, `.github/workflows/deploy-admin-pan.yml` and `.github/CODEOWNERS` (+1 line), in one commit.
  - `org-admin-api-turnstile-admin-portal` changes one line in `apps/org-admin-api/compose.yml`, in one commit.
  - Neither branch name matches pr-scope's `^release/([a-z0-9-]+)-(v[0-9]|sha-…)`.
  - `deploy-admin-pan.yml` vs `deploy-site.yml` differs only by the Approach §6 deltas: name/comment/paths/concurrency/APP_DIR/PROJECT, `if: refs/heads/main` + `[self-hosted, macbook-runner]` (as in deploy-org-admin-api/stoktok/tudocuatui), the strict `vX.Y.Z` pattern, the `ADMIN_PAN_VERSION` match check (copied from deploy-org-admin-api:66-73), and the messages.
  - The compose file follows site plus the tudocuatui hardening.
  - The tunnel route is a dashboard step, documented in the compose header and in `docs/deploy.md` step 8.
- [x] AC6 Mock emails `@example.com`. `grep -rnE '@mmlabs\.online' src` and `dist` are both empty, and the smoke check inside the image is ok. The faker provider is `example.com` (`audit-logs.ts:23`) and the template is in `reports.ts:17`. Origins are unchanged.
- [x] AC7 Production config baked in.
  - Smoke "bundle contains https://api.mmlabs.online" is ok, and the CSP contains `connect-src 'self' https://api.mmlabs.online;`.
  - `release.yml:30-31` hard-codes the URL and app key; the site key comes from `vars`, with a guard at `release.yml:79-81`.
  - No `secrets.*` reaches `build-args`.
- [x] AC8 R8 green (see Checks).

### Issues
#### Issue 1 — 🔴 blocker — correctness (caching / rollback)
- **Where**: `nginx/default.conf:22`
- **Expected**: Only successful asset responses are marked cacheable for a year. A 404 for a hashed asset (a stale tab's lazy chunk after a deploy, or a not-yet-deployed hash) must not be stored by browsers or the Cloudflare edge as `immutable`.
- **Actual**: `add_header Cache-Control "public, max-age=31536000, immutable" always;` also applies to the `try_files $uri =404` response. I checked against the running image: `GET /assets/does-not-exist.js` returns `404` with `Cache-Control: public, max-age=31536000, immutable`. Cloudflare respects an origin max-age on 404s, and caches `.js` by default. Here is how that breaks the runbook's rollback. After v0.2 is deployed, stale v0.1 tabs request v0.1 chunks. Each gets a 404 that is cached for a year. When the owner rolls back to v0.1 (docs/deploy.md "Rollback"), the v0.1 index references those same hashes, and they are now served as cached 404s. The site stays broken until a manual cache purge.
- **Fix instruction**:
  - In `nginx/default.conf`, drop `always` from the `Cache-Control` `add_header` in `location /assets/` only. Keep `always` on every security header in `nginx/security-headers.conf`. Without `always`, nginx adds it only to 2xx/3xx responses.
  - In `scripts/smoke-image.sh` step 7, for `/assets/does-not-exist.js` also assert that the response's `Cache-Control` does not contain `immutable` or `max-age=31536000`.
  - Re-run the build and smoke, and record the output in impl-log.
  - No plan change is needed beyond this one-word fix and one check.

#### Issue 2 — 🟡 should-fix — runbook accuracy (AC4)
- **Where**: `docs/deploy.md:113-115`
- **Expected**: The runbook tells the operator how to spot an origin the run would remove. In org-admin-api `app/cli.py:409-417` (`_print_admin_origins`), `origins:` is the **resulting** set (`tuple(app.origins)` after the replace, `app/modules/rbac/service.py:481,515`). Removals are printed as `- origin <o>` lines.
- **Actual**: "The `origins:` line shows the current set." On a dry run, `origins:` already shows only the new set, so an operator following the text would never see the origin that is about to be dropped.
- **Fix instruction**: Replace the bullet with: "The `origins:` line shows the set **after** the change; any `- origin …` line is an origin this run would remove. The command **replaces** the set (at most 2 origins): if a `- origin` line names an origin that must stay, re-run with both origins." Keep the `+ origin https://admin-portal.mmlabs.online` check.

### Rules R1–R11
No violations found.
- R1: nginx only serves files.
- R2/R3: `src/api` and auth are untouched.
- R5: only public `VITE_*` build args. `.dockerignore` excludes `.env*` except `.env.example`, and `.git`, `work` and `docs`. Secrets are used only by docker login and the PR step.
- R6: the header snippet is included in every location; verified on 200/404/405, asset, deep-link and token routes.
- R7: every admin-pan file in the diff is in the plan's file table; out-of-plan is "None" and none was found.
- R8: green.
- R11: no features added.

### Security / a11y blockers
None. No `security-review.md` exists in the ticket folder at the time of this review. The orchestrator should copy any appsec 🔴 here.

### Nits (do not block)
- `.github/workflows/release.yml:76`: the message says "repository secret", but the secrets now live in the `release` Environment. Suggested wording: "secret … in Environment `release`".
- `deploy-admin-pan.yml:3-6` (deployment `admin-pan-setup`): the header comment has an odd line break ("pinned in release.env," alone on a line). Reflow it.
- `Dockerfile:16-21`: validation pipes `printf '%s\n'` into line-based `grep`, so a build arg with an embedded newline would pass on its first line. This can't happen through release.yml (hard-coded values, and a bash `=~` guard for the site key). A stricter form is `case "$VITE_API_BASE_URL" in *"$(printf '\n')"*) exit 1;; esac`, or `[[ =~ ]]` in a `bash` shell.

### Follow-ups (out of scope)
- All impl-log follow-ups stand:
  - org-admin-api: docs/deploy.md "Host policy" and the `set-admin-origins` examples should say `admin-portal.mmlabs.online`.
  - admin-pan: SHA-pin actions, Dependabot, `pnpm audit --prod`.
  - deployment: pin checkout/cloudflared, rotate the tunnel token.
  - PAN-010: redirect validation.
  - Mock `admin` origin.
  - Template leftovers.
- **PASS condition after rework:** the committed Dockerfile's `npm install -g pnpm@10` step was not run unmodified in this sandbox (the proxy CA was added only in a scratchpad copy). PASS on the next attempt will still depend on the PAN-022 PR's CI `image` job being green, since that job builds the exact Dockerfile and runs `smoke-image.sh`.
