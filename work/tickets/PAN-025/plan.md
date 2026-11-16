Status: READY

# Plan — PAN-025: Self-host the Inter and Manrope fonts

## Spec summary
`docs/spec-v1.md` §6 Non-functional:
> - No secrets in the bundle; access token in memory only (R3, R5). Security headers via nginx (R6).

`docs/spec-v1.md` §6.1 Deployment:
> - Static files in an nginx image; release/deploy like org-admin-api: ...

CLAUDE.md R6: "Security headers (CSP, `frame-ancestors 'none'`, `Referrer-Policy`) are set in the nginx config."

Ticket owner note (2026-11-16): "Google Fonts loads slowly — move the fonts to our own server. Supersedes the PAN-022 note 'Keep Google Fonts'."

Flag (no scope impact): the ticket's spec reference paraphrases §6 as "no third-party dependencies where avoidable"; that wording is not in `docs/spec-v1.md` §6. The ticket's scope is set by the owner note, and it does not conflict with the spec. The spec does not need changing.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `index.html` has no `fonts.googleapis.com` / `fonts.gstatic.com` links or preconnects; the built `dist/` makes no request to any Google host | `src/styles/fonts.test.ts › index.html has no Google Fonts hosts`. After `pnpm build`: `grep -rlE 'fonts\.(googleapis\|gstatic)\.com' dist` prints nothing. Smoke check "no Google Fonts hosts in the image" passes. |
| 2 | Inter and Manrope font files are part of the build and served from our origin under `/assets/` (long-term cached like other hashed assets) | After `pnpm build`: `ls dist/assets/*.woff2` lists Inter (upright and italic) and Manrope files. `grep -rlE 'data:(font\|application/font)' dist/assets` prints nothing. Smoke checks "CSS references a woff2 asset", "GET <font> 200 font/woff2 immutable" and "font security headers" pass. |
| 3 | The UI looks the same: the default font and the Settings → Appearance switcher still switch between Inter and Manrope, including the weights in use | `src/styles/fonts.test.ts › registers Inter Variable upright and italic, and Manrope Variable` (FontFace loads for weights 400/500/600/700, Inter italic) and `› theme maps font-inter / font-manrope to the self-hosted families`. Manual check: `pnpm dev` (or `pnpm preview`), open `/settings/appearance`, switch Inter ↔ Manrope. Text changes typeface, bold weights are real (not faux bold), the italic text in the audit log "System" actor cell is a true italic, and DevTools → Network shows only `/assets/*.woff2` (or `/node_modules/...` in dev), no Google host. |
| 4 | nginx CSP: `style-src` and `font-src` allow only `'self'` (plus `'unsafe-inline'` styles); no Google hosts; `docs/deploy.md` header table updated | Read `nginx/security-headers.conf` line 1: it is exactly the CSP in Approach step 6. `docs/deploy.md` table row is the same string (with `https://api.mmlabs.online`), and the "Why the external origins" paragraph no longer names Google Fonts. Smoke checks "CSP contains: style-src 'self' 'unsafe-inline';", "CSP contains: font-src 'self';" and "CSP has no Google Fonts hosts" pass. |
| 5 | `scripts/smoke-image.sh` asserts the CSP contains no `fonts.googleapis.com` / `fonts.gstatic.com`, and the CI `image` job stays green | Read the script diff (Approach step 7). Run `docker build --build-arg VITE_API_BASE_URL=https://api.mmlabs.online --build-arg VITE_APP_KEY=admin -t admin-pan:ci . && bash scripts/smoke-image.sh admin-pan:ci https://api.mmlabs.online` where Docker is available. Otherwise use the CI `image` job on the PR, which must be green. |
| 6 | `pnpm typecheck`, `lint`, `format:check`, `test`, `build` pass; any new package is pinned exactly and listed in the PR | Run all five commands. `package.json` has `"@fontsource-variable/inter": "<x.y.z>"` and `"@fontsource-variable/manrope": "<x.y.z>"` with no `^` or `~`. `pnpm install --frozen-lockfile` is clean, with no "Ignored build scripts" warning. The impl-log (and later the PR body) lists both packages with version, license `OFL-1.1`, and "no install scripts, no dependencies". |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `package.json` | Add `@fontsource-variable/inter` and `@fontsource-variable/manrope` to `dependencies`, exact versions (`pnpm add -E`) | AC2, AC6. The files get bundled. |
| `pnpm-lock.yaml` | Updated by `pnpm add` (integrity hashes) | AC6; `--frozen-lockfile` in CI and Docker |
| `src/styles/fonts.ts` (new) | Side-effect-only module. Imports the three Fontsource CSS files (step 3), with a short comment on why each is there. | One explicit list of font faces. Shared by `main.tsx` and the test, so the test checks what ships. |
| `src/main.tsx` | Add `import './styles/fonts'` right before `import './styles/index.css'` | AC2, AC3. Vite bundles the fonts. |
| `index.html` | Remove the `<!-- font family -->` comment, both preconnects and the Google stylesheet `<link>` (lines 37-43) | AC1 |
| `src/styles/theme.css` | Lines 64-65 become `--font-inter: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;` and `--font-manrope: 'Manrope Variable', ui-sans-serif, system-ui, sans-serif;` | AC3. Fontsource registers the `* Variable` family names. This also fixes the quoted `'sans-serif'` fallback (consult-frontend finding). |
| `src/config/fonts.ts` | Rewrite only the doc comment: "install `@fontsource-variable/<font>` pinned exactly, import its CSS in `src/styles/fonts.ts`, add `--font-<name>: '<Family> Variable', ...` in `src/styles/theme.css`". Do not mention Google Fonts or `index.html`. **Keep the literal tokens `font-inter` and `font-manrope` in the comment** (see Assumptions A7). The `fonts` array is unchanged. | Stops anyone re-adding Google links (appsec finding 1) |
| `src/styles/fonts.test.ts` (new) | Browser-mode tests (see Tests) | R8, AC1, AC3 |
| `vite.config.ts` | (a) `build.assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined)` so fonts are never inlined as `data:` URLs, which `font-src 'self'` would block. (b) In `test`: `css: { include: [/@fontsource-variable\// ] }` so the Fontsource CSS is processed in tests. | AC2/AC4 (appsec rec. 4); test for AC3 |
| `nginx/security-headers.conf` | Line 1 CSP: `style-src 'self' 'unsafe-inline'; font-src 'self'`. Every other directive stays byte-identical. | AC4 |
| `scripts/smoke-image.sh` | Invert the font assertions, add a check for no Google hosts in the image, a font asset check and a check for no inlined `data:` fonts (step 7) | AC5, AC1, AC2 |
| `docs/deploy.md` | Line 57 CSP row updated. Lines 66-67 paragraph: drop Google Fonts and add "Fonts are self-hosted under `/assets/` (owner, 2026-11-16, PAN-025)". Line 132 stays. | AC4 |
| `THIRD_PARTY_NOTICES.md` | New section: Inter (Fontsource `@fontsource-variable/inter`) and Manrope (`@fontsource-variable/manrope`), SIL Open Font License 1.1. Copy the copyright lines from each package's `LICENSE` file, and include the full OFL 1.1 text once (copied from the package `LICENSE`). | OFL redistribution condition; appsec rec. 2 |

Not changed, on purpose: `nginx/default.conf` (`/assets/` already sets `public, max-age=31536000, immutable`, and woff2 is not blocked; both consults agree), `Dockerfile`, `.github/workflows/ci.yml` (the `image` job already runs the smoke script, so no new step is needed), `src/context/font-provider.tsx`, and `appearance-form.tsx`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/styles/fonts.test.ts › index.html has no Google Fonts hosts` | AC1. `import indexHtml from '../../index.html?raw'`, then expect no match for `/fonts\.(googleapis\|gstatic)\.com/`. |
| `src/styles/fonts.test.ts › theme maps font-inter / font-manrope to the self-hosted families` | AC3. `import themeCss from './theme.css?raw'`. Expect it to contain `--font-inter: 'Inter Variable',` and `--font-manrope: 'Manrope Variable',`, and expect no match for `/'sans-serif'/`. |
| `src/styles/fonts.test.ts › registers Inter Variable upright and italic, and Manrope Variable` | AC2/AC3. `import './fonts'`. For each of `400`, `500`, `600`, `700`: `await document.fonts.load(\`${w} 16px "Inter Variable"\`)` and `... "Manrope Variable"` each return length > 0. `await document.fonts.load('italic 400 16px "Inter Variable"')` returns a face with `style === 'italic'`. This proves the faces are registered and the files load from our origin (the Vite server in tests). |
| `scripts/smoke-image.sh` (new checks, step 7) | AC1, AC2, AC4, AC5 on the real image |

Existing tests (including any settings/appearance tests) must stay green unchanged.

## Approach
1. **Vet the packages before adding them** (appsec rec. 2). Check the latest `@fontsource-variable/inter` and `@fontsource-variable/manrope` with `pnpm view <pkg>@<ver> license scripts dependencies`. Expected: `OFL-1.1`, no `scripts`, no `dependencies`. If either has install scripts or dependencies, stop and record it in the impl-log. Then run `pnpm add -E @fontsource-variable/inter@<ver> @fontsource-variable/manrope@<ver>`. Record both versions in the impl-log.
2. **Confirm the file names and family names** in `node_modules/@fontsource-variable/{inter,manrope}` (`ls`, and read the CSS headers). Expected Inter files: `opsz.css` and `opsz-italic.css` (wght + opsz axes, all unicode-range subsets), registering `font-family: 'Inter Variable'`. Expected Manrope file: `wght.css`, registering `'Manrope Variable'`. If the names differ, use the package's equivalent files (same axes, styles and all subsets) and record the actual names. If the opsz Inter files register a different family name (e.g. `'Inter Variable Opsz'`?), use that exact name in `theme.css` and in the test.
3. **`src/styles/fonts.ts`**:
   ```ts
   // Self-hosted fonts (PAN-025). Vite emits the woff2 files to /assets/; each @font-face has a
   // unicode-range, so browsers download only the subsets a page uses.
   import '@fontsource-variable/inter/opsz.css'
   import '@fontsource-variable/inter/opsz-italic.css'
   import '@fontsource-variable/manrope/wght.css'
   ```
   Then add `import './styles/fonts'` in `main.tsx` before `./styles/index.css`. Do not import a package root, and do not add a `<link>` to `index.html`.
4. **`index.html`**: delete lines 37-43. Nothing else changes.
5. **`theme.css` and `config/fonts.ts`**: make the changes listed in the file table. Do not keep a bare `'Inter'` or `'Manrope'` in the stack: it would pick up a locally installed copy (consult-frontend rec. 1). This overrides appsec rec. 3.
6. **CSP** (`nginx/security-headers.conf` line 1, exact value):
   ```
   default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' @API_ORIGIN@; frame-src https://challenges.cloudflare.com; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
   ```
   Do not add `data:` to `font-src`. `'unsafe-inline'` stays in `style-src` because Radix, sonner and recharts set inline styles (appsec rec. 1); tightening it is out of scope (R7). In `docs/deploy.md` line 57, use the same string with `@API_ORIGIN@` → `https://api.mmlabs.online`.
7. **`scripts/smoke-image.sh`**:
   - Section 3: in the `for s in ...` list, replace `"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"` with `"style-src 'self' 'unsafe-inline';"` and `"font-src 'self' https://fonts.gstatic.com"` with `"font-src 'self';"`. The trailing `;` makes the match exact.
   - Section 3: add `check "CSP has no Google Fonts hosts" test -z "$(grep -E 'fonts\.(googleapis|gstatic)\.com' <<<"$csp" || true)"`.
   - New section after 6, "a font asset keeps the headers":
     ```bash
     css="$(grep -oE '/assets/[^"]+\.css' "$WORK/root.b" | head -n 1 || true)"
     check "index.html references a CSS asset" test -n "$css"
     fetch "$css" css
     font="$(grep -oE '/assets/[^)"'\'' ]+\.woff2' "$WORK/css.b" | head -n 1 || true)"
     check "CSS references a woff2 asset" test -n "$font"
     fetch "$font" font
     check "GET $font 200 font/woff2 immutable" check_status_type_cache font 200 font/woff2 "public, max-age=31536000, immutable"
     check "font security headers" full_headers "$WORK/font.h"
     ```
     If `$css` or `$font` is empty, `fetch` would request `/`. That still fails the following check, which is acceptable because the `check` before it already reports the failure.
   - Section 9: add
     `check "no Google Fonts hosts in the image" docker exec "$NAME" sh -c "! grep -rlE 'fonts\\.(googleapis|gstatic)\\.com' /usr/share/nginx/html | grep -q ."`
     and
     `check "no inlined data: fonts" docker exec "$NAME" sh -c "! grep -rlE 'data:(font|application/font)' /usr/share/nginx/html/assets | grep -q ."`.
   - Keep the script's existing style (`set -euo pipefail`, `check`, `|| true` on greps).
8. **`vite.config.ts`**: add the `build.assetsInlineLimit` function and `test.css.include` (file table). After `pnpm build`, confirm `dist/assets/*.woff2` exists, the built CSS has no `data:font`, and no Google host appears anywhere in `dist`. In the impl-log, record the total woff2 size in `dist/assets` and the size of the latin Inter upright file.
9. **`THIRD_PARTY_NOTICES.md`** and **`docs/deploy.md`**: make the changes listed in the file table.
10. Run `pnpm format`, then `typecheck`, `lint`, `format:check`, `test` (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` in the sandbox) and `build`. Run the smoke script if Docker is available, and say so in the impl-log either way. Do a manual visual check of Settings → Appearance (AC3).

Rules:
- **R1/R2/R3:** not touched; no API or auth code.
- **R5:** no secrets. The fonts are public static files.
- **R6:** the CSP is tightened (Google hosts removed). No HTML sinks are added.
- **R7:** preload, `size-adjust` fallback metrics and pinning `pnpm@10` in the Dockerfile are follow-ups, not in this diff.
- **R8:** this plan adds tests and keeps all five checks green.
- **R10:** no change to contrast or focus. The fallback stack becomes a real generic family.
- **R11:** not touched.

## Specialist input used
- consult-frontend-developer:
  - Adopted: use Fontsource variable packages (rec. 1).
  - Adopted: use the `'Inter Variable'` / `'Manrope Variable'` names, with no bare `'Inter'` (rec. 1, risk 1).
  - Adopted: fix the quoted `'sans-serif'` (finding 3).
  - Adopted: never import a package root (rec. 2).
  - Adopted: keep opsz (rec. 2 default suggestion).
  - Adopted: include Inter italic (rec. 3).
  - Adopted: no preload, as a follow-up (rec. 4).
  - Adopted: no nginx location change (rec. 5).
  - Adopted: update the three CSP places together (rec. 6).
  - Adopted: a static test that `index.html` has no Google hosts, plus the `document.fonts.load` test (rec. 7).
  - Partly rejected: per-subset files (latin + latin-ext + vietnamese only). I use the all-subset `opsz` / `opsz-italic` / `wght` files instead. They match what Google served (every subset, by unicode-range). Users still download only the subsets they need, and the only cost is image size (A2).
  - Rejected: latin-only italic. Choosing all subsets for italic too keeps one consistent rule, at small extra image size.
  - Rejected: a separate `scripts/check-fonts.sh` CI step. The smoke script already greps the built files inside the image in the CI `image` job, and the reviewer greps `dist` locally.
- consult-appsec-engineer:
  - Adopted: exact CSP string (rec. 1), and no `data:` in `font-src`.
  - Adopted: package vetting and exact pins (rec. 2).
  - Adopted: THIRD_PARTY_NOTICES entry (rec. 2).
  - Adopted: `assetsInlineLimit` that never inlines fonts (rec. 4).
  - Adopted: all smoke assertions (rec. 5).
  - Adopted: docs lines 57/66 updated and line 132 kept (rec. 6).
  - Adopted: keep all subsets, including vietnamese (rec. 3).
  - Rejected: `'Inter', sans-serif` in the stack (rec. 3). A bare local `Inter` could render instead of the bundled one; I follow the frontend consult.
  - Not adopted here: the import location "in `main.tsx`". It moved to `src/styles/fonts.ts`, imported by `main.tsx`, so the test can import the same list.
  - Follow-up (R7): pin `pnpm@10` in the Dockerfile (open question 3).

## Assumptions
- **A1. Inter keeps the `opsz` axis** (Google served `opsz 14..32`). AC3 says "looks the same", and the size cost only affects image size and the one subset a user downloads (roughly +30-50% on the Inter files). This is acceptable. If the opsz files register a different family name, use it (step 2).
- **A2. All unicode-range subsets ship** (latin, latin-ext, vietnamese, cyrillic(-ext), greek(-ext), as the package provides). This matches today's Google CSS and is independent of spec §8 Q3 (UI language). Expected cost: roughly 1-2 MB of woff2 in the image, while a typical page downloads one latin file per used face. The implementer records the actual total. If it exceeds 4 MB, record it in the impl-log as a follow-up candidate (switch to per-subset latin/latin-ext/vietnamese), but do not change the plan.
- **A3. Inter italic is included** (`opsz-italic.css`). It is used in `audit-log-columns.tsx:52` and `app-form-dialog.tsx:246`, and Google served it. Manrope stays upright only, as before (`wght@200..800`).
- **A4. No `<link rel="preload">`** for now. Vite cannot know the hashed name without extra plugin machinery. The fonts are same-origin, immutable and use `font-display: swap` (Fontsource default, same as today's `display=swap`). Follow-up: preload the Inter latin upright woff2 and add `size-adjust` fallback metrics.
- **A5. Weight ranges:** Fontsource variable files carry the full axes (Inter 100-900, Manrope 200-800), the same as today.
- **A6. The "system" font option is unaffected.** It has no `--font-system` variable, so it falls back to Tailwind's default sans stack, as today.
- **A7. Tailwind class generation.** The `font-inter` utility is generated because Tailwind v4 scans source text, and the literal `font-inter` today appears only in the `src/config/fonts.ts` comment (`font-manrope` also appears in `appearance-form.tsx`). The rewritten comment must keep both literal tokens. Moving class generation to a proper `@source inline(...)` is a follow-up, not this ticket.
- **A8.** nginx `mime.types` in `nginx-unprivileged:1.30.6-alpine` maps `woff2` to `font/woff2`. This is asserted by the smoke script, not assumed silently (appsec finding 3).
- **A9.** `test.css.include` for `@fontsource-variable` is harmless if browser mode already processes CSS. It is needed for the FontFace test if it does not.
- **A10.** No ADR is needed. This is a tooling detail, documented in the `src/config/fonts.ts` comment and `docs/deploy.md`.

## Blocking questions
None

## Split proposal
None. About 150 changed lines, excluding the lockfile.

## Screens
None. No route, permission or state changes. The visual check of `/settings/appearance` is covered under AC3.

## API calls used
None
