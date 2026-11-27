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
