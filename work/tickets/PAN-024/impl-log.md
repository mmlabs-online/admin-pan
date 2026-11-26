
## Attempt 1

Implemented plan.md as written.

### Touched files
New: `src/lib/format.ts`, `src/lib/format.test.ts`, `src/features/apps/data/data.test.ts`, `src/components/ui/calendar.test.tsx`, `src/assets/logo.test.tsx`, `docs/adr/0008-ui-language-and-locale.md`.
Modified: `eslint.config.js`, `src/assets/logo.tsx`, `src/components/date-picker.tsx`, `src/components/ui/calendar.tsx`, `src/features/apps/components/app-credentials-tab.test.tsx`, `src/features/apps/components/app-join-requests-tab.test.tsx`, `src/features/apps/components/apps-columns.tsx`, `src/features/apps/data/data.ts`, `src/features/dashboard/lib/format.ts`, `src/features/organizations/components/organizations-columns.tsx`, `src/features/reports/components/reports-columns.tsx`, `src/features/reports/components/reports-overview.tsx`, `src/features/settings/profile/profile-form.tsx`, `src/features/users/data/data.ts`, `work/tickets/PAN-024/impl-log.md`.

### Out-of-plan files
- `src/features/organizations/components/organization-invitations-tab.test.tsx`: regex `/^Accepted \d/` assumed day-first en-GB dates; changed to `[A-Z]` (month-first now).

### Notes
- Logo test asserts the `<title>` text (SVG has no role).
- Lint rule check: a scratch `new Date().toLocaleString()` in `src/` failed `pnpm lint` with the PAN-024 message (scratch file removed).

### Checks
- typecheck: clean; lint: clean; format:check: all files use Prettier style
- test: 124 files passed, 1003 tests passed
- build: built OK

### Follow-ups
As listed in plan.md.
