# PAN-024 — accessibility review

## Attempt 1

**A11y review, PAN-024 attempt 1 (WCAG 2.2 AA).** Static review of the diff plus a grep for leftovers. I did not run axe or pnpm e2e.

**Findings**

🔴 None. No A/AA failure is introduced by the diff.

🟡 Should-fix
1. **Logo name is still wrong in the sidebar (4.1.2 Name/Role/Value, 2.4.6 Headings and Labels).** `src/components/layout/app-title.tsx:28-29` still renders the visible text "Shadcn-Admin" and "Vite + ShadcnUI". The ticket fixed the logo `<title>` in `src/assets/logo.tsx` to "mmlabs Admin", so the SVG name and the adjacent visible text now disagree. Fix: change the visible text to "mmlabs Admin". Make the logo decorative here with `aria-hidden='true'` on the `<Logo>` in this component, because the text already names it. This avoids a duplicate announcement and passes 2.5.3 Label in Name. Check the other `<Logo>` uses (grep `Logo`) for the same pairing.
2. **Mixed date formats remain, so date readability is only partly consistent (3.1.1 / 3.1.2 consistency intent, 3.3.2 Labels or Instructions).** These still use `date-fns` `format()` with fixed patterns instead of `@/lib/format`:
   - `src/features/audit-log/lib/format.ts:1`
   - `src/features/reports/components/reports-columns.tsx:1`, with `format(…, 'yyyy-MM-dd HH:mm')` at about line 19
   - `src/features/dashboard/components/dashboard-content.tsx:1`

   Fix: if the ISO-style format is intentional, say so in the ADR. Otherwise route these through `formatDateTime`. The ISO form is unambiguous and not an AA failure, which is why this is only should-fix.
3. **Placeholder URLs in the profile form (3.3.2).** `src/features/settings/profile/profile-form.tsx:54-55` still has `https://shadcn.com` and `http://twitter.com/shadcn`. These are default values, not placeholders, and they are not part of the placeholder fix. They are also an R11/scope concern. Fix: empty them or replace them with neutral text.
4. **Time zone display depends on the browser locale (3.1.1 intent).** `src/features/users/data/assignments.ts:57` and `src/features/audit-log/lib/format.ts:62` call `Intl.DateTimeFormat()` with no locale. `resolvedOptions().timeZone` is locale-independent, so this is harmless today. For consistency, pass `APP_LOCALE`, or leave it and add a note.

💭 Notes
- **Positives:**
  - `index.html:2` has `<html lang="en">`, which matches the English-only UI (3.1.1 pass).
  - The calendar now uses `enUS`, so react-day-picker's built-in aria-labels, weekday names and month names are English. This avoids a mixed-language screen-reader experience (3.1.2).
  - The date picker and the table cells keep the semantic `<time dateTime>`.
  - The month dropdown formatter now uses the fixed locale.
- **Placeholder:** the profile placeholder "Your name" is fine, because the field still has a `FormLabel`. The label says "Username" while the placeholder says "Your name". Aligning them would help (3.3.2).
- **Logo test:** `src/assets/logo.test.tsx` checks only the `<title>` text. If the SVG stays standalone and meaningful, add `role='img'` (and ideally `aria-labelledby`) so the name is exposed in all browsers. In its current decorative use next to text, `aria-hidden` is better (see finding 1).
- **Calendar test:** the selector in `src/components/ui/calendar.test.tsx` is loose (`'select.rdp-months_dropdown, select'`). It should target the months dropdown by its accessible name.
- **Not tested:** contrast, focus order and the live-region changes. The diff does not touch them.

**Summary:** no A/AA blockers, but fix the leftover "Shadcn-Admin" visible text next to the renamed logo (`app-title.tsx:28`), and clear up the remaining `date-fns` formats and the shadcn placeholder URLs.
