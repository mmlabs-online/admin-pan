# PAN-014 a11y review

## Attempt 1

WCAG 2.2 AA, R10. **No 🔴 blockers.** The three requested ConfirmDialog fixes are implemented correctly. Three 🟡 should-fix items and some 💭 notes. Code read only; `pnpm e2e` not run by the auditor (unit tests in `confirm-dialog.test.tsx` and the org dialog tests assert aria-disabled, the sr-only status and Escape blocked while pending).

### Requested fix, verified
- `src/components/confirm-dialog.tsx:76-104`: while pending, confirm and cancel use `aria-disabled` instead of `disabled` (focus stays); both `onClick`s return early or `preventDefault`. Enter-key submit in the delete form is blocked too; `organizations-delete-dialog.tsx:119` adds a second guard.
- `confirm-dialog.tsx:72-74`: the `role=status aria-live=polite` region is always mounted, so pending text is announced; the confirm label also changes.
- `confirm-dialog.tsx:57-61`: Escape does not close while pending.
- `confirm-dialog.tsx:71,99`: error container has an id; confirm gets `aria-describedby` only when an error exists. All callers pass `role='alert'` content (org status, org delete, users status, inline `ForbiddenPanel` at `forbidden-panel.tsx:28`).
- `organizations-action-dialog.tsx:205-223`: same pattern; server errors use `form.setError` with `shouldFocus`; `FormMessage` links field errors; the slug on edit uses `aria-readonly`.
- Table: aria-label, `aria-busy`, polite status region, `role=alert` + Retry on error; sr-only actions header; row action named "Actions for <name>".

### Findings
1. 🟡 **1.4.3 — Delete menu item contrast.** `data-table-row-actions.tsx` Delete item uses `text-red-500!` (#ef4444 on white ≈ 3.8:1). Fix with `text-destructive` / `red-600`/`red-700`, or follow-up if inherited from the template. Check users row actions too.
2. 🟡 **2.4.3 — Focus lost after a successful delete.** `organizations-delete-dialog.tsx:123-127` + row actions: the row disappears after refetch, Radix cannot return focus to the removed trigger, focus falls to `<body>`. Fix: move focus deterministically (table, `<h1 tabIndex={-1}>`, or "New organization"), and assert `document.activeElement !== body` after close.
3. 🟡 **Test gap.** `e2e/pages.e2e.ts:139-176` only covers open/axe/cancel for the org dialogs; not pending state, failure alert, or focus return. Add one assertion for focus return after cancel and after success; run axe with the 403/error state showing.
4. 💭 Delete button is natively `disabled` until the slug matches (`organizations-delete-dialog.tsx:151`); not a failure (input label explains); consider `aria-disabled` + description for consistency.
5. 💭 `opacity-50` on the pending button (`confirm-dialog.tsx:98`, `organizations-action-dialog.tsx:213`) is exempt as an inactive control; state also conveyed by `aria-disabled` and label.
6. 💭 Inputs stay editable while pending; harmless (submit guarded); optional `readOnly`/`aria-busy`.
7. 💭 Pending text announced twice by some screen readers; acceptable.

### Follow-ups
- Audit `text-red-500` / `text-red-400` across other row-action menus (users, apps, roles).
- Shared focus-return helper for "row removed after delete".
- E2E axe pass for dialog error states.
