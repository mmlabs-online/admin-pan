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

## Attempt 2

**PAN-034 attempt 2 a11y review.** I read the diff and the code; I did not run the tests, axe or a screen reader. 🔴1, 🟡2 and 🟡3 are fixed. There are no blockers and no regressions.

**Fixed**
- **🔴1, focus on invalid submit (3.3.1, 4.1.3): fixed.**
  - `app-credential-issue-dialog.tsx:251-257` now passes `() => form.setFocus('scope')` as the invalid handler.
  - `field.ref` goes through `triggerRef` (`app-credential-issue-dialog.tsx:274`, `select-dropdown.tsx:22,35,45`). `SelectTrigger` is a plain function component that spreads `...props` (`ui/select.tsx:24-40`), so under React 19 the `ref` reaches the Radix trigger button. `FormControl` is a Slot, which composes refs.
  - Focus lands on the trigger, which already has `aria-invalid` and an `aria-describedby` pointing at "Select a scope.". A screen reader announces all of this on focus.
  - The test at `app-credential-issue-dialog.test.tsx:326-328` asserts the focus, `aria-required` and `aria-invalid`.
- **🟡2, required indicated (3.3.2): fixed.**
  - `aria-required` is set on the trigger via `required || undefined` (`select-dropdown.tsx:47`).
  - A visual "*" in `text-destructive` is added to the label (`app-credential-issue-dialog.tsx:266-269`).
  - The "*" is `aria-hidden`, so the accessible name stays "Scope". `aria-required` carries the required state for screen readers, so the state isn't announced twice.
  - The "*" is ~4.8:1 on white by my estimate, and it is redundant with `aria-required` anyway.
- **🟡3, runtime warning (4.1.3): fixed.**
  - The `Alert` (`role='alert'`) is replaced by a polite `<p role='status' aria-live='polite'>` (`app-credential-issue-dialog.tsx:296`).
  - The first sentence, "Backend deploy environment only…", no longer duplicates the `FormDescription` hint. It comes only from `credentialScopeHints` (`data.ts:102`), and the tests at lines 81 and 379 still find it there.

**New findings**
- 🟡 (minor, should-fix) **Conditionally mounted live region (4.1.3), `app-credential-issue-dialog.tsx:295-300`.**
  - The `role='status'` paragraph mounts only after a runtime scope is chosen, together with its text. NVDA and JAWS often don't announce a live region that is inserted already filled.
  - The announcement is therefore unreliable on the first runtime selection.
  - When the selection switches between two runtime scopes, the text changes in place and is announced reliably. When it switches to manifest or releases, the paragraph unmounts and nothing is said, which is acceptable.
  - Fix: keep the live region always rendered and change only its content:
    `<p role='status' className='text-sm'>{chosen && isRuntimeScope(chosen) ? text : null}</p>`
    An empty `<p>` has no visual impact. Drop the redundant `aria-live='polite'`, since `role='status'` implies it.
  - A fallback is to leave it as is, because the same information is reachable by Tab through the trigger's `aria-describedby` hint. The warning's extra sentence, "reads data of every org", is not in that hint.
- 💭 `form.setFocus('scope')` relies on `field.ref` being the trigger button. That is correct now. Keep the test at line 326 so the wiring doesn't regress.
- 💭 Follow-up: other `SelectDropdown` users can now pass `required` and `triggerRef`. Applying them to the other forms is optional and is not part of this ticket.

**Summary:** 🔴1, 🟡2 and 🟡3 are fixed with no regressions (the "*" is aria-hidden and the accessible name is "Scope"), and the only new finding is a minor 🟡: the `role='status'` region should be always mounted so the first announcement is reliable. Verdict: PASS, with that 🟡 recommended.
