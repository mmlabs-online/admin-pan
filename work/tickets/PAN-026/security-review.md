## Attempt 1

**Verdict: no blockers.** The supply-chain side is clean, the new gate blocks, and the advisories are fixed by upgrading parent packages (no overrides).

### Checked
- `pnpm audit --prod --audit-level high`: "No known vulnerabilities found", exit 0 (0 low/moderate/high/critical, 287 deps).
- Lockfile, one copy each:
  - seroval 1.5.1 → 1.8.1
  - @tanstack/router-core 1.168.15 → 1.171.39
  - vite 8.0.8 → 8.3.6
  - postcss 8.5.8 → 8.5.33
  - nanoid 3.3.11 → 3.3.20
  - source-map-js 1.2.1 → 1.2.2
  - zod 4.3.6 → 4.6.7 (dev zod 3.25.76 gone)
  - faker 10.4.0 → 10.6.0
- No `pnpm.overrides`.
- All 620 resolutions are sha512 integrity; no tarball/git/custom registry; no .npmrc.
- New package names are only on expected paths (rolldown bindings, lightningcss, @babel/*, a second prettier via router-generator, jiti, picomatch, tinyglobby, get-tsconfig).
- No new install scripts. esbuild is still the only build-script package and pnpm 10 still ignores it.
- CI `audit` job (`ci.yml:36-46`):
  - runs exactly `pnpm audit --prod --audit-level high`
  - no continue-on-error
  - inherits `permissions: contents: read`
  - no `pnpm install`
  - fails closed if the registry is unreachable
- `src/routeTree.gen.ts`: sorted line multiset identical to origin/main (reorder only).
- dist:
  - one external module script, no inline script
  - no `*.map` files
  - no seroval
  - no eval / new Function
  - CSP unaffected

### Findings
- 🟡 The full audit still reports 3 critical in the test toolchain: `@vitest/browser` < 4.1.10 (via @vitest/browser-playwright), plus `ws` < 8.21.0 (high). These are local dev-server risks during `pnpm test`. Out of scope per plan A5; next P1 ticket: bump the vitest family to ≥ 4.1.10/4.1.11, then widen the gate to the full audit at `high`.
- 💭 tsx@4.20.3 (optional peer of vite) moved esbuild 0.25.11 → 0.25.12 and get-tsconfig 4.13.7 → 4.14.3. Dev-only. In the PR text, describe the esbuild "ignored build scripts" warning as pre-existing in kind, with a new patch version.
- 💭 The `audit` job has no `timeout-minutes` (optional: 5).

### Follow-ups
- Dev toolchain advisories:
  - vitest family
  - prettier-plugin-sort-imports (minimatch, brace-expansion, lodash-es)
  - @typescript-eslint brace-expansion
  - browserslist via @babel/core
  - knip smol-toml/picomatch

  After these are fixed, gate the full audit at high.
- Move vite/@tailwindcss/vite/tailwindcss to devDependencies, only together with the full-audit gate.
- Pin GitHub Actions by SHA and pin the exact pnpm version.
- Scheduled audit plus Dependabot/Renovate; pnpm `minimumReleaseAge`.
- No-inline-script check in smoke-image.sh.
- CI drift guard for routeTree.gen.ts.
