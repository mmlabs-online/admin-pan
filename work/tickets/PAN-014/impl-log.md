## Attempt 1 — 2026-11-17

### Files touched
| File | Required because |
|---|---|
| `src/api/openapi.json` | Regenerated with the generator `uv run python -m app.cli openapi --output ...` at org-admin-api 33db316 (checkout untouched). No hand edits. |
| `src/api/schema.d.ts` | `pnpm api:types`; re-running it leaves no diff |
| `src/components/confirm-dialog.tsx` | `aria-disabled` plus early return while pending, `pendingText`, sr-only status, `error` linked via `aria-describedby`; Escape blocked while pending |
| `src/components/confirm-dialog.test.tsx` | Rewrote the `isLoading` test; added pending-status and error-linking tests |
| `src/features/users/components/users-status-dialog.tsx` / `.test.tsx` | Pass `pendingText`, move failure markup into `error`; pending test updated, new describedby test |
| `src/components/forbidden-panel.test.tsx` | Params are now required |
| `src/features/organizations/api/queries.ts` / `.test.ts` | Keys, `toOrganizationsListParams`, list options, create/update/delete mutations |
| `src/features/organizations/data/schema.ts` / `schema.test.ts` (new) | Generated types, slug/name/description limits, search schema (page/pageSize only) |
| `src/features/organizations/data/errors.ts` / `errors.test.ts` (new) | `organizationFormError`, `organizationStatusError`, `organizationDeleteError` |
| `src/features/organizations/data/organizations.ts` | Deleted (mock rows) |
| `src/features/organizations/components/organizations-provider.tsx` | `{api, open, setOpen, currentRow, setCurrentRow}` |
| `.../organizations-table.tsx` | Server-side paging only, on the audit-log table shape |
| `.../organizations-columns.tsx` | Dropped `filterFn`/`sortingFn`/`enableSorting` |
| `.../organizations-action-dialog.tsx`, `-status-dialog.tsx`, `-delete-dialog.tsx` | On the mutations; 409 to slug field; typed-slug delete; pending a11y |
| `.../organizations-dialogs.tsx` | Explicit close handlers |
| `src/features/organizations/index.tsx`, `src/routes/_authenticated/organizations/index.tsx` | Table gets only `search`/`navigate`; route uses `organizationsSearchSchema` (no `filter`/`status`) |
| `.../test-data.ts`, `test-fixtures.tsx` | API-shaped fixtures; `renderOrganizations(client, {granted?, search?})` |
| `.../organizations-table.test.tsx`, `organizations-action-dialog.test.tsx` | Rewritten |
| `.../organizations-status-dialog.test.tsx`, `organizations-delete-dialog.test.tsx` | New |
| `.../organizations-confirm-dialogs.test.tsx` (+ its stale `__screenshots__` dir) | Deleted (asserted mock behaviour) |
| `e2e/support/fake-api.ts`, `e2e/pages.e2e.ts` | `ORGS` fixture and `GET /api/v1/organizations` handler; new organizations e2e test |

### Tests added / changed
- All tests listed in plan.md "Tests to write" were written (queries, schema, errors, table, action/status/delete dialogs, confirm-dialog, users status dialog, e2e).
- Testing notes: vitest-browser `toBeDisabled` also matches `aria-disabled`, so the "not native disabled" check uses `not.toHaveAttribute('disabled')`. Playwright's click waits for "enabled" and times out on `aria-disabled`, so the "click while pending" assertions dispatch `element().click()` directly. The URL-state stub is a `<code>` (not `<output>`) so it does not collide with `getByRole('status')`.
- `queries.test.ts` builds its provider with `createElement` (the file is `.ts`, per the plan).

### Snapshot
- Path used: the generator (`uv run python -m app.cli openapi`), org-admin-api at 33db316, then `pnpm api:types`.
- Diff: adds `/api/v1/apps/{key}/credentials` (GET, POST) and `.../{credential_id}` (DELETE) plus their schemas. The generator also changed things the plan did not list: `AuditAction` gains `app_credential.issued`/`.revoked`, `AuditTarget` gains `app_credential`, `PermissionRead.scope` is now required, and the `PermissionCreate` description changed. Organization schemas are unchanged. Credential paths are not wired (R7). `registry.test.ts` passes unchanged.

### Checks (actual output summary)
- pnpm typecheck: pass (no output)
- pnpm lint: pass (0 errors, 0 warnings)
- pnpm format:check: pass ("All matched files use Prettier code style!")
- pnpm test: 73 files passed, 525 tests passed (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium)
- pnpm build: pass (`built in 1.10s`)
- pnpm e2e: 23 passed (including the new organizations test; no unmatched requests)
- `grep -r msw src`: nothing. `pnpm api:types` re-run: no diff.

### Out-of-plan files
- `src/features/audit-log/data/schema.ts` and `src/features/audit-log/data/data.ts`: the regenerated snapshot added `app_credential.issued`/`.revoked` audit actions and the `app_credential` target. The typed Records and zod enum drift guards failed to compile without them (`app_credential.issued` tone success, `.revoked` tone warning, label "App credential"). Smallest fix that compiles; no behaviour change otherwise.

### Follow-ups (noticed, not done)
- org-admin-api: list `status`, `q`, `sort` filters (keep `org-admin-api-request.md` open); declare 404/409 responses (incl. `org_has_assignments` on DELETE) in OpenAPI.
- PAN-014b: organization detail sheet, `created_by`/`updated_at`, audit-log link (`?targetType=organization&target=<id>`, gated by `audit.view`).
- admin-pan a11y: move focus to a stable target after a dialog removes the row that opened it; shared live-region component.
- admin-pan UX: link the delete 409 message to a per-org assignments view once one exists (spec §5.4).
- admin-pan: `PermissionRead.scope` is now required in the snapshot; check whether the roles/permissions screens should show it.

### Scope self-check
- Could the diff be smaller? No; the only extra files are the audit-log enum mirrors forced by the regenerated snapshot.
- Diff size: about +2138 / -679 lines across 30 files, of which about +875 is the generated snapshot (and the rest mostly tests).
