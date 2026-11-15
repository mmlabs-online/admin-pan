Status: READY

# Plan — PAN-009: API client, error envelope and generated OpenAPI types

## Spec summary
- `docs/spec-v1.md` §2: "One web UI where internal staff do every cross-product admin task that org-admin-api exposes." and "Staff sign in with their mmlabs Identity account; what they see and can do follows their `admin:*` permissions."
- `docs/spec-v1.md` §3: "Any backend or database of its own (the API is the only backend, rule R1)."
- `docs/spec-v1.md` §6: "No secrets in the bundle; access token in memory only (R3, R5)." and "Lists use server-side pagination (`limit` ≤ 100)".
- CLAUDE.md R2: "Only `src/api/` makes HTTP calls (`fetch` or axios). It attaches `Authorization: Bearer <token>`, sends `X-MM-App: admin` where the API needs it, parses the error envelope `{"error": {"code", "message", "details"}}` and `Page<T>` (`limit` ≤ 100, `offset`). Features use TanStack Query hooks built on it. Request/response types come from the generated OpenAPI schema, never hand-written copies."
- CLAUDE.md R5: "Build-time config only via `VITE_*` vars (API base URL, …), listed in `.env.example` without values. Never put tokens, passwords or full emails in logs, analytics, error reports or URLs."
- Ticket goal: "One HTTP client in `src/api/` (base URL from `VITE_API_BASE_URL`, error envelope, `Page<T>`), types generated from org-admin-api `/openapi.json`, and a pattern for TanStack Query hooks per feature."
- Owner, 2026-11-15 (PAN-010 ticket notes): "wait for the API team's `@mmlabs/auth-client` (org-admin-api USR-08); no interim hand-written auth module." → PAN-009 provides only a token-provider seam and a 401 hook point; no login, token fetch, refresh or retry logic.

API contract facts used (read from `/home/user/org-admin-api`):
- Envelope `{"error": {"code", "message", "details"}}` for every handled error (`app/core/errors.py`); codes are open-ended strings; `validation_error` details `[{type, loc, msg}]`; `unprocessable` details `[{field, reason}]`; `rate_limited` details `{retry_after}` + `Retry-After` header; 204/304 have no body. 403 `permission_denied` details `{required}` (consult-api-platform-engineer §4).
- `Page[T] = {items, total, limit, offset}`, `limit` 1..100 default 20, `offset` ≥ 0 (`app/core/pagination.py`).
- Admin routes are mounted under `settings.api_prefix = "/api/v1"`, so OpenAPI paths are `/api/v1/...` (`app/main.py:90`, `app/core/config.py:31`).
- Users/RBAC routers only mount with `ADMIN_USERS_API_ENABLED` / `ADMIN_RBAC_API_ENABLED` (`app/main.py:91-95`); flags require an explicit `APP_ENV=local` (`config.py:155`).
- Admin Bearer endpoints need only `Authorization`; no `X-MM-App`, no cookies (ADR-0008 via consults).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `pnpm api:types` generates `src/api/schema.d.ts` from org-admin-api OpenAPI (file committed) | Run `pnpm api:types && git diff --exit-code src/api/schema.d.ts` → no diff. `src/api/openapi.json` (snapshot) and `src/api/schema.d.ts` are committed; `schema.d.ts` contains `'/api/v1/organizations'` and `Page_OrganizationRead_`. CI step "api types up to date" in `.github/workflows/ci.yml` does the same. `src/api/page.test.ts › Page<T> matches the generated Page_OrganizationRead_` passes `pnpm typecheck`. |
| 2 | Client parses `{error:{code,message,details}}` and non-JSON errors into one error type; unit tests | `src/api/errors.test.ts` (all cases listed under Tests) and `src/api/client.test.ts › rejects with ApiError …` pass in `pnpm test`. Only one error class (`ApiError`) exists; `grep -r AxiosError src` returns nothing; `axios` is gone from `package.json`. |
| 3 | 401 triggers re-auth hook point, 403 is surfaced to the caller | `src/api/client.test.ts › calls the unauthorized handler once for concurrent 401s`, `› does not call the unauthorized handler on 403`, `src/features/organizations/api/queries.test.ts › surfaces a 403 ApiError to the caller`, `src/lib/query-client.test.ts › does not retry 401/403`. `src/main.tsx` registers the handler via `setUnauthorizedHandler` and the QueryCache has no 403 navigation. |
| 4 | No `fetch`/axios use outside `src/api/` (lint rule or test) | `pnpm lint` passes; `eslint.config.js` has the restriction block with a `src/api/**` override. Reviewer adds `fetch('/x')` to any `src/features/**/*.tsx` file locally → `pnpm lint` fails with `no-restricted-globals`. Backstop: `src/api/no-http-outside-api.test.ts` passes. |
| 5 | Local dev documented: real API on :8000 or mocks | `README.md` has a section "Local development with org-admin-api" covering: mock mode (default), real API through the Vite dev proxy on `:8000`, required org-admin-api flags/commands, and how to refresh the snapshot + `pnpm api:types`. `.env.example` comment states the value format. |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `package.json` | Add `openapi-fetch` (dependency, exact pin, ≥ 0.13 for `onError` middleware) and `openapi-typescript` (devDependency, exact pin, 7.x); remove `axios`; add script `"api:types": "openapi-typescript src/api/openapi.json -o src/api/schema.d.ts"` | AC1, AC2 (one error type), R2 |
| `pnpm-lock.yaml` | Updated by `pnpm add -E` / `pnpm remove` | Dependency change |
| `src/api/openapi.json` | New: committed OpenAPI snapshot of org-admin-api (sorted keys, both admin flags on) | AC1 — deterministic, offline generation (consult-api-platform-engineer rec. 1) |
| `src/api/schema.d.ts` | New, generated by `pnpm api:types`, committed, never hand-edited | AC1, R2 |
| `src/api/config.ts` | New: `parseApiBaseUrl(raw, { prod, dev })` validator + `apiBaseUrl()` reading `import.meta.env.VITE_API_BASE_URL` | R5, base-URL safety (consult-appsec rec. 1-5) |
| `src/api/errors.ts` | New: `ApiError` class, envelope zod schema, `errorFromResponse()`, `errorFromFetchFailure()`, `isApiError()`, detail types | AC2 |
| `src/api/auth-hooks.ts` | New: `setAccessTokenProvider`, `setUnauthorizedHandler`, internal `getAccessToken`, `currentAuthEpoch`, `notifyUnauthorized` | AC3, owner's seam decision |
| `src/api/client.ts` | New: `createApiClient({ baseUrl, fetch?, timeoutMs? })` on openapi-fetch with one middleware; `unwrap()` helper | AC2, AC3, R2 |
| `src/api/page.ts` | New: `Page<T>` type, `MAX_PAGE_LIMIT = 100`, `toPageParams({ pageIndex, pageSize })` | R2 `Page<T>`, spec §6 `limit` ≤ 100 |
| `src/api/index.ts` | New: public surface — re-exports + lazy memoised `getApi()` singleton built from `apiBaseUrl()` | Features import only from `@/api` |
| `src/api/config.test.ts`, `errors.test.ts`, `auth-hooks.test.ts`, `client.test.ts`, `page.test.ts`, `no-http-outside-api.test.ts` | New unit tests | R8, AC2–AC4 |
| `src/features/organizations/api/queries.ts` | New: the query-hook pattern example (`organizationsKeys`, `organizationsListQueryOptions`, `useOrganizationsQuery`). **Not wired into the screen** (PAN-014 does that) | Ticket goal "pattern for TanStack Query hooks per feature" |
| `src/features/organizations/api/queries.test.ts` | New: tests for the example against an injected fake fetch | R8, AC3 (403 surfaced) |
| `src/lib/query-client.ts` | New: `shouldRetryQuery(failureCount, error, { dev })` and `createQueryClient()` (QueryCache/MutationCache handlers on `ApiError`) | AC3; moves testable logic out of `main.tsx` |
| `src/lib/query-client.test.ts` | New | R8 |
| `src/lib/handle-server-error.ts` | Rewrite around `ApiError`; remove axios and `console.log` | AC2 (one error type), R5 |
| `src/lib/handle-server-error.test.ts` | Rewrite tests for the new behaviour (axios cases and logging cases removed) | R8 |
| `src/main.tsx` | Use `createQueryClient()`; register `setAccessTokenProvider` / `setUnauthorizedHandler`; remove axios | AC3 |
| `src/vite-env.d.ts` | Add `ImportMetaEnv` with `readonly VITE_API_BASE_URL?: string; readonly VITE_APP_KEY?: string` | Typed env (consult-appsec rec. 4) |
| `.env.example` | Comment: value is an origin only (scheme + host + optional port, no path, no `/api/v1`); empty = mock mode; local proxy value `http://localhost:5173` | R5, AC5 |
| `vite.config.ts` | Add dev-only `server.proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:8000' } }` | AC5 — admin Bearer paths have no CORS today (all three consults) |
| `eslint.config.js` | Add `src/api/schema.d.ts` to ignores; add the HTTP-restriction block + `src/api/**` and test-file override | AC4 |
| `.prettierignore` | Add `/src/api/schema.d.ts` and `/src/api/openapi.json` | Generated files stay byte-identical to the generator output so the CI diff check is stable |
| `.github/workflows/ci.yml` | Add step after `pnpm install`: `pnpm api:types && git diff --exit-code src/api/schema.d.ts` | AC1 — types cannot drift from the snapshot |
| `README.md` | New section "Local development with org-admin-api" (+ "Refreshing API types") | AC5 |
| `docs/adr/0001-api-client.md` | New ADR: openapi-fetch + openapi-typescript over axios, origin-only base URL, `ApiError`, auth seam, committed snapshot, dev proxy | Rule 7 (decision outlives ticket); `docs/adr/` is empty so this is 0001 |

The implementer must not touch other files (in particular no screen, route, `src/stores/auth-store.ts`, `CLAUDE.md`, `knip.config.ts`) without recording why in `impl-log.md`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/api/config.test.ts › accepts an https origin and normalises a trailing slash` | base URL |
| `› accepts http://localhost:<port> and http://127.0.0.1 only in dev` | base URL |
| `› rejects http in production` | R5 |
| `› rejects a value with a path (e.g. …/api/v1), query, hash or user:pass@` | origin-only convention, token redirection |
| `› rejects javascript:, empty and missing values` | fail closed |
| `src/api/errors.test.ts › parses the envelope for 401 unauthorized (details null)` | AC2 |
| `› parses 403 permission_denied and keeps details.required` | AC2, AC3 |
| `› parses 404 not_found and 409 conflict` | AC2 |
| `› parses 422 validation_error details [{type, loc, msg}]` | AC2 |
| `› parses 422 unprocessable details [{field, reason}]` | AC2 |
| `› reads retryAfter from the Retry-After header, falling back to details.retry_after` | AC2 |
| `› maps an HTML 502 to code http_error with a generic message and never includes the body` | AC2, R5/R6 |
| `› maps an empty body and malformed JSON to code http_error` | AC2 |
| `› maps JSON that is not an envelope to code http_error` | AC2 |
| `› maps a fetch TypeError to kind network, status 0, code network_error` | AC2 |
| `› maps a TimeoutError to kind timeout and an AbortError to kind aborted` | AC2 |
| `› String(err) and JSON.stringify(err) never contain the bearer token` | R5 |
| `› isApiError narrows and optionally matches a status` | helper |
| `src/api/auth-hooks.test.ts › getAccessToken returns null when no provider is registered` | seam default |
| `› notifyUnauthorized calls the handler once per epoch and advances the epoch` | AC3 de-duplication |
| `src/api/client.test.ts › sends Authorization: Bearer <token> when the provider returns a token` | R2 |
| `› sends no Authorization header when the provider returns null` | seam |
| `› never sends X-MM-App or cookies (credentials omit) and sets redirect error, cache no-store` | consult-appsec F2/rec. 7-8 |
| `› builds the URL from the origin + /api/v1 path and encodes path params (a/b → a%2Fb)` | origin assertion, encoding |
| `› returns typed data for a 200 GET /api/v1/organizations` | happy path |
| `› resolves a 204 DELETE without a body` | 204 handling |
| `› rejects with ApiError on a 4xx envelope` | AC2 |
| `› rejects with ApiError network_error when fetch throws` | AC2 |
| `› rejects with ApiError timeout after timeoutMs` | timeout |
| `› calls the unauthorized handler once for concurrent 401s` | AC3 |
| `› calls the unauthorized handler again for a 401 sent after the previous one fired` | AC3 (no stuck flag) |
| `› does not call the unauthorized handler on 403 and rejects with status 403` | AC3 |
| `src/api/page.test.ts › toPageParams maps pageIndex/pageSize to limit/offset` | Page bridge |
| `› toPageParams clamps limit to 1..100 and offset to ≥ 0` | spec §6 |
| `› Page<T> matches the generated Page_OrganizationRead_` (`expectTypeOf`) | R2 — pins the hand-written generic to the generated schema |
| `src/api/no-http-outside-api.test.ts › no source file outside src/api uses fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon or axios` | AC4 backstop |
| `› no source file outside src/api disables the no-restricted-* rules` | AC4 backstop against `eslint-disable` |
| `src/features/organizations/api/queries.test.ts › organizationsKeys.list includes the page params` | pattern |
| `› organizationsListQueryOptions fetches GET /api/v1/organizations with limit/offset` | pattern, R2 |
| `› surfaces a 403 ApiError to the caller` | AC3 |
| `src/lib/query-client.test.ts › does not retry 401, 403, 404, 422, 429 or aborted` | AC3 |
| `› retries network, timeout and 5xx at most 3 times in production` | retry policy |
| `› does not retry at all in dev` | keeps template behaviour |
| `› mutations never retry` | R9 |
| `› query errors toast only for network/timeout/5xx, not for 401/403/aborted` | AC3 (403 left to caller) |
| `src/lib/handle-server-error.test.ts › toasts the envelope message of an ApiError` | AC2 |
| `› truncates messages to 200 characters` | R6 safe display |
| `› shows a generic message for non-ApiError errors` | fallback |
| `› does not toast for 401 (handled by the unauthorized hook) or aborted requests` | AC3 |
| `› never logs to the console` | R5 |

All network is a fake `fetch` injected through `createApiClient({ fetch })` returning `new Response(...)`; no MSW, no real network.

## Approach
1. **Dependencies.** `pnpm remove axios`; `pnpm add -E openapi-fetch`; `pnpm add -D -E openapi-typescript`. Use the latest stable releases at install time (openapi-fetch ≥ 0.13, openapi-typescript 7.x) and record exact versions in `impl-log.md`. openapi-typescript 7.x declares a `typescript ^5` peer while the repo uses TS ~6.0; a pnpm peer *warning* is acceptable (types-only devDependency) — record it; if install fails hard, stop and record. Do not add either package to `onlyBuiltDependencies`.
2. **Snapshot + types (AC1).** Produce `src/api/openapi.json` offline from the read-only checkout without writing into it:
   ```bash
   cd /home/user/org-admin-api && PYTHONDONTWRITEBYTECODE=1 UV_PROJECT_ENVIRONMENT=<scratchpad>/oaa-venv \
     APP_ENV=local ADMIN_USERS_API_ENABLED=true ADMIN_RBAC_API_ENABLED=true \
     uv run --frozen python -c "import json; from app.main import create_app; print(json.dumps(create_app().openapi(), indent=2, sort_keys=True))" \
     > /home/user/admin-pan/src/api/openapi.json
   ```
   Fallbacks, in order: a locally running org-admin-api with both flags (`curl http://localhost:8000/openapi.json`); last resort the public `https://api.mmlabs.online/openapi.json` (missing users/RBAC routes — acceptable for PAN-009 because only `/api/v1/organizations` is used; record it in `impl-log.md` and the README provenance line). Then `pnpm api:types`. Never hand-edit either file.
3. **`src/api/config.ts`.** `parseApiBaseUrl(raw, { prod, dev })`: `new URL(raw)`; require `pathname === '/'` (origin only, no `/api/v1` — OpenAPI paths already carry the prefix), no `search`/`hash`/`username`/`password`; `https:` always allowed, `http:` only when `dev` and hostname is `localhost`/`127.0.0.1`; return `url.origin`. Empty/missing → throw. `apiBaseUrl()` calls it with `import.meta.env`. Validation runs **lazily on first `getApi()`**, not at module load, so mock mode (empty value) and `pnpm build` with an empty value keep working; a bad value fails closed on first use with `ApiError{ kind: 'config', code: 'config_error' }`.
4. **`src/api/errors.ts`.** `class ApiError extends Error` with only `name = 'ApiError'`, `kind: 'http' | 'network' | 'timeout' | 'aborted' | 'invalid_response' | 'config'`, `status` (0 when no response), `code: string`, `message`, `details: unknown`, `retryAfter?: number`. It never stores the `Request`, `Response`, headers, URL or raw body. `errorFromResponse(res)`: only if `content-type` includes `application/json`, `safeParse` with zod `{ error: { code: string, message: string, details: unknown } }`; else `code: 'http_error'` and a fixed message by status class ("Request failed (502)"). `retryAfter` from `Retry-After` (integer seconds) else `details.retry_after`. `errorFromFetchFailure(e)`: `TimeoutError` → `timeout`, `AbortError` → `aborted`, `SyntaxError` on a 2xx → `invalid_response`, else `network` / `network_error`. Export detail types `ValidationErrorDetail = { type: string; loc: (string | number)[]; msg: string }`, `UnprocessableDetail = { field: string; reason: string }`. File header comment: "Hand-written: the envelope is not in org-admin-api OpenAPI (errors.py, R6); see follow-up." This is the single, flagged exception to R2's "never hand-written copies".
5. **`src/api/auth-hooks.ts` (the seam, no auth logic).** Module state: `provider: () => string | null | Promise<string | null>` (default `() => null`), `handler: () => void` (default no-op), `epoch = 0`. `currentAuthEpoch()` returns `epoch`; `notifyUnauthorized(requestEpoch)`: if `requestEpoch === epoch` → `epoch++` and call `handler()`; otherwise ignore (a concurrent 401 from the same generation). No token is cached here; nothing is persisted (R3). No refresh, no retry (owner 2026-11-15).
6. **`src/api/client.ts`.** `createApiClient({ baseUrl, fetch = globalThis.fetch, timeoutMs })` → `createClient<paths>({ baseUrl, fetch: timedFetch, credentials: 'omit', mode: 'cors', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } })` plus one middleware:
   - `onRequest({ request, id })`: assert `new URL(request.url).origin === baseUrl` (else throw `ApiError` `invalid_request`); remember `currentAuthEpoch()` for `id` in a `Map`; `await getAccessToken()` and set `Authorization: Bearer …` only if non-empty. No `X-MM-App` (admin Bearer endpoints do not need it; cookie calls belong to auth-client, R3).
   - `onResponse({ response, id })`: delete the epoch entry; if `!response.ok` → `err = await errorFromResponse(response)`; on 401 call `notifyUnauthorized(epoch)`; throw `err`. 403 is thrown unchanged to the caller.
   - `onError({ error })`: return `errorFromFetchFailure(error)` (pass through if already `ApiError`).
   - `timedFetch(req)`: `new Request(req, { signal: AbortSignal.any([req.signal, AbortSignal.timeout(ms)]) })`; default `timeoutMs` 15 000 for GET/HEAD, 30 000 otherwise.
   - `unwrap(result)`: returns `result.data`, throws `ApiError` `invalid_response` if undefined on a non-204.
   - No logging anywhere in `src/api/` (R5).
7. **`src/api/page.ts`.** `type Page<T> = { items: T[]; total: number; limit: number; offset: number }`; `MAX_PAGE_LIMIT = 100`; `toPageParams({ pageIndex, pageSize })` → `{ limit: clamp(pageSize, 1, 100), offset: max(0, pageIndex * limit) }`. Screens should prefer the generated `components['schemas']['Page_XRead_']`; `Page<T>` exists for generic table helpers and is pinned to the generated shape by a type test.
8. **`src/api/index.ts`.** Re-export `ApiError`, `isApiError`, detail types, `Page`, `toPageParams`, `setAccessTokenProvider`, `setUnauthorizedHandler`, `createApiClient`, `unwrap`, and `type { paths, components } from './schema'`; `getApi()` memoises `createApiClient({ baseUrl: apiBaseUrl() })`.
9. **Query-hook pattern** (`src/features/organizations/api/queries.ts`): `organizationsKeys = { all: ['organizations'] as const, list: (p) => [...all, 'list', p] as const }`; `organizationsListQueryOptions(params, api = getApi())` returns `queryOptions({ queryKey, queryFn: async ({ signal }) => unwrap(await api.GET('/api/v1/organizations', { params: { query: params }, signal })) })`; `useOrganizationsQuery(params) = useQuery(organizationsListQueryOptions(params))`. Endpoint `GET /api/v1/organizations` declares `admin:organizations:read` (org-admin-api `app/modules/organizations/router.py:24`). The ADR documents the full pattern including mutations (`useMutation` + `queryClient.invalidateQueries({ queryKey: xKeys.all })` on success, never optimistic, R9). The organizations screen keeps its mock provider; PAN-014 swaps it.
10. **`src/lib/query-client.ts`.** `shouldRetryQuery(failureCount, error, { dev })`: `dev` → false; non-`ApiError` → `failureCount < 3`; `kind` network/timeout or `status >= 500` → `failureCount < 3`; everything else (4xx, aborted, config, invalid_response) → false. `createQueryClient()` keeps `refetchOnWindowFocus: PROD`, `staleTime: 10s`, `mutations: { retry: false, onError: handleServerError }`, and a `QueryCache.onError` that toasts "Server or network error" only for network/timeout/5xx. **No** 401 handling here (the client's hook does it once), **no** 403 navigation (callers render it; PAN-011 adds gating), **no** `/500` navigation and no 304 branch (both removed — the API never returns 304 to these calls and navigating away on a transient error loses the screen).
11. **`src/lib/handle-server-error.ts`.** `ApiError` → skip toast for `status === 401` and `kind === 'aborted'`; otherwise `toast.error(truncate(error.message, 200))`. Other errors → `'Something went wrong!'`. No `console.log`. Rendered only as toast text (R6). 422 field mapping is left to forms (screen tickets).
12. **`src/main.tsx`.** `const queryClient = createQueryClient()`; after `router` is created: `setAccessTokenProvider(() => useAuthStore.getState().auth.accessToken || null)` and `setUnauthorizedHandler(() => { toast.error('Session expired!'); useAuthStore.getState().auth.reset(); queryClient.clear(); const redirect = router.history.location.pathname + router.history.location.searchStr; router.navigate({ to: '/sign-in', search: { redirect } }) })`. Redirect is a relative path only (consult-appsec rec. 18); validating it on consume is PAN-010's job. Both registrations are tiny so PAN-010 replaces them with auth-client calls without touching `src/api/`.
13. **ESLint (AC4).** Add `src/api/schema.d.ts` to `ignores`. Add a block for `files: ['src/**/*.{ts,tsx}']` with: `no-restricted-imports` (`paths`: `axios`, `openapi-fetch`; `patterns`: `ky`, `ofetch`, `axios/*`), `no-restricted-globals` (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`), `no-restricted-properties` (`window.fetch`, `globalThis.fetch`, `self.fetch`, `navigator.sendBeacon`), each with message "HTTP only via src/api (R2)". Then an override block `files: ['src/api/**', 'src/**/*.test.{ts,tsx}']` turning these three rules off. Order matters in flat config: override after the restriction block.
14. **Backstop test** `src/api/no-http-outside-api.test.ts`: `import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })`, exclude `/src/api/`, `*.test.*`, `/src/routeTree.gen.ts`, `/src/components/ui/`; assert no match for `/\bfetch\s*\(/`, `/\bXMLHttpRequest\b/`, `/new\s+(WebSocket|EventSource)\b/`, `/sendBeacon/`, `/from\s+['"]axios/`, and `/eslint-disable[^\n]*no-restricted-(globals|imports|properties)/`. (`refetch(` / `prefetch(` do not match `\bfetch`.)
15. **Dev proxy + docs (AC5).** `vite.config.ts` `server.proxy` (dev server only; not part of `dist/`, so not a BFF — R1). README section: (a) mock mode — default, `VITE_API_BASE_URL` empty, screens use `src/features/*/data/`; (b) real API — in org-admin-api `make db-up && make migrate`, then `APP_ENV=local ADMIN_USERS_API_ENABLED=true ADMIN_RBAC_API_ENABLED=true make dev` (`:8000`), `make set-admin-origins ARGS='--origin http://localhost:5173'`, `make grant-super-admin email=…`; in `.env.local` set `VITE_API_BASE_URL=http://localhost:5173` so calls go same-origin through the proxy (`API_PROXY_TARGET` overrides `:8000`); note the proxy hides the missing admin CORS (see follow-up) and that real sign-in arrives with PAN-010, so until then a token must come from the mock store; (c) "Refreshing API types": the snapshot one-liner from step 2, then `pnpm api:types`, commit both; provenance line "snapshot: org-admin-api main as of <date>, flags on".
16. **ADR 0001** (`docs/adr/0001-api-client.md`, Status: Accepted pending owner merge): context, decision (items 2–13 summarised), alternatives (axios, hand-written fetch wrapper, prod URL generation), consequences (hand-written `ApiError`, snapshot refresh per real-API ticket, CORS dependency).
17. Run `pnpm format`, then `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` (R8).

Rules: R1 (no BFF — proxy is dev-only), R2 (single client, generated types; envelope exception flagged), R3 (token in memory via provider seam; nothing persisted; no cookie calls here), R4 (403 surfaced, never swallowed), R5 (no logging, no token in errors, origin-only validated base URL, `.env.example` without values), R6 (messages as text, truncated; bodies never shown), R7 (no screen conversions), R8 (tests above), R9 (mutations never retried, never optimistic in the pattern).

## Specialist input used
consult-software-architect.md
- Adopted: R-A openapi-fetch + openapi-typescript, remove axios; R-B layout and `ApiError`; seam `setTokenProvider`/`setUnauthorizedHandler` (renamed `setAccessTokenProvider`); R-C status handling (401 once, 403 to caller, 429 no retry, 5xx/network ≤ 3); R-D query-key/`queryOptions` pattern, no feature converted; R-E ESLint rule; R-G Vite dev proxy; R-H ADR (numbered 0001, since `docs/adr/` is empty).
- Changed: R-F generate from a committed snapshot rather than a URL (from api-platform consult). R-D example uses `GET /api/v1/organizations` instead of `/health` (it is under `/api/v1`, in the production schema, and is a real `Page`).
- Rejected: keeping `/500` navigation — dropped (step 10).

consult-api-platform-engineer.md
- Adopted: rec. 1 snapshot + `api:types` from it + CI diff check + flags-on one-liner; rec. 2 `ApiError` fields, parse order, synthetic codes, detail types, envelope hand-written and flagged; rec. 3 `Page<T>` pinned to generated `Page_X_`; rec. 4 origin-only base URL with generated `/api/v1/...` paths, 204 handling; rec. 5 lint + grep backstop; rec. 6 local-dev doc.
- Rejected: per-call `cookie` auth mode (cookie calls belong to `@mmlabs/auth-client`, R3, open question 5); single-flight refresh + retry once on 401 (owner: no interim auth module); `requestId` field (API does not send one — follow-up).

consult-appsec-engineer.md
- Adopted: F2 `credentials: 'omit'`; F3 replace axios handling and `console.log`; rec. 1–5 validated base URL (lazy instead of at startup, so mock mode works); rec. 6 origin assertion + encoded path params; rec. 7–8 fixed fetch init and headers, no `X-MM-App`; rec. 9 injected token provider, store not imported in `src/api/`; rec. 10–11 timeouts, no mutation retry; rec. 12–15 `ApiError` shape, zod `safeParse`, tests incl. token-leak; rec. 16 truncate; rec. 17 one 401 hook + `queryClient.clear()`; rec. 18 relative redirect path (validation on consume → PAN-010); rec. 19 403 to caller; rec. 20–21 ESLint + backstop; rec. 23–24 exact pins, no lifecycle scripts; rec. 25 snapshot, never prod by default; rec. 26 no console.
- Deferred: rec. 19 shared `<Forbidden/>` (PAN-011 / screen tickets); rec. 22 CSP (PAN-022); `minimumReleaseAge`, `pnpm audit` in CI (follow-ups); "result unknown" UX for timed-out mutations (screen tickets).

## Assumptions
Non-blocking defaults chosen so the loop can proceed; the owner can see and reverse them in the PR.
1. **`VITE_API_BASE_URL` is an origin only** (`https://api.mmlabs.online`, `http://localhost:5173` in dev), validated; generated paths carry `/api/v1`. All three consults recommend this; `.env.example` already shows an origin.
2. **axios is removed in this ticket** (AC2 "one error type"; appsec F3 token-leak shape).
3. **Types are generated from a committed snapshot** `src/api/openapi.json` produced with both admin flags on, not from a live URL; CI checks only snapshot ↔ types consistency, not snapshot ↔ deployed API. Each "on the real API" ticket refreshes the snapshot.
4. **Local real-API development goes through a dev-only Vite proxy**, because org-admin-api answers CORS only on `/api/v1/auth/*`. Not shipped in `dist/`, so not a BFF (R1). Deployed environments need the org-admin-api CORS follow-up below. This does not block PAN-009 (client, types and tests run on a mocked network); it blocks real-API screen tickets.
5. **The error envelope type is hand-written** (one small zod schema in `src/api/errors.ts`) because org-admin-api's OpenAPI declares no error schema — a flagged, unavoidable exception to R2 until the follow-up lands.
6. **No 401 retry/refresh, no MSW, no 403 page, no screen conversion, no zod response validation** in PAN-009 (owner 2026-11-15; consults' scope-creep lists).
7. The mock `/sign-in` route stays the 401 target (CLAUDE.md mentions `/login`; renaming is PAN-010).
8. `useOrganizationsQuery` is exported but unused until PAN-014; `knip` may report it (knip is not in CI). Not suppressed.
9. Timeouts 15 s (GET/HEAD) / 30 s (others); query retries ≤ 3 in production for network/timeout/5xx only — template's existing cap, per architect R-C.
10. A pnpm peer-dependency warning (openapi-typescript vs TypeScript 6) is acceptable for a types-only devDependency.

Follow-ups (not in this diff, R7):
- **org-admin-api (new ADM ticket):** non-credentialed CORS on admin Bearer paths `/api/v1/*` from `apps[admin].origins` — allow headers `Authorization`, `Content-Type`, `Accept`; methods GET, POST, PATCH, PUT, DELETE; expose `Retry-After`; answer preflights; `Cache-Control: no-store` on admin responses. Already anticipated in org-admin-api ADM-002 (owner A1) and ADM-002c plan, but no backlog row. Real-API screen tickets (PAN-011, 013–019) should list it in `Depends on`.
- org-admin-api: a shared `ErrorEnvelope` schema in OpenAPI responses (and drop the default `HTTPValidationError` 422) so the envelope type can be generated; a `make openapi` dump target; optional `X-Request-ID`.
- admin-pan: CLAUDE.md "Cross-repo dependencies" paragraph says local dev points `VITE_API_BASE_URL` at `:8000` and that CORS is answered for `admin` origins — both need updating to the proxy/origin-only convention (owner edits CLAUDE.md).
- admin-pan: `pnpm audit --prod` and `minimumReleaseAge` (appsec rec. 24); CSP `connect-src` derived from the same origin (PAN-022); validate `redirect` on consume (PAN-010).

## Blocking questions
None.

## Split proposal
None. Estimated hand-written diff ≈ 450–550 lines, more than half of it tests; generated `schema.d.ts`/`openapi.json` and the lockfile are excluded from that estimate. One spec concern (API plumbing), no screens.

## Screens
None. No route or screen changes; the organizations screen keeps its mock provider. Global behaviour change only: mutation-error toasts now show the API envelope message, query errors toast only for network/5xx, a 401 from the API resets the mock auth store, clears the query cache and navigates to `/sign-in?redirect=<relative path>`.

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/organizations` (example hook only; not called by any screen in this ticket) | query `limit` (1–100), `offset` (≥ 0); permission `admin:organizations:read` | `components['schemas']['Page_OrganizationRead_']` | 401 → unauthorized hook; 403 `permission_denied` → `ApiError` to caller; 422 `validation_error`; 429; 5xx/network | ADM-001 (done); Bearer auth ADM-002 (done); browser CORS → follow-up above |
| GET/DELETE | `/api/v1/organizations/{org_id}` (client tests only: path-param encoding, 204) | path `org_id` | `OrganizationRead` / no body | as above, 404 | ADM-001 (done) |
