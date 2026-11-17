## PAN-010b consult: identity-access-engineer

### Findings

**F1. Call path (library ts-v0.1.0, `/home/user/mmlabs-auth/ts/src/client.ts:226-238`).**
- `resendVerification(accountId?)` sends `POST /api/v1/auth/verify-email/resend {account_id}` through `authFetch`. That means `credentials:'include'`, `X-MM-App: admin` and `no-store`.
- It returns `'sent'` on 202. On 409 `email_already_verified` it catches the `EmailAlreadyVerifiedError` and returns `'already_verified'`. Every other failure is rethrown.
- The React wrapper (`react/index.tsx`) has no resend hook. ESLint only allows `@mmlabs/auth-client` imports inside `src/api/` (ADR 0003). So the call has to go through `getAuthClient()` in `/home/user/admin-pan/src/api/auth-client.ts`, which is the same instance the `AuthProvider` uses.

**F2. Every outcome, with the server source (org-admin-api b87f200):**

| Server | Library result | Where it comes from |
|---|---|---|
| 202 | `'sent'` | Delivery is asynchronous and not confirmed. The new link invalidates earlier links. |
| 409 `email_already_verified` | `'already_verified'` (no throw) | `email_verification.py:147`. **This is the only 409 the route can return.** The ticket's "handle 409" is the same thing as `already_verified`; there is no separate 409 error to handle. |
| 429 `rate_limited` | `RateLimitedError.retryAfter` | Three sources, below. |
| 403 `origin_not_allowed` | `ConfigurationError` (code `origin_not_allowed`) | Covers two different cases: (a) the account has no admin role (`email_verification.py:143`), or (b) a real misconfiguration (Origin not in `apps.origins`). `app_header_required` / `app_mismatch` also map to `ConfigurationError`. |
| 401 `session_invalid` | `SessionInvalidError` | The account was removed from the device, or the user is not active. The API may clear the cookie. **The library does not clear its own state for resend** (only `getToken` does that, at `client.ts:187`). |
| 422 `validation_error` | `ValidationError` | Bug only (bad UUID). |
| fetch failure / 15 s timeout / 500 (unreadable cross-origin) | `NetworkError` (`network_error`) | Thrown by `transport.ts:71`; `authTimeoutFetch` aborts after 15 s. |
| no account | `AuthError('no_account_selected', 0)` | Thrown client-side before any request. |

**F3. Case (a) above is reachable in normal use, not only as a bug.** `/auth/token` checks the verified email *before* membership (`tokens/service.py:72-74`). So any unverified account without an admin role lands on `EmailUnverifiedPage`, and clicking resend there returns 403 `origin_not_allowed`.

**F4. Rate limits and `retryAfter`:**
- **Per email:** 1 per 60 s and 5 per 24 h; the sign-up send counts as the first (`email_throttle.py`). Retry is the exact number of seconds left: up to 60 s for the per-minute limit, up to about 86,400 s for the daily one.
- **Global daily send cap:** 429 with a retry of 3600.
- **Per IP:** route dependency, 5 requests per 600 s by default (`config.py:99-100`). Every attempt counts, including ones that get a 429.
- **How the wait reaches the UI:** both the `Retry-After` header (exposed via CORS) and `details.retry_after` are sent. The library parses either, but **clamps the value to [0, 900] s** (`retry-after.ts`). So the 5-per-day limit and the global cap both show at most 15 min, and a retry after that returns another 429.

**F5. Which account it targets.** Without an argument the library uses `getAccountId()`, the stored `mm_account_id`. The gate page already has an `accountId` (`useCurrentAccount`). Pass that explicitly so the request is tied to the account the page shows.

**F6. Stale copy and tests:**
- `/home/user/admin-pan/src/features/auth/gate/access-pages.tsx:94-96` ("request it from any mmlabs app you use").
- `/home/user/admin-pan/src/features/auth/verify-email/components/verify-email-panel.tsx:24-25` and `:89-91`.
- `/home/user/admin-pan/docs/adr/0003-auth-client-integration.md:20`, which says there is no resend button because of ADM-002d.
- `/home/user/admin-pan/src/features/auth/gate/access-pages.test.tsx:53-70`, which asserts there is *no* resend button and *no* call to `/verify-email/resend`. It must be replaced, not left failing.

### Recommendations

**R-a. One thin wrapper in `src/api/auth-client.ts` (AC1, R2/R3).**
- Signature: `resendVerificationEmail(accountId: string): Promise<ResendOutcome>`. It calls `getAuthClient().resendVerification(accountId)` and returns plain data:
  - `{kind:'sent'}`
  - `{kind:'already_verified'}`
  - `{kind:'rate_limited', retryAfter}`
  - `{kind:'not_allowed', requestId}` for a `ConfigurationError` with code `origin_not_allowed`
  - `{kind:'config', requestId}` for any other `ConfigurationError`
  - `{kind:'session_invalid'}`
  - `{kind:'network'}`
  - `{kind:'unknown', requestId}`
- Reuse `authFailure()` and add only the `not_allowed` split. Keep the result free of messages, emails and tokens (R5).
- Unit-test the mapping with a stubbed fetch for 202, 409, 429 (header and details), 403, 401, 422, a thrown fetch, and a timeout.

**R-b. What the UI does for each outcome (AC2, AC3):**
- **`sent`:** a neutral status message, for example: "If {email} can receive mail, a new verification link is on its way. It can take a few minutes. Only the newest link works." Keep the "I've verified, continue" button.
- **`already_verified`:** call the existing `onContinue()`. That is `recheck(true)`, which is `getToken({accountId, forceRefresh:true})`. Let the gate re-render from the resulting `AccessState`; on `ok` the user continues. If the state is still `email_unverified`, show the existing "still not verified" alert.
- **`rate_limited`:** start a countdown anchored to an absolute time (`Date.now() + retryAfter*1000`), not a decrementing counter. Keep the button focusable with `aria-disabled` and show "Try again in {formatRetryAfter(remaining)}". Re-enable at zero. Clear the countdown when `accountId` changes.
  - Announce the wait once via `role="status"`, and announce once more when the button is available again. Do not announce every tick.
  - Because of the 900 s clamp, word it as "Try again in …" and accept that a later 429 starts a new countdown.
- **`not_allowed`:** "A new link can't be sent from mmlabs Admin for this account. If you use another mmlabs app, request a link there, or ask an administrator." Show the request ID if there is one. Do not treat it as a fatal configuration screen.
- **`config`:** "The app is not configured correctly for mmlabs Identity", plus the request ID.
- **`session_invalid`:** call `reload()` from `useAuth()`, the same way `use-access-check.ts` does, so the gate re-lists accounts or goes to sign-in.
- **`network`:** "Could not reach the server. Please try again." Note that after a timeout the mail may already have been sent, so the next click can return a 429. That is fine.
- **`unknown`:** "Something went wrong. Please try again later." plus the request ID.
- **Double clicks:** guard with an in-flight ref, as `verify-email-panel` does. Do not run resend while "continue" is pending.
- **Errors vs results:** errors use `role="alert"`; success and countdown text use `role="status"`.

**R-c. Copy.** The gate page and the public verify-email page change together.
- Gate paragraph: "{email} has not been verified yet. Open the verification email we sent you and follow its link, then come back and continue. No email, or the link expired? Send the link again." Button label: "Send the link again".
- Verify-email, invalid link: "This link is invalid. If your email address is still not verified, sign in and choose "Send the link again"."
- Verify-email, expired or used link: "This link is invalid, expired or already used. Only the newest link works. If your email address is still not verified, sign in and choose "Send the link again"."
- Keep the existing Sign in link. Admin-portal verification links only reach staff (the link uses the calling origin), so the "any mmlabs app" fallback belongs only in the `not_allowed` message.

**R-d. ADR and tests (AC4, R7/R8).**
- Amend ADR 0003 line 20: USR-12 lifted the ADM-002d restriction for resend only; forgot-password and sign-up stay blocked.
- Replace `access-pages.test.tsx:53` with tests for each outcome, mocked at the network layer:
  - 202 shows the status message;
  - 409 calls `/auth/token` again and continues;
  - 429 sets `aria-disabled` and shows the countdown, and the button re-enables once the countdown ends (fake timers);
  - 403 shows the `not_allowed` text;
  - 401 triggers `reload`;
  - a network error shows the network message.
- Also assert that the request carries `{account_id: <shown account>}`, `credentials:'include'` and `X-MM-App: admin`.
- Update the verify-email copy tests.

### Risks
- **15-minute clamp.** For the 5-per-day limit and the global cap, the countdown understates the real wait (hours), so the user may get a 429 again. Only the UX suffers; the server still enforces the limits.
- **One 403 code for two causes.** Configuration bugs (Origin not registered) show the same message as "not staff". The request ID is the only way to tell them apart, so always show it.
- **Per-IP limit is shared** by everyone behind the same NAT or office IP (5 per 10 min), so colleagues can rate-limit each other.
- **Stale library README** (line 253, "admin cannot … resend") could mislead later work. It is a follow-up for the `mmlabs-auth` repo, not this diff (R7).
- **Leftover file.** A stray `__screenshots__/tmp.test.tsx/x-a-1.png` sits under `/home/user/admin-pan/src/features/auth/gate/`. It is unrelated; list it as a follow-up.

### Open questions
1. After `sent`, should the UI start a 60 s cooldown on its own, mirroring the known 1-per-minute rule, so users don't hit a guaranteed 429? Or should it rely only on the server's 429? I lean towards the 429 only, since it is the API's rule (R4). The local cooldown would be a UX nicety.
2. The AC says "409 … show clear messages". Please confirm the planner may read that as satisfied by the `already_verified` path, since the library never surfaces 409 as an error.
3. For `not_allowed`, is "ask an administrator" acceptable copy, or should non-staff accounts be steered only to "use another account / sign out" (the controls already on the page)?
