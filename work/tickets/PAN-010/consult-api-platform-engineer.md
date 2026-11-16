PAN-010 api-platform-engineer consult (admin-pan, read-only)

> Orchestrator note: this consult read a stale org-admin-api checkout. ADM-012 is on origin/main; see `orchestrator-facts.md`, which wins where the two differ.

Limits of this review: I had no shell, so I could not run `git show origin/main:...`. I read the on-disk checkout of org-admin-api (docs/consumers.md, app/core/cors.py, app/core/errors.py, app/modules/admin_auth/deps.py) and /home/user/mmlabs-auth/ts (README, bearer.ts, transport.ts, errors.ts). That checkout has no mention of ADM-012 (grep finds nothing). It is probably stale against origin/main, so please verify the ADM-012 CORS facts below against origin/main.

## Findings

1. **The lib's Bearer path already matches the target wiring.**
   - `fetchWithToken` (bearer.ts) always sets `credentials:"omit"`, deletes `X-MM-App`, and sets `Authorization: Bearer`.
   - It throws `ConfigurationError("bearer_origin_not_allowed")` (status 0, local) if the target origin is not in `apiOrigins`, is not https (or loopback http with the opt-in), or is `/api/v1/auth/*` on the identity origin.
   - On a 401 it fetches a forced token and retries once. This is limited to once per 30 s, skipped for streamed bodies, skipped if the account changed, and the second response is returned whatever its status.
   - admin-pan's `src/api/client.ts` currently does something similar by hand: `credentials:'omit'`, Bearer only off `/api/v1/auth/*`, and no `X-MM-App` (the dev-time middleware never sets it). Its token seam (`auth-hooks.ts`) has no refresh or retry. A 401 only calls `notifyUnauthorized(epoch)`, which fires once per auth epoch.

2. **Contract facts from consumers.md and the code.**
   - The admin Bearer endpoints return 401 `unauthorized` (the envelope code from `_http_exception_handler` / `UnauthorizedError`).
   - On that 401, `WWW-Authenticate: Bearer realm="admin"` is sent, plus `error="invalid_token"` when a token was sent. The code does not tell "missing" from "expired".
   - 403 `permission_denied` carries `details.required` (e.g. `admin:users:read`).
   - 403 `admin_wildcard_required` carries `details.required: "admin:*"`.
   - Other admin-specific 403s: `self_assignment_forbidden`, `self_status_change_forbidden`.
   - 409: `conflict`, `last_super_admin`, `role_has_assignments`.
   - 422: `unprocessable` (details `[{field, reason}]`) and `validation_error` (details `[{type, loc, msg}]`).
   - 429 `rate_limited`: `details.retry_after`, and a `Retry-After` header.
   - Framework errors use the same envelope with codes `not_found`, `method_not_allowed`, `payload_too_large`, and so on.
   - `errors.ts` already handles all of this, including `retryAfter`.

3. **Token endpoint (`/auth/token`) errors the UI must map.**
   - 401 `session_invalid`: show login or the account list.
   - 403 `not_member`: `details.join_available` applies, but `admin` has `join_closed`, so show a "no admin access, ask staff" page.
   - 403 `email_unverified`: resend flow.
   - 403 `audience_mismatch`, `app_header_required`, `origin_not_allowed`, `app_mismatch`, `org_not_supported`: these are a config bug or an unregistered origin. Show a "misconfigured" page with the `request_id` and do not offer retry.
   - 422 `validation_error`.
   - 429 `rate_limited`: show `retryAfter`.
   - The lib maps all of these to classes, so the UI should use `instanceof`, not strings. These classes are `SessionInvalidError`, `NotMemberError`, `EmailUnverifiedError`, `ConfigurationError`, `RateLimitedError` and `NetworkError`.
   - `AuthError.message` is a fixed `mmlabs-auth: <code>`. It never contains the server message, so UI copy must be local.

4. **Resend is not available from admin (important for the ticket).**
   - The README states that for the `admin` app the API answers 403 for sign-up, forgot-password and resend-verification (ADM-002d). `admin` also has `join_closed`.
   - The ticket AC "Email not verified page: resend verification (POST /auth/verify-email/resend)" may therefore 403 in practice.
   - Expect a `ConfigurationError` (`origin_not_allowed` / `app_header_required`) from `resendVerification()`.
   - I could not confirm this against the code. The local checkout only shows the generic 403 codes. The AC should be reconciled with ADM-002d.
   - The page should offer a "verify via another mmlabs app" message as the fallback, plus "I verified, refresh" via `getToken({forceRefresh:true})`.

5. **CORS failure modes.**
   - `DynamicCORSMiddleware` (local checkout) only covers `/api/v1/auth/*`. It is credentialed and only echoes origins registered in `apps.origins`.
   - A CORS refusal on a preflight shows up as `TypeError: Failed to fetch`. The lib maps this to `NetworkError("network_error")`, and `errorFromFetchFailure` in admin-pan maps it to `ApiError{kind:'network'}`. It is indistinguishable from offline.
   - A 403 `origin_not_allowed` is different. The origin passed CORS because it belongs to some app, but it is not this app's `X-MM-App`. That one is readable.
   - A 500 is not readable cross-origin, so it also surfaces as a network error.
   - Allowed headers on the auth preflight are only `Content-Type, X-MM-App`. Methods are GET and POST.
   - Admin Bearer paths: the ticket says ADM-012 adds non-credentialed CORS for them, but the on-disk code does not show it. If it exists on origin/main, it must allow the `Authorization` header and the methods the UI uses (PATCH, PUT, DELETE).
   - Verify this, because `ALLOW_METHODS` here is GET and POST only. Otherwise every admin write will fail with `Failed to fetch`. Add a real-network smoke test to the plan: a preflight with `Authorization` and PATCH from the dev origin.
   - A 401/403 from an admin path only becomes readable if CORS headers are present. Without them, the UI's 401 handling never fires.
   - ADR-0001 still says "Dev-only Vite proxy `/api` to :8000, because admin Bearer paths have no CORS yet". That should be revised (see Recommendations).

6. **Snapshot `src/api/openapi.json`.**
   - It already contains all of `/api/v1/auth/*` (accounts, join, login, logout, token, verify-email, resend, signup, forgot, reset) and the admin paths (apps, roles, permissions, organizations, users, role-assignments).
   - It has 24 `x-permission` annotations.
   - Refresh only if origin/main's OpenAPI differs (check with `pnpm api:types` and a diff). ADM-012 may add no path changes, and may add response headers or nothing.
   - Do not call the generated `/auth/*` operations for cookie-class endpoints from `src/api`. The lib owns those (R3).

## Recommendations

R-1 (R2, R3; AC "Sign-in through auth-client only"; AC "Token in memory only")
- Call admin endpoints through `fetchWithToken` from the auth-client. Do not duplicate refresh logic.
- The cleanest fit with R2 ("only src/api makes HTTP calls") is to pass `auth.fetchWithToken` as the `fetch` option of `createApiClient`. That needs a small adaptation: `timedFetch` builds a `Request` and forces `credentials:'omit'`, which is compatible.
- `fetchWithToken` takes `(input, init)`, and `input` may be a `Request`. `send` re-uses `input.headers`, so it works. But a retry on a `Request` with a body fails (the body is consumed) unless the body is replayable.
- The lib's streamed check covers `input.body !== null`. So every JSON `Request` with a body is treated as streamed, and the 401 retry is skipped for all POST/PATCH calls made through a `Request` object.
- Either pass a string URL plus init with a string body into `fetchWithToken`, or accept no retry on writes.
- Decide this in PLAN, and test it.
- Drop `setAccessTokenProvider` once `fetchWithToken` is plugged in, or keep it for tokens only as a thin shim.

R-2 (R3, R2)
- Pass `apiOrigins: [<VITE_API_BASE_URL origin>]` to `createAuthClient`. It must equal `apiBaseUrl()`, or every call throws `bearer_origin_not_allowed`.
- `allowInsecureLocalhost: import.meta.env.DEV` only. With the dev proxy, the API origin is the page origin, so `apiOrigins` defaults would also work. Pick one and test.

R-3 (401 → one refresh → login; AC "Tests for guard")
- Avoid two refresh layers. Let the lib do the one forced refresh.
- Then the admin-pan middleware's 401 handler (`notifyUnauthorized`) fires only for the final 401 after the retry, and should sign out locally and navigate to login. Clear the account selection first: `getToken` raising `SessionInvalidError` also means "login".
- Do not loop. After the final 401, the guard should treat the session as signed out. Redirect with no hash (see the ticket note), validate `redirect` as a same-origin relative path.
- 403 on admin paths must NOT sign out (R4). It must reach the screen.
- Keep the `isPublicAuthPath` check so the client never attaches a token to `/auth/*` calls it makes itself.

R-4 (error mapping; R2, R4)
- Add a mapping layer in `src/api` (or the auth feature) that converts `AuthError` classes into UI states. Add `AuthError` handling to the TanStack Query retry policy: do not retry `ConfigurationError`, `NotMemberError`, `SessionInvalidError`, `EmailUnverifiedError`, or `RateLimitedError` (rate limit: wait `retryAfter`).
- Provide pages for `not_member` and `email_unverified`, a config-error state (with the requestId, never raw server text), and a rate-limited state showing the countdown.
- Surface `requestId` (X-Request-ID) in error UI for support, as the platform says error responses should be traceable.
- `ApiError` for admin endpoints does not currently capture `X-Request-ID`. Add it to `ApiError` (header only).

R-5 (CORS; R7)
- Verify ADM-012 on origin/main (allowed methods and headers for non-auth paths, which origins, `Access-Control-Allow-Credentials` absent). If it is present, remove the dev proxy from the default path and rewrite ADR-0001's "no CORS yet" line. Otherwise keep the proxy and file a follow-up for org-admin-api.
- Register the local dev origin (`http://localhost:5173`) on app `admin` (`apps.origins`) for the `/auth/*` cookie-class calls. This is needed for login and token. Use `localhost`, not `127.0.0.1`, throughout (the cookie is host-scoped).
- The dev proxy cannot help the `/auth/*` calls if the lib is configured with a different origin. It would be better to point the lib's `baseUrl` at the same origin as the proxy, or at the real local API. Spell out which, with a note that the cookie is `Secure` and `__Host-` prefixed, so it needs https or a browser that accepts it on localhost (consumers.md notes Safari may refuse).
- For production, `VITE_API_BASE_URL` is `https://api.mmlabs.online` and the admin origin must be in `apps.origins`. The CSP `connect-src` must include it (README §8).

R-6 (snapshot)
- Re-dump `/openapi.json` from origin/main and run `pnpm api:types`, then diff. Commit only if it changes. Do not hand-edit. If nothing changed, say so in the impl log.

R-7 (resend verification AC)
- Confirm with the API team whether admin may call `/verify-email/resend`. README says admin cannot host it (403, ADM-002d). If confirmed, adjust the AC (owner decision) and make the page a "verify from another mmlabs app" notice, with a "refresh token" button (`getToken({forceRefresh:true})`) and logout. Do not hit the endpoint just to show a 403.

R-8 (tests, R8)
- Cover these cases with the API mocked at the network layer:
  - 401 followed by a successful retry.
  - 401 twice leading to login.
  - 403 not signing out.
  - `fetchWithToken` refusing `/api/v1/auth/*`.
  - A `TypeError` fetch failure mapped to the network state.
  - `not_member` and `email_unverified` pages.
  - Logout in one and all modes.
  - Redirect validation.

## Risks

- ADM-012 unverified (could not read origin/main). If admin writes (PATCH/PUT/DELETE) are not allowed in preflight, all mutations fail as opaque network errors.
- A `Request` input with a body disables the lib's 401 retry (treated as streamed). If `createApiClient` hands the lib a `Request`, writes silently get no refresh. A 401 on a write after the token expires would then show as a login redirect instead of a transparent retry.
- Two refresh paths (the lib's retry plus `notifyUnauthorized`) could race or produce a double sign-out if not sequenced.
- Token revocation lag up to 15 min after logout or role change (README §8). The UI should call `invalidateToken()` after role-assignment changes affecting the current user.
- Resend AC may be impossible for `admin` (ADM-002d).
- XSS on the admin origin means full admin compromise (README §8); CSP and Trusted Types belong with PAN-022 and must keep `connect-src` limited to the API.
- `localStorage` holds only `mm_account_id`. This fits R3, but `src/` must not add any other persisted value.
- Error messages from the lib are fixed strings, so UI copy must be local and translated, not server text.

## Open questions

1. Is ADM-012 on origin/main, and what exactly does it allow (methods, headers, origins)? Is the Vite dev proxy still needed?
2. Can `admin` call `/auth/verify-email/resend`? If not, amend the AC (owner).
3. Should `createApiClient` take `fetchWithToken` as its fetch, or should the app wrap it so that body-bearing requests keep the lib's one retry? (Decision for PLAN.)
4. Does the API expose a "who am I" admin endpoint, to read the principal's permissions for R4, or are they decoded from the token's `roles` claim? A UI decoding the JWT is a leak risk, and the lib deliberately exposes no token value (`useAccessToken` gives functions only). R4 permission mirroring probably needs a follow-up endpoint in org-admin-api.
5. Which origin does the lib's `baseUrl` use in dev (proxy origin vs `http://localhost:8000`), and has `http://localhost:5173` been registered on app `admin`?

Files read: /home/user/admin-pan/src/api/{client,errors,config,public-auth,auth-hooks}.ts, /home/user/admin-pan/docs/adr/0001-api-client.md, /home/user/admin-pan/work/tickets/PAN-010/ticket.md, /home/user/mmlabs-auth/ts/README.md and src/{bearer,transport,errors}.ts, /home/user/org-admin-api/docs/consumers.md, /home/user/org-admin-api/app/core/{cors,errors}.py, /home/user/org-admin-api/app/modules/admin_auth/deps.py.
