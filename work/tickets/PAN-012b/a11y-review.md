# Accessibility review — PAN-012b

## Attempt 1

Static read of `verify-email/index.tsx`, `components/verify-email-panel.tsx` and `components/status-panel.tsx`, plus the PAN-012 a11y notes. No axe or tests run. No 🔴 blockers, two 🟡 should-fix, a few 💭 notes.

### Findings

🟡 1. The "Verifying…" status may not be announced because it sits inside an `aria-busy` container.
- WCAG: 4.1.3 Status Messages (AA).
- Location: `src/features/auth/verify-email/components/verify-email-panel.tsx:130-134`.
- Problem: `aria-busy={mutation.isPending}` is on the same `div` that holds `<p role='status'>`. While `aria-busy='true'`, several screen readers (NVDA/JAWS with Chrome, VoiceOver) hold back changes inside that subtree, so "Verifying…" is likely swallowed.
- Fix: delete `aria-busy` from line 130, or move the `<p role='status' className='sr-only'>` out of the busy `div` to a sibling above it. Keep the live region mounted empty on first render.

🟡 2. Focus can be lost on the Confirm button while the request is pending.
- WCAG: 2.4.3 Focus Order (A); also robustness for 4.1.3.
- Location: `verify-email-panel.tsx:140`.
- Problem: the focused button becomes natively `disabled={mutation.isPending}`, which blurs it. After a 429, network or generic error the button re-enables but focus is on `<body>`.
- Fix: use `aria-disabled={mutation.isPending || undefined}` instead of `disabled` (the `inFlight` ref already blocks double submits); add `aria-disabled:pointer-events-none aria-disabled:opacity-50` or confirm the shadcn `Button` styles it; add a test that `document.activeElement` is the button after an error.

💭 3. `StatusPanel` (`status-panel.tsx:14`) `role='status'` plus focused heading may double-announce — same as PAN-012 note 5, unchanged by this diff.

💭 4. Terminal-state heading focus works (invalid link on load; idle → verified/invalid focuses the `h2`). `outline-none` on a non-interactive programmatic focus target is acceptable.

💭 5. Idle state has no heading below the `h1` (`CardTitle` is a `div`); static per-route `<title>` — pre-existing, app-wide; not this ticket.

💭 6. Invalid-link state (`verify-email/index.tsx:25-26`) still shows "Confirm the email address of your account." above the "Invalid link" panel — optionally vary the description.

### Checked and OK
- 429 / network / generic errors (lines 93-99) in `<p role='alert'>`, reset before each retry so repeats are re-announced; static strings; `text-destructive` ~4.8:1; meaning not by colour alone.
- Verifying live region mounted empty and `sr-only`; button name stays "Confirm my email".
- Native `<button type='button'>` (Enter/Space); `Loader2` decorative; label in name.
- "Sign in" link text consistent, underlined, real `<a href>`; target-size spacing exception applies.
- Nothing is sent until the user clicks.

### Follow-ups
- Tests for the two 🟡 fixes ("Verifying…" in a `role='status'` node outside any `aria-busy` ancestor; focus on the Confirm button after 429 and network errors; heading focused after success and 422).
- Shared decision on `role='status'` in `StatusPanel` (carried from PAN-012).
- Per-route document `<title>` and card heading levels, app-wide.
- PAN-023: axe runs for `/verify-email#token=…` (idle, pending, 429, verified, invalid) and `/verify-email` without token; manual NVDA/VoiceOver; 200%/400% zoom.
