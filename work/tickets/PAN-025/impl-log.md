## Attempt 1 — 2026-11-16

### Packages added (exact pins, vetted with `pnpm view`)
| Package | Version | License | Install scripts | Dependencies |
|---|---|---|---|---|
| `@fontsource-variable/inter` | 5.3.0 | OFL-1.1 | none | none |
| `@fontsource-variable/manrope` | 5.3.0 | OFL-1.1 | none | none |

Files used: Inter `opsz.css` + `opsz-italic.css` (family `'Inter Variable'`), Manrope `wght.css` (family `'Manrope Variable'`), as the plan expected. No "Ignored build scripts" warning.

### Files touched
| File | Required because |
|---|---|
| `package.json`, `pnpm-lock.yaml` | the two font packages, pinned exactly |
| `src/styles/fonts.ts` (new) | explicit list of font CSS imports |
| `src/main.tsx` | import `./styles/fonts` before `index.css` |
| `index.html` | removed Google preconnects and stylesheet |
| `src/styles/theme.css` | `--font-inter` / `--font-manrope` use the `* Variable` families, real generic fallback |
| `src/config/fonts.ts` | doc comment rewritten (keeps literal `font-inter`, `font-manrope`) |
| `src/styles/fonts.test.ts` (new) | tests |
| `vite.config.ts` | `build.assetsInlineLimit` never inlines woff/woff2; `test.css.include` for Fontsource CSS |
| `nginx/security-headers.conf` | CSP `style-src 'self' 'unsafe-inline'; font-src 'self'` |
| `scripts/smoke-image.sh` | inverted font CSP asserts, no-Google check, font asset check, no data: fonts check |
| `docs/deploy.md` | CSP row and external-origins paragraph |
| `THIRD_PARTY_NOTICES.md` | OFL 1.1 notice for Inter and Manrope |

### Tests added / changed
- `src/styles/fonts.test.ts` › index.html has no Google Fonts hosts
- `src/styles/fonts.test.ts` › theme maps font-inter / font-manrope to the self-hosted families
- `src/styles/fonts.test.ts` › registers Inter Variable upright and italic, and Manrope Variable

### Checks (actual output summary)
- pnpm typecheck: clean (`tsc -b`, no errors)
- pnpm lint: clean
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH set): Test Files 46 passed (46), Tests 277 passed (277)
- pnpm build: built OK
- pnpm api:types: no drift (`git status src/api` clean)
- pnpm e2e: not planned
- dist checks: no `fonts.googleapis/gstatic` anywhere in `dist`; no `data:font` in `dist/assets`; 20 woff2 files (6 Manrope), 808K total (under the 4 MB threshold); Inter latin upright `inter-latin-opsz-normal-*.woff2` is 72,920 bytes.
- Docker: started `dockerd` (it was not running). Built `admin-pan:ci` from a scratchpad copy of the repo whose Dockerfile only adds the proxy CA (`NODE_EXTRA_CA_CERTS`); the repo Dockerfile is unchanged. `scripts/smoke-image.sh admin-pan:ci https://api.mmlabs.online` -> "smoke test passed" (all font checks ok, including GET woff2 200 font/woff2 immutable).
- Visual check (Playwright Chromium against `pnpm preview`, screenshots in the scratchpad: `initial.png`, `manrope.png`): default renders Inter Variable; selecting Manrope in Settings > Appearance and submitting switches body font to "Manrope Variable"; both families load; zero non-localhost requests; woff2 served from the local origin. Note: the font changes only after "Update preferences" (existing form behaviour, unchanged).

### Out-of-plan files
None

### Follow-ups (noticed, not done)
- Preload the Inter latin upright woff2 and add `size-adjust` fallback metrics (plan A4).
- Pin `pnpm@10` more tightly in the Dockerfile.
- Generate font utility classes with `@source inline(...)` instead of relying on the literal tokens in `src/config/fonts.ts` (plan A7).

### Scope self-check
- Could the diff be smaller? No
