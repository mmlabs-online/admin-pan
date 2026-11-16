## Attempt 1

A11y review of PAN-011, attempt 1, against WCAG 2.2 AA. This was a read-only review of the code in the diff. I did not run axe, a screen reader or Playwright, so keyboard and live-region behaviour is judged from the code.

🔴 Blockers: none. No A/AA failure found on a changed screen.

### 🟡 Should-fix
1. **The reason for a disabled control can't be reached from the control itself** (1.3.1, 3.3.2; related 4.1.2).
   - Where: `src/components/permissions/can.tsx:30-44`, and the callers `roles/index.tsx:64-77`, `roles/components/role-assignments-sheet.tsx:97-110`, `apps/components/app-permissions-tab.tsx:74-86` and `:118-128`, and `organizations/components/organizations-primary-buttons.tsx:11-19`.
   - Problem: the callers use native `disabled` together with `aria-describedby`. A natively disabled button is skipped by Tab, so a keyboard user never lands on it and the reason is never announced on focus. It is not a failure, because the reason is visible text right next to the control.
   - Preferred fix: in the denied state use `aria-disabled='true'` instead of native `disabled`, keep `aria-describedby`, and make `onClick` (or `onCheckedChange` for the Radix Switch) do nothing.
   - Minimum fix: keep native `disabled`, make sure the reason sits directly after the control in reading order, and add a test for that.
2. **`aria-describedby` can point to an id that doesn't exist** (`can.tsx:38`). The reason span is only rendered when `req.kind === 'permission'`, but `describedBy` is set whenever the control is denied.
   - Fix: `describedBy: denied && req.kind === 'permission' ? id : undefined`.
   - Also: in `app-permissions-tab.tsx:118-128` the "Requires …" text is repeated on every row. Prefer one shared description, or `sr-only` text on the repeated rows.
3. **The page variant of ForbiddenPanel doesn't handle focus or the title** (2.4.3, 2.4.2, 4.1.3).
   - Where: `components/forbidden-panel.tsx:83-102` and `components/permissions/route-permission-guard.tsx:34-53`.
   - Problem: the guard swaps the content without a navigation, so focus stays on the sidebar link. A `role='alert'` that is inserted in the same render as its container is often not announced.
   - Fix: give the `<h2>` `tabIndex={-1}` and focus it on mount. Then drop `role='alert'` from the description to avoid a double announcement. Optionally set the document title.
4. **The inline variant has no consumer in this diff** (4.1.3).
   - Where: `forbidden-panel.tsx:73-80`.
   - Note for later wiring: render the inline panel when the 403 arrives, not together with the content. Add a test for that.

### 💭 Notes
- "Go back" and "Try again" are real buttons. Only show "Try again" when `onRetry` is passed; route denials shouldn't pass it.
- The nav and command-menu filtering drops empty groups. That's good.
- Check `--muted-foreground` against `--background` in dark mode.
- Row-action triggers keep their sr-only names, and the destructive bulk button is hidden when denied. Both are fine.

### What's working well
- The denied state is shown in text, not only by colour or opacity.
- The `<Can>` render-prop makes it natural for callers to link the reason.
- All copy is React text.
- The guard keeps the URL and the layout.

### Follow-ups
- Add tests that `aria-describedby` points to an element that exists, and that focus lands on the panel heading.
- Add a shared `<GuardedButton>`.
- In PAN-011b, re-check hide versus disable for each control.
- Run axe once PAN-023 is in.
