## Attempt 1 — 2026-11-16

### Files touched
| File | Required because |
|---|---|
| `src/lib/permissions/registry.ts`, `source.ts` | Typed registry and tri-state seam (plan §1, §2) |
| `src/context/permission-provider.tsx` | Provider, `usePermission`, `useActionPermission` |
| `src/components/permissions/can.tsx`, `route-permission-guard.tsx` | `<Can>` and route guard |
| `src/components/forbidden-panel.tsx`, `src/lib/forbidden.ts`, `src/lib/query-view.ts` | In-place 403 handling |
| `src/components/layout/nav-filter.ts`, `types.ts`, `data/sidebar-data.ts`, `app-sidebar.tsx`, `src/components/command-menu.tsx` | Nav filtered by requirement |
| `src/routes/_authenticated/route.tsx` | Mount provider and guard |
| `src/lib/handle-server-error.ts`, `src/lib/query-client.ts` | 403 toast branch; comment only |
| Feature files: organizations (primary buttons, row actions), users (row actions, bulk actions), apps (index, row actions, permissions tab), roles (index, row actions, assignments sheet), reports (primary buttons, row actions) | `<Can>` wrapping per Action inventory; stale comments removed |
| `src/test-utils/permissions.tsx` | Test-only fake source |
| `docs/adr/0004-permission-mirroring-and-403-handling.md` | Decision record |
| Test files | See below |

### Tests added / changed
- New: `registry.test.ts`, `source.test.ts`, `forbidden.test.ts`, `query-view.test.ts`, `can.test.tsx`, `nav-filter.test.ts`, `route-permission-guard.test.tsx`, `forbidden-panel.test.tsx` (including the network-layer 403 via `createApiClient`, refetch-403 and no-retry/no-unauthorized cases).
- Changed: `handle-server-error.test.ts` (403 copy; auth-kind 403 silent), `search-provider.test.tsx` (denied nav in the command menu), `organizations-table.test.tsx`, `users-table.test.tsx`, `apps.test.tsx`, `roles.test.tsx`, `reports-table.test.tsx` (denied and granted cases).

### Checks (actual output summary)
- pnpm typecheck: clean (tsc -b, no errors)
- pnpm lint: clean (no errors or warnings)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): Test Files 58 passed (58); Tests 389 passed (389)
- pnpm build: built OK
- pnpm e2e: not planned

### Out-of-plan files
None. No Docker, nginx or package changes. `?raw` JSON import typechecked without tsconfig changes. `Array.prototype.at` is not in the ES2020 lib, so the guard uses `m[m.length - 1]`.

### Follow-ups (noticed, not done)
- PAN-011b: real `PermissionSource` from `GET /api/v1/me/permissions`.
- PAN-013..016: render queries through `queryView` + `ForbiddenPanel`; use `variant='inline'` in `handlesOwnErrors` dialogs; remove remaining stale `admin:...(planned name)` comments in providers, dialogs and `apps/data/access-store.ts`.
- PAN-016: refresh `openapi.json`, add `admin:audit:read`, switch the audit-log route from pending.
- Spec §5.1: note that navigation is unfiltered until PAN-011b (owner or product-manager).
- Disabled admin-only switches repeat the "Requires admin:roles:manage" text on every permission row; PAN-013..015 may want a single shared reason.

### Scope self-check
- Could the diff be smaller? No; each file is in the plan list.
- Diff size: about +700 / -310 lines in tracked files plus new files (mostly tests, indentation changes from `<Can>` wrapping).
