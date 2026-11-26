# ADR 0008: UI language and locale

Status: accepted (PAN-024, 2026-11-26)

## Context
Spec §8 Q3 (owner, 2026-11-26): the UI language is English. Formatters previously mixed `'en'`, `'en-US'`, `'en-GB'` and the browser default.

## Decision
- English only. No language switcher, no i18n framework. `<html lang="en">` stays.
- One locale, `en-US` (`APP_LOCALE` in `src/lib/format.ts`). All date and number formatting goes through `formatDate`, `formatDateTime`, `formatDateTimeZone` and `formatNumber` there.
- An ESLint `no-restricted-syntax` rule rejects bare `toLocale(Date|Time)String()` calls in `src/` (tests and `src/lib/format.ts` excepted).
- Intentional exceptions: audit-log (`yyyy-MM-dd HH:mm:ss`) and report-run (`yyyy-MM-dd HH:mm`) timestamps stay ISO-style, as unambiguous log formats; the dashboard "generated at" `MMM d, HH:mm` stays.
- Times display in the viewer's time zone.

## Revisiting
To switch to another English locale (e.g. `en-GB`), change `APP_LOCALE` and the test literals, and update this ADR. Adding a second language needs a new ADR (i18n framework, string extraction).
