## Attempt 1 — 2026-11-17
Verdict: REWORK

### Checks (run by reviewer)
- pnpm typecheck: clean (`tsc -b`, no errors)
- pnpm lint: clean (`eslint .`, no errors)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): 65 files, 436 tests passed. Same as impl-log.
- pnpm build: built OK
- pnpm e2e (if planned): not planned

### Acceptance criteria
- [x] The resend button calls only `@mmlabs/auth-client` `resendVerification()` (R3). Evidence: `src/api/auth-client.ts:114-127` is the only caller, and the feature imports `resendVerificationEmail` from `@/api` with no `fetch`. Lint passes. Tests: `auth-client.test.ts › resendVerificationEmail › sends POST /api/v1/auth/verify-email/resend {account_id} with credentials include and X-MM-App admin` and `access-pages.test.tsx › resend › click sends one POST for the shown account with X-MM-App admin`, both pass. The contract matches org-admin-api `app/modules/auth/router.py:295-300` (202, 401/403/409/422/429).
- [x] `sent` shows a neutral "check your email" message. Evidence: `resend › 202 announces the neutral sent message in the status region`.
- [x] `already_verified` refreshes the token and continues. Evidence: `resend › 409 email_already_verified refreshes the token and shows the app` (token count 2, "Protected: Home"). The library maps 409 to the return value (`mmlabs-auth/ts/src/client.ts:226-238`), and the API's only 409 is `email_already_verified` (`email_verification.py:147-148`).
- [ ] 409 and 429 show clear messages, and while rate-limited the button is disabled with a countdown. The behaviour is tested (`resend › 429 shows the wait, aria-disables the button with a countdown, ignores clicks, then re-enables`). However, the ticking countdown sits inside an atomic live region, so it is announced, not silent as the plan requires. The alert also goes stale. See Issues 1 and 2.
- [x] Tests cover each outcome: all 8 wrapper tests, 2 hook tests and 9 gate tests from the plan exist and pass. The verify-email regexes are updated.

### Issues
#### Issue 1 — 🔴 blocker — a11y / plan conformance (R10): the countdown and the new live regions are nested in an atomic live region
- **Where**: `src/features/auth/gate/access-pages.tsx:103-136`. `ResendVerification` (`resend-verification.tsx:109-134`) renders inside `<StatusPanel>`, and `src/features/auth/components/status-panel.tsx:14` puts `role='status'` on that wrapper. `role=status` implies `aria-live=polite` and `aria-atomic=true`.
- **Expected**: plan §Approach 3, "Live regions": "neither region sits inside another live or `aria-busy` container". Also "That text ticks but is not announced."
- **Actual**: the `<p id='resend-wait'>` countdown changes every second inside the panel's atomic polite region. Screen readers that honour atomic regions (NVDA/JAWS with Chrome) can re-read the whole panel every second during a wait of up to 900 s. That includes the heading, the paragraph with the user's email and the buttons. The inner `<p role='status'>` and `role='alert'` updates also get announced twice, or the alert gets read politely. The test helper `statusText` (`access-pages.test.tsx:138-140`) works around the nesting instead of catching it. impl-log lists this as a follow-up, but it is a plan requirement and this diff makes it worse by adding the ticking text.
- **Fix instruction**: in `EmailUnverifiedPage` (`access-pages.tsx`), keep only the title and the explanatory `<p>` inside `<StatusPanel>`. Close `</StatusPanel>` after that paragraph. Render the rest as a sibling inside `AccessLayout`, in `<div className='grid gap-2 text-sm'>…</div>`: `ResendVerification`, the page `alert`, the continue button, `AccountList`, `UseAnotherAccount` and `SignOutButton`. Wrap both in a fragment. Do not change `status-panel.tsx`; that is the follow-up below. Add a test to `access-pages.test.tsx › resend`: after a 429 (`retry-after: 1`), for the countdown `<p>` (`getByText(/You can send the link again in/)`), the `p[role="status"]` and the `role="alert"` element, `el.parentElement?.closest('[role="status"],[role="alert"],[aria-live]')` must be `null`.

#### Issue 2 — 🟡 should-fix — a11y: the rate-limit alert stays after the countdown ends (a11y-review findings 1 and 3)
- **Where**: `src/features/auth/gate/resend-verification.tsx:37-45` and `:64-70`.
- **Expected**: when the wait is over and the button is enabled again, no message still says "Try again in 1 s."
- **Actual**: the `role='alert'` "Too many requests. Try again in N s." stays on screen after the countdown reaches 0, next to the "You can send the link again." status. The two contradict each other (WCAG 3.3.1 / 4.1.3).
- **Fix instruction**: in the `wasWaiting` branch of the effect, also call `setAlert(null)`. Extend the 429 test so that, once `aria-disabled` is gone, it asserts `screen.getByText(/Too many requests/)` is not in the document.

### Rules R1–R11
- R1: n/a, no data fetching.
- R2/R3: OK. The library is called only from `src/api/auth-client.ts`, and the UI sets no headers or tokens. Nothing is persisted, and the countdown lives only in component state.
- R4: OK. The UI mirrors the API's 429 and adds no local cooldown. The 403 is handled.
- R5: OK. No logging, URL or toast changes. The test `resend › logs no email or token` covers this. The request ID is shown inline only.
- R6: OK. Text only.
- R7: OK. Every changed `src/` and `docs/` file is in the plan's file list, and there are no new dependencies. The other changes are `work/` files.
- R8: checks are green and the tests are present.
- R9 (spirit): OK. One request per click via the `inFlight` ref and shared `busy`, no optimism, no auto-retry.
- R10: violated, see Issue 1 (and Issue 2).
- R11: n/a.

### Security / a11y blockers
- security-review.md: none.
- a11y-review.md: no 🔴 items. Its 🟡 2 (nested live regions) is raised to 🔴 here as Issue 1, because the ticking countdown inside an implicit `aria-atomic` region breaks an explicit plan requirement. Its 🟡 1 and 3 are Issue 2.

### Nits (do not block)
- 💭 `access-pages.tsx:131`: the continue button's `Loader2` needs `aria-hidden`. It now also spins while a resend is pending, because `busy` is shared. Consider showing the spinner only for continue's own in-flight state.
- 💭 `use-countdown.ts:5-20`: `now` is from mount time, so the first render after `until` is set can overstate the wait for one frame (e.g. "11 min" on a page that has been open for 10 minutes). Optionally compute from `Date.now()` when `until` changes, or keep `[until, startedAt]` together.
- 💭 `resend-verification.tsx:124,131`: hard-coded `id='resend-wait'`. `useId()` would be safer if the component is ever rendered twice.
- 💭 `resend-verification.tsx:67-69`: with `retryAfter: 0` the alert says "a few minutes" but the countdown is 1 s.

### Follow-ups (out of scope)
- Remove `role='status'` from the `StatusPanel` wrapper (`status-panel.tsx:14`). It nests the live regions on the not-member, generic gate, verify-email and reset-password panels as well. Then check the announcements with NVDA/VoiceOver.
- mmlabs-auth: README line 253 ("admin cannot … resend-verification") is stale since org-admin-api USR-12.
- mmlabs-auth: optionally signal when `retryAfter` was clamped to 900 s, so the countdown is no longer only a lower bound for the 5/day limit.
- Stray file `src/features/auth/gate/__screenshots__/tmp.test.tsx/x-a-1.png`.
