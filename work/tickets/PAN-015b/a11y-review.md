# PAN-015b: accessibility review

## Attempt 1

**Method.** The auditor read the code in `git diff origin/main...HEAD` (3433e3b). They did not run axe, a screen reader, a browser or the tests, so everything below comes from reading the source. `/home/user/admin-pan/src/features/roles/` is abbreviated `roles/` in the file references.

**Verdict.** No 🔴 blockers: no A or AA failure was found that stops a keyboard or screen-reader user from completing a flow. There are 5 🟡 should-fix items (one of them, the confirm-step focus loss, is arguably a 2.4.3 failure) and 6 💭 notes.

### 🟡 Should-fix

1. **Focus is lost and nothing is announced when the permissions dialog switches between its edit and confirm steps.** (WCAG 2.4.3 Focus Order, 4.1.3 Status Messages)
   - `roles/components/role-permissions-dialog.tsx:189-212` and `:219-257`.
   - Clicking Save with removals swaps the picker for the confirm list, and swaps Save for Back / "Remove and save". The focused Save button unmounts, so focus falls back to the dialog container or body.
   - The confirm text has no `role` and the title doesn't change, so a screen-reader user hears nothing about the new step.
   - The same thing happens on Back, which unmounts the confirm step.
   - Fix: when `phase` changes, focus an element with `tabIndex={-1}` that holds the confirm heading or message. Alternatively, put `ref` and `autoFocus` on "Remove and save" or Back. On Back, focus the first checkbox or the Save button.
   - Also give the confirm block a heading, or `role='alertdialog'`-style text, so the step change is conveyed.

2. **The disabled-control reasons are not linked to their controls.** (WCAG 1.3.1 Info and Relationships, 3.3.2 Labels or Instructions)
   - `roles/components/role-permissions-dialog.tsx:243-255`: Save has `aria-disabled` while the reason ("Loading…", or the over-limit message) is a loose `<span>`. Add `aria-describedby` pointing at the span, with an id on it.
   - `roles/components/role-create-dialog.tsx:330-337` and `:320-327`: "Create role" and "Retry saving permissions" are `aria-disabled` when `overLimit`. The only explanation is the `role='alert'` inside the picker, and the buttons are not linked to it. Link them with `aria-describedby`.
   - Silent no-ops are the main risk here: `save()` returns early and `onSubmit` returns on `overLimit`.

3. **Loading and read-only states in the permissions dialog are not announced or explained.** (WCAG 4.1.3, 3.3.2)
   - `roles/components/role-permissions-dialog.tsx:214-216` has a live region only for "Saving…". The "Loading…" state (role detail or permission list fetching) is only visible text inside the footer span.
   - When `readOnly` (the `roles.setPermissions` action is denied), the picker is disabled and the footer is hidden at `:217`. Nothing says why the dialog can't be edited or what permission is missing.
   - Fix: add a visible sentence such as "You can view but not change these permissions (requires admin:roles:manage)", and put the loading text in the existing `role=status` region.

4. **The "reason" text for disabled menu items is hard to reach and hard to read.** (WCAG 1.4.3 Contrast, 2.1.1 Keyboard)
   - `roles/components/roles-row-actions.tsx:270-300`, with `Reason` at `:216-220`.
   - Radix disabled items are skipped by arrow-key focus. The explanation ("System roles can't be deleted", "Default role: choose another default first", "Org owner role") sits inside the disabled item. It is therefore not reachable by keyboard focus, and it gets `data-disabled:opacity-50` on top of `text-xs text-muted-foreground`, which comes to roughly 2.5:1.
   - Strictly, inactive components are exempt from 1.4.3, but this text is the only place the reason is given.
   - Fix: make these items non-disabled and use `aria-disabled` with `onSelect={(e) => e.preventDefault()}`, so they stay focusable and the reason is read. Or keep `disabled` and show the reason somewhere persistent, such as the Actions button's `aria-describedby` or the row.
   - Apply the same fix to the "Set as default" item (`noDefault`).

5. **The Loading state in `index.tsx` and in the create dialog is inserted already containing its text, so it may not be announced.** (WCAG 4.1.3)
   - `roles/index.tsx:84`: `<p role='status'>Loading apps…</p>`.
   - `roles/components/role-create-dialog.tsx:289`: `<p role='status'>Loading permissions…</p>`.
   - The live region must exist before its content changes. `roles-table.tsx:256` does this correctly, with an always-mounted sr-only status.
   - Fix: keep the status element mounted and change only its text, as `roles-table.tsx` does.

### 💭 Notes (no action required)

- `roles/index.tsx:160-171`: "New role" uses native `disabled` when the permission is denied. That removes it from the tab order, but the "Requires …" text from `Can` is plain visible text, so the information is still reachable. No change needed. Native `disabled` is acceptable here, and it differs from the `aria-disabled` approach on the dialog buttons.
- `roles/components/role-permission-picker.tsx:92-110`: each `<section aria-label>` becomes a region landmark inside the dialog, which is noisy. The heading jumps from the dialog's h2 to an h4. Use `<div role='group' aria-labelledby>` or plain headings, at h3.
- `roles/components/role-permission-picker.tsx:86-89`: the helper paragraph isn't linked to the fieldset. Add `aria-describedby`.
- `roles/components/roles-columns.tsx:373-398`: the first column is a `<td>`, not a row header, so use `<th scope='row'>` for Key. The "—" in the Privileged column is read as "em dash" or skipped; use `<span className='sr-only'>No</span>`. "1 permissions" is a pluralisation slip.
- `roles/components/role-create-dialog.tsx:203-223`: the partial-create block is both `role='alert'` and programmatically focused, so it will probably be announced twice. That is acceptable, since the focus is useful on its own.
- Focus-return keys on `[aria-label="Actions for ${key}"]` (`roles/components/roles-dialogs.tsx:276-284`). Keep that aria-label stable. The key is not escaped in the selector, but role keys are constrained so this is low risk.

### What works well

- **Dialog focus return.** Rename, permissions and create use `onCloseAutoFocus`, and delete and set-default use an effect with `requestAnimationFrame`. All of them go back to the row's Actions button. After a delete, focus goes to New role, because the row is gone.
- **Form errors.** The rename and create forms use the shadcn `FormLabel` / `FormControl` / `FormMessage` linkage. `setError(..., { shouldFocus })` puts focus on the first invalid field. Server errors go through `role='alert'`.
- **`aria-disabled` on pending buttons.** It is paired with an `onClick` or `inFlight` guard, the button text changes to "Saving…", and each dialog has an sr-only `role=status` region. Escape and outside-click are blocked while pending.
- **Table.** It has an `aria-label`, a real header row with an sr-only "Actions" column, `aria-busy`, and an always-mounted live status ("N roles, page X of Y").
- **Pickers.** The app picker's `Label htmlFor` points at the Select trigger. Each permission checkbox has its own label with `aria-describedby` for the note. The locked and unknown-key states are described in text, not by colour alone.
- **Contrast.** Delete uses `text-red-700` / `dark:text-red-400`. Badges carry text.
- **"Manage roles" link** (`src/features/apps/components/app-detail-sheet.tsx`): a real `Link`, underlined, with a clear name.

### Not tested (needs a browser run)

- Contrast measured on the actual tokens: `text-destructive`, and muted text at `text-xs`.
- Zoom at 200% and 400% for the `sm:max-w-xl` permissions dialog (it scrolls vertically).
- Screen-reader output.
- An `@axe-core/playwright` pass on `/roles` with each dialog open. Items 1 and 4 are worth confirming this way.

### Follow-ups

- Add an e2e or axe check that covers: focus after the permissions Save-to-confirm step, the Actions menu with a disabled item, and the create dialog in its partial state.
- Consider a shared `StatusRegion` component (always mounted, text changes only) to prevent item 5 from recurring.
