PAN-020 consult (api-platform-engineer). Read-only; nothing was edited.

**Limit of this report:** I had no shell, so I could not run `git diff 26b27be origin/main -- app/` or `git log`. I also found no committed openapi in org-admin-api to diff against. Section 1 is therefore reconstructed from the ticket impl-logs and plans, then checked against the current source and against admin-pan's snapshot. Before relying on it, regenerate and diff, and treat any extra delta as authoritative.

## Findings

### 1. OpenAPI differences expected from regenerating to c7b86dd

The snapshot at 26b27be already contains ADM-015 and ADM-016. It has `GET /api/v1/stats/dashboard` (`openapi.json:9141-9215`) and `member_count` on the app schemas (`openapi.json:266,314`). Nothing for stats or `member_count` changes, and the stats schemas below match the current source.

Changes the regeneration will bring:

1. **USR-16 (additive, new paths and schemas).**
   - New `GET /api/v1/apps/{key}/role-definitions` (`app/modules/rbac/router.py:186-196`). It returns `Page[RoleDefinitionRead]`, needs `admin:apps:read` and has no rate limit.
   - New `GET /api/v1/apps/{key}/role-definitions/{role_id}` (`router.py:199-207`), same permission.
   - New schemas `RoleDefinitionRead` and its `Page_…` wrapper (`app/modules/rbac/schemas.py:225-246`). Fields: `id, app, key, name, is_system, is_default, privileged, permissions[] (sorted keys), created_at, updated_at`.
   - These routes list roles of the `admin` app and of disabled apps. An unknown app key gives 404. There is no `assignment_count`.
   - The existing public `GET /apps/{key}/roles` is unchanged.
   - Source: `work/tickets/USR-16/plan.md:17-31`.
2. **USR-15 (additive, enum widened).**
   - The `status` query parameter on `GET /api/v1/apps/{key}/join-requests` gains `cancelled`. The Literal is at `app/modules/join_requests/schemas.py:7`. In the snapshot the enum is `pending/approved/rejected` (`openapi.json:4270-4274`).
   - `POST /auth/apps/{key}/join` description now adds `403 join_queue_full` (`app/modules/auth/router.py:272-273`). This is the pending-queue cap, not a schema change.
   - The `status` field of the join-request read model is a plain `str` in `schemas.py:17-18`, so I expect no enum change there.
   - Behaviour change: a join request can now end as `cancelled`, because disabling a user cancels their pending requests. The migration `20261118_c7a3e91f5d28` has no OpenAPI effect.
3. **ADM-019 (description only).** The 409 text on `PATCH /api/v1/apps/{key}` changes from "Admin app invariant or origin already taken" (`openapi.json:3853`) to "…or org_mode in use" (`router.py:87`). The new behaviour is 409 `conflict` with `details=[{"field":"org_mode","reason":"org_mode_in_use"}]` (`rbac/service.py:495-498`). It fires on `required`→`none` while entitlements or org-scoped assignments exist. The 422 `org_mode_required` still wins over it. The entitlement grant now refuses the `admin` app with 409 `admin_app` before locking (`entitlements/service.py:64-65`). That reason already existed, so there is no shape change.
4. **USR-14 (descriptions only).** The three sessions routes get new description text from `_REVOKE_LIMITS` (`app/modules/users/router.py:65-80`). Revoking a session now ends that user's `aud=admin` tokens on their next admin request, via the new `sid` claim. The snapshot still carries the old "…including admin…" wording (`openapi.json:9992,10108,10256`).
   - Runtime effect to test: an admin token is now rejected with the normal 401 after logout, password reset or staff session revoke. Expect an unexplained 401 mid-session to be possible.
   - `sid` is a JWT claim, not an OpenAPI item. admin-pan's token verifier must tolerate unknown claims (`USR-14/impl-log.md:30`).
5. **ADM-018.** Only changes the `ent` claim on non-admin tokens (`tokens/service.py:117-119`). No routes and no OpenAPI change.
6. **BUG-001.** A test-only flake fix, with no API effect.

My count of changes in the generated file: 2 new paths, 2 new schemas, 1 enum value, and about 6 description edits (apps PATCH, join POST, 3 sessions routes, and possibly the join-requests list). Types in `src/api/` regenerate additively, so nothing existing breaks.

### 2. `GET /api/v1/stats/dashboard`: contract

Shape, from `app/modules/stats/schemas.py:6-67`:
```
DashboardStats {
  generated_at: datetime            // DB clock now()
  users:         {total, by_status:{active,disabled}, unverified}
  organizations: {total, by_status:{active,suspended}}
  apps:          {total, by_status:{active,disabled}}
  sign_ins_24h:  {window_start, window_end, succeeded, failed}
  sign_ups:      {time_zone:"Asia/Ho_Chi_Minh", by_month:[{month:"YYYY-MM", count}]}
  members_per_app: [{app_key, name, member_count}]
}
```

Semantics:
- **Users:** `total` is the sum of `by_status` (`service.py:59`). `unverified` counts every user with `email_verified_at IS NULL` and does not filter on status. A disabled, unverified user is counted (`repository.py:33-42`, `service.py:61`). The keys `active` and `disabled` are always present, zero-filled.
- **Organizations and apps:** `total` is derived server-side (`router.py:56-60`). Both `by_status` objects are zero-filled.
- **Sign-ins:** this is a rolling 24 h window. `window_end` equals `generated_at` and `window_start` is `now - 24 h` (`service.py:53,64`).
  - They are audit event counts of `auth.login_succeeded` and `auth.login_failed`, not distinct users.
  - `failed` includes unknown emails (anonymous actor).
  - `failed` excludes requests refused with 429 or by Turnstile, because nothing is written for those. Admin-app sign-ins are included, and the document is not split per app.
  - There is no upper bound on the count, so rows committed during the request may be included (`audit/repository.py:81-89`).
  - Only the 24 h totals exist. No daily or weekly series is available. The retention reference is ≥ 90 days, so the 24 h window is not affected by it.
- **Sign-ups:**
  - `by_month` has 12 entries, oldest first, zero-filled (`SIGN_UP_MONTHS=12`, `service.py:20`).
  - The last entry is the current month, which is partial.
  - Month boundaries are in `Asia/Ho_Chi_Minh` (UTC+7, so not UTC). `month` is a string like `2026-11`. The SQL is at `repository.py:11-22`.
  - It counts all users by `created_at`, including self sign-ups, CLI-created accounts and disabled users. It does not depend on the audit log.
  - It does not distinguish verified from unverified users.
- **`members_per_app`:**
  - It lists every app, ordered by key. That includes disabled apps and the `admin` app (`service.py:70`, `rbac/repository.py:611-616`). Zero-member apps are present with 0.
  - `member_count` is the number of distinct users with `status == active` and at least one non-expired role assignment on the app, at app scope or in any org. Unverified email still counts. Disabled users do not count (`rbac/repository.py:618-639`).
  - It is the same definition as `member_count` on `AppRead`.
  - There is no `status` field on the entries, so the UI cannot tell disabled apps from active ones here.
  - For the disabled-app case, use `GET /apps` (`admin:apps:read`) or `apps.by_status`. Do not invent a flag.
- **Consistency:** the numbers are approximate, from 7 sequential queries on one session and not one snapshot (`service.py:1-4`). Counts can differ by a few between tiles, and `users.total` is not guaranteed to equal `sum(active, disabled)` under load. It is equal by construction in the response, because the total is the sum.
- **Unknown keys:** the endpoint description says "Clients ignore unknown keys" (`router.py:34`). Additions are additive within v1.
- **Not available from this endpoint:** change percentages, trends against a previous period, per-day sign-ins, recent activity, per-app sign-ins.

Permission and access:
- `admin:stats:read` is declared at `router.py:43`, with `Depends(current_admin)` on the router at `router.py:22`. It is a Bearer `aud=admin` endpoint, and `admin:*` covers it.
- The permission is `is_admin=true` and **granted to no role** (`ADM-015/review.md:37`, `plan.md:164`). Today only `admin:*` holders (super-admin) get 200. Everyone else gets 403 until a super-admin adds it to a role through role-permission replace. Only an `admin:*` holder can put an `is_admin` key into a role.
- Holding `admin:stats:read` alone also reveals every app's key and name, including disabled apps and `admin`, without `admin:apps:read` (`router.py:26-27`, `ADM-015/security-review.md:12-20`).
- The UI can read what the user holds from `GET /api/v1/me/permissions`, which returns `admin:*` unexpanded, so a client check must treat `admin:*` as matching `admin:stats:read`. The UI should still handle a 403 (R4).

Caching and cost:
- The 200 sends `Cache-Control: no-store` (`router.py:46`). It is set by code and is **not documented** in the OpenAPI responses, in the snapshot or in the current source. Do not rely on the generated types for it.
- No ETag and no `max-age`. The consult advised against them in v1 (`consult-api-platform-engineer.md:21`).
- There is no rate limit beyond the Bearer guard.
- No audit row is written for the call.
- Cost:
  - The audit count is index-bounded over 24 h.
  - There is no `users.created_at` index, so the sign-up series seq-scans `users`.
  - The target is p95 < 200 ms at current size. Revisit above about 100k users (`security-review.md:31-35`).
  - Seven statements per call, a test pins this.

Errors:
- 200, 401 and 403, all in the shared envelope `{"error":{"code","message","details"}}`.
- 401 is `unauthorized`. A 401 can now also come from an ended admin session (USR-14).
- 403 is `permission_denied`.
- There is no 404, 422 or 429 on this route. It takes no path, query or body input.
- A 500 from a bad config is unlikely, since time zone and window are constants.

## Recommendations

1. **Types (R2, AC "KPIs, charts and attention counts come from the API").** Regenerate `src/api/openapi.json` first. Then review the diff against section 1 so the PAN-020 diff stays limited to stats (R7). Take the role-definitions types only because they ride along in the generated file. Keep any use of them out of this ticket.
2. **Single hook.** One TanStack Query `useDashboardStats` in `src/api/`, with the generated `DashboardStats` type. No hand-written copies (R2). Do not fan out to `/users`, `/organizations`, `/apps` or `/audit-logs` to compute tiles.
3. **Map the mock to the API names.**
   - KPI Users uses `users.total`.
   - KPI Active orgs uses `organizations.by_status.active`.
   - KPI Apps uses `apps.total`, or `apps.by_status.active` if the label stays "Registered apps". The label must say which.
   - KPI Sign-ins (24 h) uses `sign_ins_24h.succeeded` (and `failed` as a secondary figure).
   - Sign-ups chart uses `sign_ups.by_month`. Format `YYYY-MM` for display without time-zone conversion. Show `sign_ups.time_zone` somewhere (caption or tooltip) and mark the last bar as partial.
   - Members chart uses `members_per_app` (`app_key`, `member_count`). The `name` is available for labels.
   - Attention items map as follows. Unverified is `users.unverified`, labelled as including disabled users unless the owner says otherwise. Suspended orgs is `organizations.by_status.suspended`. Failed sign-ins is `sign_ins_24h.failed`.
   - Link the attention rows to `/users`, `/organizations` and `/audit-log`. Those pages' filters depend on their own tickets, so do not promise a filtered deep link if they have none.
4. **Mock fields with no API source (R1).** Remove, or label as unavailable, rather than faking:
   - `change_pct` and `period` on the KPI cards (`data/stats.ts:9-10,18-41`, and probably `kpi-cards.tsx`). The API has no previous-period values.
   - The "Sign-ins this week" per-day chart (`dailySignIns`, `index.tsx:106-118`). The API gives only 24 h totals. Replace it with a succeeded/failed figure for the window, or drop the tab.
   - "Recent admin activity". It is not in the stats document. It would need `GET /audit-logs`, which needs `admin:*`. Either leave it on mock with an explicit note, which the CLAUDE.md "Never call the network from mock code" rule forbids mixing, or move it to the audit-log ticket. Raise this as a follow-up and an owner question.
   - Put the "Sample data until the API provides stats" text (`index.tsx:45-47`) away.
5. **Do not compute client-side.** No percentages, sums, totals, averages, "active apps" filters, or week or day bucketing derived from other fields. Show numbers as given. Use `by_status` when a label needs a subset. No re-derivation of `total` from `by_status` (it already is that). Do not reorder or re-bucket the months. Do not sort `members_per_app` into a different meaning (sorting for display is fine). Do not drop `admin` or disabled apps without an owner decision, since this is a presentation choice and the API does not mark them.
6. **Permission (R4).**
   - The route declares `admin:stats:read`, and the nav item and the Dashboard (the post-login landing page) should treat `admin:*` as sufficient.
   - A staff member without it must see a proper 403 state: "You need admin:stats:read to see the dashboard." Do not show a blank page or an error toast loop.
   - If the dashboard is the default route, a non-super-admin lands on 403 immediately. Plan a fallback landing route.
7. **Refresh.** Fetch on mount and on a manual Refresh button. Use `staleTime` of 60-120 s and no polling or `refetchInterval`. Do not refetch on window focus, or set it to false. Show `generated_at` ("Updated hh:mm") so staff can see how fresh it is. After mutations on users, orgs or apps, invalidating the stats query is optional, since it is approximate (R9 only demands invalidating affected queries).
8. **Retry.** Retry 5xx and network errors once or twice. Never retry 401 or 403.
9. **Errors.** Parse the envelope through the single client (R2). Show `message` and the request id (`X-Request-ID` response header). On 401 go through the auth client's normal path.
10. **Tests (R8).** Network-layer mocks for loading, success, 403, 401, 500 and a zero-filled case (all zero, every month 0). Add a test for the partial last month and the time-zone caption, and for unverified-includes-disabled wording.
11. **Caveat copy to keep visible in the UI** (spec §5.9 asks for it): failed sign-ins include unknown emails and exclude 429 or Turnstile refusals. Sign-ins are events, not users. Sign-ups include CLI-created accounts. Counts are approximate.
12. **Ticket housekeeping.** `ticket.md:26` still says "org-admin-api has no stats endpoint yet: propose a ticket there", which contradicts the Depends line. Correct it. `docs/spec-v1.md` §5.7 in admin-pan says "API: none yet — gap" (`spec-v1.md:56,91`). Update it per spec-wins.

## Risks

- **403 for almost everyone.** The permission is granted to no role, so the dashboard is super-admin only today. Non-super-admin staff see a permanent 403 on the landing page unless an owner grants `admin:stats:read` to a staff role. A super-admin must do that. The UI must not hide this by showing a blank dashboard.
- **App-list exposure.** `members_per_app` shows disabled apps and `admin`. If the UI hides those, it is making a product decision the API does not make. If the UI shows them, a stats-only holder sees them even without `admin:apps:read` (accepted by the owner per the review, `security-review.md:20`).
- **Misleading KPI semantics.** `unverified` includes disabled users, `sign_ins_24h` is events not users, and the last sign-up month is partial. Labelling them wrongly would read as wrong numbers.
- **Mock layout expects data the API does not offer** (trend percentages, daily sign-ins, recent activity). Implementing those client-side would break R1.
- **Regeneration noise.** The regenerated file will include role-definitions and join-request changes unrelated to PAN-020. Mixing them into the same diff risks R7 violations.
- **Admin session ends.** After USR-14 a staff session revoke or password reset ends admin tokens on the next request. A 401 on the dashboard fetch can be legitimate.
- **Approximate numbers.** Tiles may not add up exactly (e.g. the sum of per-app members is not the user total, since a user can be in several apps).

## Open questions (owner / orchestrator)

1. Is `change_pct` ("vs last month") to be dropped, or is an org-admin-api follow-up wanted for previous-period values? Same question for a daily sign-in series (the "Sign-ins this week" tab).
2. "Recent admin activity" on the dashboard needs `admin:audit:read` or `admin:*`. Does it move to PAN for the audit-log ticket, stay mock (not allowed alongside real data), or get its own gating?
3. Which roles should hold `admin:stats:read`? Needs a super-admin action in the API, not a code change.
4. Should `members_per_app` hide disabled apps and `admin` in the chart, or show all with a label? The API gives no per-entry status.
5. KPI "Registered apps": total or active only?
6. Should the attention row "Users with unverified email" count disabled users, or does staff want the API to offer an active-only figure (a follow-up for org-admin-api, not a UI derivation)?
7. Is the `Cache-Control` header worth adding to the OpenAPI responses in org-admin-api? Only a doc fix, to propose there, not here.

Key files: `/home/user/org-admin-api/app/modules/stats/router.py` (22-75), `/home/user/org-admin-api/app/modules/stats/schemas.py`, `/home/user/org-admin-api/app/modules/stats/service.py` (20-71), `/home/user/org-admin-api/app/modules/stats/repository.py`, `/home/user/org-admin-api/app/modules/rbac/repository.py` (611-639), `/home/user/org-admin-api/work/tickets/ADM-015/security-review.md`, `/home/user/org-admin-api/work/tickets/ADM-015/review.md`, `/home/user/org-admin-api/work/tickets/ADM-015/plan.md`, `/home/user/org-admin-api/docs/spec-v1.md` (78-101), `/home/user/admin-pan/src/api/openapi.json` (9141-9215), `/home/user/admin-pan/src/features/dashboard/data/stats.ts`, `/home/user/admin-pan/src/features/dashboard/index.tsx`.
