# Security review — PAN-009

## Attempt 1

I found no blockers in the PAN-009 diff. There are 2 cheap should-fix items and 6 notes. The client does what the PLAN-stage recommendations asked for. Nothing in the diff leaks the token, sends cookies, logs, adds a sink that renders HTML, or ships the dev proxy. `pnpm lint` and `pnpm build` pass. Nothing in `dist/` contains `localhost:8000` or `API_PROXY_TARGET`. I did not run `pnpm test` or `pnpm typecheck`; that is the reviewer's job.

### Findings

🟡 **S1 — A single call can override the fixed fetch settings (`src/api/client.ts:15-24` and `:57-66`)**
- **Risk:** openapi-fetch 0.17.0 builds each request with `requestInit = { redirect: "follow", ...baseOptions, ...init }` (`node_modules/openapi-fetch/dist/index.mjs:70-75`). So a feature call such as `api.GET(path, { credentials: 'include', redirect: 'follow', cache: 'default' })` silently undoes the client-level `credentials: 'omit'`, `redirect: 'error'`, `cache: 'no-store'` and `referrerPolicy: 'no-referrer'`.
  - A per-call `baseUrl` is also accepted, but the origin check in `onRequest` catches it before the token is attached. That part is fine.
  - Today nothing does this. But these settings are the main controls against sending cookies to admin paths (ADR-0008 §1), and the lint rule does not stop a feature from passing them.
- **Fix:** force them in `timedFetch`, which every request goes through:
  ```ts
  return fetchImpl(new Request(req, {
    signal: AbortSignal.any([req.signal, AbortSignal.timeout(ms)]),
    credentials: 'omit', redirect: 'error', cache: 'no-store',
    referrerPolicy: 'no-referrer', mode: 'cors',
  }))
  ```
  Add a test in `client.test.ts` that passes `{ credentials: 'include', redirect: 'follow' }` on one call and asserts `seen[0].credentials === 'omit'` and `seen[0].redirect === 'error'`.

🟡 **S2 — The backstop test misses inline-config and dynamic-import bypasses (`src/api/no-http-outside-api.test.ts:35-39`, `eslint.config.js:58-104`)**
- **Risk:** the test only looks for `eslint-disable…no-restricted-*`. These all get past both the lint rule and the test:
  - a file-level inline config such as `/* eslint no-restricted-globals: off */`;
  - a dynamic import such as `await import('openapi-fetch')`, which `no-restricted-imports` does not see;
  - a subpath import such as `openapi-fetch/…`, which is not in the patterns.
- **Fix:**
  - Change the regex to `/eslint(-disable[^\n]*|\s+)no-restricted-(globals|imports|properties)/`.
  - Add `/import\(\s*['"](axios|openapi-fetch|ky|ofetch)/` to the list of offender patterns.
  - Add `'openapi-fetch/*'` to `patterns[0].group`.
  - Optionally set `linterOptions: { noInlineConfig: true }` for `src/**`, excluding `src/api/**` and tests. Check first that this does not break the existing `@tanstack/query/exhaustive-deps` disable in `queries.ts`; if it does, keep only the regex change.

💭 **N1 — Repeated 401s after the first one can fire the handler again (`src/api/auth-hooks.ts:25-29`)**
- `notifyUnauthorized` moves to the next epoch on the first 401. A request started after the reset (no token, so 401) belongs to the new epoch and fires the handler again: a second toast and a navigation to `/sign-in?redirect=/sign-in?redirect=…`.
- This is harmless under the mock, because the guard blocks routes once `reset()` has run.
- In PAN-010, start a new epoch only when a new token is set (e.g. `setAccessTokenProvider` or a login event), not on every notify. Also skip notifying when no token was attached.

💭 **N2 — Small leak in the request-epoch map (`src/api/client.ts:44-45`)**
- `epochs.set(id, …)` runs before `await getAccessToken()`. If the provider throws, openapi-fetch does not call `onError` (that only runs for `fetch` failures), so the entry is never deleted. It is a tiny leak.
- Fix: move `epochs.set` after the token is fetched, or wrap the provider call in try/catch and delete the entry there.

💭 **N3 — Malformed 2xx bodies are not mapped to `invalid_response` (`src/api/errors.ts:95-119`)**
- The plan (step 4) mapped a `SyntaxError` on a 2xx to `invalid_response`. In practice openapi-fetch parses the body after the middleware, so a malformed 2xx reaches the caller as a raw `SyntaxError`.
- No security impact: no body is kept, and `handleServerError` shows the generic toast. It is only a slight departure from the plan.
- Fix if wanted: catch it in `unwrap`, or have query functions wrap the error.

💭 **N4 — The 401 redirect uses `location.href` rather than the planned path (`src/main.tsx:34`)**
- The plan said `pathname + searchStr`; the code uses `router.history.location.href`. In TanStack history that is relative (path, query and hash), so it is not an open redirect at this point.
- The real risk is still where the value is read: `user-auth-form.tsx:74` passes `redirectTo` straight to `navigate({ to })`, and `routes/(auth)/sign-in.tsx` accepts any string. This is already deferred to PAN-010 (see Follow-ups).

💭 **N5 — Query 403s are silent by default (`src/lib/query-client.ts:38-41`)**
- This is intentional: the caller handles 403, and a test checks it is not toasted. But it means a screen that forgets to handle 403 shows nothing, and R4 requires a 403 to always be shown.
- Screen tickets that move onto the real API must include a 403 state test, as R8 already requires. The shared `<Forbidden/>` helper is the deferred item for this.

💭 **N6 — `vite preview` inherits the dev proxy (`vite.config.ts:24-31`)**
- Vite's `preview.proxy` defaults to `server.proxy`, so `pnpm preview` also proxies `/api` to `:8000`. It is local only and not part of what nginx serves, so R1 is still met.
- Fix if wanted: add `preview: { proxy: {} }`, or note it in the README.

**Verified clean:**
- **Base URL check** (`config.ts`): accepts an origin only; rejects credentials, path, query and hash; requires https except localhost in dev; fails closed and lazily.
- **Request handling:**
  - The origin check runs before the token is attached, and path parameters are percent-encoded by openapi-fetch.
  - Only `Authorization`, `Accept` and `Content-Type` are sent; no `X-MM-App`.
- **Error handling:**
  - `ApiError` keeps no request, response, headers or URL.
  - The API removes `input`/`ctx` from 422 details (`org-admin-api/app/core/errors.py:96-98`), so `details` cannot echo passwords.
  - Non-JSON and HTML error pages fall back to `http_error`; opaque failures become `network`.
  - 403 is passed through as `ApiError`.
- **Logging and storage:** `console.log` is gone from `main.tsx` and `handle-server-error.ts`; messages are shown as React text and cut at 200 characters; mutations never retry; the auth store is in memory only.
- **Dependencies:** `axios` and its whole transitive tree (`follow-redirects`, `form-data`, …) are gone from the lockfile. The two new deps are pinned exactly: `openapi-fetch` 0.17.0 at runtime, `openapi-typescript` 7.13.0 as a dev dependency.
- **CI and env:** CI has `permissions: contents: read`, and `api:types` runs from the committed snapshot, not production. `.env.example` lists the keys without values.
- **`openapi.json`:** contains no `servers` entry, no hosts or URLs, no examples and no secrets. Only field names like `turnstile_token` appear.

### Follow-ups (out of scope, R7)
1. **PAN-010:**
   - Check `redirect` where the sign-in page uses it: `startsWith('/') && !startsWith('//')` and `new URL(r, location.origin).origin === location.origin`. Also tighten the sign-in search schema in `routes/(auth)/sign-in.tsx`.
   - Start a new 401 epoch on token change (N1).
2. **Existing dependency advisories,** not introduced by this diff (`pnpm audit --prod`: 2 critical, 12 high):
   - `seroval` ≤1.6.7, via `@tanstack/react-router`; critical, `fromJSON` deserialization.
   - `zod` <4.6.6, memory exhaustion (high).
   - `vite` ≤8.1.5, `postcss`, `nanoid` and `source-map-js`, which only affect the dev server and build.
   - Open a `solo:` or ticket to bump `@tanstack/react-router`, `zod`, `vite` and `@tailwindcss/vite`, and add `pnpm audit --prod --audit-level high` to CI (plan follow-up).
3. **CI hardening:** pin `actions/checkout`, `pnpm/action-setup` and `actions/setup-node` to commit SHAs; consider pnpm `minimumReleaseAge`.
4. **PAN-022:** set CSP `connect-src 'self' https://api.mmlabs.online`, using the same origin as `VITE_API_BASE_URL`, plus `frame-ancestors 'none'` and `Referrer-Policy` in nginx.
5. **org-admin-api (unchanged from the PLAN stage):**
   - Non-credentialed Bearer CORS on `/api/v1/*` for the `admin` app's registered origins, with `Expose-Headers: Retry-After`.
   - `Cache-Control: no-store` on admin responses.
   - An error-envelope schema in OpenAPI so `errors.ts` can be generated.

## Attempt 2

S1 and S2 are both closed for the cases I raised in attempt 1. There are no blockers. I found one cheap should-fix (S3, a gap left in the S2 backstop) and four notes. The new `invalid_response` path does not put body text into errors, and the `clone()`/`text()` use does not break how openapi-fetch reads the body. `pnpm lint` is clean and `pnpm test src/api` passes (6 files, 40 tests). Reviewed commit 1484e50 against openapi-fetch 0.17.0.

### S1 is closed: forced fetch settings in `timedFetch` (`src/api/client.ts:21-36`)
- `new Request(req, { credentials:'omit', redirect:'error', cache:'no-store', referrerPolicy:'no-referrer', mode:'cors', signal })` overrides whatever the per-call init set; method, headers (incl. `Authorization`), body and URL are kept. The new test (`client.test.ts:111-120`) checks the Request that reaches `fetchImpl`.

### S2 is closed for the reported cases
- Backstop catches `/* eslint no-restricted-globals: off */`, dynamic `import('axios'|'openapi-fetch'|'ky'|'ofetch')` (incl. subpaths), and `openapi-fetch/*` is restricted. `noInlineConfig` not adopted (optional; acceptable).

### The invalid_response change (`src/api/client.ts:58-79`) introduces nothing new
- No body text in errors (tested with `JSON.stringify(err)` and a marker). `response.clone()` tees the body so openapi-fetch's own read is unaffected. A throw from `onResponse` rejects the call; the epoch entry is deleted first. 204/205/empty bodies return early. No retry storm.

### Findings

🟡 **S3: The backstop still misses a bare `eslint-disable` and multi-rule inline configs (`src/api/no-http-outside-api.test.ts:38`)**
- `/* eslint-disable */` or `// eslint-disable-next-line` with no rule list, and inline configs like `/* eslint semi: 0, no-restricted-globals: 0 */` or `/* eslint "no-restricted-globals": "off" */`, pass both lint and the test. Nothing in `src/` exploits this today (all 21 directives name a specific rule).
- Fix: replace the regex with two checks: `/eslint-disable(-next-line|-line)?(\s*(\*\/|$)|[^\n]*no-restricted-)/m` and `/\/\*\s*eslint\s[^*]*no-restricted-/`.

💭 **N7: Per-call `fetch`/`middleware`/`baseUrl` options can still route around the client's checks (`src/api/client.ts:40-54, 90-101`)** — repeat the origin check in `timedFetch`; optionally narrow the exported client type with `Omit<…>`.

💭 **N8: A non-JSON 2xx is rejected for every call, including future `parseAs: 'text' | 'blob' | 'stream'`** — skip the check unless `options.parseAs === 'json'`.

💭 **N9: A 2xx with a malformed body on a mutation is reported as failure although the write may have happened** — real-API screen tickets should invalidate affected queries on `invalid_response` in mutation `onError`.

💭 **N10: Errors while reading the body surface raw** (`DOMException` on timeout/abort during `clone().text()`) — optional try/catch → `errorFromFetchFailure(e)`.

### Follow-ups (out of scope, R7)
1. PAN-010: N1 (new 401 epoch on token change) and N4 (validate `redirect` on sign-in).
2. Existing `pnpm audit --prod` advisories (e.g. `seroval` via `@tanstack/react-router`) need their own ticket.
3. Real-API screen tickets: N9 mutation pattern and the 403 state test (attempt-1 N5).
