Status: READY

# Plan — PAN-031: Success toasts in mutation hooks; dialog-host and test robustness

## Spec summary
This ticket adds no new user-facing behaviour. It hardens existing screens (spec §5.2–§5.5) against rules in `CLAUDE.md`:
- R9: "Destructive or access-changing actions (delete, suspend, disable user, revoke role/session) need an explicit confirmation naming the target, show the API error on failure, and are never optimistic. After success, invalidate the affected queries."
- R8: "No PASS without green checks … every screen has tests for its main states."
- R5: "Never put tokens, passwords or full emails in logs, analytics, error reports or URLs."

Ticket goal: "Make success feedback and tests robust against dialogs unmounting mid-request, and remove remaining timing hacks (BUG-002 follow-ups)."

## Acceptance criteria → verification
| # | Criterion (ticket) | How the reviewer verifies it |
|---|---|---|
| 1 | Success toasts for destructive/access-changing mutations fire from hook-level mutation options (or an equivalent that runs after unmount), not only per-call `mutate(…, { onSuccess })`; a test unmounts the dialog mid-request and still sees the toast. | (a) `grep -n "toast.success" ` over the 13 dialogs in the inventory (Approach step 3): each `toast.success` sits in the `options.onSuccess` passed to the hook, and none sits inside a `mutate(…, { onSuccess })` object. (b) The four new tests below, one per family (apps, organizations, roles, users), each gate the write → `screen.unmount()` → release → `toast.success` called **exactly once** with the byte-identical text. (c) impl-log shows each of the four tests **failing on the unchanged code** (run before the fix, output pasted), then passing. (d) `toHaveBeenCalledTimes(1)` in the existing happy-path tests of the 13 dialogs (where they already assert the text) proves there is no double toast. |
| 2 | The reports host's `closeWithRow` sets `open` to `null` explicitly instead of toggling with `setOpen(type)`; a test covers a double close. | `reports-dialogs.tsx` calls `setOpen(null)` in `closeWithRow` and in the create dialog's `onOpenChange`. New test `reports-dialogs.test.tsx` › "a double close of edit/delete/create leaves every dialog closed and the row is still cleared". impl-log shows it failing on the current code (the second close reopens). |
| 3 | The hard 600 ms `settle` waits in `apps-table.test.tsx` and `organizations-table.test.tsx` are replaced with condition-based waits (`expect.poll` / `expect.element`), keeping negative assertions meaningful. | `grep -n "settle\|600" src/features/apps/components/apps-table.test.tsx src/features/organizations/components/organizations-table.test.tsx` returns nothing. Each former negative is either bounded by a positive sentinel request with exact counts, or by fake timers scoped to the typing step (Approach step 6). impl-log records the mutation proofs: with `toSearchTerm` changed to stop trimming, the two whitespace tests fail; with the debounce bypassed (`useDebouncedValue(draft, 0)`), the orgs "several keystrokes" test fails. Revert each mutation afterwards. |
| 4 | No toast text changes; no PII added to toasts (R5). All checks pass (R8), and the full suite passes twice in a row. | `git diff` shows no change to any toast string literal (moved lines are byte-identical). The existing assertions on toast text pass unchanged. `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` are green. `pnpm test` is run a second time right after, also green; both outputs are summarised in impl-log. |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/lib/mutation-success.ts` (new) | Add `export type MutationSuccessOptions<TData, TVars> = { onSuccess?: (data: TData, vars: TVars) => void }`, one type with a short doc comment. | Gives the 13 hooks one shared parameter type (AC-1) and keeps the API layer free of UI copy. |
| `src/features/apps/api/queries.ts` | `useMutationOptions` gains an optional `extra?: MutationSuccessOptions` param and calls `extra?.onSuccess?.(data, vars)` after the invalidations. Add a trailing optional `options` param to `useUpdateAppMutation`, `useUpdatePermissionMutation` (through `useAppPermissionMutationOptions`), `useRevokeCredentialMutation` and `useDecideJoinRequestMutation` (composed after its own invalidations). | AC-1, rows 1–4 and 8. |
| `src/features/organizations/api/queries.ts` | `useOrganizationMutationOptions` gains `extra`. Add a trailing `options` to `useUpdateOrganizationMutation` and `useDeleteOrganizationMutation`. Keep awaiting the refetch promise, then call `extra.onSuccess`. | AC-1, rows 5 and 6. |
| `src/features/organizations/api/entitlements.ts` | `useEntitlementMutationOptions` gains `extra`. Add a trailing `options` to `useUpdateEntitlementMutation` only. | AC-1, row 7. |
| `src/features/roles/api/queries.ts` | `useRoleMutationOptions` gains `extra`. Add a trailing `options` to `useDeleteRoleMutation` only. | AC-1, row 9. |
| `src/features/users/api/queries.ts` | Add a trailing `options` to `useSetUserStatusMutation` (await `refetchUsers` as today, then the callback), `useRevokeUserSessionMutation` and `useRevokeAllUserSessionsMutation` (through `useSessionRevokeOptions`), and `useAssignRoleMutation` and `useRevokeAssignmentMutation` (through `useAssignmentMutationOptions`; preserve `useRevokeAssignmentMutation`'s own `onError` override). | AC-1, rows 10–13. |
| `src/features/apps/components/app-credential-revoke-dialog.tsx` | Move `toast.success` into the hook's `options.onSuccess`; the per-call callbacks keep everything else. | Row 1. |
| `src/features/apps/components/app-join-request-decision-dialog.tsx` | Same. | Row 2. |
| `src/features/apps/components/app-permission-admin-dialog.tsx` | Same. | Row 3. |
| `src/features/apps/components/app-status-dialog.tsx` | Same. | Row 4. |
| `src/features/organizations/components/organizations-delete-dialog.tsx` | Same. | Row 5. |
| `src/features/organizations/components/organizations-status-dialog.tsx` | Same. | Row 6. |
| `src/features/organizations/components/entitlement-enabled-dialog.tsx` | Same. | Row 7. |
| `src/features/roles/components/role-default-dialog.tsx` | Same (via `useUpdateAppMutation(api, { onSuccess })`). | Row 8. |
| `src/features/roles/components/role-delete-dialog.tsx` | Same. | Row 9. |
| `src/features/users/components/users-status-dialog.tsx` | Same. The text stays as it is (see Assumptions on the email). | Row 10. |
| `src/features/users/components/role-assign-dialog.tsx` | Same. The `// No email in the toast (R5).` comment moves with the toast. | Row 11. |
| `src/features/users/components/role-assignment-revoke-dialog.tsx` | Same. | Row 12. |
| `src/features/users/components/user-session-revoke-dialog.tsx` | Pass `{ onSuccess: () => toast.success('Session revoked.') }` to `useRevokeUserSessionMutation` and `{ onSuccess: () => toast.success('All sessions revoked.') }` to `useRevokeAllUserSessionsMutation`. Remove the toast from the shared per-call `options` object. | Row 13. |
| `src/features/reports/components/reports-dialogs.tsx` | `closeWithRow` calls `setOpen(null)` then `scheduleClear()`. The create dialog uses `onOpenChange={(next) => { if (!next) setOpen(null) }}` or the equivalent explicit null (no toggle). | AC-2. |
| `src/features/reports/components/reports-dialogs.test.tsx` (new) | Double-close test (see Tests). | AC-2. |
| `src/features/apps/components/apps-table.test.tsx` | Remove `settle` and its three uses (277, 284, 363), replacing them per Approach step 6. Import `SEARCH_DEBOUNCE_MS` if timers are faked. | AC-3. |
| `src/features/organizations/components/organizations-table.test.tsx` | Remove `settle` and its three uses (205, 225, 340), replacing them per Approach step 6. | AC-3. |
| `src/features/apps/components/app-status-dialog.test.tsx` | Add the apps unmount test. Add `toHaveBeenCalledTimes(1)` next to the existing text assertion at :56. | AC-1. |
| `src/features/organizations/components/organizations-status-dialog.test.tsx` | Add the organizations unmount test (suspend). Add `toHaveBeenCalledTimes(1)` next to the existing text assertion. | AC-1. |
| `src/features/roles/components/role-delete-dialog.test.tsx` | Add the roles unmount test. Add `toHaveBeenCalledTimes(1)` next to the existing text assertion at :58. | AC-1. |
| `src/features/users/components/user-sessions-tab.test.tsx` | Add the users unmount test (revoke one session; its toast has no PII). | AC-1. |
| `src/features/apps/api/queries.test.tsx` | Add a hook unit test: `useUpdateAppMutation(api, { onSuccess })` calls the callback once with `(data, vars)` after a 200, and does not call it on a 409. | R8: the new hook-level logic needs a unit test. |
| `src/features/users/api/queries.test.tsx` | Add a hook unit test for `useRevokeAssignmentMutation(api, { onSuccess })`: the callback runs after success with vars, the existing invalidations still run, and the callback does not run on error. | R8. It covers the factory with vars and the `onError` override. |

Do not touch any other file. If one turns out to be needed (for example a test-fixture tweak to gate a write), record why in impl-log.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `app-status-dialog.test.tsx` › "unmount mid-request: the success toast still fires exactly once" | AC-1 (apps). Gate the PATCH in `appsServer` (`await gate`). Open the dialog for calechip and click Disable. `await expect.poll(() => writes(seen,'PATCH')).toHaveLength(1)`, then `await screen.unmount()` and `release()`. `await expect.poll(() => vi.mocked(toast.success)).toHaveBeenCalledWith('App calechip disabled.')`, then `expect(toast.success).toHaveBeenCalledTimes(1)`. Must fail on the current code. |
| `organizations-status-dialog.test.tsx` › "unmount mid-request: the success toast still fires exactly once" | AC-1 (organizations). Same pattern with `orgsServer`/`renderOrganizations`: suspend Acme Corp, expecting the existing text `Organization "Acme Corp" suspended.` |
| `role-delete-dialog.test.tsx` › "unmount mid-request: the success toast still fires exactly once" | AC-1 (roles). Same pattern with `rolesServer`/`renderRoles` and a gated DELETE, expecting `Role stoktok:operator deleted.` |
| `user-sessions-tab.test.tsx` › "unmount mid-request: 'Session revoked.' still fires exactly once" | AC-1 (users). The in-memory sessions server gates the DELETE. Render `UserSessionsTab`, revoke one session, unmount, release, then expect `Session revoked.` exactly once. |
| `apps/api/queries.test.tsx` › "useUpdateAppMutation options.onSuccess runs once after success with data and vars, not on error" | R8 unit test for the new option. |
| `users/api/queries.test.tsx` › "useRevokeAssignmentMutation options.onSuccess runs after the invalidations, not on error" | R8 unit test, factory path. |
| `reports-dialogs.test.tsx` › "a double close of edit/delete/create leaves every dialog closed and the row is still cleared" | AC-2. Render `ReportsProvider` with `ReportsDialogs` and a small harness that uses `useReports()` to set `currentRow`/`open` and prints `open` and the current row id. Use `vi.mock('./reports-action-dialog')` and `vi.mock('./reports-delete-dialog')` with stubs that render a "close twice" button calling `props.onOpenChange(false)` twice synchronously. For each of edit, delete and create: open, click "close twice", then assert the harness shows `open` = none and the stub reports `open=false`. For edit/delete, also `expect.poll` (timeout ≥ 1500 ms) that the row is cleared. Must fail on the current code (the second call toggles back). |
| `apps-table.test.tsx` › existing "search sends trimmed q after one debounce; whitespace sends none" (rewritten) | AC-3 (277, 284). |
| `apps-table.test.tsx` › existing "URL round-trip and back/forward; every control resets the page" (rewritten) | AC-3 (363). |
| `organizations-table.test.tsx` › existing "search sends trimmed q after the debounce; several keystrokes send one request…" (rewritten) | AC-3 (205). |
| `organizations-table.test.tsx` › existing "whitespace-only search sends no q and no extra request" (rewritten) | AC-3 (225). |
| `organizations-table.test.tsx` › existing "URL round-trip: … does not write the old draft back" (rewritten) | AC-3 (340). |

## Approach
1. **Red first (AC-1, AC-2).** Write the four unmount tests and the reports double-close test before changing product code. Run them and paste the failures into impl-log: on the current code the toast is never called after unmount, and the second close reopens the dialog.
2. **Shared type.** Create `src/lib/mutation-success.ts` with `MutationSuccessOptions<TData, TVars>`. It is a type only: no runtime code and no `toast` import in `src/features/*/api/`.
3. **Hooks (13).** Each hook in the inventory (consult table rows 1–13) takes a trailing optional `options?: MutationSuccessOptions<TData, TVars>` after `api`, and composes it inside the hook-level `onSuccess`, **after** the existing invalidations:
   - Where the factory currently returns the invalidation promise, the mutation awaits it before the per-call callbacks run: `useOrganizationMutationOptions` (`onSuccess: refetch`) and `useSetUserStatusMutation` (`onSuccess: refetchUsers`). There, keep that ordering: `onSuccess: async (d, v) => { await refetch(); extra?.onSuccess?.(d, v) }`.
   - Where invalidation is `void`, call the callback after the `void` calls.
   - Leave `meta.handlesOwnErrors`, `retry` and every `onError` untouched.
   - Do not put `toast` or UI copy in any hook body, especially not in the shared `useUpdateAppMutation`, `useUpdateOrganizationMutation` and `useUpdateEntitlementMutation`, which the edit forms also use through `mutateAsync` with their own toasts.
   - Hooks outside the inventory (create/rename/permissions/grant/issue) do not get the param.
4. **Dialogs (13).** In each dialog, pass `{ onSuccess: () => toast.success(<same template literal>) }` to the hook call and delete the `toast.success` line from the per-call `mutate(…, { onSuccess })`.
   - Keep the per-call `onDone`, `onOpenChange(false)`, `onDeleted`, `inFlight` reset and `onError` exactly as they are.
   - The text is copied verbatim. It reads dialog-only data (`currentRow`, `credential`, `role`, `org`, `app`) from the render closure, which TanStack v5 keeps on the mutation (`MutationObserver.setOptions` updates the in-flight mutation's options on every render). That data is stable while pending, because close is blocked.
   - Rows 2 and 13 pass constant-text callbacks (row 13: one per hook).
   - Ordering note: hook-level callbacks now run before per-call ones, so the toast fires before `onDone`/`onOpenChange(false)`. No test depends on the old order. Run the suite to confirm.
5. **Reports host (AC-2).** In `reports-dialogs.tsx`, `closeWithRow` calls `setOpen(null)` and `scheduleClear()`. The create dialog's `onOpenChange` sets null on close and never toggles. `useDialogState` stays unchanged: its toggle maps `null` to `null`. The apps, organizations and roles hosts already use `setOpen(null)` (confirmed by the orchestrator), so they need no change.
6. **Settle waits (AC-3).** Delete `const settle` in both files. No unnamed `600` may remain.
   - **Pure negatives (whitespace sends no `q`: apps:277, orgs:225).** A positive sentinel cannot bound these: a following search input restarts the debounce, so the whitespace draft would never be committed and the negative becomes vacuous. A select/sort click does not cancel the pending debounce either. So use **fake timers scoped to the typing step**:
     1. `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` (precedent `src/hooks/use-delayed-row-clear.test.tsx:17`).
     2. Type/fill `'   '`.
     3. `await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)` (import from `@/lib/list-search`).
     4. `vi.useRealTimers()` in a `try/finally`, so a failure never leaves timers faked for later tests.
     5. Fire a **positive sentinel** with real timers: apps, fill `'  stok  '` (already in the test); orgs, choose status "Suspended" or click the Name sort. Poll for the sentinel's request.
     6. Assert exact results. Apps: the `q` values are exactly `['stok']` and there are exactly 2 list calls. Orgs: no list call has `q` and there are exactly 2 list calls (initial and sentinel). The search JSON has no `"q"`.

     If `userEvent.type` hangs under faked `setTimeout`, use `userEvent.fill`, which is a single input event and is fine for whitespace. Record the choice in impl-log.
   - **Single-request positives (apps:284, orgs:205).** The exact-equality poll (`toEqual(['stok'])` / `['glob']`) already fails on any intermediate request. Replace the trailing settle-and-count with a sentinel: click a sort header, poll until the last list call carries that sort, then assert the exact ordered list of `q` values, e.g. orgs `['glob', 'glob']` with the second carrying the sort, and the exact total of list calls. Keep the existing status-text assertion and run it before the sentinel.
   - **Back/forward (apps:363, orgs:340).** Drop the settle. Barrier: `expect.element(search).toHaveTextContent('{}')` plus `expect.poll(() => param(last(seen), 'q')).toBeNull()`. Then fire a sentinel (sort click), poll for it, and assert that no list call after the back step carries `q`. For orgs, also assert the exact count, `count + (0|1) + 1`, replacing the `≤ count + 1` bound with a check made after the sentinel.
   - **Mutation proofs (record in impl-log, then revert).**
     - (a) `toSearchTerm` returns `value` untrimmed: both whitespace tests fail.
     - (b) `useDebouncedValue(draft, 0)` in `list-search-input.tsx`: orgs:205 fails.
     - (c) For the back tests, a mutation that writes the stale draft back, e.g. not resetting `committed.current`/`dirty.current` in the `[value]` effect. If no realistic mutation makes them fail beyond the existing `toHaveValue('')` check, say so in impl-log; do not invent one.
7. **Checks.** Run `pnpm typecheck`, `pnpm lint`, `pnpm format`/`format:check`, `pnpm test` (twice in a row) and `pnpm build`. In a cloud sandbox, set `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.

Rules:
- R1/R2: no new HTTP and no API-layer copy. The hooks stay in `src/features/*/api` on the one client.
- R5: no toast text changes and no new PII.
- R7: only listed files change.
- R8: unit tests for the hook option, screen-level tests for unmount, double close and search.
- R9: still never optimistic, invalidation still runs first, and errors still render inline.
- R10: unchanged (no markup changes).

## Specialist input used
From `consult-frontend-developer.md`:
- **Adopted:**
  - The 13-row inventory, as the exact AC-1 scope.
  - Option B: an optional trailing `options` param, composed after the invalidations, not baked into shared hooks.
  - Move only `toast.success`.
  - Factory threading.
  - The `mutateAsync` sites are out of scope (they already survive unmount).
  - The gated-request unmount test pattern.
  - The `setOpen(null)` fix for both `closeWithRow` and create.
  - The settle inventory and `SEARCH_DEBOUNCE_MS`.
- **Adapted:**
  - Rows 2 and 13 pass constant-text callbacks from the dialog through the same option, so no hook imports `toast`.
  - AC-3 uses fake timers only for the two pure-whitespace negatives, because a real-timer sentinel cannot bound a restarted debounce. Every other wait is a sentinel or a poll, and no named debounce-length sleep remains.
  - The consult's "one named sleep" fallback is rejected.
- **Rejected:**
  - Option A (`label` in variables): it puts UI copy in the vars and the API layer. Use it only if an unmount test shows non-deterministic text.
  - Converting `app-status-dialog.test.tsx:175` and `reports-table.test.tsx:191` (600 ms waits outside AC-3): moved to follow-ups (R7).
- **Open questions:**
  - Q1 (A or B): resolved, B.
  - Q2 (errors after unmount): not changed. Unreachable in practice, because close is blocked while pending. Follow-up.
  - Q3 (`mutateAsync` unmount tests): follow-up.
  - Q4 (sleep or fake timers): fake timers, scoped.
  - Q5 (other hosts): already `setOpen(null)`, no change.

## Assumptions
- Orchestrator decisions adopted:
  - Option B.
  - At least one unmount test per family that fails on the current code.
  - No change to `mutateAsync` flows.
  - No change to error handling after unmount.
  - The reports host uses explicit null.
  - Settle waits are replaced as in Approach step 6.
  - Users-status toast text is unchanged.
  - The full suite runs green twice in a row.
- TanStack Query `^5.99` runs hook-level `onSuccess` after an observer unmounts and syncs observer options onto the in-flight mutation. The four unmount tests verify this. If one shows stale or missing text, switch that hook to option A and record why.
- `screen.unmount()` from `vitest-browser-react` leaves the test-owned QueryClient alive (it is already used at `app-status-dialog.test.tsx:135`).
- Rough diff size is about 350–450 lines, mostly tests. It is one coherent change and needs no split.
- Follow-ups to record in impl-log (not in this diff):
  1. The users-status toast `Disabled/Enabled ${email}` carries a full email (R5 spirit; pinned by `users-status-dialog.test.tsx:123,242`).
  2. Errors after unmount are silent because `handlesOwnErrors` is set and the per-call `onError` is dropped. This is unreachable while close is blocked during pending.
  3. Unmount tests for the access-changing `mutateAsync` flows (role-permissions save, entitlement grant/edit).
  4. Convert the 600 ms waits at `app-status-dialog.test.tsx:175` and `reports-table.test.tsx:191` to fake timers.

## Blocking questions
None

## Split proposal
None

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/apps`, `/apps/$key` | unchanged (admin:apps:write, admin:roles:manage, admin:roles:assign) | unchanged; happy now toasts even if the dialog unmounts | disable/enable app, revoke credential, set permission admin-only, approve/reject join request → same mutations | unchanged |
| `/organizations`, org sheet | unchanged (admin:organizations:write, admin:entitlements:write) | unchanged | suspend/reactivate/delete org, enable/disable entitlement | unchanged |
| `/roles` | unchanged (admin:roles:manage, admin:apps:write) | unchanged | delete role, set default role | unchanged |
| `/users`, user detail | unchanged (admin:users:write, admin:roles:assign, admin:*) | unchanged | disable/enable user, grant/revoke role, revoke session(s) | unchanged |
| `/reports` | unchanged (mock) | unchanged; a double close no longer reopens a dialog | — (mock) | — |

## API calls used
None. There are no new or changed endpoints, and the same hooks call the same endpoints.
