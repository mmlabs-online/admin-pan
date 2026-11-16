## Attempt 1

PAN-013 a11y review, attempt 1, against WCAG 2.2 AA. I read the code in the diff plus the shared ConfirmDialog, ForbiddenPanel, toolbar and pagination. I did not run axe, Playwright or a screen reader.

**Verdict:** no 🔴 blockers, 4 🟡 should-fix items, 4 💭 notes.

### 🟡 1. Result updates are not announced (4.1.3)
- **Where:** `src/features/users/components/users-table.tsx:118,146-148,181`
- **Problem:**
  - The "Loading users…" `role='status'` span is inserted already populated, so it is often not announced.
  - After a filter change or a page change, nothing tells the user the results changed.
  - `aria-busy={q.isFetching}` also stays on during background refetches.
- **Fix:**
  - Add one persistent sr-only `role='status' aria-live='polite'` element outside the table. It says "Loading users…" while loading, then "{total} users, page n of m", or "No users match these filters."
  - Remove `role='status'` from the visible message row.
  - Set `aria-busy` only while the view is pending.

### 🟡 2. Status dialog pending state: focus loss and no announcement (4.1.3, 2.4.3)
- **Where:** `src/components/confirm-dialog.tsx:56,64` and `src/features/users/components/users-status-dialog.tsx:44-57`
- **Problem:**
  - Both buttons get native `disabled` while the request is pending, so focus drops to `<body>`.
  - Nothing is announced while the request runs.
- **Fix:**
  - Use `aria-disabled` and return early from the click handler instead of `disabled`.
  - Add an sr-only status line ("Disabling {email}…") and change the button text to "Disabling…".
  - On error, move focus to the alert or back to Confirm.

### 🟡 3. Inline error alerts are not linked to the dialog (3.3.1, 1.3.1)
- **Where:** `users-status-dialog.tsx:74-81`
- **Problem:** the alert is announced once when it appears. It is not part of the dialog's description, so it is not re-read later.
- **Fix:** give the error element an `id` and add it to the dialog's `aria-describedby`. This needs a `ConfirmDialog` prop. At minimum, focus the alert on failure.

### 🟡 4. Empty header cell for the actions column (1.3.1, 4.1.2)
- **Where:** `src/features/users/components/users-columns.tsx:76-79`, rendered at `users-table.tsx:124-139`
- **Fix:** `header: () => <span className='sr-only'>Actions</span>`

### 💭 Notes
- **Focus after closing the dialog (`users-status-dialog.tsx:34-39`):** if the row disappears after the status filter refetches, focus drops to `<body>`. Move focus to the table region or the toolbar instead.
- **Detail sheet:**
  - The silent refresh hides loading (`:54-60,86`).
  - The live-region caveat from item 1 applies (`:142-145`).
  - "Showing x of y" has no way to page to the rest; follow-up.
  - Table semantics are good (`aria-labelledby`, `th scope=col`, text badges).
- **Contrast:** check `text-destructive` on `bg-destructive/10` for the disabled badge (`data.ts:11-13`) against the real tokens, or with axe in PAN-023.
- **Reflow:** the sticky email column combined with `overflow-hidden` (`users-table.tsx:117`) may clip at 320 px. Prefer `overflow-x-auto`.

### What works
- The filter input has an `aria-label`.
- The pagination has sr-only labels.
- Each row's action trigger has a unique name.
- 403 and error states use `role='alert'` and offer a retry.
- Escape is blocked while the request is pending.
- Status badges carry text.
- Dates use `<time dateTime>`.

### Follow-ups
- Run axe in Playwright on `/users`, the dialog and the sheet, plus a 320 px reflow check (PAN-023).
- Make the shared ConfirmDialog safe to use while pending.
- Make the table's result announcement reusable.
