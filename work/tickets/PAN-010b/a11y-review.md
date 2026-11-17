## Attempt 1

A11y review of PAN-010b, attempt 1. Code review only: I did not run axe or a screen reader.

**Verdict:** no 🔴 blockers. Findings 1 and 3 are small and should be fixed in this attempt if the ticket allows. Finding 2 can be a follow-up.

### 🟡 1. Stale rate-limit alert after the countdown ends
- **Where:** `src/features/auth/gate/resend-verification.tsx:37-45`.
- **Problem:** when the countdown reaches 0, the alert still reads "Try again in 30s" even though the button is enabled again (3.3.1, 4.1.3).
- **Fix:** call `setAlert(null)` in the `wasWaiting` branch.

### 🟡 2. Nested live regions
- **Where:** `src/features/auth/components/status-panel.tsx:14` puts `role='status'` on the wrapper. Inside it sit `<p role='status'>` (`resend-verification.tsx:109`), the alerts (`resend-verification.tsx:113`, `access-pages.tsx:119`) and the buttons.
- **Problem:** screen readers may announce the same message twice, or read an alert politely (4.1.3).
- **Fix:** make the wrapper a plain `div`; the focused heading already announces the title. This is the root cause, but it can be a follow-up.

### 🟡 3. Alert and countdown disagree
- **Where:** `resend-verification.tsx:67` and `:131`.
- **Problem:** the alert shows a frozen "Try again in X" while the countdown paragraph keeps ticking (3.3.1).
- **Fix:** make the alert static ("Too many requests.") and let the countdown carry the time.

### 💭 Notes
- **Announcements (keep as is).**
  - The status region is always mounted and is not updated on every tick.
  - The countdown text is not a live region and is linked with `aria-describedby`.
  - The re-enable is announced once.
  - "Sending…" followed by the result re-announces on each click.
- **Button name and focus.**
  - The button name stays the same, and the spinner is `aria-hidden`.
  - `aria-disabled` keeps focus on the button, and the click guard is in JS.
  - `access-pages.tsx:131`: the Continue `Loader2` needs an explicit `aria-hidden`.
  - The Continue pending state is not announced. This was already the case before this change.
- **Contrast:** the destructive and muted tokens are about 4.7:1 or better. The `opacity-50` on the inactive control is exempt.
- **Keyboard and copy:** only native buttons are used, with no keyboard traps. The copy is plain, and NOT_ALLOWED tells the user how to recover.

### Follow-ups
- Change the role on the `StatusPanel` wrapper.
- Run axe through Playwright on the gate route (PAN-023).
- After the `StatusPanel` fix, verify the announcements with NVDA or VoiceOver.
