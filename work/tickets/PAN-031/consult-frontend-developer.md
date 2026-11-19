## PAN-031 consult: frontend-developer (read-only)

# PAN-031 consult (frontend-developer): success toasts, reports host, settle waits

## Findings

### Why per-call callbacks lose the toast
TanStack Query v5 (`^5.99`, package.json:47) fires `mutate(vars, { onSuccess })` callbacks only while the observer from that `useMutation` is still subscribed. Once the component unmounts, they are dropped. Callbacks passed to `useMutation({...})` or to the hook live on the Mutation and always run. The `mutateAsync` + `await` + `toast` sites are not affected, because the async function continues after unmount.

All dialogs block close while pending (`if (!next && mutation.isPending) return`). So unmount mid-request only happens when a parent removes the dialog (host clears the row, route change, tab unmount) or in a test via `screen.unmount()`.

### Inventory: per-call `mutate(…, { onSuccess })` with a success toast (the AC-1 targets)
| # | File:line (toast) | Toast text | Class (R9) | Depends on dialog-only data |
|---|---|---|---|---|
| 1 | apps/components/app-credential-revoke-dialog.tsx:32-34 | `Credential ${credential.key_id} revoked.` | DESTRUCTIVE | credential.key_id (not in vars; vars = credential.id) |
| 2 | apps/components/app-join-request-decision-dialog.tsx:36-38 | `Join request approved/rejected.` | access-changing (approve may grant the default role); reject is destructive | none; hook already knows `decision` |
| 3 | apps/components/app-permission-admin-dialog.tsx:34-40 | `${permission.key} is now admin only / available to members.` | access-changing | permission.key |
| 4 | apps/components/app-status-dialog.tsx:34-43 | `App ${key} disabled/enabled.` | DESTRUCTIVE (disable) / access-changing | key is in vars; `disabling` is derivable from `body.status` |
| 5 | organizations/components/organizations-delete-dialog.tsx:33-39 | `Organization "${name}" deleted.` | DESTRUCTIVE | name (vars hold only `id`) |
| 6 | organizations/components/organizations-status-dialog.tsx:28-40 | `Organization "${name}" suspended/reactivated.` | DESTRUCTIVE / access-changing | name |
| 7 | organizations/components/entitlement-enabled-dialog.tsx:35-39 | `${app_key} for ${org.name} disabled/enabled.` | access-changing | org.name, app_key |
| 8 | roles/components/role-default-dialog.tsx:33-41 | `${role.key} is now the default role of ${app.name}.` | access-changing | role.key, app.name |
| 9 | roles/components/role-delete-dialog.tsx:37-40 | `Role ${key} deleted.` | DESTRUCTIVE | role.key |
| 10 | users/components/users-status-dialog.tsx:32-38 | `Disabled/Enabled ${email}` | DESTRUCTIVE / access-changing | email |
| 11 | users/components/role-assign-dialog.tsx:203-208 | `Role ${role.key} granted in ${role.app}.` | access-changing | role.key (vars have `role.app` only) |
| 12 | users/components/role-assignment-revoke-dialog.tsx:67-73 | `Role ${role_key} revoked in ${app}.` | DESTRUCTIVE (access) | assignment.role_key |
| 13 | users/components/user-session-revoke-dialog.tsx:38-53 (one `options` object used by both `one.mutate` and `all.mutate`) | `Session revoked.` / `All sessions revoked.` | DESTRUCTIVE | none; it depends on the two hooks |

Notes on the table:
- The rows split into two hooks, each of which gets toast text: `useUpdateAppMutation` (rows 4 and 8), `useUpdateOrganizationMutation` (rows 6 and 5's sibling), and so on. Row 8 uses the generic `useUpdateAppMutation`, which is also used by the app edit form. A toast baked into that hook would fire in the wrong places (see risks).
- Row 10's toast contains a full email. This is an existing behaviour that arguably conflicts with R5, which forbids full emails in logs, analytics and URLs. A toast is not listed there. Test files assert the exact text, so do not change it in PAN-031. Log it as a follow-up (`users-status-dialog.test.tsx:123,242`).

### Not per-call-callback sites (already survive unmount; out of AC-1 scope)
- `mutateAsync` followed by `toast.success`: app-form-dialog.tsx:122-154, app-permission-form-dialog.tsx:84-103, entitlement-form-dialog.tsx:128-158 (grant/edit is access-changing), organizations-action-dialog.tsx:84-107, role-create-dialog.tsx:103/109-114, role-permissions-dialog.tsx:122-133 (access-changing), role-rename-dialog.tsx:77-91.
  - After an unmount, the continuation still runs and `toast` is called. Only the state setters become no-ops.
  - The role-permissions and entitlement-form cases are access-changing, so a single mid-unmount test there would lock the behaviour in cheaply. They need no code change.
- Credential issue (app-credential-issue-dialog.tsx:72) uses `mutateAsync`, deliberately has no toast, and handles the secret. Leave it alone.
- Join/revoke hooks that are already hook-level: none produce toasts today.
- Mock-phase toasts in reports-provider.tsx:84,103,111,139,156 are plain functions, not mutations. Out of scope.
- Non-mutation: audit-log-detail-sheet.tsx:34 (copy request id).

### Reports host (AC-2)
- `useDialogState.setOpen` is a toggle (use-dialog-state.tsx:14-15). `closeWithRow('edit')` at reports-dialogs.tsx:18-21 calls `setOpen('edit')`. A second close event (Radix fires `onOpenChange(false)` and the Esc/overlay path can both hit) turns `null` back into `'edit'`, which reopens the dialog.
- The create dialog has the same pattern at reports-dialogs.tsx:28 (`onOpenChange={() => setOpen('create')}`) and is also affected.
- Fix: `setOpen(null)` in `closeWithRow`, and likewise for create. `useDialogState` accepts `null` (when `prev === null` it stays `null`). Keep `scheduleClear()`.
- The same toggle-close idiom exists in apps/organizations/roles `closeWithRow` (apps-dialogs.tsx:27, organizations-dialogs.tsx:14, roles-dialogs.tsx:30). Check them, because they may have the same double-close hazard. BUG-002 may already have changed them; I did not read their bodies. Report it as a follow-up if so (R7).

## Recommendations

### AC-1: pattern (recommended: "hook accepts a success callback", option B)
1. Each destructive/access-changing hook (`useRevokeCredentialMutation`, `useDecideJoinRequestMutation`, `useUpdatePermissionMutation`, `useUpdateAppMutation`, `useDeleteOrganizationMutation`, `useUpdateOrganizationMutation`, `useUpdateEntitlementMutation`, `useDeleteRoleMutation`, `useSetUserStatusMutation`, `useAssignRoleMutation`, `useRevokeAssignmentMutation`, `useRevokeUserSessionMutation`, `useRevokeAllUserSessionsMutation`) takes an optional trailing `options?: { onSuccess?: (data, vars) => void }`.
   - Compose it inside the hook-level `onSuccess`, after the invalidations: `onSuccess: (d, v) => { invalidate…; options?.onSuccess?.(d, v) }`.
   - Because it is a hook-level `onSuccess`, it runs after unmount.
   - Keep `meta: { handlesOwnErrors: true }` and `onError` untouched.
   - The factories `useMutationOptions` (apps/api/queries.ts:225), `useSessionRevokeOptions` (users/api/queries.ts:222) and `useAssignmentMutationOptions` (:275) are the natural place to thread `options` through once.
2. The dialog moves ONLY the `toast.success(...)` into that callback, and keeps per-call `onDone` / `onOpenChange(false)` / `inFlight` reset / `onError` focus and inline-error handling in `mutate(vars, {…})`. Toast text stays byte-identical because the strings are copied verbatim.
3. Do not toast from per-call `onSuccess` anymore, so there is no double toast. Delete the per-call `toast.success` in the same edit; a unit test should assert `toHaveBeenCalledTimes(1)`.
4. Dialog-only data (names, keys, emails) is captured in the closure the dialog passes to the hook. Mutation options are snapshotted when `mutate` is called, and v5's `MutationObserver.setOptions` also syncs the in-flight mutation on re-render. Either way, after unmount the last-rendered closure is used, and `currentRow` is stable while a dialog is pending (close is blocked). To make this deterministic and not depend on that behaviour, build the text at click time: `const text = …; mutate(vars, …)` and have the hook-level callback read it from the mutation `variables` instead (see 5).
5. Variant if you prefer variables over closures (option A): add an optional `toastLabel` field to the variables, for example `{ id, body, label: 'Organization "Acme" suspended.' }`, destructure it out in `mutationFn` so it never reaches the request body, and put one `onSuccess: (_d, v) => v.label && toast.success(v.label)` in a shared helper. This is the most deterministic and is easy to test. The cost is that the API layer carries UI copy and the vars types change (and every `queries.test.tsx` `mutateAsync` call stays valid because the field is optional). Option B is smaller; choose A only if the owner wants deterministic text with no closure semantics.
6. Per-call vs hook-level ordering: in v5 hook-level callbacks run BEFORE per-call ones. So the toast fires before `onDone()`/`onOpenChange(false)` (today it is after, or before, depending on the file; row 8/9 call `onDeleted()` first). A toast has no ordering dependency with focus return; tests that read toast calls after the dialog closes are unaffected.
7. `handlesOwnErrors`: it only gates `MutationCache.onError` → `handleServerError` (query-client.ts:56-61), i.e. error toasts. Success toasts are independent, so there is no interaction. See Risks for the error-side consequence.
8. Rows 2 and 13 need no variables: row 2's text depends on `decision`, which is already a hook parameter (apps/api/queries.ts:383). Row 13 selects by `target.kind`, so each hook can toast its own constant text (`Session revoked.` / `All sessions revoked.`) as its hook-level callback with no argument from the dialog. Rows 4/5/6/7/8/9/10/11/12 take the text from dialog closures (option B) or `label` (option A).
9. Row 8 and row 4 share `useUpdateAppMutation` with the app edit form (`app-form-dialog.tsx:122` uses `mutateAsync`, same hook). Do NOT put the toast in the shared hook body; use the per-hook `options` argument so only the status/default-role dialogs toast.

### AC-1: test
Add one "unmount mid-request" test per dialog family, or one parametrised test over the thirteen rows. Pattern (uses existing helpers `fakeApi`, `renderApps`, `appsServer`, `writes` and the `toast` mock already in e.g. app-status-dialog.test.tsx:8-11):
- Gate the write: `let release!: () => void; const gate = new Promise<void>(r => (release = r))`. In the `fakeApi` handler for PATCH/DELETE: `await gate; return json(...)`.
- Open the dialog, click confirm, then `await expect.poll(() => writes(seen, 'PATCH')).toHaveLength(1)` to prove the request is in flight.
- `await screen.unmount()` (the `vitest-browser-react` render result exposes `unmount`; the QueryClient comes from `fakeApi` and is owned by the test, so it survives).
- `release()`, then `await expect.poll(() => vi.mocked(toast.success)).toHaveBeenCalledWith('App calechip disabled.')`, plus `toHaveBeenCalledTimes(1)`.
- Prove the per-call UI callback was dropped (no `onDone` crash): for a dialog with an `onDone` prop spy, assert it was not called.
- Regression value: this test fails on the current code (the per-call `onSuccess` is dropped) and passes after the change.

### AC-2
Edit reports-dialogs.tsx:18-21 so `closeWithRow` calls `setOpen(null)` then `scheduleClear()`; apply the same to line 28 for create. The test: open delete/edit, invoke the dialog's `onOpenChange(false)` twice (e.g. Escape twice, or a Cancel click while the exit animation is running), then assert no dialog is open and `useDelayedRowClear` still clears the row after the delay. On the current code the second close reopens the dialog.

### AC-3: `settle` usages and what to wait on
`SEARCH_DEBOUNCE_MS = 300` (lib/list-search.ts:5, used by list-search-input.tsx:36); a 600 ms wait is two debounces.

| Usage | What it proves | Replacement |
|---|---|---|
| apps-table.test.tsx:277 (after `type(box, '   ')`) | whitespace sends no `q` and no extra list request | Negative assertion, so there is nothing to poll for. Replace the wait with a positive barrier and keep the negatives. See below. |
| apps-table.test.tsx:284 (after the `stok` poll succeeded) | exactly one `q` request for several keystrokes | `await expect.poll(() => withParam(seen,'q').length, { interval: 50 }).toBe(1)` is only a snapshot. Use the barrier below. |
| apps-table.test.tsx:363 (after "Simulate back") | URL search resets to `{}` and the last list call has no `q` | `await expect.element(screen.getByTestId('search')).toHaveTextContent('{}')` already exists on the next line; just drop the wait and, as the positive barrier, poll `last(seen)` until `param(last(seen),'q')` is null (`expect.poll`). |
| organizations-table.test.tsx:205 | one `q` request after the debounce | same as apps:284 |
| organizations-table.test.tsx:225 | whitespace sends no `q`, no extra request (`listCalls` stays 1) | same as apps:277 |
| organizations-table.test.tsx:340 | after back: search `{}`, last call has no `q`, at most one extra list call | drop the wait; use `expect.element(... '{}')` + `expect.poll` on the count; keep `toBeLessThanOrEqual(count + 1)` as the final check after the barrier |

How to keep "nothing happened" honest (the negative assertions are the point of those tests; deleting the wait without a replacement makes them vacuous):
1. Prefer fake timers for the debounce: `vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout'] })` (precedent: use-delayed-row-clear.test.tsx:17; role-assign-dialog.test.tsx:872 fakes `Date` only). Then `await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 1)` flushes the debounce deterministically and the negative assertions run right after. Caveat: faked `setTimeout` also affects the browser-mode polling and `expect.element` retries, which use real timers in the test runner but share the page's globals only when the component code runs in the same page; here it does. Use `shouldAdvanceTime` or only fake around the typing step and restore with `vi.useRealTimers()` before polling. This is the most precise option but needs care.
2. Real-timers barrier (simpler, recommended): import `SEARCH_DEBOUNCE_MS` instead of a magic 600, then wait for a positive signal that the debounce has fired and settled, and only then assert the negative:
   - Type a second, non-whitespace value (or press a control that triggers a distinct, observable request) after the whitespace, wait for its list call via `expect.poll`, and assert the earlier whitespace did not add any: `withParam(seen,'q')` equals exactly `['stok']`, and `seen.filter(isList)` has length 2 (initial + stok). A skipped debounce would show up as an extra entry.
   - For "several keystrokes send one request", poll until `withParam(seen,'q')` has length 1, then wait one further debounce window via `await expect.poll(() => withParam(seen,'q').length, { timeout: SEARCH_DEBOUNCE_MS * 2 }).toBe(1)` is NOT sufficient (it passes immediately). Instead use `expect.poll(...)` followed by a single fixed `await sleep(SEARCH_DEBOUNCE_MS + 50)` only for the "no late extra request" check. If the owner wants zero fixed sleeps, use option 1.
3. Where the negative is "no extra request after a state change we can observe", assert it against a sentinel: e.g. for whitespace-only search, follow with a visible positive change (the `status` count text or a following valid search) and then assert `listCalls` equals the expected exact count. Any extra request from the whitespace input would have to appear before the sentinel's own request.

I recommend option 2 with `SEARCH_DEBOUNCE_MS` imported. It removes the magic 600 and the unconditional sleep for the positive cases (apps:363, orgs:340), and keeps at most one named debounce-length sleep for the two pure-negative cases. If the AC is read strictly ("no hard waits"), use option 1 for those two.

Also found, same smell, outside AC-3: apps/components/app-status-dialog.test.tsx:175 has `new Promise(r => setTimeout(r, 600))` to outlast `useDelayedRowClear`'s 500 ms timer. It is the BUG-002 regression test and is legitimately time-based. If you convert it, use fake timers like use-delayed-row-clear.test.tsx:17. Treat it as an optional follow-up (R7).

## Risks
- **Silent failure after unmount.** All thirteen hooks set `handlesOwnErrors`, which suppresses the global error toast (query-client.ts:59). If the dialog unmounts mid-request and the API fails, the per-call `onError` is dropped and nobody tells the user (R9: "show the API error on failure"). Moving success to hook-level makes success visible but leaves this asymmetry. Decide whether failures after unmount should toast generically (hook-level `onError` calling `handleServerError` only when the component is gone cannot be detected cleanly), or accept it as unreachable in practice because close is blocked while pending. Raise it as an open question; do not widen the diff.
- **Shared hooks.** Putting the toast in `useUpdateAppMutation` / `useUpdateOrganizationMutation` bodies would toast on edit-form saves too and double up with their own toasts. The `options` argument avoids this.
- **Closure semantics (option B).** `mutate`-time snapshot versus last-render closure differs in v5 details; verify in the installed 5.99 with the unmount test. If it ever disagrees, switch to option A.
- **Ordering change** (hook-level runs before per-call): fine today, but tests asserting "toast after dialog is gone" are unaffected only because they poll; re-run the full suite twice (AC-4).
- **Debounce timing flake.** Any real-timer replacement for `settle` stays timing-dependent; fake timers are the only deterministic route.
- **Reports toggle fix** touches create too; the create dialog test must still close on Cancel/X.
- **PII**: users-status toast carries the email (existing). Not changed here; do not extend this to new toasts.

## Open questions
1. Option B (callback argument to hooks) or option A (`label` in variables)? I recommend B for a smaller diff, with A as the fallback if the closure-snapshot test is not deterministic.
2. Should failures after an unmount show a generic error toast (see the first risk), or is "close is blocked while pending" enough?
3. Are the `mutateAsync` access-changing flows (role-permissions save, entitlement grant/edit) in scope for the unmount test? They need no code change, only a test.
4. For AC-3, is one named debounce-length sleep acceptable in the two pure-negative tests, or must it be zero hard waits (then fake timers)?
5. Should the `closeWithRow` toggle idiom in apps/organizations/roles hosts be audited in this ticket or recorded as a follow-up (R7)?

Files read (all absolute under /home/user/admin-pan): work/tickets/PAN-031/ticket.md, src/lib/query-client.ts, src/hooks/use-dialog-state.tsx, src/hooks/use-delayed-row-clear.ts, src/features/reports/components/reports-dialogs.tsx, reports-provider.tsx, src/features/apps/api/queries.ts, src/features/users/api/queries.ts, the thirteen dialogs listed in the inventory, apps-table.test.tsx, organizations-table.test.tsx, app-status-dialog.test.tsx. I did not read work/tickets/BUG-002/* (not requested for opening beyond the summary in the prompt), nor the apps/organizations/roles `*-dialogs.tsx` hosts' bodies.
