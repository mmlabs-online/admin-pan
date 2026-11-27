# Review — BUG-003

## Attempt 1 — 2026-11-27
Verdict: PASS

### Checks (run by reviewer, PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium)
- pnpm typecheck: pass (`tsc -b`, no errors)
- pnpm lint: pass (`eslint .`, no output)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test: Test Files 124 passed (124), Tests 1009 passed (1009). Matches impl-log.md.
- pnpm build: "built in 1.07s"
- pnpm e2e: not planned

### Regression evidence (ADR 0003), re-run by reviewer
Wrote `origin/main:src/features/auth/sign-in/components/user-auth-form.tsx` over the working copy and kept the branch's tests. Ran `pnpm vitest run --browser.headless src/features/auth/sign-in/components/user-auth-form.test.tsx`, then restored with `git checkout -- <file>`. `git status` was clean afterwards.
- `× one sign-in reaches the protected redirect target without bouncing to /sign-in (BUG-003)`: `Cannot find element with locator: page.getByText('Protected: Users')`. The gate bounced the user back to the form, which is the reported bug.
- The other five new tests also fail on base. The 8 existing tests pass. Total: `Tests 6 failed | 8 passed (14)`, which matches impl-log.md.
- With the fix, all 14 pass (they are part of the green full suite).

### Acceptance criteria
- [x] A regression test reproduces the bug, failing on `origin/main` and passing after. Evidence: `user-auth-form.test.tsx › UserAuthForm (behind AuthGate) › one sign-in reaches the protected redirect target without bouncing to /sign-in (BUG-003)`.
  - It uses the real `AuthProvider` via `renderWithAuth`, with the gated `_authenticated` layout, the real form on `/sign-in` and a deterministic 150 ms post-login accounts delay.
  - It asserts no `/sign-in` after `/users` and `count(LOGIN) === 1`.
  - Fail and pass shown above.
- [x] One successful sign-in opens the validated redirect target (or `/`), and the existing redirect, error, Turnstile and rate-limit behaviour is unchanged. Evidence:
  - The navigation in the effect uses `safeRedirect(redirectTo)` (`user-auth-form.tsx:104-112`).
  - The existing tests for validated redirect, `//evil.com`, invalid_credentials, Turnstile, rate_limited, network and validation pass with unchanged assertions.
  - Companion tests 2–6 cover busy and double-click, signed-out after login, accounts error, needs-account and account switch.
  - `auth-gate.tsx` and the vendored library are untouched.
- [x] All checks pass (R8). See Checks.

### Deviations judged
- **Derived `sessionError` instead of setState in the effect.** Accepted. It is forced by `react-hooks/set-state-in-effect` and has the same visible behaviour, which test 3 proves. One side effect: the "signed-out after login" state is now live. If a later reload (another tab) turns the status `ready` while `signedIn` is still true, the form navigates. That is harmless and arguably better than the plan's "not live" assumption.
- **Turnstile test's `ok` login handler now sets `api.state.accounts`.** Accepted.
  - The default fake login does exactly this (`src/test-utils/auth.tsx:83-85`). The custom handler was a less faithful fake that created no session.
  - Under the fix the form correctly reads the post-login state. Without a session it would show the new alert instead of navigating, which is correct behaviour.
  - The test's assertions (widget reveal, token sent, navigation) are unchanged, so it still guards Turnstile behaviour.
- **`postLogin` applied only after login, and `tokens[tokens.length - 1]` instead of `.at(-1)`.** Accepted. These are test-harness corrections and do not weaken the tests.
- **Scope.** Changes are limited to the 3 planned source files plus ticket and backlog bookkeeping. No new dependencies. `renderWithAuth`'s new `signInPage` prop is optional and backward compatible, and all other users of the helper pass.

### Issues
None.

### Rules R1–R11
No violations found.
- R3: only `useAuth()` `login` / `reload` / `status` are used, and no token is handled.
- R5: the alert copy is generic and contains no email (asserted in test 3).
- R6: no HTML sinks, and `href` comes only from `safeRedirect`.
- R7: in scope.
- R10: `aria-busy` and `role=alert` are kept.

Library check: `reload()` in `@mmlabs/auth-client/react` catches internally and never rejects (`dist/react/index.js:22-40`), so login errors still reach `onError`/`messageFor` unchanged.

### Security / a11y blockers
None (orchestrator to copy from security-review.md / a11y-review.md if produced).

### Nits (do not block)
- `user-auth-form.tsx`: `navigated` is never reset. That is fine because the form unmounts on navigation. A one-line comment would make the intent clearer.
- `user-auth-form.test.tsx:138`: `let t` with a `prefer-const` disable is a little awkward. Reading `t` lazily through a getter or passing `api` into the handler would avoid the directive.
- Local, git-ignored `__screenshots__/` directories come from failed runs (including the reviewer's base run). They are not in the diff.

### Follow-ups (out of scope)
- `@mmlabs/auth-client`: `AuthProvider.login` should await `reload()` (or return a settled snapshot) before resolving. That would remove the extra listing and this bug class in other mmlabs apps.
- Exclude TanStack Query devtools from production builds if they are ever added, because `mutation.variables` holds the password while the form is mounted (from plan).
