## Findings
- index.html:38-43 loads Google CSS: Inter `ital,opsz,wght@0,14..32,100..900;1,14..32,100..900` (variable, opsz + wght, upright and italic) and Manrope `wght@200..800` (upright only), `display=swap`. Google serves per-unicode-range subsets (latin, latin-ext, vietnamese, cyrillic, greek, ...).
- CSS variables are in src/styles/theme.css:64-65: `--font-inter: 'Inter', 'sans-serif'` and `--font-manrope: 'Manrope', 'sans-serif'`. The 'system' option has no variable here. The family names are `Inter` and `Manrope`. FontProvider puts `font-<name>` on `<html>`. src/config/fonts.ts has only a comment pointing at the Google link, and its "how to add a font" steps need updating.
- Existing bug: `'sans-serif'` is quoted, so it is treated as a family name, not the generic keyword. The fallback is therefore ignored. Fix it to unquoted `sans-serif`, or `ui-sans-serif, system-ui, sans-serif`.
- Italic is used in only 2 places (audit-log-columns.tsx, app-form-dialog.tsx, likely the `italic` class). Manrope never needs italic. Without an italic file the browser synthesizes a faux italic.
- nginx: `/assets/` is already `max-age=31536000, immutable`, and `.woff2` is not blocked. `location ~ /\.` and `~ \.map$` do not match woff2. The CSP appears in nginx/security-headers.conf:1, docs/deploy.md:57 and scripts/smoke-image.sh:84 (these three must change together).

## Recommendations
1. **Package (AC2, AC3).** Use `@fontsource-variable/inter` and `@fontsource-variable/manrope`, pinned exactly. Check each package's README for the current family names.
   - They register `'Inter Variable'` and `'Manrope Variable'`, not `Inter` / `Manrope`.
   - Update theme.css to `--font-inter: 'Inter Variable', ui-sans-serif, system-ui, sans-serif` and `--font-manrope: 'Manrope Variable', ...`. This keeps the `font-inter` / `font-manrope` utilities working.
   - Do not keep the bare `'Inter'` name. It would resolve to a locally installed Inter, which looks inconsistent.
   - Copying woff2 into src/assets means writing @font-face by hand and tracking upstream versions. Fontsource is smaller and Vite hashes the files into /assets/ automatically.
2. **Subsets and axes (AC2).** Do not import the package root (`@fontsource-variable/inter`). It pulls every subset.
   - Import the subset files explicitly, e.g. `@fontsource-variable/inter/wght.css`. That file is not subset-limited, so it pulls every unicode-range subset. Hashed files are fetched only when glyphs on the page need them, but all of them end up in dist.
   - Prefer the per-subset files, e.g. `@fontsource-variable/inter/latin.css` and `.../latin-ext.css`. Add `vietnamese.css` only if spec §8 Q3 decides on Vietnamese. It is cheap to add later, and UI-label language is undecided, so I would include it now as a small safety net (Vietnamese diacritics fall outside latin and latin-ext).
   - Do the same for Manrope: `latin`, `latin-ext`, and `vietnamese` if you include it for Inter. Manrope has no Vietnamese in some versions, so check the package's file list.
   - The `opsz` axis (the `opsz.css` variant) makes the Inter file larger. Today's Google request uses opsz 14..32. Dropping it is a tiny visual difference, but AC3 says "looks the same", so decide explicitly. Default suggestion: use `opsz.css` for Inter if the size is acceptable (about 100 KB per subset, latin only is the one loaded in practice), otherwise drop it and note it in the PR.
   - Import the CSS from src/main.tsx (or the top of index.css with `@import '@fontsource-variable/...'`) so Vite bundles it. No `<link>` in index.html.
3. **Italic (AC3).** Inter italic needs a separate import, e.g. `@fontsource-variable/inter/wght-italic.css` or the `opsz-italic` / per-subset equivalents. Check the package file list for exact names. Since italic is rare, importing only the latin italic subset is enough. If the owner accepts a faux italic in the two places, skip it, but say so explicitly. I recommend including latin italic only.
4. **font-display and layout shift.** Fontsource sets `font-display: swap`, which matches today's behaviour. To reduce layout shift, preload the default font only (Inter latin woff2).
   - Vite does not emit preload links for CSS-referenced fonts, and index.html cannot know the hashed filename. A hand-written `<link rel=preload>` needs a Vite plugin or `transformIndexHtml`, which is more machinery than a "keep it small" ticket warrants.
   - Recommendation: skip preload for now. On the same origin with immutable caching, the CSS and font load in the same connection and swap is brief. Record preload as a follow-up (R7). Optionally add `size-adjust` fallback metrics later.
5. **Output location (AC2).** Vite emits imported fonts as `dist/assets/<name>-<hash>.woff2` (the default `assetsDir`, and files over `assetsInlineLimit` 4 KB are not inlined). Variable woff2 files are well over 4 KB. Fontsource also references `.woff` fallbacks in some packages. If `.woff` files appear, they are harmless, but `font-src 'self'` covers both. The existing `/assets/` nginx location already gives immutable caching, so no nginx change beyond the CSP.
6. **CSP (AC4).**
   - New `style-src 'self' 'unsafe-inline'` and `font-src 'self'`.
   - Keep `'unsafe-inline'` only if something still needs it (check the build output for inline styles; the Vite CSS is an external file, Radix/Tailwind inline style attributes need it).
   - Update the three places together (nginx/security-headers.conf, docs/deploy.md:57, scripts/smoke-image.sh:84).
   - In smoke-image.sh, replace the two required substrings with the new ones and add negative asserts: the CSP must not contain `fonts.googleapis.com` or `fonts.gstatic.com` (AC5). Also request one `/assets/*.woff2` from the container and assert 200, `Cache-Control` immutable, and the CSP header present.
   - Remove the preconnect/link lines from index.html. Update the comment in src/config/fonts.ts to describe "install a @fontsource package, import it, add a `--font-*` variable".
7. **Tests (R8).**
   - A build-output check (Vitest node-environment test or a CI shell step after `pnpm build`): `grep -R "fonts.googleapis.com\|fonts.gstatic.com" dist` finds nothing, and at least one `dist/assets/*.woff2` exists. Best placed in the CI `build` step or smoke script, because Vitest here runs in browser mode and build output needs a separate step. A tiny script `scripts/check-fonts.sh` called from ci.yml is simplest.
   - A static test that index.html does not contain Google hosts is cheap too.
   - Manual or browser-mode test: with the `font-manrope` class on `<html>`, `getComputedStyle(body).fontFamily` starts with `Manrope Variable`. Add `document.fonts.check('16px "Inter Variable"')` only if reliable in Chromium (the fonts load async, so await `document.fonts.load`). The appearance form tests should still pass unchanged.

## Risks
- Wrong family name is the main trap. If theme.css keeps `'Inter'`, the page silently falls back to system fonts and nothing errors (the `'sans-serif'` quoting bug hides this).
- Importing the package root bloats dist with all subsets (cyrillic, greek, ...), which is harmless to users because of unicode-range but a larger image.
- A missing italic or opsz axis is a subtle visual change that AC3 ("looks the same") could flag.
- CSP, docs and smoke script drift apart if not edited together.
- Playwright/vitest browser tests might pick up the fonts from node_modules paths and run slower, but this is minor.

## Open questions
1. Include Vietnamese subsets now (depends on spec §8 Q3)? Recommendation: yes, a small cost.
2. Keep the Inter `opsz` axis (larger file, identical look) or drop it?
3. Is a faux italic acceptable in the two places, or add the latin italic file? Recommendation: add the latin italic file.
4. Is preload deferred as a follow-up? Recommendation: yes.
5. Does the 'system' font option (no `--font-system` variable) need any change? It does not look affected.

Files reviewed: /home/user/admin-pan/work/tickets/PAN-025/ticket.md, /home/user/admin-pan/index.html, /home/user/admin-pan/src/config/fonts.ts, /home/user/admin-pan/src/styles/theme.css, /home/user/admin-pan/src/styles/index.css, /home/user/admin-pan/src/context/font-provider.tsx, /home/user/admin-pan/nginx/default.conf, /home/user/admin-pan/nginx/security-headers.conf, /home/user/admin-pan/scripts/smoke-image.sh (line 84 only), /home/user/admin-pan/docs/deploy.md (line 57 only). I did not read vite.config.ts or package.json in full (no font-related entries in package.json). I did not verify the exact Fontsource file names against node_modules because the package is not yet installed.
