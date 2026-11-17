# PAN-027 a11y review

## Attempt 1

WCAG 2.2 AA, by code reading. No axe, screen reader or test commands were run by the auditor (the e2e spec runs axe on the tab and the dialogs). **No 🔴 blockers**, 3 🟡 should-fix items, 3 💭 notes.

### Findings
1. 🟡 **Show/Hide toggle double-encodes its state (4.1.2; APG toggle button)** — `app-credential-issue-dialog.tsx:158-170`: `aria-pressed={shown}` plus a label that flips "Show"/"Hide", so a screen reader says "Hide, toggle button, pressed". Fix: a constant name ("Show credential") with `aria-pressed`, or drop `aria-pressed` and keep the changing label. Update the e2e locator `getByRole('button', { name: 'Show' })`.
2. 🟡 **Focus after a successful revoke is racy (2.4.3)** — `app-credentials-tab.tsx:288-294`, `:495-500`, `app-credential-revoke-dialog.tsx:538-542`, `queries.ts:148-151`. `invalidateQueries` is not awaited, so the Revoke button is still present when the dialog closes; Radix restores focus to it in a `setTimeout(0)` after the tab's effect has focused the heading; the refetch then removes the button and focus falls to `<body>`. Fix: give ConfirmDialog an `onCloseAutoFocus` prop (or handler) that calls `preventDefault()` for this dialog, as the issue dialog does (`:112-115`), or defer the effect. Test with a deliberately slow refetch; `app-credentials-tab.test.tsx:276` may pass only by timing; e2e has no focus assertion.
3. 🟡 **No focus fallback when the secret is cleared while the dialog is open (2.4.3)** — `app-credential-issue-dialog.tsx:54-61`, `:136-141`. On `pagehide` the Credential row (with the focused Copy button) unmounts and focus is lost in a non-dismissible dialog. Fix: when `secret === null && revealing`, focus "I've saved it" (ref) or the cleared-value message (`tabIndex={-1}`).

### 💭 Notes
- `app-credential-issue-dialog.tsx:125-128`: the `role=status` paragraph mounts with its text, so most screen readers will not announce it; title/description already announce. Optional: mount an empty status region earlier (as the Copy status at `:180` does).
- `:103-117` reveal phase: Escape, outside click and X blocked; "I've saved it" is the only exit. Acceptable under 2.1.2 (keyboard exit exists, reason stated). Initial focus on Copy (`:63-65`) is good. Optional `aria-describedby` to the "can't be shown again" alert.
- `:221`, `:231`: `aria-disabled` + `opacity-50` keeps focus; contrast and focus ring with `opacity-50` not measured.

### Works well
- Credential input has a `<Label htmlFor>`; the masked value is not the secret.
- Copy result announced via an always-mounted live region; failure message gives a manual route.
- Table: `aria-label`, `scope='col'`, sr-only Actions header, `<time dateTime>`.
- Revoke buttons named "Revoke <key_id>" (2.5.3 holds).
- Issue disabled for a disabled app with a linked reason (`aria-describedby`).
- Loading `role=status`, errors `role=alert`.
- Revoke is an AlertDialog naming the target; Credentials tab in the existing tablist.
- Issue-dialog close focus restored to the Issue button; heading `tabIndex={-1}`; `<h3>` under the sheet title.

### Not covered
Screen reader behaviour, 200%/400% zoom, forced-colors, token contrast. Check reflow (1.4.10) of the Input + Show + Copy row (`:144-179`) in `sm:max-w-lg` at narrow widths.

### Follow-up
E2E focus assertions after issue-close, revoke-cancel and revoke-success.
