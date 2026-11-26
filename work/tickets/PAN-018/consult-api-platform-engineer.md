## PAN-018 consult (api-platform-engineer, read-only)

### Findings

**1. Dependency and ticket drift**
- The ticket says "Depends on PAN-014; org-admin-api USR-06". The real dependency is **USR-23**, which is MERGED in org-admin-api `work/backlog.md` (P1). USR-06 only moved orgs to the Identity module. The ticket's Depends line needs updating.
- Spec §5.3 still says "members per org arrive there [USR-06]". It is stale. Flag it, but do not edit it.

**2. admin-pan generated types do NOT include these endpoints**
- `src/api/openapi.json` and `src/api/schema.d.ts` contain no `/api/v1/organizations/{org_id}/members` or `/invitations` paths. The only invitation entries are the end-user cookie-class `/api/v1/auth/invitations/accept` and `/api/v1/auth/orgs/{org_id}/invitations`, which are not for this UI.
- Regeneration: `pnpm api:types` runs `openapi-typescript src/api/openapi.json -o src/api/schema.d.ts`. So the committed `openapi.json` snapshot must be refreshed first from org-admin-api `/openapi.json` (R2: no hand-written types). Nothing in `package.json` fetches it, so check that the plan names the source and method (local `make dev`, or export from the clone).
- The snapshot refresh may pull in unrelated API drift. The planner should check the diff of `schema.d.ts` and keep the PR focused (R7).

**3. Exact API contract (org-admin-api `app/modules/organizations/router.py`, `rbac/schemas.py`, `invitations/schemas.py`, `tests/test_org_members_api.py`)**

*GET `/api/v1/organizations/{org_id}/members`*
- Permission: **`admin:users:read`**, not `organizations:read`. A token with only `admin:organizations:read` gets 403 with `details.required = "admin:users:read"`. `admin:*` passes.
- Query: `limit` (1..100), `offset` (≥0), `app` (app key pattern), `active` (bool; true = not expired, false = expired, omitted = all). Invalid values give 422.
- Response: `Page<OrgMemberRead>` with `items`, `total`, `limit`, `offset`. `Cache-Control: no-store` (rows carry emails).
- Errors: 401, 403, 404 `not_found`, 422.
- `OrgMemberRead` fields:
  - `assignment_id`
  - `user_id`
  - `email`
  - `display_name` (nullable)
  - `user_status` (disabled users are listed)
  - `app` (app key)
  - `role_id`
  - `role_key`
  - `role_name`
  - `granted_by` (nullable)
  - `created_at`
  - `expires_at` (nullable)
  - `active`
- **A row is a role assignment, not a person.** A user with two roles appears twice, and `total` counts assignments. The UI must label it as "role assignments" or group client-side. If it groups, it must not break pagination or the total.
- The "joined date" in the acceptance criteria maps to `created_at`, the grant date of that assignment. It is not an org-join date. `active` is not "effective in tokens", because it ignores user, org and app status. Do not show it as such.
- The default sort order is not documented in the router. ADR 0025 describes a different shape (`org_roles`, `joined_at`) that belongs to the **app-credential** endpoint, so do not use it for admin-pan.

*GET `/api/v1/organizations/{org_id}/invitations`*
- Permission: **`admin:organizations:read`**.
- Query: `limit`, `offset`, `status` (enum `pending | accepted | revoked | expired`).
- Response: `Page<OrgInvitationRead>`, newest first (`created_at desc, id`), `Cache-Control: no-store`.
- Errors: 401, 403, 404.
- `OrgInvitationRead` fields:
  - `id`
  - `app` (key)
  - `role_id`
  - `role_key`
  - `invited_by` (nullable uuid)
  - `created_at`
  - `expires_at`
  - `accepted_at` (nullable)
  - `accepted_by` (nullable)
  - `revoked_at` (nullable)
  - `status`
- There is **no invitee email and no token**, so the list cannot show who was invited. Identify rows by role, app, inviter id and dates. The table must not promise an email column.
- `status` is computed on the DB clock, with precedence accepted > revoked > expired > pending. A "pending" invitation can still be refused on accept if the inviter lost the right to invite.
- `invited_by` and `accepted_by` are bare UUIDs with no name or email. Rendering them would need a user lookup. Do not add N+1 lookups. Show a short or copyable id, or omit them.

*DELETE `/api/v1/organizations/{org_id}/invitations/{invitation_id}`*
- 204, permission `admin:organizations:write`. It is idempotent. 404 for an unknown org or invitation. 409 `conflict` with `reason: invitation_accepted` if already accepted.

**4. How PAN-014 detail fetches data**
- `src/features/organizations/api/queries.ts` has the `organizationsKeys` factory (`all/lists/detail/list`). It uses `queryOptions` helpers that take an injectable `api: ApiClient = getApi()`. It wraps calls with `unwrap(await api.GET(path, {params, signal}))`, and uses `toPageParams` from `@/api`.
- The detail sheet is `components/organization-detail-sheet.tsx`. It is a Sheet with Tabs: Overview, plus Entitlements gated by `useActionPermission('entitlements.view') !== 'denied'`. It handles forbidden, error (404 vs retry) and loaded states. Entitlements has its own tab component and a test.
- Permissions come from `src/lib/permissions/registry.ts` (`perm('admin:users:read', 'GET ...')`, used with `useActionPermission` and `<Can>`). The registry has `users.view` (`admin:users:read`) and `organizations.view`. It has no actions for org members or invitations yet.
- Mutation hooks invalidate `organizationsKeys.all` and use `meta.handlesOwnErrors`.

### Recommendations

1. **Types (R2, AC "api")**: refresh `src/api/openapi.json` from org-admin-api, run `pnpm api:types`, and build the hooks from `paths[...]`/`components['schemas']['OrgMemberRead' | 'OrgInvitationRead']`. Record the snapshot source in the impl log.
2. **Add two tabs, "Members" and "Invitations"**, to the detail sheet in the same pattern as Entitlements. Each tab has its own query: `organizationsKeys.members(id, params)` and `.invitations(id, params)`, nested under `organizationsKeys.all` so existing invalidation works. The tabs lazy-load (fetch only when active) so the sheet does not fire three requests on open.
3. **Permissions per tab (R4)**: register two new actions in the registry. Members needs `admin:users:read`. Invitations needs `admin:organizations:read`. Hide a tab when denied, and still handle a 403 from the API (ForbiddenPanel inline). Members and invitations are separate permissions, so a staff user may see one tab and not the other. Test that case.
4. **Pagination**: use `limit`/`offset` with the existing Page helpers (limit ≤ 100). Keep it simple, with Prev/Next or the existing data-table pagination. Do not fetch all pages.
5. **Member columns**: user (display_name or email; display_name is nullable), `user_status` badge (disabled users appear), app + `role_name` (and `role_key`), `created_at` as granted date, expires/active. Labelled "Granted", and the tab titled "role assignments" or similar. Optional `active` and `app` filters are nice-to-have. Keep them out unless the planner decides otherwise (R7).
6. **Invitation columns**: status badge, app, `role_key`, created, expires, and accepted/revoked dates when set. Status mapping: pending, accepted, revoked, expired. Handle unknown enum values gracefully. Add a `status` filter only if cheap. Make clear in the UI that invitee emails are intentionally not shown.
7. **PII and R5**: member emails are shown to staff only. Do not put them in URLs, logs, query keys beyond the org id, or toasts.
8. **States tested (R8)**: for each tab test loading, empty, error with retry, 403, 404 (org gone), and populated (pagination, multi-row-per-user, disabled user, expired assignment). Use API mocked at the network layer. Include a test for a staff user with only one of the two permissions.
9. **a11y (R10)**: semantic tables with headers, status as text and not colour only, tabs keyboard accessible (already by Radix), loading/error announced.
10. Update the ticket's Depends line to USR-23, and add the a11y-auditor and appsec triggers per CLAUDE.md. appsec is justified because the diff touches the API client and a PII-bearing list.

### Scope question (flag, do not add)
- **Revoking invitations**: the ticket only says list members and invitations. The API supports DELETE (`admin:organizations:write`, idempotent, 409 if accepted). Adding it would bring in R9 (confirmation naming the target, no optimistic update, show API error, invalidate queries) and a write permission check. Because invitees have no email, "naming the target" would have to use role, app and created date. **Recommendation: out of scope for PAN-018 and a follow-up ticket**, unless the owner says otherwise.
- Org member removal (`ADR 0026`, `test_org_member_remove.py`) also exists on the API side. It is likewise not in this ticket.

### Risks
- Wrong permission on the Members tab (`organizations:read` instead of `users:read`) hides the tab from valid staff or shows a 403 to others.
- Labelling assignment rows as "members" and showing `total` as a member count is misleading, because the count is of assignments.
- "Joined date" semantics: `created_at` is the grant date, which can stay the same when an expired grant is re-granted in place.
- The openapi snapshot refresh may pull in unrelated schema changes and break typecheck elsewhere.
- `invited_by` and `accepted_by` are raw UUIDs. If the owner wants names, that needs an API follow-up (or N+1 lookups, which I advise against).
- Default sort for members is unspecified in the router and docs (possibly `user_id` order, as ADR 0025 says for the app endpoint). Do not rely on a particular order in the UI or tests.

### Open questions
1. Is invitation revoke in scope, or a follow-up? (Recommended follow-up.)
2. Should members be grouped by user (client-side) or shown as flat assignment rows? (Recommended flat, labelled as role assignments.)
3. Does the owner accept the "granted date" meaning for "joined date"? If a true join date is needed, that is an org-admin-api follow-up.
4. Are inviter and acceptor ids good enough as bare ids, or does the owner want an API follow-up to return names or emails?
5. Which `openapi.json` source should be used for the refresh (the local clone at `/home/user/mmlabs-online/org-admin-api` vs. the live `/openapi.json`)?
6. Should the members tab offer the `app` and `active` filters, and the invitations tab the `status` filter, in this ticket?

Relevant files:
- /home/user/admin-pan/work/tickets/PAN-018/ticket.md
- /home/user/admin-pan/src/features/organizations/api/queries.ts
- /home/user/admin-pan/src/features/organizations/components/organization-detail-sheet.tsx
- /home/user/admin-pan/src/lib/permissions/registry.ts
- /home/user/admin-pan/src/api/openapi.json
- /home/user/admin-pan/src/api/schema.d.ts
- /home/user/mmlabs-online/org-admin-api/app/modules/organizations/router.py
- /home/user/mmlabs-online/org-admin-api/app/modules/rbac/schemas.py
- /home/user/mmlabs-online/org-admin-api/app/modules/invitations/schemas.py
- /home/user/mmlabs-online/org-admin-api/tests/test_org_members_api.py
- /home/user/mmlabs-online/org-admin-api/tests/test_org_invitations_admin_api.py
