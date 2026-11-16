# PAN-025: Self-host the Inter and Manrope fonts

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P2 |
| Areas | ui, security |
| Attempts | 0 |
| Created | 2026-11-16 |
| PR | — |

## Goal
Serve the Inter and Manrope fonts from our own origin (bundled by Vite) instead of Google Fonts, so pages no longer wait on a third-party font request and the CSP no longer allows Google hosts.

## Spec reference
`docs/spec-v1.md` §6 (non-functional: no third-party dependencies where avoidable, security headers per R6), §6.1 (deployment). Reverses the PAN-022 owner decision "keep Google Fonts" (owner, 2026-11-16).

## Depends on
PAN-022 (nginx CSP, smoke script)

## Acceptance criteria
- [ ] `index.html` has no `fonts.googleapis.com` / `fonts.gstatic.com` links or preconnects; the built `dist/` makes no request to any Google host
- [ ] Inter and Manrope font files are part of the build and served from our origin under `/assets/` (long-term cached like other hashed assets)
- [ ] The UI looks the same: the default font and the font switcher in Settings → Appearance still switch between Inter and Manrope, including the weights in use
- [ ] nginx CSP: `style-src` and `font-src` allow only `'self'` (plus what Vite's build still needs, e.g. `'unsafe-inline'` styles); no Google hosts; `docs/deploy.md` header table updated
- [ ] `scripts/smoke-image.sh` asserts the CSP contains no `fonts.googleapis.com` / `fonts.gstatic.com`, and CI `image` job stays green
- [ ] `pnpm typecheck`, `lint`, `format:check`, `test`, `build` pass; any new package is pinned exactly and listed in the PR

## Notes / answers from owner
- 2026-11-16 (owner): Google Fonts loads slowly — move the fonts to our own server. Supersedes the PAN-022 note "Keep Google Fonts".
