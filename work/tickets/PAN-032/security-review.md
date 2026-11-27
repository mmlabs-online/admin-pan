# PAN-032 — security review

## Attempt 1

## Security review: PAN-032, attempt 1 (read-only)

Scope: `git diff origin/main...HEAD -- src/`, which touches `src/features/auth/sign-in/components/user-auth-form.tsx` and its test file. I checked it against the constraints in `work/tickets/BUG-003/consult-appsec-engineer.md`. I also read `src/components/turnstile.tsx` and `src/features/auth/sign-in/index.tsx`. `pnpm typecheck` and `pnpm lint` pass, and `pnpm test src/features/auth/sign-in` passes (21/21). I did not run format:check or build.

### Do the BUG-003 constraints still hold?
- **No double login: holds.**
  - **Click and Enter:** the button is no longer natively `disabled`, so a click or an Enter in a field now fires a real `submit`. The form handler stops it with `preventDefault` when `inFlight.current || blocked` (user-auth-form.tsx:142-148).
  - **Same-tick submits:** two submits can both pass the outer check before React re-renders. Validation (`zodResolver`) is async, so both calls then reach `onSubmit`. The first sets `inFlight.current = true` synchronously (:128-129), so the second returns early.
  - **When the guard resets:** on `onError` (:94) and on `sessionError` (:123-125). It is not reset on success, which is correct because the page navigates away and the form unmounts.
  - **Not affected:** `reload()` never throws, so a failure after login cannot leave the guard stuck.
- **No submit without a required Turnstile token: holds, but only one check enforces it now** (see the 🟡 finding below). `Turnstile.reset()` and the expired/error callbacks set the token back to `null` (turnstile.tsx:28, :48-51), so `turnstileMissing` stays accurate.
- **Password still cleared: holds.** `form.resetField('password')` and `turnstile.current?.reset()` are still in `onSettled` (:100-104). The password is not copied into the new ref or any new state.
- **Redirect only through `safeRedirect`: holds.** The navigation effect is unchanged (:109-115) and still navigates once, to `href: safeRedirect(redirectTo)`.
- **No PII in logs, URLs or storage: holds.** The diff adds no `console.*`, Web Storage, URL markers or toasts. The new live region (:200-202) only says the fixed text "Signing in…". Tests use the fake credentials from the shared test utilities.

### Findings

🟡 **1. `onSubmit` itself no longer checks for a missing Turnstile token.** Evidence: `src/features/auth/sign-in/components/user-auth-form.tsx:127-129` and `:143`.
- **What changed:** before this diff, a native `disabled` button blocked submission when a required token was missing. Now the only check is the `blocked` value in the form's `onSubmit` handler. That value is computed at render time, so a handler from an earlier render could still use it after the token becomes `null` (the Turnstile reset in `onSettled`, or the expired callback). The window is tiny.
- **Impact:** low. The API enforces Turnstile and would answer `turnstile_required` again. It is still worth fixing, because BUG-003 asked for a guard at the top of `onSubmit` and not to rely on the button state alone.
- **Fix:** `if (busy || turnstileMissing || inFlight.current) return` at :128.

🟡 **2. The Turnstile regression test can pass even if the bug comes back.** Evidence: `src/features/auth/sign-in/components/user-auth-form.test.tsx`, the new test `turnstile_required: … Enter submits nothing until a token arrives`.
- **Problem:** `expect(t.api.count(LOGIN)).toBe(1)` runs right after `userEvent.keyboard('{Enter}')`. Validation is async, so a wrongly allowed submit would send its request after the assertion has already passed. The count is never checked again.
- **Fix:** repeat `expect(t.api.count(LOGIN)).toBe(1)` after `await vi.waitFor(() => expect(opts.callback).toBeDefined())`, which runs later. Better still, end the test by submitting with the token and asserting the count goes to exactly 2.
- **Not affected:** the busy-state tests wait for "Protected: Users" before counting, so they are not exposed to this.

💭 **3. A caller's `onSubmit` could replace the guard.** Evidence: `user-auth-form.tsx:54` and `:150`.
- **Problem:** `{...props}` is spread after `onSubmit` on the `<form>`, so an `onSubmit` passed by a caller would replace the double-submit and Turnstile checks.
- **Impact:** none today. The only caller (`src/features/auth/sign-in/index.tsx:26`) passes only `redirectTo`. The pattern was already there before this diff.
- **Fix:** hardening only. Type the props as `Omit<React.HTMLAttributes<HTMLFormElement>, 'onSubmit'>`, or spread `props` before `onSubmit`.

### Follow-ups (out of scope)
- None new. The BUG-003 follow-ups still stand: `@mmlabs/auth-client` login should resolve after the provider state is updated, and TanStack Query devtools must stay out of production builds.

Summary: no 🔴 blockers. The BUG-003 security constraints (single login, Turnstile, password cleared, safeRedirect, no PII) still hold. Two 🟡 should-fix: add `turnstileMissing` to the `onSubmit` early return, and recheck the login count later in the Turnstile Enter test.

## Attempt 2

## Security review: PAN-032, attempt 2 (read-only)

**Scope:** I reviewed `git diff HEAD~1 -- src/` (commit 0386d0a) and the current `src/features/auth/sign-in/components/user-auth-form.tsx`.

**Checks:** `pnpm typecheck` and `pnpm lint` pass. `pnpm test src/features/auth/sign-in` passes 21/21. I did not run `format:check` or `build`.

### Attempt-1 findings
- **🟡1 is fixed.** `user-auth-form.tsx:128` is now `if (busy || inFlight.current || turnstileMissing) return`. `turnstileMissing` is defined at :120 as `needsTurnstile && !turnstileToken`, before `onSubmit`. This is the fix I asked for. The `<form>` handler check at :143 (`inFlight.current || blocked`) is unchanged.
- **🟡2 is fixed.** In `user-auth-form.test.tsx:213-221`, the login count is now checked again at three points:
  - after `vi.waitFor(() => opts.callback)` (:216);
  - after the token arrives and `aria-disabled` clears (:219);
  - at the end, where the test submits with the token and waits for the count to reach exactly 2 (:220-221).

  A submit that is wrongly allowed but arrives late would now very likely be caught. The test also proves that Enter works once a token is present.

### Regressions
None found. The BUG-003 constraints still hold:
- **Single login:** `inFlight` is set at :129 and reset only at :94 (`onError`) and :124 (`sessionError`).
- **Password cleared and Turnstile reset:** both still happen in `onSettled`.
- **Redirect:** still only through `safeRedirect`.
- **Logs, storage and URLs:** the diff adds no logging, storage or URL changes.

### New findings
None at 🔴 or 🟡.

💭 Two notes, neither blocking:
- **The new guard reads a value from render time, like the outer check.** `turnstileMissing` in `onSubmit` comes from the render that created the `handleSubmit(onSubmit)` closure, the same as `blocked` at :143. The check is now in `onSubmit` as BUG-003 asked, but the small window after a token reset or expiry is still possible in theory. The API still rejects that submit with `turnstile_required`, so impact is nil. If you want a check that is never out of date, keep the token in a ref and read that at :128. Optional hardening.
- **The final count check (:221) can still pass if an extra submit lands at the wrong moment.** It waits for exactly 2, so it could pass while the count is briefly 2 before rising to 3. The earlier checks at :216 and :219 make this unlikely. Optional: after the `waitFor`, add one more short wait, then check the count is still 2.

💭3 from attempt 1 (a caller's `onSubmit` overriding the form handler through `{...props}`) is unchanged. It was already there before this ticket and is hardening only.

### Follow-ups
None new.

**Summary:** both 🟡 items from attempt 1 are fixed (guard at user-auth-form.tsx:128; extra count checks at user-auth-form.test.tsx:216/219/221), with no regressions and no 🔴 or 🟡 findings, so security PASS.
