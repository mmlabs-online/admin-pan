## Attempt 1 — 2026-11-17

### Snapshot regeneration
- org-admin-api read-only checkout at c41ef57. Command: `cd /home/user/org-admin-api && UV_PROJECT_ENVIRONMENT=<scratchpad>/oaa-venv DATABASE_URL=postgresql+asyncpg://x:x@localhost/x uv run python -m app.cli openapi --output /home/user/admin-pan/src/api/openapi.json`, then `pnpm api:types`.
- `git diff --stat src/api/`: `openapi.json` +~2400 / -~750 (3161 lines changed), `schema.d.ts` 935 lines changed.
- Drift matched the plan: new entitlement and join-request paths, `PUT .../manifest`, 7 new `AuditAction` values (including `app.manifest_synced`), 2 new `AuditTarget` values (`join_request`, `entitlement`), `x-permission` `admin:entitlements:read|write`. No other typecheck breakage.

### Files touched
| File | Required because |
|---|---|
| `src/api/openapi.json`, `src/api/schema.d.ts` | R2: regenerated snapshot and types |
| `src/lib/permissions/registry.ts` | `admin:entitlements:*` keys; actions `organizations.view`, `entitlements.view/grant/update` |
| `src/features/audit-log/data/schema.ts` | Enum-only: new `AuditAction` / `AuditTarget` values (typecheck guards) |
| `src/features/audit-log/data/data.ts` | Tones and target labels for the new values |
| `src/features/audit-log/data/data.test.ts` | New `entitlement audit entries` test |
| `src/features/organizations/api/queries.ts` (+ `.test.ts`) | `organizationsKeys.detail`, `organizationQueryOptions` |
| `src/features/organizations/api/entitlements.ts` (+ `.test.ts`) | keys, list query, grant and update mutations |
| `src/features/organizations/data/entitlement-schema.ts` (+ `.test.ts`) | form schema, limit helpers, drift test |
| `src/features/organizations/data/entitlement-errors.ts` (+ `.test.ts`) | ADR 0004 error mapping |
| `src/features/organizations/components/organizations-provider.tsx` | `'view'` dialog type, `viewButtons` ref map |
| `src/features/organizations/components/organizations-dialogs.tsx` | mounts the detail sheet |
| `src/features/organizations/components/data-table-row-actions.tsx` | View button (`organizations.view`) |
| `src/features/organizations/components/organization-detail-sheet.tsx` (+ test) | minimal sheet: Overview + Entitlements tab |
| `src/features/organizations/components/organization-entitlements-tab.tsx` (+ test) | list, switch, Grant, Edit, focus handling |
| `src/features/organizations/components/entitlement-form-dialog.tsx` (+ test) | grant and edit dialog |
| `src/features/organizations/components/entitlement-enabled-dialog.tsx` (+ test) | enable/disable confirm |
| `src/features/organizations/components/test-data.ts`, `test-fixtures.tsx` | fixtures, `renderOrgSheet`, `orgsServer` |
| `e2e/support/fake-api.ts`, `e2e/pages.e2e.ts` | stateful entitlement routes and the new e2e test |

### Tests added / changed
- `entitlements.test.ts`: keys nesting; GET URL; grant body/invalidation (201, 409, 404, 502 one POST); update PATCH by row id.
- `queries.test.ts`: `organizationQueryOptions`.
- `entitlement-schema.test.ts`: drift vs openapi.json, plan, limits, app_key, helpers.
- `entitlement-errors.test.ts`: grant, edit and toggle mappings.
- `organization-detail-sheet.test.tsx`: open and Overview, 404/500/403, hidden tab without read, focus return to View.
- `organization-entitlements-tab.test.tsx`: lazy fetch, states, rows, suspended hint, read-only gating, 150-total cap.
- `entitlement-form-dialog.test.tsx`: grant picker/POST/focus, 403 text fallback, no eligible apps, 409/404 mapping, pending guard, edit semantics, validation and 422/404.
- `entitlement-enabled-dialog.test.tsx`: cancel, non-optimistic disable with single PATCH, enable, 403/404.
- `audit-log/data/data.test.ts`: entitlement audit entries.
- `e2e/pages.e2e.ts`: "organizations entitlements: ..." (axe x4, one POST with exact body, cancel = 0 PATCH, confirm = 1 PATCH, Globex Inactive).

### Checks (actual output summary)
- pnpm typecheck: pass (`tsc -b`, no errors)
- pnpm lint: pass (`eslint .`, no output)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test: Test Files 89 passed (89); Tests 641 passed (641). With `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`. Note: `organizations-delete-dialog.test.tsx` "confirm sends DELETE..." timed out once when run in a partial parallel run (click on a detached button) and passed on three isolated/full runs; not touched by this change, looks like load flakiness.
- pnpm build: pass (`built in 1.44s`)
- pnpm e2e: 26 passed

### Out-of-plan files
None. Deviations inside planned files:
- `entitlement-schema.ts` defines `entitlementFormSchema(mode)` as a factory (app_key checked only in grant mode).
- `entitlements.ts` casts the grant body to `EntitlementCreate`: the generated type marks `enabled` required (it has a default), and the plan requires sending no `enabled`.
- e2e: `waitForTimeout(600)` before opening a second row's sheet (see follow-ups).

### Follow-ups (noticed, not done)
- `closeWithRow` (organizations and apps dialogs) clears `currentRow` 500 ms after closing; opening another row within 500 ms gets unmounted by that timer (found by the e2e test). Fix by clearing only if the row is unchanged.
- `src/features/organizations/components/organizations-delete-dialog.test.tsx` "confirm sends DELETE" is timing-sensitive under parallel load.
- Plan follow-ups still apply: revoke (PAN-019b), PAN-014b detail fields, lift apps error helpers, spec §5.6 "(backlog)", org Delete `text-red-500!` contrast.
- org-admin-api: seed `admin:entitlements:*` into a staff role; ETag on PATCH.

### Scope self-check
- Could the diff be smaller? No for production code; most volume is the regenerated snapshot and tests.
- Diff size: tracked files +3863 / -826 (of which ~3300 / ~750 is `src/api/*`), plus 14 new files.
