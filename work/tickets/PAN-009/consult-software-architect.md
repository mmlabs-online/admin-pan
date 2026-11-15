# PAN-009 consult: software-architect

I read the ticket, CLAUDE.md, src/main.tsx, src/lib/handle-server-error.ts and its test, the stores, the eslint and vite configs, package.json, .env.example and the users feature. On the org-admin-api side I read errors.py, pagination.py, cors.py, main.py, api/deps.py and identity-architecture §6. The most important finding: **the deployed API cannot be called from the browser for admin endpoints today**, because of CORS (F3).

## Findings

**F1. HTTP code in the app today.**
- No feature makes HTTP calls; only the template's error plumbing uses axios.
- `src/main.tsx:3,32,43,53` and `src/lib/handle-server-error.ts:1,21` (and its test) check `instanceof AxiosError`.
- `handle-server-error.ts` reads `error.response.data.title`. That is the template's shape, not the API's `{error:{code,message,details}}`.
- The QueryCache 401 handler in `main.tsx` calls `useAuthStore…reset()` and goes to `/sign-in`. The 403 branch is an empty comment.
- `axios` is a dependency only for those type checks.

**F2. What the API returns.**
- Errors always use the envelope from `app/core/errors.py`.
  - Known codes: `bad_request`, `not_found`, `conflict`, `unprocessable`, `validation_error`, `unauthorized`, `permission_denied`, `rate_limited`, plus `http_error` as a fallback.
  - `validation_error` details are `[{type, loc, msg}]`; `unprocessable` details are `[{field, reason}]`; `rate_limited` details are `{retry_after}` plus a `Retry-After` header.
  - 204/304 have no body.
  - A proxy, Cloudflare or nginx 502 will not be JSON.
- Lists are `Page[T] = {items, total, limit, offset}`, `limit` 1–100 (default 20), `offset` ≥ 0.

**F3. Blocker: CORS (R1).** `app/core/cors.py` only covers paths under `/api/v1/auth/`.
- It allows only `GET`/`POST` and the headers `Content-Type` and `X-MM-App`.
- Admin endpoints (`/api/v1/users`, orgs, rbac) send no CORS headers, `Authorization` is not an allowed header, and `PATCH`/`PUT`/`DELETE` are not allowed methods.
- So `admin.mmlabs.online` cannot call `api.mmlabs.online/api/v1/users` from a browser. The cross-repo note in CLAUDE.md ("the API only answers CORS for origins registered on app `admin`") holds only for `/auth/*`.
- No org-admin-api backlog row covers this; USR-03e was scoped to `/auth/`. Per R1 it is a follow-up for org-admin-api, not something to work around in this UI.

**F4. Type generation will be incomplete.**
- The users and rbac routers are only mounted when `ADMIN_USERS_API_ENABLED` / `ADMIN_RBAC_API_ENABLED` are set, and those flags are refused in staging/production until ADM-002b.
- So the production `/openapi.json` does not list them. Types generated from prod would be missing exactly the endpoints the next screens need.
- No OpenAPI snapshot is committed in org-admin-api.
- Admin operations carry an `x-permission` OpenAPI extension (`app/core/permissions.py`). That is useful later for R4.

**F5. Mock data and context.**
- Features read mock data through a feature context. For example, `users-provider.tsx` holds `useState(mockUsers)` and `setUsersStatus`, and `index.tsx` passes `users` to the table.
- Field names already match the API (snake_case).

**F6. Auth client not available.**
- `@mmlabs/auth-client` (USR-08, not started) will expose `getToken(audience)` with in-memory caching and refresh.
- The owner ruled "no interim hand-written auth module" (PAN-010 notes).
- PAN-009 therefore needs a seam for token and 401 handling, not an implementation.

## Recommendations

**R-A. Use `fetch` via `openapi-fetch` + `openapi-typescript`; do not use axios (AC1, AC2, R2).**
- Types: `openapi-typescript` produces `src/api/schema.d.ts`.
- Client: `openapi-fetch` (about 6 kB, fetch-based) gives typed paths, params and bodies for free and supports middleware for auth and errors.
- The API team's consult notes already assume openapi-fetch clients (e.g. USR-04b "explicit names so openapi-fetch generates clean types").
- axios brings its own error type and interceptors that duplicate what we need. Remove the dependency once `main.tsx` and `handle-server-error.ts` stop importing it; that migration is in scope because AC2 says "one error type". Otherwise you keep two error models.
- Trade-off: no axios upload-progress or auto-JSON. Neither is needed here.

**R-B. Layout inside `src/api/` (R2). Keep it to about five files plus tests.**
- `schema.d.ts`: generated, committed, excluded from eslint and prettier, with a header comment naming the source.
- `client.ts`:
  - `createApiClient({ baseUrl, getToken, onUnauthorized })` returns an `openapi-fetch` client with one middleware.
  - The middleware sets `Authorization: Bearer` when `getToken()` returns a value.
  - It throws `ApiError` on any response that is not ok.
  - It does **not** set `credentials: 'include'`. Bearer endpoints do not need cookies, and cookie flows belong to auth-client.
  - It does not send `X-MM-App` by default. Admin Bearer endpoints do not need it; it is a per-call option only if a later ticket needs it.
  - Also export `api` as a singleton built from `import.meta.env.VITE_API_BASE_URL`.
- `errors.ts`:
  - `class ApiError extends Error { status; code; details; retryAfter? }`.
  - `parseError(response)` handles three cases:
    - envelope JSON: use it as is;
    - non-JSON or a malformed envelope (502 HTML, empty body): fall back to `code: 'http_error'` and a generic message;
    - network failure (`TypeError` from fetch): map to `status: 0, code: 'network_error'`.
  - Add `isApiError(e, status?)` helpers. Never put the raw response body into `message`, because R5 forbids leaking emails.
- `page.ts`: `type Page<T> = { items: T[]; total; limit; offset }` (or derive it from the schema), plus `toPageParams({pageIndex, pageSize})` that clamps `limit` to ≤ 100. That function is the bridge to TanStack Table.
- `auth-hooks.ts` (the seam for AC3): `setTokenProvider(fn)` and `setUnauthorizedHandler(fn)`, both registered at app start.
  - Today: the provider reads `useAuthStore.getState().auth.accessToken`, and the handler does what `main.tsx` does now (reset the store and go to `/sign-in` with a redirect).
  - PAN-010 only swaps these for `authClient.getToken('admin')` and a re-auth via auth-client. The client itself does not change.
  - This is the "re-auth hook point". **Do not** add refresh or retry logic in PAN-009, so there is no hand-written auth module (owner note in PAN-010).

**R-C. Status codes in the QueryClient (AC3, R4, R9).** Rewrite `main.tsx` and `handle-server-error.ts` around `ApiError`:
- **401:** call the unauthorized handler once (de-duplicate concurrent 401s with a flag or a single in-flight promise) and never retry.
- **403:** do not retry and do not navigate globally. Rethrow so the query or mutation `error` reaches the caller. Screens render a "no permission" state themselves (screen tickets; PAN-011 adds permission gating).
- **429:** do not retry; the toast can show `retryAfter`.
- **5xx/network:** retry at most 3 times in production. Drop the template's `/500` navigation, or keep it only for queries; that is the planner's call, but keep it minimal.
- Mutations: `handleServerError` toasts `error.message` from the envelope, and `422` field details are left to forms. Delete the 304 branch.
- Note: `handleServerError` currently toasts on every mutation error. That conflicts with R9 ("show the API error") only if a screen also shows the error inline. Fine for now.

**R-D. Query-hook pattern, so the mock-to-real switch is cheap later (Goal; R2; spec §2).**
- Put one file per feature in `src/features/<feature>/api/queries.ts`. Hooks stay in features; HTTP stays in `src/api/` (R2 says "features use TanStack Query hooks built on it").
- Use `queryOptions` factories with a key factory, e.g. `usersKeys.list(params)`. Hooks like `useUsersQuery(params)` / `useUpdateUserStatus()` call `api.GET('/api/v1/users', { params: { query } })` and unwrap `data`. Mutations invalidate `usersKeys.all` on success and are never optimistic (R9).
- **Do not convert any feature in PAN-009.** The users/orgs endpoints are not reachable (F3, F4) and screens are separate tickets (PAN-013…). Deliver the pattern as:
  - a short `src/api/README.md` (or ADR-0002, see R-H) with a code sample;
  - one example hook tested against a mocked `fetch`, e.g. against `GET /health`. Health is outside `/api/v1`, so this needs a base-URL decision; alternatively test the example hook purely with a stubbed fetch.
- What makes later swaps easy: each feature's context/provider is the single place where `users` comes from. A screen ticket then replaces `useState(mockUsers)` with `useUsersQuery(...)` and `setUsersStatus` with the mutation. Table and dialog components stay unchanged because they already take `User[]` with API field names.
- Recommend that screen tickets also switch `data/schema.ts` types to `components['schemas']['UserRead']` (R2 forbids hand-written copies). Do it then, not now.

**R-E. Enforcing "no HTTP outside `src/api`" (AC4): use an ESLint rule.**
- In `eslint.config.js`, add `no-restricted-imports` (paths `axios`, `openapi-fetch`, patterns `ky`, `ofetch`) and `no-restricted-globals` / `no-restricted-properties` for `fetch`, `XMLHttpRequest`, `EventSource`, `WebSocket`, `navigator.sendBeacon`, `window.fetch` / `globalThis.fetch`.
- Add an override block with `files: ['src/api/**']` that turns them off. Test files also need an exemption, since they stub `fetch`.
- Lint gives editor feedback and runs in CI already (R8); a grep test is weaker and duplicates it.
- Optional: one small test that runs ESLint on a fixture string to prove the rule fires. Nice to have, not required.

**R-F. Type generation script (AC1, F4).**
- `"api:types": "openapi-typescript ${OPENAPI_URL:-http://localhost:8000/openapi.json} -o src/api/schema.d.ts"`, then prettier on the file (or exclude it from prettier).
- Document that it **must** run against a local org-admin-api started with `ADMIN_USERS_API_ENABLED=true ADMIN_RBAC_API_ENABLED=true`; otherwise users/rbac are missing.
- The file is committed, so CI does not need the API. Do not add a CI drift check now; that is a follow-up.

**R-G. Local dev documentation (AC5, R5).**
- README section with two modes: mock (default, `VITE_API_BASE_URL` empty, no network) and real API (`make dev` on `:8000`).
- Prefer a **Vite dev proxy** (`server.proxy['/api'] → http://localhost:8000`) with `VITE_API_BASE_URL` empty or same-origin in dev. That avoids CORS locally, including the admin-endpoint gap in F3.
- Trade-off: the proxy hides CORS problems until staging. State that in the doc, linked to the F3 follow-up.
- `.env.example` already has the key. Add `OPENAPI_URL` only if the script uses it; it is not a `VITE_` variable, so it is not bundled.

**R-H. ADR-0002 "API client: openapi-fetch, ApiError, auth seam".** Short, records axios vs fetch and the seam. `docs/adr/` is empty, so this is the first ADR. Optional but cheap.

## Risks
1. **CORS (F3).** Every real-API screen ticket is blocked until org-admin-api extends CORS to the admin paths, allowing the `Authorization` header and `PATCH`/`PUT`/`DELETE`. No credentials are needed there, but the origins must still be restricted to `apps.origins`. File the org-admin-api follow-up now (likely alongside ADM-002b).
2. **Incomplete or stale types (F4).** Generation depends on local flags. Screen tickets must regenerate, and drift is not checked until a CI or snapshot follow-up.
3. **Scope creep to watch for:**
   - converting users/orgs screens;
   - adding a 403 page or permission gating (PAN-011);
   - token refresh or retry-on-401 logic (PAN-010 / auth-client);
   - zod runtime validation of responses;
   - MSW setup. A stubbed `fetch` is enough for PAN-009 unit tests. MSW can arrive with the first real-API screen (R8, "API mocked at the network layer").
4. **Template coupling.** The `/sign-in` route and `useAuthStore` are mock auth. The default unauthorized handler should stay a tiny function so PAN-010 can replace it cleanly.
5. **R5.** `ApiError` and dev `console.log` (`main.tsx:26`, `handle-server-error.ts:7`) must not dump request headers (the Bearer token) or response bodies. `ApiError` should store only status, code, message and details.

## Open questions
1. Does the owner accept filing an org-admin-api ticket for CORS on admin paths (F3)? Until then, is "real API only via the Vite proxy locally" acceptable?
2. `VITE_API_BASE_URL`: origin only (`https://api.mmlabs.online`, with typed paths including `/api/v1/...` as in OpenAPI) or including `/api/v1`? I recommend origin only, matching OpenAPI paths; the current `.env.example` comment already shows `http://localhost:8000`.
3. Remove the `axios` dependency in this ticket (recommended) or leave it for a cleanup ticket?
4. Pattern doc: should it be an ADR or `src/api/README.md`?

Relevant files: `/home/user/admin-pan/src/main.tsx`, `/home/user/admin-pan/src/lib/handle-server-error.ts`, `/home/user/admin-pan/src/stores/auth-store.ts`, `/home/user/admin-pan/eslint.config.js`, `/home/user/admin-pan/vite.config.ts`, `/home/user/admin-pan/.env.example`, `/home/user/admin-pan/src/features/users/components/users-provider.tsx`, `/home/user/org-admin-api/app/core/errors.py`, `/home/user/org-admin-api/app/core/pagination.py`, `/home/user/org-admin-api/app/core/cors.py`, `/home/user/org-admin-api/app/main.py`.
