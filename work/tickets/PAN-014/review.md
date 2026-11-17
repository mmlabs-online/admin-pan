## Attempt 1 — 2026-11-17
Verdict: PASS

Reviewed: `git diff origin/main...HEAD` at HEAD 7117727 (PAN-014 code commit 7117727, plus orchestrator commits e334209 plan and cdeda94 owner unblock / PAN-027 ticket). Contract checked against org-admin-api 33db316 (read-only checkout, `git status` clean after the regeneration).

### Checks (run by reviewer)
- pnpm typecheck: pass (`tsc -b`, exit 0, no output)
- pnpm lint: pass (`eslint .`, exit 0, no findings)
- pnpm format:check: pass ("All matched files use Prettier code style!")
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): pass, 73 files / 525 tests passed. This matches impl-log.
- pnpm build: pass ("built in 1.14s")
- pnpm e2e (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): pass, 23 passed, including `pages.e2e.ts:139` "organizations: list from the API; suspend and delete dialogs cancel without writes"
- Snapshot: I regenerated it into the scratchpad with `uv run python -m app.cli openapi` at org-admin-api 33db316. `cmp` against `src/api/openapi.json` shows it is **byte-identical**, so it was not hand-patched. I also regenerated `openapi-typescript src/api/openapi.json` into the scratchpad, and it is byte-identical to `src/api/schema.d.ts`.
- `grep -rn msw src package.json`: nothing.

### Acceptance criteria
- [x] Server-side pagination and filters (as the API supports). Evidence:
  - The API takes only `limit`/`offset`. The table is manual-paginated with sorting off and no toolbar (`organizations-table.tsx:155-167`).
  - Params come from `toPageParams` only (`api/queries.ts:34-41`), and the URL schema keeps only page/pageSize (`data/schema.ts:40-44`).
  - Tests: `organizations-table.test.tsx` › "sends limit/offset only…", › "next page sends offset=10…", › "clamps to the last page…", › "no search box, status facet or sort buttons"; `schema.test.ts` › "keeps page/pageSize and drops filter/status"; `queries.test.ts` › "toOrganizationsListParams…". All green.
- [x] Create/edit/suspend/delete call the API, with confirmation where destructive. Evidence:
  - Create and edit: `organizations-action-dialog.tsx:78-112`, with tests "create sends POST…" and "edit: … sends PATCH {name, description} without slug".
  - Suspend and reactivate: `organizations-status-dialog.tsx:370-387`. The confirm names the org and slug (`:408-416`). Tests: "suspend: confirm names the org…; cancel sends nothing" and "reactivate…".
  - Delete: needs the typed slug (`organizations-delete-dialog.tsx:29,64,95-112`) and says "Permanently delete … This cannot be undone." Tests: "Delete stays disabled until the exact slug is typed", "confirm sends DELETE, handles 204…; cancel sends nothing", "Enter in the slug input submits only when it matches".
  - None of it is optimistic. "pending: … the badge changes only after the refetch" covers this, and invalidation is in `queries.ts:66-77`, tested by "each mutation invalidates…; not on 500".
  - e2e: cancel paths produce no writes.
- [x] 409 conflict mapped to the slug field. Evidence:
  - `data/errors.ts:38-42` returns a fixed string on create only, so the server text (which echoes the slug) is never shown.
  - `organizations-action-dialog.tsx:96-104` calls `setError` with `shouldFocus`.
  - Test "409 conflict on create sets the error on the slug field, focuses it…" asserts `aria-invalid`, `aria-describedby` containing the message id, focus, kept values, and no server text. `errors.test.ts` › "409 conflict on create -> slug" / "409 on edit is not mapped to slug".
- [x] Loading, empty, error and 403 states are tested with a fake `fetch` injected into `createApiClient` (no MSW). Evidence:
  - `organizations-table.test.tsx` covers: "loading: … aria-busy", "empty", "error shows an alert and Retry refetches", "403 shows the ForbiddenPanel and no table", and "403 on refetch replaces stale rows…".
  - Every dialog has an inline 403 test.
  - All of them use `src/test-utils/api.ts` through `renderOrganizations(client)` (`test-fixtures.tsx`).
- [x] Owner 2026-11-16: typed-slug delete and "permanent" wording. Evidence: `organizations-delete-dialog.test.tsx` › "says the deletion is permanent and names the org".
- [x] Owner 2026-11-16: shared ConfirmDialog a11y fix, backward compatible. Evidence:
  - `confirm-dialog.tsx:55-61` blocks Escape while pending.
  - `:76-98` sets `aria-disabled` plus an early return on both buttons, and keeps native `disabled` only for the `disabled` prop.
  - `:71-74` adds the sr-only status; `:71,99` links `error` via `aria-describedby`.
  - Tests: `confirm-dialog.test.tsx` covers aria-disabled, ignored clicks and Escape, pendingText with status, and error linking. The existing `disabled` tests still pass.
  - The users status dialog was updated (`users-status-dialog.tsx:58,74-82`) and has the new test "a failure is linked to the confirm button via aria-describedby".
  - The other ConfirmDialog callers (sign-out, roles, apps, reports) still pass their tests.

### Issues
None blocking.

### Out-of-plan changes and testing workarounds (judged)
- **`src/features/audit-log/data/schema.ts:29-30,59` and `data.ts:41-42,89`: justified.**
  - The regeneration the owner asked for adds `app_credential.issued` / `.revoked` to `AuditAction` and `app_credential` to `AuditTarget`.
  - `actionTones` and `targetLabels` are typed `Record<AuditAction|AuditTarget, …>`, so they stop compiling without these entries.
  - These five lines are the smallest possible fix and only add display data. The tones (issued = success, revoked = warning) follow the existing patterns.
  - The impl-log records them under "Out-of-plan files".
- **The `work/` edits to `backlog.md`, `PAN-015/ticket.md` and `PAN-027/ticket.md` are fine.** They come from orchestrator commit cdeda94 (owner unblock), not the implementer. The implementer only changed the PAN-014 state, which is normal workflow.
- **Native `element().click()` instead of `userEvent.click` on aria-disabled buttons is acceptable.**
  - Playwright actionability refuses to click aria-disabled elements, so a native click is the only way to prove the early return.
  - Each test that does this asserts that no handler or write follows: `confirm-dialog.test.tsx` checks `handleConfirm` and `onOpenChange` were not called, and the action-dialog pending test checks exactly 1 POST.
- **`not.toHaveAttribute('disabled')` is acceptable.** vitest-browser's `toBeDisabled` also matches `aria-disabled`, so this is the correct way to assert "not native disabled".
- **The URL stub being `<code data-testid='search'>` instead of `<output>` is acceptable.** It is test-only and avoids a second implicit `role=status`.

### Rules R1–R11
No violations found.
- **R1:** no client-side filter, search or sort, and no faked `created_by`. The suspend copy matches the API's real effect (`organizations-status-dialog.tsx:413-415`).
- **R2:** HTTP goes only through the `src/api` client. The types are generated (`data/schema.ts:5-6`, `queries.ts:17-18`), and the snapshot is regenerated and byte-identical.
- **R4:** the route declares `admin:organizations:read`, and the write controls are gated (table test "read-only: …"). A 403 is handled in the list and in every dialog.
- **R5:** the URL holds only page and pageSize.
- **R6:** API text is rendered only as React text.
- **R7:** the credential paths are not wired.
- **R8:** all six checks are green.
- **R9:** confirmations name the target, nothing is optimistic, errors show inline, and the queries are invalidated after success and after 404/409.
- **R10:** pending states are announced, errors are linked, and the table wrapper is `overflow-x-auto`.

### Security / a11y blockers
None. No security-review.md or a11y-review.md is present at the time of this review. The orchestrator may run accessibility-auditor (areas include `ui`) and appsec-engineer (the diff touches the generated API schema).

### Nits (do not block)
- `confirm-dialog.tsx:71`: `{error && …}` would render a stray `0` if a caller ever passed a numeric `error`. `error != null` would be safer.
- `organizations-delete-dialog.test.tsx:101-112` ("Enter … submits only when it matches"): `expect(deletes(seen)).toHaveLength(0)` runs right after the first Enter. An async mutation that fires a request a tick later could slip past it. Prefer a short `expect.poll` or a check after the second request.
- `organizations-table.test.tsx:122-135`: the clamp test only asserts that the URL no longer contains `"page":3`. Asserting the exact target (`"page":1`) would be stronger.
- `confirm-dialog.test.tsx` and `users-status-dialog.test.tsx` find the error container through `alert.element().parentElement?.id`, which ties the tests to the DOM structure. A `data-testid` or a role query would be less brittle.

### Follow-ups (out of scope)
- org-admin-api: `status`, `q` and `sort` on `GET /api/v1/organizations` (keep `org-admin-api-request.md` open). Also declare the 404/409 responses in OpenAPI, including `org_has_assignments` on DELETE.
- PAN-014b: organization detail sheet, `created_by`/`updated_at`, and the audit-log link (`?targetType=organization&target=<id>`, gated by `audit.view`).
- admin-pan a11y: move focus to a stable target after a dialog removes its row; shared live-region component.
- admin-pan UX: link the delete-409 message to a per-org assignments view once one exists (spec §5.4).
- admin-pan: `PermissionRead.scope` is now required in the snapshot; check whether the roles/permissions screens should show it.
- PAN-027 should give the new `app_credential.*` audit actions real labels and tests when it wires the credential screens.
