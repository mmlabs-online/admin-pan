Status: READY

# Plan — PAN-026: Upgrade dependencies with known security advisories

## Spec summary
The ticket cites `docs/spec-v1.md` §6 (non-functional: security) and CLAUDE.md R5/R8. The spec has no dependency-audit wording, so the scope comes from the ticket and these rules:
- Ticket goal: "Clear the `pnpm audit --prod` advisories (2 critical, 12 high, 7 moderate, 1 low on 2026-11-16) by upgrading the packages that pull them in, without changing app behaviour, and keep them from coming back unnoticed."
- CLAUDE.md R8: "`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` must pass."
- CLAUDE.md Stack: "Do not change the stack without the owner's explicit decision." Every bump below stays inside its current major (vite 8, zod 4, router 1.x, faker 10). Nothing is added and nothing is replaced.

Advisory targets (ticket table, confirmed by the appsec consult's `pnpm audit --prod --json`):

| Module | Locked today | Needs | Comes in via |
|---|---|---|---|
| seroval | 1.5.1 | ≥ 1.6.8 | @tanstack/router-core 1.168.15 |
| vite | 8.0.8 | ≥ 8.1.6 | direct (devDependency), and as the peer of @tailwindcss/vite |
| postcss | 8.5.8 | ≥ 8.5.23 | vite |
| nanoid | 3.3.11 | ≥ 3.3.18 | postcss |
| source-map-js | 1.2.1 | ≥ 1.2.2 | postcss, @tailwindcss/node 4.2.2 |
| zod | 4.3.6 | ≥ 4.6.6 | direct |
| @faker-js/faker (high, outside `--prod` but bundled; appsec finding 7) | 10.4.0 | ≥ 10.5.0 | direct (devDependency) |

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `pnpm audit --prod` reports no critical or high advisories. Any remaining moderate/low are listed in the PR with the reason they cannot be fixed yet. | Run `pnpm audit --prod --audit-level high`: exit 0. Run `pnpm audit --prod` and check that every remaining moderate/low appears in the impl-log's "Remaining advisories" table, which is also the source for the PR text. The expected result is no rows: the vite bump clears all of vite's moderate/low items. |
| 2 | Fixed by upgrading parents where possible; `pnpm.overrides` only where no parent release exists yet, each with a comment and a follow-up. | `package.json` has no `pnpm` key, or if one exists, each override has a matching impl-log entry with its reason and a follow-up. `pnpm why seroval postcss nanoid source-map-js zod` shows only patched versions: seroval ≥ 1.6.8, postcss ≥ 8.5.23, nanoid 3.x ≥ 3.3.18, source-map-js ≥ 1.2.2, and zod 4.x ≥ 4.6.6 (zod 3.25.76 dev-only under router-plugin is allowed, see Assumptions A6). `grep -c "^  '@tanstack/router-core@" pnpm-lock.yaml` returns 1, and `grep -cE "^  vite@" pnpm-lock.yaml` returns 1. |
| 3 | Lockfile updated, `--frozen-lockfile` clean in CI, no unrelated version bumps. | 1. `rm -rf node_modules && pnpm install --frozen-lockfile` succeeds. 2. In `git diff package.json`, only the specifiers listed under Files change. 3. In `git diff pnpm-lock.yaml`, the only `importers` entries that change are those specifiers, and the changed `packages:`/`snapshots:` entries belong to their subtrees (router packages, seroval/seroval-plugins, vite and its subtree: rolldown, @rolldown/*, lightningcss*, postcss, nanoid, source-map-js, tinyglobby/picomatch if vite's range moves them; zod; faker; and conditionally @hookform/resolvers or the vitest family, see Approach step 6). 4. No `tarball:`, git URLs or non-`registry.npmjs.org` resolutions. 5. CI `check` and `image` are green. |
| 4 | App behaviour unchanged: typecheck, lint, format:check, test, build pass; `src/routeTree.gen.ts` regenerated if needed; image builds and `scripts/smoke-image.sh` passes; CI `check` and `image` green. | Run `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, all exit 0. After `pnpm build`, `git diff --stat src/routeTree.gen.ts` is empty or shows generated-only changes. On `dist/index.html`: no `<script>` without `src=` (`grep -E '<script(?![^>]*src=)'` style check, or `grep -o '<script[^>]*>' dist/index.html`, where every tag has `src=`); no new external origins; `find dist -name '*.map'` is empty; `grep -rl seroval dist/assets` is empty. Then `docker build --build-arg VITE_API_BASE_URL=https://api.mmlabs.online --build-arg VITE_APP_KEY=admin -t admin-pan:ci . && bash scripts/smoke-image.sh admin-pan:ci https://api.mmlabs.online` prints "smoke test passed" (or CI `image` green). |
| 5 | CI runs `pnpm audit --prod --audit-level high` so new high/critical advisories fail the build. | `.github/workflows/ci.yml` has a job `audit` whose step runs exactly `pnpm audit --prod --audit-level high`, with no `continue-on-error` and no `|| true`. It runs on the same triggers as `check`, and the CI run on the PR shows it green. Negative check by reading only: before this ticket's lockfile change, the same command exits non-zero (the appsec consult reproduced 2 critical and 12 high). |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `package.json` | Raise the caret floors (keep the `^`) of: `@tanstack/react-router`, `@tanstack/router-plugin`, `@tanstack/react-router-devtools` (one set), `vite`, `zod`, `@faker-js/faker`. Conditionally (step 6) also `@hookform/resolvers` within 5.x and/or the vitest family within 4.x. No other specifier changes. No `pnpm.overrides` unless step 5's fallback applies. | AC1, AC2 |
| `pnpm-lock.yaml` | Regenerated by targeted `pnpm update` / `pnpm install`. Transitive packages refreshed in range. | AC1, AC3 |
| `.github/workflows/ci.yml` | Add an `audit` job: `actions/checkout@v4` → `pnpm/action-setup@v4` (`version: 10`) → `actions/setup-node@v4` (`node-version-file: .node-version`) → `run: pnpm audit --prod --audit-level high`. Same action refs and style as `check`. | AC5 |
| `src/routeTree.gen.ts` | Only if `pnpm build`/`pnpm dev` with the new router-plugin regenerates it. Commit the generated output as-is and never hand-edit it. | AC4 |
| Test files under `src/features/*/` | Only if the faker bump changes seeded mock values that a test asserts verbatim (Risk K3). Update the expected literal to the new seeded value and record each file in impl-log. No change to the logic under test. | AC4 (faker bump) |

No other files. `vite.config.ts`, `Dockerfile`, `nginx/*` and `scripts/smoke-image.sh` stay unchanged (see Specialist input: the smoke inline-script check is a follow-up).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| None new (no new logic). The existing suite (`pnpm test`, browser mode) is the regression net for the zod, router, vite and faker bumps: form schemas, `validateSearch` `.catch()` fallbacks, `src/api/errors.test.ts` envelope parsing, route rendering. | AC4 |
| CI job `audit` › `pnpm audit --prod --audit-level high` | AC1, AC5 (the gate itself is the test) |
| CI job `image` › `scripts/smoke-image.sh` | AC4 (CSP, fonts-not-inlined, no `.map`, headers after the vite/rolldown bump) |

## Approach
Order matters, and each step is verified before the next. Run `pnpm` with the repo's Node from `.node-version` and pnpm 10.

1. **Baseline.** Run `pnpm install --frozen-lockfile` and `pnpm audit --prod --json > <scratch>/before.json`. Record the counts in impl-log (they should match 2/12/7/1).

2. **Choose versions (release-age rule).** For each direct package, run `pnpm view <pkg> time --json` and `pnpm view <pkg>@<v> dependencies peerDependencies`. Pick the **newest version that is ≥ the fix and was published ≥ 7 days before today**. If no fixed version is that old, take the **oldest** fixed version and note it in impl-log. Record every chosen version and its publish date.
   - **Router set** (`@tanstack/react-router`, `@tanstack/router-plugin`, `@tanstack/react-router-devtools`): choose one consistent train. Its `@tanstack/router-core` must declare `seroval`/`seroval-plugins` with a range whose resolution is ≥ 1.6.8 (registry facts: router-core 1.171.39 has `^1.6.7`). The peers must line up: router-plugin's peer on react-router, and devtools' peers on react-router and router-core (registry: router-plugin 1.169.0 needs react-router `^1.170.46`; devtools 1.167.3 needs router-core `^1.171.39`). If the release-age rule and the coupling conflict, coupling wins: take the lowest coupled set that fixes seroval, and note it.
   - **vite**: newest 8.x ≥ 8.1.6 meeting the age rule (8.3.8 is 5 days old, so likely an earlier 8.2/8.3 patch). Confirm its `postcss` range has a floor ≥ 8.5.23, or at least admits it.
   - **zod**: 4.6.6 or 4.6.7, whichever meets the age rule. Range `^4.6.x`.
   - **faker**: the newest 10.x ≥ 10.5.0 meeting the age rule. Stay in major 10. If the fix only exists in 11.x, drop the faker bump and record a follow-up (see A3).
   - **Tailwind**: no bump. `@tailwindcss/node@4.2.2` declares `source-map-js ^1.2.1` (registry facts), so an in-range refresh clears it. `@tailwindcss/vite`'s vite and postcss findings come through its vite peer, which the vite bump fixes. This avoids the generated-CSS change of 4.2 → 4.3.

3. **Upgrade the parents with targeted commands only** (never a blanket `pnpm update`):
   `pnpm add @tanstack/react-router@^<v>` then `pnpm add -D @tanstack/router-plugin@^<v> @tanstack/react-router-devtools@^<v> vite@^<v> @faker-js/faker@^<v>`, and `pnpm add zod@^<v>`. Keep each package in its current section (`dependencies` vs `devDependencies`, unchanged).

4. **Refresh vulnerable transitives in range** (not overrides): `pnpm update seroval seroval-plugins postcss nanoid source-map-js` (pnpm updates matching transitive deps within their declared ranges). Then run `pnpm why seroval postcss nanoid source-map-js zod vite @tanstack/router-core` and confirm:
   - one `@tanstack/router-core`
   - one `vite` 8.x, shared by tailwind, router-plugin, plugin-react and vitest
   - patched versions everywhere

   If an old copy persists, try `pnpm dedupe`. Check that its lockfile diff touches only packages in AC3's list, and revert any unrelated movement.

5. **Overrides fallback, only if step 4 cannot reach a patched version because no parent release admits it.** Add a scoped override in `package.json` `"pnpm": {"overrides": {"<parent>>pkg": ">=<fix>"}}`. JSON has no comments, so put the reason in a sibling `"//"` key or in impl-log. Record a follow-up to remove it. Not expected per registry facts.

6. **Verify the app (R8).** Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (set `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` in the sandbox), then `pnpm build`.
   - If `tsc` fails at `zodResolver` call sites with zod 4.6, bump `@hookform/resolvers` to the newest **5.x** that typechecks. Do not use 7.x, which is a major version.
   - If vitest browser mode breaks with the new vite, bump `vitest`, `@vitest/browser-playwright`, `@vitest/coverage-v8` and `@vitest/ui` together within **4.x**. Prefer ≥ 4.1.11, since that also clears the dev criticals (A5). Do not move to 5.x.
   - Record each conditional bump in impl-log with the error that forced it.
   - If a test fails because seeded faker output changed (K3), update only the expected literal.
   - If zod changes a user-visible message that a test asserts, stop and record it in impl-log. Do not edit schemas (R7). Report it as a behaviour change for the reviewer to judge.

7. **Route tree.** After `pnpm build`, commit `src/routeTree.gen.ts` if it changed (generated only).

8. **Bundle and CSP re-check.** On `dist/` (appsec "Re-verify after the upgrade"):
   - every `<script>` in `dist/index.html` has `src=`
   - no new external origins
   - no `*.map` files
   - no `data:` fonts
   - no `seroval` symbols in `dist/assets`

   Then build the Docker image and run `scripts/smoke-image.sh` (or rely on CI `image`).

9. **CI gate.** Add the `audit` job (Files table). It runs in parallel with `check` and needs no `pnpm install`, because `pnpm audit` reads the lockfile. Check locally that `pnpm audit --prod --audit-level high` exits 0.

10. **impl-log** must contain:
    - chosen versions and their publish dates
    - before/after audit counts (prod, and full audit for information)
    - a "Remaining advisories" table (module, severity, path, reason, follow-up) for the PR
    - the exposure statement for the PR: "Runtime-reachable before fix: zod (client self-DoS via crafted URL, low) and faker (bundled via mock data; `helpers.fake` not called). seroval: in tree, not bundled. vite/postcss/nanoid/source-map-js: build/dev tooling, not in the image."

Rules:
- R5: no secrets; the audit is read-only against the registry.
- R7: only the listed specifiers, and a follow-ups list for the rest.
- R8: all checks green.
- R6: CSP unchanged and re-verified.
- R1–R4 and R9–R11: not touched (no screen, API or auth change).
- Stack unchanged (same majors).

## Specialist input used
- **appsec #1–6 (exposure per advisory):** adopted for the PR exposure statement.
- **appsec #7, faker bundled and missed by `--prod`:** adopted, faker bump in scope (orchestrator guidance; minor bump, same major).
- **appsec #8 / architect R-i, full-dependency audit and dev criticals (vitest `@vitest/browser` < 4.1.10):** rejected for this diff and recorded as a follow-up (the gate stays at the AC). It gets fixed for free only if step 6 has to bump vitest anyway.
- **appsec #9 (no `onlyBuiltDependencies`; stop on new "Ignored build scripts" other than esbuild):** adopted as an implementer check in step 4.
- **appsec #10 / architect R-a (router set moves together; one router-core):** adopted (step 2, AC2 grep).
- **appsec #10 (Tailwind moves with tailwindcss):** not needed. Registry facts show the source-map-js fix is in range, so there is no Tailwind bump, in line with architect R-c (safest path, avoids CSS changes).
- **appsec #11 (add a smoke check for inline `<script>`):** adopted as a reviewer verification on `dist/index.html` (AC4). Adding it to `scripts/smoke-image.sh` is a follow-up, to keep the diff to the AC (R7).
- **appsec `ignoreGhsas` policy:** not needed, since no unfixable high/critical is expected. If one appears, stop and record it (see A7) rather than adding an allowlist.
- **appsec "lockfile integrity" and architect R-f:** adopted in AC3.
- **appsec "release age" and orchestrator guidance:** adopted as the step 2 rule.
- **architect R-b (vite caret floor; confirm postcss):** adopted.
- **architect R-d (zod `^4.6.x`; resolvers within 5.x only if needed; leave zod 3.25.76):** adopted.
- **architect R-e (no overrides expected; scoped if forced):** adopted (step 5).
- **architect R-g (regenerate the route tree):** adopted. The CI guard for routeTree drift is a follow-up.
- **architect R-h (separate `audit` job, no install):** adopted. Note: the repo uses tag refs (`@v4`), not SHA pins, so the job copies the existing refs exactly.
- **architect Risks (two router-core copies, zod message changes, rolldown chunking, vitest + new vite):** adopted as checks in steps 4, 6 and 8.
- **Architect open Q3 (scheduled audit) and Dependabot:** follow-ups.

## Assumptions
- **A1. Range style.** Caret specifiers stay caret, and only their floors are raised to the chosen patched versions. No range is converted to an exact pin, and no exact pin is touched.
- **A2. Release age.** Take the newest version that fixes the advisory and was published at least 7 days ago. Otherwise take the oldest fixed version, and note it either way. The router peer coupling outranks the age rule. Transitive packages resolve to the newest version in range (for example postcss may land on a very new 8.5.x). That is accepted and recorded, and pnpm `minimumReleaseAge` is a follow-up.
- **A3. faker.** Bump faker within major 10 to the first version at or above 10.5.0 that meets A2. If the fix exists only in a new major, skip it and file a P1 follow-up instead.
- **A4. Tailwind.** No Tailwind bump. The AC's "where possible" is met, because `@tailwindcss/vite`'s advisories come through its vite peer and through `@tailwindcss/node`'s in-range `source-map-js`.
- **A5. CI gate scope.** The blocking gate is exactly `pnpm audit --prod --audit-level high`. A full audit and the devDependency criticals are follow-ups unless step 6 bumps vitest anyway.
- **A6. zod 3.25.76.** zod 3.25.76 inside `@tanstack/router-plugin`/`router-generator` is a build-time-only dependency and outside `--prod`. Leave it unless the new router-plugin drops it, and list it in impl-log if the full audit flags it.
- **A7. Unfixable high/critical.** If a high or critical advisory remains with no fixed parent and no override is possible, this becomes a blocking escalation and is not allowlisted silently. This is not expected, because registry facts show fixes exist for every item.
- **A8. Moving build tools to devDependencies.** `vite`, `@tailwindcss/vite` and `tailwindcss` stay in their current sections. Moving them is a follow-up (CI policy).

## Blocking questions
None.

## Split proposal
None. The diff is small: package.json, ci.yml, the lockfile, and possibly the generated route tree and test literals.

## Screens
None. No screen changes; behaviour must stay unchanged.

## API calls used
None.

## Follow-ups (for the backlog; not in this diff)
- Clear devDependency advisories (vitest family ≥ 4.1.11 / `@vitest/browser` criticals, devtools seroval copy if any, knip `smol-toml`, prettier plugin `lodash-es`/`minimatch`/`brace-expansion`, `ws`, `picomatch`, `browserslist`). Then add a full `pnpm audit --audit-level high` gate.
- Move `vite`, `@tailwindcss/vite` and `tailwindcss` to `devDependencies` so `--prod` means "shipped".
- Keep faker and mock data out of the production bundle once screens move to the real API.
- Add a smoke check in `scripts/smoke-image.sh` that `index.html` has no inline `<script>`.
- Add a CI guard: `git diff --exit-code src/routeTree.gen.ts` after build.
- Add a scheduled (cron) run of the audit job, plus Dependabot/Renovate security updates.
- Set pnpm `minimumReleaseAge`.
- If an advisory is ever unfixable: an `ignoreGhsas` policy with a dated, ticket-tracked entry (owner decision).
