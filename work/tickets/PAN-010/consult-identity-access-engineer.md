## PAN-010 consult: identity-access-engineer (read-only)

> Orchestrator note: this consult read a stale org-admin-api working tree. On origin/main, ADM-002d is done and refuses signup, forgot-password **and** verify-email resend for `X-MM-App: admin`; ADM-012 is done. See `orchestrator-facts.md`, which wins where the two differ.

**Sources.** I had no shell, so I could not run `git show origin/main:…`. I read the org-admin-api **working tree** (`docs/consumers.md`, `docs/identity-architecture.md`, `work/`), and that tree is behind `origin/main`: it still lists USR-08 as BACKLOG. Anything below that depends on org-admin-api `main` has to be re-checked by the orchestrator. Library source is `/home/user/mmlabs-auth/ts` (README.md, src/client.ts, src/react/index.tsx, src/bearer.ts, src/token-cache.ts, src/errors.ts, src/accounts.ts).

### Findings

1. **No guard exists today.** `/home/user/admin-pan/src/routes/_authenticated/route.tsx` only renders `AuthenticatedLayout`. It has no `beforeLoad` or gate, so every route is reachable without signing in.
2. **The mock auth store keeps a token in zustand** (`/home/user/admin-pan/src/stores/auth-store.ts`: `accessToken`, `user.role`, `exp`). It is fed by a mock form (`/home/user/admin-pan/src/features/auth/sign-in/components/user-auth-form.tsx`: `'mock-access-token'`, `min(7)` password rule, `navigate({ to: redirectTo })` without validation). The library's rule is stricter than R3: no token value in React state, context or props. The token must leave the store completely.
3. **The API seam is already right.** `/home/user/admin-pan/src/api/auth-hooks.ts` (`setAccessTokenProvider`, `notifyUnauthorized` with an epoch) and `/home/user/admin-pan/src/api/client.ts` never send Bearer to `/api/v1/auth/*` and use `credentials: 'omit'`. PAN-010 only needs to swap the provider and handler in `/home/user/admin-pan/src/main.tsx`.
4. **The 401 handler leaks the hash and redirects too eagerly.** `main.tsx:35` uses `router.history.location.href`, which includes the hash. The handler also always redirects to `/sign-in` and resets the zustand store.
5. **The library is a good fit** (`ts-v0.1.0`):
   - `login` calls `selectAccount` itself. `mm_account_id` is a UUID in `localStorage`, which R3 allows; nothing else is persisted.
   - Tokens are in memory only and are reused until `expires_in − min(60 s, 20 %)`. There are no timers, concurrent calls share one request, and a request that lands after an account change rejects with `account_changed`.
   - `logout` clears local state and tells other tabs **before** the POST.
   - After a 429 on `/token`, all `getToken` calls are blocked locally for `retryAfter` seconds.
6. **`AuthProvider`'s `"ready"` only means the stored account is in `listAccounts()`.** It does not mean `/token` succeeds. `not_member`, `email_unverified` and `rate_limited` only show up when `getToken()` is called, so the guard must check the token as well.
7. **Admin specifics from the docs:**
   - `admin` answers `join_closed`, and `NotMemberError.joinAvailable` will be false, so there is never a "Continue as" join.
   - Admin Bearer 401 means a missing or bad token **or an unusable user** (disabled or unverified). Disabling a user revokes their account sessions on every device.
   - Token TTL is about 15 min, and there are no refresh tokens.
8. **Conflict about resend on `admin` (affects AC5):**
   - The library README §7 says: "The `admin` app cannot host sign-up, forgot-password or resend-verification: the API answers 403 for those (ADM-002d)."
   - ADM-002d in the working tree (BACKLOG) only lists "Refuse signup and forgot-password with `X-MM-App: admin`" (item 5). Resend is not in it.
   - The admin-pan spec §5.1 and the ticket (owner, 2026-11-15) say resend belongs here.
   - The same README line also clashes with the `/forgot-password` page admin-pan already ships (PAN-012, owner-approved in spec §5.1). Once ADM-002d lands, that page will get 403.
9. **No API source for the signed-in staff member's admin permissions.** The OpenAPI has no `/me` or permissions endpoint, the admin role catalog is refused (D17, ADR-0008), and admin permissions are read from the database on each request. R4 and spec §5.1 ("navigation filtered by permission") cannot be met from data in this ticket.
10. **The no-HTTP lint and test** (`/home/user/admin-pan/src/api/no-http-outside-api.test.ts`, `eslint.config.js`) does not block the library, because it calls `fetch` inside `node_modules`. Creating the client still belongs in `src/api/` (R2/R3).

### Recommendations

- **R3, AC1: one auth client, created at module level** in `src/api/auth-client.ts`:
  - `createAuthClient({ baseUrl: apiBaseUrl(), appKey: 'admin', apiOrigins: [apiBaseUrl()], allowInsecureLocalhost: import.meta.env.DEV })`.
  - Pin `appKey` to `'admin'` (or check `appKey() === 'admin'` and fail loudly).
  - Leave `storage` at its default. Do not pass `sessionStorage` or add any other key.
  - Wrap the app in `<AuthProvider client={auth}>` in `main.tsx`, outside `RouterProvider`.
  - Tests inject `fetch`, `storage: null` (or a memory stub) and `broadcast: false`.
- **R3, AC2: the token never leaves the library.**
  - `setAccessTokenProvider(() => auth.getToken())`.
  - Drop `accessToken`, `setAccessToken`, `resetAccessToken`, `role` and `exp` from `auth-store`. The shell user (email, `displayName`) comes from the `listAccounts()` entry for `accountId`. Never decode the JWT in the UI.
  - Keep using the existing openapi-fetch client; do not use `fetchWithToken` in features (R2).
  - Map `AuthError` thrown by the provider to an `ApiError` (e.g. `kind: 'auth'`, `code`) inside `src/api/`, so TanStack Query error handling stays uniform.
- **AC2: reload behaviour.** On reload `AuthProvider` lists accounts through the `__Host-mm_device` cookie, then the guard calls `getToken()`. Write a test for "reload → token re-issued, never read from storage", and assert that `localStorage` holds only `mm_account_id`.
- **AC4: guard in a gate component**, mounted in `_authenticated/route.tsx`. It renders nothing from the app, and so fires no queries, until it reaches `ok`:
  - `loading` → spinner.
  - `signed-out` → `<Navigate to='/sign-in' search={{ redirect }} replace />`.
  - `needs-account` → account picker ("Continue as …", "Use another account").
  - `error` (network, CORS, 429 or `origin_not_allowed` on accounts) → retry page with `reload()`. **Never redirect to sign-in for this**, or it loops.
  - `ready` → call `getToken()`:
    - success → render children;
    - `NotMemberError` → "No access to admin" page (switch account / sign out of this account, no join);
    - `EmailUnverifiedError` → "Email not verified" page;
    - `RateLimitedError` → wait page with `retryAfter`;
    - `NetworkError` → retry;
    - `SessionInvalidError` → `reload()`;
    - `ConfigurationError` → generic misconfiguration page.

  Optionally add a router-context `beforeLoad` later. A component gate is enough and easier to test.
- **AC4: no open redirect.** Use one pure helper (with unit tests) on both producer and consumer:
  - accept only strings starting with `/`, not `//` and not `/\`, at most about 512 characters;
  - resolve with `new URL(r, location.origin)`, require the same origin, and return `pathname + search` with the **hash dropped**;
  - reject `/sign-in` and other auth paths, falling back to `/`;
  - navigate to the validated path only.

  Fix `main.tsx:35` to build `pathname + searchStr`. On an explicit sign-out, do not carry `redirect`: on a shared machine the next person should not land on the previous user's page.
- **Sign-in form (AC1, AC3):**
  - Call `useAuth().login` only. Password schema is `min(1)` only; the policy is the server's.
  - No retry. Do not keep the password in mutation state or cache. Clear the password field after every submit.
  - Error handling:
    - `InvalidCredentialsError` → one generic message.
    - `TurnstileRequiredError` → render Turnstile (existing `VITE_TURNSTILE_SITE_KEY`) and resubmit.
    - `TurnstileFailedError` → reset the widget.
    - `RateLimitedError` → show the wait time.
    - `ValidationError` / `NetworkError` → generic message.
  - If `login().user.emailVerified === false`, go straight to the "Email not verified" page.
  - Drop the toast that includes the email.
- **Account switch and cache isolation (R4, AC2):**
  - Subscribe to `auth.onChange` (this also covers other tabs) and call `queryClient.cancelQueries()` then `queryClient.clear()`, and bump the `auth-hooks` epoch. Without this, account B sees data and permission-dependent UI cached for account A.
  - After `selectAccount`, navigate to `/`, because the current page may be forbidden for the new account.
- **Logout (R9, AC6):**
  - "Sign out" calls `logout({ accountId })`. Afterwards `AuthProvider` reloads to `needs-account` (picker) or `signed-out` (`/sign-in`).
  - "Sign out of all accounts on this browser" calls `logout({ all: true })` behind a confirm dialog that names the scope.
  - Clear the query cache either way. Logout is never optimistic in the UI sense, but the library already cleared local state.
  - On a network failure, say so: the server session may still exist. Keep the `accountId` so "try again" works, because the library has already cleared `mm_account_id`.
- **Admin 401 handler (R4):** `auth.invalidateToken()`, `queryClient.clear()`, then `useAuth().reload()` (expose it to `main.tsx` through a small bridge). Let the guard decide what to show; do not jump straight to `/sign-in`. Expiry 401s should be rare because of the library's skew, so a 401 usually means the user was disabled or the key rotated. Show 403 `permission_denied` / `admin_wildcard_required` per screen (R4).
- **AC5: "Email not verified" page**, if resend is allowed (see Q1):
  - The resend button calls `auth.resendVerification()`:
    - `"sent"` → neutral "check your email";
    - `"already_verified"` → `getToken({ forceRefresh: true })` and continue;
    - `RateLimitedError` → disable the button until `retryAfter` passes (1/min, 5/day);
    - `SessionInvalidError` → `reload()`.
  - Add an explicit "I've verified, continue" button that calls `getToken({ forceRefresh: true })`; optionally also run it on `visibilitychange` to visible. No polling.
  - On `/verify-email`, after a 204: if an account is signed in, call `auth.invalidateToken()` and show "Continue" instead of "Sign in". The library does not broadcast verification to other tabs.
  - If ADM-002d does refuse resend for `admin`, then on 403 (or by design) show "Verify your email from another mmlabs app" and keep only the "I've verified, continue" path.
- **Tests (AC6, R8).** Use an injected `fetch` in the auth client and mock the admin API at the network layer. Cover:
  - each guard state: loading, signed-out redirect, needs-account picker, `not_member`, `email_unverified`, 429, network error, `listAccounts` error → retry, not a loop;
  - redirect-helper cases (`//evil`, `/\evil`, `https://evil`, `javascript:`, hash dropped, `/sign-in` loop);
  - login errors, including Turnstile;
  - logout one and all, including the network-failure message;
  - account switch clears the query cache;
  - admin 401 → `reload`;
  - resend `sent` / `already_verified` / 429;
  - only `mm_account_id` in storage and no token in zustand.

### Risks

- **XSS is full admin compromise.** Any script on the origin can call `getToken()`. A strict CSP is the real control (R6, PAN-022): no `unsafe-inline` or `unsafe-eval`, Turnstile hosts allowed, and Trusted Types if feasible.
- **Revocation lag.** A token issued in another tab or before a role change stays valid for up to 15 min. That is the API's concern; note it in the plan, don't build around it.
- **Two auth sources during migration.** If any mock path (`sign-out-dialog.tsx`, `nav-user.tsx`, `profile-dropdown.tsx`, `user-auth-form.test.tsx`) still uses `useAuthStore` token fields, the guard can be bypassed or show stale state. Remove the token API from the store so typecheck catches every caller.
- **Status mapping.** Treating `error` or 429 as signed-out causes redirect loops and needless re-logins.
- **Breaking change for `/forgot-password`.** ADM-002d (and possibly resend) will break the existing admin page.
- **Signing in has device-wide effect.** A non-staff user who signs in on admin-pan becomes signed in on the shared device session. Expected, but the "No access" page should offer "Sign out of this account".

### Open questions

1. **Does org-admin-api `main` (or planned ADM-002d) refuse `verify-email/resend` for `X-MM-App: admin`?** The library README says yes; the working-tree ADM-002d says only signup and forgot. If yes, AC5 conflicts with the API and must be reworded. Under CLAUDE.md the spec wins on scope, but the API owns the rule, so the owner decides.
2. **`/forgot-password` on admin after ADM-002d.** Keep the page and accept a 403, or replace it with a link to another mmlabs app? This needs an owner decision and a spec §5.1 update.
3. **Permissions for R4 / spec §5.1.** Record a follow-up for org-admin-api: an endpoint returning the caller's effective admin permissions (e.g. `GET /api/v1/me`), and confirm that nav filtering is out of scope for PAN-010.
4. **Account picker on first sign-in.** Should it list every account on the device, including non-staff ones, or show "No access" only after one is picked? I recommend listing all, because the API is the authority.
