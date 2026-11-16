PAN-026 consult (software-architect, read-only)

**Limitation, please read first.** This session only had Read/Grep/Glob. I could not run `pnpm view`, `pnpm why` or `pnpm audit`, and the "needs ≥" versions in the ticket are newer than anything I know about. So I could not confirm which exact releases of the router packages, vite, tailwind or zod carry the fixes. Everything below comes from `package.json`, `pnpm-lock.yaml`, the config files and the source. Each version question has a verification command the planner or implementer must run before it goes into the plan.

## Findings

1. **Locked versions today** (from `/home/user/admin-pan/pnpm-lock.yaml`):
   - `@tanstack/react-router` 1.168.22, `router-core` 1.168.15, `router-plugin` 1.167.22, `router-generator` 1.166.32, `react-router-devtools` 1.166.13, `router-devtools-core` 1.167.3.
   - `router-core` pulls `seroval` 1.5.1 and `seroval-plugins` 1.5.1. Every router package depends on that one `router-core`.
   - `vite` 8.0.8 pulls `postcss` 8.5.8, `rolldown` 1.0.0-rc.15 and `lightningcss` 1.32.0.
   - `postcss` 8.5.8 pulls `nanoid` 3.3.11 and `source-map-js` 1.2.1.
   - `@tailwindcss/vite`, `@tailwindcss/node` and `tailwindcss` are all 4.2.2. `@tailwindcss/node` pulls `source-map-js` 1.2.1.
   - `zod` 4.3.6 is the direct dependency. It is also used, dev-only, by `eslint-plugin-react-hooks` 7.1.1, `zod-validation-error` and `knip`. `zod` 3.25.76 is a second copy, dev-only, inside `router-plugin` and `router-generator`.
   - `@hookform/resolvers` 5.2.2 (peer: `react-hook-form`). `vitest` and all `@vitest/*` are exactly 4.1.4. `@vitejs/plugin-react` 6.0.1.

2. **Why `--prod` reports build tools.** `@tailwindcss/vite` and `tailwindcss` sit in `dependencies` (`package.json:45,64`). That is the only reason vite, postcss, nanoid and source-map-js count as "prod". This is a static SPA (the Dockerfile builds `dist/` and ships only nginx plus static files), so the build tools never run in production.
   - Shipped in the bundle: only `seroval` (through `router-core`) and `zod`.
   - The vite advisories matter for developer machines (dev server) and for the build, not for users.

3. **seroval exposure.** `router-core` uses seroval for SSR dehydration and hydration. This SPA has no SSR and never deserializes untrusted seroval payloads, so the critical path is very probably not reachable at runtime. It is still in the bundle and must still be fixed.

4. **Peer ranges allow the bumps without a major version:**
   - `@tailwindcss/vite` peer: `vite ^5.2||^6||^7||^8`
   - `router-plugin` peer: `vite >=5…>=8`, `@tanstack/react-router ^1.168.21`
   - `@vitejs/plugin-react` peer: `vite ^8.0.0`
   - `@vitest/mocker` peer: `vite ^6||^7||^8`
   - `react-router-devtools` peers: `react-router ^1.168.15`, `router-core ^1.168.11`
   - Node 22 (`.node-version`, `node:22-alpine`) meets vite 8's `^20.19 || >=22.12`.
   - So vite 8.0.8 → 8.1.x and zod 4.3 → 4.6 are both minor bumps inside the current major, and the router stays on the 1.x train.

5. **TanStack Query is not involved.** Neither `@tanstack/react-query` nor `@tanstack/react-query-devtools` depends on seroval. Bumping them would be an unrelated bump (AC3).

6. **Runtime zod use is wide.** About 49 files use it:
   - route `validateSearch` schemas use zod v4 directly through Standard Schema, with `.catch()` (e.g. `src/routes/_authenticated/users/index.tsx`)
   - every form uses `@hookform/resolvers/zod`
   - `src/api/errors.ts` parses the API error envelope at runtime
   - `src/lib/password-errors.ts` parses 422 details

   The Router and Query devtools render only when `MODE === 'development'` (`src/routes/__root.tsx:19`).

7. **pnpm keeps old transitive versions.** When a parent is updated, pnpm keeps a locked transitive version (`postcss`, `nanoid`, `source-map-js`, `seroval`) if it still satisfies the parent's range. So bumping vite or the router alone may not move the transitive packages.

8. **CI today** (`.github/workflows/ci.yml`): one `check` job (install → api:types diff → typecheck → lint → format → test → build) and one `image` job. There is no audit step. pnpm comes from `pnpm/action-setup` `version: 10`, and the Dockerfile uses `pnpm@10`.

## Recommendations

**R-a: Router packages move as one set (AC1, AC2, AC4).**
- Bump `@tanstack/react-router`, `@tanstack/router-plugin` and `@tanstack/react-router-devtools` together to the lowest release train whose `router-core` declares `seroval` and `seroval-plugins` ≥ 1.6.8.
- Do not touch react-query.
- Check before choosing:
  - `pnpm view @tanstack/router-core@<v> dependencies`
  - `pnpm view @tanstack/react-router@<v> dependencies`
  - `pnpm view @tanstack/router-plugin@<v> dependencies peerDependencies`
  - `pnpm view @tanstack/react-router-devtools@<v> peerDependencies`
- The lockfile must end with exactly one `@tanstack/router-core@` entry. A second copy breaks router context and `Link` typing.
- If `router-core`'s seroval range already admits 1.6.8, an explicit `pnpm update seroval seroval-plugins` would also work. AC2 still prefers the parent bump.

**R-b: vite (AC1, AC2).**
- Raise the specifier to `^8.1.6` (or the first fixed 8.x).
- Then confirm vite's own `postcss` range resolves to ≥ 8.5.23. If it doesn't, run `pnpm update postcss nanoid source-map-js` (an in-range transitive refresh, not an override).
- After install, check with `pnpm why vite postcss nanoid source-map-js` that there is exactly one `vite@8.x` entry. Tailwind, the router plugin, plugin-react and vitest must all share it.

**R-c: Tailwind (AC2, AC4).**
- Bump Tailwind only if `@tailwindcss/node@4.2.2`'s `source-map-js` range does not admit ≥ 1.2.2. Check with `pnpm view @tailwindcss/node@4.2.2 dependencies`.
- If it is a caret range, refreshing the transitive fixes it with no Tailwind change. This is the safest path, because a Tailwind minor bump can change generated CSS.
- If a bump is needed, bump `@tailwindcss/vite` and `tailwindcss` to the same version (they are pinned to each other). Take the lowest patch that works, ideally still 4.2.x.

**R-d: zod (AC1, AC4).**
- Raise the specifier to `^4.6.6`.
- Confirm `@hookform/resolvers` 5.2.2 still typechecks against it. 5.x targets zod v4 through `zod/v4/core`, and earlier 5.x releases had type breaks on zod 4.1+. If `tsc` fails in resolver call sites, bump resolvers within 5.x (check with `pnpm view @hookform/resolvers versions`) rather than using an override.
- Optionally let `pnpm dedupe` fold the dev-only `zod@4.3.6` copies onto the new version. That counts as related to this ticket, not as an unrelated bump.
- Leave `zod@3.25.76` (inside router-plugin) as it is unless the new router-plugin drops it. It is dev-only and outside `--prod`. If the zod advisory also covers 3.x, list it in the PR as dev-only.

**R-e: No `pnpm.overrides` expected (AC2).** Every fix appears reachable inside existing parent ranges. Use an override only if a check above shows a parent pins an exact vulnerable version and no fixed parent release exists. In that case:
- put it in `package.json` `"pnpm": {"overrides": …}` (there is no `pnpm-workspace.yaml`)
- use a scoped selector such as `"@tanstack/router-core>seroval": ">=1.6.8"` rather than a global one
- add a comment and a follow-up ticket to remove it.

**R-f: Lockfile check (AC3).**
- Run `pnpm install` locally, then `pnpm install --frozen-lockfile` from a clean `node_modules`.
- Review the lockfile diff so that only the router packages, vite and its subtree, the transitive packages named in the ticket, zod (and resolvers or Tailwind only if needed) change.
- `rolldown` and `lightningcss` moving with vite is expected. Anything else is a red flag.

**R-g: route tree and checks (AC4).**
- Run `pnpm build` or `pnpm dev` once so the plugin regenerates `src/routeTree.gen.ts`, and commit any diff. The file is generated and its header and format can change between plugin versions; that is cosmetic.
- Add a CI guard like the existing `api:types` one, for example `git diff --exit-code src/routeTree.gen.ts` after `pnpm build`. This is optional and could be a follow-up.
- Then run typecheck, lint, format:check, test (browser mode), build, the Docker build and `scripts/smoke-image.sh`.

**R-h: CI audit (AC5).** Add a separate `audit` job next to `check`, rather than a step inside `check`:
- steps: checkout → pnpm/action-setup → `pnpm audit --prod --audit-level high`
- no `pnpm install` is needed, because audit reads the lockfile
- it runs in parallel, fails fast, and a red result points clearly at advisories rather than at code
- if it must be a step in `check` instead, put it right after `pnpm install --frozen-lockfile`
- use the same SHA-pinned action refs as the other jobs.

**R-i (follow-up, not in this diff, R7):**
- Move `@tailwindcss/vite` and `tailwindcss` to `devDependencies` so that `--prod` means "shipped in the bundle". Pair it with a non-blocking full `pnpm audit --audit-level high` so build tools stay covered. That is a CI policy change for the owner.
- Add a `schedule:` trigger on the audit job, so advisories published between PRs show up without a new commit.

## Risks

- **Two `router-core` copies** if the router packages are bumped unevenly. The symptoms are type errors in `createFileRoute`/`Link` or runtime "router not found" errors. Mitigation: the one-copy check in R-a.
- **zod minor-version changes can alter behaviour:** default error message text, the stricter `z.email()`/`z.url()` patterns, `.catch()`/`.default()` inference with resolvers (`z.input` vs `z.output`). The visible effect is form validation messages, search-param fallback values, and the error-envelope parse in `src/api/errors.ts`. Existing form tests and `errors.test.ts` should catch this; read their snapshots and messages instead of rewriting them blindly.
- **vite 8.0 → 8.1 changes the bundler.** It brings a newer `rolldown` RC, which can change chunking and hashes, and `assetsInlineLimit` must still keep fonts as files (the CSP `font-src 'self'`). The Dockerfile's "no `.map` or dotfiles in dist" check and the smoke test cover part of this. Also check that no `data:` fonts appear in the built CSS.
- **Vitest browser mode with the new vite.** `vitest` and `@vitest/*` 4.1.4 accept vite 8 by peer range, but a vite minor can still break the browser-mode server and optimizer. If `pnpm test` breaks, bump vitest, `@vitest/browser-playwright`, `@vitest/coverage-v8` and `@vitest/ui` together within 4.x (they pin each other exactly). That bump is justified by this ticket.
- **`pnpm audit` depends on the registry's advisory endpoint.** An outage or an endpoint change in npm can make CI red with no code change. Keeping it as its own job (R-h) contains that. Pinning a pnpm 10 minor version that is known to work with the current endpoint is advisable.
- **The numbers may still be off.** If no released version of a parent yet carries the fix (unverified here), AC1 forces an override. Use R-e and record the follow-up.
- **A Tailwind bump** (only if forced) can change generated utilities, for example the default border or ring colours. That is a visual behaviour change.

## Open questions

1. Which exact releases ship the fixes? Run the `pnpm view` commands in R-a to R-d before PLAN is final. If a parent release does not exist, the owner should confirm that a scoped override is acceptable.
2. Should the CI audit block only on `--prod` (per AC5), or also run a non-blocking full audit for build tools? This decides whether R-i's move to devDependencies is worth doing.
3. Should the scheduled (cron) audit run be part of this ticket ("keep them from coming back unnoticed"), or a follow-up? Note that Dependabot was proposed in PAN-022's follow-ups and is not in this repo yet.
4. If zod's error-message text changes and a test asserts on the old text, should the test change, or should the app set explicit messages? I suggest explicit messages in the schemas only where the UI shows them, but that moves toward R7 scope.

Files consulted: `/home/user/admin-pan/package.json`, `/home/user/admin-pan/pnpm-lock.yaml`, `/home/user/admin-pan/vite.config.ts`, `/home/user/admin-pan/.github/workflows/ci.yml`, `/home/user/admin-pan/Dockerfile`, `/home/user/admin-pan/.node-version`, `/home/user/admin-pan/src/routeTree.gen.ts`, `/home/user/admin-pan/src/routes/__root.tsx`, `/home/user/admin-pan/src/routes/_authenticated/users/index.tsx`, `/home/user/admin-pan/src/api/errors.ts`, `/home/user/admin-pan/src/lib/password-errors.ts`, `/home/user/admin-pan/work/tickets/PAN-025/security-review.md`, `/home/user/admin-pan/work/tickets/PAN-022/consult-appsec-engineer.md`.
