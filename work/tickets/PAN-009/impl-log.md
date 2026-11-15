## Attempt 1 — 2026-11-15

### Files touched
| File | Required because |
|---|---|
| package.json, pnpm-lock.yaml | remove axios; add `openapi-fetch` 0.17.0, `openapi-typescript` 7.13.0 (exact pins); `api:types` script |
| src/api/openapi.json, schema.d.ts | snapshot + generated types (AC1) |
| src/api/config.ts, errors.ts, auth-hooks.ts, client.ts, page.ts, index.ts | client, ApiError, auth seam, Page (AC2, AC3) |
| src/api/*.test.ts | unit tests incl. no-http-outside-api backstop |
| src/features/organizations/api/queries.ts, queries.test.ts | query-hook pattern example, not wired into the screen |
| src/lib/query-client.ts, query-client.test.ts | retry policy and cache handlers |
| src/lib/handle-server-error.ts, .test.ts | rewritten around ApiError, no console |
| src/main.tsx | createQueryClient, token provider and 401 handler registration |
| src/vite-env.d.ts, .env.example, vite.config.ts | typed env, docs, dev proxy |
| eslint.config.js, .prettierignore, .github/workflows/ci.yml | AC4 lint rule, generated-file handling, CI types-up-to-date step |
| README.md, docs/adr/0001-api-client.md | AC5 docs, ADR |

### Tests added / changed
- src/api/{config,errors,auth-hooks,client,page,no-http-outside-api}.test.ts, src/features/organizations/api/queries.test.ts, src/lib/query-client.test.ts: all cases listed in the plan
- src/lib/handle-server-error.test.ts: rewritten for ApiError (axios and logging cases removed)

### Checks (actual output summary)
- pnpm typecheck: clean
- pnpm lint: clean (verified `fetch('/x')` in src/features triggers no-restricted-globals)
- pnpm format:check: all files match
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): 36 files, 209 tests passed
- pnpm build: built OK
- `pnpm api:types` re-run: no diff in schema.d.ts

### Notes
- Snapshot: produced offline with `uv run --frozen` (UV_PROJECT_ENVIRONMENT in the scratchpad, PYTHONDONTWRITEBYTECODE=1) from org-admin-api main 4c01328, both flags on; 26 paths. org-admin-api checkout left clean.
- pnpm warns: openapi-typescript 7.13.0 unmet peer typescript@^5 (found 6.0.3); accepted per plan.
- `@tanstack/query/exhaustive-deps` flags the injected `api` argument in `organizationsListQueryOptions`; one eslint-disable with a reason (not a no-restricted rule).
- Redirect in the 401 handler uses `router.history.location.href` (relative) since `searchStr` is not on HistoryLocation.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- org-admin-api: CORS for admin Bearer paths from `apps[admin].origins`; shared `ErrorEnvelope` schema in OpenAPI; `make openapi` target.
- admin-pan: CLAUDE.md cross-repo paragraph (proxy / origin-only convention); `pnpm audit --prod`; validate `redirect` on consume (PAN-010).

### Scope self-check
- Could the diff be smaller? No
- Diff size: see git (generated schema/openapi/lockfile excluded from the hand-written estimate)
