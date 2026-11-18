## Attempt 1 — 2026-11-18
Verdict: PASS

Reviewed commit 19b158d (branch claude/great-edison-3g2y0h) against origin/main. AC wording follows the plan's accepted corrections: AC4 says 12 h / next admin request; AC3 reads 422 reasons from `details[].reason` and adds `unknown_role` and 404.

### Checks (run by reviewer)
- pnpm typecheck: pass (`tsc -b`, no output)
- pnpm lint: pass (eslint, no findings)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): run 1 Test Files 109 passed (109), Tests 897 passed (897); run 2 identical (109 / 897). No flaky tests seen in either run. This matches impl-log.
- pnpm build: pass ("built in 1.42s")
- pnpm e2e: 30 passed (1.6m), including the new "role assignments" test (pages.e2e.ts:391)
- `git status --porcelain` empty after the mutation proofs (every mutated file restored with `git checkout --`)

### Acceptance criteria
- [x] AC1: the user is picked explicitly from `GET /users?email=` and is never auto-picked, even with one result. The role is picked, the org only when `org_mode` is not `none`, and the expiry is sent as ISO with an offset.
  - Evidence: `assign-pickers.tsx:151` (`checked={false}`, selection only through `onChange={() => onSelect(row)}`); `:75-79` (typing clears the term and the selection); `:200` (the query runs only on a submitted term). The query key is per term and there is no placeholder (`users/api/queries.ts` `userPickerQueryOptions`), so a stale term's results can't be shown.
  - Selection by id: test "selecting shows 'Selected: …' and the POST goes to that row's id" checks the path `/users/${ANN.id}/role-assignments`.
  - Org field only when `org_mode` is not `none`: `role-assign-dialog.tsx:146`.
  - Expiry: `assignments.ts:45` (`toISOString`, ends in Z), tested in `assignments.test.ts` and in "expiry: … ends in Z".
- [x] AC2: revoke asks for a confirmation naming the user, role and scope, and is never optimistic.
  - Evidence: `role-assignment-revoke-dialog.tsx:108-118` names the role name and key, the app, display name and email (in bdi) and the scope. Test "names the user, the role name and key, the app and the org name" asserts the exact sentence.
  - Single flight: `:65`.
  - Never optimistic: "revoke is never optimistic: the row stays while the DELETE is pending…" and `queries.test.tsx` "revoke writes nothing to the cache before success".
  - Privileged and admin-app grants also get a confirm phase naming user, role, app and scope (`role-assign-dialog.tsx:138,291-298`).
- [x] AC3 (as corrected): errors are mapped by code and reason.
  - `errors.ts:91-115`: 403 through `forbiddenCopy`, 409, 422 `unprocessable` by `firstReason` (`:97`), `validation_error` through `bodyFields`, and 404.
  - `revokeAssignmentError` (`:121-136`): 404 gone, 409 `last_super_admin` and `conflict`.
  - Tested in `errors.test.ts`, plus component spot checks in `role-assign-dialog.test.tsx` "RoleAssignDialog, errors".
- [x] AC4 (as corrected): the change is said to apply within 12 h, or on the next admin request, and is never called immediate.
  - Evidence: `assignments.ts:11-17`.
  - `assignments.test.ts` has the banned-words guard (`/immediate|…|15 minutes|…/`) and the single-constant test.
  - Notices are tested in `user-role-assignments.test.tsx` ("after a stoktok grant … the 12-hour note", "after an admin revoke … next-admin-request note"). The same text appears in the revoke confirm and the assign summary.
- [x] AC5: the holders sheet uses the new endpoint and has its own loading, empty, error and 403 states.
  - Endpoint: `roles/api/queries.ts` `roleHoldersQueryOptions`. State branches are at `role-holders-sheet.tsx:143-166`; 404 is handled at `:83`.
  - Tests in `role-holders-sheet.test.tsx`: the GET URL, loading, empty, error + Retry, 403, 404 + roles invalidation, paging + clamp, and the "assignments" wording.
  - Row action under `roles.viewHolders` (`roles-row-actions.tsx`), tested in `roles-table.test.tsx`.
- [x] AC6: all new component and query tests use `fakeApi`, `apiError` and `testQueryClient` (injected fetch, ADR 0005).

### Mutation proofs (run by reviewer, each restored)
| Guard broken | Result |
|---|---|
| Auto-select a single picker result (`queueMicrotask(onSelect(only))` in `PickList`) | 4 tests failed, including "one result is not auto-selected" |
| Removed `onSelect(null)` from the input `onChange` | "editing the search text after a selection clears it" failed |
| Added `placeholderData` (keep previous) to `userPickerQueryOptions` | `queries.test.tsx` "no placeholderData" failed. The component test passed (see Nit 1) |
| Removed the `rolesKeys.holdersOf(app)` invalidation | 4 tests failed (queries and holders sheet) |
| 422 mapping read `error.code` instead of `details[].reason` | "422 unprocessable reasons map to fields" failed |
| Emptied the scope in the revoke confirm text | 3 revoke-dialog tests failed |
| Holders 403 branch removed | "403 shows an inline panel" failed |
| Removed the revoke `inFlight` check | "confirm sends one DELETE even on a double click" failed |
| Removed the self check on admin rows' Revoke | "self: admin-app rows' Revoke is aria-disabled…" failed |

### Issues
None.

### Rules R1–R11
No violations found.
- R2: all HTTP calls go through the injected `ApiClient`, with generated types (`assignments.ts:3-6`) and Page limits of 10, 20 and 100.
- R4: `<Can>` wraps `roles.assign`, `roles.revoke`, `roles.viewHolders` and `roles.viewAssignments`. The picker permissions are checked separately. The self and `admin:*` guards are advisory: `unknown` fails open, and 403 is rendered in every dialog and list.
- R5: no email appears in toasts, holders keys or URLs. The test "the email only appears in the users search request" and the e2e URL assertion cover this. The picker key holds the typed email, as the plan accepted, with a 5 s `gcTime`.
- R6: user strings are rendered as text in `<bdi>`, and the U+202E / markup test passes.
- R7: one out-of-plan file, `schema.ts` (removed the unused `RoleAssignment` type). It is justified in impl-log.
- R9: confirmations name the target; mutations use `retry: false`, run once at a time and are never optimistic; queries are invalidated on success, 404, 409 and unknown outcome.

### Security / a11y blockers
None from this review. Any items from security-review.md or a11y-review.md are added by the orchestrator.

### Nits (do not block)
- 💭 `PickList` hides stale results only because the picker query has no placeholder data. The plan's §7 also asked the component to check `!isPlaceholderData`. Adding that check (`assign-pickers.tsx:59`) would make the component safe if the query options change. Today the unit test in `queries.test.tsx` pins the options.
- 💭 The "late response for an old term" test probably can't fail on its own: the `an` request is aborted when the key changes, so the late `release` never reaches the cache. The real guard is the placeholder test above.
- 💭 The org field's server error (`role-assign-dialog.tsx:510-514`) is a `role='alert'` paragraph, not linked to the org search input with `aria-describedby`.
- 💭 impl-log says 6 `assignments:` tests moved; the plan says 5. This is a counting mismatch only.

### Follow-ups (out of scope)
- Plan F1–F9 stand (AC4 wording in ticket.md and ADR 0003; OpenAPI 404/409 docs; self-assignment scope; names in `AssignmentRead`; exact-email lookup; holders revoke and filters; app-wide zone in `formatDateTime`; registry rename).

### Security / a11y blockers (added by the orchestrator)
The reviewer's PASS is turned into **REWORK** by two 🔴 findings in `a11y-review.md` (Attempt 1):
- 🔴 1: the picker's result radios select a row on the first arrow key (`assign-pickers.tsx:137-160`); appsec S1 reports the same defect.
- 🔴 2: "Grant role" is a silent no-op when no user or organization is chosen (`role-assign-dialog.tsx:217-218, 600`).

Final verdict for attempt 1: REWORK.
