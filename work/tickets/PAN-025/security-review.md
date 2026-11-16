# Security review — PAN-025

## Attempt 1

**Verdict: no blockers and no should-fix items.** Checked `git diff origin/main...HEAD` (excluding `work/`), fontsource `package.json` in `node_modules`, `nginx/default.conf`, a local `pnpm build` (exit 0) and `dist/`, and `pnpm audit --prod`.

### Confirmed
- **CSP exactly as recommended at PLAN** (`nginx/security-headers.conf:1`): `style-src 'self' 'unsafe-inline'; font-src 'self'`; no Google hosts, no `data:` in `font-src`; all other directives unchanged; nothing loosened; `Dockerfile`, `.github/`, `.npmrc` untouched; `docs/deploy.md:57` matches.
- **Dependencies clean:** `@fontsource-variable/inter` and `@fontsource-variable/manrope` pinned at `5.3.0` (`package.json:24-25`); sha512 integrity in the lockfile; no dependencies; installed `package.json` shows `OFL-1.1`, `scripts: {}`, `dependencies: {}`; notice in `THIRD_PARTY_NOTICES.md:62+`; no audit advisory involves them.
- **Google Fonts removed:** preconnects and stylesheet gone from `index.html`; no `fonts.(googleapis|gstatic).com` in `dist/`.
- **No inlined `data:` fonts:** `vite.config.ts:24-27` disables inlining for `.woff`/`.woff2`; the guard matters (`manrope-cyrillic-ext-wght-normal-*.woff2` is 2552 bytes, still emitted as a file); 20 woff2 files, no `data:font`.
- **Same-origin serving:** `/assets/` (`nginx/default.conf:20-24`) includes the security-headers snippet (`nosniff`) and `public, max-age=31536000, immutable`; smoke section 6b asserts 200, `font/woff2`, immutable and `full_headers` on a real woff2.
- **Smoke hardened:** CSP substrings end in `;`; new checks for no Google hosts in CSP or image, no inlined `data:` fonts.

### Findings
- 💭 woff2 check only covers the first CSS file (`scripts/smoke-image.sh:114`, `head -n 1`) — would fail loudly, not silently, if CSS is ever split; loop over all CSS assets only if it trips.
- 💭 `style-src 'unsafe-inline'` kept on purpose (Radix, sonner, recharts); out of scope (R7).

### Follow-ups (out of scope)
1. `pnpm audit --prod`: 22 pre-existing advisories (2 critical, 12 high, 7 moderate, 1 low) — `seroval` (via TanStack Router), `nanoid`, `postcss`, `source-map-js`, `vite`, `zod`; none from PAN-025. Open a dependency-update ticket; check whether `seroval` is reachable in a client-only SPA.
2. Pin pnpm exactly in the Dockerfile (or corepack + `packageManager`).
3. Tighten `style-src 'unsafe-inline'` later (nonces/hashes, `style-src-attr`).
4. Review future fontsource bumps like any dependency change (license, scripts, deps; re-run inlining and woff2 smoke checks).
