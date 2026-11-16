# PAN-010 consult: software-architect (admin-pan mode)

## Scope and sources

I read these files:
- The ticket and `orchestrator-facts.md`.
- `CLAUDE.md` and spec §5.1.
- In `src/api/`: `client.ts`, `auth-hooks.ts`, `index.ts`, `public-auth.ts`, `config.ts`, `errors.ts`, and `no-http-outside-api.test.ts`.
- `src/main.tsx`, `src/stores/auth-store.ts`, `src/lib/query-client.ts`, `src/routes/__root.tsx`, `_authenticated/route.tsx` and `(auth)/sign-in.tsx`.
- In `src/features/auth/`: the sign-in form and the verify-email panel.
- ADR 0001, `eslint.config.js`, `vite.config.ts`, `Dockerfile`, `.dockerignore`, `.env.example` and `nginx/security-headers.conf`.
- In the library (`/home/user/mmlabs-auth/ts`): the README, `client.ts`, `bearer.ts`, `transport.ts`, `token-cache.ts`, `accounts.ts` and `react/index.tsx`.

**Limitation:** my tools are read-only and include no shell, so I could not run `git show origin/main:…`. The org-admin-api checkout I read looks stale: its `consumers.md` has no admin-UI section, and its ADM-002d lists only signup and forgot. Where the two sources differ, I relied on `orchestrator-facts.md` (checked against `origin/main` 0899731) and the library README. Both say the `admin` app is refused on signup, forgot-password and resend-verification.

## Findings

**F1. Library shape (ts-v0.1.0).**
- It exposes one `AuthClient` per page.
- Tokens are held in private memory, keyed by account and audience. A token is reused until `expires_in − min(60 s, 20 %)`. Concurrent requests share one in-flight call, there are no timers, and a token that lands after an account change is not cached (`account_changed`).
- The only thing written to storage is `mm_account_id` in `localStorage`. That matches R3.
- `fetchWithToken`:
  - always sends `credentials: 'omit'`, removes `X-MM-App` and sets `Authorization: Bearer`;
  - refuses `/api/v1/auth/*` and any origin not in `apiOrigins` (`bearer_origin_not_allowed`);
  - on a 401, retries **once** (at most once per 30 s), keeps the same account, and returns the second response.
  - It **skips the retry when the request has a body** (`bearer.ts:100-103`). openapi-fetch sends a `Request` with a body for POST/PATCH, so mutations never retry.
- The React wrapper:
  - `AuthProvider` derives `status` (loading, signed-out, needs-account, ready, error) from `listAccounts()` and reloads it on every client event and on cross-tab messages.
  - `useAccessToken()` exposes `getToken` and `fetchWithToken`, never the token value.
- The library sets no timeout on its own requests (`/accounts`, `/token`, `/logout`).
- Its README section 7 ends with: "The `admin` app cannot host sign-up, forgot-password or resend-verification: the API answers 403 for those (ADM-002d)… `admin` does not accept joins either (`join_closed`)."

**F2. Today's seam (ADR 0001).**
- `auth-hooks.ts` holds a token provider, an unauthorized handler and an epoch counter. The epoch makes concurrent 401s fire the handler only once.
- In `client.ts`, the `onRequest` middleware attaches the Bearer token for paths outside `/api/v1/auth/*`. `onResponse` calls `notifyUnauthorized` on a 401.
- ADR 0001 states "No refresh or retry here; PAN-010 plugs in `@mmlabs/auth-client`". So adding retry or refresh is a design change that ADR 0001 does not cover.

**F3. Error-mapping hazard.** If `getToken` throws inside the request path, the error ends up in `errorFromFetchFailure` (`errors.ts:95-120`). That function turns anything unknown into `ApiError{kind:'network'}`. This applies to `SessionInvalidError`, `NotMemberError`, `EmailUnverifiedError`, `RateLimitedError`, `no_account_selected`, `account_changed` and `ConfigurationError`. The consequences:
- `shouldRetryQuery` treats it as transient and retries 3 times in production.
- The QueryCache shows a "Server or network error" toast.
- A 429 lockout on `/token` gets hammered with retries.
- `not_member` and `email_unverified` are never shown as their own states.

This happens whichever wiring option is chosen.

**F4. State today.**
- `useAuthStore` (zustand) holds `accessToken` and a mock `user`. The mock sign-in form writes `'mock-access-token'` into it, and `main.tsx:29` reads it.
- `sign-out-dialog.tsx` and the sign-in form are its only consumers.
- No route has a guard: `_authenticated/route.tsx` only renders the layout, and no route defines `beforeLoad` or a loader.
- The 401 handler builds `redirect` from `router.history.location.href`, which includes the hash. The security reviews asked for the hash to be dropped.

**F5. Configuration and mock mode.**
- `createAuthClient` throws a `TypeError` immediately when `baseUrl` is invalid. In mock mode `VITE_API_BASE_URL` is empty, so a client created at module level would crash the app.
- In dev, the base URL is the page origin (`http://localhost:5173`) behind the Vite proxy. The library therefore needs `allowInsecureLocalhost` (dev only) and `apiOrigins: [apiBaseUrl()]`.
- The production Dockerfile already requires an https origin.
- The CSP `connect-src 'self' <API>` and the Turnstile hosts already fit the library's guidance.

**F6. Install path.**
- The README prescribes downloading the vendored tarball, checking its SHA-256, and adding it with `pnpm add ./vendor/…tgz`, which writes `file:vendor/…`.
- The `Dockerfile` runs `pnpm install --frozen-lockfile` after copying only `package.json` and `pnpm-lock.yaml`. **The Docker build will fail unless `vendor/` is copied before the install.**
- `.dockerignore` does not exclude `vendor/`, which is correct.
- The library is compiled with TypeScript 7; admin-pan uses `typescript ~6.0.3`. The `.d.ts` files will most likely work, but `pnpm typecheck` has to confirm it.

**F7. ADM-002d versus the ticket and spec.**
- The API answers 403 `origin_not_allowed` to signup, forgot-password and verify-email resend when sent with `X-MM-App: admin` (orchestrator-facts §3).
- **Acceptance criterion 5 ("resend verification `POST /auth/verify-email/resend`") cannot work for app key `admin`.** Spec §5.1 explicitly gives resend to PAN-010, so the ticket and spec conflict with the API contract.
- The "refresh the token after verify" half of that criterion is still feasible: `getToken({forceRefresh:true})`.
- Knock-on effects on work already merged:
  - The PAN-012 `/forgot-password` page (`public-auth.ts` sends `X-MM-App: admin`) now always gets a 403 on the real API.
  - The sign-in form links to it.
  - Mail links always point at the origin of the page that requested them, and admin can no longer request any. So the admin origin will never receive new `/verify-email` or `/reset-password` links. Those pages must still be served, because every registered origin has to serve them.
  - The PAN-012b copy "Sign in to request a new one" is now wrong.

## Recommendations

**Rec 1. Install: vendored tarball with checksum (R5, R8).**
- Commit `vendor/mmlabs-auth-client-0.1.0.tgz` and `vendor/SHA256SUMS`, with the hash taken from the ts-v0.1.0 release notes and compared by hand.
- Add a CI step `sha256sum -c vendor/SHA256SUMS` that runs before `pnpm install`.
- In the Dockerfile, add `COPY vendor/ vendor/` before `pnpm install`, and optionally the same `sha256sum -c`.
- Exclude `vendor/` from prettier and eslint.
- Do **not** build the package from `/home/user/mmlabs-auth`. Only the release artifact is acceptable.
- If the sandbox cannot download the release, the implementer must stop rather than substitute anything.

**Rec 2. One auth client, owned by `src/api/` (R2, R3).**
- Add `src/api/auth-client.ts` with a lazy `getAuthClient()`, following the `getApi()` pattern so mock mode and builds keep working.
- Options: `baseUrl: apiBaseUrl()`, `appKey: appKey()`, `apiOrigins: [apiBaseUrl()]`, `allowInsecureLocalhost: import.meta.env.DEV`. Keep the defaults `storage` = localStorage (holds only `mm_account_id`, which R3 permits) and `broadcast: true`.
- Pass a `fetch` that adds a timeout, which addresses F1's missing timeouts:
  - Combine `init.signal`, else the `Request`'s own signal, with `AbortSignal.timeout(…)` using `AbortSignal.any`.
  - Do not just overwrite the signal: `fetchWithToken` passes a `Request` whose signal carries both query cancellation and the API client's own timeout.
  - Cover this with a test.
- Add ESLint `no-restricted-imports` for the root `@mmlabs/auth-client` outside `src/api/`, and for `useAccessToken` from `/react` outside `src/api/` and the auth gate. `fetchWithToken` is an HTTP path that would otherwise bypass R2.
- Features take state and actions from `useAuth()` (login, logout, selectAccount, accounts, status).

**Rec 3. Bearer wiring: Option A (recommended) — the library is the transport for admin paths. Covers "refresh about 60 s before expiry, one retry on 401".**
- Option A: give `createApiClient` an `authorizedFetch` option. In `timedFetch`:
  - `/api/v1/auth/*` (public flows) → plain `fetchImpl`;
  - everything else → `getAuthClient().fetchWithToken(request)`.
- Remove the token attachment from `onRequest`, or keep the provider returning `null`.
- Keep the middleware's origin check, envelope parsing, epoch handling and `notifyUnauthorized` on the **final** 401.
- Trade-offs:
  - Refresh, retry, the 30 s throttle, account pinning and the guard against sending the token to the wrong origin all stay in the library, so no hand-written auth logic is added (owner note).
  - Mutations do not retry on a 401 (library behaviour). That is acceptable under R9: no automatic replay of writes. Proactive refresh makes the case rare.
- Option B: a provider calling `() => getAuthClient().getToken()`, plus our own retry-once in `timedFetch`. This duplicates library logic, needs our own 30 s throttle and account pinning, and goes against the "no hand-written auth module" ruling. Not recommended.
- Either way, **fix F3** in `src/api/errors.ts`:
  - Map library `AuthError` subclasses to a new non-transient `ApiError` kind `'auth'` that keeps `code`, and `retryAfter` for `rate_limited`.
  - `session_invalid` and `no_account_selected` → `notifyUnauthorized`.
  - `not_member` and `email_unverified` → surfaced to the gate (Rec 5).
  - `bearer_origin_not_allowed` → kind `config`.
  - `shouldRetryQuery` must not retry kind `auth`.
  - Only `src/api` imports the library error classes; it exposes a small helper such as `authErrorCode(e)`.
- Record the change in a new ADR, because ADR 0001 says "no retry here" (Rec 9).

**Rec 4. Who owns which state (R3 "token in memory only").**

| State | Owner |
|---|---|
| Device session | API cookie, via the library |
| `mm_account_id` | Library (localStorage) |
| Access token | Library private memory only |
| Accounts, status, current account | `AuthProvider` context |
| Access result (ok / not_member / email_unverified / error) | Gate hook; derived and never persisted; must not contain the token |
| Server data | TanStack Query cache |

- **Delete `src/stores/auth-store.ts`** and its test, and rewrite `sign-out-dialog` and the sign-in form on top of `useAuth()`.
  - A zustand `accessToken` field would breach the library rule "never in React state" and turn the store into a second source of truth.
  - The signed-in email comes from `accounts.find(a => a.accountId === accountId)`.
  - Permissions belong to PAN-011, not here.
- Register one `client.onChange` subscriber, in `main.tsx` or a small `AuthBridge`. On `account-changed` and `signed-out` it calls `queryClient.clear()`. Without this, data loaded for one account (and its permissions) stays visible after a switch, a logout or an event from another tab.

**Rec 5. Guard as a component gate (acceptance criteria 2, 3 and 4).**
- Put `<AuthProvider client={getAuthClient()}>` in `main.tsx` above `RouterProvider`.
  - The sign-in page needs it to show "already signed in" and the account picker.
  - `/verify-email` can use it to refresh the token after verifying, as `consumers.md` step 4 says.
- `_authenticated/route.tsx` renders an `AuthGate` from `features/auth`:
  - `loading` → spinner.
  - `signed-out` → `navigate('/sign-in', {search:{redirect}})`.
  - `needs-account` → account picker.
  - `error` → retry (calls `reload`).
  - `ready` → a token check (`getToken()`, whose result is discarded) to resolve `ok`, `not_member` or `email_unverified`. Then either `<Outlet/>` or the matching page.
- Render the not_member and email_unverified pages **in place**: no forgeable URL, and the redirect target is kept.
- A component gate is enough today because there are no route loaders. If later tickets add loaders or `ensureQueryData`, they must move to `beforeLoad` or run inside the gate. Worth a line in the ADR.
- Session restore on reload, criterion 2: `listAccounts` runs over the cookie, then the token check. Nothing is persisted beyond `mm_account_id`.
- `safeRedirect(raw)` lives in `features/auth` or `lib/`, with unit tests:
  - accept only same-origin relative paths: starts with `/`, not `//` and not `/\`;
  - check that `new URL(raw, location.origin).origin === location.origin`;
  - keep pathname and search, drop the hash;
  - reject the `(auth)` pages;
  - fall back to `/`.
  - The 401 handler in `main.tsx` builds `redirect` without the hash.
- The final-401 handler does not navigate on its own. It reloads the auth provider and re-runs the gate's token check, and the gate decides. This avoids a refetch, 401, clear loop. If the token check succeeds but 401s continue, show an error state rather than looping.
- not_member page:
  - admin is `join_closed`, so there is **no** "Continue as" or join button;
  - text along the lines of "no access; ask staff";
  - "Use another account" and "Sign out" actions.

**Rec 6. Sign-in, account switch, logout (acceptance criteria 1 and 6).**
- The login form calls `useAuth().login`, so passwords are handled only by the library. Use the mutation pattern from PAN-012 (`retry:false`, `gcTime:0`, `meta.handlesOwnErrors`).
- On `TurnstileRequiredError` or `TurnstileFailedError`, show the Turnstile widget, reusing the PAN-012 component. The CSP already allows it.
- `InvalidCredentialsError` → one generic message.
- Drop the template's `min(7)` password rule on login; the server decides.
- No email in toasts or logs (R5).
- Account switch uses `selectAccount`. Logout offers this account (`{accountId}`) or all accounts (`{all:true}`). The library clears local state first, so a failed request still signs out locally; show a toast and still navigate to `/sign-in` with no redirect.

**Rec 7. email_unverified page (criterion 5, R1).**
- Content: an explanation, a button "I've verified my email — continue" that calls `getToken({forceRefresh:true})` and re-runs the gate, "Switch account" and "Sign out".
- **Do not show a resend button and do not call `resendVerification()`.** Under ADM-002d it gets a 403, which the library maps to `ConfigurationError`. Never send another app's `X-MM-App` to get around it; R1 forbids faking.
- Flag the conflict to the owner (Open question 1).

**Rec 8. Out of scope, recorded as follow-ups (R7).**
- The broken `/forgot-password` page and the API function behind it.
- The PAN-012b copy "Sign in to request a new one".
- The sign-in form is rewritten in this ticket anyway, so the "Forgot password?" link it shows is in scope. The planner should not link to a page that always returns 403 (Open question 2).

**Rec 9. ADR: yes — `docs/adr/0003-auth-client-integration.md`. It amends ADR 0001.** It should record:
- the vendored tarball, its SHA-256 and how it is checked;
- the single lazy client in `src/api`;
- `fetchWithToken` as the Bearer transport (Option A versus B);
- the mapping of library errors to `ApiError`;
- that the token never enters React or zustand, and the auth-store is removed;
- the component gate and its limit regarding loaders;
- the query cache cleared on account events;
- mock-mode behaviour;
- ADM-002d consequences.

It is cheap, and any later wiring change can be reversed by superseding it.

**Rec 10. Tests (R8, criterion 6).**
- Build a real `AuthClient` with an injected `fetch`, `storage: null` and `broadcast: false`, which is a mock at the network layer. Do not mock the library module.
- Cover:
  - each gate state;
  - `safeRedirect`;
  - the error mapping, including that `auth` errors are not retried;
  - the cache is cleared on switch and logout;
  - logout of one account and of all;
  - Bearer is never sent to `/api/v1/auth/*`;
  - the token is never written to `localStorage`, `sessionStorage` or `document.cookie`;
  - the not_member and email_unverified pages.

## Risks

1. **Docker and CI breakage** if `vendor/` is not copied before `pnpm install` (F6).
2. **Infinite loading** if `/accounts` hangs, because the library has no timeout. Mitigate with the injected timeout fetch (Rec 2).
3. **Misclassified auth errors** (F3) cause retry storms against a 429-limited `/token` and hide the not_member and email_unverified states. This must be fixed whichever wiring option is chosen.
4. **Cross-account data leak** through the query cache after a switch, a logout or another tab's event, if the cache is not cleared (Rec 4).
5. **Mock mode:** after PAN-010, signing in needs a reachable org-admin-api, locally `make dev` with `http://localhost:5173` registered on app `admin`. A mock sign-in would be the hand-written auth module the owner ruled out.
6. **XSS equals full admin compromise** (library README section 8). The CSP is in place, but `require-trusted-types-for 'script'` is not; record it as a follow-up for appsec.
7. **Revocation lag** of up to 15 minutes after logout or a role change. This is accepted API behaviour; document it.
8. **TypeScript 7 versus 6 `.d.ts` compatibility** (F6): low risk; typecheck will show it.

## Open questions (owner)

1. **Criterion 5 and spec §5.1 versus ADM-002d.** Can criterion 5 be amended to "no resend in admin; explain how to verify through another mmlabs app; refresh the token after verify"? If yes, which app or URL should the page point to?
   - My recommendation: the planner proceeds with Rec 7 and records this as a flagged deviation, not `BLOCKED`, because R1 forbids faking.
   - The orchestrator may block instead if it wants explicit owner sign-off on changing the criterion.
2. **Forgot-password.** In PAN-010, should the "Forgot password?" link be removed or retargeted to another app? And should a follow-up ticket (for example PAN-012c) retire or redirect the `/forgot-password` page and fix the PAN-012b copy?
3. **Mock mode.** Is it acceptable that signing in always needs a real or local API from PAN-010 on, with screens still showing mock data once signed in?

## Relevant paths

- Ticket: `/home/user/admin-pan/work/tickets/PAN-010/ticket.md` and `/home/user/admin-pan/work/tickets/PAN-010/orchestrator-facts.md`
- API client and seam: `/home/user/admin-pan/src/api/client.ts`, `/home/user/admin-pan/src/api/auth-hooks.ts`, `/home/user/admin-pan/src/api/errors.ts` (lines 95-120), `/home/user/admin-pan/src/api/public-auth.ts`, `/home/user/admin-pan/src/api/index.ts`, `/home/user/admin-pan/src/api/config.ts`
- App wiring and state: `/home/user/admin-pan/src/main.tsx`, `/home/user/admin-pan/src/stores/auth-store.ts`, `/home/user/admin-pan/src/lib/query-client.ts`
- Routes and auth UI: `/home/user/admin-pan/src/routes/_authenticated/route.tsx`, `/home/user/admin-pan/src/routes/(auth)/sign-in.tsx`, `/home/user/admin-pan/src/features/auth/sign-in/components/user-auth-form.tsx`, `/home/user/admin-pan/src/components/sign-out-dialog.tsx`, `/home/user/admin-pan/src/features/auth/verify-email/components/verify-email-panel.tsx`
- Build and config: `/home/user/admin-pan/Dockerfile`, `/home/user/admin-pan/eslint.config.js`, `/home/user/admin-pan/vite.config.ts`, `/home/user/admin-pan/docs/adr/0001-api-client.md`
- Library: `/home/user/mmlabs-auth/ts/README.md`, `/home/user/mmlabs-auth/ts/src/bearer.ts` (lines 95-115), `/home/user/mmlabs-auth/ts/src/client.ts`, `/home/user/mmlabs-auth/ts/src/react/index.tsx`
