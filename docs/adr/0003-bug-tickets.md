# ADR 0003: Bug tickets (`BUG-XXX`) and the `/bug` command

Status: Accepted pending owner merge

## Context
Bugs had no home in the workflow: they arrived as `/ticket` features or `/solo` fixes, with no repro, no root cause and
no guarantee that a test would catch them again. The sibling project TuDoCuaTui added a bug workflow (its decision D42);
admin-pan follows the same loop, so it adopts the same shape adapted to its rules (R1–R11), its test stack and its
cross-repo dependency on org-admin-api.

## Decision
- Bugs are tickets with IDs **`BUG-XXX`** (3 digits), next to `PAN-XXX`, recorded with `/bug` from
  `work/templates/bug.md`: found in / introduced in, environment, steps, expected / actual, root cause (confirmed or
  suspected, file:line, this repo or org-admin-api), severity. `/ticket` sends bug reports to `/bug`.
- Severity S1 (security, wrong target or missing confirmation on a destructive action, a core flow impossible),
  S2 (broken with a workaround, misleading UI, an AA failure that blocks a task), S3 (cosmetic). Priority: S1 → P1,
  S2 → P1 or P2, S3 → P3. S1 rows go above the first `BACKLOG` row and `/run` picks a runnable S1 bug first.
- `/bug` investigates read-only first and dedupes against open `BUG` tickets. A cause in org-admin-api is never worked
  around in the UI (R1): the bug depends on an org-admin-api ticket instead.
- Records are committed on a batch branch `bug/<first ID>` (or the session's mandated branch). Then `/bug` asks the
  owner: **A** open a record PR into `main` and stop; **B** record another bug on the same branch and ask again;
  **C** fix the whole batch now through the `/run` loop on that branch and open one PR. Agents never merge.
- Bugs run through the normal `/run` loop (no extra gate). Every fix ships with a **regression test that fails before
  the fix**: the planner names it first, the implementer writes it first and records the failing run in impl-log.md,
  the reviewer gives REWORK without that evidence. Test level: Vitest browser mode (real Chromium, so CSS, focus and
  browser APIs are testable); `scripts/smoke-image.sh` for nginx headers, CSP and caching; Playwright e2e for
  multi-page flows once PAN-023 adds `pnpm e2e` — until then a route-level browser test, or, only when neither can
  reproduce it, a one-off Playwright check outside the repo recorded in impl-log.md and re-run by the reviewer.

## Alternatives
Fix bugs with `/solo` (no repro, no review, no regression test); file them as `PAN-XXX` (bugs and features mix on the
board and `/status` cannot list open bugs); GitHub issues (the board would live in two places).

## Consequences
The board holds two ID series. A bug recorded with option A is invisible to `/run` on `main` until the owner merges
the record PR. Bugs whose cause is in org-admin-api wait on that repo like any other API dependency.
