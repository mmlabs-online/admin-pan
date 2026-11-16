# Review — PAN-010

## Attempt 1 — 2026-11-16
Verdict: PASS

Reviewed at HEAD 1537e25 (branch `claude/great-edison-3g2y0h`), base `origin/main`.

### Checks (run by reviewer)
- pnpm typecheck: `tsc -b`, exit 0, no errors
- pnpm lint: `eslint .`, exit 0, no output
- pnpm format:check: "All matched files use Prettier code style!", exit 0
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): Test Files 50 passed (50); Tests 345 passed (345). This matches impl-log.md.
- pnpm build: `✓ built`, exit 0
- `sha256sum -c vendor/SHA256SUMS`: `vendor/mmlabs-auth-client-0.1.0.tgz: OK`. The lockfile pins `integrity: sha512-3CIMh2nh…` with `tarball: file:vendor/…` (pnpm-lock.yaml:845-846).
- Docker image + `scripts/smoke-image.sh`: I did not reproduce these. The implementer ran them with a scratchpad Dockerfile that adds the sandbox CA. The committed Dockerfile change is small (`COPY vendor/` + `sha256sum -c` before `pnpm install --frozen-lockfile`), and `.dockerignore` does not exclude `vendor/`. CI's image job covers this step.
- pnpm e2e: not planned.

### Acceptance criteria
- [x] Sign-in posts through auth-client only; no password handling elsewhere (R3). Evidence:
  - `user-auth-form.test.tsx › posts email+password only via the auth client login` passes: exactly one POST `/api/v1/auth/login` carries the credentials, and no other request body contains the password.
  - `user-auth-form.tsx:76-95`: `mutationFn` calls `useAuth().login`, and `onSettled` resets the password field and the Turnstile widget.
  - `src/api/` has no login function. Lint keeps the core library inside `src/api` (`eslint.config.js` `no-restricted-imports`).
- [x] Token in memory only; reload restores the session through the device cookie. Evidence:
  - `auth-gate.test.tsx › restores the session on load from the device cookie` passes: a fresh client with only `mm_account_id` stored makes one accounts call and one token call, then renders the protected outlet.
  - `› never writes the token to localStorage, sessionStorage or document.cookie` passes.
  - `src/stores/auth-store.ts` is deleted.
  - Grepping non-test `src` for `localStorage|sessionStorage|accessToken` finds nothing.
  - `use-access-check.ts:41` only awaits `getToken` and never stores the result.
- [x] `not_member` and `email_unverified` errors have clear pages. Evidence:
  - `access-pages.test.tsx › not_member page …` passes: the heading is focused, the account email is shown, there is no join button, and "use another account" and "sign out" are offered.
  - `› email_unverified page is text only …` passes.
  - Implementation: `access-pages.tsx:44-115`.
- [x] Every authenticated route is behind the guard; redirect back after sign-in (no open redirect). Evidence:
  - `src/routes/_authenticated/route.tsx:5-11` wraps the layout in `AuthGate`. Every app route lives under `_authenticated/`; only `(auth)` and `(errors)` are outside it.
  - `auth-gate.test.tsx › signed-out redirects to /sign-in?redirect=%2Fusers%3Fx%3D1 (no hash); at "/" no redirect param` passes.
  - `› renders no protected child (and runs no query) until the token check passes` passes.
  - `user-auth-form.test.tsx › after login navigates to the validated redirect (and to "/" for //evil.com)` passes.
  - The `safe-redirect.test.ts` table passes.
  - `safe-redirect.ts` rejects backslashes and control characters, `//`, normalised `//` paths, other origins, auth pages and values over 2048 characters.
- [x] "Email not verified" page: text only (any mmlabs app, no app link), "I've verified, continue" refreshes with `forceRefresh:true`, switch account, sign out, no resend. Evidence:
  - `access-pages.tsx:96-104` has the text with no links. `gate/auth-gate.tsx:77` sets `onContinue={() => recheck(true)}`, and `use-access-check.ts:41` calls `getToken({ accountId, forceRefresh })`.
  - Tests pass: `› "I've verified, continue" forces a token refresh and shows the app on success`, `› still unverified after refresh shows an inline alert`, `› lists other accounts as "Continue as …" and "Use another account"`, and `› … no resend button, never calls /verify-email/resend` (every `a[href]` is a relative path).
- [x] Sign-in form has no "Forgot password?" link; one line of text says to reset from any mmlabs app. Evidence:
  - `user-auth-form.tsx:150-152`.
  - `user-auth-form.test.tsx › has no link to /forgot-password and shows the reset-from-any-mmlabs-app hint` passes.
  - Grepping `src/features/auth/sign-in` for `forgot-password` finds only the test name.
- [x] Tests for guard, error states and logout. Evidence:
  - `auth-gate.test.tsx` has 12 tests (loading, signed-out, restore, storage, no early child, picker, accounts error, 429, network, config, unauthorized signal + 60 s rejected, account switch clears the cache).
  - `sign-out-dialog.test.tsx` has 4 tests (account, all, cancel, server failure).
  - Also `nav-user.test.tsx`, the client bearer-transport block (`client.test.ts:224-318`), and the `errors`, `query-client` and `handle-server-error` tests.
  - All checks are green.

### Issues
None.

### Scope
Every changed file is in the plan's list except `src/features/auth/gate/use-return-to.ts`. That file is justified under "Out-of-plan files": it is a 9-line shared helper in the same folder.

Other changes in the diff:
- The `work/` files (consults, plan, orchestrator facts, PAN-010b and PAN-012c tickets, backlog rows) come from the orchestrator commits.
- The eslint constant refactor is inside a planned file.
- The new dependency is the planned vendored tarball, with no install scripts (impl-log §Library install).

### Rules R1–R11
No violations found.
- **R2:** HTTP still only goes through `src/api`. The Bearer transport is `fetchWithToken`, called only from `getApi()` (`src/api/index.ts:20-23`). `/api/v1/auth/*` skips it (`client.ts:44-46`). Lint restricts `useAccessToken` to `features/auth/gate`.
- **R3:** the token stays inside the library, and the auth pages are public.
- **R4:** a 403 never notifies the gate (test). The cache is cleared on every auth event (`main.tsx`, `clearOnAuthChange`).
- **R5:** no new env keys, and no email or token in toasts or URLs.
- **R6:** no HTML sinks; account emails render as text.
- **R9:** sign-out confirms and names the target or the account count. It is not optimistic, and a failure shows an error toast.
- **R10:** linked form errors, `role=alert`/`status`, focused page headings, `aria-disabled` while pending.
- **R11:** the template Billing, Upgrade and New Team items are removed.

### Security / a11y blockers
None. The orchestrator copies items from `security-review.md` / `a11y-review.md` if those reviews run.

### Nits (do not block)
- `use-access-check.ts:51-57`: on `session_invalid`, `account_changed` or `no_account_selected`, the state goes to `checking` and `reload()` runs. If the re-listed accounts give back the same `ready` + `accountId`, `evaluate` is not re-run (its dependencies do not change), so the spinner would stay. With the current library this seems unreachable: a token 401 means `/accounts` also 401s and the gate goes to signed-out. A follow-up `evaluate(false)` after `reload()` resolves would make it robust.
- `access-pages.test.tsx:75-84` proves a second `/token` call but not `forceRefresh: true`, because the first call failed and left no cached token. A case with a cached token would prove the force.
- `README.md` still says "The proxy hides that org-admin-api does not answer CORS on admin Bearer paths yet". ADM-012 made that stale; it is already in the follow-ups.
- `sign-out-dialog.tsx:30`: `accountId!` for `scope='account'`. All current callers render this only with a ready account, but a guard would be safer.

### Follow-ups (out of scope)
- PAN-010b (resend verification) and PAN-012c (retire `/forgot-password` and `forgotPassword()`, fix the PAN-012b copy), as in the plan.
- Spec §5.1 update to the owner's 2026-11-16 decisions: resend and the forgot link are no longer in PAN-010.
- Drop the Vite dev proxy and the stale "no CORS yet" README line now that ADM-012 is done.
- `requestId` on `ApiError`; CSP `require-trusted-types-for 'script'`; remaining template leftovers (team switcher).
- org-admin-api: an endpoint for the caller's effective admin permissions (PAN-011).
- The owner must confirm the tarball SHA-256 `f1303c17…08f2` against the `ts-v0.1.0` release page before merge (ticket note). Put it in the PR description.
