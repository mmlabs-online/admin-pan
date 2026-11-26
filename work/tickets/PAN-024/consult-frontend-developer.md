PAN-024 consult (frontend-developer), read-only.

## Findings

**1. Strings**
- There are no Vietnamese strings in `src/` or `index.html`. A diacritics scan found only a test fixture, `Café` in `src/lib/list-search.test.ts:22`, which is fine. No lorem or ipsum text either.
- Template leftovers that are user-visible:
  - `src/assets/logo.tsx:7` and `:20` still have `<title>Shadcn-Admin</title>` and `id='shadcn-admin-logo'`. This is an accessible name that screen readers will read.
  - `src/features/settings/profile/profile-form.tsx:84` has `placeholder='shadcn'`.
  - `src/features/organizations/components/organizations-action-dialog.tsx:149` and `:166` have the placeholders `Acme Inc.` and `acme-inc`. These are plausible examples, not a language problem.
- `index.html` has `<html lang="en">` (line 2) and `<title>mmlabs Admin</title>`. Both are correct.
- I did not read every component, so wording consistency (Title Case against sentence case, "Sign in" against "Log in") is unverified. Dialog and toast strings I saw were already consistent English.

**2. Dates and numbers: two helper families, mixed locales**
- `src/features/users/data/data.ts` defines `formatDate`, `formatDateTime` and `formatDateTimeZone`. They use `Intl.DateTimeFormat('en', …)` with `dateStyle: 'medium'`. The bare `'en'` resolves to US-style output.
- `src/features/apps/data/data.ts:62-64` defines a second `formatDate` that calls `toLocaleDateString('en-GB', …)`. It is the only place using en-GB, and the organizations tabs and the apps tabs import it. So the same kind of date renders as "12 Nov 2026" in some screens and "Nov 12, 2026" in others.
- `src/features/dashboard/lib/format.ts` uses `Intl.DateTimeFormat('en-US')` at line 10 and `toLocaleString('en-US')` at line 18.
- `src/features/reports/components/reports-columns.tsx:84` and `src/features/reports/components/reports-overview.tsx:179` and `:185` use `toLocaleString('en-US')`.
- date-fns `format()` is called with hard-coded patterns, so these are locale-independent:
  - `MMM d, yyyy` in `src/components/date-picker.tsx:31`, `src/features/apps/components/apps-columns.tsx:52` and `src/features/organizations/components/organizations-columns.tsx:62`.
  - `yyyy-MM-dd HH:mm:ss` in `src/features/audit-log/lib/format.ts:25`.
  - `yyyy-MM-dd HH:mm` in `src/features/reports/components/reports-columns.tsx:18`.
  - `MMM d, HH:mm` in `src/features/dashboard/components/dashboard-content.tsx:38`.
- `src/components/ui/calendar.tsx:37` uses `toLocaleString('default', …)` for the month dropdown, and `:190` uses `toLocaleDateString()` with no locale. Both follow the browser locale. `DayPicker` gets no `locale` prop, so it defaults to en-US.
- No `vi-VN` appears anywhere. Time zone is local, with `Intl.DateTimeFormat().resolvedOptions().timeZone` used for display in `src/features/audit-log/lib/format.ts:62` and `src/features/users/data/assignments.ts:57`. That is intended, since the time zone is shown.

**3. Direction and font providers**
- `src/context/direction-provider.tsx` sets `dir` on `<html>` from a cookie. `src/context/font-provider.tsx` is the template's font switcher. Both are exposed in `src/features/settings/appearance/appearance-form.tsx` and `src/components/config-drawer.tsx`.
- The RTL option is a template i18n leftover. With English only, it is dead UI. Removing it is arguably outside PAN-024 and would touch `src/components/ui/sidebar.tsx`, `src/components/ui/calendar.tsx`, `src/components/layout/nav-group.tsx`, `src/features/errors/maintenance-error.tsx`, `src/assets/custom/icon-dir.tsx` and `src/components/config-drawer.test.tsx`.
- No `lang` is set at runtime, and there is no language switcher.

**4. Tests**
- Tests that call the formatters (`formatDate`, `formatDateTime`, `formatDateTimeZone`) import the helper instead of hard-coding strings, so a locale change will not break them. This covers `src/features/roles/components/role-holders-sheet.test.tsx`, `src/features/users/components/user-role-assignments.test.tsx` and `src/features/users/components/user-sessions-tab.test.tsx`.
- Tests that use `Intl.DateTimeFormat().resolvedOptions().timeZone` do not depend on locale. They are `src/features/audit-log/lib/format.test.ts`, `src/features/audit-log/components/audit-log-table.test.tsx` and `src/features/users/data/assignments.test.ts`.
- I did not grep for hard-coded date or number strings in tests. Do that before the change (for example `Nov \d`, `\d{1,2} Nov`, `1,234`).
- There are no tests for the apps `formatDate` or the dashboard and reports number formatters. Add them.

## Recommendations (ticket scope only)

1. **Locale: en-US.** Reasons: the dashboard, the reports and the date-fns patterns are already US-leaning, the bare `'en'` already resolves to US output, and only one helper uses en-GB. Switching that one to en-US is a one-line change. (AC2)
2. **One module for formatting.** Add `src/lib/format.ts` (or `locale.ts`) with `export const APP_LOCALE = 'en-US'` and the shared `formatDate`, `formatDateTime`, `formatDateTimeZone` and `formatNumber`. (AC2)
   - Make the users helpers re-export or delegate to it.
   - Remove the duplicate in `src/features/apps/data/data.ts` and repoint the imports. About 8 files import `@/features/apps/data/data` for `formatDate`.
   - Replace the inline `toLocaleString('en-US')` calls in the dashboard and reports files with the shared `formatNumber`, and use `APP_LOCALE` in `src/features/dashboard/lib/format.ts`.
3. **Replace date-fns `format('MMM d, yyyy')` calls** with the shared `formatDate` in `src/components/date-picker.tsx`, `src/features/apps/components/apps-columns.tsx`, `src/features/organizations/components/organizations-columns.tsx` and `src/features/dashboard/components/dashboard-content.tsx`.
   - Output stays identical, but the locale then lives in one place.
   - Keep the ISO-style patterns in audit-log and reports. They are deliberate, unambiguous log formats, and the ticket does not require changing them.
4. **Calendar.** Pass `APP_LOCALE` to the month formatter in `src/components/ui/calendar.tsx:37` and `:190`, and pass the date-fns `enUS` locale to `DayPicker`. This is a bug fix inside a generated file, which CLAUDE.md allows. (AC2)
5. **Template leftovers.** Change the `Shadcn-Admin` logo title to `mmlabs Admin` and the `shadcn` placeholder to a neutral example, such as `Your name`. (AC1)
6. **Optionally** set `document.documentElement.lang = 'en'` is unnecessary, since `index.html` already has it. Leave it.
7. **Tests:**
   - Add unit tests for the shared formatters, with fixed ISO input and `timeZone: 'UTC'` or a regex-tolerant assertion.
   - Add an ESLint or grep check for a forbidden `toLocale*String(` call without a locale.
   - Run the full `pnpm test`.
8. **Record the decision.** Add one line to the spec or ADR saying "English only, en-US, no i18n framework".

## Risks
- Switching the apps and organizations date from `12 Nov 2026` to `Nov 12, 2026` is a visible change, but it is the intended consistency fix. Check for hard-coded date strings in tests before merging.
- The Intl output of `timeZoneName: 'short'` varies by the browser's time zone. The existing tests are tolerant of this. Do not add exact-string assertions for it.
- Removing the RTL option and font switcher is a bigger diff touching generated shadcn files. Keep it out of PAN-024 unless the owner asks, per R7.

## Open questions
1. Is en-US confirmed as the explicit locale, or does the owner prefer en-GB (day-first)?
2. Should the RTL direction switcher in Settings and the config drawer be removed, now that the app is English only? Suggest recording it as a follow-up ticket.
3. Should the audit-log and reports ISO-style timestamps stay as they are? Suggest yes.

Files I read: /home/user/admin-pan/work/tickets/PAN-024/ticket.md, /home/user/admin-pan/src/features/users/data/data.ts, /home/user/admin-pan/src/components/ui/calendar.tsx, /home/user/admin-pan/index.html, /home/user/admin-pan/docs/spec-v1.md (Q3 at line 120).
