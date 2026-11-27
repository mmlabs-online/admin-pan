# PAN-034 — accessibility review

## Attempt 1

**Findings (PAN-034 slice 1, attempt 1, WCAG 2.2 AA)**

I read the diff and the `form.tsx`, `select-dropdown.tsx` and `alert.tsx` components. I did not run axe or Playwright.

1. 🔴 **Validation error is not announced and focus does not move (3.3.1 Error Identification, 4.1.3 Status Messages).**
   - Location: `src/features/apps/components/app-credential-issue-dialog.tsx` (Scope `FormField`, around lines 255-285), using `src/components/select-dropdown.tsx` and `src/components/ui/form.tsx:134-151`.
   - What happens: pressing "Issue credential" with no scope selected shows "Select a scope." in `FormMessage`. That `<p>` has no `role` or `aria-live`.
   - Focus: the submit button keeps focus. `field.ref` is never passed to `SelectDropdown`, so react-hook-form's focus-on-error cannot reach the trigger.
   - Impact: a screen-reader user hears nothing after submitting and has no cue that anything failed. `aria-invalid` and `aria-describedby` on the trigger are only read once the user happens to tab back to it.
   - Fix: on invalid submit, move focus to the trigger, for example `form.handleSubmit(onValid, () => scopeTriggerRef.current?.focus())`.
     - Give `SelectDropdown` a `ref` or `triggerRef` prop forwarded to `SelectTrigger`, or call `form.setFocus('scope')` after wiring `field.ref`.
     - Alternatively, add `role='alert'` to this message. Focus on the field is the better fix.
   - Passing: the label is linked (`htmlFor=formItemId`) and `FormControl` links the description and message by `aria-describedby` and sets `aria-invalid`.

2. 🟡 **Required is not indicated (3.3.2 Labels or Instructions).**
   - Location: `app-credential-issue-dialog.tsx`, `<FormLabel>Scope</FormLabel>`.
   - Problem: the field is required, but the trigger has no `aria-required` and the label has no "(required)". The form uses `noValidate`, so the browser gives no cue either.
   - Fix: change the label to "Scope (required)" or add a visible "required" marker. Also pass `aria-required='true'` through `SelectDropdown` to the trigger. `FormControl` is a Slot, so the prop on `SelectTrigger` works.

3. 🟡 **Runtime warning is announced assertively and repeats the hint (4.1.3, usability).**
   - Location: `app-credential-issue-dialog.tsx`, the `<Alert>` after the `<Form>`. The shared `Alert` is always `role='alert'`.
   - Behaviour: choosing a runtime scope mounts the alert, so it is announced immediately. That is good, because the warning is not lost.
     - The first sentence is a verbatim duplicate of `credentialScopeHints[chosen]` in the `FormDescription`.
     - `role='alert'` interrupts the Select's own value announcement.
     - The alert is not associated with the field.
   - Fix: render the extra warning as `role='status'`, which is polite and fits a status message. Alternatively, fold the org-wide-read sentence into the hint and drop the duplicate. Keep the hint in `aria-describedby`.
   - Note: the hint text changes with the selection but is not itself live. For manifest and releases nothing extra is announced, which is acceptable since the control is described on focus.

4. 💭 **Can disabled reason is fine (1.3.1, 4.1.2).** `src/components/permissions/can.tsx` renders the "Requires admin:*" span with `id` and passes `describedBy` to the disabled button. This matches the existing permission branch.
   - The reason is visible text, not tooltip-only, and `text-muted-foreground` is the existing token.
   - Verify that token reaches 4.5:1 in light and dark. This is not new in this diff.

5. 💭 **Credentials table is fine (1.3.1).**
   - The "Scope" column has `<TableHead scope='col'>`, the table has `aria-label`, and `colSpan` was updated to 6.
   - The scope value is real text in `<code>`, not colour- or icon-only.
   - Optional: a long scope such as `org-members:read` may wrap or overflow at 400% zoom. The table sits in an overflow container, so check it manually.

6. 💭 **Submit button uses `aria-disabled` plus `preventDefault` while pending.** This is correct and keeps focus. "Issuing…" changes the button name, and no live announcement is needed because the reveal step shows `role='status'`.

7. 💭 **Reveal step.** The description now includes `({issued.scope})`, and focus still goes to the copy button. No regression.

**Follow-ups:**
- Give `SelectDropdown` a ref and `aria-required` pass-through, so every form that uses it gets focus-on-error and required semantics.
- Add a test: submit with no scope, then assert that focus is on the Scope trigger and that it has `aria-invalid` and a description containing "Select a scope."
- Run axe via Playwright once PAN-023 lands.

**Summary:** 1 blocker (the empty-scope error is silent and focus stays on the submit button) and 2 should-fix items (required not conveyed, assertive duplicate warning); the Scope column and the Can "Requires admin:*" reason are accessible. **Verdict: REWORK for finding 1.**
