# Accessibility review — PAN-012

## Attempt 1

A11y review PAN-012. Static review of the components only. I did not run axe or any tests. No 🔴 blockers found on the changed screens. Four 🟡 should-fix items and some notes.

### Findings

🟡 1. Focus is lost when the forgot-password form is replaced by the "sent" message.
- WCAG: 2.4.3 Focus Order (A) and 4.1.3 Status Messages (AA).
- Location: `src/features/auth/forgot-password/components/forgot-password-form.tsx:86-93`.
- Problem: after success the form, including the focused Continue button, is unmounted and focus falls to `<body>`. Keyboard and screen-reader users restart from the top of the page. The `<p role='status'>` is inserted already populated, so many screen readers do not announce it.
- Fix: reuse the `Panel` pattern from `reset-password-form.tsx:159-176`. Render a heading with `tabIndex={-1}` that takes focus on mount, for example "Check your email" followed by the paragraph. Alternatively, keep the form mounted and render a persistent `<div role='status'>` container into which the text is injected. Extract `Panel` to a shared component rather than duplicating it.

🟡 2. The Continue button is disabled until a Turnstile token exists, with no explanation.
- WCAG: 3.3.2 Labels or Instructions (A), 4.1.3 Status Messages (AA), and 3.3.1 Error Identification (A) when the widget fails.
- Location: `forgot-password-form.tsx:123`, `src/components/turnstile.tsx:380-387`.
- Problem: the `error-callback` and `expired-callback` silently set the token to null. The user then has a permanently disabled button and no message. Disabled buttons are also skipped by Tab, so keyboard users cannot discover the problem.
- Fix:
  - In `Turnstile`, add a `useState` for `widgetError`, set it in `error-callback` and clear it in `callback`.
  - Render `<p role='alert'>Verification failed. Reload the check below or try again.</p>` plus the same Retry button. The retry should bump `attempt` or call `reset`.
  - Add `<p id='…' className='text-sm text-muted-foreground'>Complete the verification to continue.</p>`, and link it to the button with `aria-describedby` while the button is disabled.
  - Better still, do not use `disabled`. Use `aria-disabled` and, on submit without a token, show an error and focus the widget.

🟡 3. Server-side field errors from `setError` are not announced or focused.
- WCAG: 3.3.1 Error Identification (A) and 4.1.3 Status Messages (AA).
- Location: `forgot-password-form.tsx:75` and `reset-password-form.tsx:224`; the underlying component is `src/components/ui/form.tsx:135-152`.
- Problem: `form.setError` called from the mutation `onError` does not focus the field (RHF only auto-focuses with `shouldFocus: true`). `FormMessage` has no live-region role. The result is that focus stays on the submit button, and the weak-password message is not announced. Client-side zod errors are fine, because RHF focuses the first invalid field and `aria-describedby` / `aria-invalid` link them.
- Fix: pass `{ shouldFocus: true }` to every `form.setError(...)` call in the `onError` handlers. For the weak-password case, call `form.setFocus('new_password')` instead. `FormMessage` is a generated shadcn file and should only be edited to fix a bug. If you do edit it, add `role='alert'` for `error` bodies only, which is a justified bug fix.

🟡 4. The email input is missing an autocomplete token.
- WCAG: 1.3.5 Identify Input Purpose (AA).
- Location: `forgot-password-form.tsx:109`.
- Fix: `<Input type='email' autoComplete='email' inputMode='email' …/>`. Keep zod's validation. Setting `noValidate` on the form is unnecessary because `handleSubmit` already runs.

💭 5. The shared `Panel` in `reset-password-form.tsx:169` uses `role='status'` on a container that also takes focus on its heading. Under focus the heading is read and the live region may read the content again (double announcement). Preferred: drop `role='status'` and keep the focused `h2`. Fine as is.

💭 6. The Turnstile container is unlabelled (`turnstile.tsx:425`). Optionally wrap it in `<div role='group' aria-label='Human verification'>`. After a successful retry focus is lost because the Retry button unmounts; move focus to the container (`tabIndex={-1}`) when the widget mounts after a retry.

💭 7. The 429 message ("Try again in X") is rendered once through `role='alert'` (`forgot-password-form.tsx:116-120`, `reset-password-form.tsx:294-298`). Correct (static value, not a live countdown). If announcements are missed, render an always-present empty `role='alert'` wrapper and inject text.

💭 8. Heading structure is clean (`h1` "mmlabs Admin", `h2` Panel title). Card titles are `<div>`s, and the document `<title>` is static per route (2.4.2 borderline) — pre-existing and app-wide; follow-up.

**What works well:** labels on all inputs; `autoComplete='new-password'` on new/confirm; show/hide toggle has a changing `sr-only` name and 24px target; invalid/expired/success panels focus a `tabIndex=-1` heading; destructive token ~4.8:1 on white; error text never echoes API `msg`/`input`; links underlined.

### Follow-ups
- A per-route document title mechanism (2.4.2), app-wide.
- A shared `StatusPanel` component (focus heading + message) used by forgot-password and reset-password.
- A shared decision on `FormMessage` live-region semantics (`role='alert'`) for server errors across all forms.
- Add `@axe-core/playwright` runs for `/forgot-password` and `/reset-password#token=…` in PAN-023 (sent, invalid, expired, 429).
- Manual pass: NVDA/VoiceOver on the Turnstile widget, 200%/400% zoom on the auth card, forced-colors mode.

## Attempt 2

🟡 1–4 are closed, and no new 🔴 or 🟡. Static read of `status-panel.tsx`, `forgot-password-form.tsx`, `turnstile.tsx` and the `setError` call in `reset-password-form.tsx`; Vitest/axe not run.

### Closed
- **🟡 1 (2.4.3, 4.1.3):** `forgot-password-form.tsx:91-99` renders `StatusPanel title='Check your email'`; its `h2` has `tabIndex={-1}` and takes focus on mount (`status-panel.tsx:11-16`). Reset uses the same component for invalid/expired/success.
- **🟡 2 (3.3.2, 3.3.1, 4.1.3):** `forgot-password-form.tsx:134-142` shows "Complete the verification to continue.", linked to the disabled button via `aria-describedby` and removed once a token exists. `turnstile.tsx:49-52, 94-110`: `error-callback` sets `widgetError` → `role='alert'` message + Retry; `callback` clears it. Residual: button still natively `disabled` (Tab skips it) — acceptable given the hint and alert.
- **🟡 3 (3.3.1):** `setError(..., { shouldFocus: true })` at `forgot-password-form.tsx:76-80` and `reset-password-form.tsx:71-75`.
- **🟡 4 (1.3.5):** `type='email'`, `autoComplete='email'` at `forgot-password-form.tsx:117-122`; `noValidate` (line 105) keeps zod as the only validator.

### Open notes (💭, none block)
- `status-panel.tsx:14`: `role='status'` plus focused heading may double-announce; drop `role='status'` or keep.
- `turnstile.tsx:100-106` (and load-failure Retry 81-85): focus falls to `<body>` when Retry unmounts; give the container `tabIndex={-1}` and focus it.
- `turnstile.tsx:93`: optional `role='group' aria-label='Human verification'`.
- `turnstile.tsx:48`: `expired-callback` clears silently; the hint reappearing is enough.

### Follow-ups
- Per-route document `<title>` (2.4.2), app-wide.
- Shared decision on `role='alert'` for `FormMessage`.
- `@axe-core/playwright` runs for `/forgot-password` (idle, sent, error, widget error) and `/reset-password#token=…` (invalid, expired, success) in PAN-023.
- Manual pass: NVDA/VoiceOver on Turnstile, 200%/400% zoom, forced-colors.
- Tests worth adding: "Check your email" heading focused after success, `aria-describedby` on Continue, Retry after `error-callback`.
