## Findings
- `EmailUnverifiedPage` (access-pages.tsx:65) already has the continue button with `aria-disabled`, a `pending` flag and a single `role='alert'` paragraph. The `onContinue` flow returns `AccessState` (`rate_limited` carries `retryAfter`). The resend button should be a sibling. Don't fold it into this state.
- `resendVerification(accountId?)` returns `'sent' | 'already_verified'`. It throws `AuthError` subclasses with `.status`, `.code` and `.requestId`. `RateLimitedError.retryAfter` is a number in seconds. `NetworkError` exists too. `EmailAlreadyVerifiedError` exists. I could not tell from the d.ts whether the client converts a 409 `email_already_verified` into the `'already_verified'` return or throws it. Check `client.ts:226` before writing the 409 branch.
- `formatRetryAfter` is fine for static text. It rounds up in seconds, minutes and hours, so it is not suitable for a ticking display.
- The existing test at access-pages.test.tsx:53 asserts "any mmlabs app you use" and "no resend button". It must be inverted. The harness (`fakeIdentityApi`, `routes` keyed `POST /api/v1/auth/verify-email/resend`, arrays consumed in order, `envelope(status, code, details, headers)`) is enough. No new test util is needed.

## Recommendations
**Component (AC1, AC3).** Add `ResendVerification` in `src/features/auth/gate/` and render it in `EmailUnverifiedPage` above the continue button.
- State:
  - `useMutation` (or local `pending`) calling `client.resendVerification(accountId)` from `useAuth()`/the client. Use no raw fetch (R3).
  - `result: 'sent' | 'conflict' | 'error' | null`, plus `cooldownUntil` (a ms timestamp).
- `onClick`: return early if `pending || remaining > 0`. This is the real guard, because `aria-disabled` does not block clicks.
- Button: `aria-disabled={pending || remaining > 0 || undefined}` with the same `aria-disabled:` classes as the continue button. Never use native `disabled`, so focus is kept (the PAN-010 lesson, items 2 and 6).
- Label: "Send the link again". While pending, add a Loader2 spinner. While cooling down, keep the label and put the wait in the helper text below, so the accessible name stays stable.
- On `sent`: start a cooldown of about 60 s (the API limit is 1/min). Use `retryAfter` when a 429 supplies one. Don't use a fixed number other than as a default.
- Countdown:
  - A `useEffect` interval at 1 s, cleared on unmount, computing `remaining = ceil((until - Date.now())/1000)` from the timestamp, so there is no drift.
  - Show visible text "You can request another link in {n} s". For 429 over 60 s, use `formatRetryAfter` once at the start (the 5/day limit returns a large retryAfter, so show min/h, not a per-second tick).
  - Do not put the ticking text in a live region. Announce only the start of the wait ("Try again in 1 min") in the status message, then stay silent. Per-second announcements are noisy.
- Announcements:
  - One persistent `<p role='status' aria-live='polite'>` always in the DOM, updated with "Sending…", then the result. Use this for `sent` and for the neutral "If this account's email is not verified yet, a new link is on its way. Check your inbox and spam folder." Don't claim the mail was delivered.
  - Use `role='alert'` only for errors (429, 409, network, other), as the existing code does. Don't put both live regions on the same message.
  - Don't nest either inside a live container (a11y-review item 1 is fixed or in progress).
- `already_verified`: call the existing `onContinue()` (force refresh), reusing its result handling. Announce "Your email address is already verified. Continuing…". If the refresh still says unverified, show the existing alert. Share the `pending` state with the continue button so the two can't run together, or at minimum have `onContinue` bail out if resend is pending.
- Errors:
  - 429: "Too many requests. Try again in {formatRetryAfter}." plus the countdown.
  - 409: depends on the open question below. Give it a distinct message and no retry loop.
  - Network: "Could not reach the server. Please try again." Don't start a cooldown.
  - Anything else: "Something went wrong. Please try again later."
- After a 429, keep focus on the button (aria-disabled does that). Don't log or render `requestId` with the email (R5).

**Copy (from PAN-012c).**
- Gate page paragraph: "{email} has not been verified yet. Open the verification email we sent you and follow its link. If you can't find it, send the link again below. After verifying, come back and continue."
- verify-email-panel.tsx lines 24-25 and 89-91: "…is still not verified, sign in and request a new link." Note that sign-in lands on this same gate page, which has the button, so the string is accurate.
- Update the 3 related tests that match the old strings.

**Tests (AC4)** use `setup(unverified)` plus a `'POST /api/v1/auth/verify-email/resend'` route. Add this key to `routes` in `setup`, or extend `setup` to take extra routes.
- sent: handler returns the success response (check the library's contract test for the exact body or 204). Assert the status text, the button has `aria-disabled='true'`, a click does not add a second `api.count(RESEND_KEY)`, and the countdown text shows. Use `vi.useFakeTimers` only if the browser-mode setup allows it; otherwise rely on the 60 s text and test the timer arithmetic in a small unit test of a `useCountdown` hook with an injected clock.
- already_verified: the resend returns the library's already-verified shape, then the next token route succeeds (`[unverified, tokenResponse]`). Assert 'Protected: Home' and `api.count(TOKEN_KEY)` is 2.
- 429: `envelope(429, 'rate_limited', null, {'retry-after': '90'})`. Assert the alert text, the "2 min" wording, an aria-disabled button, and that the button keeps focus after the click.
- 409: the envelope with the code the API uses. Assert the specific message.
- Network: `() => { throw new TypeError('x') }` from the handler. Assert the alert, no cooldown, and that the button works again on a second click.
- Plus: the request sends `X-MM-App: admin` (`call.headers`), no `Authorization` header is required (cookie class), and the account id in the body matches `ACCOUNT_A`. Assert that the unverified-page "no resend button / no call" test is flipped to "no call until clicked".

## Risks
- A double click during the pending window will send two requests unless the guard is a ref or flag checked in `onClick` (not only `aria-disabled`).
- Cooldown state is in the component. Remounting (the gate re-renders on state change, e.g. after a failed continue) resets it. Keep the component stable under the gate, or keep `cooldownUntil` in a small zustand store keyed by accountId (in memory only, R3). The API enforces the limit anyway, so the worst case is one more 429.
- Neutral `sent` copy means the API gives no account-enumeration signal. Keep it neutral.

## Open questions
1. What does the 409 mean in the USR-12 contract: `email_already_verified` (is it mapped to the `'already_verified'` return by the library?) or the ADM-002d app-mismatch conflict? Check `client.ts:226` and org-admin-api's USR-12 tests, then choose the 409 message and test.
2. Should the library README line 253 be flagged upstream? That belongs to a follow-up in auth-client, not this repo.
