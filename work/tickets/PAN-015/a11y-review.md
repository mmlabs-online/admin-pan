# PAN-015 a11y review

## Attempt 1

WCAG 2.2 AA, R10. Static review of the diff only; `pnpm e2e`, axe and screen readers were not run by the auditor.

**Verdict: no 🔴 blockers.** Two 🟡 should-fix items, several 💭 notes.

### Findings
1. 🟡 **Removing an origin drops keyboard focus (2.4.3)** — `src/features/apps/components/app-form-dialog.tsx:320` (`onClick={() => origins.remove(index)}`). The focused "Remove origin N" button unmounts with its row; focus falls to `<body>` inside the dialog. Fix: after `remove(index)`, focus the next remaining origin input, else the previous, else the "Add origin" button (run `setFocus` after the removal renders). Add an interaction test.
2. 🟡 **"Add origin" does not move focus to the new input (2.4.3)** — `app-form-dialog.tsx:345` (`origins.append({ value: '' })`). Fix: `append(..., { shouldFocus: true })` or explicit `setFocus`; optionally a sr-only live message "Origin N added" / "Origin removed".
3. 💭 Required fields not indicated (3.3.2, borderline) — `app-form-dialog.tsx:202` (Key), `:227` (Name), `app-permission-form-dialog.tsx:143` (Resource), `:160` (Action): no `aria-required` or visible marker. Project-wide convention follow-up.
4. 💭 Origins help text not linked to the fieldset (1.3.1, 3.3.2) — `app-form-dialog.tsx:281-286`: `aria-describedby` points only at the error id. Add the help `<p>` id.
5. 💭 Apps table `<th>` has no explicit `scope` — `apps-table.tsx:98` (permissions table has it, `app-permissions-tab.tsx:116`). Consider Key as `<th scope='row'>`.
6. 💭 E2E a11y coverage thin — `e2e/pages.e2e.ts:178-210` scans only the detail sheet (Permissions tab) and the disable dialog. Add axe on Register/Edit form, Add-permission dialog, admin-only confirm; assert focus return after cancel.
7. 💭 Loading status announced twice — `apps-table.tsx:89-91` and `:112`. Harmless.

### Working well
- Every field linked via `FormControl` (`id`, `aria-describedby`, `aria-invalid`); Select trigger inside `FormControl`; origin inputs labelled "Origin N"; remove buttons named; icons `aria-hidden`.
- API errors `role='alert'`; 403 via `ForbiddenPanel`; first invalid field focused.
- Pending: `role='status'` announcements, submit `aria-disabled`, Escape blocked while pending.
- Focus return: edit/add-permission dialogs use `onCloseAutoFocus` + `returnFocus`; status and admin-toggle AlertDialogs restore focus in an effect (`apps-dialogs.tsx:221-231`, `app-permissions-tab.tsx:38-47`); View sheet returns via Radix.
- Tables: `aria-label`, sr-only "Actions" header; label-in-name holds; targets ≥32px.
- Admin-only switches: `aria-label='Admin only: <key>'`, locked ones described "Always admin only"; changes confirmed, never optimistic.
- Contrast: status badges and the red-700 Disable item look ≥4.5:1 by token (not measured); status conveyed by text.
- Overview `<dl>`, `<time>` dates; Radix tabs.

### Follow-ups
- Origin add/remove focus (findings 1-2): in ticket scope.
- E2E axe on the form dialogs (finding 6).
- Project-wide required-field convention (finding 3).
- Manual passes: keyboard-only through register/edit/add-permission; NVDA/VoiceOver on tabs and switch confirm; 200%/400% zoom on the form dialog (`max-h-[60vh]` inner scroll).
