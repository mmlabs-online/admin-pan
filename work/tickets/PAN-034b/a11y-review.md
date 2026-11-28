# PAN-034b — accessibility review

## Attempt 1

**A11y review, PAN-034b attempt 1 (WCAG 2.2 AA). Code reading only; I did not run axe or Playwright.** Files: `src/features/apps/components/app-form-dialog.tsx` and `app-detail-sheet.tsx`. I found no 🔴 blockers.

**Findings**

🟡 1. Focus is lost when a save from the review step fails (2.4.3 Focus Order).
- `app-form-dialog.tsx:247` calls `flushSync(() => setPhase('form'))`. This unmounts the focused "Confirm and save" button (`:600`) and the review heading. The Save button is a different element (`key='save'`, `:610`).
- Focus is only restored when `mapped.fields` has a first entry (`:249-257`). A non-field failure (403, 5xx, network) sets `alert` and leaves focus on `<body>` or the dialog.
- The `role='alert'` message (`:576`) and `ForbiddenPanel` (`:573`) are still announced. Keyboard users then have to Tab in from the top of the dialog.
- Fix: after `setPhase('form')`, if there is no field to focus, move focus to the Save button (give it a ref). Alternatively, keep focus on the Back/Confirm area by not remounting the footer buttons.

🟡 2. Role loading and error states are not announced (4.1.3 Status Messages).
- `roleHint` (`:79-94`) swaps the `FormDescription` text between "Loading roles…", the load-error text and the normal hint. `FormDescription` is a plain `<p>` (`form.tsx:122`) with no live region.
- All three selects go disabled with the status only in the description. The Retry button (`:455-463`) appears silently.
- A screen reader user hears nothing when loading finishes or fails. They only learn the state if they focus the select, and a disabled Radix trigger is not focusable. They are left with an empty form.
- Fix: add one visible `<p role='status'>` (loading) and `<p role='alert'>` (error) near the Retry button, or put the error in a single `role='alert'` and drop it from the three per-field hints. Give Retry a descriptive name, for example "Retry loading roles".

🟡 3. The review step does not expose its change list when it opens (1.3.1 Info and Relationships, 4.1.3).
- Focus moves to `<h3 tabIndex=-1>` (`:208`, `:544`), which is correct. The section is `aria-labelledby` but has no live region or description.
- The dialog title still reads "Edit app X" and the description still reads "Update the app settings" (`:323-330`).
- A screen reader user hears only "Review role changes" and must arrow down to find the from→to list. This is acceptable but weak for a confirmation required by R9.
- Fix: update the `DialogTitle` and `DialogDescription` text for the review phase, for example "Confirm role changes for app X". Alternatively, put `aria-describedby` on the Confirm button pointing at the change list.

🟡 4. The `→` between the old and new role in `<code>` (`:558`) is read inconsistently ("right arrow", or ignored).
- Fix: add visually hidden text, for example `<span className='sr-only'>changes to</span>`, or write "from X to Y".

🟡 5. When Super-admin is disabled, the reason is lost if the roles query is pending or errored (1.3.3 Sensory Characteristics, 3.3.2 Labels or Instructions). `roleHint` (`:84-86`) returns the loading or error text before checking `denied` (`:87`). A user without `admin:*` therefore doesn't see "Requires admin:*" while roles are loading or have failed. The reason reappears once roles load. This is minor, but reorder it so the reason always shows when `denied` is true.

🟡 6. Super-admin is disabled and so unreachable by keyboard (`:450`). The description is still linked through `FormControl`'s `aria-describedby`, and it is visible text, so it is readable by screen reader browse mode. This passes. Optional: use `aria-disabled` instead of `disabled` so the reason is announced on focus.

💭 7. The "Back" button (`:590-597`) is correct. It restores the form and focuses the first changed role field through `field.ref` on the trigger (`:122`). If that field is no longer editable, `setFocus` does nothing and focus is lost. This can't happen with the current `editable` logic.

💭 8. The Confirm and Save buttons use `aria-disabled` and are not truly disabled while pending. `inFlight` guards the double submit, and focus is kept. The accessible name changes to "Saving…" and there is also a `role='status'` region (`:580`). Both are fine. Note that `opacity-50` on the pending button can drop its text below 4.5:1, but pending states are exempt from 1.4.3.

💭 9. `org_mode` → required reveals two extra selects (`:435`) without an announcement. This is not required by 4.1.3. Optionally give the `org_mode` `FormDescription` a hint such as "Shows owner and super-admin roles".

💭 10. The detail sheet role rows (`app-detail-sheet.tsx:125-193`) use real `<dl>/<dt>/<dd>`. "Loading…" and the `Unknown role (id)` / "role names couldn't be loaded" texts are visible, never blank, and not colour-only, which passes 1.3.1 and 1.4.1. "Loading…" is not announced on completion, but the sheet content is non-modal in the browse flow, so this is acceptable. If you want parity with finding 2, wrap the value in `aria-live='polite'`.

💭 11. The `join_policy` and `org_mode` selects get a dangling `aria-describedby` pointing at a missing description id (`:384-423`, because `FormControl` always adds it). This is harmless and pre-existing.

**Verified OK**
- Labels: `FormLabel` + `FormControl` give the id, `aria-describedby` and `aria-invalid` on the `SelectTrigger`.
- Linked errors: `FormMessage` is included in `aria-describedby` when there is an error.
- Invalid-submit focus: `shouldFocus: true` for the super-admin-alone error (`:285-289`) and for the mapped API errors.
- Hidden form: `hidden` attribute on the form during review (`:339`), so it leaves the tab order and the accessibility tree.
- Dialog: focus return is handled via `onCloseAutoFocus`.
- Remove-origin buttons: they have `aria-label`s.

**Follow-ups:** none for org-admin-api. Run `@axe-core/playwright` on the apps route once PAN-023 lands. This change adds no automated a11y test of its own.

**Summary:** No WCAG A/AA blockers. There are four should-fix items: lost focus after a failed confirm (#1), unannounced role loading and error states (#2), a weak review-step announcement (#3), and the Super-admin reason hidden during loading or error (#5). Verdict: PASS with should-fix items.
