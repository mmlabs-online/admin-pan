# PAN-009 consult: api-platform-engineer (consumer side)

Read-only review of /home/user/org-admin-api (main) against /home/user/admin-pan/work/tickets/PAN-009/ticket.md. I did not run any code. The offline-dump claim below comes from reading the code and tests.

## Findings

**1. CORS blocks the admin Bearer endpoints from a browser SPA today. This is the biggest pitfall.**
- `DynamicCORSMiddleware` (`/home/user/org-admin-api/app/core/cors.py`, wired in `app/main.py:53-57`) only applies to paths under `/api/v1/auth/`.
- ADR-0006 §1 says "Admin routes, the role catalog, health … are untouched". Its last bullet defers "Bearer CORS for a future admin UI" to `apps[admin].origins`.
- Even for `/auth/*`, the preflight allows only the methods `GET, POST` and the headers `Content-Type, X-MM-App`. `Authorization`, `PATCH`, `PUT` and `DELETE` are not allowed.
- So a browser on `admin.mmlabs.online` cannot call `GET/POST/PATCH/DELETE /api/v1/organizations` cross-origin. The preflight reaches the router and fails (405 envelope, no `Access-Control-Allow-*`).
- The cookie-class calls (`/auth/token`, `/auth/login`, `/auth/accounts`) do work cross-origin once the origin is registered on app `admin`.
- There is no org-admin-api backlog ticket for this. ADM-002b is about guards and mounting, not CORS. The same-origin route (nginx proxying `/api` on `admin.mmlabs.online`) is not documented either.

**2. OpenAPI exposure and offline generation.**
- `docs_url="/docs"` and the default `/openapi.json` are both public in every environment, production included (`app/main.py:43-49`; spec §6: "owner, 2026-11-11; temporary — revisit when ADM-002 mounts the admin routes"; `tests/test_health.py:39` asserts `/openapi.json`). That decision may be revisited, so the URL is not a stable input.
- There is no script or Make target that dumps the schema. The Makefile has none, and `app/cli.py` has no such command.
- Offline dumping is feasible. `create_app().openapi()` needs no DB, because the engine is lazy and tests call it without a DB (`tests/test_route_auth_classes.py:150`, `tests/test_device_cookie.py:123`). In local env, default Settings need no secrets (the JWT key is ephemeral).
- The mounted routes depend on two flags. `ADMIN_USERS_API_ENABLED` and `ADMIN_RBAC_API_ENABLED` default to false, and are forbidden in staging/production until ADM-002b (`app/core/config.py:105-157`).
  - The production `/openapi.json` therefore lists only `/organizations`, `/auth/*`, the role catalog `/apps/{key}/roles`, health and JWKS.
  - It lacks `/users`, `/apps` (admin), permissions, roles and role-assignments.
  - A production URL snapshot would be incomplete today and would change when ADM-002b lands.
  - A local server with the flags on (needs `APP_ENV=local` set explicitly) exposes the full surface.
- Auth classes in OpenAPI:
  - Admin operations carry `x-permission: admin:<resource>:<action>`, `security: [{bearerAuth: []}]`, and declared 401/403 responses (`app/modules/admin_auth/deps.py:100-108`).
  - Cookie operations use the `DeviceCookie` apiKey scheme.
  - `tests/test_route_auth_classes.py` verifies this map.

**3. The generated types will have no error envelope.**
- Error responses are declared as bare `{"description": ...}` without a schema (`_ERR`, `_ERROR_RESPONSES`).
- FastAPI still emits the default 422 `HTTPValidationError` (`detail: [...]`) on operations with a body or params. That does not match the real 422 body. Real 422s use the R6 envelope with `code: "validation_error"` (`app/core/errors.py:88-101`).
- The envelope type must therefore be hand-written in `src/api/`. This is a conflict with CLAUDE.md R2 ("never hand-written copies"), and it is unavoidable until org-admin-api adds an `Error` schema.

**4. Error envelope, as actually emitted (`app/core/errors.py`).**
- Shape: `{"error": {"code": string, "message": string, "details": any|null}}`. There is no `request_id` field and no request-id header in the app code.
- Even framework errors (404 unknown path, 405, 413, 415) use the envelope. The `code` comes from `_HTTP_CODES`, or `http_error`; the message is the HTTP phrase.
- Stable codes:
  - `bad_request`, `unauthorized`, `permission_denied`, `not_found`, `conflict`
  - `unprocessable`, `validation_error`, `rate_limited`, `method_not_allowed`, `not_acceptable`
  - `payload_too_large`, `unsupported_media_type`, `http_error`
  - Identity codes: `session_invalid`, `not_member`, `email_unverified`, `audience_mismatch`, `app_header_required`, `origin_not_allowed`, `join_closed`, `token_invalid`, `weak_password`, `turnstile_failed`, `email_already_verified`, and others (see `docs/consumers.md`).
  - Codes are open-ended, so the TS type should be `string`.
- `details` varies by code:
  - 403 `permission_denied`: `{required: "admin:…"}`.
  - 422 `validation_error`: `[{type, loc: (string|number)[], msg}]`. It never echoes input values.
  - 422 `unprocessable`: `[{field, reason}]`.
  - 429 `rate_limited`: `{retry_after: number}` plus the `Retry-After` header.
  - 403 `not_member`: `{join_available: boolean}`.
  - 422 `weak_password`: `{reasons: string[]}`.
- 401 on admin endpoints:
  - Code `unauthorized`, message "Authentication required", `details: null`.
  - Header `WWW-Authenticate: Bearer realm="admin"`, plus `error="invalid_token"` if a token was sent. The response never says why the token failed (ADR-0008 §4).
- 204 responses have no body (delete organizations, logout, verify-email, password reset).
- A 500 is not readable cross-origin (ADR-0006), so the SPA sees a network `TypeError`. A non-JSON error body (proxy, Cloudflare HTML) is possible.
- Authentication runs before validation, so 401/403 come before 404/422.

**5. Pagination (`app/core/pagination.py`).**
- `Page[T] = {items: T[], total: int, limit: int, offset: int}`.
- Query params: `limit` (1..100, default 20) and `offset` (>=0, default 0).
- Pydantic generics produce concrete schema names such as `Page_OrganizationRead_`.
- Exceptions to `Page`:
  - `GET /apps/{key}/roles` returns a single `RoleCatalog` document with ETag and `Cache-Control: no-cache`.
  - `GET /auth/accounts` returns `{items: [...]}` only, without total/limit/offset.
- Other conventions: snake_case, UUID ids, ISO `timestamptz` datetimes, `PATCH` for partial updates, and apps addressed by `key` rather than id.

**6. Headers by auth class.**
- Admin Bearer endpoints (`/api/v1/organizations`, and `/users`, `/apps`, role-assignments once mounted):
  - Send `Authorization: Bearer <aud=admin access token>` only. The device cookie is never read.
  - `X-MM-App` is not required, and `credentials: 'include'` is not needed.
  - Send `Content-Type: application/json` for bodies.
  - No Origin check on these routes.
- Cookie identity endpoints (`/api/v1/auth/{login,logout,token,accounts,apps/{key}/join,verify-email/resend}`):
  - Send `credentials: 'include'` and `X-MM-App: admin`, with `Content-Type: application/json`.
  - The page origin must be in `apps[admin].origins`. That is exactly one or two `https://admin.mmlabs.online`-style origins, set only via `make set-admin-origins` (ADM-002c). Loopback is refused in staging/production.
  - Getting the admin token: `POST /auth/token {audience: "admin", account_id}`. It returns `{access_token, token_type: "Bearer", expires_in, audience}`. TTL is 900 s by default and there are no refresh tokens, so re-call `/token` before `exp`. A 401 `session_invalid` means sign in again.
  - `/token` needs a verified email, and errors with `email_unverified`, `not_member`, `origin_not_allowed`.
- Public endpoints:
  - signup, forgot and login need `X-MM-App` plus a registered Origin; login also needs Turnstile after repeated failures.
  - verify-email and password/reset need no cookie and no `X-MM-App`.
  - `/.well-known/jwks.json`, `/healthz` and `/readyz` are plain.
- CORS wrinkle: the cookie is `__Host-mm_device` on the API host. A local SPA must use the same site, `localhost` on both sides (docs/consumers.md). A local SPA cannot use the production API.

## Recommendations

1. **`pnpm api:types` (AC1).** Commit a snapshot `src/api/openapi.json`, plus the generated `src/api/schema.d.ts`, using `openapi-typescript`.
   - `api:types` generates from the snapshot, which is deterministic, offline and reviewable in PRs.
   - A separate `api:snapshot` script refreshes the snapshot from a URL or a local server: `OPENAPI_URL=http://localhost:8000/openapi.json` by default, with the production URL as a documented fallback.
   - The snapshot must be produced from a server with both admin flags on (local, `APP_ENV=local`). Production lacks users/RBAC routes, so a production snapshot is incomplete.
   - CI (R8): add a check that regenerates `schema.d.ts` from the snapshot and fails on a diff, so the types cannot drift from the snapshot.
   - Record the org-admin-api commit or version in the snapshot header or README so drift is visible. A version bump is not a reliable signal: `info.version` is a hard-coded "0.1.0".
   - Propose to org-admin-api (as a ticket there, not in this repo) a tiny `make openapi` / `python -m app.cli openapi` target that dumps `create_app().openapi()` with both flags on. Until then document the one-liner: `APP_ENV=local ADMIN_USERS_API_ENABLED=true ADMIN_RBAC_API_ENABLED=true uv run python -c "import json; from app.main import create_app; print(json.dumps(create_app().openapi(), indent=2, sort_keys=True))"`.
   - Do not depend on a production `/openapi.json` URL: its exposure is explicitly temporary.

2. **Error type (AC2, R2).** One hand-written `ApiError` class in `src/api/errors.ts`, kept deliberately tiny and commented as "envelope is not in OpenAPI, see org-admin-api R6". Fields:
   - `status: number`
   - `code: string` (`'network_error'`, `'invalid_response'`, and `'http_<status>'` are synthetic fallbacks, so callers can always branch on `code`)
   - `message: string`
   - `details: unknown | null`
   - `retryAfter?: number`, from the `Retry-After` header with `details.retry_after` as fallback
   - `www_authenticate`/`requiredPermission` are not needed; `details.required` is enough for 403
   - `requestId?: string`, always undefined today. Optionally read `x-request-id` if org-admin-api adds it, but do not invent it.
   - Parse order: if JSON, it has `error.code` and `error.message` strings, so use them. Otherwise, for non-JSON, empty or unexpected JSON bodies, build a synthetic error from the status and statusText. Use status-only messages and never put raw bodies or tokens in messages (R5).
   - A `fetch` `TypeError` maps to `status: 0`, `code: 'network_error'`. This covers CORS failures, which cannot be told apart from an unreachable server.
   - Type helpers for known details: `ValidationDetails = {type, loc, msg}[]` and `UnprocessableDetails = {field, reason}[]`.
   - 401 triggers the re-auth hook (AC3). The hook should only fire for 401s on Bearer calls. A 401 from `/auth/login` is bad credentials, and a 401 `session_invalid` from `/auth/token` means sign in again. Make the hook a registered callback with a single-flight refresh, and retry the original request at most once.
   - 403 is thrown as an `ApiError` and never swallowed (R4). `code === 'permission_denied'` carries `details.required`.

3. **`Page<T>` (AC1/R2).** Use a generic helper such as `type Page<T> = { items: T[]; total: number; limit: number; offset: number }`. The generated schema has the concrete `Page_X_` types, so alias from them to avoid copies: `components['schemas']['Page_OrganizationRead_']`.
   - A client `list` helper takes `{limit?, offset?}`, clamps `limit` to 1..100, and builds the query string.
   - Do not model `RoleCatalog` or `AccountList` as `Page`.

4. **Client shape.** A `request()` core built on `fetch` with two auth modes selected per call (or per route group):
   - `bearer`: sets `Authorization` and omits credentials.
   - `cookie`: sets `X-MM-App: admin`, `credentials: 'include'`, and `Content-Type`.
   - `openapi-fetch` on top of the generated types is a reasonable choice, with the middleware doing the error parsing. Keep `fetch` only in `src/api/`.
   - Handle 204 (no body) and `Cache-Control: no-store` responses.
   - Base URL from `VITE_API_BASE_URL`, which includes `/api/v1`. Note that the generated paths in the OpenAPI JSON are `/api/v1/...` (the router prefix is `settings.api_prefix`). Pick one convention: either set `VITE_API_BASE_URL=https://api.mmlabs.online` and use the paths as generated, or strip the prefix. CLAUDE.md currently says the base URL includes `/api/v1`, which will double the prefix with openapi-fetch. Decide and document in the plan.

5. **Lint rule for no-fetch-outside-api (AC4).** ESLint `no-restricted-globals` / `no-restricted-imports` (for `axios`) with an override for `src/api/**`. Add a unit test as a backstop that greps `src/` excluding `src/api` and test files.

6. **Local dev doc (AC5).**
   - Run `make db-up && make migrate && make dev` in org-admin-api (port 8000). For the full surface, set `ADMIN_USERS_API_ENABLED=true`, `ADMIN_RBAC_API_ENABLED=true` and `APP_ENV=local`. Create the `admin` app origins with `make set-admin-origins ARGS='--origin http://localhost:5173'`, and grant a super-admin with `make grant-super-admin email=...`.
   - Check that `set-admin-origins` actually accepts loopback in local: ADM-002c says loopback is refused only in staging/production.
   - Use `localhost` on both sides. Safari may reject the `__Host-` cookie on `http://localhost`.
   - Mocks stay the default until the "on the real API" tickets.

## Risks

- **R-CORS (blocking for any real call):** with today's CORS scope the admin SPA cannot call any Bearer endpoint cross-origin, as covered in Finding 1. It needs an org-admin-api ticket to extend CORS to admin routes: echo `apps[admin].origins`, allow `Authorization` and `PATCH/PUT/DELETE`, expose `Retry-After`, and answer preflights. Alternatively, serve the SPA and the API on the same origin via nginx `/api` proxy. Another option is CORS-free dev through the Vite proxy. The same-origin option conflicts with `Origin`/cookie scoping (`Path=/api/v1/auth`, host-only `__Host-` cookie on the API host), so it needs an owner decision. PAN-009 can still land (client, types, tests with mocked network), but no real call will work from the browser until this is resolved.
- Error types are hand-written (see Finding 3); drift from `errors.py` is possible. The contract is small and stable, and unit tests should pin it. Ask org-admin-api to add an `Error` schema to OpenAPI so it can be generated later, and to remove the default `HTTPValidationError` 422.
- The snapshot can go stale. CI only checks that the snapshot and types match each other, not that the snapshot matches the API. Treat a snapshot refresh as part of each "on the real API" ticket.
- The production OpenAPI exposes only a subset until ADM-002b. Types for `/users`, `/apps`, roles and assignments exist only if generated from a flag-on server. These endpoints return 404 in production until ADM-002b lands. The UI tickets for those screens must depend on org-admin-api ADM-002b.
- Admin access is fail-closed until `set-admin-origins` is run in each environment (ADR-0008). No token is possible before an origin is registered, and tokens for production origins need exact `https://admin.mmlabs.online` (no port, no path).
- The 900 s token TTL with no refresh token means the client must proactively re-call `/auth/token`. Race: concurrent 401s must share one refresh.
- Rate limits (429) hit `/auth/*` (login, token, accounts, join). The client should surface `retryAfter` and not retry blindly. `Retry-After` is exposed via CORS only for `/auth/*`.
- No `request_id` exists, so support tracing relies on timestamps. Recommend an org-admin-api follow-up (e.g. `X-Request-ID` response header plus an envelope field).
- Contract changes inside v1 have already happened without a version bump (signup now requires `X-MM-App`, USR-04c). The API has no deprecation headers, and `info.version` is not meaningful, so the UI should rely on the snapshot diff in PRs to catch changes.

## Open questions (for the owner or planner)

1. How will the SPA reach admin Bearer endpoints: an org-admin-api CORS ticket for admin routes (recommended), or a same-origin nginx `/api` proxy? This decides whether the `credentials`/`X-MM-App` split is needed at all in production.
2. Will `/openapi.json` stay public in production after ADM-002b? We do not depend on it either way (snapshot-based), but confirming lets us drop the URL fallback.
3. Is org-admin-api willing to add a `make openapi` target, an `Error` schema in OpenAPI, and `X-Request-ID`? Propose these as an org-admin-api ticket (cross-repo, per CLAUDE.md we do not change it from here).
4. `VITE_API_BASE_URL`: include `/api/v1` (as CLAUDE.md says) or the bare host? See Recommendation 4. Choose before the client is written.
5. Does the real PAN-009 scope include the cookie-class calls (`/auth/token` etc.)? Those belong to PAN-010 (`@mmlabs/auth-client`) per CLAUDE.md R3. PAN-009 should only provide the Bearer-token provider hook and the 401 hook point, and must not own login or token logic.

Files read (absolute paths): /home/user/org-admin-api/app/main.py, app/core/errors.py, app/core/pagination.py, app/core/cors.py, app/core/config.py, app/modules/admin_auth/deps.py, app/modules/organizations/router.py, app/modules/organizations/schemas.py, app/modules/auth/router.py, docs/adr/0006-dynamic-cors.md, docs/adr/0008-admin-api-authentication.md, docs/consumers.md, Makefile, work/backlog.md, tests/test_route_auth_classes.py; and /home/user/admin-pan/work/tickets/PAN-009/ticket.md.
