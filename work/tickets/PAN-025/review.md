## Attempt 1 — 2026-11-16
Verdict: PASS

Reviewed `git diff origin/main...HEAD` at `30a06b7` (code commit `6d28660`; later commits only touch `work/`).

### Checks (run by reviewer)
- pnpm typecheck: `tsc -b` exit 0, no errors
- pnpm lint: `eslint .` clean
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): Test Files 46 passed (46), Tests 277 passed (277). Matches impl-log.
- pnpm build: "built in 1.06s", exit 0
- pnpm api:types: regenerated, `git status` clean (no drift)
- pnpm e2e: not planned
- dist greps: `grep -rlE 'fonts\.(googleapis|gstatic)\.com' dist` and `grep -rlE 'googleapis|gstatic' dist` find nothing; `grep -rlE 'data:(font|application/font)' dist` finds nothing. 20 woff2 files in `dist/assets` (14 Inter normal + italic, 6 Manrope), 808K total. Matches impl-log.
- Docker: image built from a scratchpad copy of `HEAD` (`git archive`) whose Dockerfile only adds the proxy CA (`COPY proxy-ca.crt` + `NODE_EXTRA_CA_CERTS`). The build needed `--network host` for the sandbox proxy. Repo Dockerfile untouched. `bash scripts/smoke-image.sh admin-pan:rev https://api.mmlabs.online` printed "smoke test passed", including `CSP contains: style-src 'self' 'unsafe-inline';`, `CSP contains: font-src 'self';`, `CSP has no Google Fonts hosts`, `CSS references a woff2 asset`, `GET /assets/inter-cyrillic-ext-opsz-italic-*.woff2 200 font/woff2 immutable`, `font security headers`, `no Google Fonts hosts in the image`, `no inlined data: fonts`.
- PR #7 CI (head `30a06b7`): `check` success, `image` success.

### Acceptance criteria
- [x] `index.html` has no Google links or preconnects, and `dist/` makes no request to a Google host. Evidence: `index.html` diff removes lines 37-43; `src/styles/fonts.test.ts › index.html has no Google Fonts hosts` passes; the dist greps above are empty. In Chromium, both against `pnpm preview` and against the built nginx image (`:18080`), the page request listener recorded 0 non-localhost requests across `/settings/appearance` and `/audit-log`.
- [x] Font files are part of the build and served from `/assets/` with long-term caching. Evidence: 20 `dist/assets/*.woff2`. Against the real image, Chromium got `/assets/inter-latin-opsz-normal-BwkfbSeq.woff2` and `/assets/manrope-latin-wght-normal-DHIcAJRg.woff2` as 200 `font/woff2` with `public, max-age=31536000, immutable`, and the smoke checks passed. `vite.config.ts:24-27` never inlines woff/woff2.
- [x] The UI looks the same, and the switcher still works. Evidence: the test `› registers Inter Variable upright and italic, and Manrope Variable` covers weights 400-700 and italic, and `› theme maps font-inter / font-manrope …` passes. Built CSS has `.font-inter{font-family:Inter Variable,ui-sans-serif,system-ui,sans-serif}` and `.font-manrope{…Manrope Variable…}`. I checked it myself in Chromium against the built image:
  - Default `<html class="font-inter">` gives a body font of `"Inter Variable", …`, and `document.fonts.check('700 16px "Inter Variable"')` is true.
  - In Settings → Appearance I chose Light, chose Manrope and clicked "Update preferences". The body font became `"Manrope Variable", …`, then switched back to Inter.
  - CDP `CSS.getPlatformFontsForNode` reports a custom (web) font in each case: `Inter-Regular`, `Manrope` (variable default instance), and a real `Inter-Italic` for italic text, so no faux italic.
  - No CSP violations appeared in the console under the real nginx CSP.
- [x] nginx CSP `style-src 'self' 'unsafe-inline'; font-src 'self'`, no Google hosts, and the docs table is updated. Evidence: `nginx/security-headers.conf:1` matches the plan's string exactly. `docs/deploy.md:57` has the same string with the API origin, and `docs/deploy.md:66-67` no longer names Google Fonts.
- [x] The smoke script asserts the CSP has no Google hosts, and CI `image` is green. Evidence: `scripts/smoke-image.sh:84,89,113-121,140-141`. Local smoke passed. PR #7 `image` job: success.
- [x] All five checks pass, and the new packages are pinned exactly. Evidence: the checks are listed above. `package.json:24-25` has `"5.3.0"` with no range for both packages. The lockfile adds only these two packages, with no dependencies. Both are OFL-1.1, and the notices in `THIRD_PARTY_NOTICES.md` match the copyright lines in the packages' `LICENSE` files. The PR body must list both packages; the orchestrator does this when it finalises the PR.

### Issues
None

### Rules R1–R11
No violations found. R5: fonts are public static files, no config changes. R6: the CSP is tightened, and no HTML sinks were added. R7: every changed non-`work/` file is in the plan's file table. The plan listed the import order in `src/styles/fonts.ts` as upright then italic; the code has italic first because of prettier's import sorting, and this has no effect on behaviour. R8: tests were added, and all checks are green.

### Security / a11y blockers
None. `security-review.md` reports no blockers and no should-fix items. `a11y-review.md` reports no 🔴 and no 🟡.

### Nits (do not block)
- 💭 The Docker build still prints `Ignored build scripts: esbuild@0.25.11, esbuild@0.27.1`. This was there before this ticket and does not come from the font packages, which have no scripts. Plan AC6's wording "no Ignored build scripts warning" was meant for the new packages.
- 💭 Choosing a font in Settings → Appearance only applies when a theme radio is also selected, because the theme defaults to `system` and the form's zod enum is `light|dark`, so validation fails silently. This existed before this ticket and was not changed here.
- 💭 Chromium's own background traffic to `www.google.com` showed up in the proxy log during the browser runs. It is browser telemetry, not page requests: the page request listeners recorded none.

### Follow-ups (out of scope)
- Preload the Inter latin upright woff2 and add `size-adjust` fallback metrics (plan A4).
- Pin `pnpm` more tightly in the Dockerfile (appsec).
- Generate font utility classes with `@source inline(...)` instead of relying on the literal tokens in the `src/config/fonts.ts` comment (plan A7).
- Appearance form: allow `system` in the theme enum, or show the validation error, so that a font-only change is saved (pre-existing template bug).
