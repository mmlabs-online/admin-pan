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

Public pages at fixed paths `/forgot-password`, `/reset-password` and `/verify-email` (owner, 2026-11-15). `/forgot-password` is a text-only notice, with no form and no API call: the API refuses `POST /auth/password/forgot` for app `admin` (org-admin-api ADM-002d), so staff reset their password from any mmlabs app they use, or contact an administrator (owner, 2026-11-17, PAN-012c). `/reset-password` (token from the email link) is kept for links that may already point to it. `/verify-email` (token from the email link) also receives the links the API sends for `admin` resends (org-admin-api USR-12). API: `POST /auth/password/reset`, `/auth/verify-email` (org-admin-api USR-04, USR-04b, done). Resending the verification email needs a signed-in session and belongs with sign-in (the "Send the link again" button comes in PAN-010b).

### §5.2 Users (mmlabs Identity)
List with email search and status filter (paginated), detail, enable/disable with confirmation.
API: `GET /api/v1/users`, `GET/PATCH /api/v1/users/{id}` (`admin:users:read`, `admin:users:write`) — **org-admin-api USR-01b** (done; mounted only when `ADMIN_USERS_API_ENABLED=true` until ADM-002).

#### §5.2.1 Access per user in the list (proposed, owner request 2026-11-25)
Owner request (2026-11-25): *"ở list hiện thị cho thấy user đang có quyền access gì"* — the Users list shows what access each user has today.

- **Problem.** Today staff must open each user's detail sheet (Role assignments tab, PAN-015c) to see their roles. Answering "who on this page can use app X / is an admin" takes one click per user.
- **Proposal.** A read-only **Access** column: per user, the apps where they hold at least one **active** role assignment, each with its role keys and scope (app-wide, or "N orgs"). Long lists are truncated to a few chips plus "+N more" that opens the detail sheet. Expired / inactive assignments are not shown. Users without any role show "No roles".
- **Rules.** The column needs `admin:users:read` (the same permission as `GET /users/{id}/role-assignments`). Values come from the API as-is; the UI does not compute effective permissions.
- **No N+1.** One page of the list must stay **one request** (or a fixed small number), never one request per row (up to 100 per page, §6). `UserRead` today has no access data (fields: `id, email, status, email_verified_at, display_name, created_at, updated_at`), so this needs an API change — **gap**, see API needs below. Until then the column is not built; it must not be faked by looping `GET /users/{id}/role-assignments` per row.
- **Filter (optional, Q11).** "Has a role in app X" / "has role R" filters on the list. `GET /users` filters today only by `email` and `status` — **gap**.
- **Open:** Q8 (what counts as "access": role assignments only, or also app memberships without a role).

#### §5.2.2 Bulk role assignment from the list (proposed, owner request 2026-11-25)
Owner request (2026-11-25): *"ở list user. tôi muốn có bulk action để assign role cho 1 loạt account"* — select many accounts on the Users list and assign one role to all of them at once.

- **Problem.** Onboarding a team (e.g. giving 20 support staff the same role) today means 20 × (open user → Role assignments → Assign). Slow and error-prone.
- **Proposal.**
  1. Row checkboxes on the Users list (plus "select all on this page"); selection is limited to the **current page** (≤ `limit`, max 100) in v1 — no "select all N matching the filter". Selection clears on page/filter change.
  2. A bulk action bar ("N selected · Assign role…") shown only with `admin:roles:assign` (R4); the API's 403 is still handled.
  3. Dialog reuses the single-user assign form (PAN-015c): app → role → scope (app-wide or one org, by the app's org mode) → optional expiry.
  4. **Confirmation (R9)** names the target: role key, app, scope (org name), expiry, the number of accounts and their emails (list scrollable). Not optimistic.
  5. **Result per account**: assigned / already had this role (skipped) / failed with the API's reason (e.g. `self_assignment_forbidden`, user not found, disabled-user policy if any). The summary stays open until dismissed; failed accounts stay selected so staff can retry or deselect. Afterwards the affected queries (list, each user's assignments, role holders) are invalidated.
- **Rules owned by the API.** Validation (role exists in app, org allowed by org mode, expiry rules, `admin:super-admin` expiry ban, self-assignment, last-super-admin) and the audit entry per assignment are the API's. The UI only presents results.
- **Partial failure.** Two ways, owner to choose (Q9):
  - **(A, recommended) Bulk endpoint in org-admin-api** — one request, server validates once, returns a result per user, writes one audit entry per assignment; the API decides atomic vs per-user. Needs a new org-admin-api ticket.
  - **(B) Client loop** over the existing `POST /users/{user_id}/role-assignments`, **sequential** (the API serializes assignments on an app lock and can return 409 `conflict` "changed concurrently"), max one page (100) per run, with the per-account result report above. Works today, but a closed tab mid-run leaves a partial result with no server-side record of the batch, and 100 calls take noticeably long.
- **Not in this iteration:** bulk revoke, bulk change of role, bulk assign across pages / to "all matching the filter", CSV import of emails. Open: Q9, Q10, Q12.

API needs for §5.2.1–§5.2.2 (contract snapshot `src/api/openapi.json`, 2026-11-25):

| Need | Endpoint | State |
|---|---|---|
| List users | `GET /api/v1/users` (`email`, `status`, `limit`≤100, `offset`) | exists (USR-01b) |
| Access per user in the list | `GET /api/v1/users` items gain an access summary, e.g. opt-in `include=access` → `access: [{app, roles: [{role_id, role_key, org_id\|null, expires_at\|null}]}]` (active only); **or** one batch read `GET /api/v1/role-assignments?user_id=…&user_id=…` (≤100 ids, active only) | **missing** — propose org-admin-api ticket |
| Filter users by access | `GET /api/v1/users?app=<key>&role_id=<uuid>` | **missing** — propose (same ticket or separate, Q11) |
| One user's assignments | `GET /api/v1/users/{user_id}/role-assignments` (`app`, paginated; `admin:users:read`) | exists (PAN-015c) |
| Assign one | `POST /api/v1/users/{user_id}/role-assignments` `{role_id, org_id?, expires_at?}` (`admin:roles:assign`; 409 `conflict` on active duplicate; 404/409 undocumented in OpenAPI) | exists (PAN-015c) |
| Assign many | e.g. `POST /api/v1/apps/{key}/role-definitions/{role_id}/assignments:bulk` or `POST /api/v1/role-assignments/bulk` `{role_id, org_id?, expires_at?, user_ids[≤100]}` → `{results: [{user_id, status: created\|unchanged\|failed, assignment_id?, error?: {code, reason}}]}` (`admin:roles:assign`, one audit entry per assignment) | **missing** — propose org-admin-api ticket (only if Q9 = A) |
| Roles of an app, holders of a role | `GET /apps/{key}/role-definitions`, `GET /apps/{key}/role-definitions/{role_id}/assignments` | exists |

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
Dashboard: KPIs (users, active orgs, registered apps, sign-ins in the last 24 h) with factual breakdowns from the API (e.g. "N active · M disabled"), new accounts per month (last 12 months), members per app, and items needing attention (unverified emails, suspended organizations, failed sign-ins in the last 24 h). The dashboard (`/`) requires `admin:stats:read`; without it staff see the 403 page (owner, 2026-11-18). Not in v1 (owner, 2026-11-18, PAN-020): change vs a previous period, a daily sign-in series, recent admin activity — follow-ups for org-admin-api / a later ticket. Reports: define, run and export operational reports (see Q7).
API: `GET /api/v1/stats/dashboard` (`admin:stats:read`) — **org-admin-api ADM-015** (done). Reports: **gap** (ADM-017 proposed).

### §5.6 Org product entitlements
Enable/disable a product for an org, set plan/limits.
API: **org-admin-api ADM-006** (backlog).

## §6 Non-functional

- WCAG 2.2 AA (rule R10). Works on current Chrome, Edge, Firefox, Safari desktop; usable on a tablet.
- No secrets in the bundle; access token in memory only (R3, R5). Security headers via nginx (R6).
- Lists use server-side pagination (`limit` ≤ 100) and stay responsive with thousands of rows.

### §6.1 Deployment
- First release (owner, 2026-11-16): ship the mock-data UI publicly at `admin-portal.mmlabs.online` before real sign-in (PAN-010); it holds no real data.
- Hostname on `*.mmlabs.online` — required, because the identity cookie flow only works same-site with `api.mmlabs.online` (org-admin-api identity-architecture §7). Hostname: `admin-portal.mmlabs.online` (owner, 2026-11-16). Its origin must be registered on app `admin` (`apps.origins`).
- Static files in an nginx image; release/deploy like org-admin-api: branch `release/vX.Y.Z` from main → image on Docker Hub → PR on `mmlabs-online/deployment` → owner merges → Mac runner, Cloudflare Tunnel.

## §7 Success metrics

- Every admin task org-admin-api supports can be done in the UI, without raw API calls.

## §8 Open questions (owner)

- [x] Q1. Stack — **answered 2026-11-11:** build on the satnaing/shadcn-admin template (React + Vite + TanStack + shadcn/ui).
- [x] Q2. Hostname — **answered 2026-11-16:** `admin-portal.mmlabs.online`.
- [ ] Q3. UI language: Vietnamese, English, or both?
- [ ] Q4. Design reference: a Figma file, or design in code from a brief (like stoktok)?
- [ ] Q5. Order of screens after sign-in (proposal: users → organizations → apps/roles → audit → entitlements).
- [ ] Q6. 2FA for staff (org-admin-api OQ3) — does the UI need a second-factor step in v1?
- [ ] Q7. "Reports management": the mock (PAN-007) lets staff define, run and download operational reports (sign-ups, active users, app memberships, org overview, audit activity). Is that the intended scope? It needs a reports API in org-admin-api.
- [ ] Q8. Users list "access" (§5.2.1): does it mean role assignments only (app + role + scope), or also app memberships the user has without a role (joined apps)? And should expired assignments be hidden (proposal: hide; the detail sheet shows them)?
- [ ] Q9. Bulk assign (§5.2.2): (A) wait for a bulk endpoint in org-admin-api (recommended: one request, server-side per-user results and audit), or (B) ship now with a sequential per-user loop and a per-account result report, then switch to (A) later? If (A): all-or-nothing, or per-user results (proposal: per-user results, already-assigned counts as unchanged, not as an error)?
- [ ] Q10. Bulk assign targets: may it include **disabled** users (proposal: allowed, warned in the confirmation — the API decides), and may it assign **`admin:super-admin`** or other `admin` app roles in bulk (proposal: not in bulk; one by one only)? Is 100 accounts per run enough?
- [ ] Q11. Do you also want to filter the Users list by app / role ("everyone with role R in app X")? It needs new filter params on `GET /users`.
- [ ] Q12. Bulk revoke / remove a role from many accounts: wanted soon, or later (proposal: later, separate ticket)?

## §9 Tickets

All tickets are in [`work/backlog.md`](../work/backlog.md). Phase 1 (screens on mock data) is done; the rest waits on org-admin-api endpoints, except PAN-009.

API gaps to raise in org-admin-api (no ticket there yet): admin sessions list/revoke, reports, access summary per user in `GET /users` (§5.2.1), users filter by app/role (§5.2.1, Q11), bulk role assignment (§5.2.2, Q9).

Proposed (not yet in the backlog, from `/idea` 2026-11-25): PAN-032 Access column on the Users list · PAN-033 Bulk assign a role to selected users · PAN-034 Filter users by app / role (only if Q11 = yes).
