Status: READY

# Plan: PAN-010b, resend the verification email from the admin UI

## Spec summary
`docs/spec-v1.md` §5.1:
> "Shell with navigation filtered by permission, signed-in user, and a clear page for 403 and for "email not verified" / "not a member"."
> "`/verify-email` (token from the email link) also receives the links the API sends for `admin` resends (org-admin-api USR-12). [...] Resending the verification email needs a signed-in session and belongs with sign-in (the "Send the link again" button comes in PAN-010b)."

Ticket goal: add a "Send the link again" action to the "Verify your email address" gate page (PAN-010). It calls the library's `resendVerification()` (cookie class) and handles `sent`, `already_verified`, 409 and 429.

Dependencies are met. PAN-010 is DONE. org-admin-api USR-12 is DONE and merged (origin/main b87f200), and `get_resend_link_origin` accepts `admin`.

Settled facts (consults, recorded as findings):
- **The 409 is `already_verified`.** The endpoint's only 409 is `email_already_verified` (org-admin-api `email_verification.py:147`). The library turns it into the return value `'already_verified'` (`mmlabs-auth/ts/src/client.ts:235`). AC3's "409" is therefore met by the `already_verified` path. There is no separate 409 branch.
- **403 `origin_not_allowed` is a normal case.** The library raises it as `ConfigurationError`. It happens for an unverified account that has no admin role, because `/auth/token` checks the verified email before membership (`tokens/service.py:73-74`). It gets neutral copy. "Contact an administrator" wording was already approved by the owner in PAN-012c.
- **The library clamps `retryAfter` to at most 900 s** (`retry-after.ts`). The countdown is therefore a lower bound for the 5-per-day limit and the global cap.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | The resend button uses `@mmlabs/auth-client` `resendVerification()` only (R3). | Code: `resendVerificationEmail()` in `src/api/auth-client.ts` is the only caller, and the feature has no `fetch`. `pnpm lint` passes: the `no-restricted-imports` rule keeps the core library inside `src/api/`. Tests: `auth-client.test.ts › resendVerificationEmail › sends POST /api/v1/auth/verify-email/resend {account_id} with credentials include and X-MM-App admin`, and `access-pages.test.tsx › resend › click sends one POST for the shown account with X-MM-App admin`. |
| 2a | `sent` shows a neutral "check your email" message. | `access-pages.test.tsx › resend › 202 announces the neutral sent message in the status region` |
| 2b | `already_verified` refreshes the token and continues. | `access-pages.test.tsx › resend › 409 email_already_verified refreshes the token and shows the app` (`api.count(TOKEN_KEY)` is 2 and "Protected: Home" is shown). |
| 3a | 409 shows a clear message. | Met by 2b: the library never surfaces a 409 as an error (finding above). The status region announces "Your email address is already verified. Continuing…". The same test asserts it. |
| 3b | 429 shows a clear message. While rate-limited, the button is disabled and a countdown shows the wait. | `access-pages.test.tsx › resend › 429 shows the wait, aria-disables the button with a countdown, ignores clicks, then re-enables` (uses `retry-after: 1`) |
| 4 | Tests cover each outcome. | The rows of `## Tests to write`. `pnpm test` is green, along with `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm build` (R8). |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/api/auth-client.ts` | Add `ResendOutcome` and `resendVerificationEmail(accountId, client = getAuthClient())`. | AC1 / R2 / R3: the core library may only be called from `src/api/`, and outcomes are returned as data. |
| `src/api/index.ts` | Re-export `resendVerificationEmail` and `type ResendOutcome`. | Features import from `@/api`. |
| `src/api/auth-client.test.ts` | Add a `describe('resendVerificationEmail')` block. | Unit tests for the mapping (R8). |
| `src/hooks/use-countdown.ts` (new) | `useCountdown(until: number \| null): number` returns the whole seconds left. | AC3 countdown. Anchored to an absolute time, so it does not drift. |
| `src/hooks/use-countdown.test.tsx` (new) | Hook tests. | R8 |
| `src/features/auth/gate/resend-verification.tsx` (new) | `ResendVerification` component: button, status and alert regions, countdown. | AC1–3 |
| `src/features/auth/gate/access-pages.tsx` | `EmailUnverifiedPage`: new paragraph copy, renders `ResendVerification`, one shared `busy` guard so continue and resend never run together. | AC2/3, copy alignment from PAN-012c. |
| `src/features/auth/gate/access-pages.test.tsx` | Replace the "text only … no resend button" test (lines 53-73) and add a `describe('resend')` block. | AC4. The old test asserts the opposite of the new behaviour. |
| `src/features/auth/verify-email/components/verify-email-panel.tsx` | Change the invalid (l. 24-25) and expired (l. 89-91) strings. | Copy alignment (orchestrator notes). |
| `src/features/auth/verify-email/verify-email.test.tsx` | Update the two regexes (l. 87, l. 181) to the new copy. | They match the old strings. |
| `docs/adr/0003-auth-client-integration.md` | Amend the "ADM-002d consequences" bullet (l. 20). | The decision changed: USR-12 lifts the restriction for resend only. |

No other files. `user-auth-form.tsx` and `forgot-password` keep their "any mmlabs app" copy: forgot-password is still blocked for `admin`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/api/auth-client.test.ts › resendVerificationEmail › sends POST /api/v1/auth/verify-email/resend {account_id} with credentials include and X-MM-App admin` | AC1 |
| `… › maps 202 to sent` | AC2 |
| `… › maps 409 email_already_verified to already_verified` | AC2/3 |
| `… › maps 429 with Retry-After to rate_limited with retryAfter` (header `30` gives `retryAfter: 30`) | AC3 |
| `… › maps 403 origin_not_allowed to not_allowed with requestId` | 403 finding |
| `… › maps 403 app_mismatch to config` | other `ConfigurationError` |
| `… › maps 401 session_invalid to session_invalid` | 401 |
| `… › maps a thrown fetch to network` | network |
| `src/hooks/use-countdown.test.tsx › returns 0 for null` | countdown |
| `… › counts down from a future timestamp to 0 and stays at 0` (`until = Date.now() + 1500`: first value is 2, then `expect.poll` reaches 0) | countdown |
| `src/features/auth/gate/access-pages.test.tsx › email_unverified page › shows the new copy and a "Send the link again" button, no external link, no resend call until clicked` (replaces the l. 53 test) | AC1, copy |
| `… › resend › click sends one POST for the shown account with X-MM-App admin` (body `{account_id: ACCOUNT_A}`, header `x-mm-app: admin`, `credentials: 'include'` on the fetch spy's init) | AC1 |
| `… › resend › 202 announces the neutral sent message in the status region` (the button stays enabled and is not aria-disabled) | AC2 |
| `… › resend › 409 email_already_verified refreshes the token and shows the app` (token route `[unverified, tokenResponse]`) | AC2/3 |
| `… › resend › 429 shows the wait, aria-disables the button with a countdown, ignores clicks, then re-enables` (`envelope(429,'rate_limited',null,{'retry-after':'1'})` once, then 202. Steps: assert the alert text, `aria-disabled='true'`, focus kept on the button, the countdown text, a click during the wait adds no request. Then, with `{ timeout: 3000 }`, aria-disabled is gone and the status says "You can send the link again.") | AC3 |
| `… › resend › 403 origin_not_allowed shows the neutral not-allowed alert with the request ID` | 403 finding |
| `… › resend › 401 session_invalid reloads the accounts and goes to sign-in` (the handler sets `api.state.accounts = []` before returning 401; assert "Sign-in page") | 401 |
| `… › resend › network error shows the network alert and the button works again` (the handler throws `TypeError`; a second click sends a second request) | network |
| `… › resend › double click while pending sends one request; pending is aria-disabled, focused, "Sending…" announced; continue is ignored while pending` | a11y, R9-style safety |
| `… › resend › logs no email or token` (spies on `console.log/info/warn/error` across the 202 and 403 cases; no call contains `a@staff.test` or `TOKEN`) | R5 |
| `src/features/auth/verify-email/verify-email.test.tsx` (existing 2 tests) | regexes changed to `/sign in and choose "Send the link again"/` |

**Gate test harness.** The component calls `resendVerificationEmail(accountId)`, which uses the app singleton `getAuthClient()`. The tests' `AuthProvider` uses another instance (`createTestAuthClient`). `resendVerification` is stateless when it gets an explicit `accountId` (`client.ts:226-238`), so both instances can share one fake API. In `setup`:
1. `vi.stubEnv('VITE_API_BASE_URL', BASE)` and `vi.stubEnv('VITE_APP_KEY', 'admin')`.
2. `vi.spyOn(globalThis, 'fetch').mockImplementation(api.fakeFetch)`.
3. Add an optional `extraRoutes` argument for `'POST /api/v1/auth/verify-email/resend'`. The default handler is `() => new Response(null, { status: 202 })`.

Every request from either client then reaches `api`. Restore mocks and unstub env in `afterEach`. This mocks at the network layer (R8) and needs no new test util and no injection prop. In the unit tests, pass a `createAdminAuthClient({ fetch, storage: null, broadcast: false })` instance as the second argument.

## Approach
1. **Wrapper (`src/api/auth-client.ts`).**
   ```ts
   export type ResendOutcome =
     | { kind: 'sent' }
     | { kind: 'already_verified' }
     | { kind: 'not_allowed'; requestId?: string }
     | AuthFailure
   export async function resendVerificationEmail(
     accountId: string,
     client: Pick<AuthClient, 'resendVerification'> = getAuthClient()
   ): Promise<ResendOutcome>
   ```
   - It returns `{kind: await client.resendVerification(accountId)}` on success.
   - On error: a `ConfigurationError` with `code === 'origin_not_allowed'` becomes `{kind:'not_allowed', requestId}`. Anything else goes through `authFailure(e)`.
   - It uses `instanceof` checks only and never reads `e.message`. No retries.
   - JSDoc: the account is always passed explicitly (it is the one the page shows), and the library maps 409 to `'already_verified'`.
2. **`useCountdown(until)`.**
   - Keep `now` in state. While `until > now`, run a 1 s `setInterval` that sets `now = Date.now()`. Clear it on unmount or when `until` changes. Stop the interval once the time has passed.
   - Return `Math.max(0, Math.ceil((until - now) / 1000))`, or 0 for `null`.
3. **`ResendVerification` component** (`gate/resend-verification.tsx`).
   - **Props:** `{ accountId: string; busy: boolean; setBusy(b: boolean): void; onAlreadyVerified(): Promise<void> }`. `busy` is shared with the continue button.
   - **State:** `pending`, an `inFlight` ref, `status: string` (for the always-rendered `<p role='status' className='sr-only'>`), `alert: { text: string; requestId?: string } | null`, and `until: number | null` for `useCountdown`.
   - **`onClick` bails out** if `inFlight.current || busy || remaining > 0`. This check is the real guard, because aria-disabled does not block clicks. Otherwise it sets the ref, calls `setBusy(true)`, clears the alert and sets status to "Sending…". It then `await`s `resendVerificationEmail(accountId)` and finally resets the ref and calls `setBusy(false)`.
   - **Outcome mapping:**

     | Outcome | UI |
     |---|---|
     | `sent` | status: the sent copy |
     | `already_verified` | status: "Your email address is already verified. Continuing…", then `await onAlreadyVerified()` (the page's continue handler, run once and never chained to another resend) |
     | `rate_limited` | alert: `Too many requests. Try again in ${formatRetryAfter(retryAfter)}.`; `until = Date.now() + max(1, retryAfter ?? 60) * 1000` |
     | `not_allowed` | alert: the not-allowed copy, plus "Request ID: …" if present |
     | `config` | alert: "The app is not configured correctly for mmlabs Identity.", plus the request ID |
     | `session_invalid`, `account_changed`, `no_account_selected` | `void reload()` from `useAuth()` (same as `use-access-check.ts`), so the gate re-lists the accounts |
     | `network` | alert: "Could not reach the server. Please try again." |
     | anything else | alert: "Something went wrong. Please try again later.", plus the request ID if present |

   - **Button.** Label "Send the link again" (stable accessible name), with `Loader2` while pending. Set `aria-disabled={pending || busy || remaining > 0 || undefined}`, never native `disabled` (PAN-010/PAN-011/PAN-013 lesson: focus stays on the button). Use the same `aria-disabled:` classes as the continue button. While `remaining > 0` the button has `aria-describedby` pointing to a non-live `<p id>` that reads "You can send the link again in {formatRetryAfter(remaining)}.". That text ticks but is not announced.
   - **When the countdown reaches 0** (effect on the `remaining` transition from >0 to 0), set status to "You can send the link again." and set `until` to null. This is the only re-enable announcement.
   - **Live regions.** Errors use `role='alert'` and results use `role='status'`. The same message is never in both, and neither region sits inside another live or `aria-busy` container.
   - **No local cooldown after `sent`.** The 1-per-minute rule belongs to the API (R4: the UI mirrors it, never re-implements it). A second click within 60 s gets a 429 and that starts the countdown. Worst case is one extra 429.
4. **`EmailUnverifiedPage`.**
   - Replace `pending` with `busy` (state) plus an in-flight ref. The continue `onClick` bails out if busy. The existing result-to-alert handling moves into a function `runContinue()`, which is used by both the button and `onAlreadyVerified`.
   - Render `<ResendVerification accountId={accountId} …/>` between the paragraph and the continue button, only when `accountId` is defined. It always is in `ready` state.
   - The continue button is aria-disabled while `busy`.
   - The countdown state lives in the component. The page stays mounted across a failed continue (same element type). Choosing another account remounts it via `checking`, which clears the countdown. No store is needed, and nothing is persisted (R3/R5).
5. **Copy.**
   - Gate paragraph: "{email} has not been verified yet. Open the verification email we sent you and follow its link, then come back and continue. If you can't find the email or the link has expired, send the link again."
   - Sent: "If this address still needs verifying, a new link is on its way. It can take a few minutes, and only the newest link works."
   - Not allowed: "A new link can't be sent from mmlabs Admin for this account. Request one from another mmlabs app you use, or contact an administrator."
   - Verify-email invalid: "This link is invalid. If your email address is still not verified, sign in and choose "Send the link again"."
   - Verify-email expired: "This link is invalid, expired or already used. Only the newest link works. If your email address is still not verified, sign in and choose "Send the link again"."
   - Use `&quot;` or curly quotes in JSX as lint requires. The test regex should match the words, not the quote characters.
6. **ADR 0003, l. 20.** Rewrite it as: "ADM-002d consequences (the API refuses forgot-password and sign-up for `admin`): no "Forgot password?" form (PAN-012c); those pages point to "any mmlabs app you use". Resend-verification was allowed for `admin` by org-admin-api USR-12: the gate's "Send the link again" button (PAN-010b) calls `resendVerification(accountId)` through `src/api/auth-client.ts`; the library maps 409 to `already_verified`; 403 `origin_not_allowed` (unverified non-staff account) shows neutral copy; the 429 countdown is a lower bound because the library clamps `retryAfter` to 900 s."
7. Run `pnpm format`, `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`.

**Rules:**
- R2/R3: the library is called only in `src/api/`, with no raw HTTP, no token and no header set by the UI.
- R4: the server's rate limit is mirrored, not invented.
- R5: no email, account id, token or request id goes to the console, URL or toasts. The request ID is shown inline only, as in `GateMessage`.
- R6: text only, no links built from data.
- R8: the tests listed above.
- R9 (spirit): one request per click, never optimistic, no automatic retry.
- R10: aria-disabled keeps focus; status and alert messages are announced.
- R11: n/a.

## Specialist input used
- **identity-access-engineer:** adopted.
  - F1 + R-a: a wrapper in `src/api` with outcomes as data, adapted to `not_allowed` + `AuthFailure`. A separate `{kind:'config'}` is reused from `AuthFailure`.
  - F2/F3: the outcome table.
  - F5: pass `accountId` explicitly.
  - R-b: the UI per outcome, absolute-time countdown, announce once at start and once at zero, `reload()` on 401.
  - R-c: copy, lightly edited.
  - R-d: ADR amendment and test list.
  - Open Q1 (local cooldown): chose no local cooldown, rely on the 429.
  - Q2 and Q3: settled by the orchestrator.
- **frontend-developer:** adopted.
  - A sibling component, a ref guard in `onClick`, aria-disabled, a stable label with the wait in helper text, no per-second announcements, shared busy with continue, reuse of the existing harness with an extra route.
  - Rejected: a 60 s cooldown after `sent` (R4, see above).
  - Rejected: `useMutation` (not needed. A direct call has no retry, as appsec asked).
  - Rejected: a zustand store for the cooldown (the component stays mounted; the API enforces the limit anyway).
  - Open Q1 is answered by the 409 finding.
- **appsec-engineer:** adopted.
  - Findings 1–6: no CSP change, neutral 403 copy that never says "not staff", the countdown treated as a lower bound.
  - One request per click, no retries, minimum 1 s, nothing persisted, `instanceof` only, the console-leak test.
  - Request ID: shown inline only, following the existing `GateMessage` pattern, as appsec allowed.
  - "React only after a 403" adopted: the page does not warn in advance.

## Assumptions
- `vi.stubEnv` plus a `globalThis.fetch` spy make the lazy `getAuthClient()` singleton reach the fake API in browser-mode tests. `auth-client.test.ts` already uses both techniques. If the singleton was created earlier in the same file with other env values, call the stubs before the first render, at the top of `setup`. The implementer records any deviation in impl-log.
- The library's `NetworkError` wraps a rejected `fetch` (`transport.ts:71`), so a handler that throws `TypeError` gives the `network` outcome.
- A 429 without a parseable wait: the library falls back to 5 s. If `retryAfter` is still undefined, the UI uses 60 s as the countdown default.
- Follow-ups (not in this diff, R7):
  - mmlabs-auth README:253 is stale ("admin cannot … resend").
  - Optionally, the library could expose that `retryAfter` was clamped, or raise the clamp for resend.
  - Stray file `src/features/auth/gate/__screenshots__/tmp.test.tsx/x-a-1.png`.
  - The per-IP limit (5/600 s) is shared behind a NAT.

## Blocking questions
None.

## Split proposal
None. Estimate: about 250 changed lines, one screen change, no new route.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| Any `_authenticated` route, gate state `email_unverified` (rendered in place, ADR 0003 D3) | None. Cookie class, before an `aud=admin` token exists. | idle; pending ("Sending…", aria-disabled); sent (status); already_verified (status, then continue); rate_limited (alert, aria-disabled, countdown, then re-enabled); not_allowed 403 (alert + request ID); config (alert + request ID); session_invalid (reload, then sign-in or picker); network (alert); unknown (alert) | "Send the link again" → `resendVerificationEmail(accountId)`; "I've verified, continue" → `recheck(true)` (existing) | None (no query cache involved; `already_verified` forces a token refresh) |
| `/verify-email` | Public | Copy change only on the invalid and expired panels | None new | None |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| POST (via `@mmlabs/auth-client` `resendVerification(accountId)`, cookie class: `credentials: 'include'`, `X-MM-App: admin`, set by the library) | `/api/v1/auth/verify-email/resend` | `{ account_id }` (`ResendVerificationRequest`) | 202, no body → `'sent'` (library type) | 409 `email_already_verified` → `'already_verified'`; 429 `rate_limited` (`retryAfter` ≤ 900 s); 403 `origin_not_allowed` → `not_allowed`; other 403 configuration codes → `config`; 401 `session_invalid` → reload; 422 → unknown; network/timeout → network | USR-12 (DONE, merged b87f200); USR-04b |
