## Findings

**API contract (org-admin-api app/modules/auth/)**
- Emailed links carry the token in the URL **fragment**: `{origin}/reset-password#token=<t>` and `{origin}/verify-email#token=<t>` (password_reset.py:81, email_verification.py:91). The token is NOT a query param, so the search-param schema in the PAN-012 plan must not read `?token=`. The fragment never reaches the server, nginx logs or Referer.
- Token regex: `^[A-Za-z0-9_-]{32,128}$` (schemas.py). Anything else gets 422 `validation_error`. Check it client-side first and show "invalid link" with no request.
- `POST /auth/password/forgot` {email, turnstile_token (required, 1..2048)}: 202 for any email. Per-email limits are silent. Errors: 403 `turnstile_failed`, 403 for missing or bad `X-MM-App`/`Origin` (app context is required, `app_header_required` / `origin_not_allowed`), 422, 429 per-IP.
- `POST /auth/password/reset` {token, new_password ≤128}: 204. Errors: 422 `token_invalid` (one answer for unknown, expired, used, superseded or disabled user), 422 `weak_password` with `details.reasons` in `["too_short","too_common"]`, 422 `validation_error`, 429. A weak password does NOT consume the token, so the user can retry on the same page. No X-MM-App is required. No Turnstile is sent in the body, so the ticket line "Turnstile where required" means forgot only (plus sign-up/sign-in elsewhere). The reset sets no cookie and does not sign the user in, so redirect to /sign-in afterwards.
- `POST /auth/verify-email` {token}: 204, public, per-IP limit 20/60s. Errors: 422 `token_invalid` (expired and used look the same), 429.
- `POST /auth/verify-email/resend` {account_id}: 202. It is **cookie class**: needs the `__Host-mm_device` cookie, `Origin`, `X-MM-App`, and an `account_id`. Errors: 401 session invalid, 403, 409 `email_already_verified`, 422, 429 (5 per 600s per IP, plus per-email backoff and a daily cap, `DailyCapReachedError` is also a 429 with a long retry_after). 429 carries `Retry-After` and `details.retry_after`, and ApiError.retryAfter already parses both.
- Password policy: min length from server settings (the value is not in the OpenAPI or spec; `PasswordPolicy(min_length)`), NFKC-normalised with no trimming, plus a common-password list (server only), max 128.

**Existing admin-pan pieces**
- `createApiClient` forces `credentials: 'omit'`, never sets `X-MM-App`, and its `onRequest` throws if the origin differs from the base URL. Consequences:
  - Forgot will 403 until the client can send `X-MM-App: <VITE_APP_KEY>`. `VITE_APP_KEY` is already in `.env.example` and `vite-env.d.ts`, but is not used by the client.
  - Resend cannot work with `credentials: 'omit'`, because the device cookie is never sent. The admin app's own sign-in is mock/PAN-010, so there is probably no device cookie or `account_id` on the verify page.
- `ApiError` already has `kind` ('network' | 'timeout' | …), `status`, `code`, `details`, `retryAfter`. `UnprocessableDetail {field, reason}` and `ValidationErrorDetail {loc,msg}` types exist. The `weak_password` `details` shape is `{reasons: string[]}`, which is different, so narrow it with a small zod parse.
- Forgot form is a mock (`sleep` plus a toast, which also echoes the email back, so remove that). Route `(auth)/forgot-password.tsx` has no search schema. There are no reset or verify routes yet. The organizations hook example uses `queryOptions` plus an injectable `api` param.
- No Turnstile code or CSP exists yet in the repo (grep found nothing).

## Recommendations

1. **Routes** (`src/routes/(auth)/reset-password.tsx`, `verify-email.tsx`; thin, public, outside the auth guard per R3). Create the route files *before* generating routeTree.gen.ts.
   - Read the token once from `window.location.hash` (`new URLSearchParams(hash.slice(1)).get('token')`) in a `useState` initialiser (or the route `beforeLoad`). Immediately call `history.replaceState(null, '', location.pathname)` (or router `navigate({ hash: undefined, replace: true })`) so the token is not in the address bar, history or the Referer header. Keep it only in component state and never in a query key, a log or a toast. Put the token parse and strip in a small `lib/` helper with a unit test. Keep the token in state across re-renders, and do not re-read it on a retry. If the user reloads after stripping, the page shows "link invalid, request a new one", which is acceptable.
   - Also accept `?token=` as a fallback only if the owner wants it (see Open questions). I recommend not to.
   - Add `<meta name="referrer" content="no-referrer">` (and the existing `referrerPolicy: 'no-referrer'` in the client already covers fetch). Add a `Cache-Control: no-store` hint in nginx for these routes (PAN-022 follow-up).
   - Verify-email: auto-submit once on mount with `useMutation` guarded by a ref (a StrictMode double-invoke would burn the one-time token and show "used"). Better: submit on a button click ("Confirm email"), because email scanners and link prefetchers can't trigger a click. The API token is one-time, so an auto-POST from a client-side hash is safe from prefetchers (they don't execute JS or send the fragment); a button is optional.
   - Reset: show the form only if the token passes the regex. Forgot needs no search schema.

2. **Mutation hooks** in `src/features/auth/api/mutations.ts` (PAN-009 pattern, injectable `api` param):
   - `useForgotPasswordMutation`, `useResetPasswordMutation`, `useVerifyEmailMutation`, `useResendVerificationMutation`. Call `api.POST('/api/v1/auth/password/forgot', { body, headers: { 'X-MM-App': appKey() } })` and `unwrap` (it throws on 204 only if `data === undefined && status !== 204`, so 202/204 are fine).
   - No query invalidation is needed (no cached data is affected). Set `retry: false` and `gcTime` default. Do not put the email, token or password in `mutationKey` or `meta`. Call `mutation.reset()` on unmount of the form so the variables (passwords) don't linger in the cache.
   - X-MM-App: add an optional `appKey` to `createApiClient` (default `import.meta.env.VITE_APP_KEY`) and set the header in `onRequest` for every request, or pass it per call. A client-level default is smaller and needed by PAN-010 too. This is a PAN-009 client change, so make it an explicit plan step with a client test.
   - Resend: needs cookie support (`credentials: 'include'`) which contradicts the client's forced `omit` and R3's "library handles credentials". Recommend deferring resend to the auth-client (PAN-010) and in PAN-012 showing resend only when an `account_id` is available from the auth library; otherwise direct the user to sign in, which presents the unverified-email state. Make this a plan decision, not a hidden hack.

3. **Form schemas** (`features/auth/reset-password/schema.ts`, unit-tested):
   - `email: z.email()`, trimmed. Password: `z.string().min(MIN).max(128)` with a client `MIN` constant of 8 as a *hint only*. The server value is authoritative; the API mirror is advisory, so do not hardcode a stricter rule than the server, and do not trim (NFKC is applied server-side). Add `confirm` with a `.refine` that sets the error on `confirm`. Count length after `.normalize('NFKC')` to match the server.
   - Map 422 in one helper `applyApiErrorToForm(err, form)`:
     - `weak_password`: `details.reasons` → `too_short` → "Password is too short", `too_common` → "This password is too common"; `form.setError('new_password', ...)`. The token stays valid, so keep the form open.
     - `validation_error`: `details` is a list of `{loc, msg}`; map `loc.at(-1)` to field names (`new_password`, `email`), with unknown fields falling to a form-level alert. Do not echo `msg` that may contain the input value (pydantic includes `input`; render our own text only).
     - `token_invalid`: replace the form with an "expired or already used" panel and a link to `/forgot-password`.
   - Use `aria-live="polite"` status regions and `FormMessage` linked errors (R10). Move focus to the status or heading after a state change.

4. **Turnstile** (Vite SPA, no new dependency needed):
   - `src/components/turnstile.tsx`: load `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` once (a module-level promise; script tag with `async defer`), then `window.turnstile.render(el, { sitekey, callback, 'expired-callback', 'error-callback', 'timeout-callback', appearance: 'interaction-only' })`. Cleanup with `turnstile.remove(widgetId)` on unmount. Expose `onToken(token | null)` and a `ref` handle with `reset()`. After every submit (success or failure) call `reset()`, because a Turnstile token is single use.
   - Site key from `VITE_TURNSTILE_SITE_KEY` (add to `.env.example` and `vite-env.d.ts`, R5). If it is missing, render nothing and disable submit with a config error message (don't crash).
   - Submit is disabled until a token exists. Treat 403 `turnstile_failed` as "verification failed, try again" and reset the widget.
   - Script load failure (adblock, offline) → a visible error with a retry button.
   - CSP (nginx, PAN-022 follow-up): `script-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src` the API. Record it as a follow-up, because it is not in this repo's diff.
   - Test double: make the component take the loader from a small module `lib/turnstile-loader.ts` and `vi.mock` it, or set `window.turnstile = { render, remove, reset }` fakes in the test that call the `callback` synchronously with `'test-token'`. Cloudflare's published dummy site key `1x00000000000000000000AA` is only for e2e (PAN-023).

5. **States to cover** (one `status` union per page, not many booleans):
   - Forgot: idle, submitting, success (identical message for any email, with the email not echoed — the current toast must go), 403 turnstile (reset widget), 403 app context (config error, generic), 429 (disable submit and show "Try again in N s" using `retryAfter`, with a countdown timer and `aria-live` throttled; fall back to a generic message when `retryAfter` is undefined), network/timeout (retry-able message, keep input), 5xx generic.
   - Reset: invalid-link (no/bad token), idle, submitting, success (message plus link to /sign-in, no auto-login), weak_password field errors, validation_error, token_invalid (expired/used, one message because the API gives one answer, so do NOT claim to distinguish them), 429, network.
   - Verify: no token, verifying, success, token_invalid ("expired or already used", with a way to request a new email), 429 with countdown, network (retry button, since the token is not consumed on a network failure). `email_already_verified` (409, resend only) is shown as success-ish info.
   - Resend: idle, sending, sent, 429 with `retryAfter` (also the daily cap with a long wait, so format as minutes/hours), 409 already verified, 401 (session gone, go to sign-in), network.
   - Never auto-retry mutations, and don't leak the email or token into toasts or logs (R5).

6. **Testing without network (Vitest browser mode)**
   - Use the existing injection pattern: build `createApiClient({ baseUrl: 'https://api.test', fetch: stub })` where `stub` is `vi.fn(async (req: Request) => new Response(...))` and pass it to the hook via the `api` param, or add an optional `api` prop/provider to the pages. Check the request (`req.url`, `req.headers.get('X-MM-App')`, `await req.clone().json()`) in assertions. This avoids MSW. Check how `queries.test.ts` and `client.test.ts` do it and copy.
   - Error responses: `new Response(JSON.stringify({error:{code:'token_invalid',message:'…',details:null}}), {status:422, headers:{'content-type':'application/json'}})`; 429 with `Retry-After: 30` and `details:{retry_after:30}`; network failure with `fetch: () => Promise.reject(new TypeError('x'))`. Use fake timers for the countdown (`vi.useFakeTimers`) and be careful with browser-mode real timers and `AbortSignal.timeout`.
   - Pages need a `QueryClientProvider` (a fresh `QueryClient` with `retry: false` per test) and a TanStack memory router for navigation. For the hash, set `history.replaceState(null,'','/reset-password#token=' + 'a'.repeat(43))` in the test and assert afterwards that `location.hash === ''` and the token never appears in the DOM (R5).
   - Unit tests: hash-token helper, the form schema, the 422 mapping helper, retry-after formatter. Component tests: each state above, with Turnstile doubled.

## Risks
- **Token in fragment vs the plan**: if the plan or code reads `?token=` the feature will not work against the real emails. Confirm this in the plan.
- **Resend is cookie-class** and conflicts with the client's `credentials: 'omit'` and with the mock sign-in. Implementing it before PAN-010 leads either to a broken button or to an R3/R2 violation. Decide scope explicitly.
- **X-MM-App/Origin on forgot**: the local dev origin and the deployed origin must be registered in `apps.origins` for app `admin`, otherwise forgot returns 403 in every environment. The reset-link host is built from the validated Origin, so that origin must also serve `/reset-password` and `/verify-email` (these two paths are fixed by the API).
- **Token burn via double mount** (StrictMode, remount on navigation) on verify. Guard with a ref and by stripping the hash immediately; store the token in state, not re-read.
- **Turnstile**: a single-use token, widget expiry (~5 min) while the user types, third-party script under a future strict CSP, adblock failures. Not testable against the real service (use doubles).
- **Enumeration**: any difference in forgot timing or text (for example echoing the email, different toast for 429 on the same email) breaks the "same message for any email" criterion. Note the per-email limit is silent in the API (always 202); only per-IP gives 429.
- **Client-side min length** can disagree with the server config. Treat the server error as the truth.
- `window.history.replaceState` inside the TanStack router can be overwritten by router navigation. Use the router API or verify with a test.

## Open questions
1. Should the pages support `?token=` as well, or only `#token=` (what the API emits, docs/consumers.md)? I recommend only the fragment.
2. Resend in PAN-012: defer to PAN-010 (no `account_id`/device cookie available in the SPA yet), or extend the client with `credentials: 'include'` for that endpoint only? Who supplies the `account_id`?
3. Is `X-MM-App` set globally in the client (needed by PAN-010 as well) or per call? Who owns that change, PAN-012 or PAN-009 follow-up?
4. What is the server's minimum password length (setting value)? It is not in the OpenAPI schema. Ask the org-admin-api owner whether to expose it (follow-up for org-admin-api, not faked here, R1).
5. `VITE_TURNSTILE_SITE_KEY` value per environment, and is the `admin` app registered in the API with the dev and prod origins?
6. Is the verify page expected to show a "resend" option to signed-out users? The API only allows it for a signed-in device session.

Relevant files: /home/user/admin-pan/src/api/client.ts, /home/user/admin-pan/src/api/errors.ts, /home/user/admin-pan/src/api/index.ts, /home/user/admin-pan/src/features/auth/forgot-password/components/forgot-password-form.tsx, /home/user/admin-pan/src/features/organizations/api/queries.ts, /home/user/org-admin-api/app/modules/auth/router.py, /home/user/org-admin-api/app/modules/auth/schemas.py, /home/user/org-admin-api/app/modules/auth/password_reset.py, /home/user/org-admin-api/app/modules/auth/email_verification.py, /home/user/org-admin-api/app/modules/auth/passwords.py
