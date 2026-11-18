## BUG-002 consult: frontend-developer (read-only)

## Findings

**Root cause: confirmed.** The stale timer is real and fires on the new dialog. I read the code only and did not run anything. I did not reproduce it, but the mechanism is deterministic. Only the 500 ms race is timing-dependent.

1. **The timer is never cancelled.**
   - The four hosts are `apps-dialogs.tsx:25-28`, `organizations-dialogs.tsx:12-15`, `roles-dialogs.tsx:28-31` and `reports-dialogs.tsx:16-19`.
   - `closeWithRow` does `setOpen(null); setTimeout(() => setCurrentRow(null), 500)`. Nothing cancels it on re-open or on unmount.
   - Every host renders its row dialogs under `{currentRow && (...)}` (apps:51, orgs:25, roles:63, reports:30).
   - When the stale timer fires it clears the row of whatever dialog was opened after the close. The whole row subtree unmounts, including the open dialog and its portal.
   - The re-open is done by the row-actions menu through the provider, so it never touches the host's timer. Providers: `apps-provider.tsx:26-27`, `reports-provider.tsx:56-57`. Both keep `open` in `useDialogState` and the row in `useState`.
   - Re-opening the same row is also hit, because `setCurrentRow(sameRow)` is cleared to null just the same.

2. **Why the tests flake: a race against 500 ms.**
   - The shadcn alert dialog has a 200 ms exit animation (`alert-dialog.tsx:54`, `duration-200`, `animate-out`). Tests wait for `not.toBeInTheDocument()` after Cancel, so the dialog is gone at about 200 ms.
   - The second open, fill, click and mutation then run in the remaining time. On a fast machine the test finishes before the timer fires. On a slow one (CI, full suite) the timer fires mid-flow.
   - `app-status-dialog.test.tsx:43-48`: after Cancel the timer fires while the test is clicking `Disable`, so the click times out. This matches the report.
   - `organizations-delete-dialog.test.tsx:76-86`, `role-default-dialog.test.tsx:61-75` and `organizations-status-dialog.test.tsx` follow the same Cancel, re-open, confirm pattern.

3. **Missing toasts: confirmed.**
   - The toasts are in per-call `mutate(..., { onSuccess })`: `organizations-delete-dialog.tsx:33-41`, `role-default-dialog.tsx:33-45`, `app-status-dialog.tsx:34-50`.
   - From memory of TanStack Query v5 (not read in this repo), per-call callbacks run only while the `MutationObserver` has listeners. If the dialog unmounts mid-request they are dropped.
   - Hook-level `onSuccess` (for example the invalidations in `apps/api/queries.ts:233`) still runs. So the refetch happens but the toast does not.
   - This explains "`toast.success` never called" together with "`DELETE` was sent".

4. **The tests can pass for the wrong reason.**
   - `await expect.element(dialog).not.toBeInTheDocument()` after confirm (delete test :86, default test :75, status test :49) also passes when the stale timer unmounted the dialog. The failure then only shows up later, as the missing toast.
   - The `dialog` locator comes from `screen.getByRole('alertdialog')`. It is lazy, so it re-resolves each time.

5. **`getByRole('alertdialog')` matching a closing dialog: low risk.**
   - A Radix dialog stays in the DOM, still with that role, for about 200 ms while it animates out.
   - The tests wait for removal before re-opening, so they never see two at once. I found no evidence of this contributing. It is worth a comment only.

6. **Other contributors: none found.** The grep shows no other `setTimeout`-based row clearing in the app. Other tests use hard waits (`settle` = 600 ms in `apps-table.test.tsx:10`, `organizations-table.test.tsx:15`). That is not part of this bug.

7. **Reports host has a variant.**
   - `closeWithRow(type)` calls `setOpen(type)`, which `useDialogState` toggles (`use-dialog-state.tsx:14-15`): same value gives `null`, a different value opens it.
   - It works only because Radix calls `onOpenChange` once, with `false`. `reports-action-dialog.tsx:91` also calls `onOpenChange(false)` itself.
   - If the dialog is already closed, a second call would re-open it. This is fragile. Do not change it in this ticket (R7); add it to the follow-ups.

8. **Why the 500 ms exists.** Setting `currentRow` to null immediately would unmount the dialog before the 200 ms exit animation finishes, which cuts the animation and drops the content. The delay keeps the row alive until the animation is done. 500 ms is more than 200 ms plus margin.

## Recommendations

**Fix (AC 1, 2, 4).**
- Add one shared hook, for example `src/hooks/use-delayed-row-clear.ts`, and use it in all four hosts. Do not copy the timer logic into each host.
- Shape of the hook:
  ```ts
  useDelayedRowClear(open: unknown, clearRow: () => void, delayMs = 500) {
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    const cancel = useCallback(() => clearTimeout(timer.current), [])
    useEffect(() => { if (open !== null) cancel() }, [open, cancel]) // re-open cancels
    useEffect(() => cancel, [cancel])                                // unmount cancels
    return useCallback(() => { cancel(); timer.current = setTimeout(clearRow, delayMs) }, [cancel, clearRow, delayMs])
  }
  ```
- In each host, `closeWithRow = () => { setOpen(null); scheduleClear() }`.
- `setCurrentRow` from `useState` is stable. Do not put `setOpen` in the dependencies, because it is not stable.
- The hook cancels on `open !== null`, not on row change, so the timer is cancelled whichever row the next dialog uses.
- In roles, `closeConfirm` and `closeDeleted` can fire twice (delete success then close). The `cancel()` inside the scheduler handles that.
- Reports keeps its own `setOpen(type)` call and uses only the timer part of the hook.

**Focus (AC 3).**
- Do not touch the `restoreFor` / `focusOpener` effects (apps:31-37, roles:36-43). They depend on `open === null`, not on the row.
- Cancelling the timer when the dialog re-opens does not affect them.
- Keep the existing focus-return tests in `app-status-dialog.test.tsx:152-163`, and make sure the roles and orgs equivalents still pass.

**Regression tests (AC 1).**
- *Hook test, fast and deterministic.*
  - Use `renderHook` from `vitest-browser-react` with `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`. Do not fake rAF or the other timers.
  - No Radix is involved, so fake timers are safe here.
  - Cases: close, advance 499, rerender with `open='status'`, advance 1000: `clearRow` not called. Close alone, advance 500: called once. Close, unmount, advance: not called.
- *Host test, at least one (apps), ideally all four.*
  - Do not use fake timers with Radix, userEvent and `expect.element` polling. Playwright waits and polling plus Radix Presence animations make them brittle.
  - Use a real wait, the same pattern as the existing `settle` helper:
    1. Open the status dialog and click Cancel.
    2. Re-open it right away (menu click, or the provider through a harness button), without waiting for the exit animation to finish.
    3. `await new Promise(r => setTimeout(r, 600))`.
    4. Assert the `alertdialog` is still there, click the confirm button, then assert the PATCH was sent and `toast.success` was called.
  - On main this fails every time, because the re-open happens within a few ms of the close and the timer always fires within 600 ms.
  - The only way it could pass on main is a re-open that takes more than 500 ms, which is impractical when done programmatically.
  - Cost is about 0.6 s per file.
- To remove the false positives from finding 4 in the four flaky files, add `await expect.poll(() => vi.mocked(toast.success)).toHaveBeenCalled…` before or next to the `not.toBeInTheDocument()` check. Keep this to a minimum (R7).

**Stability check (AC 2).**
- After the fix, run each of the four files about 10 times, plus two full-suite runs, as the ticket says.
- Keep `PLAYWRIGHT_CHROMIUM_PATH` set in the cloud sandbox.

**Follow-ups, not for this diff (R7).**
- Move the success toasts out of per-call `mutate` callbacks into the hook-level `useMutation` options. They would then run even if the dialog unmounts, which also helps real users who navigate away mid-request.
- Reports `closeWithRow` calling the toggling `setOpen(type)` (finding 7).
- The hard `settle` waits in other tests.

## Risks

- **Re-open cancel and the same-tick edge.** The cancel is tied to an `open` change. If a close and a re-open of the same dialog type ever landed in one React batch, `open` would not change and the timer would stay. That cannot happen from separate user events. A stricter fallback is a render-updated `openRef` checked in the timer callback (`if (openRef.current === null) clearRow()`). Using both is cheap if you want it.
- **Row never cleared if re-open then close again.** This is safe: the second close schedules a new timer after cancelling the old one.
- **Stale row for ~500 ms after close.** This is existing behaviour and is wanted, for the exit animation.
- **Host tests with real timers are slower, not flaky.** They add about 0.6 s each and cannot flake in the "passes on main" direction.
- **Fake timers around Radix and TanStack Query in browser mode.** Anyone who extends the hook test to the full host with fake timers will probably hit hangs. Keep the fake-timer test to the hook only.

## Open questions

1. Should the hook live in `src/hooks/` (shared, with a unit test) or stay as four small local edits? I recommend the shared hook, since the ticket allows a hook and there are four copies.
2. Is one host regression test (apps) enough, or do you want all four hosts covered? AC 1 allows either "one per affected host" or "hook test plus one host test".
3. Should the toast move to hook-level mutation options now? It would make the tests robust against any future unmount, but it is outside the ticket's scope (R7). I suggest a follow-up ticket.

## Files read

- `/home/user/admin-pan/work/tickets/BUG-002/ticket.md`
- `/home/user/admin-pan/src/features/apps/components/apps-dialogs.tsx`
- `/home/user/admin-pan/src/features/organizations/components/organizations-dialogs.tsx`
- `/home/user/admin-pan/src/features/roles/components/roles-dialogs.tsx`
- `/home/user/admin-pan/src/features/reports/components/reports-dialogs.tsx`
- `/home/user/admin-pan/src/features/apps/components/apps-provider.tsx`
- `/home/user/admin-pan/src/features/reports/components/reports-provider.tsx`
- `/home/user/admin-pan/src/hooks/use-dialog-state.tsx`
- `/home/user/admin-pan/src/components/confirm-dialog.tsx`
- `/home/user/admin-pan/src/features/organizations/components/organizations-delete-dialog.tsx` and its test
- `/home/user/admin-pan/src/features/roles/components/role-default-dialog.tsx` and its test
- `/home/user/admin-pan/src/features/apps/components/app-status-dialog.tsx` and its test
- `/home/user/admin-pan/src/features/organizations/components/test-fixtures.tsx`
- `/home/user/admin-pan/vite.config.ts`

I did not read `organizations-status-dialog.test.tsx` or the roles and reports providers. The assessment for the status dialog rests on the shared host code and the same Cancel, re-open, confirm pattern.
