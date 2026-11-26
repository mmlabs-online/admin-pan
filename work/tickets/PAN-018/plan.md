Status: READY

# Plan — PAN-018: Organization members and invitations

## Spec summary
`docs/spec-v1.md` §5.3 Organizations:
> List (paginated), create, detail, edit, suspend/reactivate, delete with confirmation.
> API: `/api/v1/organizations` CRUD — **org-admin-api ADM-001** (done). Note: the table moves to the Identity module and gains `created_by` in **USR-06**; members per org arrive there too.

§6: "Lists use server-side pagination (`limit` ≤ 100) and stay responsive with thousands of rows."

Ticket goal: "In organization detail, show members (with roles) and pending invitations."

**Drift (owner note, do not edit the spec here):** §5.3 and the ticket's `Depends on` name org-admin-api **USR-06**. The endpoints actually come from **USR-23** "Staff read of an organization's members and invitations" — `MERGED` in org-admin-api `work/backlog.md` (line 83; clone at f632a25). USR-06 is also MERGED, so the dependency is met under either reading. The spec line and the ticket's Depends line should be corrected to USR-23 (follow-up).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Members list with role and joined date | `organization-members-tab.test.tsx` › "rows: table labelled 'Role assignments in {name}' …": each row shows the user (display name or "No display name", email, user status badge), app key, role name + role key, **Granted** date (`created_at` in a `<time>`), expiry ("Never" or date) and "Not expired"/"Expired". A user with two roles shows as two rows; the intro text says the count is of role assignments, not people. Pager test: Next sends `offset=20`. |
| 2 | Invitations list with status | `organization-invitations-tab.test.tsx` › "rows: status text Pending / Accepted / Revoked / Expired …" and "status filter": rows show status badge text, app, role key, created, expires, accepted/revoked date; default request is `?limit=20&offset=0&status=pending`; choosing "All statuses" sends no `status`. |
| 3 | States tested | Both tab test files cover: fetched only when the tab is selected; loading; empty; error + Retry recovers; 404 "This organization no longer exists." (no Retry); 403 inline ForbiddenPanel; pagination. `organization-detail-sheet.test.tsx` covers permission gating of each tab independently. `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` green (R8). |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/api/openapi.json` | Insert only the `get` operations of `/api/v1/organizations/{org_id}/members` and `/api/v1/organizations/{org_id}/invitations`, and schemas `OrgMemberRead`, `OrgInvitationRead`, `InvitationStatus`, `Page_OrgMemberRead_`, `Page_OrgInvitationRead_` (plus any other schema they `$ref` that is missing), copied by script from org-admin-api f632a25 generator output (Approach §0) | R2: types from the OpenAPI schema |
| `src/api/schema.d.ts` | Output of `pnpm api:types` | R2 |
| `src/lib/permissions/registry.ts` | Add `'organizations.viewMembers': perm('admin:users:read', 'GET /api/v1/organizations/{org_id}/members')` and `'organizations.viewInvitations': perm('admin:organizations:read', 'GET /api/v1/organizations/{org_id}/invitations')` | R4; `registry.test.ts` checks them against `x-permission` |
| `src/features/organizations/api/members.ts` (new) | `MEMBERS_PAGE_SIZE = 20`, `INVITATIONS_PAGE_SIZE = 20`; `orgMembersKeys`, `orgInvitationsKeys` nested under `organizationsKeys.detail(orgId)`; `orgMembersQueryOptions(orgId, {limit, offset}, api)` and `orgInvitationsQueryOptions(orgId, {limit, offset, status?}, api)` with `placeholderData: keepPreviousData` | Data access via the one client (R2) |
| `src/features/organizations/api/members.test.ts` (new) | Keys and requests | R8 |
| `src/features/organizations/data/members.ts` (new) | `type OrgMember = components['schemas']['OrgMemberRead']`, `type OrgInvitation = components['schemas']['OrgInvitationRead']`, `type InvitationStatus`; `invitationStatusOptions` (`pending`, `accepted`, `revoked`, `expired`, plus `all` filter value) with labels; `invitationStatusLabel(s: string)` returning the label or the raw value for unknown values | Labels in one place; unknown enum handled |
| `src/features/organizations/data/members.test.ts` (new) | Labels; drift guard: the option values equal the `InvitationStatus` enum in `openapi.json`; unknown status falls back to raw text | R8 |
| `src/features/organizations/components/offset-pager.tsx` (new) | Small "Showing a–b of total {noun}" + Previous/Next (aria-disabled) used by both new tabs, same markup/behaviour as `role-holders-sheet.tsx` lines 210–242 | Avoid copying the pager twice in this ticket (existing copies are not touched — R7) |
| `src/features/organizations/components/organization-members-tab.tsx` (new) | Read-only Members tab | AC1 |
| `src/features/organizations/components/organization-members-tab.test.tsx` (new) | State tests | AC1, AC3 |
| `src/features/organizations/components/organization-invitations-tab.tsx` (new) | Read-only Invitations tab with status filter | AC2 |
| `src/features/organizations/components/organization-invitations-tab.test.tsx` (new) | State tests | AC2, AC3 |
| `src/features/organizations/components/organization-detail-sheet.tsx` | Add `Members` and `Invitations` triggers/contents (order: Overview, Members, Invitations, Entitlements), each gated by `useActionPermission(...) !== 'denied'`; description "Organization details, members, invitations and product entitlements."; let `TabsList` wrap (`flex-wrap h-auto`) if 4 triggers overflow at 320 px | Placement in org detail (ticket goal) |
| `src/features/organizations/components/organization-detail-sheet.test.tsx` | Update the first test's tab list; add gating tests | AC3, R4 |
| `src/features/organizations/components/test-data.ts` | `MEMBERS` and `INVITATIONS` fixtures by org id; `membersPage(items, total, limit, offset)`, `invitationsPage(...)` | Test fixtures |
| `src/features/organizations/components/test-fixtures.tsx` | `orgsServer` routes `GET …/{id}/members` and `…/{id}/invitations` (optional `opts.members` / `opts.invitations` callbacks receiving the `Request` so tests can vary by `offset`/`status`); helpers `memberCalls(seen, orgId)`, `invitationCalls(seen, orgId)` | Network-layer mocks (R8) |

No ADR: the patterns (nested query keys, lazy tabs, offset pager, ForbiddenPanel) already exist.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `api/members.test.ts` › "orgMembersKeys.list and orgInvitationsKeys.list are under organizationsKeys.detail(org) and not under organizationsKeys.lists(); different status → different key" | Invalidation reach |
| `api/members.test.ts` › "orgMembersQueryOptions sends GET /api/v1/organizations/{id}/members?limit=20&offset=0 (no app, no active) and returns the page" | Request shape |
| `api/members.test.ts` › "orgInvitationsQueryOptions sends ?limit=20&offset=0&status=pending when status is given and no status param when it is undefined" | Request shape |
| `data/members.test.ts` › "invitation status values equal the InvitationStatus enum in openapi.json; labels Pending/Accepted/Revoked/Expired; unknown value shown as-is" | Drift guard, unknown enum |
| `lib/permissions/registry.test.ts` (existing, unchanged) | New actions match `x-permission` (`admin:users:read`, `admin:organizations:read`) |
| `organization-members-tab.test.tsx` › "fetches GET …/members?limit=20&offset=0 only when the Members tab is selected" | Lazy fetch |
| `organization-members-tab.test.tsx` › "loading 'Loading role assignments…' / empty 'No one holds a role in this organization.' / error + Retry recovers to rows / 404 'This organization no longer exists.' without Retry / 403 inline ForbiddenPanel" | States |
| `organization-members-tab.test.tsx` › "rows: table labelled 'Role assignments in {name}', th scope=col (User, App, Role, Granted, Expires, Status); display name or 'No display name'; email; Disabled user badge; role name + key; Granted <time dateTime=created_at>; 'Never' when no expiry; 'Expired' for active=false; the same user on two rows" | AC1 |
| `organization-members-tab.test.tsx` › "total 45: 'Showing 1–20 of 45 role assignments'; Previous aria-disabled; Next sends offset=20; on the last page Next is aria-disabled" | Pagination |
| `organization-invitations-tab.test.tsx` › "fetches GET …/invitations?limit=20&offset=0&status=pending only when the Invitations tab is selected" | Lazy fetch, default filter |
| `organization-invitations-tab.test.tsx` › "loading 'Loading invitations…' / empty 'No pending invitations.' (and 'No invitations.' for All) / error + Retry / 404 no Retry / 403 inline ForbiddenPanel" | States |
| `organization-invitations-tab.test.tsx` › "rows: table labelled 'Invitations of {name}', th scope=col (Status, App, Role, Created, Expires, Accepted / revoked); status as text Pending / Accepted / Revoked / Expired; accepted/revoked date or 'None'; the note says invitee emails are not shown" | AC2 |
| `organization-invitations-tab.test.tsx` › "status filter is labelled 'Status'; choosing All statuses sends no status param and resets offset to 0; choosing Expired sends status=expired" | Filter |
| `organization-invitations-tab.test.tsx` › "total 25: Next sends offset=20 with the same status" | Pagination |
| `organization-detail-sheet.test.tsx` › first test updated: "tabs are Overview, Members, Invitations and Entitlements" | Placement |
| `organization-detail-sheet.test.tsx` › "granted admin:organizations:read only: Members tab absent and no …/members request; Invitations tab present and loads" | R4 gating, independence |
| `organization-detail-sheet.test.tsx` › "granted admin:organizations:read + admin:users:read: both tabs; a 403 on …/invitations shows ForbiddenPanel in Invitations while Members still lists rows" | 403 isolation (R4) |

Tests use `fakeApi`/`json`/`apiError` from `@/test-utils/api` through `orgsServer` (network layer). Do not assert on member row order (the API does not document it); find rows by text.

## Approach
0. **Snapshot (R2), method fixed for this ticket — scripted fragment copy, as PAN-011b.** A full regeneration from f632a25 would pull in unrelated drift (e.g. new `admin:bug-reports:*` and `admin:usage:*` permissions, which fail `registry.test.ts`'s "ADMIN_PERMISSIONS equals the set of x-permission values" and widen the diff — R7). So:
   1. `git -C /home/user/mmlabs-online/org-admin-api rev-parse --short HEAD` must print `f632a25`. Generate the full spec into the scratchpad without writing into the clone: `cd /home/user/mmlabs-online/org-admin-api && UV_PROJECT_ENVIRONMENT=<scratchpad>/oaa-venv DATABASE_URL=postgresql+asyncpg://x:x@localhost/x uv run python -m app.cli openapi --output <scratchpad>/openapi-f632a25.json` (command used in PAN-019).
   2. A scratchpad Node script copies into `src/api/openapi.json`: `paths['/api/v1/organizations/{org_id}/members'].get` and `paths['/api/v1/organizations/{org_id}/invitations'].get` (only `get`; leave any other method out), and `components.schemas` `OrgMemberRead`, `OrgInvitationRead`, `InvitationStatus`, `Page_OrgMemberRead_`, `Page_OrgInvitationRead_`, plus any transitively `$ref`ed schema missing from the snapshot. For refs already in the snapshot (`UserStatus`, `ErrorEnvelope`, …) assert they are deep-equal to the generated version; if one differs, stop and record it (do not overwrite). Keep keys sorted like the rest of the file; 2-space JSON with trailing newline.
   3. `pnpm api:types`. `git diff --stat src/api/` must be insertions only. Record commit, command and diff stat in impl-log.
   4. Fallback only if the generator cannot run: hand-transcribe the same fragment from `app/modules/organizations/router.py` (lines 173–221), `rbac/schemas.py` `OrgMemberRead` (320–346) and `invitations/schemas.py` (37–63), mirroring the shape of the existing `/entitlements` GET in the snapshot; record "hand-patched" in impl-log (precedent PAN-013).
1. **Registry**: two actions (Files table). Exact permissions from the router: members `_route("admin:users:read", …)` (line 180), invitations `_route(READ, …)` = `admin:organizations:read` (lines 32, 206).
2. **Queries** in `api/members.ts`, copying `api/entitlements.ts`: keys `[...organizationsKeys.detail(orgId), 'members', {limit, offset}]` and `[..., 'invitations', {limit, offset, status}]` (status key omitted/`undefined` for "all"). Query params typed from `paths[...]['get']['parameters']['query']`. Send only `limit`, `offset` (and `status` when set). No `app`/`active` filters for members (R7). Emails never enter keys, URLs, toasts or live regions (R5) — only the org id does.
3. **Members tab** (`organization-members-tab.tsx`), skeleton from `role-holders-sheet.tsx` (lines 73–242) without the Assign button and dialog: `offset` state, `useQuery(orgMembersQueryOptions(org.id, {limit: MEMBERS_PAGE_SIZE, offset}, api))`, `queryView`, step-back when a settled page is empty and `offset > 0`. Heading "Members"; intro: "Role assignments held in this organization. A person with two roles is listed twice, so the count is of role assignments, not people." Columns: User (`<bdi>` display name or "No display name" + `UserStatusBadge` from `@/features/users/components/user-status-badge`, `<bdi>` email below), App (`app`, mono), Role (`role_name` with `role_key` mono below), Granted (`<time dateTime={created_at}>` via `formatDate` from `@/features/apps/data/data`), Expires (`formatDateTimeZone` from `@/features/users/data/data` or "Never"), Status (Badge text "Not expired"/"Expired" from `active`, as role-holders; never "effective"). `granted_by` and `user_id` are not shown (bare UUIDs). sr-only `role=status` count line "N role assignments". 404 → "This organization no longer exists." with no Retry; other errors → "Couldn't load role assignments." + Retry; 403 → `ForbiddenPanel variant='inline'`.
4. **Invitations tab** (`organization-invitations-tab.tsx`): same skeleton plus a status filter copied from `app-join-requests-tab.tsx` lines 138–158 (`Label` + `Select`, `useId`), options "Pending" (default), "Accepted", "Revoked", "Expired", "All statuses"; changing it resets `offset` to 0. Heading "Invitations"; intro: "Invitations to join this organization, newest first. The API does not return the invitee's email." Columns: Status (Badge with `invitationStatusLabel` text — not colour only), App (mono), Role (`role_key` mono), Created, Expires, Accepted / revoked (`accepted_at` → "Accepted {date}", `revoked_at` → "Revoked {date}", else "None"). `invited_by`/`accepted_by` not shown. Empty: "No pending invitations." / "No {label} invitations." / "No invitations." for All. Same error/404/403 handling.
5. **Pager** `offset-pager.tsx`: props `{offset, pageSize, total, noun, onOffsetChange}`; renders nothing when `total <= pageSize`; `role=status aria-live=polite` "Showing {from}–{to} of {total} {noun}"; Previous/Next with `aria-disabled` (not native `disabled`, consistent with existing pagers) and guarded `onClick`.
6. **Sheet**: add the two tabs gated by `useActionPermission('organizations.viewMembers' | 'organizations.viewInvitations') !== 'denied'`. Radix `TabsContent` unmounts inactive panels, so each tab fetches only when selected. The API's 403 is still handled inside each tab (R4).
7. **Fixtures/tests** as listed. Acme: 3 assignments — Ada (two roles: calechip `admin`, calechip `member`), a disabled user with `display_name: null`, one expired row (`active: false`, past `expires_at`); Globex: none. Invitations for Acme: one per status; Initech: none.
8. Run `pnpm typecheck && pnpm lint && pnpm format && pnpm format:check && pnpm test && pnpm build` (R8).

Rules: R1 (everything from the two endpoints; no grouping, no derived "joined" date, no N+1 lookups for inviter names), R2 (generated types, one client), R4 (route-declared permissions mirrored; 403 handled), R5 (emails only rendered in the table), R6 (text only, `<bdi>`, no HTML), R7 (no mutations, no extra filters), R8 (tests above), R9 (no destructive actions in this ticket), R10 (labelled tables, `th scope=col`, status as text, `role=status`/`role=alert`, labelled Select, tabs keyboard-reachable via Radix, wrap on narrow screens).

## Specialist input used
- api-platform-engineer: adopted all contract facts (permissions, fields, `total` counts assignments, `created_at` = grant date, `active` ≠ effective, no invitee email, bare UUIDs, newest-first invitations, unknown members order); adopted two tabs, per-tab permissions, pagination, no N+1, read-only scope, PII handling, status-as-text. Adopted the `status` filter (cheap: API param exists; meets the goal's "pending invitations"). Rejected adding `app`/`active` member filters (R7). Snapshot source: adopted "export from the clone", but as a fragment copy (Approach §0) rather than a full refresh, to avoid unrelated drift.
- frontend-developer: adopted two lazy tabs, `api/members.ts` query options and nested keys, registry entries (names `organizations.viewMembers` / `organizations.viewInvitations`), pager with `keepPreviousData`, state tests mirroring the entitlements tab, gating test and 403 isolation, wrap check for 4 triggers. Rejected "a Badge per role" grouping (rows are assignments — flat, per the API doc). Adopted a tiny shared pager only for the two new tabs (it would otherwise be duplicated twice in this diff); existing pagers untouched.

## Assumptions
Needs owner's decision (non-blocking; plan proceeds with the default shown):
- **A1 "Joined date" = grant date.** The API has no org-join date; the column is "Granted" (`created_at`, "When the assignment was first granted; kept when an expired assignment is re-granted in place"). A true join date needs an org-admin-api follow-up.
- **A2 Flat rows labelled as role assignments**, not grouped by person (grouping per page would break `total` and pagination).
- **A3 Read-only.** Revoke invitation (`DELETE …/invitations/{invitation_id}`, `admin:organizations:write`, 409 `invitation_accepted`), invite, and remove member are follow-up tickets (they need R9 confirmations).
- **A4 Invitations default to the "Pending" filter** (the goal says "pending invitations"); other statuses one click away.
- **A5 Inviter/acceptor** (`invited_by`, `accepted_by`) and `granted_by` are not shown — bare UUIDs; names need an org-admin-api follow-up.
- **A6** Page size 20 for both tabs (same as role holders and sessions).
- **A7** A 404 in a tab shows the message only; it does not invalidate the org detail query (read-only tab, consistent with the entitlements tab).

Follow-ups (not in this diff):
- Correct spec §5.3 "members per org arrive there [USR-06]" → USR-23, and the ticket's `Depends on` line (orchestrator/owner).
- Full `openapi.json` refresh to org-admin-api main (adds `admin:bug-reports:*`, `admin:usage:*`, deployer credentials, releases) with its registry update — separate ticket.
- admin-pan ticket: revoke invitation; invite member; remove member (ADR 0026 on the API side).
- org-admin-api: names/emails for `invited_by`/`accepted_by`/`granted_by`; documented members sort order; optional org-join date.
- Optional `app`/`active` filters on the Members tab.
- Extract one shared pager for users sessions, role holders, join requests and the org tabs.

## Blocking questions
None.

## Split proposal
None. Estimated ~450 changed lines excluding generated `openapi.json`/`schema.d.ts` (two small read-only tabs, one hooks file, fixtures, tests); no new route.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/organizations` → detail sheet › **Members** tab | Tab shown unless `admin:users:read` is denied (`organizations.viewMembers`); sheet itself `admin:organizations:read` | loading "Loading role assignments…" (`role=status`); empty "No one holds a role in this organization."; error "Couldn't load role assignments." + Retry (`role=alert`); 404 "This organization no longer exists."; 403 inline ForbiddenPanel; happy: table + pager | Previous/Next → new query (no mutation) | None |
| `/organizations` → detail sheet › **Invitations** tab | Tab shown unless `admin:organizations:read` is denied (`organizations.viewInvitations`) | loading "Loading invitations…"; empty "No pending invitations." / "No {status} invitations." / "No invitations."; error "Couldn't load invitations." + Retry; 404 as above; 403 inline ForbiddenPanel; happy: filter + table + pager | Status filter, Previous/Next → new query (no mutation) | None |

No destructive actions, so no confirmation text (R9 n/a).

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/organizations/{org_id}/members` | path `org_id`; query `limit=20`, `offset` (no `app`, no `active`) | `components['schemas']['Page_OrgMemberRead_']` (items `OrgMemberRead`: `assignment_id, user_id, email, display_name, user_status, app, role_id, role_key, role_name, granted_by, created_at, expires_at, active`) | 401 (client-wide), 403 ForbiddenPanel, 404 message, 422/5xx error + Retry | USR-23 (MERGED) |
| GET | `/api/v1/organizations/{org_id}/invitations` | path `org_id`; query `limit=20`, `offset`, `status?` (`pending`\|`accepted`\|`revoked`\|`expired`) | `components['schemas']['Page_OrgInvitationRead_']` (items `OrgInvitationRead`: `id, app, role_id, role_key, invited_by, created_at, expires_at, accepted_at, accepted_by, revoked_at, status`) | 401, 403, 404, other → error + Retry | USR-23 (MERGED) |
