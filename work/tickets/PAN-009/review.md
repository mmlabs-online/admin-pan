## Attempt 1 — 2026-11-15
Verdict: REWORK

### Checks (run by reviewer)
- pnpm typecheck: exit 0, clean
- pnpm lint: exit 0, clean. Negative check (no file edited): `eslint --stdin --stdin-filename src/features/organizations/x.ts` with `fetch('/x')` and `window.fetch('/y')` fails with `no-restricted-globals` and `no-restricted-properties` ("HTTP only via src/api (R2)")
- pnpm format:check: exit 0, "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): exit 0, 36 files, 209 tests passed (matches impl-log)
- pnpm build: exit 0, built OK
- api:types drift: `pnpm api:types && git diff --exit-code src/api/schema.d.ts` gives no diff
- Snapshot provenance: I regenerated the snapshot from /home/user/org-admin-api (4c01328, both flags on, venv in the scratchpad) and it is byte-identical to `src/api/openapi.json`. The org-admin-api checkout is still clean.
- pnpm e2e: not planned

### Acceptance criteria
- [x] `pnpm api:types` generates `src/api/schema.d.ts` from the org-admin-api OpenAPI (file committed). Evidence: drift check above; `schema.d.ts:367` `"/api/v1/organizations"`, `:842` `Page_OrganizationRead_`; `.github/workflows/ci.yml:28` CI step; `src/api/page.test.ts › Page<T> matches the generated Page_OrganizationRead_` passes typecheck and test.
- [ ] Client parses `{error:{code,message,details}}` and non-JSON errors into one error type, with unit tests. FAILED, see Issue 1. Error responses (4xx/5xx, envelope, HTML, empty, malformed) are covered by `src/api/errors.test.ts` and `client.test.ts › rejects with ApiError …`, and axios is gone from `package.json` and `src`. But a non-JSON or malformed body on a 2xx escapes as a raw `SyntaxError`, not as `ApiError`.
- [x] 401 triggers the re-auth hook point and 403 is surfaced to the caller. Evidence: `client.test.ts › calls the unauthorized handler once for concurrent 401s`, `› … again for a 401 sent after the previous one fired`, `› does not call the unauthorized handler on 403 …`; `queries.test.ts › surfaces a 403 ApiError to the caller`; `query-client.test.ts › does not retry 401, 403, …`; `src/main.tsx` registers `setAccessTokenProvider` / `setUnauthorizedHandler`; the QueryCache has no 403 navigation (`src/lib/query-client.ts`).
- [x] No `fetch`/axios use outside `src/api/` (lint rule or test). Evidence: `eslint.config.js` restriction block plus the `src/api/**` / test override; the negative lint check above; `src/api/no-http-outside-api.test.ts` passes.
- [x] Local dev documented (real API on :8000 or mocks). Evidence: `README.md` section "Local development with org-admin-api" covers mock mode, the proxy to :8000, flags, `set-admin-origins` and `grant-super-admin` (both exist in the org-admin-api Makefile), and type refresh with a provenance line; `.env.example` comments give the value format.

### Issues
#### Issue 1 — 🔴 blocker — correctness / AC2 "one error type" / plan step 4
- **Where**: `src/api/client.ts:49-56` (`onResponse` returns early when `response.ok`); `src/api/errors.ts:95` (`errorFromFetchFailure` has no `SyntaxError` branch).
- **Expected**: Plan step 4 says "`SyntaxError` on a 2xx → `invalid_response`". AC2 asks for one error type, so every failure the client returns is an `ApiError`.
- **Actual**: openapi-fetch 0.17.0 parses 2xx bodies after the middleware has run (`node_modules/openapi-fetch/dist/index.mjs:184-192`: `JSON.parse(raw)` / `response.json()`). `onError` only wraps the `fetch()` call (`:121-154`). So if a 200 comes back with `text/html` (e.g. an SPA `index.html` fallback when the base URL points at the wrong host, `vite preview` without a proxy, or a captive proxy page) or with malformed JSON, the call rejects with a raw `SyntaxError`. As a result, `shouldRetryQuery` retries it up to 3 times as a non-`ApiError`, the QueryCache shows no toast, and callers that check `isApiError` miss it. No test covers this case. The `errorFromFetchFailure` part of the plan cannot work as written, because that function is never called for parse errors.
- **Fix instruction**: In `onResponse`, handle `response.ok` responses that will be parsed, i.e. `response.status !== 204`, `request.method !== 'HEAD'` and the body is non-empty. Read `const text = await response.clone().text()`. If `text` is non-empty and either `content-type` does not include `application/json` or `JSON.parse(text)` throws, delete the epoch entry and throw `new ApiError({ kind: 'invalid_response', status: response.status, code: 'invalid_response', message: 'The server returned an invalid response' })`. Never put the body in the error. Otherwise return `undefined` as today. Add to `src/api/client.test.ts`: `› rejects with ApiError invalid_response for a 200 text/html body` and `› rejects with ApiError invalid_response for a 200 malformed JSON body`. Both should assert `name: 'ApiError'`, `kind: 'invalid_response'`, and that the body text is not in `JSON.stringify(err)`. Note the change in impl-log.md as a deviation from plan step 4 (the mapping lives in `onResponse`, not in `errorFromFetchFailure`).

### Rules R1–R11
No violations found.
- R1: the Vite proxy is dev-server only (`vite.config.ts` `server.proxy`), not in `dist/`.
- R2: HTTP only in `src/api/`. Types are generated. The envelope zod schema is hand-written but flagged in the `src/api/errors.ts` header, as the plan allows.
- R3: the token comes from the provider seam reading the in-memory `auth-store`. Nothing is persisted. `credentials: 'omit'`, no `X-MM-App`.
- R4: 403 is thrown to the caller and never swallowed.
- R5: no console use in `src/api` or `handle-server-error`. `ApiError` holds no request, headers, URL or body (tested). `.env.example` has no values.
- R6: messages are rendered only as toast text, truncated to 200 characters.
- R7: all changed files are in the plan (the `solo:` commit's work/ files are outside this ticket). One eslint-disable for `@tanstack/query/exhaustive-deps` is logged with a reason.
- R9: mutations never retry. The pattern is documented as never optimistic, with invalidation on success.

### Security / a11y blockers
None (to be filled by the orchestrator from security-review.md, if any).

### Nits (do not block)
- 💭 `src/api/page.ts:17-18`: `toPageParams` returns `NaN` for a `NaN` pageSize or pageIndex (e.g. a bad search param). Consider `Number.isFinite` guards that fall back to 20/0.
- 💭 `src/api/config.ts`: `parseApiBaseUrl` receives `prod` but never reads it. Drop it from `Env` or use it.
- 💭 `src/main.tsx`: the 401 handler (store reset, `queryClient.clear()`, redirect) has no test. It was not planned, and PAN-010 replaces it.

### Follow-ups (out of scope)
- org-admin-api: CORS on admin Bearer paths `/api/v1/*` from `apps[admin].origins` (Authorization/Content-Type/Accept, expose Retry-After, `Cache-Control: no-store`).
- org-admin-api: a shared `ErrorEnvelope` schema in the OpenAPI responses; a `make openapi` dump target; optional `X-Request-ID`.
- admin-pan: update the CLAUDE.md "Cross-repo dependencies" paragraph to the origin-only + dev-proxy convention (owner edit).
- admin-pan: `pnpm audit --prod` / `minimumReleaseAge` in CI; CSP `connect-src` (PAN-022); validate `redirect` on consume (PAN-010).

## Attempt 2 — 2026-11-15
Verdict: PASS

### Checks (run by reviewer)
- pnpm typecheck: exit 0, clean
- pnpm lint: exit 0, clean. Negative checks (stdin, no file edited), in `src/features/organizations/*.ts`:
  - `import 'openapi-fetch/dist/index.mjs'` fails with `no-restricted-imports` (new `openapi-fetch/*` pattern).
  - `fetch('/x')` fails with `no-restricted-globals`.
  - `api.GET(…, { fetch: globalThis.fetch })` and `{ fetch: self.fetch }` fail with `no-restricted-properties`.
- pnpm format:check: exit 0, "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): 36 files, 212 tests passed, which matches impl-log attempt 2.
  - I ran the suite 11 times. The first run was a cold start and had 1 failure (211/212). I did not capture which test failed.
  - The next 10 runs passed 212/212 every time. See Follow-ups.
- pnpm build: exit 0, built OK. `dist/` contains no `localhost:8000` and no `API_PROXY_TARGET`.
- api:types drift: `pnpm api:types && git diff --exit-code src/api/schema.d.ts` gives no diff, and the working tree is clean.
- pnpm e2e: not planned

### Attempt-1 blocker and security items
- **Issue 1 (malformed 2xx body escapes as `SyntaxError`): fixed.**
  - `src/api/client.ts:58-79`: `onResponse` now returns `undefined` for 204/205 and for an empty body. Any other 2xx whose content-type is not `application/json`, or whose body fails `JSON.parse`, is thrown as `ApiError { kind: 'invalid_response', status, code: 'invalid_response' }`. The body is never put in the error.
  - Tests:
    - `client.test.ts › rejects with ApiError invalid_response for a 200 text/html body` passes.
    - `client.test.ts › rejects with ApiError invalid_response for a 200 malformed JSON body` passes.
    - Both assert `name`, `kind` and `status: 200`, and that `secret-body` is absent from `JSON.stringify(err)`.
  - impl-log attempt 2 records the deviation from plan step 4.
- **S1 (a per-call init can override the fetch settings): fixed.**
  - `src/api/client.ts:26-34`: `timedFetch` rebuilds every request with `credentials: 'omit'`, `redirect: 'error'`, `cache: 'no-store'`, `referrerPolicy: 'no-referrer'` and `mode: 'cors'`.
  - Test: `client.test.ts › forces credentials omit and redirect error even if a call overrides them` passes. It sends `credentials: 'include'` and `redirect: 'follow'` and checks that `seen[0]` is `omit` / `error`.
- **S2 (backstop misses inline config and dynamic imports): fixed.**
  - `src/api/no-http-outside-api.test.ts:29` adds `/import\(\s*['"](axios|openapi-fetch|ky|ofetch)/`.
  - `:38` changes the regex to `/eslint(-disable[^\n]*|\s+)no-restricted-(globals|imports|properties)/`.
  - `eslint.config.js:71` adds `'openapi-fetch/*'`.
  - I checked the regexes with node:
    - `/* eslint no-restricted-globals: off */` matches.
    - `// eslint-disable-next-line no-restricted-globals` matches.
    - `await import('openapi-fetch')` and `import("axios")` match.
  - `noInlineConfig` was skipped, with a reason logged. The security review called it optional.

### Acceptance criteria
- [x] `pnpm api:types` generates `src/api/schema.d.ts` from the org-admin-api OpenAPI (file committed). Evidence:
  - the drift check above
  - `.github/workflows/ci.yml` api:types step
  - `src/api/page.test.ts › Page<T> matches the generated Page_OrganizationRead_` passes
  - snapshot provenance was verified byte-identical in attempt 1, and `openapi.json` has not changed since.
- [x] Client parses `{error:{code,message,details}}` and non-JSON errors into one error type, with unit tests. Evidence:
  - error responses: `src/api/errors.test.ts` (envelope, HTML, empty, malformed) and `client.test.ts › rejects with ApiError …`
  - 2xx responses: the two new `invalid_response` tests
  - network failures: `client.test.ts › rejects with ApiError network_error when fetch throws`
  - `ApiError` is the only error class. axios is gone from `package.json` and `src`.
- [x] 401 triggers the re-auth hook point, and 403 is surfaced to the caller. Evidence (unchanged since attempt 1, all passing):
  - `client.test.ts › calls the unauthorized handler once for concurrent 401s`
  - `client.test.ts › does not call the unauthorized handler on 403 …`
  - `queries.test.ts › surfaces a 403 ApiError to the caller`
  - `query-client.test.ts › does not retry 401, 403, …`
  - `src/main.tsx` registers the handlers.
- [x] No `fetch`/axios use outside `src/api/` (lint rule or test). Evidence:
  - the `eslint.config.js` restriction block
  - the negative lint checks above
  - `src/api/no-http-outside-api.test.ts`, which now covers the inline-config and dynamic-import bypasses, passes.
- [x] Local dev documented (real API on :8000 or mocks). Evidence: the `README.md` section "Local development with org-admin-api" (unchanged since attempt 1, verified then).

### Issues
None.

### Rules R1–R11
No violations found.
- R7: attempt 2 changed only `src/api/client.ts`, `src/api/client.test.ts`, `src/api/no-http-outside-api.test.ts` and `eslint.config.js`. All four are in the plan's file list. No new dependencies.
- R2, R3 and R5: the forced fetch settings make the "no cookies to admin paths" control hold at the transport layer.
- The `invalid_response` error carries no body.
- The R1/R4/R6/R9 findings from attempt 1 still hold. Nothing in those areas changed.

### Security / a11y blockers
None. S1 and S2 were should-fix items, and both are verified fixed above. This is to be confirmed by the orchestrator if appsec runs again.

### Nits (do not block)
- 💭 `src/api/client.ts:62`: `includes('application/json')` rejects `+json` media types such as `application/problem+json`. org-admin-api sends `application/json` today. Consider `/\bjson\b/` if that changes.
- 💭 `src/api/client.ts:58-79`: every 2xx with a non-JSON body is rejected. A future non-JSON download that uses `parseAs: 'blob' | 'text' | 'stream'` (for example an audit-log CSV export) will need an opt-out.
- 💭 `src/api/client.ts:60`: `response.clone().text()` reads each 2xx body twice, once here and once by openapi-fetch. This is fine at `limit` ≤ 100.
- 💭 A per-call `fetch` option with a custom function, not a global, would bypass `timedFetch`. Lint blocks the obvious forms. The `api` wrapper could strip `fetch` from the init if this ever matters.
- 💭 These attempt-1 nits are still open: `toPageParams` NaN guard, the unused `prod` in `parseApiBaseUrl`, and the untested 401 handler in `main.tsx` (owned by PAN-010). Security N1, N2, N4, N5 and N6 are also still open, as noted in security-review.md.

### Follow-ups (out of scope)
- admin-pan: one cold-start `pnpm test` run failed 1 of 212, and 10 reruns were green. Watch CI for a flaky browser-mode test. If it shows up, open a `solo:` to find it and fix it, for example with a longer `testTimeout` or by awaiting UI state.
- These are carried over unchanged from attempt 1 and security-review.md attempt 1:
  - org-admin-api: Bearer CORS on `/api/v1/*` from `apps[admin].origins`, `Cache-Control: no-store`, and an ErrorEnvelope schema in OpenAPI.
  - admin-pan: dependency advisories and `pnpm audit` in CI.
  - admin-pan: pin CI actions to commit SHAs.
  - PAN-010: redirect validation and the 401 epoch on token change.
  - PAN-022: CSP `connect-src`.
