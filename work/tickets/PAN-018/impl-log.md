# Implementation log — PAN-018

## Attempt 1

### Files touched
- `src/api/openapi.json` (insertions only: GET of `/organizations/{org_id}/members` and `/invitations`; schemas `InvitationStatus`, `OrgInvitationRead`, `OrgMemberRead`, `Page_OrgInvitationRead_`, `Page_OrgMemberRead_`)
- `src/api/schema.d.ts` (`pnpm api:types`)
- `src/lib/permissions/registry.ts` (`organizations.viewMembers`, `organizations.viewInvitations`)
- `src/features/organizations/api/members.ts`, `api/members.test.ts` (new)
- `src/features/organizations/data/members.ts`, `data/members.test.ts` (new)
- `src/features/organizations/components/offset-pager.tsx` (new)
- `src/features/organizations/components/organization-members-tab.tsx`, `.test.tsx` (new)
- `src/features/organizations/components/organization-invitations-tab.tsx`, `.test.tsx` (new)
- `src/features/organizations/components/organization-detail-sheet.tsx`, `.test.tsx`
- `src/features/organizations/components/test-data.ts`, `test-fixtures.tsx`

### Out-of-plan files
None.

### Snapshot (Approach section 0)
- org-admin-api HEAD `f632a25`. Generated into the scratchpad with `UV_PROJECT_ENVIRONMENT=<scratchpad>/oaa-venv DATABASE_URL=postgresql+asyncpg://x:x@localhost/x uv run python -m app.cli openapi --output <scratchpad>/openapi-f632a25.json`; the clone was not modified.
- A scratchpad Python script copied only the two `get` operations and the five schemas (no other schema was missing; `UserStatus`, `ErrorEnvelope`, `Page` refs already in the snapshot). Python was used rather than Node so the existing `0.0` number formatting round-trips; `git diff --stat src/api`: 2 files changed, 930 insertions(+), 0 deletions.
- Deviation to record: the already-snapshotted `ErrorBody` differs from the generated one in its `code` description only (the snapshot's text lists more codes: precondition_failed, length_required, ...; i.e. the snapshot is newer than f632a25 for this text). Kept the snapshot's version, did not overwrite; no structural difference.

### Tests added / changed
- New: `api/members.test.ts`, `data/members.test.ts`, `organization-members-tab.test.tsx`, `organization-invitations-tab.test.tsx`.
- Changed: `organization-detail-sheet.test.tsx` (tab list; two gating tests).
- Existing `registry.test.ts` unchanged and passing with the two new actions.

### Check results
- `pnpm typecheck`: pass
- `pnpm lint`: pass
- `pnpm format:check`: All matched files use Prettier code style!
- `pnpm test` (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): Test Files 120 passed (120); Tests 995 passed (995). One earlier full run had an unrelated timing failure in `roles/role-permissions-dialog.test.tsx` under load; it passes alone and in the final full run.
- `pnpm build`: built in 1.13s

### Notes
- Members "Granted" = `created_at` (A1); read-only (A3); no e2e tests planned.

### Follow-ups
As in plan.md (spec 5.3 / ticket Depends line USR-06 -> USR-23; full openapi refresh; revoke/invite/remove tickets; org-admin-api names for invited_by/accepted_by/granted_by and join date; `ErrorBody` description drift is covered by the full refresh).
