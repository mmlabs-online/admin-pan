# admin-pan

Admin web UI for the whole **mmlabs** ecosystem. Internal staff use it to manage organizations, users, apps, roles, entitlements and to read the audit log. It has **no backend of its own**: every read and write goes through **org-admin-api** (`mmlabs-online/org-admin-api`, `https://api.mmlabs.online/api/v1`), and staff sign in with their mmlabs Identity account.

- Product spec: [docs/spec-v1.md](docs/spec-v1.md) — source of truth for scope. If this file, a ticket and the spec disagree on scope, the spec wins; flag the conflict.
- API contract: org-admin-api's `docs/spec-v1.md`, `docs/identity-architecture.md` (§4 endpoint list, §6 client libraries) and its OpenAPI at `/openapi.json`. **The API owns business rules and authorization; this repo only presents them.**
- Decisions: [docs/adr/](docs/adr/).
- Workflow (tickets, agents, commands): see **Workflow** below. Same loop as `mmlabs-online/stoktok` and `mmlabs-online/org-admin-api`.

---

## Stack

> **Proposed — the owner confirms it in PAN-001** (spec §8 Q1). Until then, do not scaffold anything else.

| Layer | Choice |
|---|---|
| UI | React + TypeScript, single-page app built with **Vite** (static files; no server code) |
| Routing / data | TanStack Router + TanStack Query (server state); forms with react-hook-form + zod |
| Components | shadcn/ui (Radix primitives) + Tailwind CSS |
| Auth | `@mmlabs/auth-client` + its React wrapper (org-admin-api USR-03b), app key `admin` |
| API types | generated from org-admin-api `/openapi.json` (`openapi-typescript`) into `src/api/schema.d.ts` |
| Package manager | pnpm (Node version in `.node-version`) |
| Tests | Vitest + Testing Library + MSW (API mocked at the network layer); Playwright for e2e |
| Runtime | static files served by an nginx Docker image, on the Mac runner via `mmlabs-online/deployment`, behind Cloudflare Tunnel |
| CI/CD | GitHub Actions: `ci.yml` (typecheck, lint, test, build); `release.yml` (branch `release/vX.Y.Z` → tag, image → deployment PR), same flow as org-admin-api |

Standard scripts once scaffolded: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm api:types`.
Do not change the stack without the owner's explicit decision.

### Layout (target, created by PAN-001)
```
src/
  main.tsx, app/        # providers (auth, query client), router, app shell (nav, header)
  api/                  # the ONLY place that calls fetch: client, error envelope, Page<T>, generated schema.d.ts
  auth/                 # auth-client wiring, session/account state, route guards, usePermission()
  features/<domain>/    # one folder per domain: routes, components, queries/mutations, tests
  components/ui/        # shared presentational components (no API calls)
  lib/                  # small pure helpers (format dates, etc.)
tests/e2e/              # Playwright
```

---

## Architecture rules (reviewer enforces these)

| ID | Rule |
|---|---|
| R1 | **The API is the only backend.** All data comes from org-admin-api `/api/v1`. No database, no BFF, no server code that stores data. If a screen needs something the API does not offer, record a follow-up for org-admin-api — never fake it in the UI. |
| R2 | **One API client.** Only `src/api/` calls `fetch`. It attaches `Authorization: Bearer <token>`, sends `X-MM-App: admin` where the API needs it, parses the error envelope `{"error": {"code", "message", "details"}}` and `Page<T>` (`limit` ≤ 100, `offset`). Features use TanStack Query hooks built on it. Request/response types come from the generated OpenAPI schema, never hand-written copies. |
| R3 | **Auth through `@mmlabs/auth-client` only.** Credentials are posted straight to the API by the library (no own login endpoint, no password handling elsewhere). The `aud=admin` access token lives **in memory only** — never in `localStorage`, `sessionStorage`, IndexedDB or a cookie the UI sets; the only persisted value is the library's `mm_account_id`. Every route except `/login` (and auth flows like verify-email / reset-password) is behind the auth guard. |
| R4 | **Authorization is the API's job; the UI mirrors it.** Each route and action declares the `admin:<resource>:<action>` permission the API endpoint declares. Without it the UI hides or disables the control, but never relies on that: a `403` from the API is always handled and shown. |
| R5 | **No secrets in the bundle.** Everything in the client is public. Build-time config only via `VITE_*` vars (API base URL, app key, Turnstile site key), listed in `.env.example` without values. Never put tokens, passwords or full emails in logs, analytics, error reports or URLs. |
| R6 | **No XSS sinks.** Never render API data as HTML (`dangerouslySetInnerHTML`, `innerHTML`, `href` from data without scheme check). Security headers (CSP, `frame-ancestors 'none'`, `Referrer-Policy`) are set in the nginx config. |
| R7 | **Stay inside the ticket's plan.** Anything else found goes to the follow-ups list, not into the diff. |
| R8 | **No PASS without green checks.** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` must pass. Logic (API client, guards, permission checks, form schemas, formatters) has unit tests; every new screen has tests for its loading, empty, error (incl. 403) and happy states with MSW. |
| R9 | **Safe mutations.** Destructive or access-changing actions (delete, suspend, disable user, revoke role/session) need an explicit confirmation naming the target, show the API error on failure, and are never optimistic. After success, invalidate the affected queries. |
| R10 | **Accessible by default: WCAG 2.2 AA.** Keyboard reachable, visible focus, labelled inputs with linked errors, semantic tables with headers, status messages announced, contrast ≥ 4.5:1. |
| R11 | **Non-goals are hard limits** (spec §3): no end-user (customer) features, no hosted login for other apps, no billing, no direct edits to other products' data. |

---

## Cross-repo dependencies

Most screens need an org-admin-api endpoint first. A ticket lists them as `Depends on: org-admin-api <ID>` (e.g. `org-admin-api USR-03b`). `/run` checks their state in `mmlabs-online/org-admin-api` `work/backlog.md` (GitHub MCP `get_file_contents`, or a shallow clone) and only treats them as met when `DONE` and merged to its `main`. Never change org-admin-api from this repo; propose a ticket there instead.

Local development points `VITE_API_BASE_URL` at a local org-admin-api (`make dev` on `:8000`, see its README) or uses MSW mocks (`pnpm dev:mock`). The API only answers CORS for origins registered on app `admin` (`apps.origins`), so the local dev origin must be registered there.

---

## Workflow

One orchestrated loop per ticket. **The main session is the orchestrator** (subagents cannot dispatch other subagents), driven by `/run`.

```
/idea "..."     →  spec section + proposed tickets (optional, for new scope)
/ticket "..."   →  BACKLOG
/run [ID]       →  CONSULT (specialists by area) → PLAN (= technical design) → IMPLEMENT → REVIEW ─PASS→ DONE → PR (owner merges)
                                                                                 ^                │
                                                                                 └──── REWORK ────┘  max 2 reworks → ESCALATED (stop, ask owner)
```

- No human gate between PLAN and IMPLEMENT. The loop stops only when: the planner returns blocking questions (`BLOCKED`), reworks are exhausted (`ESCALATED`), or the ticket is `DONE`.
- Each ticket runs on branch `ticket/<ID>` (or the session's mandated branch in cloud sessions). On `DONE` the loop **opens a PR into `main`**. **The owner approves and merges** — agents never merge.

### Commands (`.claude/commands/`)
| Command | Purpose |
|---|---|
| `/idea <idea>` | Shape new scope into `docs/spec-v1.md` and propose tickets |
| `/ticket <description> [P1-P3]` | Create `work/tickets/<ID>/ticket.md` and a backlog row |
| `/run [ID]` | Run the full loop for a ticket (no ID = highest-priority BACKLOG ticket whose dependencies are done) |
| `/status` | Board summary from `work/backlog.md` |
| `/solo <description>` | Small direct change outside the loop (still must pass checks; logged) |

### Agents (`.claude/agents/`)
Workflow roles:
| Agent | Model | Writes | Based on (agency-agents) |
|---|---|---|---|
| `planner` | opus | `plan.md` only | `project-management/project-manager-senior.md` + `engineering/engineering-software-architect.md` |
| `implementer` | sonnet | code + `impl-log.md` | `engineering/engineering-minimal-change-engineer.md` |
| `reviewer` | opus | `review.md` only | `engineering/engineering-code-reviewer.md` + `testing/testing-reality-checker.md` |

Specialists (read-only; `/run` saves their output to the ticket folder):
| Agent | Used when |
|---|---|
| `software-architect` | ticket `areas` include `architecture` (also `/idea`) |
| `frontend-developer` | `ui` (components, state, data fetching, performance) |
| `ux-architect` | `ux` (navigation, information architecture, layouts, flows) |
| `api-platform-engineer` | `api` (consuming the org-admin-api contract, pagination, errors, types) |
| `identity-access-engineer` | `auth` (auth-client, token handling, guards, permissions) |
| `appsec-engineer` | `security` at PLAN; at REVIEW when areas include `security`/`auth` or the diff touches auth, the API client, config, deps, Docker/nginx or CI |
| `accessibility-auditor` | REVIEW, when areas include `ui`, `ux` or `a11y` |
| `product-manager` | `/idea` only (may edit `docs/spec-v1.md`) |

### Files (`work/`)
```
work/backlog.md                 board: one row per ticket
work/solo-log.md                log of /solo changes
work/templates/                 ticket, plan, impl-log, review, escalation
work/tickets/<ID>/
  ticket.md                     goal, acceptance criteria, areas, state, attempts, dependencies, PR
  consult-<agent>.md            specialist notes (optional)
  plan.md                       planner output (technical design)
  impl-log.md                   implementer output (appended per attempt)
  review.md                     reviewer verdict (appended per attempt)
  security-review.md            appsec output (when triggered)
  a11y-review.md                accessibility output (when triggered)
  escalation.md                 only when ESCALATED
```

Ticket states: `BACKLOG` → `PLANNING` → `IN_PROGRESS` → `REVIEW` → `DONE`, plus `REWORK`, `BLOCKED`, `ESCALATED`.

---

## Conventions

- Language: code, comments, docs, commit messages in English. Reports to the owner in Vietnamese. UI label language: spec §8 Q3.
- Ticket IDs: **`PAN-XXX`** (3 digits).
- Commits: `PAN-XXX: <imperative summary>` (or `solo: <summary>`).
- Secrets: none belong in this repo. Local config in `.env.local` (git-ignored); `.env.example` lists `VITE_*` keys without values.
- Third-party agent definitions come from msitarzewski/agency-agents (MIT) — see `THIRD_PARTY_NOTICES.md`.
