## Attempt 1

**Verdict: no blockers and no should-fix items.** Reviewed `git diff origin/main...HEAD -- src docs`. Outside those paths only `work/` changes; nginx, CSP, Docker, CI, dependencies and `.env*` are untouched.

### Checks (all hold)
- **R3:** `src/api/auth-client.ts:114-127` only calls `client.resendVerification(accountId)`. In the library this is a cookie-class `authFetch` (`dist/client.js:182-197`). There is no new HTTP code. A test checks `credentials: 'include'` and `X-MM-App: admin`, and that no other app key is sent.
- **Explicit `accountId`:** the button gets the `accountId` of the account shown on the page and renders only when it is present. The library's "current account" fallback is never used.
- **No retries or loops:**
  - A 429 sets one deadline (60 s fallback). Nothing is re-sent automatically.
  - `already_verified` triggers exactly one recheck.
  - `session_invalid`, `account_changed` and `no_account_selected` each trigger one `reload()`.
  - Double clicks are blocked by the `inFlight` ref plus a shared `busy` flag.
- **R5 (no sensitive data in logs or URLs):** no `console`, toast or URL changes, and a test asserts nothing is logged. The request ID appears only on screen, following the existing pattern.
- **Neutral copy:** the SENT text does not confirm the address's state, so there is no enumeration surface.
- **403:** `origin_not_allowed` maps to `not_allowed`, shown with neutral copy that never mentions roles. Other configuration errors map to `config`. Nothing reaches the error boundary.
- **CSP and R6:** CSP is unchanged. All output is rendered as text.

### Notes
- 💭 `resend-verification.tsx:11-12`: the 403 copy indirectly hints that the account has no admin role. Only the owner of the account sees it, and the wording was already approved, so no change is needed.
- 💭 `src/hooks/use-countdown.ts:5`: for one frame the remaining time can be overstated. This is cosmetic and errs on the safe side. Optionally compute it from `Date.now()` when `until` changes.
- 💭 The countdown is a lower bound because of the library's 900 s clamp. A click after the wait can still get a 429. This is driven by the user and is not a loop. ADR 0003 documents it.

### Follow-ups
- Line 253 of the `@mmlabs/auth-client` README is stale since org-admin-api USR-12. Fix it in the library repo.

## Attempt 2

**Verdict: no 🔴 blockers and no 🟡 should-fix items.** Reviewed `git diff HEAD~1 -- src`: 3 files, +17/−4. This rework changes only accessibility and copy; nothing security-relevant changed.

### Still holds
- **Library only (R3):** `src/features/auth/gate/resend-verification.tsx` has no new HTTP calls or imports. Resend still goes through `@mmlabs/auth-client` `resendVerification(accountId)` only.
- **No retries:**
  - A 429 now shows only the static text `'Too many requests.'` (`resend-verification.tsx:68`). The single deadline is unchanged and nothing re-sends automatically.
  - `setAlert(null)` (`:43`) only clears the alert. It does not send anything.
- **No sensitive data (R5):** no new `console`, toast, URL or storage use. The only change to shown text is that the 429 message no longer includes the retry-after value.
- **Layout change:** the controls moved out of `StatusPanel` into a plain `div` (`src/features/auth/gate/access-pages.tsx:110-139`). Each control's visibility condition is unchanged, there are no new XSS sinks, and content is still rendered as text (R6).
- **Tests:** `access-pages.test.tsx:187-215` only adds checks on live-region nesting and on clearing the alert.

### Note
- 💭 `formatRetryAfter` is no longer used at `resend-verification.tsx:68`. If nothing else in the file uses it, the import is dead and lint will flag it (R8). Not a security issue.

### Follow-ups
- Same as attempt 1: line 253 of the `@mmlabs/auth-client` README is stale.
