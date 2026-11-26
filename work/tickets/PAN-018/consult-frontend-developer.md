PAN-018 consult (frontend-developer, read-only)

## Findings
1. **The API types are missing.** `src/api/openapi.json` and `src/api/schema.d.ts` have no `GET /api/v1/organizations/{org_id}/members` or `/invitations`. Only `/api/v1/auth/orgs/{org_id}/invitations` (POST) and `/auth/invitations/accept` exist. R2 forbids hand-written types, so the OpenAPI snapshot has to be regenerated from org-admin-api (USR-23) before any hook compiles.
2. **The ticket's dependency line is stale.** It says "org-admin-api USR-06", but you say the endpoints are USR-23. Spec §5.3 also says members arrive with USR-06. Update the ticket and spec reference to USR-23 (spec wins on scope, so flag it). Check USR-23 is DONE and merged in org-admin-api before IMPLEMENT.
3. **The detail view is `OrganizationDetailSheet`.** It is `src/features/organizations/components/organization-detail-sheet.tsx`: a Sheet with Tabs, `Overview` plus `Entitlements`.
   - The Entitlements tab is gated by `useActionPermission('entitlements.view') !== 'denied'`.
   - The whole sheet's 403, error and 404 states come from `queryView(q)`.
4. **The entitlements tab is the pattern to copy.** It is `organization-entitlements-tab.tsx`.
   - It mounts only while its tab is selected, so nothing is fetched early.
   - It uses `useQuery(orgEntitlementsQueryOptions(org.id, params, api))` with `api` from `useOrganizations()`.
   - It renders by `view.status`: `forbidden` gives inline `ForbiddenPanel`, `pending` gives `<p role=status>Loading …</p>`, `error` gives `role=alert` plus a Retry button.
   - The success table has `aria-label="… of {org.name}"`, `TableHead scope=col`, a dated `<time>` cell using `formatDate` from `features/apps/data/data`, and an empty-row message.
   - A "Showing N of total" status line appears when `total > items.length`.
5. **The query-key and options pattern is in `api/entitlements.ts`.**
   - Keys are nested under `organizationsKeys.detail(orgId)`, so org mutations and 404/409 invalidations also refresh the nested lists.
   - Options are `queryOptions({queryKey, queryFn: unwrap(await api.GET(..., {params:{path,query}, signal}))})` with `api: ApiClient = getApi()` injected, plus `// eslint-disable-next-line @tanstack/query/exhaustive-deps`.
6. **The permission registry has no entry for these endpoints.** `src/lib/permissions/registry.ts` `ACTIONS` maps names to `perm('admin:x:y', 'METHOD /path')`. There is no `organizations.viewMembers` or `organizations.viewInvitations`.
7. **Test infrastructure exists.**
   - `test-fixtures.tsx` has `renderOrgSheet`, `orgsServer(handler)` and `entitlementCalls`. `test-data.ts` has `ORGS`, `ENTITLEMENTS` and `entitlementsPage`.
   - `@/test-utils/api` has `fakeApi`, `json` and `apiError`, which mock at the network layer.
   - `organization-entitlements-tab.test.tsx` shows the state tests.

## Recommendations
1. **Types (AC all, R2).** Regenerate `openapi.json` and `schema.d.ts` with the repo's existing script. Check `package.json` for the script name; this is part of the ticket and nothing else should change in the diff. Derive row types from `components['schemas'][...]`. Add a small `data/members-schema.ts` only for UI helpers (labels, sort), as `entitlement-schema.ts` does.
2. **Placement.** Add two more tabs to `OrganizationDetailSheet`, or one "Members" tab with two sections ("Members" and "Pending invitations").
   - I recommend two separate tabs, `Members` and `Invitations`. Each is mounted only when selected, so it fetches lazily. Each gets its own gating, loading, error and 403 states, and a 403 on one never hides the other.
   - Two tab components: `components/organization-members-tab.tsx` and `components/organization-invitations-tab.tsx`. Each is a copy of the entitlements-tab skeleton and read-only: no `Can`, dialogs or focus refs.
   - Update the `SheetDescription` copy ("Organization details, members and entitlements").
   - Keep the `tab` state as is. Check that the sheet width (`sm:max-w-2xl`) fits the `TabsList` with 4 triggers.
3. **Permissions (R4, PAN-011b).** Add to `ACTIONS`:
   - `'organizations.viewMembers': perm('admin:users:read', 'GET /api/v1/organizations/{org_id}/members')`
   - `'organizations.viewInvitations': perm('admin:organizations:read', 'GET /api/v1/organizations/{org_id}/invitations')`

   Use the exact scopes from the API's route declarations (you gave the two above; confirm which endpoint takes which). Gate each trigger with `useActionPermission(...) !== 'denied'` as for entitlements. Still handle 403 in the tab with `ForbiddenPanel`. Check whether a registry test (a snapshot or "every action has a matching endpoint" check) needs updating.
4. **Query hooks** in a new `features/organizations/api/members.ts`:
   - `orgMembersQueryOptions(orgId, {limit, offset}, api)` and `orgInvitationsQueryOptions(...)`.
   - Keys: `[...organizationsKeys.detail(orgId), 'members', {limit, offset}]` and `'invitations'`, with `membersKeys.all(orgId)` and `invitationsKeys.all(orgId)` helpers.
   - Export page-size constants.
5. **Pagination.** `Page<T>` has `limit` ≤ 100 and `offset`, and member counts are unbounded, unlike entitlements.
   - Do not copy the "no pager" shortcut. Add prev/next controls (or reuse `toPageParams` from `@/api`) with a pager state in the tab, `placeholderData: keepPreviousData`, and a `role=status` "Showing a–b of total" line.
   - Look first for a shared simple-pager component. `user-sessions-tab.tsx` and `components/data-table/` may have one to reuse. Invitations can start at limit 100 with the "Showing N of total" note if the owner accepts it; pending invitations are few.
6. **Columns** (names come from the schema, not guessed).
   - Members: user (display name, plus email only if the API returns it and policy allows; R5 means no emails in logs or URLs), roles (a `Badge` per role, or a list), and joined date as `<time>`. Join and role fields come from the API, so there is no client-side derivation (R1).
   - Invitations: invitee, role, status (Badge with text, not colour only), invited and expires dates. Show the status as the API gives it. "Pending" is the main case, but show every status the API returns; do not filter client-side unless the endpoint offers a `status` param. Check the schema.
   - Reuse `Table`, `Badge`, `formatDate` and `queryView`. Consider extracting a tiny `NestedListState` only if both new tabs duplicate more than about 30 lines. Otherwise keep to the ticket (R7).
7. **Mutations.** None. No invite, remove or role-change actions (not in the ticket; R7). Record "invite / remove member / revoke invitation" as a follow-up. `POST /auth/orgs/{org_id}/invitations` exists in the API, so it is feasible later.
8. **Test cases (R8, network-layer mocks via `fakeApi`/`orgsServer`).**
   - Add `members` and `invitations` page builders and fixtures to `test-data.ts`. Extend `orgsServer` or the local `server()` wrapper to route `/members` and `/invitations`.
   - For each tab, mirroring the entitlements test:
     - Not fetched until the tab is selected, and the request is `?limit=…&offset=0` with the right path.
     - Loading text, empty text, error plus Retry (recovers to rows), and 403 (inline `ForbiddenPanel`, alert text "You don't have permission to do this").
     - Rows: labelled table, `th scope=col`, roles shown, joined date or status text, and a status Badge for each status value.
     - Pagination: the Next button sends `offset=N`, a disabled state at the end, and the "Showing" line.
     - Permission gating: the tab trigger is absent when the permission is denied (follow the existing `entitlements.view` test in `organization-detail-sheet.test.tsx`) and the other tab still works.
     - A 403 on one tab does not affect the other.
   - Unit test the new registry entries, plus the query keys (as `queries.test.ts` and `entitlements.test.ts` do).
   - If an `a11y` pass runs: the tabs are keyboard reachable, the tables are labelled, and loading and errors are announced (`role=status` and `role=alert`).

## Risks
- The USR-23 response shapes are unknown here, so column design depends on the regenerated schema. For example, does a member have `user_id` only, or a name or email? Does a role carry `app_key`, `scope` or `org_id`?
- If the members response only has `user_id`, a UI that needs a name requires an N+1 lookup to `/users/{id}`. Do not do that. Record a follow-up for the API (R1).
- The sheet may get cramped with 4 tabs on small screens (WCAG reflow). Check `TabsList` wrapping or scrolling.
- Using `admin:users:read` for members while `admin:organizations:read` opens the sheet means a user could see the org without seeing members. This is covered by the 403/denied states above.
- If the OpenAPI regeneration brings unrelated schema drift, the diff may break unrelated types. Keep the regenerated-file change reviewable and note it in the impl-log.

## Open questions
1. Is org-admin-api USR-23 DONE and merged, so that `openapi.json` can be regenerated? (The ticket says USR-06; confirm and update the ticket.)
2. Exact permission for each endpoint: members `admin:users:read` and invitations `admin:organizations:read`, as in your note. Confirm they are not `admin:*`.
3. Two tabs or one tab with two sections? I recommend two.
4. Do the responses include user email or display name? What invitation statuses exist (pending, accepted, expired, revoked)? Does the list endpoint filter by status? Should "pending" be the default view?
5. Is a pager acceptable for members (unbounded), or is the "first 100 plus total" note enough for v1? I recommend a pager for members.

Reference files:
- /home/user/admin-pan/src/features/organizations/components/organization-detail-sheet.tsx
- /home/user/admin-pan/src/features/organizations/components/organization-entitlements-tab.tsx
- /home/user/admin-pan/src/features/organizations/api/entitlements.ts
- /home/user/admin-pan/src/features/organizations/api/queries.ts
- /home/user/admin-pan/src/lib/permissions/registry.ts
- /home/user/admin-pan/src/features/organizations/components/test-fixtures.tsx
- /home/user/admin-pan/src/features/organizations/components/test-data.ts
- /home/user/admin-pan/src/features/organizations/components/organization-entitlements-tab.test.tsx
