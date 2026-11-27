# PAN-032: Sign-in form: keep focus while busy and announce "Signing in…"

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P2 |
| Areas | ui, a11y |
| Attempts | 0 |
| Created | 2026-11-27 |
| PR | — |

## Goal
Make the sign-in form's busy state accessible: focus stays on the Sign in button from the click until navigation (or returns there after an error), and screen readers hear "Signing in…". These are the two 🟡 findings of the BUG-003 a11y review.

## Spec reference
`docs/spec-v1.md` §5.1 (login page) and §6 (WCAG 2.2 AA, R10).

## Depends on
BUG-003 (PR #37, merged first).

## Acceptance criteria
- [ ] While a sign-in is in progress, the Sign in button keeps keyboard focus (for example `aria-disabled` instead of native `disabled`); a second activation still starts no second login.
- [ ] After a failed attempt (wrong credentials, rate limit, Turnstile, or "Could not start your session"), focus is on the button or a sensible form field, not on `<body>`, and the form can be retried from the keyboard without tabbing from the top of the page.
- [ ] A polite `role="status"` live region, present before the state changes, announces "Signing in…" while busy and is empty otherwise; the spinner is `aria-hidden`.
- [ ] The existing sign-in behaviour and tests (redirect, errors, Turnstile, BUG-003 regression) are unchanged.
- [ ] Vitest browser-mode tests cover focus during and after the busy state and the status-region text.

## Notes / answers from owner
- 2026-11-27 (owner): create a ticket for the two BUG-003 a11y follow-ups.
- Source: `work/tickets/BUG-003/a11y-review.md` (Attempt 1, findings 🟡 1 and 🟡 2). The same pattern on the other auth forms (reset-password, verify-email) is out of scope here.
