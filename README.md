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

Stack and rules: [`CLAUDE.md`](CLAUDE.md). Scope: [`docs/spec-v1.md`](docs/spec-v1.md).

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
