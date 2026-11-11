# admin-pan — Product spec v1

Status: **Draft** — written while bootstrapping the repo (2026-11-11); screens of §5.1–§5.7 exist on mock data (PAN-001…008). Everything below is a proposal for the owner to confirm, cut or change, especially §8 Open questions.
Source of truth for scope: if `CLAUDE.md`, a ticket and this spec disagree on scope, **this spec wins** — flag the conflict.
Business rules, data and authorization are owned by **org-admin-api** (`mmlabs-online/org-admin-api`, `docs/spec-v1.md` and `docs/identity-architecture.md`). This spec only describes the screens over them.

## §1 Problem

org-admin-api gives mmlabs one admin API (orgs, mmlabs Identity users, apps/RBAC, audit, entitlements), but staff have no UI for it: today every admin action needs a raw API call.

## §2 Goals

- One web UI where internal staff do every cross-product admin task that org-admin-api exposes.
- Staff sign in with their mmlabs Identity account; what they see and can do follows their `admin:*` permissions.
- Safe by default: destructive actions are confirmed, and every change is visible in the audit log.

## §3 Non-goals (v1)

- Any backend or database of its own (the API is the only backend, rule R1).
- End-user (customer) features of the mmlabs products, and a hosted login for other apps.
- Features org-admin-api does not offer (they start as an org-admin-api ticket).
- Billing / payments.

## §4 Actors

Same as org-admin-api spec §4: super admin, support staff, ops / product owner, auditor.

## §5 Features

Each feature lists the org-admin-api endpoints it uses and the API ticket that provides them (state as of 2026-11-11).

### §5.1 Sign-in and app shell
Login page using `@mmlabs/auth-client` (app key `admin`); account picker / switch and logout; the `aud=admin` token is kept in memory and refreshed by the library. Shell with navigation filtered by permission, signed-in user, and a clear page for 403 and for "email not verified" / "not a member".
API: `POST /api/v1/auth/login`, `/auth/token`, accounts, logout — **org-admin-api USR-03, USR-03b** (backlog). Admin endpoints require `aud=admin` — **ADM-002** (backlog).

### §5.2 Users (mmlabs Identity)
List with email search and status filter (paginated), detail, enable/disable with confirmation.
API: `GET /api/v1/users`, `GET/PATCH /api/v1/users/{id}` (`admin:users:read`, `admin:users:write`) — **org-admin-api USR-01b** (done; mounted only when `ADMIN_USERS_API_ENABLED=true` until ADM-002).

### §5.3 Organizations
List (paginated), create, detail, edit, suspend/reactivate, delete with confirmation.
API: `/api/v1/organizations` CRUD — **org-admin-api ADM-001** (done). Note: the table moves to the Identity module and gains `created_by` in **USR-06**; members per org arrive there too.

### §5.4 Apps, roles and access
Apps registry (join policy, org mode, origins, default role), roles and their permissions, role assignments per user (app scope or one org), revoke sessions.
API: **org-admin-api USR-02** (backlog), sessions revoke (identity-architecture §4).

### §5.5 Audit log
Read-only, filterable list (actor, action, target, time) with before/after detail; links from users/orgs to their history.
API: **org-admin-api ADM-004** (backlog).

### §5.7 Dashboard and reports
Dashboard: KPIs (users, active orgs, apps, sign-ins), sign-up and sign-in trends, members per app, items needing attention, recent admin activity. Reports: define, run and export operational reports (see Q7).
API: none yet — **gap** (stats and reports endpoints).

### §5.6 Org product entitlements
Enable/disable a product for an org, set plan/limits.
API: **org-admin-api ADM-006** (backlog).

## §6 Non-functional

- WCAG 2.2 AA (rule R10). Works on current Chrome, Edge, Firefox, Safari desktop; usable on a tablet.
- No secrets in the bundle; access token in memory only (R3, R5). Security headers via nginx (R6).
- Lists use server-side pagination (`limit` ≤ 100) and stay responsive with thousands of rows.

### §6.1 Deployment (proposal)
- Hostname on `*.mmlabs.online` — required, because the identity cookie flow only works same-site with `api.mmlabs.online` (org-admin-api identity-architecture §7). Proposed: `admin.mmlabs.online` (Q2). Its origin must be registered on app `admin` (`apps.origins`).
- Static files in an nginx image; release/deploy like org-admin-api: branch `release/vX.Y.Z` from main → image on Docker Hub → PR on `mmlabs-online/deployment` → owner merges → Mac runner, Cloudflare Tunnel.

## §7 Success metrics

- Every admin task org-admin-api supports can be done in the UI, without raw API calls.

## §8 Open questions (owner)

- [x] Q1. Stack — **answered 2026-11-11:** build on the satnaing/shadcn-admin template (React + Vite + TanStack + shadcn/ui).
- [ ] Q2. Hostname: `admin.mmlabs.online`?
- [ ] Q3. UI language: Vietnamese, English, or both?
- [ ] Q4. Design reference: a Figma file, or design in code from a brief (like stoktok)?
- [ ] Q5. Order of screens after sign-in (proposal: users → organizations → apps/roles → audit → entitlements).
- [ ] Q6. 2FA for staff (org-admin-api OQ3) — does the UI need a second-factor step in v1?
- [ ] Q7. "Reports management": the mock (PAN-007) lets staff define, run and download operational reports (sign-ups, active users, app memberships, org overview, audit activity). Is that the intended scope? It needs a reports API in org-admin-api.

## §9 Tickets

All tickets are in [`work/backlog.md`](../work/backlog.md). Phase 1 (screens on mock data) is done; the rest waits on org-admin-api endpoints, except PAN-009.

API gaps to raise in org-admin-api (no ticket there yet): admin sessions list/revoke, dashboard stats, reports, member count per app.
