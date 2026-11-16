## Findings (PAN-010, frontend consult)

Current state
- `src/main.tsx` has no auth provider. The seam is `setAccessTokenProvider(() => zustand token)` and `setUnauthorizedHandler`, which navigates with `redirect = router.history.location.href`. That includes the hash, which the ticket says to drop.
- `src/routes/_authenticated/route.tsx` has no `beforeLoad`, so nothing is guarded today. `__root.tsx` already uses `createRootRouteWithContext`, so the router context can carry auth.
- `src/features/auth/sign-in/components/user-auth-form.tsx` is the template mock: `sleep(2000)`, a fake user, `navigate({to: redirectTo})` with an unvalidated redirect, and no Turnstile. The sign-in route's `redirect` is `z.string().optional()`.
- `sign-out-dialog.tsx` calls `auth.reset()` and sets `redirect` to the current location. `nav-user.tsx` and `sidebar-data.user` are static mock data, and the menu still has "Upgrade to Pro" and "Billing" (template leftovers, which touch the R11 no-billing limit; follow-up, not PAN-010).
- `StatusPanel` (a `role=status` panel whose heading takes focus on mount) and `<Turnstile ref onToken>` already exist. The forgot-password form is the pattern to copy: `Turnstile` ref, `turnstileToken` state, a disabled button while the token is missing, `reset()` in `onSettled` because the token is single-use, and `messageFor()` mapping errors to messages.
- The library (`/home/user/mmlabs-auth/ts/src/react/index.tsx`) provides `AuthProvider`, `useAuth()`, `useAccessToken()` and `useJoin()`. `useAuth()` returns status `loading | signed-out | needs-account | ready | error`, plus `accounts`, `accountId`, `login`, `logout`, `selectAccount` and `reload`.
  - `status` is derived from `listAccounts()`. This is the reload-restore path through the device cookie, so a reload is just `loading`, then `ready`.
  - There is no token in React state. `getToken()` is async and `AuthProvider` has no `getAccount` hook.
  - `Account` is `{accountId, email, emailVerified, displayName}`.
  - `status === "ready"` only means the account is listed. It does not mean `getToken()` succeeds, so not_member and email_unverified only surface on `getToken()`.
- Constraints from the README for admin: the app cannot sign up, resend verification or join. `join_closed` always applies and the API returns 403 for resend on `admin` (ADM-002d). This conflicts with the ticket AC "resend verification (`POST /verify-email/resend`)". See the open questions.

## Recommendations

1. Client module and provider placement (R3). Add `src/lib/auth-client.ts` (or `src/auth/client.ts`) that creates one module-level `createAuthClient({baseUrl: VITE_API_BASE_URL origin, appKey: 'admin', apiOrigins: [api origin], allowInsecureLocalhost: import.meta.env.DEV})`.
   - In `main.tsx`, wrap `<AuthProvider client={auth}>` outside `RouterProvider` and inside `QueryClientProvider`.
   - Do not rely on React context inside `beforeLoad`. Pass auth state through the router context instead: `RouterProvider context={{queryClient, auth}}`, where `auth` comes from a small inner `InnerApp` component that calls `useAuth()`. Declare `auth` in the `createRootRouteWithContext` type.
   - Call `router.invalidate()` in an effect when `status` or `accountId` changes, so guards re-run after login, logout, switch or another tab.
   - Delete the zustand token and user fields. Keep `auth-store.ts` only if something remains in it; the `auth.accessToken` use disappears.
   - Update the `AuthUser` comment, and update or delete `auth-store.test.ts`.
2. API seam. `setAccessTokenProvider(() => auth.getToken())`. The seam already allows promises. `src/api/` stays the only HTTP code (R2), so do not use `fetchWithToken` in features. If the API client wants 401 refresh, call `getToken({forceRefresh:true})` once in the existing 401 path. The library's own refresh-once logic only exists inside `fetchWithToken`.
3. Unauthorized handler. Keep the toast. Replace `auth.reset()` with `queryClient.clear()` and `auth.invalidateToken()`. Navigate to `/sign-in` with `redirect = location.pathname + location.search` (no hash). Because `getToken` already failed, this is probably the "session expired" case. Prefer `auth.reload()` and let the guard redirect, which avoids a double navigation.
4. Guard in `_authenticated/route.tsx`.
   - In `beforeLoad({context, location})`, read `context.auth.status`.
   - On `loading`, do not redirect. Either the router waits (see 5) or `beforeLoad` awaits an `auth.reload()`-style promise.
   - On `signed-out`, throw `redirect({to:'/sign-in', search:{redirect: safeRedirect(location.pathname + location.search)}})`.
   - On `needs-account`, throw `redirect({to:'/choose-account', search:{redirect}})`.
   - On `error`, throw `redirect` to an error route, or render a Retry panel with `reload`.
   - On `ready`, the guard still cannot know whether `getToken()` works. See 6.
   - Add `lib/safe-redirect.ts`. It accepts only a string that starts with a single `/`, is not `//`, contains no `\`, no scheme and no control characters, and matches no `/sign-in`-style auth route (loop guard). It falls back to `/`. Use it in the search schema (`.catch(undefined)`) and again where it is consumed. Unit-test it with `//evil.com`, `/\evil.com`, `https://x`, `javascript:`, `/%2F/evil` and tab and newline characters.
   - Also add a `beforeLoad` on the `(auth)` sign-in route that redirects an already `ready` user to `/`.
5. Boot state on reload. `useAuth().status === 'loading'` lasts for one `listAccounts()` round trip. Render a full-screen centered spinner with `role='status'` and `aria-live='polite'` ("Restoring your session…") in `InnerApp` and mount `RouterProvider` only when `status !== 'loading'`. This avoids the sign-in flash and a premature redirect. The initial `router` context is then correct, with no loading branching inside every guard. Do not show the layout skeleton.
6. Token-level errors (not_member and email_unverified). The guard cannot see them from `status`, so use a pre-flight in the authenticated layout.
   - Add a `useQuery(['auth','token-check', accountId], () => auth.getToken(), {retry:false, staleTime: Infinity})` in `AuthenticatedLayout`, or do it once in `beforeLoad` with `await context.auth.getToken()` in a try/catch.
   - `beforeLoad` is preferable: it runs before the child loaders and its result is cached by the library. Map the errors as follows.
   - `EmailUnverifiedError` throws `redirect({to:'/email-unverified'})`.
   - `NotMemberError` throws `redirect({to:'/not-member'})`.
   - `RateLimitedError` and `NetworkError` render a retry error page, not sign-out.
   - `SessionInvalidError` throws redirect to sign-in.
   - Add the same error handling around later API 401 and 403, but that belongs to PAN-009 and later tickets.
   - Put the routes under `(auth)/`, but keep the layout minimal (`AuthLayout` plus `StatusPanel`). They need the account (email) from `useAuth().accounts`. For `not-member`, show "Your account (a***@x.com) has no access to the admin app. Ask an admin to grant access." Do not show a Join button, because admin returns `join_closed`. The page offers switch account and sign out. Mask the email in the UI only if it is also logged, which R5 forbids anyway.
7. Sign-in form. Reuse the forgot-password structure.
   - Schema: `email: z.email`, `password: z.string().min(1)`. Drop the `min(7)` message, because it leaks policy and the API owns validation.
   - `Turnstile` is rendered only after the API asks for it: on `TurnstileRequiredError` or `TurnstileFailedError`, set `needsTurnstile=true` and the widget appears. This matches "after 3 failures, Turnstile". Retry the submit with the token and `reset()` it in `finally`.
   - Error messages, one `role='alert'` paragraph: `InvalidCredentialsError` gives "Email or password is incorrect."; `RateLimitedError` gives `formatRetryAfter(e.retryAfter)` (reuse `lib/retry-after`); `NetworkError` gives "Could not reach the server."; `ValidationError` sets a field error on email; `ConfigurationError` gives a generic "configuration" message; anything else is generic.
   - `autoComplete='username'` / `'current-password'`; put `noValidate` and `aria-busy`.
   - On success, `login()` selects the account and fires the `onChange` events. After login, call `getToken()` once in the form's submit handler (no state). On `EmailUnverifiedError` or `NotMemberError`, navigate to the matching page. Otherwise `navigate({to: safeRedirect(redirectTo), replace:true})` after `router.invalidate()`.
   - Remove the toast.promise and `sleep` mock. Keep the "Forgot password?" link. The library says `admin` cannot sign up or resend; no sign-up link.
8. Account picker (`needs-account`) at `/choose-account`.
   - Use a list of buttons "Continue as <displayName ?? email>", with `aria-label` including the email and a "Not verified" badge. Selecting calls `selectAccount(id)`, `router.invalidate()` and navigates to `safeRedirect`.
   - Include "Use another account" (links to `/sign-in`) and "Sign out of all accounts".
   - Reuse this component for the switcher in the sidebar footer.
9. Header and account switch. Replace the mock `NavUser` props with `useAuth()`.
   - Find the current account in `accounts` by `accountId`; show `displayName`/`email`.
   - Initials fall back from the displayName or email. Remove the avatar image, "Upgrade to Pro", "Billing" and "Notifications" if they do not exist as real routes (follow-up). Add a `DropdownMenuRadioGroup` "Switch account" with the other accounts. On switch call `selectAccount`, then `queryClient.clear()` (the data belongs to another staff member and permissions differ), then `router.invalidate()`. Add "Add another account" (links to `/sign-in`).
   - Switching must also run the `getToken()` pre-flight (item 6), because the new account may not be a member.
   - Two logout items: "Sign out" (this account) and "Sign out of all accounts". Both go through the existing `ConfirmDialog` naming the target: "Sign out alice@…?" and "Sign out all N accounts on this device?" (R9). Not optimistic: `logout` clears local state before the POST by design, so this is a library behaviour. On failure still redirect (the library signed you out locally), but show a toast with the error that the server session may remain. Then `queryClient.clear()` and navigate to `/sign-in` with no redirect param (do not preserve the location after an explicit sign-out; the current dialog does, which should be dropped). If other accounts remain after a one-account logout, the status becomes `needs-account`, so go to `/choose-account` instead. Let the guard decide and just call `router.invalidate()`.
   - Cross-tab: the library emits `signed-out` events, and `AuthProvider` re-lists, so the guard fires through the `invalidate` effect. Add `queryClient.clear()` on the `onChange` event.
10. Email unverified page. See the open question first: README says admin returns 403 on resend. If the owner keeps the AC, the page contains: "Verify your email", "Send the link again" (calls `resendVerification(accountId)`; handle `'sent'`, `'already_verified'` by retrying `getToken({forceRefresh:true})`, 409, 429 with the retry-after time and a disabled button through a countdown), an "I've verified it" button that calls `getToken({forceRefresh:true})` and navigates on success, and an `EmailUnverifiedError` message otherwise. Announce results with `StatusPanel`. Also refresh when the tab regains focus (`visibilitychange`) with one `getToken({forceRefresh:true})` try, silent on failure.
11. Tests (R8), vitest browser mode.
    - Fastest and most faithful: a real `createAuthClient` with injected `fetch`, `storage: null`, `broadcast: false` and `now`. These are the library's documented test hooks, so no MSW is needed. Put a helper `src/test/auth-client.ts` that returns a client plus a `fetch` mock routing `/api/v1/auth/accounts`, `/token`, `/login`, `/logout`, `/verify-email/resend`. Note `baseUrl` must be https (or set `allowInsecureLocalhost`).
    - Do not mock `@mmlabs/auth-client` wholesale; use this helper, which keeps the real status derivation. Tests render `<AuthProvider client>` (and a memory router for the guard).
    - Existing tests mock `useAuthStore`, `useNavigate` and `@/lib/utils`' `sleep`. Rewrite `user-auth-form.test.tsx` and `sign-out-dialog.test.tsx`, because both assume the zustand store.
    - Cases: guard (signed-out redirects with a safe `redirect`; `needs-account` goes to the picker; `loading` shows the boot spinner and no redirect; `ready` renders the outlet); `safeRedirect` table test; login success and redirect, login `invalid_credentials`, `turnstile_required` reveals the widget (mock `loadTurnstile` as in `turnstile.test.tsx`), `rate_limited`, network error; `not_member` and `email_unverified` pages, including resend 200, 409, 429, and refresh after verify; account switch calls `selectAccount` and clears the query cache; logout one and all (confirm names the target, cancel does nothing, failure still lands on sign-in with the error toast); 401 handler; the no-token-in-storage test (assert `localStorage` has only `mm_account_id` and `sessionStorage` is empty after login). Extend `no-http-outside-api.test.ts` if needed so the library is allowed as the exception.
    - Use `getByRole`, and assert focus lands on the `StatusPanel` heading.
12. A11y (R10). Every status/error is `role='alert'` or `role='status'`; the boot spinner is labelled; the picker is a `<ul>` of buttons with visible focus; `aria-describedby` hints for Turnstile (already done); the focus moves to the error heading on the not_member and email_unverified pages. The dropdown radio group is announced as a menu radio group.
13. CSP and build. The README's CSP has `connect-src 'self' https://api.mmlabs.online` and the Turnstile hosts. Hand this to the nginx config (PAN-022, security follow-up). Use `allowInsecureLocalhost` in DEV only. Vendoring the tarball (`vendor/mmlabs-auth-client-0.1.0.tgz` with a recorded SHA-256, installed with pnpm) is the recommended install. The Dockerfile must COPY `vendor/` before `pnpm install`.

## Risks
- Guard races: `useAuth().status` changes asynchronously, and `beforeLoad` runs only on navigation. Without the `router.invalidate()` effect, a logout in another tab leaves the page up. Test it.
- `ready` does not mean the token is available, so an `ready` user can still hit not_member. If the pre-flight is skipped, every page would show 403 errors. Cache the pre-flight per account, and clear it on `selectAccount`.
- Switching accounts leaves stale TanStack Query data from the previous account. Clear the whole cache on switch, logout and cross-tab `signed-out`.
- A StrictMode double mount of `AuthProvider` fires two `listAccounts()` calls. The sequence guard handles it, but tests that count fetch calls must allow for it.
- Open redirect: validate on both produce and consume (search schema plus the sign-in submit). Never use `window.location = redirect`.
- Library errors carry fixed messages and `requestId`; show the `requestId` on the unexpected-error panel to help support, but never log emails.
- Tokens in memory with `exp` up to 15 min. The `Session expired` toast on any 401 must not loop: the handler is once-per-epoch already.
- The AC `resend verification` may be impossible on `admin` (403). Both resend and the unverified flow need the owner's decision.
- Dropdown with static mock `sidebar-data.user` leaks template identity ("satnaing"): replace it.

## Open questions
1. README §7 says the API answers 403 for resend-verification on the `admin` app (ADM-002d), and that sign-up/forgot-password are not hosted on it. The PAN-010 AC and the PAN-012 move say the "Email not verified" page offers resend through the cookie class. Which wins: the page with a resend button, or the page telling staff to verify their email through another mmlabs app and then "I've verified it"? (Forgot-password and reset-password are already on `admin` per PAN-012; confirm they work for the same reason.) Can org-admin-api confirm resend works for app key `admin`?
2. Should `not_member` show any "request access" contact or link? Admin does not accept joins (`join_closed`), so I propose a text-only page with a "Sign out / switch account" action.
3. After an explicit logout of one account while another remains, go to the picker (my proposal) or to sign-in?
4. Is the `/choose-account` route allowed to live outside the `_authenticated` guard, as an `(auth)` route? I assume yes (it needs `needs-account` but not a token).
5. Should the Turnstile widget show on first attempt (always) or only after the API asks for it (`turnstile_required`)? I propose on demand, per the library flow.
6. Should the template leftovers (Billing, Upgrade to Pro, Notifications, team switcher) be removed in this ticket, or recorded as a follow-up per R7/R11?

Files read (absolute): /home/user/admin-pan/work/tickets/PAN-010/ticket.md, /home/user/admin-pan/src/main.tsx, /home/user/admin-pan/src/routes/_authenticated/route.tsx, /home/user/admin-pan/src/routes/(auth)/sign-in.tsx, /home/user/admin-pan/src/features/auth/sign-in/components/user-auth-form.tsx (+ .test.tsx), /home/user/admin-pan/src/features/auth/forgot-password/components/forgot-password-form.tsx, /home/user/admin-pan/src/features/auth/components/status-panel.tsx, /home/user/admin-pan/src/components/turnstile.tsx, /home/user/admin-pan/src/components/layout/nav-user.tsx, /home/user/admin-pan/src/components/sign-out-dialog.tsx, /home/user/admin-pan/src/stores/auth-store.ts, /home/user/admin-pan/src/api/auth-hooks.ts, /home/user/mmlabs-auth/ts/README.md, /home/user/mmlabs-auth/ts/src/react/index.tsx, /home/user/mmlabs-auth/ts/src/types.ts.
