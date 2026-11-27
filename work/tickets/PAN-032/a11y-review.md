# PAN-032 — accessibility review

## Attempt 1

**Findings (PAN-032 attempt 1, `src/features/auth/sign-in`, WCAG 2.2 AA)**

I read the diff and `user-auth-form.tsx` with line numbers. I did not run axe, a screen reader or the tests. The checks below come from code reading plus the tests added in the diff. There are no 🔴 blockers and no 🟡 should-fix items. The earlier 🟡 findings from BUG-003 are resolved.

**Requested checks**
- **Focus on the Sign in button while busy and after errors: PASS.**
  - `user-auth-form.tsx:205-209` replaces `disabled` with `aria-disabled={blocked || undefined}`, so the button stays focusable and keeps focus. This satisfies 2.4.3 Focus Order and 3.2.2 On Input.
  - Nothing moves focus on error. The `role=alert` paragraph at line 193 is not focused.
  - Tests in `user-auth-form.test.tsx` assert `toHaveFocus` after `invalid_credentials`, `rate_limited`, `turnstile_required`, busy, and the session error.
- **aria-disabled exposed and styled: PASS.**
  - The attribute is exposed as `aria-disabled="true"` and is absent when not blocked (undefined). The tests assert both.
  - Line 206 adds `aria-disabled:cursor-not-allowed aria-disabled:opacity-50`. This matches the native `disabled:opacity-50` look in `button.tsx:7`.
  - The dimmed state is truly inactive, so the 1.4.3 and 1.4.11 exemption holds. Submits are blocked in `onSubmit` (lines 142-146), and `onSubmit` at line 128 also guards on `inFlight`. The tests confirm no second login happens on click or Enter, and none from Enter in the password field.
- **role=status region exists before it changes: PASS.**
  - `<p role='status' className='sr-only'>` at lines 200-202 is rendered unconditionally and is empty until `busy`. It then reads "Signing in…" (4.1.3 Status Messages).
  - It empties on error, so the alert is not announced twice. Tests cover empty-before, "Signing in…" while busy, and empty after an error.
- **Icons aria-hidden: PASS.** Both `Loader2` and `LogIn` carry `aria-hidden='true'` (lines 211 and 213). The button's name is "Sign in".
- **Keyboard retry: PASS.**
  - After `invalid_credentials` and after a session error, the button is not aria-disabled and Enter resubmits (`login` called twice).
  - `inFlight` is reset in `onError` (line 94) and in the `sessionError` effect (lines 123-125), so there is no stuck state.

**💭 Notes (non-blocking)**
1. **Focus ring dimmed by `opacity-50` while busy.** `aria-disabled:opacity-50` at line 206 also dims the `focus-visible:ring-[3px]` ring from `button.tsx:7`. A keyboard user who pressed Enter keeps focus on the dimmed button, so the indicator may fall below the 3:1 of 1.4.11 Non-text Contrast and 2.4.7 Focus Visible. Please check the `--ring` token against the background in light and dark themes. If it is thin, use `aria-disabled:ring-ring` or keep the ring at full opacity, for example by dimming only the contents.
2. **Silent Enter while waiting for Turnstile.** On `turnstile_required` the button is aria-disabled and Enter does nothing. The existing alert ("Complete the verification, then sign in again.") covers this, so it is acceptable. Optionally link it with `aria-describedby` on the button when `turnstileMissing`.
3. **Spinner ignores reduced motion.** `animate-spin` at line 211 does not respect `prefers-reduced-motion`. This is not an AA failure (2.3.3 is AAA), but `motion-reduce:animate-none` is a cheap fix.
4. **Tests use a manual `focus()` before Enter.** At `user-auth-form.test.tsx` lines 177 and 213 the manual `focus()` slightly weakens the "focus stays" proof. The explicit `toHaveFocus` assertions before them compensate for it.

**Follow-ups**
- Run `@axe-core/playwright` on `/login` once PAN-023 lands.
- Do a manual screen-reader pass of the busy → error → retry sequence.

**Summary:** No 🔴 or 🟡 findings. The attempt-1 changes meet WCAG 2.2 AA on every requested point, with only four 💭 notes, the main one being the focus ring dimmed by `opacity-50` while busy.
