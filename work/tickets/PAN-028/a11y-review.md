# PAN-028 a11y review

## Attempt 1

Static review of code, unit tests and e2e; axe and e2e not run by the auditor. **No 🔴 blockers.** Three 🟡, four 💭.

### Findings
1. 🟡 **Pager buttons drop focus when they become disabled (2.4.3 / 4.1.3)** — `src/features/apps/components/app-join-requests-tab.tsx:283-300`. Next on the second-to-last page (and Previous on page 1) becomes natively `disabled`, so focus falls to `body`. Fix: `aria-disabled` + ignore the click (as ConfirmDialog does), or move focus to the status line / heading. The `role='status'` range line is good.
2. 🟡 **Success-path focus may race Radix's focus restore (2.4.3)** — `app-join-requests-tab.tsx:60-67` with `app-join-request-decision-dialog.tsx:36-41`. Radix restores focus in a `setTimeout(0)` after unmount, possibly after the tab's effect focuses the heading; the restored Approve/Reject button then disappears on refetch. Same pattern as `app-credentials-tab.tsx` (where the PAN-027 reviewer found Radix does not return focus without a Trigger). The e2e `toBeFocused()` on the heading should catch it. Fix only if flaky: `onCloseAutoFocus={(e) => e.preventDefault()}` via ConfirmDialog (see `app-permission-form-dialog.tsx:119`).
3. 🟡 **Filter change is not announced (4.1.3)** — `app-join-requests-tab.tsx:136-156`, `187-263`. Changing Status replaces the body or shows the empty row with no announcement (status only for loading and for the pager when total > one page). Fix: a polite sr-only status like `{total} {status} join requests` outside the swapped region, or make the empty message a `role='status'`.
4. 💭 `overflow-x-auto` wrapper (`:171`) with no focusable content on Approved/Rejected may trip `scrollable-region-focusable` when overflowing; add `tabIndex={0}`, `role='region'`, `aria-label`, or check in e2e.
5. 💭 `truncate` name/email cells (`:190-205`) expose full text only via `title` (1.4.10); consider wrapping.
6. 💭 Permission note (`:267-276`) sits after the table; consider placing it above.
7. 💭 E2E axe runs only on the pending list and the reject dialog; add Approved filter (different columns), empty, 403 and approve dialog.

### Working well
- Status filter has a real `<Label htmlFor>`; semantic table (`scope='col'`, `aria-label`, sr-only Actions header).
- Status, "Email not verified", "Account disabled" are text badges; `<time dateTime>` dates; "(you)"/"(by you)" plain text.
- Approve/Reject `aria-label`s start with the visible text (2.5.3); email fallback when no display name.
- Policy/disabled notes as text; loading `role='status'`; errors `role='alert'` + Retry; 403 via ForbiddenPanel.
- Decision dialog is an alertdialog naming requester and app; destructive variant for Reject; pending `aria-disabled` + sr-only status; Escape ignored; error linked via `aria-describedby`.
- Cancel returns focus to the row button via a ref map (heading fallback); unit and e2e tests assert both paths.
- Tab inside `Can`; permission-less state degrades to a note.

### Follow-ups
- Shared pager component using `aria-disabled` (finding 1).
- Shared sr-only result-count announcer for filtered tables (finding 3).

## Attempt 2

Static review of the attempt-2 code only; axe, unit tests and e2e not run by the auditor. **No 🔴, nothing regressed.** One new 🟡 (pager unmounts on page change).

### Attempt-1 findings
1. Pager buttons dropping focus when disabled: **resolved** — `aria-disabled` + click ignored (`app-join-requests-tab.tsx:288-311`).
2. Success-path focus race with Radix restore: unchanged, 🟡 conditional (fix only if the heading `toBeFocused()` proves flaky).
3. Filter change not announced: **resolved** — sr-only polite status outside the swapped region (`:160-164`), "N pending join requests found." with singular/plural; also announces the new count after a decision.
4-7. 💭 unchanged (overflow wrapper `:179`; `truncate` cells `:199`, `:205`; permission note after table `:272-281`; e2e axe coverage).

Requester label fallback is fine: `requesterLabel` falls back to email, sub-line only when a display name exists (`:203`); dialog `who` matches (`app-join-request-decision-dialog.tsx:52-58`).

### New finding
🟡 **Focus on Next/Previous lost on page change (2.4.3, 4.1.3)** — `app-join-requests-tab.tsx:168-316` with `src/features/apps/api/queries.ts:159-175` (no `keepPreviousData`, `:156-158`). Changing `offset` changes the key, `view.status` becomes `'pending'`, the table and pager are replaced by "Loading join requests…", the focused Next button unmounts and focus falls to `body` on every page change. The "Showing x–y of z" status remounts populated and may not be announced. Not 🔴 (no trap, all operable). Fix: (a) keep the pager mounted across loads (last known total), loading text only in the table body; or (b) `placeholderData` keeping previous data only when paging within the same app and status, plus `aria-busy`; minimum: focus the `h3` after the page settles and fold the range into the sr-only status. Add an assertion that focus is not on `body` after clicking Next.

### Follow-ups
- Shared pager (aria-disabled, mounted across loads, announces range) for all paginated tables.
- Shared sr-only result-count announcer for filtered tables.
