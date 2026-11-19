# PAN-031: Success toasts in mutation hooks; dialog-host and test robustness

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P2 |
| Areas | ui |
| Attempts | 0 |
| Created | 2026-11-18 |
| PR | — |

## Goal
Make success feedback and tests robust against dialogs unmounting mid-request, and remove remaining timing hacks (BUG-002 follow-ups).

## Spec reference
CLAUDE.md R8, R9 (no new behaviour for users; existing screens §5.2–§5.5).

## Depends on
BUG-002 (DONE). No org-admin-api changes.

## Acceptance criteria
- [ ] Success toasts for destructive/access-changing mutations fire from hook-level mutation options (or an equivalent that runs after unmount), not only per-call `mutate(…, { onSuccess })`; a test unmounts the dialog mid-request and still sees the toast.
- [ ] The reports host's `closeWithRow` sets `open` to `null` explicitly instead of toggling with `setOpen(type)`; a test covers a double close.
- [ ] The hard 600 ms `settle` waits in `apps-table.test.tsx` and `organizations-table.test.tsx` are replaced with condition-based waits (`expect.poll` / `expect.element`), keeping negative assertions meaningful.
- [ ] No toast text changes; no PII added to toasts (R5). All checks pass (R8), and the full suite passes twice in a row.

## Notes / answers from owner
- 2026-11-18 (owner): "merge rồi gom follow-up thành ticket làm luôn".
