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
