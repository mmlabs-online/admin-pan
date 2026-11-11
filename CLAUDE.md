# admin-pan

Admin web UI for the whole **mmlabs** ecosystem. Internal staff use it to manage organizations, users, apps, roles, entitlements and to read the audit log. It has **no backend of its own**: every read and write goes through **org-admin-api** (`mmlabs-online/org-admin-api`, `https://api.mmlabs.online/api/v1`), and staff sign in with their mmlabs Identity account.

- Product spec: [docs/spec-v1.md](docs/spec-v1.md) — source of truth for scope. If this file, a ticket and the spec disagree on scope, the spec wins; flag the conflict.
- API contract: org-admin-api's `docs/spec-v1.md`, `docs/identity-architecture.md` (§4 endpoint list, §6 client libraries) and its OpenAPI at `/openapi.json`. **The API owns business rules and authorization; this repo only presents them.**
- Decisions: [docs/adr/](docs/adr/).
- Workflow (tickets, agents, commands): see **Workflow** below. Same loop as `mmlabs-online/stoktok` and `mmlabs-online/org-admin-api`.

---

## Stack

Based on the **[satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)** template (MIT; owner's decision 2026-11-11, PAN-001).

| Layer | Choice |
|---|---|
| UI | React 19 + TypeScript, single-page app built with **Vite** (static files; no server code) |
| Routing / data | TanStack Router (file-based, `src/routes/`, generated `src/routeTree.gen.ts`), TanStack Query (server state), TanStack Table (data tables) |
| Components | shadcn/ui (Radix primitives) + Tailwind CSS v4, lucide icons, recharts, sonner toasts |
| Forms / state | react-hook-form + zod; zustand for small client state (`src/stores/`) |
| Auth | mock today; `@mmlabs/auth-client` + its React wrapper from PAN-010 (org-admin-api USR-03b), app key `admin` |
| API | not wired yet; from PAN-009 one client in `src/api/` with types generated from org-admin-api `/openapi.json` |
| Package manager | pnpm (Node version in `.node-version`) |
| Tests | Vitest **browser mode** (Playwright Chromium) + `vitest-browser-react`; Playwright e2e later (PAN-023) |
| Runtime | static files served by an nginx Docker image, on the Mac runner via `mmlabs-online/deployment`, behind Cloudflare Tunnel (PAN-022) |
| CI/CD | GitHub Actions: `ci.yml` (typecheck, lint, format, test, build); `release.yml` later (PAN-022), same flow as org-admin-api |

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm typecheck      # tsc -b
pnpm lint           # eslint
pnpm format         # prettier --write (format:check in CI)
pnpm test           # vitest browser mode; in a cloud sandbox set PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium
pnpm build          # tsc -b && vite build → dist/
```

Do not change the stack without the owner's explicit decision.

### Layout
```
src/
  main.tsx              # query client, router, theme/font/direction providers
  routes/               # TanStack file routes: (auth)/, (errors)/, _authenticated/<feature>/ — thin: search schema + component
  features/<feature>/   # one folder per screen: index.tsx (page), components/, data/ (schema + mock data), tests next to code
  components/ui/        # shadcn/ui primitives (generated; edit only to fix bugs)
  components/           # shared app components: layout/ (sidebar, header), data-table/, confirm-dialog, …
  stores/               # zustand stores (auth-store: in memory only, R3)
  hooks/, lib/, context/
  api/                  # from PAN-009: the ONLY place that talks HTTP
```
Features today: `dashboard`, `users`, `organizations`, `apps`, `roles`, `reports`, `audit-log`, `settings`, `auth`, `errors`.

### Mock-data phase (until each "on the real API" ticket)
Screens run on mock data in `src/features/<feature>/data/`, using the **API's exact field names** (snake_case) so the swap is mechanical. Mutations change in-memory state only. Each mock file says which org-admin-api endpoint/ticket replaces it. Never call the network from mock code.

---

## Architecture rules (reviewer enforces these)

| ID | Rule |
|---|---|
| R1 | **The API is the only backend.** All data comes from org-admin-api `/api/v1`. No database, no BFF, no server code that stores data. If a screen needs something the API does not offer, record a follow-up for org-admin-api — never fake it in the UI. |
| R2 | **One API client.** Only `src/api/` makes HTTP calls (`fetch` or axios). It attaches `Authorization: Bearer <token>`, sends `X-MM-App: admin` where the API needs it, parses the error envelope `{"error": {"code", "message", "details"}}` and `Page<T>` (`limit` ≤ 100, `offset`). Features use TanStack Query hooks built on it. Request/response types come from the generated OpenAPI schema, never hand-written copies. |
| R3 | **Auth through `@mmlabs/auth-client` only.** Credentials are posted straight to the API by the library (no own login endpoint, no password handling elsewhere). The `aud=admin` access token lives **in memory only** — never in `localStorage`, `sessionStorage`, IndexedDB or a cookie the UI sets; the only persisted value is the library's `mm_account_id`. Every route except `/login` (and auth flows like verify-email / reset-password) is behind the auth guard. |
| R4 | **Authorization is the API's job; the UI mirrors it.** Each route and action declares the `admin:<resource>:<action>` permission the API endpoint declares. Without it the UI hides or disables the control, but never relies on that: a `403` from the API is always handled and shown. |
| R5 | **No secrets in the bundle.** Everything in the client is public. Build-time config only via `VITE_*` vars (API base URL, app key, Turnstile site key), listed in `.env.example` without values. Never put tokens, passwords or full emails in logs, analytics, error reports or URLs. |
| R6 | **No XSS sinks.** Never render API data as HTML (`dangerouslySetInnerHTML`, `innerHTML`, `href` from data without scheme check). Security headers (CSP, `frame-ancestors 'none'`, `Referrer-Policy`) are set in the nginx config. |
| R7 | **Stay inside the ticket's plan.** Anything else found goes to the follow-ups list, not into the diff. |
| R8 | **No PASS without green checks.** `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` must pass. Logic (API client, guards, permission checks, form schemas, formatters) has unit tests; every screen has tests for its main states — on mock data: list, filters, forms, confirm/cancel; on the real API also loading, empty, error and 403 (API mocked at the network layer). |
| R9 | **Safe mutations.** Destructive or access-changing actions (delete, suspend, disable user, revoke role/session) need an explicit confirmation naming the target, show the API error on failure, and are never optimistic. After success, invalidate the affected queries. |
| R10 | **Accessible by default: WCAG 2.2 AA.** Keyboard reachable, visible focus, labelled inputs with linked errors, semantic tables with headers, status messages announced, contrast ≥ 4.5:1. |
| R11 | **Non-goals are hard limits** (spec §3): no end-user (customer) features, no hosted login for other apps, no billing, no direct edits to other products' data. |

---

## Cross-repo dependencies

Most screens need an org-admin-api endpoint first. A ticket lists them as `Depends on: org-admin-api <ID>` (e.g. `org-admin-api USR-03b`). `/run` checks their state in `mmlabs-online/org-admin-api` `work/backlog.md` (GitHub MCP `get_file_contents`, or a shallow clone) and only treats them as met when `DONE` and merged to its `main`. Never change org-admin-api from this repo; propose a ticket there instead.

From PAN-009, local development points `VITE_API_BASE_URL` at a local org-admin-api (`make dev` on `:8000`, see its README); until then screens use mock data. The API only answers CORS for origins registered on app `admin` (`apps.origins`), so the local dev origin must be registered there.

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
- Formatting: prettier (single quotes, no semicolons, sorted imports — `.prettierrc`); run `pnpm format` before committing.
- Commits: `PAN-XXX: <imperative summary>` (or `solo: <summary>`).
- Secrets: none belong in this repo. Local config in `.env.local` (git-ignored); `.env.example` lists `VITE_*` keys without values.
- Third-party: agent definitions from msitarzewski/agency-agents (MIT) and the app template satnaing/shadcn-admin (MIT) — see `THIRD_PARTY_NOTICES.md`.
