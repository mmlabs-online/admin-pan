## Attempt 1

PAN-016 accessibility review against WCAG 2.2 AA, attempt 1. This was a read-only review of the code diff. I did not run axe, Playwright or a screen reader, so this is static analysis and not a conformance claim.

**Result: no 🔴 blockers, 4 🟡 should-fix, 3 💭 notes.**

### 🟡 1. Date picker button loses its label once a date is picked (4.1.2, 2.5.3, 3.3.2)
- **Where:** `src/features/audit-log/components/audit-log-filters.tsx:294-308` and the shared `src/components/date-picker.tsx:25-36`.
- **Problem:** once a value is set, the button's name is just the date (e.g. "Nov 3, 2026"), so users no longer hear whether it is "From" or "To".
- **Fix:** add an optional `aria-label` prop to `DatePicker` and pass `` `${label} date: ${value or 'not set'}` ``, or use `aria-labelledby` with both the label and the button. Also add `aria-hidden` to the `CalendarIcon` (`date-picker.tsx:35`).

### 🟡 2. Focus is lost when Reset or Clear removes the focused control (2.4.3)
- **Where:** `audit-log-filters.tsx:168-177` (Reset) and `:309-319` (Clear date).
- **Problem:** each button unmounts itself when used, so focus falls back to `<body>`.
- **Fix:** after Reset, focus the first filter. After Clear, focus the date picker trigger.

### 🟡 3. Scrollable regions can't be reached by keyboard (2.1.1)
- **Where:** `audit-log-detail-sheet.tsx:137`, `:168` (table wrappers) and `:196` (`<pre>` with the raw JSON).
- **Problem:** these regions overflow sideways, but nothing inside them can take focus, so keyboard users can't scroll them.
- **Fix:** add `tabIndex={0} role='region' aria-label=…` to each, with a visible focus ring.

### 🟡 4. Danger badge contrast is probably below 4.5:1 for 12px text (1.4.3)
- **Where:** `src/features/audit-log/data/data.ts:17-18` (`text-destructive` on `bg-destructive/10`).
- **Problem:** I estimate about 4.2:1; I did not measure it. Dark mode is unverified.
- **Fix:** measure it. If it fails, use `text-red-800 dark:text-red-100` on the tint, the same approach as the other tones.

### 💭 Notes
- **5. Validation error and timezone hint** (`audit-log-filters.tsx:272-276`, `:154-157`):
  - The text-filter error has no `role='alert'`.
  - The expected format (UUID or app key) is only shown once there is an error. Add a hint up front.
  - The timezone hint is not linked to the pickers through `aria-describedby`.
- **6. Live region announces too early** (`audit-log-table.tsx:126-134`): with `keepPreviousData`, the new page number is announced before the data arrives. Show "Loading…" while `isPlaceholderData` or `isFetching` is true.
- **7. "View" button names can repeat** (`audit-log-columns.tsx:114`): two rows with the same action in the same second get the same name. Append the target id.

### Passes
- One persistent `role=status`, not nested in another live region. `aria-busy` is set only while pending.
- The table has a label, `th` headers and an sr-only "Details" header.
- Each row has a real `<button>`.
- Filter labels are linked with `htmlFor`, the bar has `role=search`, and targets are at least 24px.
- The date range error uses `role=alert`.
- The error, empty and 403 states have actions in text.
- The detail sheet: focus trap, Esc to close and focus return; the tables have a caption and scope; native `details` element; text-only rendering.
- Copying the request ID gives a toast.
- The Users "Audit history" section is labelled and its links have distinct names, gated by `<Can>`.

### Follow-ups
- Check app-wide focus and announcement on route change.
- Fix the shared `DatePicker` once.
- Run axe on `/audit-log` after PAN-023.
- Not yet tested: screen reader, zoom, forced colors, reduced motion.
