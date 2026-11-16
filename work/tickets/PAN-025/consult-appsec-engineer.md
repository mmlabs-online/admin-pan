PAN-025 appsec consult (PLAN stage, read-only)

Files read: `/home/user/admin-pan/nginx/security-headers.conf`, `nginx/default.conf`, `Dockerfile`, `scripts/smoke-image.sh`, `index.html`, `vite.config.ts`, `package.json`, `src/config/fonts.ts`, `src/styles/theme.css`, `docs/deploy.md`, and the PAN-022 consult and security-review notes.

## Findings
1. **The Google Fonts allowances are in exactly four places:**
   - `index.html:33-39`: two preconnects plus the css2 stylesheet. The stylesheet loads Inter with `ital,opsz,wght` axes and Manrope with `wght 200..800`.
   - `nginx/security-headers.conf:1`: `style-src … https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com`.
   - `scripts/smoke-image.sh` section 3: it asserts the Google hosts are present, so it has to be inverted.
   - `docs/deploy.md:57` (header table) and `:66` (the "why external origins" paragraph).
   - Also, the comment in `src/config/fonts.ts` tells readers to add fonts through Google Fonts `<link>` tags. Update it so nobody re-adds them.
2. **The `/assets/` caching already covers fonts.** `default.conf` `location /assets/` sets `public, max-age=31536000, immutable` and includes the security headers. Vite emits fontsource `url(./files/*.woff2)` as `/assets/<name>-<hash>.woff2`. No nginx change is needed. Fonts are same-origin, so CORS and `Cross-Origin-Resource-Policy: same-origin` are fine. Don't add gzip for woff2, which is already compressed.
3. **MIME types.** The image is `nginx-unprivileged:1.30.6-alpine`, and stock nginx `mime.types` maps `font/woff2 woff2;` and `font/woff woff;`. That has been true for many releases; the old `application/font-woff` mapping was replaced long before 1.30. With `nosniff` on, the Content-Type must be right. I couldn't confirm this inside the pinned image (no local image or daemon here), so the smoke test below asserts it instead of us assuming it.
4. **Possible `data:` font inlining.** Vite's default `build.assetsInlineLimit` is 4096 bytes. Any font subset under 4 KB would be inlined as `url(data:font/woff2;base64,…)`, and `font-src 'self'` would block it silently, giving a fallback font for that unicode range. Most Inter and Manrope variable subsets are well over 4 KB, but I haven't verified the smallest ones (for example greek-ext).
5. **Install scripts.** There is no `pnpm.onlyBuiltDependencies` and no `.npmrc` or `pnpm-workspace.yaml`. pnpm 10 (the Dockerfile uses `pnpm@10`) does not run dependency lifecycle scripts by default. The `@fontsource-variable/*` packages are plain CSS and woff2 files with no dependencies and no install scripts, so nothing needs allow-listing.

## Recommendations
1. **Exact CSP after the change.** Only `style-src` and `font-src` change, and everything else stays byte-identical:
   ```
   default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' @API_ORIGIN@; frame-src https://challenges.cloudflare.com; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
   ```
   - Do **not** add `data:` to `font-src`. Stop inlining instead (point 3).
   - Keep `'unsafe-inline'` in `style-src` for now: Radix, sonner and recharts set inline style attributes. Tightening it is out of scope (R7).
2. **Packages:**
   - `pnpm add -E @fontsource-variable/inter @fontsource-variable/manrope`. Exact versions with no `^`, and the lockfile updated with integrity hashes.
   - Before adding, check `pnpm view <pkg>@<ver> license scripts dependencies`. Expected: `OFL-1.1`, no `scripts` (no preinstall, install or postinstall), no dependencies.
   - Record both in `THIRD_PARTY_NOTICES.md` (SIL OFL 1.1; the fonts are by Rasmus Andersson / Inter, and Manrope is by Mikhail Sharanda) and in the PR body, as the ticket requires.
   - The CI `pnpm install --frozen-lockfile` must stay clean, with no "Ignored build scripts" warning for these packages.
3. **Imports, to match the weights in use:**
   - In `main.tsx`, before `./styles/index.css`: `import '@fontsource-variable/inter/wght.css'`, `import '@fontsource-variable/inter/wght-italic.css'` (Google loaded italics too, and they are needed if `italic` or `<em>` is used anywhere), and `import '@fontsource-variable/manrope/wght.css'`.
   - Optionally use Inter `opsz.css` / `opsz-italic.css` (wght plus opsz axes) to match Google's `opsz 14..32` exactly. That's the frontend specialist's call; either way, keep the import list explicit.
   - fontsource registers the family as `'Inter Variable'` and `'Manrope Variable'`. Set `src/styles/theme.css:64-65` to `'Inter Variable', 'Inter', sans-serif` and the same pattern for Manrope.
   - Also fix the existing quoted `'sans-serif'`: quoted, it is a family named "sans-serif", not the generic fallback.
   - Keep all subsets, including vietnamese and latin-ext; `unicode-range` makes the browser download only what a page uses.
4. **Prevent inlining** in `vite.config.ts`:
   ```ts
   build: { assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined) }
   ```
   Then confirm the built CSS has no `data:font` or `data:application/font`.
5. **Smoke assertions to add to `scripts/smoke-image.sh`:**
   - **Replace** the two Google CSP lines with `"style-src 'self' 'unsafe-inline';"` and `"font-src 'self';"`. The trailing `;` makes the match exact, so nothing can be appended later.
   - **Add** `check "CSP has no Google hosts" test -z "$(grep -E 'fonts\.(googleapis|gstatic)\.com' <<<"$csp" || true)"`.
   - **Add** a check that `fonts.googleapis.com` / `fonts.gstatic.com` appear nowhere in the image: `docker exec "$NAME" sh -c "! grep -rlE 'fonts\\.(googleapis|gstatic)\\.com' /usr/share/nginx/html | grep -q ."`. This covers the "dist makes no request to a Google host" acceptance criterion, including `index.html`.
   - **Add** a font asset check:
     - Pick the CSS asset with `css="$(grep -oE '/assets/[^"]+\.css' "$WORK/root.b" | head -n 1)"`, fetch it, then `font="$(grep -oE '/assets/[^)"'\'' ]+\.woff2' "$WORK/css.b" | head -n 1)"`.
     - `check "CSS references a woff2 asset" test -n "$font"`.
     - Fetch `$font`, then `check_status_type_cache font 200 font/woff2 "public, max-age=31536000, immutable"`.
     - Run `full_headers` on the font response so `nosniff` is asserted.
   - **Add** `check "no inlined data: fonts" docker exec "$NAME" sh -c "! grep -rlE 'url\\(\"?data:(font|application/font)' /usr/share/nginx/html/assets | grep -q ."`.
6. **Docs.** Update the `docs/deploy.md:57` table to the CSP above, drop Google Fonts from the `:66` paragraph, and keep the `:132` manual check ("fonts render, no CSP violations").

## Risks
- **Missed weight or style:** if an italic or a weight isn't imported, the browser fakes it (faux bold or oblique). That's cosmetic, not security. Mitigate with a visual check of Settings → Appearance in both fonts.
- **Wrong family name:** if `theme.css` still says `'Inter'`, the CSS falls back silently to the system font with no error. A browser test can assert `document.fonts.check('16px "Inter Variable"')` after `document.fonts.ready`.
- **Bundle size:** the `/assets` image grows by roughly 300–600 KB of woff2, but browsers only fetch the subsets they need. Acceptable.
- **Supply chain:** small. These are static files from two packages with no dependencies, at exact pins, with no scripts. They are still a new third-party source in the bundle, so a later version bump should be reviewed like any dependency change.

## Open questions
1. Should Inter keep its optical-size axis (`opsz`), which is what Google served, or is wght-only acceptable? This affects which fontsource CSS files to import and the file size.
2. Are italics used anywhere in the UI? If not, the italic files can be dropped.
3. Follow-up, out of scope (R7): the Dockerfile installs unpinned `pnpm@10`. Pin it to an exact version (or use corepack with `packageManager` in `package.json`) so dependency script-blocking behaviour is reproducible.
