# Implementation log — PAN-032

## Attempt 1

### Touched files
- `src/features/auth/sign-in/components/user-auth-form.tsx`
- `src/features/auth/sign-in/components/user-auth-form.test.tsx`

No out-of-plan files.

### Changes
- Button: native `disabled` removed; `aria-disabled={blocked || undefined}` plus call-site `aria-disabled:` classes; `aria-busy` kept.
- `inFlight` ref guard (set in `onSubmit`, reset in mutation `onError` and when `sessionError` becomes true); form-level early return in `onSubmit` when `inFlight`, busy or Turnstile token missing.
- Always-rendered `<p role='status' className='sr-only'>` with `Signing in…` while busy. Spinner and LogIn icons `aria-hidden`.
- No programmatic focus move was needed (tests show focus stays on the button).

### Changed existing assertions
- turnstile test: `toBeDisabled()` -> `toHaveAttribute('aria-disabled','true')`; `toBeEnabled()` -> `not.toHaveAttribute('aria-disabled')`.
- session-error test: kept `toBeEnabled()`, added `not.toHaveAttribute('aria-disabled')`.
- Old "keeps the button disabled and aria-busy..." test replaced by the focus/aria-disabled test. Its `not.toBeDisabled()` (planned) was replaced by `not.toHaveAttribute('disabled')` because vitest-browser's `toBeDisabled` treats `aria-disabled` as disabled. The second click uses native `element().click()` (as in confirm-dialog.test.tsx) instead of `userEvent.click(force)`.

### Tests added
Focus/aria-disabled while busy; Enter in password while busy; status region text; spinner aria-hidden; session error focus + Enter retry; invalid_credentials focus + Enter retry; rate_limited focus; turnstile_required focus + Enter gated. The status region is found with `getByRole('status')` (single match in these setups).

### Checks
- pnpm typecheck: ok; pnpm lint: ok; pnpm format:check: ok; pnpm build: ok
- pnpm test (full): 124 files, 1016 tests passed (after fixing one assertion mid-attempt, see above).

### Follow-ups
As in plan.md (other auth forms, axe e2e after PAN-023).
