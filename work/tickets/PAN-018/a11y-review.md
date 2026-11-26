# PAN-018 — accessibility review

## Attempt 1

**Findings (PAN-018, attempt 1, a11y review)**

I did this by reading the code. I did not run axe or Playwright, and I did not run a screen reader. Files read: the new Members tab, Invitations tab, `offset-pager.tsx`, the detail sheet diff, `data/members.ts`, `table.tsx` and `query-view.ts`.

**No blockers.** I found no WCAG A or AA failure on the changed screens.

**🟡 Should-fix**

1. **Scrollable table region is not keyboard reachable (2.1.1 Keyboard).**
   - Evidence: `organization-members-tab.tsx:85` and `organization-invitations-tab.tsx:193` wrap the table in `<div className='overflow-x-auto'>`. `components/ui/table.tsx:7` adds a second `overflow-x-auto` container, `data-slot='table-container'`.
   - Both tables have 6 columns inside a narrow sheet, so they will overflow. This is also the case at 320px width and at 200–400% zoom. Neither scroll container has `tabIndex=0`, a role or a label.
   - Impact: a keyboard-only user cannot scroll horizontally to the Expires, Status and Accepted/revoked columns. axe flags this as `scrollable-region-focusable`.
   - Fix: remove the redundant outer div at both lines. Keep the border and radius on the `Table` container, or pass them through `className`. Make the scroll container focusable with `tabIndex={0}`, `role='region'` and `aria-label`. Edit `table.tsx` only if it needs the bug fix. Otherwise leave `table.tsx` alone and give the outer div `tabIndex={0} role='region' aria-label='Role assignments in {org.name}'`. The same applies to the entitlements tab at `organization-entitlements-tab.tsx:115`, which is outside this diff, so record it as a follow-up.

2. **Focus is not moved when the invitations status filter changes or the page changes (2.4.3 Focus Order, only a risk).**
   - Focus stays on the Select or the Prev/Next button. That is acceptable, because `aria-disabled` keeps focus and the result counts are announced.
   - Entitlements moves focus to its heading (`organization-entitlements-tab.tsx:69`), but these tabs do not. Keep it consistent or document the difference. Because the content stays in the same tab, I rate this 💭 rather than a failure.

3. **Two overlapping `role='status'` regions (4.1.3 Status Messages, minor).**
   - Evidence: the always-mounted sr-only region (`organization-members-tab.tsx:56` and `organization-invitations-tab.tsx:166`) is separate from the pager's own status (`offset-pager.tsx:25`) and the "Loading…" status (`organization-members-tab.tsx:65` and `organization-invitations-tab.tsx:175`).
   - The "Loading…" `<p role='status'>` is inserted already containing text, and some screen readers skip such regions.
   - Fix: put the loading text inside the always-mounted sr-only region. Alternatively, add `aria-busy` on the container.
   - Page-change announcements are fine. The total text is unchanged, so only the pager's "Showing x–y of N" is read.

**💭 Notes**
- `offset-pager.tsx:29-52`: the Previous and Next buttons have no object in their names. This is fine, since only one pager is visible per tab. If the pager is ever reused with two on screen, add `aria-label={`Previous ${noun}`}`.
- `organization-members-tab.tsx:107`: a long email in `bdi block text-xs` has no `break-words`. Add `break-all` or `break-words` so it does not force extra horizontal scroll (1.4.10 Reflow).
- Disabled-state opacity at `offset-pager.tsx:22` is exempt from the contrast rule (1.4.3).

**What's working well**
- Tables have an `aria-label` and `scope='col'` headers.
- The status filter has a real `<Label htmlFor>` tied to the `SelectTrigger` id.
- Status is conveyed in text, not by colour: "Expired" and "Not expired" badges, "Accepted/Revoked" text, and "Never" for no expiry.
- `<time dateTime>` is used for dates.
- Errors use `role='alert'` with a Retry button that stays mounted during refetch, because `queryView` keeps the error until success.
- A 403 gets a proper panel.
- The `aria-disabled` pager keeps focus.
- `TabsList` wraps with `flex-wrap`, so there is no reflow problem. Radix Tabs provides roles and arrow-key handling.
- Tabs are hidden by permission and mounted lazily.
- Names and emails are rendered as text only, inside `bdi`.

**Summary:** no 🔴 blockers and one 🟡 should-fix that matters (keyboard-inaccessible scrollable table regions); WCAG 2.2 AA conformance for the changed screens is not fully determined without axe/Playwright, but the code review passes with that fix recommended.

**Follow-ups:**
- Fix the same scrollable-region pattern in the entitlements tab and any other tables inside a sheet.
- Add an axe e2e check on the organization detail sheet when PAN-023 lands.
