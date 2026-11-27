# BUG-003 — accessibility review

## Attempt 1

**BUG-003 a11y review, attempt 1.** Static review of the diff only. I did not run axe or Playwright, and I did not test with a screen reader.

**Findings**

No 🔴 blockers. I found no WCAG A/AA failure that the diff introduces.

🟡 1. Focus is dropped to `<body>` when the session cannot start (2.4.3 Focus Order, 3.2.2 On Input)
- Where: `src/features/auth/sign-in/components/user-auth-form.tsx:186` (`disabled={busy || ...}`) and `:115-116` (`sessionError`, `busy`).
- The submit button is natively `disabled` as soon as the user activates it. In Chrome, a focused button that becomes disabled stops receiving key events and focus falls back to the page.
- Before the diff this lasted only for the login request. Now it lasts through `reload()` as well, so a keyboard or screen reader user loses their place for longer.
- When `sessionError` fires, the button is re-enabled but focus is not restored. The user has to Tab from the top of the page to retry.
- Fix: use `aria-disabled={busy || undefined}` and keep the early return in `onSubmit` (`:119`, already there). Add an `aria-disabled:pointer-events-none aria-disabled:opacity-50` style. Focus then stays on the button throughout.
- Alternative: keep `disabled`, and when `sessionError` becomes true, focus the email field or the password field with a `useEffect`.

🟡 2. "Signing in" is not announced while busy (4.1.3 Status Messages)
- Where: `user-auth-form.tsx:187-190`.
- Busy state is shown only by a spinner icon with no text, plus `aria-busy` on a button. `aria-busy` is not announced on buttons by most screen readers.
- The label stays "Sign in". The user hears nothing until the page changes, and the wait is now longer (login plus the accounts listing).
- This gap was already there for `mutation.isPending`. The diff stretches it, so it should be fixed in this ticket.
- Fix: add `<span role='status' className='sr-only'>{busy ? 'Signing in…' : ''}</span>` next to the button. Always render the span so the live region exists before its text changes. Mark the spinner `aria-hidden`.

💭 3. Alert announcement is fine (4.1.3)
- `user-auth-form.tsx:177-183`: the `<p role='alert'>` is mounted with its text already in it, so it is announced.
- `onSubmit` calls `setSignedIn(false)` (`:120`), which removes the alert on a retry. A repeated identical failure therefore mounts a fresh alert and is announced again.
- The text "Could not start your session. Please try again." says what happened and what to do (3.3.1). It contains no email address.
- The alert is not tied to a field, which is correct because the error is not about a field.

💭 4. Re-enabled form after `sessionError` is correct (3.3.1, 3.3.4)
- `sessionError` sets `busy` to false, so the button is enabled again.
- Inputs are never disabled, so they stay editable.
- The password field is cleared by the existing `onSettled`, with no announcement. This is not new, and it is acceptable because it is a credentials field.

💭 5. Possible stuck state if `status` stays `'loading'`
- `user-auth-form.tsx:107` waits on a status that `await reload()` should already have resolved.
- If `status` stays `'loading'` after `reload()`, the form would stay busy with no alert and no timeout. Visually and for assistive technology this would be an endless busy state with no way out (2.2.1 Timing Adjustable, if it ever happens).
- It looks unlikely, since `reload()` is awaited. Consider a fallback that treats this as `sessionError`.

**Follow-ups**
- Add a Playwright or axe check of `/sign-in` in the busy and `sessionError` states once PAN-023 lands.
- Check the same disabled-button and status-announcement pattern on the other auth forms (forgot-password, reset-password), outside this ticket (R7).

**Summary:** no blockers. Two should-fix items: focus is lost on the natively disabled button and not restored after `sessionError`, and no `role=status` announces the busy state. The `role=alert` message and the re-enabled form are sound.
