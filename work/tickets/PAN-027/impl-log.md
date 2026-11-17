## Attempt 1 — 2026-11-17

### Files touched
| File | Required because |
|---|---|
| `src/features/apps/api/queries.ts` | `CREDENTIALS_PAGE_SIZE`, keys `credentialsAll`/`credentials`, `appCredentialsQueryOptions`, `useIssueCredentialMutation` (sink design: secret goes to the caller's sink, mutation resolves with metadata only; `retry:false`, `gcTime:0`, no `mutationKey`, no `setQueryData`), `useRevokeCredentialMutation` |
| `src/features/apps/data/app-schema.ts` | `AppCredential` type from the generated schema |
| `src/features/apps/data/errors.ts` | `isUnknownOutcome`, `credentialIssueError`, `credentialRevokeError` |
| `src/features/apps/components/app-credentials-tab.tsx` (new) | list, pager, Issue button, per-row Revoke, focus handling (refs by row id, no querySelector) |
| `src/features/apps/components/app-credential-issue-dialog.tsx` (new) | two-phase dialog; only holder of the secret (local state, cleared on close/unmount/pagehide) |
| `src/features/apps/components/app-credential-revoke-dialog.tsx` (new) | `ConfirmDialog` naming key id and app |
| `src/features/apps/components/app-detail-sheet.tsx` | third tab "Credentials", description text |
| `src/features/apps/components/test-data.ts`, `test-fixtures.tsx` | `CREDENTIALS` fixtures, `credentialsPage`, server route, optional `queryClient` in `renderApps` |
| `src/test-utils/fake-credential.ts` (new) | the one `FAKE_CREDENTIAL` / `FAKE_KEY_ID` constant for Vitest and e2e |
| `src/lib/permissions/registry.ts` | `apps.view` + credentials GET, `apps.issueCredential`, `apps.revokeCredential` |
| `e2e/support/fake-api.ts`, `e2e/pages.e2e.ts` | stateful credential routes, new e2e test |
| `docs/adr/0007-one-time-secrets-in-the-ui.md` (new) | plan §7 |
| tests (below) | R8 |

### Tests added / changed
- `queries.test.tsx`: keys; list params; issue (POST no body, sink gets FAKE_CREDENTIAL, metadata-only result, mutation state has no secret, invalidates credentialsAll); issue 500/409/invalid 201; revoke (DELETE row id, 404 invalidates)
- `errors.test.ts`: `isUnknownOutcome`, `credentialIssueError`, `credentialRevokeError`
- `app-credentials-tab.test.tsx` (new): lazy fetch, loading/empty/error/403, rows, pager, admin/disabled app, read-only permissions, revoke cancel + focus, revoke confirm (non-optimistic, row id, toast, heading focus, double click), revoke errors
- `app-credential-issue-dialog.test.tsx` (new): confirm/cancel/focus, double click + pending lock, masked reveal, copy (ok/rejected), close friction, leak regression, pagehide, reopen, 403/409/404, unknown outcome
- `app-detail-sheet.test.tsx`: tabs test now expects 3 tabs
- `src/features/audit-log/data/data.test.ts` (new): `app_credential.*` tones/options/search
- `e2e/pages.e2e.ts`: "apps credentials: …" (axe on tab, issued dialog, revoke dialog)

### Checks (actual output summary)
- pnpm typecheck: pass (tsc -b, no errors)
- pnpm lint: pass (after one `consistent-type-imports` autofix in a new test)
- pnpm format:check: pass
- pnpm test: 82 files, 607 tests passed. (One run showed a single failure in the existing `app-status-dialog.test.tsx` toast assertion under load; it passes alone and on the full rerun. Not related to this diff.)
- pnpm build: pass
- pnpm e2e: 25 passed

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Plan follow-ups stand (registry `alsoRequires: 'admin:*'`, `created_by`, spec §5.4 credentials line, `mmak_` scrubber, gitleaks pattern, PAN-015 `querySelector` focus restores).
- `app-status-dialog.test.tsx` "toast.success … disabled" looks timing-sensitive under full-suite load (seen once).
- `pnpm knip` reports existing unused-type exports only; none from this change.
- Test note: Playwright treats `aria-disabled` buttons as not clickable, so the "Cancel ignored while pending" test uses a DOM `.click()`.

### Scope self-check
- Could the diff be smaller? No: every file is in the plan.
- Diff size: tracked files +536 / -11, plus 8 new files. No commit made (per instruction).
