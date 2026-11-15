# PAN-009 — appsec consult (PLAN stage, read-only)

Here is my security input for the PAN-009 HTTP client. The most important item is a blocker on the API side. org-admin-api only answers CORS on `/api/v1/auth/*`. So a browser on `admin.mmlabs.online` cannot call the Bearer admin endpoints at all today. The client can still be built and tested against a mocked network.

## Findings

**F1. Blocker (cross-repo): no CORS on the admin Bearer endpoints.**
- `org-admin-api/app/main.py:53-57` mounts `DynamicCORSMiddleware` with `path_prefix=/api/v1/auth/`. Everything else passes through without CORS headers (`app/core/cors.py:1-7`).
- A cross-origin call that sends `Authorization` triggers a preflight. Nothing answers it, so every admin call fails as an opaque network error.
- org-admin-api already lists this as deferred:
  - ADM-002 `ticket.md:32` (owner A1): "add non-credentialed CORS from `apps[admin].origins`".
  - ADM-002c `plan.md:184`: "Bearer-only CORS on `/api/v1/*` with a fixed allow-list of headers. A strict CSP, no third-party scripts and SRI are gating requirements before any admin UI is served."
  - No backlog row exists for it.
- Under R1 we must not work around this (no BFF or proxy in production). It needs an org-admin-api ticket, and PAN-009 should list it as `Depends on` for the "works against the real API" part.
- Until then, local development can use a dev-only Vite `server.proxy` (same origin, not shipped), or mocks.

**F2. `credentials` mode: the generic client should never send cookies.**
- ADR-0008 §1: admin auth reads only the Bearer header and must not read `__Host-mm_device` (which reaches every path since D20).
- The planned admin CORS is non-credentialed. Using `credentials: 'include'` would need `Allow-Credentials` on admin paths, which widens CSRF and ambient-authority exposure for nothing.
- Recommendation: `credentials: 'omit'` on every request from `src/api/`. The `/api/v1/auth/*` cookie calls belong to `@mmlabs/auth-client` (PAN-010), not to this client.

**F3. The template's axios error handling leaks token-bearing objects and does not match the API.**
- `src/main.tsx:3,24-31,41-70` and `src/lib/handle-server-error.ts:1-27` are built around `AxiosError`.
- An `AxiosError` carries `config.headers.Authorization`. Any `console.log(error)` (`main.tsx:26`, `handle-server-error.ts:5-7`, DEV only today) or any future error reporter would capture the bearer token (R5).
- `handle-server-error.ts:20-24` reads `response.data.title`, which is not the R6 envelope. So the user always sees a generic message.
- `main.tsx:52-58` builds `redirect` from `location.href` and navigates to `/sign-in`. CLAUDE.md says `/login`. The redirect target is not validated, which is an open-redirect risk once login consumes it.
- These should all be replaced by the new error type in this ticket.

**F4. There is no typed or validated env config yet.**
- `src/vite-env.d.ts` only references `vite/client`.
- `.env.example` documents `VITE_API_BASE_URL` as e.g. `http://localhost:8000`, but does not say whether the value includes `/api/v1`.

**F5. What the API sends (`org-admin-api/app/core/errors.py`).**
- Every 4xx comes in the envelope. `message` is a fixed phrase.
- 422 `details` are `[{type, loc, msg}]` and never contain the submitted values.
- 403 `details: {"required": "<key>"}`.
- 429 `details: {"retry_after"}`.
- 401 has `details: null` and `WWW-Authenticate`.
- Unhandled 500s, and anything from Cloudflare or nginx (HTML 502/524 pages), come without CORS headers or the envelope, so the browser shows them as a network error. The client must expect non-JSON bodies and opaque failures.

## Recommendations

**Base URL (`src/api/config.ts`)**
1. Parse once at module load with `new URL(import.meta.env.VITE_API_BASE_URL)` and fail closed: throw at startup, render the error page, never fall back to a default host.
2. Required checks:
   - `protocol === 'https:'` when `import.meta.env.PROD`.
   - `http:` only if `DEV` and the hostname is `localhost`/`127.0.0.1`.
   - No `username`/`password`, no `search`/`hash`.
   - Normalise trailing slashes.
3. Decide whether the value is an origin or ends in `/api/v1` (open question 1). Prefer origin-only, with `/api/v1` added in code, so the CSP `connect-src` can be derived from the same value.
4. Type it in `vite-env.d.ts` (`interface ImportMetaEnv { readonly VITE_API_BASE_URL: string; readonly VITE_APP_KEY: string }`).
5. Unit-test the validator: https ok; http in prod rejected; `javascript:`, `user:pass@`, empty and missing values rejected.

**Request building**
6. Callers pass only a path template plus params. The client builds `new URL(base + path)` and asserts `url.origin === apiOrigin` before sending.
   - This stops a crafted value (`//evil.com`, `https://…`, `..`) from redirecting the Bearer token to another host.
   - Path params must be `encodeURIComponent`-encoded. openapi-fetch does this for simple style; assert it in a test with an id like `../x` or `a/b`.
7. Fixed fetch init:
   - `mode: 'cors'`, `credentials: 'omit'`.
   - `redirect: 'error'`: the API never redirects, and this guarantees the token is not carried to a redirect target.
   - `cache: 'no-store'`, so admin PII and responses are not written to the browser's disk cache.
   - `referrerPolicy: 'no-referrer'` (also set by nginx later).
8. Send only `Authorization`, `Content-Type` (on bodies) and `Accept`.
   - Do not send `X-MM-App` on admin calls: admin auth does not need it, and it would have to be added to the planned fixed CORS allow-list.
   - `X-MM-App: admin` stays with auth-client on `/auth/*` (R2 says "where the API needs it").
9. Token source: inject `getAccessToken: () => Promise<string | null>` into the client (a mock today, `auth-client.getToken('admin')` in PAN-010) instead of importing the zustand store in `src/api/`.
   - Never put the token in a URL, query string, error object, log or toast.
   - Attach it only after the origin assertion in rec. 6.

**Timeouts and abort**
10. Combine TanStack Query's `signal` with `AbortSignal.timeout(ms)` via `AbortSignal.any` (Chromium is the test target; check the browser support baseline). Default around 15 s for GET, configurable.
    - Map aborts to `ApiError{kind:'timeout'|'aborted'}`. Cancelled queries must not show a toast.
11. Never auto-retry mutations. A timed-out POST, PATCH or DELETE has an unknown outcome (R9).
    - Show "result unknown, refresh to check" and invalidate the affected queries.
    - For queries, keep retry off for 4xx and cap it for network errors and 5xx.

**Error type (`ApiError`)**
12. One class with only these fields:
    - `status`, `code`, `message`, `details` (validated `unknown`)
    - `kind: 'http' | 'network' | 'timeout' | 'aborted' | 'invalid_response'`
    - `retryAfter?`
13. It must not keep the `Request`, `Response`, headers or raw body text. Keep the class's `toString`/`message` free of the URL query and body, so a stray log cannot carry PII.
14. Parse with zod `safeParse` on `{error:{code:string,message:string,details:unknown}}`, and only when `content-type` is `application/json`.
    - Otherwise use `code: 'http_error'` and a generic message by status. Never show or log a non-JSON body (Cloudflare HTML).
    - On 2xx, treat non-JSON as `invalid_response`, except 204.
15. Unit tests:
    - Each envelope variant: 401, 403 with `required`, 404, 409, 422 list, 429 with `Retry-After`/`details`.
    - HTML 502, empty body, malformed JSON, network `TypeError`, timeout.
    - A token-shaped string never appears in `String(err)` or `JSON.stringify(err)`.

**Safe display (R6)**
16. Show `error.message` only as React text, and truncate it (e.g. 200 characters).
    - Map 422 `loc`/`msg` to form fields with the existing linked-error pattern (R10). Never render `details` as HTML or as a raw JSON dump.
    - Showing a 403 `details.required` (a permission key) is fine.

**401 and 403**
17. 401: one hook point, `onUnauthorized()`, deduplicated so concurrent 401s cause one re-auth.
    - It may refresh the token and retry once, for queries only. A second 401 calls `onUnauthorized` and does not loop.
    - On sign-out, call `queryClient.clear()` so PII from the previous user does not stay in the cache.
18. The post-login `redirect` must be a same-origin relative path. Validate it with `startsWith('/') && !startsWith('//')` and `new URL(r, location.origin).origin === location.origin`.
    - Store the path only, never the full `href`.
    - Track this as a requirement now, even if PAN-010 implements it.
19. 403: return it to the caller as `ApiError{status:403}`. Never redirect away silently or reset auth. Add a shared `<Forbidden/>`/toast helper (R4).

**Enforcing "no HTTP outside `src/api/`"**
20. ESLint, scoped `files: ['src/**']`, `ignores: ['src/api/**']`:
    - `no-restricted-imports`: `axios`, `openapi-fetch`, `ky`, `ofetch`.
    - `no-restricted-globals`: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`.
    - `no-restricted-properties`: `window.fetch`, `globalThis.fetch`, `self.fetch`, `navigator.sendBeacon`.
    - `src/api/**` gets an override allowing them.
21. Backstop against `// eslint-disable` bypasses:
    - Run lint with `--report-unused-disable-directives`.
    - Add a vitest test that scans `src/**` (excluding `src/api/`) for `fetch(` and `axios`, or the reviewer greps for disables of these rules.
22. Runtime enforcement comes later through CSP `connect-src 'self' <api-origin>` in nginx (PAN-022).

**Dependencies (supply chain)**
23. Prefer native `fetch` plus `openapi-fetch` (one small runtime dependency) and drop `axios` once F3's usages are rewritten.
    - Fetch errors do not carry request headers, which removes F3's token leak.
    - axios has had recent advisories (absolute-URL SSRF/credential leak, `data:` URI DoS), and two HTTP stacks double the surface.
    - Writing the wrapper by hand on plain `fetch` is also acceptable.
24. `openapi-typescript` is a devDependency and the output is a `.d.ts` file (types only, nothing shipped), so the risk is low.
    - Pin exact versions for both packages. Keep `--frozen-lockfile` (CI already does).
    - Keep pnpm 10's default block on lifecycle scripts; do not add these packages to `onlyBuiltDependencies`.
    - Consider `minimumReleaseAge` in `pnpm-workspace.yaml` (pnpm ≥ 10.16).
    - Add `pnpm audit --prod` to CI (follow-up).
25. `pnpm api:types` should read from a local API (`http://localhost:8000/openapi.json`) or a committed snapshot path, never production. CI should only check that the committed `schema.d.ts` is up to date (e.g. diff after regenerating from a pinned snapshot).

**Logging (R5)**
26. Keep `no-console: error`.
    - Remove the existing `console.log(error)` disables in `main.tsx:25-26` and `handle-server-error.ts:5-7`, or reduce them to `{status, code}` only.
    - No request or response logging anywhere in `src/api/`, even in DEV.

## Risks
- **R-a (high):** F1 blocks every real admin call in a deployed environment. If someone "fixes" it with an nginx reverse proxy for `/api` on the admin host, that becomes a quasi-BFF (R1) and adds a token path through another hop. Needs an owner decision; I recommend the API-side non-credentialed CORS.
- **R-b (medium):** Once admin CORS exists, unhandled 500s and Cloudflare errors still return without CORS headers. The UI must show "network or server error" plainly and must not treat the failure as a 401.
- **R-c (medium):** Admin API responses may lack `Cache-Control: no-store`, and the CORS middleware only sets it on `/auth/*`. Client-side `cache: 'no-store'` helps, but intermediaries also need the API-side header. This is a follow-up for org-admin-api.
- **R-d (low):** `Retry-After` is exposed only on `/auth/*`. The new admin CORS must expose it, otherwise use `details.retry_after`, which already exists.
- **R-e (low):** Public `/docs` and `/openapi.json` on the production API, already deferred in ADM-002 `plan.md:222`. Not a client issue, but `api:types` should not depend on it.

## Open questions
1. Is `VITE_API_BASE_URL` an origin (`https://api.mmlabs.online`) or the full prefix (`…/api/v1`)? The CLAUDE.md wording supports either. I recommend origin-only.
2. Owner: which org-admin-api ticket adds non-credentialed Bearer CORS on `/api/v1/*` from `apps[admin].origins`? ADM-002b, or a new ADM ticket? It also needs to cover allowed headers (`Authorization`, `Content-Type`), methods (GET, POST, PATCH, PUT, DELETE), `Expose-Headers: Retry-After` and `Cache-Control: no-store`.
3. For local dev, is a Vite dev-server proxy acceptable (DEV only, not in `dist/`), or should the developer register `http://localhost:5173` on `admin` in the local API? ADM-002c refuses loopback only in staging and production, so local registration is possible.
4. Should PAN-009 remove `axios` and rewrite `main.tsx` and `handle-server-error.ts`, or only add the new client and leave the cleanup to a follow-up? I recommend doing it in PAN-009, since F3 is a token-leak shape and it is what AC "one error type" implies.
5. What default timeout and query retry policy should we use? I propose 15 s for GET, 30 s for mutations, and up to 2 query retries only for network errors and 5xx.

## Files referenced
- /home/user/admin-pan/src/main.tsx
- /home/user/admin-pan/src/lib/handle-server-error.ts
- /home/user/admin-pan/src/vite-env.d.ts
- /home/user/admin-pan/.env.example
- /home/user/admin-pan/eslint.config.js
- /home/user/admin-pan/package.json
- /home/user/org-admin-api/app/main.py
- /home/user/org-admin-api/app/core/cors.py
- /home/user/org-admin-api/app/core/errors.py
- /home/user/org-admin-api/docs/adr/0008-admin-api-authentication.md
- /home/user/org-admin-api/work/tickets/ADM-002/ticket.md
- /home/user/org-admin-api/work/tickets/ADM-002c/plan.md
