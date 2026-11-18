# PAN-015c: accessibility review

## Attempt 1

## PAN-015c a11y review (WCAG 2.2 AA, R10)

I read the code only (static review). I did not run axe, a screen reader or the e2e suite, and I did not check contrast token values.

**Verdict: 2 blockers, 5 should-fix.** The blockers are 🔴 1 and 🔴 2 below. Fix both before PASS.

### Findings

**🔴 1. The result radios in the pickers choose a row on the first arrow key.**
- WCAG: 3.2.2 On Input (A), and 2.1.1/3.3.4 intent.
- Location: `src/features/users/components/assign-pickers.tsx:137-160`.
- Problem: every radio has `checked={false}` and `onChange={() => onSelect(row)}`. With a native radio group, Arrow Up/Down moves focus and checks the next radio at the same time. That fires `onChange`, so the first arrow press selects a row. The list then disappears, because `selected` replaces it at `:102`.
- Impact: a keyboard or screen-reader user cannot browse the matches before choosing. They end up with the wrong user or organization, and for a grant that is an access-changing mistake. This is also the case the "explicit selection" design (appsec F1) was meant to prevent.
- Fix: do not use radios for "browse, then commit". Pick one of these:
  - Render one `<Button type='button' variant='outline'>Choose</Button>` per row, with `aria-label={\`Choose ${email}\`}`, inside a `<ul>`.
  - Use a real radio group (`checked={selectedId === row.id}`) plus a separate "Use this user" button, so arrows only move the selection and a click commits it.
- The tests for `role-assign-dialog` currently click the radio, so they won't catch this. Add a keyboard test (`ArrowDown` must not select).

**🔴 2. Granting does nothing, with no message, when no user or organization is picked.**
- WCAG: 3.3.1 Error Identification (A), 3.3.3.
- Location: `src/features/users/components/role-assign-dialog.tsx:217-218` (`if (!ready) return`) and `:600` (`aria-disabled={!ready || undefined}`).
- Problem: `ready` is false when `user`, `role` or `orgChosen` is missing. The Zod schema covers only app, role and expiry. On the holders sheet (`target.kind === 'role'`), pressing "Grant role" with no user chosen is silent. The same happens with "One organization" selected and no org chosen. `orgError` is set only after an API error. The button is `aria-disabled`, but nothing links to a reason.
- Fix: do not no-op.
  - In `onSubmit`, set a visible error and move focus to the relevant picker input: "Choose a user." or "Choose an organization."
  - Give each picker an `error` prop that renders `<p id=… role='alert'>` and sets `aria-invalid` and `aria-describedby` on the search input.
  - Alternatively, link a visible "what's missing" text to the button with `aria-describedby`.

**🟡 3. Focus is lost when a picker selection changes or when the dialog moves between form and confirm.**
- WCAG: 2.4.3 Focus Order, 3.2.2.
- Pickers: `assign-pickers.tsx:102-114` and `:143-160`.
  - Choosing a row unmounts the focused radio, so focus drops to the dialog container.
  - "Change" (`:105`) unmounts itself, and the list reappears with no focus move.
  - Fix: after select, focus the "Change" button, or a `tabIndex=-1` "Selected" line. After Change, focus the search input.
- Dialog: `role-assign-dialog.tsx:291` and `:572-605`.
  - Switching between form and confirm swaps the footer buttons and the body. The focused "Review grant" or "Back" button is unmounted.
  - Fix: on phase change, focus the dialog's confirm summary (`tabIndex=-1`) or the primary button. Use a ref plus an effect, or `autoFocus` on the first element of the new phase.
  - Also announce the change. The title stays the same, so give the confirm summary `role='status'` or focus it.

**🟡 4. The live summary is not reliably announced, and it is noisy.**
- WCAG: 4.1.3 Status Messages (AA).
- Location: `role-assign-dialog.tsx:547-554`.
- Problem: the `aria-live='polite'` container is mounted only once user, role and app all exist. Live regions inserted together with their content are often not announced. The container also re-announces the whole sentence on every expiry keystroke.
- Fix: keep a persistent empty `role='status'` container mounted, and update its text only on meaningful changes, not per datetime keystroke. Or drop the live attribute and rely on the confirm phase. The summary is visible text, so this is not a blocker.

**🟡 5. Disabled or unavailable reasons are not linked to the control.**
- WCAG: 1.3.1, 4.1.2, 3.3.2.
- Locations:
  - `assign-pickers.tsx:74` and `:90`: the disabled input and the `aria-disabled` Search button have the reason in `<p>` at `:99-101`, with no `aria-describedby`.
  - `role-assign-dialog.tsx:464-468`, `:542-546` and `:600`: the reasons "Needs admin:*", "You can't change your own admin roles" and the aria-disabled Grant button are not linked.
  - Pager: `user-role-assignments.tsx:248-271` and `role-holders-sheet.tsx:216-238` use `aria-disabled` Previous and Next with no reason. This is acceptable, since the state is obvious from the counter.
- Fix for the first two: give the reason `<p>` an id and add `aria-describedby` to the input and the buttons. The revoke buttons already do this correctly (`user-role-assignments.tsx:211-232`).

**🟡 6. Confusing column headers: "Expires" and "Expiry".**
- WCAG: 2.4.6 Headings and Labels, 3.3.2.
- Locations: `user-role-assignments.tsx:168-169` and `role-holders-sheet.tsx:174-175`.
- Problem: two adjacent headers read almost the same.
- Fix: rename the second to "Status". The old table used "Status" (the diff removes it). The badge text "Not expired" / "Expired" is fine.

**🟡 7. The org error is not linked to the picker, and the picker search input has no error association.**
- WCAG: 3.3.1, 1.3.1.
- Location: `role-assign-dialog.tsx:510-514`.
- Problem: `<p role='alert'>` is announced, but it is not tied to the org search input with `aria-invalid` or `aria-describedby`. It sits in the fieldset after the picker.
- Fix: pass the error to `OrgPicker` and wire the input (it can share the fix for 🔴 2).

**💭 Notes**
- `user-role-assignments.tsx:127` and `role-holders-sheet.tsx:112`: the programmatic focus targets are `tabIndex={-1}` headings. Check that the global CSS shows a focus ring on them. They are focused by script, so 2.4.7 is not strictly required, but a visible mark helps.
- `role-assign-dialog.tsx:559-566`: error and forbidden alerts render below the form, above the footer. Inside a `max-h-[90vh] overflow-y-auto` dialog they can be off-screen. `role='alert'` announces them, but sighted keyboard users may miss them. Consider `scrollIntoView` or moving them up.
- `assign-pickers.tsx:128` and `:132`: the multiple `role='status'` elements are mounted together with their text, so they may not announce. This is minor.
- A native `datetime-local` input has inconsistent screen-reader support across browsers. The time-zone hint (`:535`) is good. Keep the text explanation.
- `RoleAssignmentRevokeDialog` passes `disabled={blocked}` (`:106`). A disabled confirm button is not focusable, but the visible reason (`:127-129`) is shown, so this is fine. The comment says `ConfirmDialog` lacks `aria-disabled`; consider adding it later for consistency.
- The roles row action "Assignments" is an ordinary menu item. `returnFocus` is handled by hand and is consistent with the other dialogs.

### What works well
- The user-assignments table has real `<th scope='col'>`, a table name from `aria-labelledby` or `aria-label`, and an `sr-only` "Actions" header.
- The revoke buttons have unique accessible names ("Revoke <role> in <app>"), and the reasons for disabling them are linked with `aria-describedby`. They use `aria-disabled`, not `disabled`, so they stay focusable.
- The success and revoke notices use a persistent `role='status'`. Focus returns after dialog close to the right element (row, assign button or heading) with an `isConnected` fallback.
- The Scope group is a native `<fieldset>` and `<legend>` with labelled radios.
- Form fields use `FormLabel`, `FormMessage` and `FormDescription`. Expiry errors move focus to the field (`shouldFocus`).
- `<bdi>` is used around user data, the dialog titles and descriptions are present, `aria-hidden` icons are used correctly, and the pending state is announced by `sr-only role='status'`.

### Follow-ups
- Add axe or Playwright keyboard checks (PAN-023) for the picker and the assign dialog. Cases to cover: arrow-key browsing, form to confirm focus, and the missing-user and missing-org errors.
- Consider a shared `Combobox` or `Listbox` pattern for the pickers if more of them are needed.

Files reviewed (absolute):
- /home/user/admin-pan/src/features/users/components/role-assign-dialog.tsx
- /home/user/admin-pan/src/features/users/components/assign-pickers.tsx
- /home/user/admin-pan/src/features/users/components/user-role-assignments.tsx
- /home/user/admin-pan/src/features/users/components/role-assignment-revoke-dialog.tsx
- /home/user/admin-pan/src/features/roles/components/role-holders-sheet.tsx
- /home/user/admin-pan/src/components/confirm-dialog.tsx
