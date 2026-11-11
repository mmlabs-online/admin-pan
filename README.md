# admin-pan

Admin web UI for the mmlabs ecosystem. It has no backend of its own: it signs staff in with mmlabs Identity and calls [org-admin-api](https://github.com/mmlabs-online/org-admin-api) (`api.mmlabs.online`).

Status: **workflow only** — the app is scaffolded by ticket PAN-001. Stack proposal and rules: [`CLAUDE.md`](CLAUDE.md). Scope: [`docs/spec-v1.md`](docs/spec-v1.md).

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
