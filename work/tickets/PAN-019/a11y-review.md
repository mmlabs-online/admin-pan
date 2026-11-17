# PAN-019 a11y review

## Attempt 1

WCAG 2.2 AA, R10. Read-only code review of `origin/main...HEAD`; axe/Playwright not run by the auditor (the e2e spec runs axe on the sheet, grant dialog and confirm dialog).

**No 🔴 blockers.** One 🟡 (repeat of PAN-015 finding 1), one 🟡 test gap, the rest 💭.

### Findings
1. 🟡 **Removing a limit row drops keyboard focus (2.4.3)** — `src/features/organizations/components/entitlement-form-dialog.tsx:309` (`limits.remove(index)`). The focused "Remove limit row N" button unmounts; focus falls back to the dialog container. Fix: after removal renders, focus the same index's key input if the row exists, else the previous row's key, else the "Add limit" button (ref); optional sr-only "Limit removed". Add an interaction test. Same fix applies to `src/features/apps/components/app-form-dialog.tsx:320` (PAN-015 finding still open).
2. 🟡 **No e2e assertion for focus return / keyboard paths** — `e2e/pages.e2e.ts` (~279-342). Assert focus on the switch after Cancel and after Disable, on Edit/Grant after the form closes, on "View Acme Corp" after Escape; add a keyboard-only add/remove limit check after finding 1.
3. 💭 "Add limit" focus is fine (RHF `shouldFocus` default, `:330`); cover with a test.
4. 💭 Limit rows after the first have no visible label (`:270`, `:288`), named via `aria-label` (passes 1.3.1/4.1.2). The `mt-[1.625rem]` on the remove button (`:307`) misaligns when a `FormMessage` shows under row 1; consider `items-end` or sr-only labels per row.
5. 💭 Status regions that mount with their text may not be announced (4.1.3) — `organization-entitlements-tab.tsx:250`, `:362`. A persistent empty live region is more reliable.
6. 💭 "Nothing to save." is a bare `role=alert` (`entitlement-form-dialog.tsx:347`); fine.

### Checked and OK
- Table (`organization-entitlements-tab.tsx:261-353`): `aria-label`, `scope='col'`, sr-only Actions header, limits as a list, empty row spans 7 columns.
- Enabled switch (`:299-309`): `aria-label="<app> enabled"`, real `role=switch`, permission-disabled state via `describedBy`, non-optimistic (confirm first).
- Active status (`:313-321`) as text; legend explains "Inactive" (`:355`).
- Detail sheet: title/description, Radix tabs, `TabsContent tabIndex=0`, overview `dl`, error `role=alert`, 403 `ForbiddenPanel`.
- Form dialog: Select in `FormControl`; text fallback labelled with reason; first server field error focused; limits error linked via fieldset `aria-describedby`; submit `aria-disabled` + sr-only status; icons `aria-hidden`; names contain visible labels (2.5.3).
- Enabled dialog: AlertDialog naming the target; errors linked to Confirm; focus returns to the switch (`organization-entitlements-tab.tsx:201-206`) or the `tabIndex=-1` heading.
- View action (`data-table-row-actions.tsx:28-47`): real button "View <org>", focus return via ref map (`organizations-dialogs.tsx:46-50`).
- Edit/Grant return focus via `onCloseAutoFocus` + `returnFocus`.

### Follow-ups
- Fix findings 1-2 in this ticket (small; finding 1 repeats PAN-015); apply the same fix to the apps origins list.
- Shared "dynamic row list" focus helper for apps origins and entitlement limits.
- `closeWithRow` 500 ms race (e2e comment) is a real UX race for keyboard users; keep it listed.
