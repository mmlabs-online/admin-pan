Status: READY

# Plan — PAN-010: Sign-in with @mmlabs/auth-client, account switch, logout and route guard

## Spec summary
`docs/spec-v1.md` §5.1 (Sign-in and app shell):

> "Login page using `@mmlabs/auth-client` (app key `admin`); account picker / switch and logout; the `aud=admin` token is kept in memory and refreshed by the library. Shell with navigation filtered by permission, signed-in user, and a clear page for 403 and for "email not verified" / "not a member"."
> "API: `POST /api/v1/auth/login`, `/auth/token`, accounts, logout — org-admin-api USR-03, USR-03b. Admin endpoints require `aud=admin` — ADM-002."
> "Resending the verification email needs a signed-in session and belongs with sign-in (PAN-010)."

CLAUDE.md R3: "Auth through `@mmlabs/auth-client` only … The `aud=admin` access token lives in memory only … the only persisted value is the library's `mm_account_id`. Every route except `/login` (and auth flows like verify-email / reset-password) is behind the auth guard."

**Scope decisions from the owner (ticket notes, 2026-11-16). They override the spec lines above where they differ:**
- Resend verification moves to **PAN-010b**, because org-admin-api ADM-002d refuses `verify-email/resend` with `X-MM-App: admin` (`orchestrator-facts.md` §3).
- The "Forgot password?" link is removed from the sign-in form. The `/forgot-password` page and the PAN-012b copy go to **PAN-012c**.
- The unverified page and the reset hint are text only ("any mmlabs app you use"), with no link to another app.
- There is no mock sign-in. Signing in always needs a real or local org-admin-api. Screen data stays on mock data.
- **Not in this ticket:** "navigation filtered by permission" (PAN-011) and the 403 screen states (per-screen tickets).
- The spec text still says resend is in PAN-010. I flag this conflict and record a spec update as a follow-up. The owner's decision governs.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Sign-in posts through auth-client only; no password handling elsewhere (R3) | `user-auth-form.test.tsx › posts email+password only via the auth client login (POST /api/v1/auth/login)`. The fake identity API sees exactly one `/login` call with the credentials, and no other request carries the password. Grep: no file outside `node_modules` sends `/auth/login`. `src/api/` has no login function. The form clears the password field after every attempt. |
| 2 | Token in memory only; reload restores the session through the device cookie | `auth-gate.test.tsx › restores the session on load from the device cookie (accounts + token), no sign-in form`. A fresh `AuthClient` whose storage holds only `mm_account_id`, plus the fake API, renders the protected outlet. `auth-gate.test.tsx › never writes the token to localStorage, sessionStorage or document.cookie`: after login and a token check, `localStorage` keys ⊆ {`mm_account_id`, existing UI-pref keys}, `sessionStorage` is empty, and no cookie contains the token. `src/stores/auth-store.ts` is deleted; `grep -r accessToken src/` returns no state field. |
| 3 | `not_member` and `email_unverified` errors have clear pages | `access-pages.test.tsx › not_member shows "No access to the admin app" with use-another-account and sign-out, no join button`. `access-pages.test.tsx › email_unverified shows "Verify your email address" text-only page`. The heading takes focus (StatusPanel pattern). |
| 4 | Every authenticated route is behind the guard; redirect back after sign-in (no open redirect) | `auth-gate.test.tsx › signed-out visitor of /users?x=1#h is sent to /sign-in?redirect=%2Fusers%3Fx%3D1 (no hash)`. `auth-gate.test.tsx › renders no protected child (and runs no query) until the token check passes`. `user-auth-form.test.tsx › after login navigates to the validated redirect`. `safe-redirect.test.ts` table: `//evil.com`, `/\evil.com`, `/\t/evil.com`, `https://evil.com`, `javascript:alert(1)`, `/sign-in?redirect=…`, a value with a hash, an over-long value, non-string → `/`. Structural check: `src/routes/_authenticated/route.tsx` renders `AuthGate`, and every app route lives under `_authenticated/`. |
| 5 | "Email not verified" page: text-only explanation (any mmlabs app, no app link), "I've verified, continue" (`getToken({forceRefresh:true})`), switch account, sign out; no resend | `access-pages.test.tsx › "I've verified, continue" forces a token refresh and shows the app on success`. The fake API sees `/token` again, so the cached token was not reused. `… › still unverified shows an inline alert`. `… › offers other accounts / use another account and sign out`. `… › has no resend button and never calls /verify-email/resend`. `… › has no link to another app`: no `<a>` with an external href. |
| 6 | Sign-in form has no "Forgot password?" link to `/forgot-password`; one line of text says to reset the password from any mmlabs app | `user-auth-form.test.tsx › has no link to /forgot-password and shows the reset-from-any-mmlabs-app hint`. |
| 7 | Tests for guard, error states and logout | All of the tests in "Tests to write" pass. `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` are green (R8). `sha256sum -c vendor/SHA256SUMS` passes. |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `vendor/mmlabs-auth-client-0.1.0.tgz` | **Create.** Copy it byte for byte from `/tmp/claude-0/-home-user/ce8daed7-26f0-593f-9bf8-a95df9f28817/scratchpad/mmauth/mmlabs-auth-client-0.1.0.tgz`. Never build it from `/home/user/mmlabs-auth`. | The library is installed only from the release artifact. |
| `vendor/SHA256SUMS` | **Create.** One line: `f1303c170f5e2799f1d6cecd8c4684cf1ab20c8ef84d441bd75002f46b6108f2  vendor/mmlabs-auth-client-0.1.0.tgz` | Supply-chain check in CI and Docker. |
| `package.json`, `pnpm-lock.yaml` | Run `pnpm add ./vendor/mmlabs-auth-client-0.1.0.tgz`. This adds the dependency `"@mmlabs/auth-client": "file:vendor/mmlabs-auth-client-0.1.0.tgz"`, and the lockfile entry must have `resolution.integrity`. Do not add the package to `onlyBuiltDependencies`. | Adds the library. |
| `Dockerfile` | Copy `vendor/` and run `sha256sum -c vendor/SHA256SUMS` **before** `pnpm install --frozen-lockfile`. | Otherwise the image build fails or skips the checksum check. |
| `.github/workflows/ci.yml` | `check` job: add a step `sha256sum -c vendor/SHA256SUMS` before `pnpm install --frozen-lockfile`. | The tarball is checked on every PR. |
| `eslint.config.js` | Add `no-restricted-imports` entries (see Approach §6), and an override for `src/test-utils/**` and `src/features/auth/gate/**`. | Enforces R2/R3: only `src/api` uses the core client, and `useAccessToken`, which exposes `fetchWithToken`, is used only by the gate. |
| `src/api/auth-client.ts` | **Create.** `getAuthClient()` is a lazy singleton. Also `createAdminAuthClient(overrides)`, `authTimeoutFetch`, `authFailure(e): AuthFailure`, and type re-exports (`Account`). | The one auth client lives in `src/api` (R2/R3). It gives one typed classification of library errors. |
| `src/api/client.ts` | Add a `bearerFetch?: (req: Request) => Promise<Response>` option. `timedFetch` sends `/api/v1/auth/*` through `fetchImpl` and everything else through `bearerFetch ?? fetchImpl`. Remove the token attachment from `onRequest`. In `onError`, read the epoch before deleting it, and call `notifyUnauthorized` for the gate-relevant auth codes. | Bearer transport through the library (decision D1). |
| `src/api/auth-hooks.ts` | Remove `setAccessTokenProvider` and `getAccessToken`. Keep `setUnauthorizedHandler`, `currentAuthEpoch` and `notifyUnauthorized`. | No second token path. The token stays inside the library. |
| `src/api/errors.ts` | Add `ApiErrorKind` `'auth'`. `errorFromFetchFailure` maps library errors: `NetworkError` → `network`; `ConfigurationError` → `config` (keeps `code`); any other `AuthError` → `auth` (keeps `status` and `code`, plus `retryAfter` for `RateLimitedError`). The message is fixed text. | Today an `AuthError` becomes `kind:'network'`, which is retried 3× and toasted (architect F3). |
| `src/api/index.ts` | Export `getAuthClient`, `authFailure`, `type AuthFailure`, `type Account`. Pass `bearerFetch: (r) => getAuthClient().fetchWithToken(r)` in `getApi()`. Drop the `setAccessTokenProvider` export. | Wiring. |
| `src/api/client.test.ts`, `src/api/auth-hooks.test.ts`, `src/api/errors.test.ts` | Update for the removed provider. Add the new cases listed in "Tests to write". | R8. |
| `src/api/auth-client.test.ts` | **Create.** | R8 (client options, timeout fetch, error classification). |
| `src/lib/safe-redirect.ts` (+ `.test.ts`) | **Create.** `safeRedirect(raw: unknown): string` | AC4: no open redirect. One helper used both where the value is produced and where it is consumed. |
| `src/lib/query-client.ts` (+ test) | Add `clearOnAuthChange(queryClient, subscribe)`, which cancels and then clears the cache on every auth event. `shouldRetryQuery` must not retry `kind:'auth'`; this already holds through `isTransient`, so add a test only. | Prevents cross-account data leaks (R4). |
| `src/lib/handle-server-error.ts` (+ test) | For `kind:'auth'`: `rate_limited` shows the toast "Too many requests. Try again in X."; every other auth code is silent, because the gate shows the state. | Avoids `mmlabs-auth: …` toasts. |
| `src/stores/session-recheck-store.ts` | **Create.** A tiny zustand store `{ generation: number; request(): void }`. | Bridge from the API client's final 401 to the gate, without navigation in `main.tsx`. |
| `src/main.tsx` | Build the auth client with `getAuthClient()` inside a try. On a config error, render a static "missing API configuration" message. Wrap `<AuthProvider client>` inside `QueryClientProvider` and outside `RouterProvider`. Call `clearOnAuthChange(queryClient, (l) => auth.onChange(l))`. Set `setUnauthorizedHandler(() => useSessionRecheck.getState().request())`. Remove the auth-store, the `setAccessTokenProvider` call and the `redirect` building. | Wiring. The ticket note "drop the hash from the 401 redirect" is resolved because the redirect is now built only in the gate, without the hash. |
| `src/features/auth/gate/auth-gate.tsx` | **Create.** The component gate (Approach §3). | AC2, AC3, AC4. |
| `src/features/auth/gate/use-access-check.ts` | **Create.** Token check state machine. It never stores the token. | AC2, AC3, AC5. |
| `src/features/auth/gate/access-pages.tsx` | **Create.** `NotMemberPage`, `EmailUnverifiedPage`, `GateMessage` (rate-limited, network, config, rejected, accounts-error), `BootSpinner`. | AC3, AC5. |
| `src/features/auth/gate/account-picker.tsx` | **Create.** `AccountList` ("Continue as …" buttons, optional `exclude`), "Use another account" link, "Sign out of all accounts". | Account picker / switch (§5.1). |
| `src/routes/_authenticated/route.tsx` | `component: () => <AuthGate><AuthenticatedLayout /></AuthGate>` | AC4 guard. |
| `src/routes/(auth)/sign-in.tsx` | Search schema becomes `redirect: z.string().max(2048).optional().catch(undefined)`. | AC4. |
| `src/features/auth/sign-in/index.tsx` | Description copy only if needed. Still passes `redirect` to the form. | — |
| `src/features/auth/sign-in/components/user-auth-form.tsx` | Rewrite on `useAuth().login` (Approach §4). | AC1, AC6. |
| `src/features/auth/sign-in/components/user-auth-form.test.tsx` | Rewrite against the fake identity API. Delete the `useAuthStore` and `sleep` mocks. | AC1, AC4, AC6. |
| `src/components/sign-out-dialog.tsx` (+ test) | Rewrite: `scope: 'account' \| 'all'`. Uses `useAuth()`, confirmation names the target, not optimistic (Approach §5). | Logout (R9). |
| `src/components/layout/nav-user.tsx` (+ create `nav-user.test.tsx`) | Reads the current account from `useAuth()`. Menu: account label, "Switch account" items for the other accounts, "Use another account", Settings → `/settings/account`, "Sign out", "Sign out of all accounts". Drops the template items "Upgrade to Pro", "Billing" and "Notifications". | Account switch and logout. The menu is rewritten here anyway, and Billing conflicts with R11. |
| `src/components/profile-dropdown.tsx` | Show the current account (not "Admin (mock)"). Items: Settings, "Sign out", "Sign out of all accounts". Drop "Billing" and "New Team". | Removes the mock identity. The 9 pages that use it stay untouched. |
| `src/components/layout/app-sidebar.tsx`, `src/components/layout/data/sidebar-data.ts`, `src/components/layout/types.ts` | Remove the mock `user` and the `NavUser` `user` prop. | No mock identity left. |
| `src/stores/auth-store.ts`, `src/stores/auth-store.test.ts`, `src/stores/__screenshots__/auth-store.test.ts/*` | **Delete.** | A token in zustand would be a second source of truth and against R3. typecheck then catches every old caller. |
| `src/test-utils/auth.tsx` | **Create.** Fake identity API, `createTestAuthClient`, `memoryStorage`, `renderWithAuth` (Approach §8). | Test helpers that mock at the network layer, not the library module. |
| `docs/adr/0003-auth-client-integration.md` | **Create** (Approach §9). | Decisions that outlive the ticket. |
| `docs/adr/0001-api-client.md` | Status line becomes "Accepted; auth seam amended by ADR 0003". | Traceability. |
| `README.md` | Quick start: remove "sign in with any email + 7-char password (mock)". Sign-in now needs a local or real org-admin-api, with the origin registered and a verified account granted admin. Remove "Real sign-in arrives with PAN-010". | Docs match behaviour. |
| `.env.example` | Comment change: an empty `VITE_API_BASE_URL` no longer gives a usable app, because sign-in needs the API. Screen data is still mock. | Docs match behaviour (R5 keys unchanged). |

No new routes, so `src/routeTree.gen.ts` does not change. Do not touch `src/api/public-auth.ts`, the forgot-password feature, the verify-email feature, `vite.config.ts` or the nginx config (R7; see Follow-ups).

## Tests to write
All tests run in Vitest browser mode. The identity API is mocked at the network layer: a real `AuthClient` from `createAuthClient` with injected `fetch`, `storage` and `broadcast:false`. Never `vi.mock('@mmlabs/auth-client')`.

| Test (file › name) | Covers |
|---|---|
| `src/lib/safe-redirect.test.ts › table of rejected inputs → "/"` (`//evil.com`, `/\evil.com`, `/\t/evil.com`, `https://evil.com`, `javascript:alert(1)`, `evil`, `''`, non-string, length > 2048, control chars) | AC4 |
| `safe-redirect.test.ts › keeps pathname+search, drops hash` (`/users?q=1#x` → `/users?q=1`) | AC4, ticket note |
| `safe-redirect.test.ts › auth pages fall back to "/"` (`/sign-in?redirect=/x`, `/forgot-password`, `/reset-password`, `/verify-email`) | AC4 (no loop) |
| `src/api/auth-client.test.ts › createAdminAuthClient uses apiBaseUrl() as baseUrl and apiOrigins, appKey from VITE_APP_KEY` (stub env) | R3 |
| `auth-client.test.ts › authTimeoutFetch aborts a hung string-URL request after the timeout and passes Request inputs through unchanged` | Library calls cannot hang; Bearer writes keep their 30 s |
| `auth-client.test.ts › authFailure classifies each library error` (session_invalid, not_member, email_unverified, rate_limited+retryAfter, invalid_credentials, turnstile_required/failed, validation, network, config+requestId, account_changed, no_account_selected, unknown) | Error mapping |
| `src/api/errors.test.ts › maps AuthError to kind auth (code, status, retryAfter); NetworkError → network; ConfigurationError → config` | Architect F3 |
| `src/api/client.test.ts › admin paths go through bearerFetch and get Authorization: Bearer from a real AuthClient` | D1 |
| `client.test.ts › /api/v1/auth/* never goes through bearerFetch and never carries Authorization` | R3 |
| `client.test.ts › GET 401 → library refreshes the token once and retries; success does not notify unauthorized` | Refresh by the library |
| `client.test.ts › 401 twice → unauthorized handler fires once` | Final 401 → gate |
| `client.test.ts › 403 does not notify unauthorized` | R4 |
| `client.test.ts › getToken rejecting with not_member / email_unverified / session_invalid → ApiError kind auth and notifies unauthorized once` | Gate re-check |
| `client.test.ts › rate_limited from getToken → kind auth with retryAfter, no notify` | 429 |
| Existing `client.test.ts` cases (credentials omit, no X-MM-App, timeout, envelope, …) kept, provider-based cases rewritten | Regression |
| `src/lib/query-client.test.ts › shouldRetryQuery does not retry kind auth` and `› clearOnAuthChange cancels and clears the cache on an auth event` | No retry storm; R4 |
| `src/lib/handle-server-error.test.ts › auth rate_limited toasts the wait; other auth codes are silent` | UX |
| `src/features/auth/gate/auth-gate.test.tsx › loading shows "Restoring your session…" status and no protected child` | Guard |
| `auth-gate.test.tsx › signed-out (accounts 401 session_invalid) redirects to /sign-in?redirect=<path+search, no hash>; at "/" no redirect param` | AC4 |
| `auth-gate.test.tsx › restores the session on load from the device cookie (accounts + token), no sign-in form` | AC2 |
| `auth-gate.test.tsx › never writes the token to localStorage, sessionStorage or document.cookie` | AC2, R3 |
| `auth-gate.test.tsx › renders no protected child (and runs no query) until the token check passes` | AC4 |
| `auth-gate.test.tsx › needs-account shows the picker; choosing an account checks the token and renders the app` | Account picker |
| `auth-gate.test.tsx › accounts error shows retry, does not redirect to sign-in` | No loop |
| `auth-gate.test.tsx › token 429 shows the wait time; network failure shows retry; config error shows request id and no retry` | Error states |
| `auth-gate.test.tsx › unauthorized signal re-lists accounts and force-refreshes the token; a second signal within 60 s shows the "session rejected" panel instead of looping` | 401 handling |
| `auth-gate.test.tsx › account switch (selectAccount) clears the query cache and re-checks the token` | R4 |
| `src/features/auth/gate/access-pages.test.tsx › not_member page: heading, account email, no join button, use another account, sign out` | AC3 |
| `access-pages.test.tsx › email_unverified page: text-only "any mmlabs app you use", no external link, no resend button, never calls /verify-email/resend` | AC5 |
| `access-pages.test.tsx › "I've verified, continue" forces a token refresh and shows the app on success` | AC5 |
| `access-pages.test.tsx › still unverified after refresh shows an inline alert and keeps the page` | AC5 |
| `access-pages.test.tsx › lists other accounts as "Continue as …" and "Use another account"` | AC5 switch |
| `src/features/auth/sign-in/components/user-auth-form.test.tsx › posts email+password only via the auth client login (POST /api/v1/auth/login)` | AC1 |
| `user-auth-form.test.tsx › after login navigates to the validated redirect (and to "/" for //evil.com)` | AC4 |
| `user-auth-form.test.tsx › invalid_credentials shows one generic message and clears the password` | AC1 |
| `user-auth-form.test.tsx › turnstile_required reveals the widget; submit sends turnstileToken; widget is reset after each attempt` (mock `loadTurnstile` as in `turnstile.test.tsx`) | Login flow |
| `user-auth-form.test.tsx › rate_limited shows the wait time; network error shows the retry message` | Error states |
| `user-auth-form.test.tsx › has no link to /forgot-password and shows the reset-from-any-mmlabs-app hint` | AC6 |
| `user-auth-form.test.tsx › empty fields show linked validation errors; no 7-character rule` | R10 |
| `src/components/sign-out-dialog.test.tsx › account scope: confirmation names the email; confirm POSTs logout for that account and lands on /sign-in without redirect` | Logout, R9 |
| `sign-out-dialog.test.tsx › all scope: names "all N accounts"; confirm logs out all` | Logout all |
| `sign-out-dialog.test.tsx › cancel sends nothing` | R9 |
| `sign-out-dialog.test.tsx › server failure shows an error toast (not "signed out") and still ends local state` | AppSec F8 |
| `src/components/layout/nav-user.test.tsx › shows the current account; switch account calls selectAccount and goes to "/"; no Billing / Upgrade items` | Account switch |

## Approach

### Decisions on the consult disagreements
- **D1: Bearer wiring. Use `fetchWithToken` as the transport for admin paths, not a `getToken` provider.**
  - Spec §5.1 says the token is "refreshed by the library". The owner ruled "no hand-written auth module" (2026-11-15/16). `fetchWithToken` is the library's implementation of "refresh once and retry once on 401, throttled to once per 30 s, pinned to the account, never to a non-allowed origin, never to `/api/v1/auth/*`".
  - With a provider we would have to re-implement retry, throttle and account pinning ourselves (architect Rec 3, API consult R-1).
  - `src/api/client.ts` remains the only place that calls it, so R2 still holds. The library is the transport underneath our single client, and features never see `fetchWithToken`.
  - **Accepted limitation:** openapi-fetch passes a `Request` with a body for POST/PATCH/PUT, so the library skips the 401 retry for writes (`bearer.ts:100-103`). This is acceptable and even preferable under R9 (no automatic replay of writes). Proactive refresh (reuse until `expires_in − min(60 s, 20 %)`) makes the case rare. The final 401 goes to the gate.
- **D2: Guard. Use a component gate in `_authenticated/route.tsx`, not `beforeLoad`.**
  - Auth state changes outside navigation: logout in another tab, account switch, the session revoked mid-page. The `AuthProvider` state is reactive, so a component gate re-renders on its own. `beforeLoad` runs only on navigation, so it would need a `router.invalidate()` effect and a second copy of the status in the router context (frontend consult risk 1).
  - The token check is async and its outcome is shown in place.
  - No route under `_authenticated` has a loader today. The ADR records the limit: a future loader that fetches must run inside the gate (for example via a query in the component) or move the check to `beforeLoad`. A loader would still get no token without a ready session, because `fetchWithToken` throws `no_account_selected`.
  - This matches the library README §7 `Gate` pattern and is simpler to test.
- **D3: `not_member`, `email_unverified` and needs-account are rendered in place by the gate, not as routes.**
  - The state comes from `getToken()`, not from the URL, so there is no forgeable `/not-member` URL that could show a wrong state.
  - The target URL is kept, so "I've verified, continue" lands on the page the user asked for without another redirect.
  - There are no redirect loops between guard and pages, and no extra routes.
  - They are still full, clear pages: centred `AuthLayout` card, heading that takes focus (`StatusPanel`).

### §1 Library install (R5, supply chain)
1. Copy the tarball into `vendor/`.
2. Verify: `sha256sum vendor/mmlabs-auth-client-0.1.0.tgz` must equal `f1303c17…08f2` (ticket). If it does not, stop and escalate; do not substitute anything.
3. Extract it into a new empty scratch directory and **only read** `package/package.json`. Record in `impl-log.md`: no `preinstall`/`install`/`postinstall`/`prepare` scripts, no runtime `dependencies`, `react` is an optional peer, and the exports include `.` and `./react`.
4. Run `pnpm add ./vendor/mmlabs-auth-client-0.1.0.tgz`. Confirm the lockfile has `resolution: {integrity: sha512-…, tarball: file:vendor/…}`.
5. Dockerfile, after `COPY package.json pnpm-lock.yaml ./`: `COPY vendor/ vendor/` then `RUN sha256sum -c vendor/SHA256SUMS`, then the existing install. ci.yml: the same `sha256sum -c` step before `pnpm install`.
6. `.prettierignore` already ignores everything outside `src/` and the listed files, so `vendor/` is not formatted. ESLint does not lint `.tgz`.
7. The library is built with TS 7 and we use TS ~6.0. `pnpm typecheck` must pass against its `.d.ts`. If it does not, stop and escalate; do not patch `node_modules`.

### §2 Auth client and API wiring (`src/api/`; R2, R3, R5)
- `createAdminAuthClient(overrides?)` returns `createAuthClient({ baseUrl: apiBaseUrl(), appKey: appKey(), apiOrigins: [apiBaseUrl()], allowInsecureLocalhost: import.meta.env.DEV, fetch: authTimeoutFetch, ...overrides })`.
  - Defaults: `storage` = localStorage (only `mm_account_id`, which R3 allows) and `broadcast: true`.
  - `getAuthClient()` memoises it lazily, the same pattern as `getApi()`.
  - `apiBaseUrl()` already rejects anything other than https, and allows http only on localhost in dev. So the library's https rule and `allowInsecureLocalhost` only ever see a validated origin.
  - The same origin is the CSP `connect-src`, so no CSP change is needed (appsec F11).
- `authTimeoutFetch(input, init)`:
  - If `input instanceof Request`, it is a Bearer call that `timedFetch` already timed: pass it through unchanged.
  - Otherwise it is a library call to `/api/v1/auth/*` with no signal: use `globalThis.fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) })`.
  - The library turns the abort into `NetworkError`. This prevents an endless "Restoring your session…" when `/accounts` hangs.
- `authFailure(e: unknown): AuthFailure` uses `instanceof` on the library classes. It returns a discriminated union: `session_invalid | not_member | email_unverified | rate_limited{retryAfter?} | invalid_credentials | turnstile_required | turnstile_failed | validation | network | config{requestId?} | account_changed | no_account_selected | unknown{requestId?}`. It never carries a message, email or token. This is the only place outside the error mapping in `errors.ts` that imports the library's error classes.
- `client.ts`:
  - `timedFetch` builds the same forced `Request` as today, then calls `isPublicAuthPath(req.url) ? fetchImpl(r) : (bearerFetch ?? fetchImpl)(r)`.
  - `onRequest` keeps the origin check and the epoch, and no longer sets `Authorization`; the library does that.
  - `onResponse` is unchanged. A 401 at that point is the **final** response after the library's single retry, and it goes to `notifyUnauthorized(epoch)`.
  - `onError`: read `epoch = epochs.get(id)`, delete it, then `err = errorFromFetchFailure(error)`. If `err.kind === 'auth'` and `err.code` is one of `session_invalid`, `not_member`, `email_unverified` or `no_account_selected`, call `notifyUnauthorized(epoch)`. Return `err`.
- `errors.ts`: map as listed in "Files to create / modify". The message for `auth` is `'Authentication required'`, or `'Too many requests'` for `rate_limited`. Library messages are already fixed (`mmlabs-auth: <code>`), but we do not reuse them.
- `query-client.ts`: `isTransient` already excludes `kind:'auth'`, so there is no retry and no generic toast. Add `clearOnAuthChange(qc, subscribe)`: `subscribe(() => { void qc.cancelQueries(); qc.clear() })`. It runs for `account-changed` and `signed-out`, including events from other tabs.

### §3 Gate (`src/features/auth/gate/`; AC2–AC5)
`AuthGate({children})` reads `useAuth()`:

| `status` | Renders |
|---|---|
| `loading` | `BootSpinner`: `role='status'`, `aria-live='polite'`, "Restoring your session…". No children. |
| `signed-out` | `<Navigate to='/sign-in' search={redirect ? { redirect } : {}} replace />`. `redirect = safeRedirect(location.pathname + location.searchStr)` from `useLocation()`; it is omitted when the result is `/`. The hash is never included. |
| `needs-account` | Inside `AuthLayout`: heading "Choose an account", `AccountList` (all accounts), "Use another account" (`Link` to `/sign-in` with the same safe redirect), "Sign out of all accounts" (`SignOutDialog scope='all'`). |
| `error` | `GateMessage` "Could not reach mmlabs Identity", with a Retry button that calls `reload()`. Never redirects. |
| `ready` | `useAccessCheck(accountId)`. Shows `checking` as `BootSpinner`, then `ok` as `children`, or one of the pages below. |

`useAccessCheck(accountId)` keeps the state union `checking | ok | not_member | email_unverified | rate_limited{retryAfter} | network | config{requestId} | rejected`.
- It uses `useAccessToken().getToken`, the context client, so tests and the app use the same client. `await getToken(opts)` and discard the result. **The token never goes into state, refs, props, logs or the query cache.**
- It runs on mount and whenever `accountId` changes. A sequence ref ignores stale results (StrictMode, fast switching).
- Failure mapping via `authFailure`:
  - `session_invalid` → `reload()`.
  - `account_changed` and `no_account_selected` → `reload()`, and stay `checking`.
  - `unknown` → `config` panel with Retry.
  - The rest map 1:1.
- `recheck({ forceRefresh })` is exposed to the pages.
- It subscribes to `useSessionRecheck.generation`. On change:
  - If the last successful re-check after a signal was less than 60 s ago, set `rejected` and stop. This prevents a 401 → recheck → 401 loop.
  - Otherwise set `checking`, `await reload()`, then `getToken({ forceRefresh: true })`.
  - While the gate is `checking`, the children unmount, so protected queries stop.

Pages, all inside `AuthLayout`, using `StatusPanel` so the heading takes focus:
- **NotMemberPage**
  - Title: "No access to the admin app".
  - Text: "`<email>` is signed in, but this account does not have access to mmlabs Admin. Ask an administrator to grant access."
  - Actions: `AccountList exclude=accountId` (if other accounts exist), "Use another account", "Sign out" (`SignOutDialog scope='account'`).
  - **No join button**: admin is `join_closed`.
- **EmailUnverifiedPage**
  - Title: "Verify your email address".
  - Text (text only): "`<email>` has not been verified yet. Open the verification email we sent you and follow its link. If you need a new link, request it from any mmlabs app you use. Then come back and continue."
  - Primary button: "I've verified, continue". It calls `recheck({ forceRefresh: true })`.
    - On success the app renders.
    - If the page is still unverified: `role='alert'` "Your email address is still not verified."
    - On 429 or network failure, the matching alert.
    - Use `aria-disabled` while pending, as in `verify-email-panel.tsx`.
  - Then `AccountList exclude`, "Use another account", "Sign out".
  - **No resend button and no call to `resendVerification`** (owner: PAN-010b).
- **GateMessage variants:**
  - rate_limited: "Too many requests. Try again in X." (`formatRetryAfter`), Retry.
  - network: "Could not reach the server.", Retry.
  - config: "The app is not configured correctly for mmlabs Identity." Shows `Request ID: <id>` when present. No retry. Sign out.
  - rejected: "The admin API did not accept your session." Retry (clears `rejected`, runs a forced re-check), Sign out.
- **AccountList:** `<ul>` of `<Button>`s "Continue as `{displayName ?? email}`" with the email as secondary text and a "Email not verified" badge when `!emailVerified`. A click calls `selectAccount(id)`. The provider re-lists, `accountId` changes and the check re-runs.

### §4 Sign-in form (AC1, AC4, AC6)
- Schema: `email: z.email(...)` and `password: z.string().min(1, 'Please enter your password.')`. Drop the template's `min(7)` rule; the server owns the policy.
- `<form method='post' noValidate>` (appsec F13). Autocomplete: `username` / `current-password`.
- `useMutation({ retry:false, gcTime:0, meta:{handlesOwnErrors:true}, mutationFn: (v) => login(v) })` with `login` from `useAuth()`. This is the only code path that handles the password, and it goes straight to the library.
- `onSettled`: `form.resetField('password')`, and `turnstile.current?.reset()` when the widget is shown.
- `onSuccess`: `navigate({ href: safeRedirect(redirectTo), replace: true })`. The gate at the target then runs the token check; not_member and unverified are handled there. Do not inspect `emailVerified` in the form.
- Error → one `role='alert'` paragraph, via `authFailure`:

| Failure | Behaviour / message |
|---|---|
| `invalid_credentials` | "Email or password is incorrect." |
| `turnstile_required` | Set `needsTurnstile`, show `<Turnstile>`, message "Complete the verification, then sign in again." Submit is disabled until there is a token. Later submits send `turnstileToken`. |
| `turnstile_failed` | Reset the widget. "Verification failed. Please try again." |
| `rate_limited` | "Too many attempts. Try again in X." |
| `network` | "Could not reach the server. Please try again." |
| `validation` | "Please check your email and password." |
| anything else | "Something went wrong. Please try again later." |

- No toast, and the email is never echoed (R5).
- Replace the "Forgot password?" `Link` with a muted paragraph: "Forgot your password? Reset it from any mmlabs app you use." There is no link.
- The sign-in page does **not** auto-redirect a signed-in user. Login adds and selects an account, so "Use another account" works from the gate pages. This rejects frontend consult item 4's `beforeLoad` redirect.

### §5 Logout and account switch (R9)
- `SignOutDialog({open, onOpenChange, scope})` uses `useAuth()` for `accounts`, `accountId`, `logout` and `reload`, and `useNavigate()`.

| Scope | Title | Description | Confirm button |
|---|---|---|---|
| `account` | "Sign out" | "Sign out `<email>` on this browser? Other mmlabs apps open in this browser are signed out of this account too." | "Sign out" |
| `all` | "Sign out of all accounts" | "Sign out all `N` accounts on this browser, in every mmlabs app?" | "Sign out all" |

- Confirm:
  1. Set `isLoading`.
  2. `try { await logout(target) } catch { toast.error('Could not reach the server. You are signed out here, but the session may still be active; sign out again later.') }`
  3. `finally { await reload(); onOpenChange(false); navigate({ to: '/', replace: true }) }`. The gate then shows the picker (other accounts remain) or redirects to `/sign-in` **with no redirect param**: an explicit sign-out never carries the previous location.
  4. Never show a "signed out" success toast. Never optimistic: the library clears local state first by design. The query cache is cleared by `clearOnAuthChange`.
- NavUser "Switch account": one `DropdownMenuItem` per other account. A click calls `selectAccount(id)` then `navigate({ to: '/' })`, because the current page may not apply to the other staff member. The cache clears through the auth event, and the gate re-checks the token for the new account.
- "Use another account" → `/sign-in`.
- Label: `displayName ?? email`, with initials from the label, and no avatar image.

### §6 Lint rules (R2/R3)
In the `src/**/*.{ts,tsx}` block of `no-restricted-imports`, add:
- path `@mmlabs/auth-client`: "Only src/api uses the auth client core (R2/R3)".
- path `@mmlabs/auth-client/react` with `importNames: ['useAccessToken']`: "fetchWithToken bypasses src/api; only the auth gate may use useAccessToken (R2)".

Add a block for `src/features/auth/gate/**` and `src/test-utils/**` that re-declares `no-restricted-imports` with the existing axios and openapi-fetch entries. The gate block also keeps `@mmlabs/auth-client` restricted; test-utils may import it. Flat config replaces the whole rule options, so the existing entries must be repeated.

`main.tsx` and the features may import `AuthProvider` and `useAuth` from `@mmlabs/auth-client/react`. `no-http-outside-api.test.ts` needs no change. Do not write `fetch(` in `src/test-utils/` (name the fake `fakeFetch`).

### §7 `main.tsx`
1. `let auth; try { auth = getAuthClient() } catch { render <p role='alert'>This build is missing its API configuration (VITE_API_BASE_URL / VITE_APP_KEY).</p>; return }`. This text holds no secret.
2. Otherwise:
   - `clearOnAuthChange(queryClient, (l) => auth.onChange(l))`.
   - `setUnauthorizedHandler(() => useSessionRecheck.getState().request())`.
   - Render `StrictMode > QueryClientProvider > AuthProvider client={auth} > Theme/Font/Direction > RouterProvider`.
   - Remove the "Session expired!" toast. The gate shows the state.

### §8 Test helpers (`src/test-utils/auth.tsx`)
- `fakeIdentityApi(scenario)` returns `{ fakeFetch, calls }`. It answers `GET /api/v1/auth/accounts`, `POST /api/v1/auth/token`, `/login`, `/logout`, and admin `GET /api/v1/organizations` for the client tests.
- Response and error shapes must match what the library parses. Copy them from `/home/user/mmlabs-auth/ts/test/endpoints.test.ts` / `contract.test.ts` and `/home/user/mmlabs-auth/contract/error-codes.json`; do not guess snake_case fields.
- `memoryStorage(initial?)`.
- `createTestAuthClient(api, { storage })` = `createAuthClient({ baseUrl:'https://api.test', appKey:'admin', apiOrigins:['https://api.test'], fetch: api.fakeFetch, storage, broadcast:false })`.
- `renderWithAuth(routes, { client, path })` uses a minimal TanStack router with memory history: root → `/sign-in` stub, `_authenticated` (`AuthGate`) → `/` and `/users` stubs that render a marker and a `useQuery` probe. Wrap it with `QueryClientProvider` and `AuthProvider`.

### §9 ADR `docs/adr/0003-auth-client-integration.md`
It amends ADR 0001's "auth seam" and "no refresh or retry" lines. It records:
- the vendored tarball, its SHA-256, the `sha256sum -c` steps, and the manual upgrade path (Dependabot does not see `file:` deps);
- one lazy auth client in `src/api` with a timeout fetch;
- D1 (`fetchWithToken` as the Bearer transport, with no 401 retry on writes);
- the error mapping to `ApiError kind 'auth'`;
- the token never enters React, zustand or the query cache, and the auth-store was removed;
- D2 (the component gate) and its limit on loaders;
- D3 (in-place access pages);
- the cache is cleared on auth events;
- the final 401 goes to a gate re-check, with the 60 s "rejected" stop;
- no mock sign-in (owner, 2026-11-16);
- ADM-002d consequences: no resend (PAN-010b), no forgot link (PAN-012c);
- the accepted revocation lag of up to 15 min.

### Rules check
- **R1:** nothing faked. Resend is omitted instead of being hacked around.
- **R2:** all HTTP goes through `src/api`. The library's own calls also originate from `src/api/auth-client.ts`, and lint enforces it.
- **R3:** login, accounts, token and logout go only through the library. The token lives only in library memory. Only `mm_account_id` is persisted. Every `_authenticated` route is behind the gate; `(auth)` and `(errors)` stay public.
- **R4:** 403 is never treated as sign-out. The cache is cleared on an account change.
- **R5:** no new env keys. No email or token in URLs, logs or toasts. The `redirect` param is a path only.
- **R6:** no HTML sinks. Account emails are rendered as text.
- **R7:** out-of-scope items are listed below.
- **R8:** see the tests.
- **R9:** logout confirms and names the target, is never optimistic, and shows errors.
- **R10:** labelled inputs with linked errors, `role=alert`/`status`, focus moves to the page heading, the picker is a `<ul>` of buttons, and the boot spinner is labelled.
- **R11:** no end-user features, and the template Billing items are removed from the menus being rewritten.

## Specialist input used
- **software-architect:**
  - Adopted: Rec 1 (vendor plus checksum in CI and Docker, never build from source), Rec 2 (lazy client in `src/api`, timeout fetch; I simplified it to pass `Request` inputs through so writes keep their 30 s), Rec 3 Option A plus the F3 error mapping, Rec 4 (delete auth-store, clear the cache on events), Rec 5 (component gate, in-place pages, `safeRedirect`, a final 401 re-checks instead of navigating), Rec 7 (no resend), Rec 9 (ADR) and Rec 10 (real client with injected fetch).
  - Rec 8 and the open questions are resolved by the owner.
- **identity-access-engineer:**
  - Adopted: no token in zustand or React state, the token check after `ready`, the gate state table (never redirect on `error`/429), `safeRedirect` on producer and consumer, no `redirect` after an explicit logout, 401 → `invalidate`/re-list, and cache clearing on `onChange`.
  - Rejected: `setAccessTokenProvider(() => auth.getToken())` (see D1), and the resend flow (owner).
  - The permissions endpoint question (Q3) is a follow-up for PAN-011.
- **api-platform-engineer:**
  - Adopted: R-1 (`fetchWithToken` as the fetch; writes accept no retry, which I chose explicitly), R-2 (`apiOrigins` = `apiBaseUrl()`), R-3 (single refresh layer, a 403 never signs out), R-4 (no retry for auth errors), R-7.
  - The ADM-012 doubts are resolved by `orchestrator-facts.md` §2.
  - Deferred: R-5 (drop the dev proxy) and R-6 (OpenAPI snapshot refresh). No admin endpoint changes here, and the proxy still works with the library, so this is a follow-up.
  - Deferred: `requestId` on `ApiError` (follow-up). Here it is shown only in the gate's config panel.
- **appsec-engineer:**
  - Adopted: F3 (the `safeRedirect` table, max length, control characters), F4, F5, F6, F7, F8, F9 (no mock auth path at all, per the owner), F10 (the lockfile integrity check, the install-script check in `impl-log`), F12 (Turnstile on demand, reset after each attempt) and F13 (`method='post'`, clear the password, no email in toasts).
  - F1 and F2 are resolved by the owner.
  - Trusted Types goes to the follow-ups.
- **frontend-developer:**
  - Adopted: the forgot-password form pattern for the sign-in form, `StatusPanel` focus, the "Continue as" list with an unverified badge, the menu cleanup, the boot spinner text, and the test approach without MSW.
  - Rejected: `beforeLoad` plus router-context auth (D2), the `/choose-account`, `/not-member` and `/email-unverified` routes (D3), the `RouterProvider` mount delayed until not loading (unnecessary, because public pages render immediately and the gate handles loading), the redirect of a ready user away from `/sign-in` (it breaks "Use another account"), and the `visibilitychange` auto-refresh (not in the AC).

## Assumptions
1. The tarball at the scratch path is the `ts-v0.1.0` release artifact with the ticket's SHA-256. The owner confirms that hash against the release page before merge (ticket note). The implementer records it in the PR description.
2. Response shapes for `/accounts`, `/token`, `/login` and `/logout` follow the library's own tests and contract files. The library parses them, so admin-pan never reads raw bodies.
3. Local development keeps `VITE_API_BASE_URL=http://localhost:5173` through the existing Vite proxy. The library calls `/api/v1/auth/*` same-origin, and Chromium accepts the `Secure` device cookie on `http://localhost`. `http://localhost:5173` must be registered on app `admin` (README already shows `make set-admin-origins`). If this fails in practice, the implementer records it. Automated tests do not depend on it.
4. One device session is shared by all mmlabs apps in a browser (library README §4), so the sign-out copy says other mmlabs apps are signed out of that account too.
5. Permission-filtered navigation and per-screen 403 states are PAN-011 and later. This ticket shows every nav item to any signed-in admin member; the API still enforces permissions (R4).
6. A revocation lag of up to 15 minutes after logout or a role change is accepted API behaviour (library README §8) and is documented in the ADR, not worked around.
7. Size: roughly 600 production lines plus tests. Removing the zustand store forces sign-in, sign-out and the shell user to change together, so the work stays in one ticket (see Split proposal).

## Blocking questions
None.

## Split proposal
None. This is one spec feature (§5.1 sign-in). The owner already split resend (PAN-010b) and forgot-password (PAN-012c) out. The remaining parts cannot be shipped separately without a broken intermediate state: deleting the token store breaks sign-in, sign-out and the shell user at once, and a guard without the access pages would trap `not_member` users in a blank state. Most of the diff is tests.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/sign-in` (public) | none | Idle form. Pending (button `aria-busy`, spinner). Errors: invalid credentials, Turnstile required/failed, 429, network, validation, unknown (one `role=alert`). Happy → navigate to `safeRedirect(redirect)`. | Submit → `useAuth().login({email, password, turnstileToken?})` (library `POST /auth/login`) | Auth event → `queryClient.clear()` |
| every `/_authenticated/*` route (gate) | none of its own (gate); child screens keep their own `admin:*` (PAN-011+) | loading (boot spinner); signed-out (redirect); needs-account (picker); accounts error (retry); checking (spinner); not_member page; email_unverified page; 429 / network / config / rejected panels; happy (layout + outlet) | Continue as → `selectAccount`. Retry → `reload()` / re-check. "I've verified, continue" → `getToken({forceRefresh:true})`. Use another account → `/sign-in`. Sign out → see dialog. | `clear()` on every auth event |
| Sign-out dialog (sidebar NavUser, header ProfileDropdown, gate pages) | none | Confirm/cancel; pending (`isLoading`); failure toast | Confirm → `logout({accountId})` or `logout({all:true})` (library `POST /auth/logout`) → `reload()` → navigate `/` | `clear()` via auth event |
| NavUser switch account | none | Lists other device accounts | Click → `selectAccount(id)` → navigate `/` | `clear()` via auth event |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/auth/accounts` | cookie class, via library `listAccounts()` (`AuthProvider`) | library `Account[]` (schema `AccountList`; not called through `src/api` client) | 401 `session_invalid` → signed-out; network/CORS → `error` + retry; 429 → error + retry | USR-03b |
| POST | `/api/v1/auth/login` | via library `login({email, password, turnstileToken?})` | library `LoginResult` (schema `LoginResponse`) | 401 `invalid_credentials`, 403 `turnstile_required`/`turnstile_failed`, 422 `validation_error`, 429 `rate_limited`, network | USR-03 |
| POST | `/api/v1/auth/token` | via library `getToken({forceRefresh?})` (gate, verified-continue, and inside `fetchWithToken`) | token string kept in library memory only (schema `TokenResponse`) | 401 `session_invalid` → reload; 403 `not_member`, `email_unverified` → pages; 403 `audience_mismatch`/`app_header_required`/`origin_not_allowed`/`app_mismatch`/`org_not_supported` → config panel; 429 → wait panel; network → retry | USR-03b, ADM-002c |
| POST | `/api/v1/auth/logout` | via library `logout({accountId} \| {all:true})` | 204 | network/429 → error toast (local state already cleared) | USR-03b |
| any | admin `/api/v1/*` (existing screens later) | via `getApi()` → `fetchWithToken` (Bearer, `credentials:'omit'`, no `X-MM-App`) | unchanged generated types | final 401 → gate re-check; 403 left to screens (R4); auth errors → `ApiError kind 'auth'` | ADM-002, ADM-012 (CORS) |

Not called: `POST /api/v1/auth/verify-email/resend` (refused for `admin` by ADM-002d; PAN-010b), `POST /api/v1/auth/apps/admin/join` (`join_closed`), `/auth/signup`, `/auth/password/forgot`.

## Follow-ups (record, do not implement — R7)
1. **PAN-010b:** resend-verification button, once org-admin-api allows resend for `admin` (owner).
2. **PAN-012c:** retire or replace `/forgot-password`, its `forgotPassword()` in `src/api/public-auth.ts` (gets 403 under ADM-002d), and the PAN-012b copy "Sign in to request a new one" in `verify-email-panel.tsx`.
3. **Spec:** update §5.1 so it no longer says resend belongs to PAN-010 and lists `/forgot-password`. Match the owner decisions from 2026-11-16.
4. **ADR 0001 / Vite proxy:** ADM-012 now gives admin Bearer paths CORS. Consider dropping the dev proxy and the "no CORS yet" README line.
5. **`requestId` on `ApiError`** for support (API consult R-4).
6. **CSP `require-trusted-types-for 'script'`** (appsec / library README §8), after checking it against React and the Turnstile loader.
7. **org-admin-api:** an endpoint returning the caller's effective admin permissions, needed by PAN-011 for permission-filtered navigation (R4). Never decode the JWT in the UI.
8. Remaining template leftovers outside the files touched here (for example the team switcher).
