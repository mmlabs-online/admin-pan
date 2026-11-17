## Attempt 1 — 2026-11-17
Verdict: PASS

### Checks (run by reviewer)
- pnpm typecheck: pass (`tsc -b`, exit 0; includes the new `tsconfig.e2e.json` reference)
- pnpm lint: pass (`eslint .`, exit 0)
- pnpm format:check: pass ("All matched files use Prettier code style!")
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): 70 files, 491 tests passed. Same count as impl-log, so Vitest does not pick up `e2e/**` (`vite.config.ts:37`).
- pnpm build: pass ("built in 1.40s")
- pnpm e2e (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): 22 passed (43.2s), 2 workers. Matches impl-log.
- `pnpm why playwright-core`: one version, 1.59.1.

### Acceptance criteria
- [x] `pnpm e2e` runs against mocks in CI. Evidence:
  - (a) `.github/workflows/ci.yml:37-62` adds a separate `e2e` job: ubuntu-24.04, 20 min timeout, `sha256sum -c`, `pnpm install --frozen-lockfile`, `pnpm test:browser:install`, `pnpm e2e` with `CI: true`, and an artifact upload of `playwright-report/` and `test-results/` when it fails (7-day retention). The job is independent of `check`, and permissions are unchanged.
  - (b) The local run is green with every planned spec present.
  - (c) The fake API answers `https://api.e2e.test/**` (`e2e/support/fake-api.ts:171-225`). Unmatched requests get a 501 and are recorded (`:208-211`). Admin routes check the Bearer token (`:212-221`). The auto fixture `e2e/support/fixtures.ts:23-52` aborts and fails on non-local origins, page errors and unexpected `console.error`. Fixtures are typed from `src/api/schema` (`fake-api.ts:2-6`).
  - (d) `git grep -n e2e src/` finds nothing. The only `src/` changes are the a11y class and attribute fixes (5 files, +22/-7).
  - (e) All checks are green. There is no `test.skip`, `test.only` or `test.fixme` in `e2e/`, and `forbidOnly` is set in CI (`playwright.config.ts:9`).
- [x] axe finds no serious/critical issues on main pages (R10). Evidence:
  - `e2e/support/a11y.ts:5,30` uses the WCAG 2.0/2.1/2.2 A and AA tags. It fails on `serious`/`critical` (`:32-34`, `:69`) and attaches moderate and minor results (`:36-49`).
  - Grep finds no `disableRules`, `.exclude()` or tag narrowing.
  - `e2e/support/a11y-known-issues.ts:12` is empty.
  - A stale entry fails the run (`a11y.ts:65-68`), and the self-check `e2e/a11y-helper.e2e.ts` passes.
  - Every row of the plan's "Pages covered" table is swept: `e2e/pages.e2e.ts:30-101` and `:103-155`, including the confirm dialog and the sheet with Raw JSON open, plus `e2e/sign-in.e2e.ts:47-58` for the idle and error states.
  - impl-log records the red run with the badge class reverted (`color-contrast` failed). I did not re-run it, because a revert edit is outside my write scope.

### Issues
None blocking.

### Judgement of stated deviations
1. **Focus-return assertions dropped (users confirm dialog, audit-log sheet).** Accepted.
   - The plan's a11y budget allows only local attribute or class changes and "no new component or behaviour" (plan, "Fix budget"). Restoring focus is a behaviour change.
   - The claim holds up in the code. The audit-log sheet is a controlled `Sheet` with no `SheetTrigger` (`src/features/audit-log/components/audit-log-detail-sheet.tsx:42`, opened from `audit-log-table.tsx:213`), so Radix has no trigger to return focus to. The users dialog opens from a dropdown menu item that unmounts.
   - Neither assertion is an acceptance criterion: AC1 is the infrastructure and AC2 is axe, and axe cannot test focus (plan, Accessibility scope, PAN-016 🟡2).
   - The finding is recorded as a WCAG 2.4.3 follow-up in impl-log. Asserting broken behaviour, or adding `test.fixme` (which the plan forbids), would be worse. The test names were adjusted to match.
2. **Extra file `src/components/data-table/pagination.tsx:51`.** Accepted.
   - The plan lists "Other `src/` files: only under the a11y fix budget" and allows `aria-label`.
   - axe reported `button-name`, which is critical, on the page-size `SelectTrigger`. The fix is one attribute, and the label matches the adjacent visible text "Rows per page" (`:62`), so WCAG 2.5.3 is respected.
   - The total `src/` diff is 22+/7- in 5 files, inside the ≤80 lines / ≤6 files budget.
   - It is logged under Out-of-plan files with the rule id and target.
3. **Removed `/// <reference types="vitest/config" />` (`vite.config.ts:1`).** Accepted.
   - The planned `import { configDefaults } from 'vitest/config'` (`:7`) loads the same type augmentation, and ESLint flags a duplicate triple-slash reference when the module is also imported.
   - `pnpm typecheck` passes, so the `test` block is still typed.
   - It is a one-line side effect of a planned change and is justified in impl-log.

### Scope
- Every changed file is in the plan's file list, or justified in impl-log (`pagination.tsx`, the `vite.config.ts` line).
- `CLAUDE.md` is untouched, as the plan requires; its update is listed as a follow-up.
- ADR 0006 is new and does not collide with an existing ADR number.

### Rules R1–R11
No violations found.
- **R1, R2:** The fake exists only in `e2e/`. No HTTP code was added to `src/`.
- **R3:** Sign-in goes through the real form (`fixtures.ts:54-63`). `sign-in.e2e.ts:60-87` asserts that neither the token nor the password appears in localStorage, sessionStorage or cookies after a reload.
- **R5:** `.env.e2e` holds public placeholders only. The credentials are sentinels. axe failure output lists rule, target and summary, not page text (`a11y.ts:60-62`).
- **R7:** The `src/` diff stays within the a11y budget.
- **R8:** All checks pass, including `pnpm e2e`.
- **R10:** The axe gate is in place.

### Security / a11y blockers
None. No `security-review.md` or `a11y-review.md` is present for this attempt.

### Nits (do not block)
- The stale known-issue check (`e2e/support/a11y.ts:51,65`) only covers entries whose `pageId` is run. An entry with a mistyped or retired `pageId` would never be flagged. Consider a one-time check that every `knownIssues[].pageId` is in the set of swept page ids.
- Plan step 3 asked to record whether Chromium sends CORS preflights to `route`. impl-log says this "was not separately logged". The behaviour is harmless either way, but the plan asked for it.
- The `signIn` fixture waits for the URL to leave `/sign-in` (`fixtures.ts:61`), not for a heading as the plan says. Every caller asserts the heading next, so the effect is the same.
- `getByRole('alertdialog').or(getByRole('dialog'))` (`pages.e2e.ts:131`, `sign-out.e2e.ts:16`) could name the exact role now that it is known.

### Follow-ups (out of scope)
- Focus is not restored after the users confirm dialog closes or after the audit-log sheet closes (WCAG 2.4.3). This needs a behaviour fix and a new e2e assertion.
- `CLAUDE.md`: replace "Playwright e2e later (PAN-023)" with `pnpm e2e` (owner approval).
- Owner: add `e2e` to the required checks, and consider gating `release.yml` on it.
- Run axe in dark theme, at tablet width, on Firefox and WebKit, and on the error pages and gate panels.
- `src/features/reports/data/data.ts:43` still uses `text-destructive` on `bg-destructive/10`.
- Add `dist-e2e` to `.dockerignore`.
- Findings still open from earlier reviews, as listed in impl-log.
