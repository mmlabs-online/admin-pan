## Attempt 1 — 2026-11-27
Verdict: PASS

Scope reviewed: slice 1 only (credentials by scope; AC1, plus AC3/AC4 for the credential calls). Base origin/main 35233a3, branch claude/zealous-turing-4o04h1 @ f9bb7a4. Commits 27177d1..a570b93 are bookkeeping (ticket, consults, plan, PAN-034b ticket, backlog rows).

### Checks (run by reviewer, PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium)
- pnpm typecheck: clean
- pnpm lint: clean
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test: Test Files 124 passed (124), Tests 1028 passed (1028). Matches impl-log.
- pnpm build: "built in 1.10s"
- pnpm e2e: 30 passed, including "apps credentials: list, issue shows the value once … second issue hits the limit inline …". Matches impl-log.
- Schema drift: `openapi-typescript src/api/openapi.json` into the scratchpad is byte-identical to the committed `src/api/schema.d.ts`.

### OpenAPI fragment verification (org-admin-api a77e819, read-only)
- Regenerated with `uv run python -m app.cli openapi` into the scratchpad. The clone's working tree is unchanged.
- Deep-equal to the generated spec: `paths['/api/v1/apps/{key}/credentials'].post`, `AppCredentialRead`, `AppCredentialIssued`, `AppCredentialScope`, `AppCredentialIssue`, and the referenced `ErrorEnvelope`.
- Structural diff against the base snapshot: only these change. The POST gains `requestBody`, `x-requires-super`, 404, and new 403/409 descriptions. `AppCredentialIssue` and `AppCredentialScope` are added. `scope` is added to the properties and `required` of `AppCredentialRead`/`AppCredentialIssued`. Nothing else in the snapshot moved.
- Behaviour cross-checked in `app/modules/app_credentials/service.py:111-133`. The refusal order and reasons (`admin_app` for admin and a scope other than releases, `app_disabled`, `scope_not_available` for limits:write, `credential_limit` per app and scope) match `errors.ts` and `e2e/support/fake-api.ts`. The scope enum and runtime set in `models.py:17-36` match `APP_CREDENTIAL_SCOPES` and `isRuntimeScope`.

### Acceptance criteria
- [x] AC1: an org-members:read credential can be issued, and the list shows its scope.
  - Evidence: `app-credential-issue-dialog.test.tsx` › "Issue: one POST with body {scope: org-members:read} even on double click …" asserts the body is exactly `{"scope":"org-members:read"}`, plus the reveal text "(org-members:read) for Calechip" and the runtime storage advice.
  - Evidence: `app-credentials-tab.test.tsx` › "Scope column shows each row's scope …", on the `simap` fixture with an `org-members:read` row.
  - Evidence: `queries.test.tsx` › useIssueCredentialMutation asserts the body.
- [x] AC3 (credential calls): every API refusal shows a specific message.
  - Evidence: `errors.test.ts` › credentialIssueError covers admin_app, app_disabled, scope_not_available, credential_limit (names the chosen scope), other 409, 422, 404, 403 ×2, unknown outcome and non-ApiError.
  - Evidence: the dialog test "403 ×2, 404, 409 … and 422 show their messages …" checks each one as a `role=alert` or ForbiddenPanel, with the chosen scope kept.
  - Evidence: the network failure / 502 test is unchanged.
- [x] AC4 (credential calls): tests cover scope options per app, request bodies and the refusal mapping.
  - Scope options: `data.test.ts` › credentialScopeOptions (admin → [releases]; calechip → 5 values, never limits:write), and the DOM tests "calechip offers 5 scopes" and "admin offers only releases".
  - Request bodies: the dialog and queries tests above.
  - Refusal mapping: `errors.test.ts`.
- [x] ADR 0007 secret handling unchanged.
  - `queries.ts:335-370` still has `retry: false`, `gcTime: 0`, no `mutationKey`, the secret only to the `onSecret` sink, and metadata-only resolution.
  - The dialog still keeps the secret only in `secret` state, with pagehide and unmount clearing, masking and copy unchanged.
  - The new `<form>` wraps only the Scope select; the reveal input is outside it.
  - The leak regression test is parametrised over manifest and org-members:read and passes.
  - The ADR amendment only records the `{scope, onSecret}` variables shape.
- [x] Role fields (PAN-034b) not in this diff. The only `default_role_id`/`org_owner_role_id` occurrences are the required fields of the new `simap` fixture in `test-data.ts`.

### Issues
None.

### Rules R1–R11
No violations found.
- R2: only `queries.ts` calls the API, through the client, with generated types (`AppCredentialScope` from `components['schemas']`, plus a `Same<>` guard and an openapi.json enum test).
- R4: `apps.issueCredential` now uses the `super` kind (admin:*), and the registry drift test checks `base` against x-permission and `when` against x-requires-super. 403 is still handled inline.
- R6: scope is rendered as React text.
- R9: the dialog is the explicit confirmation, it is not optimistic, and credentialsAll is invalidated on success.
- R10: the select is labelled through FormControl, and the error and hint are linked by `aria-describedby`, as the test asserts.

### Security / a11y blockers
None. No security-review.md or a11y-review.md was present at review time; the orchestrator adds any blockers from them.

### Nits (do not block)
- The AC1 dialog test issues the credential for `calechip`, not `simap` as the plan's verification table says. Behaviour is identical for every non-admin app; `simap` is only used in the tab test.
- The Scope select stays interactive while the request is in flight. The submitted scope is captured in the closure, so the error copy stays correct, but disabling it while pending would be tidier.
- `route-permission-guard.tsx:31` ignores the `super` kind. This is documented in the ADR 0004 amendment and is not used on routes yet.

### Follow-ups (out of scope)
- admin-pan: offer `limits:write` once org-admin-api ADM-044 lands (fragment refresh + ticket).
- admin-pan: `created_by` column on credentials.
- admin-pan: full `openapi.json` refresh to org-admin-api main.
- admin-pan: handle the `super` kind in `route-permission-guard.tsx` if a route ever uses it.
- org-admin-api: simap recipe vs `role_has_admin_permissions` conflict (plan decision 6); relevant to PAN-034b.

### Security / a11y blockers (added by the orchestrator)
- 🔴 a11y-review.md Attempt 1, finding 1: submitting the issue dialog with no scope shows "Select a scope." without any announcement, and focus stays on the submit button (`field.ref` not wired to the Select trigger) — WCAG 3.3.1 / 4.1.3. This turns the PASS above into **REWORK** (orchestrator rule: a 🔴 in a11y-review.md blocks).
