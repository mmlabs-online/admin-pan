## Attempt 1 — 2026-11-26
Verdict: PASS

### Checks (run by reviewer)
`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`, branch `claude/zealous-turing-4o04h1` at 589446b.
- pnpm typecheck: clean (`tsc -b`)
- pnpm lint: clean
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test: 124 files passed, 1003 tests passed. This matches impl-log.
- pnpm build: "built in 1.15s"
- pnpm e2e: not in the plan
- Lint guard check: I piped `new Date().toLocaleString()` and `(1).toLocaleString()` through `eslint --stdin --stdin-filename src/features/dashboard/scratch.ts`. Both failed with "Format dates/numbers with @/lib/format (APP_LOCALE, PAN-024)" (`no-restricted-syntax`). No file was written.

### Acceptance criteria
- [x] All UI strings follow the decision (English). Evidence:
  - `rg -n '[à-ỹÀ-Ỹđ]' src index.html` only finds the `Café` fixture in `src/lib/list-search.test.ts:22`.
  - `index.html:2` still has `<html lang="en">`.
  - `rg 'Shadcn-Admin|shadcn-admin-logo' src/assets` finds nothing. `src/assets/logo.tsx:20` has `<title>mmlabs Admin</title>`, and the test `src/assets/logo.test.tsx › has the mmlabs Admin accessible name` passes.
  - `rg "placeholder='shadcn'" src` finds nothing. `profile-form.tsx:84` now says `Your name`.
- [x] Dates and numbers use the chosen locale (`en-US`). Evidence:
  - `src/lib/format.ts:2` sets `APP_LOCALE = 'en-US'`. Every formatter is built once at module level.
  - `src/lib/format.test.ts` covers all 5 cases from the plan, and they pass.
  - `src/features/apps/data/data.test.ts` passes: null gives `—`, and a date gives `Mar 20, 2026`.
  - `src/components/ui/calendar.test.tsx › month dropdown uses English short month names` passes.
  - `rg "toLocale(Date|Time)?String\(" src --glob '!**/*.test.*'` only finds `calendar.tsx:193`, which passes `APP_LOCALE`.
  - `rg "'en-GB'|Intl\.DateTimeFormat\('en'" src` finds nothing.
  - The updated tests in `app-credentials-tab.test.tsx:129-130` and `app-join-requests-tab.test.tsx:119-163` assert `Mar 20, 2026`-style dates and pass.
  - The lint guard is in `eslint.config.js:113-130` and I checked that it fires (see above).

### Issues
None.

### Scope (R7)
Every changed source file is in the plan, with one exception: `organization-invitations-tab.test.tsx`. impl-log explains it under Out-of-plan files (its regex assumed day-first dates), and the plan allows updating test files that assert en-GB output. Commit b020b4f (the solo spec update) is excluded, as instructed. No new dependencies: `react-day-picker/locale` comes from a package that is already installed.

### Rules R1–R11
No violations found. There are no API, auth, mutation or config changes. The new `no-restricted-syntax` block does not replace an earlier rule of the same name, because none existed. Turning it off for `src/api/**` and test files does not weaken any existing restriction.

### Security / a11y blockers
None. The orchestrator did not trigger the appsec reviewer: the diff touches no auth code, API client, config, dependencies or nginx. The a11y review is up to the orchestrator because the ticket's areas include `ui`.

### Nits (do not block)
- `docs/adr/0008-ui-language-and-locale.md:11` says the rule rejects `toLocale(Date|Time)String()`. The selector also matches plain `toLocaleString()`, so the wording could say `toLocale(Date|Time)?String()`.
- `calendar.test.tsx:9` uses the selector `'select.rdp-months_dropdown, select'`. The `, select` fallback could silently pick the year dropdown if the class name changes. Asserting on the months dropdown alone (for example by its accessible name) would be stricter.
- `organization-invitations-tab.test.tsx:141,144`: `[A-Z]` is looser than before. `/^Accepted [A-Z][a-z]{2} \d{1,2}, \d{4}/` would pin the en-US shape.
- Before and after this change, `formatDate` and the other helpers throw `RangeError` on an invalid date string. This is unchanged behaviour, noted only for when real API data arrives.

### Follow-ups (out of scope)
- These are the plan's follow-ups 1–4: remove the RTL and font switchers, delete `app-title.tsx`, replace the Settings → Profile demo defaults, and do a wording pass.
- Owner decision from the plan's assumptions: confirm `en-US` or choose `en-GB`.
- The dashboard's "generated at" timestamp (`MMM d, HH:mm` via date-fns) could be aligned with `formatDateTime`.
