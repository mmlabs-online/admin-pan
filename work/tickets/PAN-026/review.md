## Attempt 1 — 2026-11-16
Verdict: PASS

### Checks (run by reviewer)
Reviewed at HEAD d20fba1, base origin/main.
- pnpm install --frozen-lockfile (offline): OK, lockfile matches package.json
- pnpm typecheck: exit 0
- pnpm lint: exit 0
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): 46 files passed, 277 tests passed. This matches impl-log.
- pnpm build: built OK. `git status` was clean afterwards, so the committed `src/routeTree.gen.ts` is exactly what the new router-plugin generates.
- pnpm audit --prod --audit-level high: "No known vulnerabilities found", exit 0
- pnpm audit --prod: "No known vulnerabilities found", so no moderate/low remain
- pnpm e2e: not planned
- Docker image + scripts/smoke-image.sh: not reproduced here (sandbox proxy CA). Covered by the CI `image` job, which must be green on the PR.

### Acceptance criteria
- [x] `pnpm audit --prod` has no critical/high advisories, and no moderate/low remain. Evidence: both audit commands above. The impl-log "Remaining advisories" table is empty, which is consistent.
- [x] Fixed by upgrading parents, no overrides. Evidence:
  - package.json has no `pnpm` key.
  - `pnpm why` shows only patched versions: seroval 1.8.1, postcss 8.5.33, nanoid 3.3.20, source-map-js 1.2.2, zod 4.6.7. zod 3.25.76 is gone from the lockfile.
  - The lockfile has one `@tanstack/router-core@1.171.39` entry in `packages:` (pnpm-lock.yaml:1897) and one `vite@8.3.6` (pnpm-lock.yaml:3439).
  - Tailwind was not bumped, and its source-map-js was refreshed in range (A4).
- [x] Lockfile updated, frozen install clean, no unrelated direct bumps. Evidence:
  - The package.json diff changes only the six planned specifiers: react-router, router-plugin, react-router-devtools, vite, zod, faker.
  - In the lockfile `importers`, only those specifiers change. The other importer lines change only in their peer suffixes (vite 8.3.6, jiti 2.7.0).
  - The changed `packages:` entries fall under router, vite/rolldown/lightningcss/postcss, seroval, zod and faker, plus vite's optional peer tsx (see Nit 1).
  - The lockfile contains no `tarball:`, git or non-registry resolutions.
- [x] App behaviour unchanged. Evidence:
  - All five checks pass (above).
  - `src/routeTree.gen.ts`: a line-sorted diff against origin/main is identical, so the regeneration only reorders lines and changes no route.
  - `dist/index.html` has only `<script type="module" crossorigin src="/assets/index-Ba5R2pKI.js">`, with no inline script.
  - `find dist -name '*.map'` is empty; `grep -rl seroval dist/assets` is empty; no `data:font` in dist/assets.
  - Image and smoke test: deferred to CI `image`, as the orchestrator allowed.
- [x] CI audit gate. Evidence: `.github/workflows/ci.yml:36-46` adds an `audit` job.
  - It runs exactly `pnpm audit --prod --audit-level high`, with no `continue-on-error` and no `|| true`.
  - It sits in the same workflow as `check`, so it has the same triggers (`pull_request`, push to main).
  - It uses the same action refs as `check`.
  - Negative case: before the change the same command fails. Impl-log baseline: 2 critical / 12 high.

### Issues
None.

### Rules R1–R11
No violations found. There are no source changes beyond the generated route tree. No secrets: CI only reads the lockfile and talks to the registry (R5). No new dependencies, and every bump stays inside its current major (stack unchanged). The scope matches the plan's Files table (R7). Checks are green (R8).

### Security / a11y blockers
None. The orchestrator adds any items from security-review.md.

### Nits (do not block)
- Nit 1: The lockfile moves a few transitives that are only loosely tied to the advisory subtrees, all in range and dev/build-only:
  - tsx's `esbuild` 0.25.11→0.25.12 and `get-tsconfig` 4.13.7→4.14.3 (tsx is an optional peer of vite)
  - a second `prettier@3.10.1`, pulled in by `@tanstack/router-generator@1.168.0`
  - `@emnapi/core@2.0.0-beta.2`, under the optional `@rolldown/binding-wasm32-wasi` (not installed on x64/arm64 hosts)

  Accepted as part of vite's and router-plugin's resolution graph. Worth mentioning in the PR.
- Nit 2: The impl-log says the esbuild "Ignored build scripts" warning (esbuild@0.25.12) is "pre-existing". The package itself was 0.25.11 before, so only the warning is pre-existing.

### Follow-ups (out of scope)
- All plan follow-ups stand:
  - dev advisories: full audit shows 3 critical / 19 high, including the vitest family ≥ 4.1.11, knip and the prettier plugins; then a full `pnpm audit` gate
  - move vite and tailwind to devDependencies
  - add an inline-`<script>` check to the smoke test
  - add a CI guard for routeTree drift
  - scheduled audit or Dependabot
  - pnpm `minimumReleaseAge`
- Vite warns about `__dirname` in vite.config.ts:21 under the new vite ("Use `import.meta.dirname`"). Harmless today; a small follow-up.
