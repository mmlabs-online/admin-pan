Status: READY

# Plan — PAN-032: Sign-in form: keep focus while busy and announce "Signing in…"

## Spec summary
- `docs/spec-v1.md` §5.1: "Login page using `@mmlabs/auth-client` (app key `admin`); account picker / switch and logout; the `aud=admin` token is kept in memory and refreshed by the library."
- `docs/spec-v1.md` §6: "WCAG 2.2 AA (rule R10)."
- Source findings: `work/tickets/BUG-003/a11y-review.md`, Attempt 1:
  - 🟡 1: focus drops to `<body>` because the button is natively `disabled` (2.4.3, 3.2.2). The suggested fix is "use `aria-disabled={busy || undefined}` and keep the early return in `onSubmit`".
  - 🟡 2: "Signing in" is not announced (4.1.3). The suggested fix is an always-rendered `role='status'` sr-only node with `{busy ? 'Signing in…' : ''}`, plus an `aria-hidden` spinner.
- Scope limit (ticket notes): only the sign-in form. The same pattern on reset-password and verify-email is out of scope.

BUG-003 is `DONE` in `work/backlog.md:51`, and its fix (`await reload()` and the `signedIn`/`sessionError` state) is already in `src/features/auth/sign-in/components/user-auth-form.tsx`. The dependency is met.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | While sign-in is in progress the button keeps keyboard focus (`aria-disabled`, not native `disabled`); a second activation starts no second login | `user-auth-form.test.tsx` › "keeps focus on the aria-disabled button while busy; a second click or Enter does not log in again (BUG-003)" (updated test from line 277). It asserts `aria-disabled="true"`, `not.toBeDisabled()`, `toHaveFocus()` and `aria-busy="true"`, then sends a forced/native second click plus `{Enter}` on the button. `t.api.count(LOGIN) === 1` after navigation. Also "Enter in the password field while busy submits nothing and shows no validation message". Code check: the native `disabled` prop is gone from the submit button. |
| 2 | After a failed attempt (wrong credentials, rate limit, Turnstile, "Could not start your session") focus is on the button, not `<body>`, and the form can be retried from the keyboard | New tests: "invalid_credentials: focus stays on the button and Enter retries", "rate_limited: focus stays on the button", "turnstile_required: focus stays on the aria-disabled button; Enter submits nothing until a token arrives", and "session error: focus stays on the button; Enter retries" (gated). Each one asserts `toHaveFocus()` on the button after the alert appears. Each retry test checks that the `LOGIN` count rises by exactly 1 after `{Enter}`. |
| 3 | A polite `role="status"` region, present before the state changes, says "Signing in…" while busy and is empty otherwise; spinner `aria-hidden` | New test "status region exists empty before submit, says Signing in… while busy, empties after an error". It gets the node before the click and checks text `''`, then `Signing in…`, then `''` after the 401 alert. Test "spinner is aria-hidden while busy" checks for `svg[aria-hidden="true"]` inside the button. |
| 4 | Existing sign-in behaviour and tests (redirect, errors, Turnstile, BUG-003 regression) unchanged | Behaviour stays the same. Every existing test in `user-auth-form.test.tsx` still passes. Only the `toBeDisabled()`/`toBeEnabled()` assertions change to the aria-disabled equivalents: lines 157, 159, 280 and 300. The BUG-003 regression test "one sign-in reaches the protected redirect target without bouncing to /sign-in (BUG-003)" (line 264) stays untouched. Each assertion change is listed in impl-log. `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` are green (R8). |
| 5 | Vitest browser-mode tests cover focus during and after busy and the status text | The tests in rows 1–3 live in `src/features/auth/sign-in/components/user-auth-form.test.tsx` and run under `pnpm test` (browser mode, Chromium). |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/auth/sign-in/components/user-auth-form.tsx` | Replace native `disabled` with `aria-disabled` and the call-site `aria-disabled:` classes. Add the `inFlight` ref guard and the Turnstile guard, with an early return in the `<form onSubmit>` before `handleSubmit`. Add the always-rendered `role='status'` sr-only node. Make the spinner `aria-hidden`. Keep `aria-busy` on the button. | AC1, AC2, AC3 |
| `src/features/auth/sign-in/components/user-auth-form.test.tsx` | Update 4 assertions (lines 157, 159, 280, 300) from native-disabled to aria-disabled. Add the new focus, status and guard tests. | AC4, AC5 |

No other files. `src/components/ui/button.tsx` is not edited: CLAUDE.md says edit `components/ui` only to fix bugs, and the repo convention puts the `aria-disabled:` classes at the call site. No ADR is needed because the pattern already exists in the repo (verify-email-panel, access-pages, resend-verification, confirm-dialog).

## Tests to write
All tests go in `src/features/auth/sign-in/components/user-auth-form.test.tsx` and run in Vitest browser mode. This is not a bug ticket, so no fail-first regression test is required. The existing BUG-003 regression test must keep passing unchanged.

| Test (file › name) | Covers |
|---|---|
| `UserAuthForm (behind AuthGate)` › "keeps focus on the aria-disabled button while busy; a second click or Enter does not log in again (BUG-003)". This replaces the test at line 277. Steps: `signIn()` (uses `userEvent.click`, which focuses the button). Then assert `aria-disabled="true"`, `not.toBeDisabled()`, `aria-busy="true"` and `toHaveFocus()`. Then `userEvent.click(t.submit, { force: true })` (if Playwright still refuses, use `(t.submit.element() as HTMLElement).click()` as in confirm-dialog.test.tsx:89-91), then `userEvent.keyboard('{Enter}')`. Wait for `Protected: Users` and check `count(LOGIN) === 1`. | AC1, BUG-003 single-login guarantee |
| `UserAuthForm (behind AuthGate)` › "Enter in the password field while busy submits nothing and shows no validation message". Steps: fill the fields, then `userEvent.click(t.password)` + `{Enter}` to submit. While busy, press `{Enter}` again in the password field. Assert `count(LOGIN) === 1` after navigation, and that "Please enter your password." never appears before navigation. Note that `onSettled` clears the password, so an unguarded `handleSubmit` would show that message. | AC1 (form-level guard) |
| `UserAuthForm (behind AuthGate)` › "status region exists empty before submit, says Signing in… while busy". Get the status locator before any action and assert empty text. After `signIn()`, assert `Signing in…`. After navigation, it is gone with the form. | AC3 |
| `UserAuthForm` › "invalid_credentials: focus stays on the button, status empties, Enter retries". Steps: the login handler is a 401 for the first call and 401 again for the second. Assert the alert appears, the button `toHaveFocus()`, `not.toHaveAttribute('aria-disabled')`, and the status text is `''`. Then `userEvent.fill(t.password, PASSWORD)` (this moves focus) and `userEvent.click(t.submit)`. Also test `{Enter}` with focus on the button straight after the first failure: refill the password via `fill`, refocus with `t.submit.element().focus()`, press `{Enter}`, and check `count(LOGIN) === 2`. | AC2, AC3 |
| `UserAuthForm` › "rate_limited: focus stays on the button after the alert" | AC2 |
| `UserAuthForm` › "turnstile_required: focus stays on the aria-disabled button; Enter submits nothing until a token arrives". Reuses the existing Turnstile stub setup. After the alert, assert `toHaveFocus()` and `aria-disabled="true"`. Refill the password, refocus the button, press `{Enter}`, and check that `count(LOGIN)` is still 1. Call `opts.callback('ts-token')`, then assert `not.toHaveAttribute('aria-disabled')`. | AC1 (Turnstile gating kept), AC2 |
| `UserAuthForm (behind AuthGate)` › "session error: focus stays on the button; Enter retries". Uses `postLogin: () => envelope(401,'session_invalid')`. After the alert, assert `toHaveFocus()`, no `aria-disabled`, and an empty status. Then `fill(password)`, refocus the button, press `{Enter}`, and check `count(LOGIN) === 2`. | AC2 ("Could not start your session") |
| `UserAuthForm (behind AuthGate)` › "spinner is aria-hidden while busy". After `signIn()`, assert `t.submit.element().querySelector('svg')` has `aria-hidden="true"`. | AC3 |
| Existing turnstile test (line 126): `toBeDisabled()` becomes `toHaveAttribute('aria-disabled','true')`, and `toBeEnabled()` becomes `not.toHaveAttribute('aria-disabled')`. Existing session-error test (line 300): keep `toBeEnabled()` and add `not.toHaveAttribute('aria-disabled')`. | AC4 |

Focus assertions use the retrying `await expect.element(x).toHaveFocus()`, never a one-off `document.activeElement` read. If `getByRole('status')` matches more than one node in `renderWithAuth` (for example a toaster), scope it with `t.screen.getByRole('status').filter({ hasText: ... })` or a query from the form element, and record the choice in impl-log.

## Approach
1. **Button (AC1).** Compute `const turnstileMissing = needsTurnstile && !turnstileToken` and `const blocked = busy || turnstileMissing`. On `<Button>`:
   - remove `disabled`
   - set `aria-disabled={blocked || undefined}`
   - keep `aria-busy={busy}` (see the owner decision below)
   - set `className='mt-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50'`
   - keep the default `type='submit'`

   Add a comment in the style of verify-email-panel.tsx:109-111 explaining why `aria-disabled` is used.
2. **Single-login guarantee (BUG-003, AC1).** `aria-disabled` does not stop a submit, so code has to block it:
   - Add `const inFlight = useRef(false)`.
   - In `<form onSubmit>`, run `if (inFlight.current || busy || turnstileMissing) { e.preventDefault(); return }` before calling `form.handleSubmit(onSubmit)(e)`. This also stops validation from re-running while busy, when `onSettled` has already cleared the password.
   - In `onSubmit`, keep `if (busy) return` and add `if (inFlight.current) return`. Then set `inFlight.current = true` before `setSignedIn(false)` and `mutation.mutate(...)`.
   - Reset `inFlight.current = false` in the mutation's `onError`. Also reset it in a `useEffect` when `sessionError` becomes true. Do not reset it on success: the form stays busy until navigation unmounts it, so the ref is the guard that does not depend on a re-render (the same-tick double-submit window from the consult, rec. 1).
   - Keep the `turnstileMissing` guard. Native `disabled` used to block a submit without a token, and this keeps that behaviour.
3. **Status region (AC3).** Directly before `<Button>`, render `<p role='status' className='sr-only'>{busy ? 'Signing in…' : ''}</p>` unconditionally, the same as verify-email-panel.tsx:101-103. Do not wrap it in `aria-busy`, per solo-log 2026-11-15. Do not change the button text, so the accessible name stays "Sign in". Put `aria-hidden='true'` on the `Loader2` and on the `LogIn` icon too, because both are decorative.
4. **Focus after failure (AC2).** Do not move focus in code. The button is never natively disabled, so it keeps focus through the login, `reload()`, `onSettled` (`resetField('password')`, `turnstile.reset()`) and the error render. If a test shows focus leaving the button (for example when the Turnstile widget mounts), stop. Record it in impl-log and only then add a narrow fix: `useEffect` on the error or `sessionError` state that focuses the button through a ref, and only when `document.activeElement === document.body`.
5. Run `pnpm format`, then all five checks.

Rules:
- R10: this is the purpose of the ticket.
- R3: login still goes only through `useAuth().login`, and the password never reaches anything new.
- R7: other auth forms are untouched, and `components/ui` is untouched.
- R8: all checks green, with tests per AC.
- R1, R2, R4, R5, R6, R9, R11: no impact (no API, permission or data-rendering change).

## Specialist input used
`consult-frontend-developer.md`:
- **Adopted, rec. 1:** `aria-disabled` with the call-site `aria-disabled:` classes, the Turnstile guard in code, and the `inFlight` ref guard. Why: it is the existing repo pattern and gives a stronger single-login guarantee.
- **Adapted, rec. 1:** the `onClick` preventDefault becomes a form-level early return instead. Why: one guard covers both click and Enter-in-field, and it skips `handleSubmit` validation while the password is cleared. The consult's own check ("ignored submit must not trigger validation messages") is not true after `onSettled` clears the password, so this matters.
- **Adopted, rec. 2:** the unconditional sr-only `role='status'` before the button, no text inside the button, `aria-hidden` spinner, and `aria-busy` kept.
- **Adopted, rec. 3:** no programmatic focus move. Tests prove focus stays on the button. The fallback is defined in Approach step 4.
- **Adopted, rec. 4:** the test list, including the required change to the assertion at line 280 and the Turnstile assertions.
- **Not adopted:** the optional `aria-describedby` from button to error. Why: it is not in the ACs (R7). The `role='alert'` is already announced (BUG-003 a11y 💭 3). It is recorded below for the owner.
- **Risks noted:** the visual `aria-disabled:` classes, test changes that might look like weakened tests (impl-log must list them), and keeping the status node unconditional.

## Assumptions
- **Needs owner's decision** (safe defaults chosen; the plan does not wait on them):
  1. **`aria-busy` on the button: kept.** The existing test asserts it, and solo-log 2026-11-15 removed it only around a status region. The owner may drop it later, since the new status region now does the announcing.
  2. **`aria-describedby` linking the error alert to the button: not added.** It is not required, and the alert is already announced. confirm-dialog.tsx:99 shows the pattern if the owner wants it.
  3. **Focus after an error: stays on the Sign in button,** with no programmatic move. After invalid credentials the password field is empty, so a user who presses Enter on the button gets the existing "Please enter your password." validation message linked to the field. Moving focus to the password field automatically would be a larger behaviour change, and the owner would have to ask for it.
- The Turnstile widget does not take focus when it mounts or resets. The Turnstile test checks this only with the mocked loader. Real-widget behaviour is checked by the PAN-023 e2e/axe follow-up from the BUG-003 a11y review.
- lucide icons may already render `aria-hidden` by default. The explicit attribute is set anyway so the test does not depend on the library version.
- Follow-ups (not in this diff, R7):
  - the same aria-disabled and status pattern on reset-password and other auth forms (BUG-003 a11y follow-up)
  - BUG-003 a11y 💭 5, the possible stuck `loading` state with no timeout
  - an axe/Playwright check of `/sign-in` busy and error states once PAN-023 lands

## Blocking questions
None.

## Split proposal
None. About 40 changed lines in the component and about 150 in tests.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/sign-in` (public, R3) | none (pre-auth) | **busy:** button aria-disabled and focused, status says "Signing in…", spinner hidden from assistive tech. **error:** `role='alert'` message unchanged, button focused and enabled, status empty. **Turnstile pending:** button aria-disabled and focused. **happy:** navigate to the safe redirect (unchanged). 403/empty do not apply. | Sign in (click, or Enter on the button or a field) → `useAuth().login` then `reload()` (unchanged). Ignored while `inFlight`, busy or the Turnstile token is missing. | None (unchanged) |

## API calls used
None. There is no API call change: `POST /api/v1/auth/login` and the post-login accounts listing still go through `@mmlabs/auth-client` exactly as before.
