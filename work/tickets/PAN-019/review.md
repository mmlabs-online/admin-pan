# Review: PAN-019

## Attempt 1 — 2026-11-17
Verdict: REWORK

### Checks (run by reviewer)
- pnpm typecheck: pass (`tsc -b`, exit 0)
- pnpm lint: pass (`eslint .`, exit 0)
- pnpm format:check: pass ("All matched files use Prettier code style!")
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): **FLAKY**. First full run: **exit 1**, 1 failed (`entitlement-enabled-dialog.test.tsx` › "errors inline, dialog stays open …": `VitestBrowserElementError: Cannot find element with locator: page.getByRole('switch', { name: 'calechip enabled' })` at `openSwitch` :26). Second full run: 89 files / 641 tests passed. Then `vitest run src/features/organizations` 5 times: runs 3 and 4 failed (run 3: "disable confirm sends one PATCH …"; run 4: the same plus "errors inline …"), all at `entitlement-enabled-dialog.test.tsx:26`. So 3 failing runs out of 7.
- pnpm build: pass (`built in 1.48s`, exit 0)
- pnpm e2e (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): pass, 26 passed, including "organizations entitlements: …" (7.6s)
- OpenAPI snapshot: regenerated from `/home/user/org-admin-api` at c41ef57 (`uv run python -m app.cli openapi`, dummy `DATABASE_URL`) into the scratchpad. `cmp` with `src/api/openapi.json` reports **identical**. Both repos were left unmodified.

### Acceptance criteria
- [x] Entitlements per org listed and editable. Evidence:
  - list: `organization-entitlements-tab.tsx:46-52,115-209`; tests `organization-entitlements-tab.test.tsx:26,40,83,152`
  - grant: `entitlement-form-dialog.tsx:111-116`; test `entitlement-form-dialog.test.tsx:48`
  - edit (sends only changed fields, whole `limits` replaced, `{}` clears): `entitlement-form-dialog.tsx:118-126`; test `:202`
  - enable/disable: `entitlement-enabled-dialog.tsx:35-46`; tests `entitlement-enabled-dialog.test.tsx:34,51,94`
  - e2e: grant body `{app_key:'calechip', plan:'pro', limits:{seats:10}}`, one POST, then disable sends one PATCH `{enabled:false}`.
- [x] Changes confirmed and audited by the API. Evidence:
  - The enable/disable `ConfirmDialog` names the app and the org (`entitlement-enabled-dialog.tsx:30,67`). Cancel sends nothing (test `:34`, e2e).
  - Grant and edit run from their own explicit dialog. Nothing is optimistic: the switch reads query data and flips only after the refetch (test `:51`).
  - The API audits `entitlement.granted` / `entitlement.updated` in the same transaction (org-admin-api `service.py:90-98,118-127`).
  - The audit-log enums, tones and labels cover the new actions and targets (`audit-log/data/data.test.ts` › "entitlement audit entries").
- [ ] States tested. FAILED, see Issue 1. The coverage is complete: tab loading / empty / error+Retry / 403 / cap; sheet 404 / 500 / 403 / hidden tab; dialog pending, double-click, 409/404/422/403 and unknown outcome. But one of the files that covers it fails intermittently, so R8 is not green.

### Issues
#### Issue 1 — 🔴 blocker — flaky test (R8)
- **Where**: `src/features/organizations/components/entitlement-enabled-dialog.test.tsx:26` (`openSwitch`), also `:69`
- **Expected**: the tests wait for each element before they read it, and they pass on every run.
- **Actual**:
  - `openSwitch` clicks the Entitlements tab, then immediately calls `sw.element()`. Unlike `expect.element`, `.element()` is synchronous and does not retry. When the entitlements GET has not resolved yet, the switch does not exist and the call throws.
  - The reviewer saw this in 3 of 7 runs: in the "disable confirm …" test (it calls `openSwitch` at :66) and in the "errors inline …" test (:115, :124).
  - `:69` has the same race: `confirm.element()` runs right after the switch click, before the alertdialog is guaranteed to be rendered.
- **Fix instruction**:
  - In `openSwitch`, add `await expect.element(sw).toBeVisible()` before `const el = sw.element()`.
  - Before `confirm.element()` at :69, add `await expect.element(confirm).toBeVisible()`.
  - Check every other `.element()` call added in this diff the same way: `entitlement-form-dialog.test.tsx:184`, `organization-detail-sheet.test.tsx:32`, `organization-entitlements-tab.test.tsx:91,102,106`. Each one must come after an awaited `expect.element(...)` on the same locator or an ancestor. Most already do; :184 is safe only because a `fill` comes before it, so add an explicit wait there too.
  - Then run `vitest run src/features/organizations` at least 5 times in a row and record the results in impl-log.

### Rules R1–R11
No violations found.
- R1: `active` is read from the API, never recomputed (`organization-entitlements-tab.tsx:169-175`). The UI has no plan catalogue.
- R2: HTTP goes only through `api.GET/POST/PATCH` in `api/entitlements.ts` and `api/queries.ts`. Types are generated. The snapshot matches the generator byte for byte.
- R4: registry keys and actions match `x-permission` (`registry.ts`). The tab is hidden on `denied`, Grant and the switch use `Can disable`, and Edit is hidden. A 403 is shown inline everywhere.
- R6: all data renders as React text.
- R7: the out-of-plan changes are workflow files (backlog row, ticket state, PAN-028 created at planning by the orchestrator). The code diff matches the plan's file list.
- R9: non-optimistic, the confirm names the target, errors are shown inline, and the lists are invalidated after success and after 404/409/unknown outcome.
- R10: labels are present, field errors are linked (tested with `toHaveAccessibleDescription`), headers use `scope=col`, status is text, and focus returns through refs. The e2e runs axe ×4.

Business rules and error mapping checked against org-admin-api `app/modules/entitlements`:
- Grant refusals follow `service.py:64-77`: 404 `unknown_app`, and 409 `admin_app` / `app_disabled` / `org_mode_none` / `entitlement_exists`, all with `field: app_key`. They map in `entitlement-errors.ts:71-109`.
- The org 404 has no reason and maps to "This organization no longer exists".
- The client patterns match `schemas.py:9-19`: `PLAN_PATTERN`, `LIMIT_KEY_PATTERN`, `ge=0, le=2**53-1`, `max_length=32`, and `APP_KEY_RE` equals `APP_KEY_PATTERN`. The drift test covers this.
- `EntitlementUpdate` treats explicit null as no change and replaces `limits` whole. The UI never sends null and sends `{}` to clear.

### Security / a11y blockers
None. No security-review.md or a11y-review.md was produced for this attempt.

### Deviations in impl-log (judged)
- `entitlementFormSchema(mode)` factory: acceptable. It only skips the `app_key` check in edit mode, where the key is read-only, and the test at `entitlement-schema.test.ts:70` covers both modes.
- `body as EntitlementCreate` cast (`api/entitlements.ts:79,83`): acceptable.
  - openapi-typescript marks a defaulted field as required. The parameter type is `Omit<EntitlementCreate,'enabled'>`, so the cast only re-adds `enabled`, which is deliberately omitted.
  - The API accepts the omission (`enabled: StrictBool = True`), and the test asserts the exact body.
- e2e `waitForTimeout(600)` (`e2e/pages.e2e.ts:334`): **acceptable for this ticket; do not fix the race here.**
  - The `closeWithRow` 500 ms `setTimeout(() => setCurrentRow(null))` is the template pattern in three features: `organizations-dialogs.tsx:14`, `apps-dialogs.tsx:27` and `reports-dialogs.tsx:18`. The apps detail sheet (PAN-015) has shipped with it already.
  - Fixing only the org copy would be a partial, cross-cutting fix that the AC does not cover (R7). Per ADR 0003 it needs a regression test that fails first.
  - The sleep only lengthens the wait: the timer starts at close, before the `toBeHidden` assertion. It cannot cause a flake, and the comment documents why it is there.
  - Record it as a bug instead (see Follow-ups).
- Flaky `organizations-delete-dialog.test.tsx` › "confirm sends DELETE …": the impl-log calls it load flakiness. That diagnosis is wrong.
  - The test cancels and then immediately reopens the delete dialog for the same row (:76-85). The 500 ms `closeWithRow` timer from the Cancel then nulls `currentRow` and unmounts the reopened dialog. That is the "click on a detached button".
  - The race is pre-existing on main and not caused by this diff. It did not reproduce in the reviewer's 7 runs. It belongs to the same bug.

### Nits (do not block)
- `e2e/support/fake-api.ts` PATCH route: `e.active = e.enabled && o.status === 'active'` ignores the app's status. The POST route (`active: … && target.status === 'active'`) checks it. Harmless with today's seeds.
- `entitlement-errors.ts:78-82`: the doc comment says "Server text is never shown for mapped cases". A 422 does show the Pydantic `msg` (sliced to 200 chars) on the field, the same as the apps mapper. Reword the comment.
- `api/entitlements.ts:64-65`: a grant 404 `unknown_app` also invalidates the org detail. That refetch is unnecessary but harmless.

### Follow-ups (out of scope)
- **BUG** (via `/bug`): `closeWithRow` in `organizations-dialogs.tsx`, `apps-dialogs.tsx` and `reports-dialogs.tsx` clears `currentRow` 500 ms after a close.
  - Reopening any row's dialog or sheet within 500 ms unmounts it.
  - Fix: clear only if the row and dialog are unchanged, or cancel the timer on open.
  - Regression test: close and immediately reopen. Then remove `waitForTimeout(600)` from `e2e/pages.e2e.ts` and de-flake `organizations-delete-dialog.test.tsx`.
- Plan follow-ups stand: PAN-019b revoke; PAN-014b detail fields and audit link; lift the apps error helpers; spec §5.6 "(backlog)"; org Delete `text-red-500!` contrast. On org-admin-api: seed `admin:entitlements:*` into a staff role, ETag on PATCH.
