## Security consult — PAN-010b (resend verification email)

Sources I checked: the library at `/home/user/mmlabs-auth/ts/src/client.ts:226-238`, `src/errors.ts:113-169`, `src/retry-after.ts` and `src/token-cache.ts`. The API at origin/main b87f200: `app/modules/auth/router.py:295-327`, `email_verification.py:83-109,131-152`, `email_throttle.py`, `deps.py:116`, `core/rate_limit.py:102` and `tokens/service.py:73-80`. In admin-pan: `src/api/auth-client.ts`, `src/features/auth/gate/*` and `nginx/security-headers.conf`.

### Findings
1. **R3 is met if the UI only calls `getAuthClient().resendVerification(accountId)`.** The library sends `POST /api/v1/auth/verify-email/resend` through `authFetch` with the device cookie and `X-MM-App: admin` from `appKey()`. The UI never builds this request, never sets headers and never touches the cookie. The email link origin comes from the server (`get_resend_link_origin`, Origin checked against `apps.origins`), so the client cannot change where the link points.
2. **The ticket's "409" is the same case as `already_verified`.** The only 409 on this endpoint is `email_already_verified`, and the library turns it into the return value `'already_verified'` (client.ts:236). The UI will never see a raw 409, so it does not need a separate 409 message, only the `already_verified` path. The plan should say this and not invent a 409 branch.
3. **There is a 403 case the ticket does not mention.** The API checks email verification before staff roles when issuing the `aud=admin` token (tokens/service.py:73 comes before :74). So an account that is unverified *and not staff* also lands on the email-unverified page. Resend from that page then returns 403 `origin_not_allowed` (email_verification.py:142-145), which the library maps to `ConfigurationError`. This must be handled: show a neutral message like "We can't send the link from here. Request it from another mmlabs app you use." Do not show "misconfigured" and do not throw to the error boundary. This only tells the signed-in user something about their own account, so it is not an enumeration problem, but the copy should not say "you are not staff".
4. **All 429s share one code but the wait times differ.** The code is always `rate_limited`, from three sources:
   - per-IP limit: 5 per 600 s;
   - per-email limit: 60 s gap, or up to 24 h after 5 sends (`email_throttle.py`);
   - global daily cap: 3600 s.

   The library clamps `retryAfter` to [0, 900] s and falls back to 5 s. So the countdown is a **lower bound**: after a daily-limit 429, the button comes back after at most 15 min and the next click gets another 429. That is acceptable because the server enforces the limit, but the copy should say "Try again in about N min", not promise that the send will work.
5. **CSP needs no change.** The call goes to the API origin, which is already in `connect-src`. No new script, frame or image sources are added.
6. **Email display is fine as it is.** The page already shows the signed-in account's own email (access-pages.tsx:94), which the user knows. `sent` returns 202 with no body, so it reveals no new account state.

### Recommendations
- **One request per click, no retries.** The button is `aria-disabled` while a request is pending (ignore clicks, don't just style the button). No automatic retry on 429, `NetworkError` or timeout. Don't use TanStack Query `useMutation` retry: set `retry: 0` or call the method directly.
- **A timeout still shows the generic error and re-enables the button.** The 15 s `authTimeoutFetch` limit can expire after the server has already queued the email. That is safe because a second click gets 429 from the per-email limit.
- **Keep the countdown in component state, counting down from `err.retryAfter`.** Clamp it to at least 1 s. Don't persist it (no storage, R3/R5 spirit). Clear the timer on unmount. When it reaches 0, enable the button but don't resend automatically.
- **`already_verified` calls the existing `onContinue` (`recheck(true)`) once.** If the token check still returns `email_unverified` (for example a replication delay), show the page again with its alert. Never chain another resend or recheck, so there are no loops.
- **Messages per outcome.** In every case, never pass the error message, email, account id or request id into toasts, `console.*`, the URL or the query/search state. Use fixed copy per outcome; `requestId` may be shown only if an existing pattern already does so.

  | Outcome | Message |
  |---|---|
  | `sent` | "If your email still needs verifying, a new link is on its way. Check your inbox." The page already names the address, so naming it again is fine. |
  | `RateLimitedError` | Countdown message (see finding 4). |
  | `ConfigurationError` (403) | Neutral message from finding 3. |
  | `SessionInvalidError` (401) | Existing signed-out / account-picker handling. |
  | `NetworkError` / other | "Couldn't send the link. Try again." |

- **Check `instanceof` against the classes exported by the library** (they are already imported in `src/api/auth-client.ts`). Don't branch on `err.message`.
- **Tests.** Mock the library or fetch, not the API, and cover:
  - `sent`;
  - `already_verified` leading to recheck;
  - 429 with countdown and an aria-disabled button that ignores clicks;
  - 403 `ConfigurationError` showing neutral copy;
  - network error;
  - pending double-click sending only one call;
  - no email or token in `console` output (spy on it).
- **Copy alignment from the orchestrator's notes.** Keep the verify-email panel strings neutral. They can now say "sign in and request a new link".

### Risks
- **Low: countdown shorter than the real wait.** The library's 900 s clamp makes the countdown too short for daily-limit 429s (finding 4). The impact is UX only.
- **Low: an unhandled `ConfigurationError` for non-staff unverified accounts** would surface as a generic crash or a "misconfigured" message (finding 3).
- **Note: the library README is out of date.** README:253 says `admin` cannot resend. Implementers may wrongly add a block or a workaround. Do not send another app's `X-MM-App` (owner's note).

### Open questions
- Should the page say the button may not work for non-staff accounts, or only react after a 403? I recommend reacting after the 403 only.
- Follow-up for mmlabs-auth: fix README:253 after USR-12. Maybe also expose whether `retryAfter` was clamped, or raise `MAX_RETRY_AFTER` for resend so the 24 h and 1 h waits can be shown accurately. This is out of scope for this ticket and belongs in the library repo.
