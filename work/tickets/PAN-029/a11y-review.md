# PAN-029: accessibility review

## Attempt 1

A11y review, PAN-029 (commit 837d476). Static code review only. I did not run axe or Playwright, and I did not test with a screen reader.

**Verdict: no 🔴 blockers. 4 🟡 should-fix, 3 💭 notes.**

## Findings

### 🟡 1. Focus is lost when "Reset filters" is activated (WCAG 2.4.3 Focus Order, 3.2.2)
- Files: `src/features/organizations/components/organizations-toolbar.tsx:196-200` and `src/features/apps/components/apps-toolbar.tsx` (the matching `{canReset && <Button>}` block near the end).
- The button is rendered only while `canReset` is true. Activating it clears the filters, so the button unmounts while it has focus. Focus falls to `<body>`, and keyboard and screen-reader users lose their place in the toolbar.
- Fix, either of these:
  - Keep the button mounted and set `disabled` or `aria-disabled` when `!canReset`.
  - In `onReset`, move focus to the search input. For example, expose a ref or `autoFocus` handle from `ListSearchInput`, or focus the `role='search'` container's first input.

### 🟡 2. Filter controls have a border that fails 1.4.11 Non-text Contrast (3:1)
- Files: `src/styles/theme.css:19` (`--input: oklch(0.929 …)`, light) and `:54` (`oklch(1 0 0 / 15%)`, dark).
- `Input` (`src/components/ui/input.tsx:10`) and `SelectTrigger` use `border-input` with a transparent background. The light border on white is about 1.2:1.
- The search box and the selects are the new controls in this diff, so their boundaries are hard to see for low-vision users. The labels above them are visible, so this is not a name problem.
- Fix: use a darker border for form fields. For example, `border-input` → `border-muted-foreground/60`, or a new `--input-border` token with at least 3:1 against `--background`, in both themes. Do not edit the `components/ui` primitives except to fix this, which is allowed under the layout rule. A token change is cleaner.

### 🟡 3. The 422 error is not tied to the search field (WCAG 3.3.1 Error Identification, 4.1.3 Status Messages)
- Files: `organizations-table.tsx:385-388`, `apps-table.tsx` (the matching 422 branch).
- A `<p role='alert'>` is announced, which is good. But the text says "The search or filters weren't accepted" and no field is marked invalid.
- Fix: when the error is a 422, pass `aria-invalid` and `aria-describedby` to the search input, pointing at the message id. Name the likely cause, e.g. "Search term is too long or invalid." This is cheap to do via a prop on `ListSearchInput`.
- The message sits inside a table cell, away from the toolbar. Consider also rendering it under the toolbar.

### 🟡 4. `aria-busy` on the whole table (WCAG 4.1.3, usability)
- Files: `organizations-table.tsx:355`, `apps-table.tsx` (`aria-busy={q.isFetching}`).
- It is now true on every background refetch and every keystroke-driven fetch. Some screen readers (notably JAWS and NVDA in browse mode) skip or defer a busy table, so users cannot read the stale rows while the new ones load.
- Fix: `aria-busy` is only needed for the initial load, which the visible "Loading…" row and the live region already cover. Either drop it, or restrict it to `q.isPlaceholderData || view.status === 'pending'`.
- If you keep it, the live-region message "Loading organizations…" is enough.

### 💭 5. Live region (passes, two small notes)
- Files: `organizations-table.tsx:351-353`, `apps-table.tsx` (same element).
- The `role='status'` `<p>` is mounted unconditionally before the content changes. The input is debounced through `useDebouncedValue`, so it does not announce per keystroke. This is good.
- A forbidden early return unmounts it, which is fine because `ForbiddenPanel` takes over.
- The text is empty for non-422 errors, and the visible `role='alert'` covers that. A 422 also stays silent in the status region but is covered by its own alert, so there is no double announcement.
- The result count is announced on every fetch, including pagination. This is expected.
- Note: "Loading…" followed by the count is two announcements per change. Acceptable.

### 💭 6. `aria-sort` and sort buttons (pass)
- `aria-sort` is set on the `<th>` only for sortable columns, with `none`, `ascending` and `descending`.
- `SortButton` is a real `<button>` with the plain title, and the icon is `aria-hidden`. This is correct.
- Non-sortable columns render plain text and carry no `aria-sort`.
- State is conveyed by the `<th>`, so the icon is not the only indicator. Visible focus comes from the shadcn Button ring.
- Optional: 2.5.8 target size is satisfied because the button is `h-8` (32px) with padding.

### 💭 7. Labels, landmark and the rest (pass)
- `Label htmlFor` with `useId` is correctly associated with `Input type=search` and with the Radix `SelectTrigger` (a button). Every control has a visible label, so the placeholders are not the label (3.3.2).
- `role='search'` with `aria-label` is a proper landmark. Labels are distinct per page ("Filter organizations", "Filter apps").
- The `<Table aria-label>` prop reaches the `<table>` element (verified in `src/components/ui/table.tsx`).
- `--muted-foreground` is about 4.7:1 on white in light mode, so the placeholder and slug text pass 1.4.3. The dark-mode value was not measured.
- The `<time dateTime>` markup is fine.
- Not verified: the pagination component's labels (not in this diff), the Radix Select keyboard behaviour (Radix handles it), and zoom/reflow at 400%. The toolbar uses `flex-wrap` with `w-full sm:w-*`, which should reflow.

## Follow-ups
- Add an `@axe-core/playwright` scan of `/organizations` and `/apps` with a filter applied, an empty result and a 422 state, once PAN-023 lands.
- Consider a shared focus-management helper for destructive or removable controls (Reset, filter chips) so this pattern doesn't recur.
- Review the `--input` border token for all other forms, since this is a template default affecting every `Input`/`Select`/`Textarea` (1.4.11).

Files: `/home/user/admin-pan/src/components/data-table/{sort-button,list-search-input,filter-select}.tsx`, `/home/user/admin-pan/src/features/{organizations,apps}/components/*-toolbar.tsx`, `*-table.tsx`, `/home/user/admin-pan/src/styles/theme.css`.
