## Attempt 1

A11y review of PAN-010 attempt 1 against WCAG 2.2 AA. Method: I read the diff and the components it uses. I did not run axe or Playwright and did not test with a screen reader.

**Result: no 🔴 blockers. 4 🟡 should-fix and several 💭.** Contrast is fine: muted-foreground is about #64748b (4.7:1 on white), and destructive is about 4.8:1 on white and also passes in dark mode.

### 🟡 1. The whole StatusPanel is a live region (4.1.2 / 4.1.3)
- **Where:** `src/features/auth/components/status-panel.tsx:127`. The panel is used by the account picker, not-member, email-unverified and GateMessage screens.
- **Problem:** `role='status'` wraps the heading, paragraphs, buttons, the link and a nested `role='alert'`.
  - The heading also takes focus on mount, so a screen reader announces the title twice or reads out the whole panel.
  - An alert nested inside a status region (`access-pages.tsx:418`) is announced unreliably, or twice.
  - Interactive content does not belong in a live region.
- **Fix:** drop `role='status'` from the container and let the focused heading do the announcing. Use `<section aria-labelledby={id}>` with `<h2 id tabIndex={-1}>`. Keep `role='alert'` only on the inline error paragraphs.

### 🟡 2. The Sign in button is `disabled` while it has focus (2.4.3, 3.3.1)
- **Where:** `src/features/auth/sign-in/components/user-auth-form.tsx:161`.
- **Problem:** when Turnstile first appears (after `turnstile_required`), the button stays disabled until a token arrives. It is also disabled during `isPending`.
  - If the button was activated by click or Space, focus drops to `<body>` and keyboard users lose their place.
  - The only explanation is the alert text; the button itself gives no reason for being disabled.
- **Fix:** use the pattern already in `access-pages.tsx:426`. Put `aria-disabled` on the button, and have `onSubmit` ignore the submit while there is no token or the request is pending. When the token is missing, put the error "Complete the verification, then sign in again." in the alert.
- **Optional:** nothing moves focus when Turnstile appears. That is acceptable, but you could wrap the widget in a `role='group'` with `aria-label='Verification'`.

### 🟡 3. The profile dropdown trigger is named only by initials (4.1.2, 2.4.6)
- **Where:** `src/components/profile-dropdown.tsx:28-31`.
- **Problem:** the trigger's accessible name comes only from the avatar initials.
- **Fix:** add `aria-label='Account menu'` to the trigger, or sr-only text such as "Account menu for {label}". Put `aria-hidden` on the avatar.

### 🟡 4. Focus is lost after an account switch or pick (2.4.3)
- **Where:** `src/components/layout/nav-user.tsx:131-134` and `src/features/auth/gate/account-picker.tsx:278`.
- **Problem:**
  - `selectAccount()` moves the gate into loading/checking. The layout unmounts and the BootSpinner takes its place, so focus ends up on `<body>`.
  - When the next screen renders, nothing takes focus.
- **Fix:**
  - When the gate goes from checking back to ok after a switch, move focus to `<main>` or the page `h1` (`tabIndex={-1}`). This belongs in `ReadyGate`.
  - While switching, have the BootSpinner announce "Switching account…".
  - After a successful sign-in followed by navigation, check that the new page title is announced.

### 💭 5. Account switch is not a radio group
- **Where:** `nav-user.tsx:125-142`.
- **Problem:** the switch options are plain items, so the current account is not exposed as checked. The plan used a `DropdownMenuRadioGroup`. This is not a WCAG failure.
- **Fix:**
  - Either use a `DropdownMenuRadioGroup value={accountId}`, or align the plan with what was built.
  - Put `aria-hidden` on the AvatarFallback in the sidebar trigger (`nav-user.tsx:101`).

### 💭 6. Pending states are not announced (4.1.3)
- **Where:** `user-auth-form.tsx:162-170`, `access-pages.tsx:430` and `sign-out-dialog.tsx:53`.
- **Problem:** `aria-busy` on a button is not conveyed by assistive technology.
- **Fix:**
  - Add a visually hidden `role='status'` that announces "Signing in…", "Checking…" or "Signing out…".
  - In the sign-out dialog, use `aria-disabled` instead of `disabled`.

### 💭 7. The sign-out failure toast auto-dismisses
- **Where:** `sign-out-dialog.tsx:32`.
- **Problem:** "The session may still be active" disappears after about 4 seconds, while the page is navigating away.
- **Fix:** give the toast a longer duration or a close button.

### 💭 8. Smaller notes
- Drop the password placeholder `********`.
- The credential alert is not linked to the fields. That is acceptable under 3.3.1.
- The `⌘S` / `⇧⌘Q` shortcut hints in `profile-dropdown` are inherited from the template and probably do nothing. Remove them if they aren't wired up.
- On the BootSpinner, `role=status` together with `aria-live=polite` is redundant but harmless.

### What's working well
- `aria-disabled` on "I've verified, continue".
- The heading takes focus when the gate state changes.
- Inline errors use `role='alert'`.
- `h1` is in AuthLayout and the panels use `h2`.
- Fields have linked labels and correct `autoComplete` values.
- The destructive confirmation names the target email.
- The Turnstile failure states have a retry control.

### Follow-ups
- Add axe-core coverage once the PAN-023 e2e tests exist.
- Check by hand where focus returns after sign-out from the dropdown.
- Add a route-change announcement in the authenticated layout.
