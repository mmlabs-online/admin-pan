# Accessibility review — PAN-025

## Attempt 1

No 🔴 and no 🟡. Read the diff and the installed fontsource CSS; no axe/browser run (no markup changed).

### Findings
💭 1. **Fallback stack (1.4.4, 1.4.12) — fixed.** `src/styles/theme.css:64-65` now falls back to `ui-sans-serif, system-ui, sans-serif`; the old quoted `'sans-serif'` was a font name, not the generic keyword. Text stays legible if the woff2 fails.
💭 2. **Layout shift — acceptable.** fontsource `@font-face` uses `font-display: swap` as before; a small swap reflow is possible, no A/AA criterion covers it. Optional: preload the latin woff2.
💭 3. **Vietnamese glyph coverage — pass.** Inter `opsz.css` and Manrope `wght.css` ship the `vietnamese` subset; only used subsets are downloaded.
💭 4. **Resizable text (1.4.4, 1.4.12) — pass.** No px-locked sizes or line-height/letter-spacing overrides added; only family tokens changed.
💭 5. **Settings → Appearance font switcher (1.3.1, 4.1.2) — pass.** Native `<select>` with `FormLabel` "Font" and `FormDescription`; `font-provider` applies `font-<name>`; `fonts.ts` still lists `inter`, `manrope`, `system`. Behaviour unchanged.

### Follow-ups (pre-existing, not caused by this diff)
- `src/styles/index.css:36` sets `font-size: 16px !important` — check it does not block user text-size preferences (fine if inputs only).
- Font `<select>` option labels are lowercase names shown with `capitalize`; friendlier labels (e.g. "System default") optional.
