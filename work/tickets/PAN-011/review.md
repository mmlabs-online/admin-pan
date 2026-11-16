## Attempt 1 — 2026-11-16
Verdict: PASS

### Checks (run by reviewer)
Run on branch `claude/great-edison-3g2y0h` @ 8433d8b, diff against `origin/main`.
- pnpm typecheck: `tsc -b` exit 0, no errors
- pnpm lint: `eslint .` exit 0, no errors or warnings
- pnpm format:check: "All matched files use Prettier code style!" (exit 0)
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): Test Files 58 passed (58), Tests 389 passed (389). This matches impl-log. It passed on 2 of 3 full runs. One full run failed 1 test: `roles.test.tsx › Roles page › deletes a role only after confirmation`, at line 86, with "element was detached from the DOM" while clicking the alert dialog's Delete button. I then ran `src/features/roles` alone 3 times (10/10 each time) and the full suite 2 more times (389/389 each time). The failing click targets the confirmation dialog, which this diff does not change. I count this as a pre-existing timing flake, not a regression (see Follow-ups).
- pnpm build: `tsc -b && vite build` exit 0 ("built in 915ms")
- pnpm e2e: not planned

### Acceptance criteria
- [x] **AC1: each route and action declares its permission (same as the API endpoint).**
  - `ROUTE_PERMISSIONS` is checked with `satisfies Record<AuthenticatedRouteId, Requirement>` (`src/lib/permissions/registry.ts:51-87`), so every `_authenticated` route must be declared or typecheck fails. Typecheck is green.
  - `ApiOperation` is typed against `keyof paths` (`registry.ts:24-25`).
  - `registry.test.ts`:
    - "ADMIN_PERMISSIONS equals the set of x-permission values in openapi.json" passes.
    - "every permission requirement matches the x-permission of each operation it names" passes.
  - I listed the snapshot's 24 `x-permission` operations myself. Every ACTIONS and ROUTE entry matches them.
  - I cross-checked the snapshot against org-admin-api origin/main 35c8825: `organizations/router.py`, `rbac/router.py` and `users/router.py` agree.
  - Every nav link references `ROUTE_PERMISSIONS` (`src/components/layout/data/sidebar-data.ts`). `nav-filter.test.ts › every nav link uses the requirement of its route` passes.
  - Every control in the plan's Action inventory is wrapped in `<Can>` with the planned mode (hide or disable). I checked each feature file in the diff.
- [x] **AC2: hide/disable logic, production `unknown`, 403 handling.**
  - **Logic tested against a fake source:**
    - `can.test.tsx`
    - `nav-filter.test.ts`
    - `route-permission-guard.test.tsx`
    - `search-provider.test.tsx › hides denied nav items in the command menu`
    - per-feature denied tests in organizations, users, apps, roles and reports
  - **Production is `unknown`:**
    - The context default and the provider default are both `unknownPermissionSource` (`src/context/permission-provider.tsx:16-27`).
    - `src/routes/_authenticated/route.tsx` mounts `<PermissionProvider>` with no `source` prop.
    - `can.test.tsx › with no provider (production default) every control renders` passes, and so does the `source.test.ts` production-default test.
  - **403 copy is chosen by `code`:**
    - `src/lib/forbidden.ts:22-63` covers the four codes, which match org-admin-api `app/core/errors.py:58-78`, plus a default.
    - The server `message` is never used. `required` is shown only if it matches `ADMIN_PERMISSION_PATTERN`.
    - `forbidden.test.ts` passes, as does `handle-server-error.test.ts › 403 toasts the code-specific copy, not the server message`.
  - **Never signs out, never retries:** `forbidden-panel.test.tsx › a 403 never calls the unauthorized handler and is fetched once` passes. It goes through the real `createApiClient` and `shouldRetryQuery`.
  - **Error is checked before data:**
    - `src/lib/query-view.ts:17-24` checks `error` first.
    - `query-view.test.ts › error wins over stale data` passes.
    - `forbidden-panel.test.tsx › data then a 403 on refetch replaces the data with the panel` passes.
- [x] **AC3: tests for allowed and denied cases.**
  - granted, denied and unknown cases in `can.test.tsx`, `route-permission-guard.test.tsx`, `nav-filter.test.ts` and `source.test.ts`
  - feature tests:
    - organizations: denied and granted
    - apps: denied and granted
    - roles: denied and granted
    - users: denied only; the unknown cases are covered by the existing tests (see Nits)
    - reports: pending under deny-all

### Issues
None blocking.

### Rules R1–R11
No violations found.
- **R1:** no permission data is faked. Production is `unknown`, and `fakePermissionSource` lives only in `src/test-utils/`.
- **R2:** no HTTP outside `src/api/`. Tests inject `fetch` into `createApiClient`.
- **R3:** no token reads, no claims and no storage. Grep of the changed files: no `localStorage`, `sessionStorage` or `console.`. The provider sits inside `AuthGate`.
- **R4:** declarations are in place and 403s are handled.
- **R5:** nothing is logged.
- **R6:** all copy is React text, and `required` is checked against the pattern before it is shown.
- **R9:** confirmations are unchanged and nothing is optimistic.
- **R10:** the disabled reason is visible and linked through `aria-describedby`; the panel uses a labelled section and `role='alert'`.

**Scope:** every changed `src/` and `docs/` file is in the plan's file list. The `work/` changes are workflow files: backlog, consult notes, PAN-011b ticket, org-admin-api request, plan and impl-log. The earlier `solo:` commit is outside this review.

### Security / a11y blockers
None reported to the reviewer. The orchestrator copies these in from `security-review.md` / `a11y-review.md`.

### Nits (do not block)
- `src/features/users/components/users-table.test.tsx`: the new test covers only the denied case. The plan said "Denied and granted cases". A `granted={['admin:users:read','admin:users:write']}` case would complete the set.
- `src/features/organizations/components/data-table-row-actions.tsx` and `users/.../data-table-row-actions.tsx`: the separator now sits inside the second `<Can>`. If only the second action were granted, the menu would start with a stray separator. This cannot happen with today's keys: both org actions use `organizations:write`, and a users menu with `write` but without `read` is unlikely.
- `src/components/permissions/route-permission-guard.tsx:21`: `routeId in ROUTE_PERMISSIONS` also matches inherited keys. `Object.hasOwn` would be stricter. It cannot be reached with real route ids.
- `src/components/forbidden-panel.test.tsx`: the last test resets the handler to a no-op rather than restoring the previous one, and does no cleanup if an assertion fails first.
- Disabled admin-only switches repeat "Requires admin:roles:manage" on every permission row (already a follow-up in impl-log).

### Follow-ups (out of scope)
- Flaky test `src/features/roles/roles.test.tsx:86` ("deletes a role only after confirmation"): the alert dialog button is detached during the click, 1 failure in about 6 runs. Stabilise it, e.g. wait for the dialog to settle before clicking.
- PAN-011b: real `PermissionSource`. org-admin-api: `GET /api/v1/me/permissions` (request in `org-admin-api-request.md`).
- PAN-013..016: render queries through `queryView` + `ForbiddenPanel`, and remove the remaining stale `admin:… (planned name)` comments.
- PAN-016: refresh `openapi.json` with `admin:audit:read` and switch audit-log from pending.
- Spec §5.1: add a note that navigation is unfiltered until PAN-011b (owner or product-manager).
