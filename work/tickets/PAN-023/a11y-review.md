# PAN-023 a11y review

## Attempt 1

Review of PAN-023 a11y edits and the axe gate. No 🔴 blockers. Static read of the diff and e2e files only; the auditor did not run `pnpm e2e` or axe.

### (1) src/ edits: all acceptable

- 🟡 **Red badge text in dark mode was not changed or re-verified.** users/organizations/audit-log `data/data.ts`: light mode now uses `text-red-800` on `bg-destructive/10` (about 8:1, fine). Dark mode still uses `dark:text-primary` on `dark:bg-destructive/50`, untouched. No spec scans dark mode, so 1.4.3 there is unverified. Fix: add a dark-mode axe pass.
- 💭 Scroll regions in `audit-log-detail-sheet.tsx:137-142, 173-178, 206-211` are correct for 2.1.1 / 4.1.2 (`tabIndex=0`, `role=region`, `aria-label`, visible `focus-visible` ring); clears `scrollable-region-focusable`. The label duplicates the sr-only `<caption>`, so "Before and after" is announced twice; harmless (could use `aria-labelledby`). The `<pre>` inside a closed `<details>` is not focusable until opened, which is correct. Region names are distinct, so `landmark-unique` passes.
- 💭 `pagination.tsx:51` `aria-label='Rows per page'` is correct (4.1.2 / 3.3.2) and matches the visible text (2.5.3). `aria-labelledby` on the visible `<p>` would be nicer, but that `<p>` is `hidden sm:block`, so the aria-label is fine on small screens.

### (2) Does the e2e gate enforce AC2?

Enforcement is sound:
- `e2e/support/a11y.ts:30-54` fails on any serious or critical violation with tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa.
- No `exclude()` or `disableRules()`. The only escape hatch is `knownIssues` (`a11y-known-issues.ts:12`), empty, matching exact rule + page + target; stale entries also fail. The "max 5" cap is a comment only, not enforced in code.
- Moderate and minor findings are attached to the report, not failing; acceptable for AC2.
- `e2e/a11y-helper.e2e.ts` self-tests that a violation fails and a stale entry fails.
- The plan names `support/axe.ts`; the file is `support/a11y.ts`. Reconcile in plan or impl-log.

Coverage gaps:
- 🟡 **No dark-mode scan.** `playwright.config.ts:15` sets `colorScheme: 'light'`; the appearance spec switches to Dark and back before scanning (`pages.e2e.ts:~65-75`). Dark-theme contrast (1.4.3, 1.4.11) is unchecked, and the dark badge classes are most at risk. At minimum scan before switching back to Light.
- 🟡 **Badge states:** users `suspended`/`disabled` contrast not asserted (the disabled bob row is probably covered; confirm). Organizations has no suspended-state check unless the fake returns one; verify the fixture.
- 🟡 **Audit-log sheet:** the `changes:null` entry and `denied` outcome badge are never opened or scanned; only the first entry is. Add a scan of the second entry's sheet.
- 🟡 **Reflow/zoom (1.4.10) not covered:** every spec uses 1280x800. A 375px run would catch responsive-only regressions on the sheet and tables.
- 🟡 **Not covered:** rows-per-page dropdown open, settings forms with validation errors (R10 linked errors), users create/invite dialog, empty/error/403 states, 404/403/500 error pages. Add at least one validation-error scan on a settings form.
- 💭 Public auth pages are scanned signed out (good). 404 and 403 error pages are not scanned.
- 💭 The settle wait (`a11y.ts:15-26`) only waits for `role=status` "loading"; skeletons without a status role could be scanned mid-load. Each spec asserts a heading first, which mitigates this.
- 💭 Keyboard/focus behaviour is not tested (Escape + focus return, skip link, page title on route change): manual or follow-up for 2.4.1, 2.4.2, 2.4.3.

**WCAG conformance statement:** NOT DETERMINED. The light-mode, 1280px axe gate on the listed pages is correctly built with no blanket exclusions, so AC2 is met as written for those states. Dark mode, small viewports, form-error states and manual screen reader/keyboard checks are untested.

### Follow-ups
1. Add a dark-mode axe pass (most valuable).
2. Scan the audit-log `changes:null` sheet and a settings form validation error.
3. Add a 375px viewport run.
4. Enforce the "max 5" known-issues cap in code, or drop the claim.
5. Reconcile `support/axe.ts` (plan) with `support/a11y.ts` (code).
