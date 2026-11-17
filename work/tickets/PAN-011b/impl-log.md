## Attempt 1 — 2026-11-17

### Files touched
| File | Required because |
|---|---|
| src/api/openapi.json | Added only `/api/v1/me/permissions` and `MePermissions`, copied by script from org-admin-api 8a4efb2 OpenAPI output (D1). Deviation: the existing snapshot predates `ErrorEnvelope` and `X-Request-ID` headers, so the copied fragment's response `headers` and the 401 `content` ($ref ErrorEnvelope, not in snapshot, made `api:types` fail) were stripped to match the shape of the other Bearer paths. Keys re-sorted; diff is insertions only. |
| src/api/schema.d.ts | Output of `pnpm api:types` (+67 lines) |
| src/lib/permissions/permits.ts (+test) | AC2 |
| src/lib/permissions/me-permissions.ts | Query options, shape check, source |
| src/lib/permissions/permission-refresh.ts (+test) | Throttled 403 refetch |
| src/lib/query-client.ts (+test) | Refresher wired into both caches |
| src/context/permission-provider.tsx | Context value, `MePermissionProvider`, `AuthPermissionProvider`, `useSelfUserId`, `usePermissionRefresh` |
| src/context/me-permissions.test.tsx | Provider tests |
| src/routes/_authenticated/route.tsx | Real source in production |
| src/components/permissions/route-permission-guard.tsx (+test) | `RouteForbiddenPanel` with retry and status line |
| src/features/users/components/data-table-row-actions.tsx | Self-row disabled with visible reason |
| src/features/users/components/users-table.test.tsx | `renderUsers` takes optional `userId`; 3 self-row tests |
| src/test-utils/permissions.tsx | `WithPermissions` `userId` |
| docs/adr/0004-...md | Amendment (D6) |

### Tests added / changed
- permits.test.ts: ADR-0003 table, admin:* over ADMIN_PERMISSIONS, no prefix/global wildcard, malformed required, empty/extra keys
- permission-refresh.test.ts: codes, exclusions, query itself, 5 s throttle (injected now), in-flight skip
- query-client.test.ts: clear removes me/permissions; burst of three 403 gives one refetch; mutation 403 with handlesOwnErrors refetches, not retried
- me-permissions.test.tsx: request shape, granted/denied/unknown, admin:*, loading, 500/network/403/404/malformed, extra field, success then failed refetch, no persistence/logging, auth-change refetch, account switch A to B
- route-permission-guard.test.tsx: retry now granted, still denied (status line), refetch error fail-open, checking status and no second request, source error renders page
- users-table.test.tsx: own row disabled with reason and "(your account)" name (mixed-case id), unknown user_id stays enabled, other rows and confirm

### Checks (actual output summary)
- pnpm typecheck: clean
- pnpm lint: clean
- pnpm format:check: All matched files use Prettier code style
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): Test Files 68 passed (68), Tests 467 passed (467)
- pnpm build: built OK
- pnpm e2e: not planned

Environment: full OpenAPI generated from /home/user/org-admin-api (8a4efb2, read-only) with `uv run --frozen python -m app.cli openapi` into the scratchpad with a temp UV_PROJECT_ENVIRONMENT. Hand-written fragment fallback not used. No `atob`/token decoding added.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- PAN-016: refresh `openapi.json` in full (also restores ErrorEnvelope/X-Request-ID shape) and add `admin:audit:read`.
- PAN-015b/015c: invalidate `mePermissionsKeys.all` after admin-app role writes; disable self-assignment with `useSelfUserId()`.
- a11y/owner: native `disabled` vs focusable `aria-disabled` in `<Can disable>`; optional nav skeleton during first load (D2, D4).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: about +230 product lines, +500 test lines, +67 generated types, ADR +8.
