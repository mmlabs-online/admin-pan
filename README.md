# admin-pan

Admin web UI for the mmlabs ecosystem. It has no backend of its own: it signs staff in with mmlabs Identity and calls [org-admin-api](https://github.com/mmlabs-online/org-admin-api) (`api.mmlabs.online`).

Built on [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) (Vite + React + TanStack + shadcn/ui).
Status: **screens on mock data** — Dashboard, Users, Organizations, Apps, Roles, Reports, Audit log. API integration follows the backlog in [`work/backlog.md`](work/backlog.md).

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5173 — sign in with any email + 7-char password (mock)
```

Checks (same as CI):

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

`pnpm test` runs Vitest in browser mode; install the browser once with `pnpm test:browser:install`
(or set `PLAYWRIGHT_CHROMIUM_PATH` to an existing Chromium).

Stack and rules: [`CLAUDE.md`](CLAUDE.md). Scope: [`docs/spec-v1.md`](docs/spec-v1.md). Release and deploy: [`docs/deploy.md`](docs/deploy.md).

## Local development with org-admin-api

**Mock mode (default).** Leave `VITE_API_BASE_URL` empty: screens use the mock data in `src/features/*/data/`.

**Real API on :8000.** In an org-admin-api checkout:

```bash
make db-up && make migrate
APP_ENV=local ADMIN_USERS_API_ENABLED=true ADMIN_RBAC_API_ENABLED=true make dev   # :8000
make set-admin-origins ARGS='--origin http://localhost:5173'
make grant-super-admin email=you@example.com
```

Then in `.env.local` set `VITE_API_BASE_URL=http://localhost:5173` (an origin only, no `/api/v1`). Calls go same-origin through the dev-only Vite proxy (`/api` to `http://localhost:8000`; override with `API_PROXY_TARGET`). The proxy hides that org-admin-api does not answer CORS on admin Bearer paths yet. Real sign-in arrives with PAN-010; until then there is no real token.

**Refreshing API types.** Types are generated from the committed snapshot `src/api/openapi.json` (never hand-edit it or `schema.d.ts`). From an org-admin-api checkout:

```bash
APP_ENV=local ADMIN_USERS_API_ENABLED=true ADMIN_RBAC_API_ENABLED=true \
  uv run --frozen python -c "import json; from app.main import create_app; print(json.dumps(create_app().openapi(), indent=2, sort_keys=True))" \
  > <admin-pan>/src/api/openapi.json
pnpm api:types   # commit both files
```

Snapshot: org-admin-api main (`4c01328`) as of 2026-11-15, users and RBAC flags on.

## How we work

Work is driven by tickets and Claude Code subagents (same loop as stoktok and org-admin-api):

```
/idea "..."     # shape new scope into the spec and propose tickets
/ticket "..."   # add a ticket to work/backlog.md
/run            # agents consult → plan → implement → review → open a PR, automatically
/status         # board summary
/solo "..."     # small direct change outside the loop
```

Agent definitions are adapted from [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) (MIT, see `THIRD_PARTY_NOTICES.md`).
