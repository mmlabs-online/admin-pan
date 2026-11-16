/**
 * List of available font names (visit the url `/settings/appearance`).
 * This array is used to generate dynamic font classes (e.g., `font-inter`, `font-manrope`).
 *
 * 📝 How to Add a New Font (Tailwind v4+), self-hosted (no third-party font hosts, CSP `font-src 'self'`):
 * 1. Add the font name here.
 * 2. Install `@fontsource-variable/<font>` pinned exactly (check its license and scripts first) and
 *    import its CSS in 'src/styles/fonts.ts'.
 * 3. Add the family in 'src/styles/theme.css' under `@theme inline`.
 *
 * Example (roboto):
 * fonts.ts           → Add 'roboto' to this array.
 * styles/fonts.ts    → import '@fontsource-variable/roboto/wght.css'
 * styles/theme.css   → @theme inline {
 *      // ... other font families
 *      --font-roboto: 'Roboto Variable', ui-sans-serif, system-ui, sans-serif;
 *   }
 */
export const fonts = ['inter', 'manrope', 'system'] as const
