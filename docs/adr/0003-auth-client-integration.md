# ADR 0003: auth-client integration

Status: Accepted pending owner merge (PAN-010). Amends the "auth seam" and "no refresh or retry" lines of [ADR 0001](0001-api-client.md).

## Context
R3: sign-in, accounts, sessions and tokens go only through `@mmlabs/auth-client` (org-admin-api USR-08, repo `mmlabs-online/mmlabs-auth`). The owner ruled out a hand-written auth module (2026-11-15/16). The `aud=admin` token must stay in memory (R3), and every route except the auth pages needs a guard.

## Decision
- **Vendored artifact.** The library is installed from the release tarball `vendor/mmlabs-auth-client-0.1.0.tgz` (`ts-v0.1.0`), never built from source. `vendor/SHA256SUMS` holds its SHA-256, checked by `sha256sum -c` in CI before `pnpm install` and in the Dockerfile before the install. The lockfile also pins the integrity hash. Dependabot does not see `file:` dependencies, so upgrades are manual: download the new tarball, compare its hash with the release notes, replace both files, `pnpm add ./vendor/...`.
- **One lazy client in `src/api/auth-client.ts`** (`getAuthClient()`), built from `VITE_API_BASE_URL` and `VITE_APP_KEY`. `apiOrigins` is the same API origin that the CSP `connect-src` already allows. Its `fetch` is `authTimeoutFetch`, which gives library calls to `/api/v1/auth/*` a 15 s timeout so that the app cannot hang on "Restoring your session…". Lint allows `@mmlabs/auth-client` only in `src/api/` (and tests).
- **D1: `fetchWithToken` is the Bearer transport.** `createApiClient` takes `bearerFetch`; admin paths go through it, `/api/v1/auth/*` never does. The library then refreshes the token and retries once on a 401 (throttled, pinned to the account, only to allowed origins). openapi-fetch hands over a `Request` with a body for writes, and the library does not replay those. That is acceptable under R9 (no automatic replay of writes); proactive refresh makes it rare. `src/api/client.ts` stays the only caller, so R2 holds. The old `setAccessTokenProvider` is gone.
- **Errors.** Library errors map to `ApiError`: `NetworkError` to `network`, `ConfigurationError` to `config`, any other `AuthError` to the new kind `auth` (code, status, `retryAfter`), with fixed messages. `auth` is never retried and never toasted, except `rate_limited`. `authFailure()` gives UI code the same classification as data.
- **No token in React, zustand or the query cache.** `src/stores/auth-store.ts` is deleted. The gate only awaits `getToken()` to learn whether the account may use the admin app.
- **D2: component gate, not `beforeLoad`.** `AuthGate` in `routes/_authenticated/route.tsx` reads `useAuth()`, which is reactive: logout in another tab, account switch and a revoked session re-render it without a navigation. Limit: a future route loader that fetches must run inside the gate (for example as a query in the component) or the check must move to `beforeLoad`. Without a ready session a loader gets no token anyway (`no_account_selected`).
- **D3: access pages are rendered in place** by the gate (picker, "No access to the admin app", "Verify your email address", 429/network/config/rejected panels), not as routes. The state comes from `getToken()`, not from a forgeable URL, the target URL is kept, and there are no redirect loops.
- **Redirect.** The `redirect` search value is produced and consumed only through `safeRedirect()` (same-origin path and search, never the hash, never an auth page). An explicit sign-out never carries one.
- **Cache.** The query cache is cleared on every auth event (`clearOnAuthChange`), including events from other tabs, so one account never sees another's data.
- **Final 401.** After the library's single retry, the API client's 401 sets a signal; the gate lists accounts again and forces a token refresh. A second signal within 60 s shows a "session not accepted" panel instead of looping.
- **No mock sign-in** (owner, 2026-11-16). Signing in always needs a real or local org-admin-api; screen data stays mock until the per-screen tickets.
- **ADM-002d consequences** (the API refuses resend-verification, forgot-password and sign-up for `admin`): no resend button (PAN-010b), no "Forgot password?" link (PAN-012c); the pages tell users to use "any mmlabs app you use", with no link to a specific app.
- **Accepted:** an access token stays valid up to 15 minutes after logout or a role change (library README section 8).

## Alternatives
A `getToken` provider on the API client (we would re-implement retry, throttle and account pinning); `beforeLoad` plus router context (a second copy of the auth status, no reaction outside navigation); `/not-member` and `/email-unverified` routes (forgeable state, redirect loops); a hand-written auth module (owner decision).
