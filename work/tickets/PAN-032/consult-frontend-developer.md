## PAN-032 consult (frontend-developer, read-only)

### Findings
- Current form (src/features/auth/sign-in/components/user-auth-form.tsx:184-191): `<Button disabled={busy || (needsTurnstile && !turnstileToken)} aria-busy={busy}>` with a Loader2 icon and no live region. Native `disabled` drops focus to body, which is the BUG-003 finding. `onSubmit` already has `if (busy) return`, and `mutation.mutate` runs only after that guard. The single-login guarantee therefore does not depend on `disabled`.
- Existing repo pattern (reuse it, do not invent a new one):
  - verify-email-panel.tsx:101-120: `<p role='status' className='sr-only'>{pending ? 'Verifying…' : ''}</p>` placed before the button, plus `aria-disabled={pending || undefined}` and `className='aria-disabled:cursor-not-allowed aria-disabled:opacity-50'`. Solo-log 2026-11-15 also removed `aria-busy` from around the status region.
  - Same pattern in access-pages.tsx:126-131, resend-verification.tsx:110-126 and confirm-dialog.tsx:72-98. confirm-dialog adds `onClick` with `e.preventDefault()` while loading.
- shadcn Button (src/components/ui/button.tsx:7) styles only `disabled:pointer-events-none disabled:opacity-50`. It has no `aria-disabled:` variant, so aria-disabled gets no dimming or cursor change and still receives pointer events. Repo convention is to add `aria-disabled:cursor-not-allowed aria-disabled:opacity-50` at the call site. Do not edit components/ui (CLAUDE.md says to edit it only for bug fixes).
- Test patterns exist:
  - Focus: `await expect.element(btn).toHaveFocus()` and `toHaveAttribute('aria-disabled','true')` (verify-email.test.tsx:140-156, access-pages.test.tsx:201-202, 270-271).
  - Status text: `screen.getByRole('status').element()` then `toHaveTextContent('Verifying…')`.
  - Clicking an aria-disabled button: Playwright's `userEvent.click` waits for "enabled" and fails on aria-disabled. confirm-dialog.test.tsx:89-91 calls `(el as HTMLElement).click()` instead. The sign-in test at user-auth-form.test.tsx:282 uses `userEvent.click(t.submit, { force: true })`, which may still work; otherwise use the native `.click()`.
- Existing test at user-auth-form.test.tsx:277-285 asserts `toBeDisabled()`. It must change to `aria-disabled="true"` plus `not.toBeDisabled()`. This is a required edit and the AC "tests unchanged" should be read as "behaviour unchanged".

### Recommendations
1. (AC1) Make the button `aria-disabled={busy || undefined}` and keep the Turnstile gating as aria-disabled too: `const blocked = busy || (needsTurnstile && !turnstileToken)`. Add `aria-disabled:cursor-not-allowed aria-disabled:opacity-50`. Keep `type='submit'` (the default). aria-disabled does not block submit, so the guard must be in code.
   - Single-login guarantee: keep `if (busy) return` in `onSubmit`. Also guard the Turnstile case there: `if (needsTurnstile && !turnstileToken) return`. That case was previously blocked by native disabled and must stay blocked. Previously Enter in a field also could not submit while busy, so the guard covers that too.
   - Better still, use a ref guard (`inFlight`, as verify-email does), because `busy` is derived from state and two submits in the same tick could both see `busy=false`. `mutation.isPending` flips after the next render. This is optional but cheap. Also add `onClick={(e) => blocked && e.preventDefault()}` as in confirm-dialog.
   - If handleSubmit's validation runs and the guard then returns, no extra effects occur. Check that an ignored submit during busy does not trigger validation messages that reset the form. It should not, since the fields are filled.
2. (AC3) Add `<p role='status' className='sr-only'>{busy ? 'Signing in…' : ''}</p>` rendered unconditionally, before the button. Do NOT wrap it in `aria-busy`. Set `aria-hidden` on the Loader2. Remove `aria-busy` from the button, or keep it. The existing test asserts it, and the solo-log removed `aria-busy` only around the status region, so keeping it on the button is acceptable. Keep the sign-in test as is unless the plan drops it.
   - Do not put the text inside the button, because that changes the accessible name `Sign in`, which tests match with `/^Sign in$/`.
   - `busy` stays true until navigation (signedIn && !sessionError), so the announcement covers the whole session start.
3. (AC2) Focus after failure:
   - With aria-disabled, focus never leaves the button, so for retries after errors no action is needed. Add a test that proves it.
   - `form.resetField('password')` in onSettled does not move focus. Case: the user clicked the button, so the button keeps focus and is the right retry target (Enter or Space).
   - Case: the user pressed Enter in the password field, so focus is in the field. It also stays there and is fine.
   - Do not add programmatic focus moves unless a test shows focus is lost. One exception to check: Turnstile appears on `turnstile_required`. It mounts after the error, and focus remains on the button. The button is aria-disabled until the token arrives. Verify the widget's reset does not steal focus.
   - If the role='alert' error is announced, the focus stays on the button. Optionally link the error with `aria-describedby` on the button (as confirm-dialog does) via an id. That is optional and nice.
4. (AC5) Tests to add or change in user-auth-form.test.tsx (browser mode, gatedSetup and setup helpers):
   - Busy: click submit, then `toHaveAttribute('aria-disabled','true')`, `not.toBeDisabled()`, `toHaveFocus()`, and `getByRole('status')` has text `Signing in…`. A second activation via `{force:true}` click or the native `.click()` plus keyboard `{Enter}` gives exactly one `LOGIN` call (`t.api.count(LOGIN)`). The BUG-003 test at line 277 should be updated this way.
   - Status is empty before submit, and the status node exists before the busy state (get it before clicking).
   - After errors (invalid_credentials 401, 429 rate limit, and the signed-out "Could not start your session" case at line 287): `toHaveFocus()` on the button after the alert appears, `not.toHaveAttribute('aria-disabled')`, status empty. Then retry with the keyboard: `userEvent.keyboard('{Enter}')` while the button has focus issues a second login (count 2).
   - Turnstile: with `turnstile_required` and no token the button is aria-disabled and Enter submits nothing (count unchanged). Existing turnstile test at ~line 255 uses a plain click on it; it may need the native click once the button is aria-disabled.
   - Spinner: assert the svg has `aria-hidden="true"`.
   - Use `toHaveFocus()` with `expect.element` (retrying). Do not read `document.activeElement` once. To make the focus assertion meaningful, click via `userEvent.click` (which focuses the button) rather than `.click()`.

### Risks
- aria-disabled does not block submit or Enter. Any path that skips the in-code guard (ref or busy check, and the Turnstile check) re-opens BUG-003's double login or a Turnstile-less submit. The `busy` state alone is the weakest guard (see 1).
- Visual: forgetting the `aria-disabled:` classes leaves the busy button looking enabled (no dimming, hover styles still apply, since Button has only `disabled:` styles).
- The existing disabled-state test and the Turnstile test have to change from `toBeDisabled()`/plain click to aria-disabled assertions. A reviewer can mistake that for weakened tests; note it in impl-log.
- `role='status'` rendered inside a form that remounts would not announce. The form is not remounted, but keep the node unconditional.
- Duplicate announcements: the role='alert' error and the status text are separate nodes and never show simultaneously, since the status empties when busy ends.

### Open questions
- Should `aria-busy` stay on the button (existing test depends on it) or go? Recommendation: keep, since only the region wrapper was the problem.
- Is it acceptable to add the optional `aria-describedby` linking the error to the button? Not required by the ACs.
- AC2 wording "a sensible form field": the plan can state that the button is the retry target (no programmatic focus), unless the owner wants focus on the password field after invalid credentials (it was cleared by resetField). Moving focus there would be a bigger behaviour change and needs the owner's decision.

Files: /home/user/admin-pan/src/features/auth/sign-in/components/user-auth-form.tsx, /home/user/admin-pan/src/features/auth/sign-in/components/user-auth-form.test.tsx, /home/user/admin-pan/src/features/auth/verify-email/components/verify-email-panel.tsx, /home/user/admin-pan/src/features/auth/verify-email/verify-email.test.tsx, /home/user/admin-pan/src/components/confirm-dialog.tsx, /home/user/admin-pan/src/components/confirm-dialog.test.tsx, /home/user/admin-pan/src/components/ui/button.tsx
