PAN-028 consult (frontend-developer, read-only). No files changed. Not verified: the snapshot's `JoinRequestRead` schema and 409 `details`, the existing fake-fetch test-utils, the e2e fake's join_policy handling, and the `useMutationOptions` nuance (all under Risks and Open questions).

## Findings

API (org-admin-api b79cf77, `app/modules/join_requests/`):
- `GET /apps/{key}/join-requests` takes `status` (pending|approved|rejected, default **pending**), `limit` (<=100) and `offset`. It needs `admin:users:read`. The response is `Page[JoinRequestRead]` with `Cache-Control: no-store` (router.py:24-40). The snapshot has the same params at openapi.json:3905-3955.
- `JoinRequestRead` fields (schemas.py:10-21): `id`, `app_key`, `user_id`, `email`, `display_name` (nullable, "untrusted user text: render as text only"), `email_verified`, `user_status`, `status`, `created_at`, `decided_at`, `decided_by`.
- Approve and reject are `POST .../{request_id}/approve` and `.../reject`. They need `admin:roles:assign`, take no body, and return the updated `JoinRequestRead` (router.py:43-80). **There is no reason field on reject**, so the UI should not add one (R1).
- `list` returns 404 for the `admin` app or an unknown key (service.py:63-70). The `admin` app has no join requests.
- Approve does not check existing membership before the user checks. If the user is already a member, the request is decided without a new grant (service.py:112). Approve 409 `details[0].reason` values (service.py:98-109):
  - `not_pending`
  - `app_disabled`
  - `join_policy_changed`
  - `user_disabled`
  - `email_unverified`
  - `default_role_unusable`
- Reject can return only 404 or 409 `not_pending` (service.py:133-137).
- Approval grants the app's current default role (router.py:59). The confirm text should say so.
- Rows can be non-pending only through the status filter. The API has no search and no sort.

admin-pan:
- The apps detail sheet has Overview, Permissions and Credentials tabs (app-detail-sheet.tsx:85-99). Each tab mounts only when selected and fetches its own data.
- The pattern to copy is `app-credentials-tab.tsx` plus `app-credential-revoke-dialog.tsx`:
  - queryView states (forbidden, pending, error)
  - offset paging
  - `Can` per action
  - row-button refs with `focusAfter` (focus goes back to the row on cancel and to the heading on success)
  - the `inFlight` ref guard (revoke dialog:27-41)
  - ConfirmDialog with an `error` slot
  - a `credentialRevokeError`-style mapper in `data/errors.ts:257`
- `queries.ts` has the key factory `appsKeys` (lines 34-53) and `useMutationOptions(scope)` (140-157), which refetches on 404 and 409.
- The permission registry (`lib/permissions/registry.ts:115-160`) has no join-request actions. Add:
  - `'apps.viewJoinRequests': perm('admin:users:read', 'GET /api/v1/apps/{key}/join-requests')`
  - `'apps.decideJoinRequest': perm('admin:roles:assign', 'POST .../approve', 'POST .../reject')`
- The `JoinPolicy` enum is open|approval|closed (`data/schema.ts:12`, `app-schema.ts:48`). Labels are in `data.ts:24`.
- `src/api/schema.d.ts:96-133` and openapi.json already include the three operations at c41ef57. `stats/dashboard` is not in the repo yet.
- The e2e fake (`e2e/support/fake-api.ts:256-290`) builds per-app routes in a loop (`GET .../credentials` and so on). It has no join-request routes.

## Recommendations

1. **Placement (AC1).** Add a fourth "Join requests" tab in `AppDetailSheet` (app-detail-sheet.tsx:85-99, mounted in the `TabsContent` block). Do not add a pending-count hint on the tab trigger.
   - Show the tab for every non-admin app, but use `app.join_policy`. Policy `approval` gets the full tab. Other policies get a note, "This app's join policy is X; new requests are not created. Older requests are shown below", plus the list. Reason: after a policy flip from approval to open or closed, old pending rows still exist, and approve then 409s `join_policy_changed`. Staff need to see and reject them.
   - Do not hide the tab for `open` or `closed` apps (a pure `approval`-only tab would strand those rows). A softer option is to hide the tab for `admin` only, and for open/closed show it only if the first fetch returns total > 0. That needs a fetch on open and is heavier, so prefer always showing it with the note. Keep the owner's "build what the API offers" scope.
   - For the `admin` app, omit the tab (the API returns 404).
   - Update the sheet description at app-detail-sheet.tsx:59 ("App settings, permissions, join requests and credentials").
2. **Files:**
   - `features/apps/components/app-join-requests-tab.tsx`
   - `features/apps/components/app-join-request-decision-dialog.tsx`, one dialog parameterised by `decision: 'approve' | 'reject'`. Alternatively two thin wrappers; one is enough.
   - Extend `api/queries.ts`:
     - `JOIN_REQUESTS_PAGE_SIZE = 20`
     - `joinRequestsKeys` under `appsKeys.detail(key)`, as `joinRequestsAll(key)` and `joinRequests(key, {status, limit, offset})`
     - `appJoinRequestsQueryOptions` (placeholderData keepPreviousData)
     - `useDecideJoinRequestMutation(appKey, decision)` using `useMutationOptions(joinRequestsAll(appKey))`
   - Extend `data/errors.ts` with `joinRequestDecisionError`.
   - Types come from `components['schemas']['JoinRequestRead']` (R2). Do not hand-write them.
3. **Columns and filter (AC1).**
   - Status filter: a native or shadcn Select or segmented control (Pending | Approved | Rejected), default pending, with a label. Changing it resets offset to 0. Keep it in component state, as the credentials tab does. Do not put it in the URL, because the sheet has no URL state today.
   - Columns:
     - Requester: `display_name` as text, with `email` in a muted line. Show a "Not verified" badge when `email_verified` is false, and a "Disabled" badge when `user_status !== 'active'`. These predict approve 409s. Do not block the button on them; the API is authoritative (R4).
     - Requested (`created_at`, `<time>`)
     - Status badge
     - Decided (`decided_at`, or "—"; `decided_by` is a UUID with no name resolution, so skip it or show it in a title)
     - Actions (sr-only header): Approve and Reject only on pending rows.
   - Use `Table aria-label="Join requests of {key}"` with `scope='col'` headers.
   - Paginate with Previous/Next and the "Showing x–y of total" status line, as in the credentials tab.
4. **Confirm dialogs (AC2, R9).**
   - ConfirmDialog, non-optimistic, with the `inFlight` guard.
   - Approve is not destructive-styled, but it is access-granting, so it must be confirmed. Text: "Approve {display_name || email} to join {app.name} ({app.key})? They will be granted the app's default role."
   - Reject: destructive variant, "Reject join request from X for {app.name}? They are not notified through this UI" (do not promise notification, because the API does not say). Reject is a permanent decision.
   - Naming the requester: put the email in the dialog body as text, not in a URL, a query key or a log. The only identifiers in URL and keys are `app.key` and the `request_id` UUID. Rows already come back with email (the API sets no-store), so showing it is fine. Keep the email out of the toast: use "Join request approved." or the display name only. Never put an email in `console` or `aria-label`s that would leak into logs. Per R5 (full emails not in logs/URLs), `aria-label` is fine for screen readers; the concern is telemetry. Do a `mask` only if the owner wants it.
   - After success: toast, `onDone('success')`, and invalidate `joinRequestsAll(key)`. Optionally also invalidate the roles-assignment queries of users if they exist (see Open questions).
   - Focus: on cancel, return to that row's button (ref Map by row id). On success the row leaves the pending list, so focus goes to the heading (`tabIndex={-1}`), as in the credentials tab.
5. **Error mapping (AC3).**
   - 403: `ForbiddenPanel variant='inline'` inside the dialog.
   - 404: "This request no longer exists." (the list refetches via `useMutationOptions`).
   - 409: map `details[0].reason` to copy:
     - `not_pending`: "Someone already decided this request."
     - `app_disabled`: "Enable the app first."
     - `join_policy_changed`: "This app no longer requires approval. Reject the request or change the policy."
     - `user_disabled`: "This user is disabled."
     - `email_unverified`: "This user hasn't verified their email."
     - `default_role_unusable`: "The app's default role is missing or unusable. Fix it in the app settings."
     - Unknown reason falls back to the API message.
   - `isUnknownOutcome` (network or 5xx): "We couldn't confirm the decision. Check the list."
   - A reject 409 can only be `not_pending`.
6. **Pending-count hint.** Skip the trigger badge (it would need an eager fetch on open and an extra `limit=1` call per sheet). If the owner wants it, use `total` from the pending query inside the tab only. A cheap alternative that needs no extra request: show "{total} pending" in the tab's heading, after the first fetch. Leave a dashboard or app-list pending count to a follow-up (needs an org-admin-api endpoint; R1).
7. **Empty and 403 states.**
   - Empty text depends on the filter ("No pending join requests." / "No approved requests." and so on).
   - 403 on the list: `ForbiddenPanel` inline, as in the credentials tab.
   - Per-action `Can` with `disable`: users with `admin:users:read` but not `admin:roles:assign` see disabled buttons plus a reason (via `Can`'s `describedBy`). The tab itself is gated by `apps.viewJoinRequests`. Gating is a mirror only; a 403 from the API is still handled.
8. **Regenerate the OpenAPI snapshot? No, not in this ticket.** The snapshot at c41ef57 already has all three join-request operations. Regenerating to b79cf77 pulls in the ADM-015 stats endpoint, which expands `schema.d.ts` and the diff with no use in PAN-028 (R7). Do it in the ticket that consumes stats (dashboard). If the owner prefers, verify with a diff that the join-request portion is identical between c41ef57 and b79cf77, and note it in the plan. Only regenerate if that diff shows a join-request change.
9. **Tests (R8, ADR 0005).**
   - Use `fakeApi` and `json`/`apiError` from `src/test-utils/api.ts` and `WithPermissions` from `test-utils/permissions.tsx`, with a `test-data.ts` fixture of join requests (pending, approved, rejected; verified and unverified).
   - `app-join-requests-tab.test.tsx`:
     - rows render (name, email, badges, `<time>`)
     - the status filter sends `?status=approved` and `offset=0`
     - paging sends `offset=20`
     - loading, empty (per filter), error with Retry, 403 inline
     - only pending rows have action buttons
     - Approve and Reject buttons disabled without `admin:roles:assign`
     - `admin` app shows no tab
     - the policy note for open and closed apps
   - `app-join-request-decision-dialog.test.tsx`:
     - confirm names the requester and app
     - cancel sends nothing and focus returns to the row button
     - confirm sends exactly one POST, even on double-click (the `inFlight` guard)
     - buttons `aria-disabled` while pending
     - Escape and outside click ignored while pending
     - the list is refetched after success and focus goes to the heading
     - no optimistic change (the row stays until the refetch)
     - 403, 404, and each 409 reason mapped
     - the request URL has only the UUID (no email in URL or query key)
   - `errors.test.ts` for `joinRequestDecisionError`.
   - Add `join-requests` cases to `app-detail-sheet.test.tsx` (tab present for non-admin, absent for admin).
   - e2e (`e2e/support/fake-api.ts`): inside the `for (const a of APPS)` loop (around line 279), add `GET /api/v1/apps/${a.key}/join-requests` with status filter and `page()`, and `POST .../approve` and `.../reject` routes that mutate an in-memory request. Seed 2 pending rows for an approval app (stoktok, or whichever app has `join_policy: 'approval'`). A minimal e2e: open the sheet, switch to the Join requests tab, approve one, and see it leave the pending list.

## Risks

- **Stale policy.** `app.join_policy` can change while the sheet is open. The tab uses the refetched `appQueryOptions` data, and approve 409 `join_policy_changed` is still mapped. A policy flip makes `useMutationOptions` refetch only the join-requests scope on 409. Also invalidate `appsKeys.detail(key)` on `join_policy_changed` and `app_disabled`, so the Overview tab and note update.
- **Race with another staff member.** Pending rows decided elsewhere give 409 `not_pending`. The list refetches via `onError`, so the row disappears; the dialog must show the message and stay closable.
- **Unverified or disabled requesters.** These produce approve 409s. The badges mitigate this but cannot replace the API check.
- **PII.** Rows carry full emails (the API sends no-store). The UI must not cache emails in persistent storage, put them in query keys, or log them. Check that the shared query cache and any persister never write join-request data to storage (R3, R5). A query key with `status/limit/offset` is fine.
- **Untrusted text.** `display_name` is user-supplied: render it as text only, truncate long values with CSS (`truncate`, `title`), and never use it in `href` or HTML (R6).
- **Approve side effect.** Approval grants a role. Staff who open the roles view for that user later should see it. Invalidate `['users', ...]` or role-assignment queries only if those exist in the repo (not checked). Mention it in the plan.
- **Page clamp.** After deciding the last row on the last page, the pending list can come back empty at offset > 0. Handle it like `AppsTable` does ("clamps to page 1 when the page comes back empty"): fall back to the previous page.
- **Snapshot drift.** The snapshot is two commits behind. I did not re-verify the `JoinRequestRead` schema and the 409 `details` shape in the snapshot's schema.d.ts. Confirm before coding that `Page_JoinRequestRead_` matches schemas.py.

## Open questions

1. Tab visibility for non-approval apps: always show with a policy note (my recommendation), or only for `approval` apps?
2. Should the pending count appear on the tab trigger, which needs an eager fetch when the sheet opens? I recommend no.
3. Does the owner want email shown in the confirm, or only `display_name` with an email fallback? I assumed show both as text.
4. A user or role-assignment view in this repo may need cache invalidation after approve (a role gets granted). I did not check which queries exist.
5. Reject has no reason in the API. If staff need one, record a follow-up for org-admin-api (R1), not a UI-only field.
6. Is `decided_by` (a bare UUID) worth showing? There is no staff-name lookup in this repo yet.
7. Confirm how the e2e fake chooses join_policy per app (I read only the credentials portion, `e2e/support/fake-api.ts:255-304`); it must have at least one `approval` app with seeded pending requests.

Key files:
- /home/user/admin-pan/src/features/apps/components/app-detail-sheet.tsx
- /home/user/admin-pan/src/features/apps/components/app-credentials-tab.tsx
- /home/user/admin-pan/src/features/apps/components/app-credential-revoke-dialog.tsx
- /home/user/admin-pan/src/features/apps/api/queries.ts
- /home/user/admin-pan/src/features/apps/data/errors.ts
- /home/user/admin-pan/src/lib/permissions/registry.ts
- /home/user/admin-pan/e2e/support/fake-api.ts
- /home/user/admin-pan/src/api/openapi.json
- /home/user/org-admin-api/app/modules/join_requests/router.py
- /home/user/org-admin-api/app/modules/join_requests/service.py
- /home/user/org-admin-api/app/modules/join_requests/schemas.py
