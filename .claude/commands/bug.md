---
description: Record a bug as a BUG-xxx ticket (report, repro, expected/actual, root cause) for /run, then record more, open a record PR, or fix the batch now.
argument-hint: "<what is wrong> [S1|S2|S3]"
---

Record a bug from: `$ARGUMENTS` (plus any screenshot the owner attached). Workflow decision: `docs/adr/0003-bug-tickets.md`.

1. **ID**: the highest existing `BUG-xxx` in `work/tickets/` and `work/backlog.md` + 1, 3 digits (the first is `BUG-001`).
   Never reuse an ID. Search `work/tickets/BUG-*/ticket.md` first: if a bug that is not `DONE` already covers it, add the
   report to that ticket's *Notes / answers from owner* instead and go to 5 (commit) and 6 (ask).
2. **Investigate read-only** before writing (no product code changes, no commits to `src/`):
   - Find the code path (file:line). Try to reproduce it: a Vitest browser-mode test run (`pnpm test`, real Chromium —
     in a cloud sandbox set `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`), or `scripts/smoke-image.sh` for
     nginx headers / caching / CSP. A throwaway test may live outside the repo or be deleted again. Record the result in
     **Root cause** as *confirmed* (reproduced) or *suspected*.
   - **Whose bug is it?** If the cause is in org-admin-api (wrong data, status code, missing field or permission), the
     fix belongs there (R1, never fake it in the UI): still record the BUG here when the UI must change too (e.g. it
     hides the API error); otherwise record it with `Depends on: org-admin-api <ID or "ticket needed">` and tell the
     owner an org-admin-api ticket is needed. Never change org-admin-api from this repo.
   - `Found in`: the release / image tag or commit the owner named (production `admin-portal.mmlabs.online`, local dev,
     mock data), else "unknown". `Introduced in`: from `git log -S` / `git log -L` / `git blame` (the `PAN-xxx` commit)
     when you can tell, else "unknown".
3. Create `work/tickets/<ID>/ticket.md` from `work/templates/bug.md`. Every section filled or "unknown".
   - **Severity**: S1 = security (token persisted or leaked, PII in URLs/logs, XSS sink, a control that acts without
     its `admin:*` permission), a destructive or access-changing action hits the wrong target or skips its confirmation
     (R9), or a core flow is impossible (sign in, list or act on users / organizations / roles);
     S2 = a feature is broken but there is a workaround, the UI misleads (wrong state, swallowed API error or 403), or
     a WCAG 2.2 AA failure blocks a task for keyboard / screen-reader users (R10); S3 = cosmetic.
     Priority: S1 → P1, S2 → P1 or P2, S3 → P3, unless the owner said otherwise.
   - **Areas**: as for `/ticket` (`architecture`, `ui`, `ux`, `api`, `auth`, `security`, `a11y`); a bug in auth, tokens,
     the API client, config, nginx or CI includes `security` so `/run` brings in `appsec-engineer`.
   - Acceptance criteria always include the regression-test criterion from the template.
   - Do not commit screenshots; describe them. Never copy tokens, passwords, emails or other personal data from a
     screenshot, a URL or a log into the ticket (R5).
4. Add a row to `work/backlog.md` (ID, title, state `BACKLOG`, priority, areas, attempts `0`, today): S1 bugs go
   **above** the first `BACKLOG` row; others after the last ticket they depend on, else at the end of the table. Add
   the bug's dependencies to the "Order of work" line only when it has any.
5. **Commit the record on the batch branch**: `bug/<first ID of the batch>` from the latest `origin/main`
   (`git fetch origin main` first), created by the first `/bug` of a batch; later bugs of the same batch reuse it. In a
   cloud session with a mandated working branch, use that branch and say so. Commit `<ID>: record bug (<short title>)`
   with only `work/tickets/<ID>/ticket.md` and the `work/backlog.md` change, then push (`git push -u origin <branch>`).
6. Show the owner the bug (short, in Vietnamese: ID, severity, what is wrong, root cause confirmed/suspected with
   file:line, found in / introduced in, whether org-admin-api is involved) and **ask with `AskUserQuestion`** (header
   `Bug`), listing every bug recorded in this batch so far:
   - **A. Mở PR và kết thúc** — go to 7 (record PR).
   - **B. Ghi nhận thêm bug** — reply "Mô tả bug tiếp theo (kèm ảnh nếu có)" and end the turn. The owner's next message is
     the next bug: run steps 1–6 again for it on the same batch branch (no need to type `/bug` again), then ask again.
   - **C. Sửa luôn rồi mở PR** — go to 8.
   An answer that is none of these (Other): follow it if clear, else ask again.
7. **Record PR** (option A): open a PR into `main` (GitHub MCP `create_pull_request`; if one is open for the branch,
   update it). Title `<ID>: record bug — <short title>`, or `Record bugs <ID>, <ID>…` for a batch. Body (English, short),
   per bug: severity and priority, found in / introduced in, actual vs expected in one line, root cause
   (confirmed/suspected, file:line), org-admin-api involvement, link to its ticket; then "Fix: `/run <ID>` after merge".
   Write the URL into each ticket's `Record PR` field, commit `<ID>: link record PR`, push. Report the PR link in
   Vietnamese and stop.
8. **Fix now** (option C): fix every bug of the batch on the batch branch, S1 first, then in record order, one at a
   time, following `/run` steps 1–5 (consult, plan, implement, review with appsec / a11y triggers, rework ≤ 2, the bug
   rules in `/run`) with these differences:
   - Skip `/run` step 0.5 (no new `ticket/<ID>` branch): stay on the batch branch; the base for diffs stays
     `origin/main`. Still check the tree is clean and run `pnpm install --frozen-lockfile`.
   - A bug that ends `BLOCKED` (planner questions, or an unmet org-admin-api dependency) or `ESCALATED` (with its
     escalation.md) keeps that state; continue with the others.
   - Then open **one PR** into `main` (update the record PR if one is open for the branch), title `<ID>: fix <short
     title>` or `Fix bugs <ID>, <ID>…`; body as in `/run` step 6 for each `DONE` bug, plus a list of bugs left
     `BLOCKED` / `ESCALATED` and why. Write the PR URL into each `DONE` ticket's `PR` field, commit `<ID>: link PR`, push.
   - Report like `/run` step 7, for every bug of the batch.
9. **Never approve, merge or enable auto-merge.** The owner merges; until then `/run` on `main` cannot see these bugs.
