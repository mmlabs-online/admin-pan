## PAN-010: AppSec consult (PLAN stage)

**Two blocking conflicts.** (1) The ticket's "resend verification" criterion can't work, because the API refuses `X-MM-App: admin` on that route. (2) The existing `/forgot-password` page has the same problem in production. The library itself is safe to adopt as long as the integration rules below are followed.

Read-only. I read:
- In admin-pan: `CLAUDE.md`, the ticket, `src/api/*`, `src/stores/auth-store.ts`, `src/main.tsx`, `src/routes/**`, sign-in and sign-out code, `nginx/*`, `Dockerfile`, `.dockerignore`, `package.json`, `ci.yml`, `release.yml`.
- In mmlabs-auth `ts/`: all of `src/`, `package.json`, `.npmrc`, `README.md`, `release.yml`.
- In org-admin-api `origin/main`: `docs/consumers.md` and ADR-0008, including the ADM-002d amendment.

### Findings

**F1 🔴 Ticket criterion conflicts with the API contract: admin cannot resend verification.**
- ADR-0008 (ADM-002d amendment) says signup, password forgot and verify-email resend refuse `X-MM-App: admin` with 403 `origin_not_allowed`.
- The library README (line 253) says the same: "admin app cannot host sign-up, forgot-password or resend-verification … Link to another mmlabs app".
- The ticket criterion and spec §5 line 36 ("Resending the verification email … belongs with sign-in (PAN-010)") ask for something the API refuses.
- R1 applies: don't fake it. The planner should ask the owner or record the decision.
- My proposal: the "Email not verified" page explains, links to another mmlabs app for resend, and has a "I've verified — try again" button. That button calls `client.invalidateToken()` then `getToken({ forceRefresh: true })`.
- Also, `src/api/client.ts:33` forces `credentials: 'omit'` for every call, including `/api/v1/auth/*`. A cookie-class call can never go through `src/api/`. If resend ever came back, it would have to use `client.resendVerification()`.

**F2 🔴 Existing `/forgot-password` page will get 403 in production.**
- `src/api/public-auth.ts:14` sends `X-MM-App: admin` to `/auth/password/forgot`. ADM-002d refuses that.
- Spec §5 line 36 still lists the page. This is a spec vs API conflict.
- It is out of PAN-010's diff (R7), so it goes to Follow-ups. But the sign-in page's "Forgot password?" link (`user-auth-form.tsx:116`) leads to a broken flow. The planner should decide whether PAN-010 points that link at another app.

**F3 🟡 Open redirect: two sources, no validation yet.**
- `src/main.tsx:35` uses `router.history.location.href`, which includes the hash.
- `src/components/sign-out-dialog.tsx:19` uses `location.href`, also including the hash.
- `src/routes/(auth)/sign-in.tsx:6` accepts any string.
- `user-auth-form.tsx:74` does `navigate({ to: redirectTo })`.
- Fix: one shared helper, used both when producing and when consuming the value:
```ts
const AUTH_PATHS = new Set(['/sign-in','/forgot-password','/reset-password','/verify-email'])
export function safeRedirect(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 2048) return '/'
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /[\u0000-\u001f\u007f]/.test(raw)) return '/'
  let u: URL
  try { u = new URL(raw, window.location.origin) } catch { return '/' }
  if (u.origin !== window.location.origin || AUTH_PATHS.has(u.pathname)) return '/'
  return u.pathname + u.search            // hash always dropped
}
```
- When producing the value: use `pathname + search` only, and skip it when already on an auth page.
- Route schema: `redirect: z.string().max(2048).optional().catch(undefined)`.
- Navigate with `router.history.push(safeRedirect(r))` or the equivalent `href`. Don't pass a raw `to`.
- Apply it too when `/sign-in` is opened while already `ready`.
- Explicit logout should not carry a `redirect`, so the next user doesn't land on the previous user's view.
- Table tests needed for: `//evil.com`, `/\evil.com`, `/\t/evil.com`, `https://evil.com`, `javascript:alert(1)`, `/sign-in?redirect=…`, a value with a hash, and an over-long value.

**F4 🟡 Token storage: remove the token from zustand.**
- Today `src/stores/auth-store.ts:17-21` holds `accessToken`, `setAccessToken` and `resetAccessToken`. `main.tsx:28` reads it.
- With the library, the token stays in its private `TokenCache`. Wire it as `setAccessTokenProvider(() => authClient.getToken())`.
- Delete `accessToken` and its setters from the store. The README says the token must never enter React state.
- Use `src/api/`, not `fetchWithToken`, so R2 holds.
- Still set `apiOrigins: [apiBaseUrl()]` explicitly so any stray `fetchWithToken` call can only reach the API.
- `user.email` in memory is fine. `role: ['admin:*']` is mock-only and must not decide anything (R4).

**F5 🟡 Errors from `getToken()` inside the request middleware.**
- `client.ts:57` awaits the provider. A `SessionInvalidError`, `NotMemberError`, `EmailUnverifiedError`, `no_account_selected` or `RateLimitedError` would be thrown from `onRequest`.
- Map them to auth-state moves:
  - session invalid → signed-out
  - `not_member` → no-access page (admin is `join_closed`, so never call `join`)
  - `email_unverified` → the F1 page
  - 429 → show `retryAfter`
- Add tests for each, so a raw `AuthError` never reaches the generic error toast or boundary.

**F6 🟡 401 from an admin endpoint.**
- `consumers.md` says: call `/token` once more, and only then sign in again.
- The current handler (`main.tsx:29-37`) goes straight to sign-in.
- Fix: in the unauthorized handler, call `authClient.invalidateToken()` and send the user through the guard/reload. Because the device session is still valid, a revoked role gets a fresh token or a clear `not_member`. Keep the existing epoch so it fires once.

**F7 🟡 Stale data across account switch and logout.**
- Subscribe to `authClient.onChange`, which also fires for broadcasts from other tabs.
- On `account-changed` or `signed-out`: `queryClient.clear()` and reset the zustand store.
- Otherwise account A's admin data (and permission-dependent UI) stays visible to account B. Test it.

**F8 🟡 Logout must not report success when the server call fails.**
- `AuthClient.logout` clears local state and then POSTs. If the POST fails (network or 429), the device session stays valid on the server and a reload lists the account again.
- Catch the error, show it with a retry, and don't toast "signed out".
- "Sign out of all accounts" needs a confirmation that names it (R9).

**F9 🟡 No mock-auth bypass in production builds.**
- `createAuthClient` throws when `baseUrl` is empty, so mock mode needs a branch.
- Gate any mock auth on `import.meta.env.DEV` or the test environment only. Never use a URL parameter, `localStorage` or another runtime flag. Production then can't fall back to mock sign-in.
- Use `allowInsecureLocalhost: import.meta.env.DEV` only.

**F10 🟡 Supply chain: install from a vendored tarball.**
- Commit `vendor/mmlabs-auth-client-0.1.0.tgz` plus `vendor/SHA256SUMS` holding the release-notes SHA-256.
- Check it with `sha256sum -c vendor/SHA256SUMS`:
  - in `ci.yml` before `pnpm install --frozen-lockfile`;
  - in the `Dockerfile`.
- Dockerfile: `COPY package.json pnpm-lock.yaml vendor/ ./vendor/` (or equivalent) must run **before** `pnpm install --frozen-lockfile` (line 10), or the build breaks. `.dockerignore` does not exclude `vendor/`. Good.
- The reviewer must confirm the lockfile entry for `@mmlabs/auth-client@file:vendor/…tgz` has `resolution: {integrity: sha512-…, tarball: file:…}`. That lets frozen-lockfile reject a swapped tarball.
- Unpack the tgz and check `package/package.json` has no `preinstall`, `install`, `postinstall` or `prepare`. The source has none, and pnpm 10 blocks dependency build scripts by default; don't add the package to `onlyBuiltDependencies`.
- Library profile (from source at tag `ts-v0.1.0`, commit `65ff811`):
  - zero runtime dependencies; React is an optional peer (`>=18`);
  - `files: ["dist"]`;
  - no `console.*` calls;
  - error messages are fixed (`mmlabs-auth: <code>`), and server messages and bodies are dropped;
  - it stores only `mm_account_id` (a validated UUID) in `localStorage`;
  - `BroadcastChannel("mmlabs-auth:admin")` carries no token or email;
  - Bearer is refused for `/api/v1/auth/*`;
  - it is single-flight and drops results that arrive after a logout or switch.
- `pnpm audit` doesn't cover `file:` deps. That is acceptable with zero runtime deps. Document the manual upgrade path, since Dependabot won't see it.

**F11 💭 CSP connect-src.**
- The library calls only the `VITE_API_BASE_URL` origin, which `connect-src 'self' @API_ORIGIN@` already covers. No CSP change needed.
- Build the auth client from the same validated `apiBaseUrl()` (`src/api/config.ts`) so the two can't drift.

**F12 💭 Turnstile on login.**
- Login sends `turnstileToken` only after `TurnstileRequiredError`, which comes after 3 failures. ADM-002d leaves login open for admin.
- Reuse `src/components/turnstile.tsx` and `src/lib/turnstile-loader.ts`. CSP already allows `challenges.cloudflare.com` in `script-src` and `frame-src`.
- Reset the widget after every attempt (tokens are single-use) and on `TurnstileFailedError`. Load it only on sign-in.
- `RateLimitedError.retryAfter` should disable submit with a countdown.
- The production site key must list `admin-portal.mmlabs.online` as a hostname; `release.yml:79` already requires the key.

**F13 💭 Error, log and URL hygiene.**
- Show auth errors by `code` with fixed text; offer `requestId` for support.
- No `console.*` with errors, form values or tokens.
- Never put email in a URL (no `?email=` prefill, no email in `not_member` or verify routes).
- Clear the password field after each attempt.
- Add `method='post'` on the sign-in `<form>`, so a native submit before hydration can't put the password in a GET query (nginx would answer 405).
- The current mock toast `Welcome back, ${data.email}` is on screen only. Acceptable, but don't copy it into logs.

### Recommendations (tests for R8)
- Storage hygiene: after login and `getToken`, `localStorage` holds only `mm_account_id` plus the existing UI-pref keys, `sessionStorage` is empty, and `document.cookie` contains no token. Also spy on `console.*` and confirm no email or token is logged.
- Guard: no `_authenticated` child renders and no query runs until status is `ready` and the first token is obtained.
- Covered states: `loading`, `signed-out`, `needs-account`, `error`, `not_member`, `email_unverified`.
- The F3 redirect table, F6 401 → refresh-once, F7 cache cleared on switch, logout and cross-tab events, and F8 logout failure.

### Risks
- XSS on `admin-portal` means full admin compromise: script can call `getToken()`. The strict CSP (`script-src 'self'` plus Turnstile, no `unsafe-inline` in scripts) is the control; keep third-party scripts off.
- Revocation lag: tokens stay valid up to 15 minutes after logout or a role removal.
- The `mm_account_id` UUID persists on shared machines until logout. That is allowed by R3.
- Whoever controls `admin-portal.mmlabs.online` (Cloudflare Tunnel or DNS) can drive the auth flows (ADR-0011).

### Open questions
1. F1: confirm with the owner that resend is dropped from PAN-010, and which mmlabs app the "verify your email" page should link to.
2. F2: drop or replace `/forgot-password` on admin (spec §5 vs ADM-002d)?
3. The release-notes SHA-256 for `ts-v0.1.0` couldn't be checked here (GitHub access to mmlabs-auth isn't enabled in this session). The implementer must record it from the release page. Ideally also rebuild `dist` from the tag and diff it against the tarball.

### Follow-ups (out of scope)
- Fix or remove the admin `/forgot-password` page and `forgotPassword()` in `src/api/public-auth.ts` (ADM-002d).
- Update spec §5 line 36 to match ADM-002d.
- Consider `require-trusted-types-for 'script'` in CSP, once checked against the Turnstile loader and React.
- Deriving UI permissions (R4) from token claims or an API endpoint, to replace the mock `role` (later ticket). Never treat decoded claims as authority.

Relevant files:
- /home/user/admin-pan/src/main.tsx
- /home/user/admin-pan/src/stores/auth-store.ts
- /home/user/admin-pan/src/api/client.ts
- /home/user/admin-pan/src/api/public-auth.ts
- /home/user/admin-pan/src/routes/(auth)/sign-in.tsx
- /home/user/admin-pan/src/components/sign-out-dialog.tsx
- /home/user/admin-pan/src/features/auth/sign-in/components/user-auth-form.tsx
- /home/user/admin-pan/src/routes/_authenticated/route.tsx
- /home/user/admin-pan/Dockerfile
- /home/user/admin-pan/.github/workflows/ci.yml
- /home/user/admin-pan/nginx/security-headers.conf
- /home/user/mmlabs-auth/ts/src/client.ts
- /home/user/mmlabs-auth/ts/README.md
