## Attempt 1 — 2026-11-19
Verdict: PASS

### Checks (run by reviewer)
- pnpm typecheck: clean (`tsc -b`, exit 0).
- pnpm lint: clean (`eslint .`, exit 0).
- pnpm format:check: "All matched files use Prettier code style!" (exit 0).
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`), two runs back to back: run 1 `Test Files 116 passed (116)`, `Tests 980 passed (980)`; run 2 the same. These match impl-log.
- pnpm build: `✓ built in 803ms` (exit 0).
- pnpm e2e: `30 passed (1.3m)`.

### Acceptance criteria
- [x] AC-1: success toasts fire from hook-level options and survive an unmount.
  - Evidence: all 13 hooks take a trailing `options` (`src/lib/mutation-success.ts`). It is called inside the hook-level `onSuccess` after the invalidations. The two hooks that await a refetch keep the await before the callback: `organizations/api/queries.ts` `useOrganizationMutationOptions` and `users/api/queries.ts` `useSetUserStatusMutation`.
  - All 13 dialogs pass the toast through the hook option. No `toast.success` is left in any per-call `mutate(…, { onSuccess })`, and `grep toast src/features/*/api/` finds nothing new.
  - Callers that pass no options (`app-form-dialog`, `entitlement-form-dialog`, `organizations-action-dialog`) are unchanged, so there is no double toast.
  - Per-call callbacks are kept as they were: `onDone`, `onOpenChange(false)`, `onDeleted`, `setTyped('')`, `inFlight` reset and `onError`.
  - The four unmount tests pass (app-status, organizations-status, role-delete, user-sessions-tab). `toHaveBeenCalledTimes(1)` was added to 3 happy paths.
  - Reviewer red check: I reverted `app-status-dialog.tsx` and `apps/api/queries.ts` to origin/main. The result was `× unmount mid-request: the success toast still fires exactly once` with "expected vi.fn() to be called with arguments: ['App calechip disabled.']". I then restored both files.
  - Ordering is covered by the hook unit tests. `users/api/queries.test.tsx` "useRevokeAssignmentMutation options.onSuccess runs after the invalidations, not on error" asserts that the callback comes last. `apps/api/queries.test.tsx` checks the data/vars and that the callback does not run on 409.
- [x] AC-2: the reports host closes to `null` explicitly, and a double close is tested.
  - Evidence: `reports-dialogs.tsx` `closeWithRow` calls `setOpen(null)` and `scheduleClear()`. The create dialog's `onOpenChange` sets null on close only.
  - Reviewer red check: against the origin/main `reports-dialogs.tsx`, the new test `reports-dialogs.test.tsx` fails (`Tests 1 failed`). It passes after restoring.
- [x] AC-3: the 600 ms settle waits are replaced with condition-based waits, and the negatives still mean something.
  - Evidence: `grep -n "settle\|600"` on both table test files finds no settle helper and no 600. The only hit is the unrelated word "settled" in a test name at orgs:517.
  - The negatives are bounded by a fake-timer debounce window (`throughDebounce`, `try/finally` with `useRealTimers`). After that window, each test sends a real sentinel request and checks exact request counts.
  - Reviewer mutation checks on `organizations-table.test.tsx`, each reverted afterwards:
    - `useDebouncedValue(draft, 0)`: the "several keystrokes" test fails.
    - `toSearchTerm` without `.trim()`: the "trimmed q" and "whitespace-only" tests fail.
    - Both results match impl-log.
- [x] AC-4: toast text is unchanged, no PII was added, and the checks are green twice.
  - Evidence: I diffed the removed and added string literals in the dialog diff. Every toast template is byte-identical.
  - Join-request and session toasts: the ternary was split into one constant per branch, and the literals are the same. `approve` is `decision === 'approve'`, so the behaviour is identical.
  - No new toast content was added.

### Issues
None.

### Rules R1–R11
No violations found.
- R1/R2: no new HTTP calls, and the API layer holds no UI copy (the option type is type-only, in `src/lib/`).
- R7: every changed file is in the plan; the backlog and ticket edits are state bookkeeping only.
- R9: still never optimistic, and invalidation still runs before the toast.

### Security / a11y blockers
None. The orchestrator is producing `a11y-review.md` separately (it appeared as untracked during this review; it was not written by the reviewer).

### Nits (do not block)
- `src/features/users/components/role-assign-dialog.tsx:144-148`:
  - The toast now reads `role` from the latest render and is guarded by `role && …`. Before, it used the `role` narrowed at click time. If `roles.data` ever lost that role while the request was pending, the success toast would be dropped silently.
  - This is unreachable in practice, because the roles query is not invalidated by assignment writes.
  - A more robust option is to resolve the role from `vars.body.role_id`, or to pass `role` through the vars.
- The reports red run fails by timeout (15 s, the poll inside `expect.element`) rather than by a fast assertion. It is still a valid red.

### Follow-ups (out of scope)
- These are as listed in impl-log:
  - The users-status toast carries a full email (R5 spirit).
  - Errors after unmount are silent.
  - There are no unmount tests for the `mutateAsync` flows.
  - The 600 ms waits in `app-status-dialog.test.tsx` and `reports-table.test.tsx:191` remain.
  - The apps search trims twice, which masks single-layer trim regressions.
