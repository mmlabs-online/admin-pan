Status: READY

# Plan — PAN-024: UI language

## Spec summary
`docs/spec-v1.md` §8, line 120:
> - [x] Q3. **answered 2026-11-26:** English. (Question: UI language: Vietnamese, English, or both?)

Ticket notes: "2026-11-26 (owner, Q3): UI language is English."
CLAUDE.md Conventions: "UI label language: spec §8 Q3."

So the decision is **English only, no language switcher, no i18n framework**. This ticket has two jobs. First, check that every UI string is English and remove the template leftovers a user can see or hear. Second, make every date and number format use **one explicit English locale**, set in one place. Today the formatters mix `'en'`, `'en-US'`, `'en-GB'` and the browser default.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | All UI strings follow the decision (English) | (a) The consult's diacritics scan of `src/` and `index.html` found no Vietnamese. Re-run it: `rg -n '[à-ỹÀ-Ỹđ]' src index.html` should only hit the `Café` fixture in `src/lib/list-search.test.ts`. (b) `index.html` keeps `<html lang="en">`. (c) `rg -n 'Shadcn-Admin\|shadcn-admin-logo' src/assets` returns nothing. Test `src/assets/logo.test.tsx › has the mmlabs Admin accessible name`. (d) `rg -n "placeholder='shadcn'" src` returns nothing. |
| 2 | Dates/numbers formatted for the chosen locale (`en-US`) | (a) Tests `src/lib/format.test.ts` (all cases below). (b) `rg -n "toLocale(Date\|Time)?String\(" src --glob '!**/*.test.*'` only hits `src/lib/format.ts`, plus `src/components/ui/calendar.tsx`, where the call takes `APP_LOCALE`. (c) `rg -n "'en-GB'\|Intl\.DateTimeFormat\('en'" src` returns nothing. (d) The new ESLint rule makes `pnpm lint` fail on a bare `toLocaleString()` (the implementer records a quick manual check in impl-log). (e) The updated app tab tests assert `Mar 20, 2026`-style dates. |
| — | R8 checks | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` all green. |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/lib/format.ts` (new) | `export const APP_LOCALE = 'en-US'`. Shared `formatDate(value: string \| Date)` (`dateStyle: 'medium'`), `formatDateTime(value)` (`dateStyle: 'medium', timeStyle: 'short'`), `formatDateTimeZone(value)` (the current options from users `data.ts`, including `timeZoneName: 'short'`) and `formatNumber(n: number)`. Each uses an `Intl` formatter built once at module level with `APP_LOCALE`. | AC2: one locale, set in one place |
| `src/lib/format.test.ts` (new) | Unit tests, see below | R8: logic has unit tests |
| `src/features/users/data/data.ts` | Delete the three local formatters and re-export them: `export { formatDate, formatDateTime, formatDateTimeZone } from '@/lib/format'`. Existing importers stay unchanged. | AC2: replaces the bare `'en'` locale |
| `src/features/apps/data/data.ts` | `formatDate(iso: string \| null)` keeps its signature and its `'—'` for null, but calls the shared `formatDate` instead of `toLocaleDateString('en-GB', …)`. Its 6 importers stay unchanged. | AC2: removes the only en-GB formatter (consult §2) |
| `src/features/dashboard/lib/format.ts` | `formatMonth` uses `APP_LOCALE` instead of `'en-US'`. `formatCount` delegates to `formatNumber`. | AC2: locale set in one place |
| `src/features/reports/components/reports-columns.tsx` | Line 84: `row_count.toLocaleString('en-US')` → `formatNumber(row_count)`. The local ISO `formatDateTime` at line 18 stays (see Assumptions). | AC2 |
| `src/features/reports/components/reports-overview.tsx` | Lines 179 and 185: `toLocaleString('en-US')` → `formatNumber(...)` | AC2 |
| `src/features/apps/components/apps-columns.tsx` | Line 52: date-fns `format(…, 'MMM d, yyyy')` → `formatDate(row.original.created_at)`. Output stays the same (`Jan 5, 2026`). Drop the now-unused `date-fns` import. | AC2: locale set in one place |
| `src/features/organizations/components/organizations-columns.tsx` | Line 62: same change as `apps-columns.tsx` | AC2 |
| `src/components/date-picker.tsx` | Line 31: `format(selected, 'MMM d, yyyy')` → `formatDate(selected)`. Drop the `date-fns` import. | AC2 |
| `src/components/ui/calendar.tsx` | Line 37: `date.toLocaleString('default', { month: 'short' })` → `new Intl.DateTimeFormat(APP_LOCALE, { month: 'short' }).format(date)`. Line 190: `toLocaleDateString()` → `toLocaleDateString(APP_LOCALE)`. Pass `locale={enUS}` (from `react-day-picker/locale`) to `DayPicker` before `{...props}`, so callers can still override it. CLAUDE.md allows bug fixes in generated `components/ui`: the month dropdown currently follows the browser locale. | AC2 |
| `src/components/ui/calendar.test.tsx` (new) | Smoke test for the month dropdown labels | R8 |
| `src/assets/logo.tsx` | `<title>Shadcn-Admin</title>` → `<title>mmlabs Admin</title>`. `id='shadcn-admin-logo'` → `id='mmlabs-admin-logo'` (no references, checked with grep). | AC1: screen readers announce the accessible name on the auth layout |
| `src/assets/logo.test.tsx` (new) | Accessible-name test | R8 |
| `src/features/settings/profile/profile-form.tsx` | Line 84: `placeholder='shadcn'` → `placeholder='Your name'` | AC1: visible template leftover (consult §1) |
| `src/features/apps/components/app-credentials-tab.test.tsx` | Lines 129–130: `'Revoked 20 Mar 2026'` → `'Revoked Mar 20, 2026'`, and `'1 Apr 2026'` → `'Apr 1, 2026'` | These assert en-GB output, which this ticket changes on purpose |
| `src/features/apps/components/app-join-requests-tab.test.tsx` | Lines 119, 120 and 160: `'1 May 2026'` → `'May 1, 2026'`, and `/2 May 2026 \(by you\)/` → `/May 2, 2026 \(by you\)/` | Same reason |
| `eslint.config.js` | Add a block for `src/**/*.{ts,tsx}` with `no-restricted-syntax`, selector `CallExpression[callee.property.name=/^toLocale(Date\|Time)?String$/]`, message `'Format dates/numbers with @/lib/format (APP_LOCALE, PAN-024)'`. Turn it off for `src/lib/format.ts` and add `'no-restricted-syntax': 'off'` to the existing test-file override. `src/components/ui` is already ignored. | AC2 stays true after this ticket (consult rec. 7) |
| `docs/adr/0008-ui-language-and-locale.md` (new) | ADR: English-only UI, `en-US` locale, all formatting through `src/lib/format.ts`, no i18n framework, ISO-style timestamps kept for audit log and report runs, the lint rule, and how to revisit. | Rule 7: this decision outlives the ticket |

No other files. If more test files assert en-GB strings than the grep found, the implementer may update them and must list them in impl-log.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/lib/format.test.ts › APP_LOCALE is en-US` | AC2 |
| `src/lib/format.test.ts › formatDate renders month-first medium date` | `formatDate('2026-01-05T12:00:00Z')` → `'Jan 5, 2026'`. A `Date` input gives the same result. Midday UTC keeps the day stable across the runner's time zone. |
| `src/lib/format.test.ts › formatDateTime includes date and short time` | Result matches `/^Jan 5, 2026, \d{1,2}:\d{2}\s?[AP]M$/`. The regex tolerates the runner's time zone and the narrow no-break space. |
| `src/lib/format.test.ts › formatDateTimeZone appends a time zone name` | Result starts with `Jan 5, 2026` and has a trailing zone token. No exact zone string (consult risk). |
| `src/lib/format.test.ts › formatNumber groups thousands with commas` | `1284` → `'1,284'`, `1234567` → `'1,234,567'`, `0` → `'0'` |
| `src/features/apps/data/data.test.ts › formatDate returns em dash for null and en-US date otherwise` (new file, or append if one exists) | The apps wrapper: `null` → `'—'`, and `'2026-03-20T12:00:00Z'` → `'Mar 20, 2026'`. Before this change it returned `'20 Mar 2026'`. |
| `src/components/ui/calendar.test.tsx › month dropdown uses English short month names` | Render `<Calendar mode='single' captionLayout='dropdown' />`. The month dropdown has options `Jan` … `Dec`. |
| `src/assets/logo.test.tsx › has the mmlabs Admin accessible name` | `getByRole('img', { name: 'mmlabs Admin' })`, or the `<title>` text if the SVG has no role. The implementer picks the assertion that works and notes it. |
| Existing, updated: `app-credentials-tab.test.tsx`, `app-join-requests-tab.test.tsx` | Visible en-US dates in the apps and organizations tabs |
| Existing, unchanged, must stay green: `apps-table.test.tsx:351` and `organizations-table.test.tsx:69` (`Jan 5, 2026`), `dashboard/lib/format.test.ts`, `dashboard-content.test.tsx` and `kpi-cards.test.tsx` (`1,284`), and the users and roles tests that import the formatters | No visible change from swapping date-fns and `'en'` for the shared helpers |

## Approach
1. Create `src/lib/format.ts` and its tests. Build formatters once at module level: `const dateFmt = new Intl.DateTimeFormat(APP_LOCALE, { dateStyle: 'medium' })` and so on. Inputs take `string | Date`; a string goes through `new Date(value)`.
2. Point the users helpers (re-export) and the apps helper (delegate, keeping the null → `'—'`) at it. Point the dashboard `formatMonth` and `formatCount` at it.
3. Replace the inline `toLocaleString('en-US')` calls in reports and the `'MMM d, yyyy'` date-fns calls in `apps-columns`, `organizations-columns` and `date-picker` with the shared helpers.
4. Fix `calendar.tsx`: month formatter, `data-day` and the explicit `enUS` locale.
5. Fix the template leftovers: logo title and id, and the profile placeholder.
6. Update the two app tab tests that assert en-GB strings.
7. Add the ESLint `no-restricted-syntax` rule and check it trips on a scratch bare `toLocaleString()` (not committed).
8. Write ADR 0008.
9. Run `pnpm format`, then all R8 checks.

Rules:
- **R7**: only the files listed. RTL and font switchers, `app-title.tsx` and other template demo content go to follow-ups, not into this diff.
- **R10**: the logo's accessible name changes to the product name. `lang="en"` stays on `<html>`. Date output stays readable text inside the existing `<time>` elements.
- **R1–R6, R9, R11**: not affected. There are no API, auth, mutation or config changes.

Estimated diff: about 200 changed lines, well within one cycle.

## Specialist input used
`consult-frontend-developer.md`:
- Rec. 1 (locale en-US): **adopted**. Most formatters are already US-style, and en-GB is used in only one place. Recorded under Needs owner's decision.
- Rec. 2 (one module `src/lib/format.ts`): **adopted**, with one change. The apps and users helpers become thin wrappers or re-exports instead of repointing every importer. That keeps the diff small.
- Rec. 3 (replace date-fns `MMM d, yyyy`): **adopted** for `apps-columns`, `organizations-columns` and `date-picker`. The output is identical. **Not adopted** for `dashboard-content.tsx:38` (`MMM d, HH:mm`). That pattern has no year and uses a 24-hour time, no shared helper produces it, and its output is already English. It goes under Assumptions.
- Rec. 3 (keep ISO-style patterns in audit-log and reports): **adopted**.
- Rec. 4 (calendar fixes): **adopted**.
- Rec. 5 (logo title, `shadcn` placeholder): **adopted**.
- Rec. 6 (no runtime `lang`): **adopted**. `index.html` already has it.
- Rec. 7 (formatter tests and a lint guard): **adopted**. The guard is an ESLint `no-restricted-syntax` rule.
- Rec. 8 (record the decision): **adopted** as ADR 0008. The spec already records Q3.
- Risk (en-GB → en-US date change in apps and organizations tabs): **accepted** as the intended consistency fix. The affected tests are listed above.
- Open question 2 (remove the RTL and font switchers): **follow-up**, out of scope.

## Assumptions
- **Locale `en-US`** (month-first dates, 12-hour times, comma thousands separators). Reasons: the dashboard, reports, users and date-fns patterns already produce US-style output, and only `apps/data/data.ts` used en-GB. **Needs owner's decision:** confirm `en-US` or choose `en-GB` (day-first, 24-hour). If the owner picks en-GB later, the change is `APP_LOCALE` plus test literals, and the ADR records it.
- Audit-log (`yyyy-MM-dd HH:mm:ss`) and report-run (`yyyy-MM-dd HH:mm`) timestamps stay ISO-style. They are deliberate, unambiguous log formats, and the ADR records them as intentional exceptions.
- The dashboard "generated at" `MMM d, HH:mm` stays. It is English and has no locale-dependent parts. Aligning it with `formatDateTime` is a possible follow-up.
- Times display in the viewer's local time zone, as today (zone shown where appsec F6 requires it). No time-zone change.
- Template demo content in `profile-form.tsx` (`bio: 'I own a computer.'`, `shadcn.com` URLs) is English and belongs to the template's demo Settings → Profile. It is not a language issue, so only the placeholder is fixed here.

Follow-ups (not in this diff):
1. Remove the template's RTL direction switcher (`direction-provider.tsx`, `appearance-form.tsx`, `config-drawer.tsx`, `icon-dir.tsx`, `rtl:` classes in `sidebar.tsx`, `calendar.tsx`, `nav-group.tsx` and `maintenance-error.tsx`, `config-drawer.test.tsx`) and the font switcher. They are dead UI with English only. This needs the owner's OK because it touches generated shadcn files.
2. Delete the unused `src/components/layout/app-title.tsx` (it still says `Shadcn-Admin` and `Vite + ShadcnUI`; it is commented out in `app-sidebar.tsx`).
3. Replace the template demo defaults in Settings → Profile when that screen moves onto the real API.
4. Optional: a wording pass for consistent capitalisation and terms ("Sign in" vs "Log in"). The consult did not audit every component.

## Blocking questions
None.

## Split proposal
None.

## Screens
None. There are no route, permission or state changes. The only visible effect is that dates in the apps and organizations detail tabs change from `20 Mar 2026` to `Mar 20, 2026`, the calendar month dropdown always shows English short names, and the logo's accessible name becomes `mmlabs Admin`.

## API calls used
None.
