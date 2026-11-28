## Attempt 1 — 2026-11-27

Slice 1 only (credentials by scope). Role fields are PAN-034b and not touched.

### Snapshot (Approach §0)
- org-admin-api `rev-parse --short HEAD`: `a77e819`.
- Command: `UV_PROJECT_ENVIRONMENT=<scratchpad>/oaa-venv DATABASE_URL=postgresql+asyncpg://x:x@localhost/x uv run python -m app.cli openapi --output <scratchpad>/openapi-a77e819.json` (clone not modified).
- A scratchpad Python script replaced `paths['/api/v1/apps/{key}/credentials'].post` and `AppCredentialRead`, `AppCredentialIssued`, `AppCredentialScope`, `AppCredentialIssue`. The only `$ref` outside them is `ErrorEnvelope`, which is deep-equal to the generated one. Not hand-patched.
- `git diff --stat src/api/`: `openapi.json` +72/-4, `schema.d.ts` +33/-4 (only the credential POST operation and the four schemas changed). `pnpm api:types` leaves no further diff.

### Files touched
| File | Required because |
|---|---|
| `src/api/openapi.json`, `src/api/schema.d.ts` | Fragment refresh (R2) |
| `src/lib/permissions/registry.ts`, `source.ts`, `src/components/permissions/can.tsx` | `super` requirement kind; `apps.issueCredential` = `superOf('admin:apps:write','always',…)`; "Requires admin:*" |
| `src/lib/permissions/registry.test.ts`, `source.test.ts` | Drift guard and evaluate case for `super` |
| `docs/adr/0004-…md`, `docs/adr/0007-…md` | Amendments (PAN-034) |
| `src/features/apps/data/app-schema.ts` | `AppCredentialScope`, `APP_CREDENTIAL_SCOPES` with `Same<>` guard |
| `src/features/apps/data/data.ts`, `data.test.ts` | `ISSUABLE_SCOPES`, `credentialScopeOptions`, `isRuntimeScope`, `credentialScopeHints`, `CREDENTIAL_LIMIT_NOTE` and tests |
| `src/features/apps/data/errors.ts`, `errors.test.ts` | `credentialIssueError(error, scope)`, new 409 copy, 422 branch |
| `src/features/apps/api/queries.ts`, `queries.test.tsx` | Variables `{ scope, onSecret }`, body `{ scope }` |
| `src/features/apps/components/app-credential-issue-dialog.tsx`, `.test.tsx` | Required Scope select, hints, runtime warning, scope-aware reveal |
| `src/features/apps/components/app-credentials-tab.tsx`, `.test.tsx` | Scope column, colSpan 6, per-scope copy, Issue button for admin app |
| `src/features/apps/components/test-data.ts` | `scope` on fixtures; app `simap` and its credentials |
| `src/features/apps/components/apps-table.test.tsx` | `simap` is a second `Required` org mode row: `getByText('Required').first()`; comment reworded |
| `e2e/support/fake-api.ts`, `e2e/pages.e2e.ts` | Scope-aware fake POST and refusals; credentials e2e picks a scope |

### Tests added / changed
- `data.test.ts` › credentialScopeOptions; isRuntimeScope and hints; APP_CREDENTIAL_SCOPES equals openapi.json enum
- `queries.test.tsx` › useIssueCredentialMutation body `{"scope":"org-members:read"}` / `{"scope":"manifest"}`
- `errors.test.ts` › credentialIssueError table (admin_app, app_disabled, scope_not_available, credential_limit names scope, other 409, 422, 404, 403 x2, unknown outcome, non-ApiError)
- `app-credential-issue-dialog.test.tsx` › required select, no preselect, "Select a scope." linked; options for calechip and admin; org-members:read body, double click, runtime warning and reveal copy; manifest hint; leak regression parametrised (manifest, org-members:read); refusals (403 x2, 404, 409 x4, 422) keep the chosen scope; unknown outcome
- `app-credentials-tab.test.tsx` › Scope column and colSpan 6 and limit copy; admin app Issue shown; `Requires admin:*` (apps:write without admin:*), granted-all enabled
- `registry.test.ts` › super base/when match x-permission/x-requires-super; `source.test.ts` › super evaluates admin:*
- `pages.e2e.ts` › credentials test picks `manifest`; limit text "already has 2 active manifest credentials"

### Checks (actual output summary)
- pnpm typecheck: clean (no output)
- pnpm lint: clean (0 errors, 0 warnings)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): Test Files 124 passed (124), Tests 1028 passed (1028). One earlier full run had a single failure in the tab Scope test (an un-awaited `.element()` on the empty row); fixed by awaiting visibility first, then the file and a full run passed.
- pnpm build: built OK
- pnpm api:types: re-run after the edits, no further diff beyond the intended one
- pnpm e2e: 30 passed

### Out-of-plan files
None beyond the plan's conditional `apps-table.test.tsx` (recorded above).

### Follow-ups (noticed, not done)
- admin-pan: offer `limits:write` once org-admin-api ADM-044 lands.
- admin-pan: `created_by` column on credentials.
- admin-pan: full `openapi.json` refresh to org-admin-api main.
- admin-pan: `route-permission-guard.tsx` ignores the `super` kind (not used on routes yet).

### Scope self-check
- Could the diff be smaller? No; every file is listed in the plan.
- Diff size: about +725 / -163 lines across 24 tracked files (incl. generated schema and JSON), plus this log.

## Attempt 2 (REWORK: a11y finding 1 + two should-fix items)

### What changed
- `src/components/select-dropdown.tsx`: optional `triggerRef` and `required` props (forwarded to `SelectTrigger` as `ref` and `aria-required`); backward compatible, other callers unchanged.
- `app-credential-issue-dialog.tsx`: Scope `field.ref` wired via `triggerRef`; `required` set; label shows an `aria-hidden` `*` marker (accessible name stays "Scope"); invalid submit calls `form.setFocus('scope')`; the runtime-scope warning is now a polite `role='status'` paragraph holding only the extra sentence (no duplicate of the hint).
- ADR 0007 behaviour untouched.

### Tests added / changed
- `app-credential-issue-dialog.test.tsx` › the existing "Issue without a scope" test now also asserts focus on the Scope trigger, `aria-required`, `aria-invalid`, description contains "Select a scope.", and no POST.

### Checks
- typecheck, lint, format:check: clean
- pnpm test: 124 files, 1028 tests passed
- pnpm build: OK
- pnpm e2e: 30 passed
