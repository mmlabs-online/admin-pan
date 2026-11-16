## PAN-026 appsec consult (PLAN stage, read-only)

I ran `pnpm audit --prod --json` and a full `pnpm audit --json` (scratch copy at `/tmp/claude-0/-home-user/ce8daed7-26f0-593f-9bf8-a95df9f28817/scratchpad/audit-prod.json`), checked the current `dist/` bundle, and used `pnpm why` and `pnpm view`. The prod audit matches the ticket: 2 critical, 12 high, 7 moderate, 1 low. The full audit shows 5 critical, 33 high, 22 moderate, 3 low.

### Findings

**Exposure per advisory**

Keep in mind that the prod/dev split in `package.json` doesn't match what actually ships. `vite`, `@tailwindcss/vite` and `tailwindcss` are listed under `dependencies` even though they only run at build time, and `@faker-js/faker` is a devDependency that does end up in the bundle.

1. **seroval** (2 critical, 4 high; installed 1.5.1, fix ≥ 1.6.8)
   - **Not reachable at runtime.**
   - In `@tanstack/router-core` it is only imported from `dist/esm/ssr/*` (the SSR serializer: `fromJSON`/`fromCrossJSON` hydration).
   - The app is a client-only SPA with no SSR, and there are no seroval symbols in the current `dist/assets/*.js`.
   - Fix it anyway: it's the critical item in the audit, and we'd be exposed if SSR were ever turned on.
   - PR wording: "present in the dependency tree, tree-shaken out of the SPA bundle; no runtime exposure".

2. **vite** (1 high, 5 moderate, 1 low; installed 8.0.8, fix ≥ 8.1.6)
   - **Dev server only.** All of these are `launch-editor` issues (mostly Windows), `server.fs.allow`/`deny` bypasses, and a cross-origin issue in custom middleware.
   - None of it is in `dist/` or in the nginx image.
   - Real exposure is a developer's machine while `pnpm dev` or vitest browser mode is running.
   - Production exposure: none.

3. **postcss** (2 high, 2 moderate; installed 8.5.8, fix ≥ 8.5.23)
   - **Build time only.** The issues are file reads through an attacker-controlled `sourceMappingURL`, and XSS in the stringified `</style>` output.
   - The CSS input is our own source plus npm packages. Nothing user-supplied is processed at runtime.
   - Exposure is limited to a malicious dependency's CSS during a build.

4. **nanoid 3.x** (3 high; installed 3.3.11, fix ≥ 3.3.18)
   - **Build time only**, pulled in through postcss.
   - The bugs are integer overflow and infinite loops with negative or zero sizes, which postcss never passes.
   - Not in the bundle.

5. **source-map-js** (1 high; installed 1.2.1, fix ≥ 1.2.2)
   - **Build/dev time only**, through `@tailwindcss/node` (it also shows up via `@vitest/coverage-v8 > magicast` in dev).
   - The issue is event-loop DoS from a crafted indexed source map. Not shipped.

6. **zod** (1 high; installed 4.3.6, fix ≥ 4.6.6)
   - **Reachable at runtime, low impact.** zod ships in the bundle (`zod-*.js`, about 260 KB).
   - It parses attacker-influenced input in `validateSearch` on `users`, `roles`, `apps`, `reports` and `audit-log` (for example `z.array(...)` from the URL), as well as form input.
   - Worst case: a crafted link makes the victim's own tab run out of memory. The size is bounded by URL length, and there's no data or token exposure.
   - PR wording: "client-side self-DoS via crafted URL; no confidentiality/integrity impact".
   - Separately, `zod@3.25.76` comes in through `@tanstack/router-generator`. It's dev/build only and appears in the full audit under `router-plugin`.

**Other findings**

7. **The `--prod` gate misses a devDependency that ships to production.**
   - `@faker-js/faker` (devDependency) is imported by the mock data in `src/features/{users,audit-log,apps,organizations,reports}/data/*.ts` and is in `dist/assets/data-table-*.js`.
   - There's an open high advisory on faker ≤ 10.4.0: "`helpers.fake` exploitable into arbitrary code execution", fix ≥ 10.5.0.
   - It isn't reachable: there are no `helpers.fake` calls in `src`, and all mock input is static.
   - But it does reach production, and `pnpm audit --prod` will never report it.

8. **Dev-only criticals on developer machines and CI.**
   - `@vitest/browser` < 4.1.10 has 3 critical advisories: the browser-mode API can proxy CDP and overwrite config files (RCE), provider commands bypass the file-access gate, and an unsanitized `otelCarrier` value is served as an inline script.
   - These matter whenever `pnpm test:watch` or `test:browser` is running.
   - The full audit also lists `vitest` < 4.1.11 (path traversal), `ws`, `@tanstack/react-router-devtools > router-core > seroval`, `smol-toml` (knip), `brace-expansion`, `minimatch` and `lodash-es` (prettier plugin), `picomatch` and `browserslist`.
   - None of these reach the image.

9. **Lifecycle scripts.**
   - The only installed packages with install scripts are `esbuild@0.25.11` and `esbuild@0.27.1` (postinstall).
   - pnpm 10 skips that script, and esbuild still works through the optional `@esbuild/linux-x64` binary.
   - esbuild is only pulled in as Vite 8's optional peer and through `tsx` (router-generator). Vite 8 itself uses rolldown/oxc.
   - On the registry, none of the targets declare install scripts: `vite@8.3.8`, `rolldown@1.2.18`, `@tailwindcss/oxide@4.3.5`, `lightningcss@1.33.0`, `seroval@1.8.1`, `zod@4.6.7`, `router-core@1.171.39`, `router-plugin@1.169.0`, latest faker.
   - So `onlyBuiltDependencies` isn't needed today.

10. **Version coupling to plan around.**
    - `@tanstack/router-plugin@1.169.0` has a peer requirement of `@tanstack/react-router ^1.170.46`.
    - `react-router-devtools@1.167.3` has peer requirements of `router-core ^1.171.39` and `react-router ^1.170.46`.
    - `@tailwindcss/node@4.3.5` pins `tailwindcss` to exactly 4.3.5.
    - So these have to move together: `react-router`, `router-plugin` and `react-router-devtools` as one group, and `@tailwindcss/vite` with `tailwindcss` as another.
    - `@tailwindcss/vite@4.3.5` accepts vite ^8.
    - Latest parents pull in fixed transitives within their ranges:
      - `router-core` → `seroval ^1.6.7`, which resolves to 1.8.1
      - `vite` → `postcss ^8.5.32`
      - `postcss` → `nanoid ^3.3.20` and `source-map-js ^1.2.2`
    - That means no `pnpm.overrides` should be needed, as long as the lockfile actually re-resolves them.

11. **CSP baseline is clean today.**
    - `dist/index.html` has a single external `<script type="module" crossorigin src=...>`, no inline script, and 25 `<link rel=modulepreload>`. Vite puts the modulepreload polyfill inside the entry chunk, not inline.
    - The smoke script checks the CSP header strings and that there are no `.map` files or `data:` fonts.
    - It does **not** check that `index.html` has no inline `<script>`. If a future Vite inlined one, the CSP (`script-src 'self'`) would block it and the app would break without any check catching it.

### Recommendations

**CI audit gate**
- Add `pnpm audit --prod --audit-level high` to the `check` job, after `pnpm install --frozen-lockfile`. It must block. This is the ticket AC.
- Because of finding 7, also run the full audit, `pnpm audit --audit-level critical`, across all dependencies.
  - It blocks on critical. Highs in devDependencies are reported, not blocking.
  - Once the dev backlog is cleared (follow-up), raise it to `high`.
- Don't use `continue-on-error`, and don't turn the gate off.

**Advisories with no fix yet**
- Use pnpm's native `pnpm.auditConfig.ignoreGhsas` in `package.json`, listing GHSA IDs (not CVEs).
- Each entry gets a matching row, with reason, reachability and an expiry date (at most 30 days), in a short `docs/` note or the PR. Each one also gets a follow-up ticket.
- pnpm has no native expiry. If you want it enforced, a ~10-line CI step can fail when a dated entry has passed. That fits better as a follow-up than in this diff.
- Prefer an allowlist over a lower `--audit-level`, so new advisories still fail the build.

**Upgrade method and pins**
- Upgrade only the parents, together:
  - `@tanstack/react-router`, `@tanstack/router-plugin`, `@tanstack/react-router-devtools`
  - `vite`
  - `@tailwindcss/vite` with `tailwindcss`
  - `zod`
- Use targeted `pnpm update <pkg>@<ver>`, never a blanket `pnpm update` (AC: no unrelated bumps).
- Keep the repo's existing style: caret ranges where it uses carets today, exact pins where it pins. Raise each floor to at least the patched version (for example `"zod": "^4.6.6"`, `"vite": "^8.1.6"`) so a future lockfile regeneration can't drop below the fix. Don't convert ranges to exact pins in this ticket.
- After the update, run `pnpm why seroval postcss nanoid source-map-js` to confirm the patched versions. If an old transitive stays in the lockfile, try `pnpm dedupe` before reaching for `pnpm.overrides`.
- Choose release age deliberately:
  - `vite@8.3.8` (5 days old) and `postcss@8.5.33` (3 days old) are very new.
  - Either use the newest version that has been out at least ~7 days and is still ≥ the fix, or note the choice in the PR.
  - Possible follow-up: pnpm's `minimumReleaseAge` setting.

**Lockfile integrity**
- Review the `pnpm-lock.yaml` diff. Every changed `resolution.integrity` should belong to an expected package.
- No new `tarball:` or git URLs, and no registry other than `registry.npmjs.org`.
- Confirm that `pnpm install --frozen-lockfile` (CI and the Dockerfile) succeeds.

**Install scripts**
- Don't add `onlyBuiltDependencies` or `neverBuiltDependencies`.
- If `pnpm install` prints a new "Ignored build scripts: <pkg>" for anything other than esbuild, stop and look at that package before allowing it.

**Re-verify after the upgrade**
- `pnpm build`, then on `dist/index.html`:
  - No `<script>` without `src`.
  - No inline `<style>` beyond what `style-src 'unsafe-inline'` already allows.
  - No new external origins.
  - `grep -L sourceMappingURL` / no `*.map` files (the Dockerfile already fails on `.map`).
  - Still no seroval symbols in `dist/assets`.
- Recommend one small smoke check: `index.html` has no inline `<script>` (a `<script>` tag without `src=`). It belongs to the AC "smoke passes" and catches CSP breakage.
- Tailwind 4.2 → 4.3 may change the generated CSS. The existing smoke check for "no inlined data: fonts" covers the CSP-relevant part. Glance at the UI as well.
- If the router plugin's output changes, regenerate `src/routeTree.gen.ts` and make sure it contains only generated code.
- Run `pnpm build` and `scripts/smoke-image.sh` against a fresh image (CI `image` job). The CSP header must be byte-identical to `nginx/security-headers.conf`.

**PR exposure statement:** "Runtime-reachable: zod only (client self-DoS via crafted URL, low). seroval: in tree, not bundled. vite/postcss/nanoid/source-map-js: build/dev tooling, not in the image."

### Risks
- A Vite minor bump (8.0 → 8.3, rolldown 1.0-rc → 1.2) can change chunking, modulepreload output or asset inlining. It's covered by the re-verify list and the CSP/smoke checks.
- `pnpm audit` depends on the npm advisory API at CI time, so a registry outage fails CI. That's acceptable (fail closed); re-run the job.
- A new advisory published between merge and the next PR will fail unrelated PRs. This is expected, and the allowlist with expiry is how it gets handled.
- Very fresh releases carry a small compromised-release risk, which is why the release-age choice above matters.
- A `--prod`-only gate gives false comfort: faker ships to production and isn't covered by it (finding 7).

### Open questions (for owner/planner)
1. Should faker ≥ 10.5.0 go into this ticket, since it's bundled at runtime (finding 7)? It's a one-line bump and arguably in the spirit of the goal. Otherwise it becomes a P1 follow-up. Long term, mock data should not ship in the production bundle once screens move to the real API.
2. Should this ticket also add the full-dependency audit at `--audit-level critical`? That would require fixing the vitest family to ≥ 4.1.11 (`@vitest/browser` RCE criticals), which is outside the current AC. The alternative is a follow-up ticket "clear devDependency advisories, then raise the full audit to high".
3. Does the owner accept `ignoreGhsas` with a dated, ticket-tracked entry as the policy for advisories with no fix? Or should expiry be enforced by a CI script?
4. Is it fine to raise the declared floors (`^x.y.z`) to the patched versions in `package.json`, rather than changing only the lockfile?

Follow-ups (out of scope):
- Move `vite`, `@tailwindcss/vite` and `tailwindcss` to devDependencies so the `--prod` audit reflects what ships.
- Turn on Dependabot or Renovate for security updates (there's no `.github/dependabot.yml` today).
- pnpm `minimumReleaseAge`.

Files referenced: `/home/user/admin-pan/package.json`, `/home/user/admin-pan/pnpm-lock.yaml`, `/home/user/admin-pan/.github/workflows/ci.yml`, `/home/user/admin-pan/Dockerfile`, `/home/user/admin-pan/nginx/security-headers.conf`, `/home/user/admin-pan/scripts/smoke-image.sh`, `/home/user/admin-pan/vite.config.ts`, `/home/user/admin-pan/src/features/users/data/users.ts` (faker import).
