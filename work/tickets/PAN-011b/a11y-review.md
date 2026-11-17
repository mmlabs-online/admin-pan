## Attempt 1

Scope: only what this diff adds or changes, checked by reading the code. I did not run axe, Playwright or a screen reader.

Verdict: no 🔴 blockers, 2 🟡 and 2 💭. WCAG conformance is NOT DETERMINED because nothing was tested with assistive technology or axe. Reading the code, I found no A/AA failure.

### 🟡 1. Disabled self "Disable/Enable" item: keyboard and screen-reader users can't reach it (1.3.1 / 4.1.2, 3.3.2 in spirit)
- **Where:** `src/features/users/components/data-table-row-actions.tsx:62` (`disabled={isSelf}`) and the reason span at `:70-74`.
- **Problem:** Radix skips disabled items during roving focus. Screen-reader users never hear the item or its reason; they only hear "(your account)" on the trigger.
- **Fix:** keep the item focusable:
  - `aria-disabled='true'` and `onSelect={(e) => e.preventDefault()}` instead of `disabled`;
  - `aria-describedby` pointing to the reason span, with the id from `useId()`.

  This change is local to one item and doesn't touch `<Can>` or ADR 0004. If you decide not to do it now, record it as a follow-up.

### 🟡 2. Reason text contrast drops to about 2.3:1 (1.4.3)
- **Where:** `data-table-row-actions.tsx:70-74` together with `src/components/ui/dropdown-menu.tsx:74`.
- **Problem:** the item's `data-disabled:opacity-50` dims the muted reason text from about 4.8:1 to about 2.3:1. The reason is information, not part of the inactive control, so don't rely on the inactive-control exemption.
- **Fix:** the change in 1 removes the opacity. Otherwise, take the reason out of the dimmed item.
- **Layout nit:** the reason span sits beside the label in a flex row inside a `w-40` menu. Wrap the label and reason in a `flex flex-col` span, or widen the menu.

### 💭 3. Focus is lost when "Try again" succeeds (2.4.3, mild)
- **Where:** `src/components/permissions/route-permission-guard.tsx:36-68`.
- **Problem:** the panel unmounts and focus falls to `<body>`.
- **Suggestion:** move focus to the page `<h1>` or `<main>` (`tabIndex={-1}`). This can be a follow-up.

### 💭 4. Status message can repeat without being announced
- **Where:** `route-permission-guard.tsx:58-64`.
- **What is fine:** the status region is always mounted and is not nested in another live region.
- **Edge case:** if the refetch finishes before `refreshing` renders, a second "still denied" click leaves the text unchanged, so nothing is announced. This is unlikely.
- **Suggestion:** clear `retried` when a refresh starts.
- **Layout:** the status `<p>` sits outside the `py-16` panel. Check that it is visible.

### Verified OK
- "Try again" is a native Button with a focus ring and is not disabled while refreshing. `cancelRefetch:false` prevents duplicate requests.
- Button names are clear. The section is labelled by its `h2`, and the existing alert on the description announces on mount.
- Status text contrast is about 4.8:1 in light mode and passes in dark mode by estimate.
- The trigger's accessible name is "Open actions for {email} (your account)".

### Follow-ups
- Revisit the aria-disabled pattern for `<Can>` and menu items (ADR 0004).
- Focus management after the 403 panel resolves.
- Playwright + axe runs on `/users` and on a forced-403 route (PAN-023).
