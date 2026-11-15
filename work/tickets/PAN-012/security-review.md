# Security review — PAN-012

## Attempt 1

**Verdict:** no blockers, one should-fix. The token, password and email handling meets R3 as amended, plus R5 and R6. The one real gap is that the app-wide mutation error toast still fires on these pages.

**Checks run on `claude/great-edison-3g2y0h`:** `pnpm typecheck`, `pnpm lint`, `pnpm format:check` pass. `pnpm test` passes: 44 files, 250 tests. Not run: `pnpm build`, `pnpm audit`. The diff adds no new dependency.

### What I checked and found correct
- **`src/api/client.ts:12-13,51-54,83-84`:** `isPublicAuthPath` uses the parsed pathname (WHATWG parsing resolves `..`/`%2e`; origin check at :45 runs first). `/api/v1/auth/*` gets no `Authorization` and no `notifyUnauthorized`; forced `credentials: 'omit'`, `redirect: 'error'`, `no-store`, `no-referrer` kept and tested.
- **`src/api/config.ts:61-74`:** `appKey()` checked against `^[a-z][a-z0-9-]*$`, fails closed.
- **`src/api/public-auth.ts`:** `X-MM-App` on forgot only; reset sends only `{token, new_password}` (matches `org-admin-api/app/modules/auth/router.py:335-396`); no fake `origin` header (tested).
- **`src/lib/fragment-token.ts`:** `#token=` only, never `?token=`; regex `^[A-Za-z0-9_-]{32,128}$` matches the API; malformed → "invalid link", no request; stripped via `router.history.replace('/reset-password')`; token only in component state and mutation body. The `useState` initialiser (instead of the planned ref-guarded effect) is still correct under StrictMode.
- **Turnstile:** imported only by the forgot form, injected lazily from an effect (nothing third-party on `/reset-password`); explicit render; token in React state only, cleared on expiry/error/`reset()`; reset after every submit (`onSettled`); removed on unmount; retryable load; nothing logged; missing site key → config message.
- **Forgot form:** after 202 always the same in-page text without the email; no navigation, no form-level toast; fixed error texts reveal nothing about the account.
- **Reset form:** `PasswordInput` with `autoComplete='new-password'`; toggle state local; mutation `retry: false`, `gcTime: 0`; `token_invalid` → "link expired"; `passwordErrorsFrom` uses fixed texts, never echoes `msg`/`input`; on success form cleared and `/sign-in` link has no `redirect`.
- **`index.html:35`:** `<meta name="referrer" content="no-referrer">`.
- **`.env.example` / `src/vite-env.d.ts`:** `VITE_TURNSTILE_SITE_KEY` listed without value; `.env.local`, `dist` git-ignored.
- **`src/routeTree.gen.ts`:** `/(auth)/reset-password` hangs off root, not `_authenticated` (public, as R3 allows).

### Findings

🟡 **should-fix: the app-wide mutation error handler still toasts the raw API message on forgot and reset**
- **Where:** `src/lib/query-client.ts:41` (`mutationCache: new MutationCache({ onError: handleServerError })`), `src/lib/handle-server-error.ts:8` (`toast.error(error.message.slice(0, 200))`), `src/features/auth/api/mutations.ts:15-28`.
- **Problem:** the cache-level `onError` runs as well as the per-call one, so every failed forgot/reset shows a second toast with server text ("Token is invalid or expired", "Request validation failed", origin/app 403 text, or "Invalid VITE_API_BASE_URL: missing"). The plan requires "No toast" (plan.md:75, 156; 170). No secret leaks today, but it is unfiltered server text on unauthenticated pages and duplicates the `role='alert'` messages (double announcement). Tests miss it because `forgot-password-form.test.tsx:54`, `reset-password-form.test.tsx:36` and `mutations.test.tsx:29` use a bare `new QueryClient()`, not `createQueryClient()`.
- **Fix:**
  1. Opt these mutations out:
     ```ts
     // mutations.ts (both hooks)
     meta: { handlesOwnErrors: true },
     // query-client.ts
     mutationCache: new MutationCache({
       onError: (error, _v, _c, mutation) => {
         if (mutation.meta?.handlesOwnErrors) return
         handleServerError(error)
       },
     }),
     ```
     (A boolean flag holds no user data; update the "no meta" comment at mutations.ts:13.)
  2. Add a test rendering both forms with `createQueryClient()`, failing with 422/403, asserting no sonner toast.

💭 **note: the hash-strip test does not check the address bar is actually cleaned** (`src/lib/fragment-token.test.tsx:7-9,31-40`) — `history.replace` is a `vi.fn()`. Add one test with a real `createRouter` + memory/browser history at `/reset-password#token=…`, asserting `window.location.hash === ''`, `router.state.location.hash` empty, form shown.

💭 **note: token and password stay in the mutation cache after a terminal state** (`reset-password-form.tsx:211-219`) — call `mutation.reset()` next to `form.reset()` in both branches; forgot form line 70 likewise for the email.

💭 **note: the `as never` cast disables type checking for the header object** (`src/api/public-auth.ts:17`) — optionally narrow to `as { 'X-MM-App': string; origin: string }`. Covered by a test today.

💭 **note: `appKey()` does not insist on `admin` in production** (`src/api/config.ts:61-74`) — optional `raw === 'admin'` check in PROD, or leave to PAN-010.

💭 **note: Turnstile script has no integrity check and no CSP yet** (`src/lib/turnstile-loader.ts:21-36`) — Cloudflare does not support SRI for `api.js`; the control is the PAN-022 CSP.

### Follow-ups (out of scope, R7)
- **PAN-010:** remove the hash from the 401 `redirect` value (`src/main.tsx:34`).
- **PAN-022:** CSP (`script-src`/`frame-src https://challenges.cloudflare.com`, `connect-src` API origin, `frame-ancestors 'none'`); `Referrer-Policy: no-referrer` header; self-hosted fonts.
- **Owner/ops:** production Turnstile site key for the admin hostname (test key only in dev/test); register the local dev origin on app `admin`.
- **Forgot form UX:** dedicated "configuration error" text for 403 `app_header_required` / `origin_not_allowed`.
- **org-admin-api docs:** `consumers.md` should recommend `credentials: 'omit'` for forgot; OpenAPI should not declare `origin` as a required header.
