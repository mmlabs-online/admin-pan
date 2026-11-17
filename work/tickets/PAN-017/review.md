# Review: PAN-017

## Attempt 1 — 2026-11-17
Verdict: PASS

Base `origin/main`, HEAD `c4e0365`. The branch also carries two earlier `solo:` commits (`86354a5`, `7c6bf63`) that add `work/org-admin-api-requests-2026-11-17.md`. They are not part of PAN-017's scope and were not judged here; they are only noted.

### Checks (run by reviewer, `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`)
- pnpm typecheck: clean (`tsc -b`, no output).
- pnpm lint: clean (`eslint .`, no output).
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test: 93 files, 715 tests passed (matches impl-log).
- `pnpm test src/features/users` x5: 8 files / 85 tests passed on all 5 runs (no flakes).
- pnpm build: "✓ built", no errors.
- pnpm e2e: 28 passed, including `users sessions: …` (`e2e/pages.e2e.ts:341`).
- OpenAPI snapshot: I regenerated it from read-only org-admin-api `26b27be` with `python -m app.cli openapi`, output to the scratchpad only. `cmp` against `src/api/openapi.json` showed IDENTICAL. `openapi-typescript` of the snapshot to the scratchpad also matched `src/api/schema.d.ts`. `git status` in org-admin-api stayed clean.
- Mutation checks (re-run by reviewer, files restored from backups; `git status`/`git diff` clean afterwards):
  - I removed the `inFlight` check (`user-session-revoke-dialog.tsx:36`). Result: FAIL `revoke one: two synchronous clicks on Confirm send one DELETE` (`expected 2 to be 1`).
  - I replaced the `isSelf` condition (`user-sessions-tab.tsx:40`) with `false`. Result: FAIL `users-detail-sheet.test.tsx › self: Sessions tab shows the note and sends no …/sessions request`.
  - Both match the impl-log.

### Acceptance criteria
- [x] Sessions list (created, last seen, user agent, IP). Evidence:
  - The columns are at `user-sessions-tab.tsx:168-176`.
  - Tests in `user-sessions-tab.test.tsx`: `list: columns … null ip/ua show 'Not recorded'`, `user agent with HTML renders as literal text`, `user agent with U+202E is sanitized and isolated in <bdi>`.
  - `users-detail-sheet.test.tsx › Sessions tab shown with admin:*; no …/sessions request until it is selected`.
  - The e2e test at `pages.e2e.ts:341` runs axe on it.
- [x] Revoke one / all with confirmation. Evidence:
  - The dialog names the email plus the created and last-sign-in dates (`user-session-revoke-dialog.tsx:72-86`).
  - Tests: Cancel sends no DELETE and focus returns; Confirm sends exactly one DELETE; two synchronous clicks send one DELETE; pending state with Escape blocked; 404 / 403 / 500 paths; revoke all from page 2 returns to offset 0.
  - The copy test in `sessions.test.ts` pins "up to 12 hours" and "not a password change".
  - The e2e test covers both flows with focus assertions.
- [x] States tested. Evidence: `user-sessions-tab.test.tsx` covers:
  - loading, empty, error with Retry, 404 user, 403 `permission_denied`, 403 `self_session_change_forbidden`;
  - pager with keepPreviousData, and both clamp cases;
  - the PII scan.

  The sheet tests cover gating, self and tab reset. The API is mocked at the network layer via `fakeApi`.
- [x] (orchestrator 4) Snapshot regenerated, knock-on edits only. My byte-identical regeneration is above. The drift edits are mechanical: `member_count: 0` in 3 test-data/fake builders, plus 2 audit actions in `audit-log/data/schema.ts` and `data.ts`.
- [x] (orchestrator 5) Gating, self rules and 403 copy. Evidence:
  - `registry.ts:101-108` (`admin:*`);
  - the tab gate at `users-detail-sheet.tsx:61`;
  - the case-insensitive self check at `user-sessions-tab.tsx:40` (mutation-proven);
  - `forbidden.ts` new case plus tests;
  - `permission-refresh.test.ts › self_session_change_forbidden does not refresh permissions`.
- [x] (orchestrator 6) PII hygiene. Evidence:
  - query keys hold only the id and `{limit, offset}` (`queries.ts` `sessionsAll`/`sessions`);
  - `gcTime: SESSIONS_GC_TIME_MS` (5000) at `queries.ts:155`;
  - toasts carry no PII (`user-session-revoke-dialog.tsx:40-42`);
  - test `no IP, user agent or session id in query keys, request URLs, toasts or status regions`;
  - the e2e URL scan.
- [x] (7) All checks green (above).

### Business rules vs org-admin-api 26b27be
- `require_permission("admin:*")` applies to all three routes (`app/modules/users/router.py:76-81`). The UI matches this in `registry.ts:101-108`.
- The list sends `Cache-Control: no-store`, and the read writes no audit row. The UI keeps gcTime short, and keepPreviousData applies only within the mounted tab.
- Self check: `staff_service.py` raises `SelfSessionChangeForbiddenError` on list and on both revokes, and audits the denied revokes. The UI skips the request entirely for self, and still maps the 403 when the self id is unknown.
- 404: the API returns it for an unknown user and, on revoke-one, for an unknown or already-revoked session. The UI handles it as "gone": it closes, shows a neutral notice and invalidates `detail(id)`.
- Revoke all is a 204 no-op when there are no sessions. The UI has no issue with this.
- Privileged target: `require_super` can produce 403 `admin_wildcard_required`. `forbiddenCopy` maps it, and `errors.test.ts` covers it.
- The revoke copy matches `_REVOKE_LIMITS` (router.py:65-72): new tokens only, up to 12 h, not a password change, IP/UA shared per browser.

### Deviations in impl-log, judged
- The "Revoke all aria-disabled" test uses a DOM `.click()` (Playwright refuses aria-disabled targets). Accepted: it exercises the guarded onClick, which is the point.
- The pager test expects "Showing 21–25 of 25" during the placeholder. Accepted: the label follows the requested offset, and the total is unchanged.
- The e2e grabs an element handle before the dialog opens, because the sheet is aria-hidden while the dialog is open. Accepted.
- The impl-log says "Nothing committed, per instruction", but the work is in commit `c4e0365` (the orchestrator committed it). This is a cosmetic mismatch with no effect on the evidence.
- The impl-log reports 3 runs of the users tests. I ran 5, all green.

### Issues
None.

### Rules R1–R11
No violations found.
- R1: the API is the only source.
- R2: only `api.GET`/`api.DELETE`, with generated `UserSessionRead`.
- R3: untouched.
- R4: `<Can>` and the tab gate, and every 403 is handled in both the list and the dialog.
- R5: no IP or UA in keys, URLs, toasts or live regions. The session id appears only in the DELETE path, which needs it.
- R6: text nodes only, `<bdi>`, sanitized UA, no HTML sinks.
- R7: every changed product file is in the plan's Files table.
- R9: confirm names the target, never optimistic, invalidates after.
- R10: semantic table with `scope=col`, focus return, `aria-disabled` pager, status regions, axe in e2e.
- R11: staff-only feature.

### Security / a11y blockers
None. The orchestrator copies these in from `security-review.md` and `a11y-review.md` if they exist.

### Nits (do not block)
- `user-sessions-tab.tsx:31,294`: after a revoke-all 404, the notice "This user no longer exists." is shown, and the refetched list also shows the same text in its alert. The message appears twice.
- `user-sessions-tab.test.tsx` `server()` helper: `rows.splice(rows.findIndex(...), 1)` would remove the last row if the id were not found (`-1`). This only affects the test helper.
- `users/data/errors.ts` and `users/api/queries.ts` import `isUnknownOutcome` from `@/features/apps/data/errors`. This cross-feature import is already a listed follow-up.

### Follow-ups (out of scope)
- From the plan: spec §5.4/§9 still list admin sessions as an API gap; the stale `/_authenticated/` stats reason; a Members column from `member_count`; move `isUnknownOutcome` to `src/lib`; the credentials pager uses `disabled`; the `test-fixtures.tsx` default grant now includes `admin:*`.
- The `solo:` file `work/org-admin-api-requests-2026-11-17.md` on this branch is outside PAN-017 scope. Decide whether it ships in this PR or separately.
