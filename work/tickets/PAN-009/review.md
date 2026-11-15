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
