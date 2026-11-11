---
description: Run the full consult → plan → implement → review loop for one ticket, dispatching subagents automatically, then open a PR.
argument-hint: "[PAN-xxx]"
---

<!-- Orchestration logic adapted from agency-agents: specialized/agents-orchestrator.md and strategy/coordination/handoff-templates.md (MIT),
     following the same loop as mmlabs-online/stoktok and mmlabs-online/org-admin-api. The orchestrator is this command running in the main session, because subagents cannot dispatch subagents. -->

You are the **orchestrator** for ticket `$ARGUMENTS`. You dispatch subagents and keep the board true. You write **no product code, no plan, no review** yourself — only ticket state, backlog rows, consult files, security/a11y review files and the escalation report.

## 0. Select and prepare
1. If `$ARGUMENTS` is empty, pick from `work/backlog.md` the first `BACKLOG` (or answered `BLOCKED`) ticket, by priority (P1 > P2 > P3) and then by its order in the table, **whose dependencies are all met** (see 2). Skip tickets with unmet dependencies and say which ones you skipped and why. If none, report "Nothing ready in BACKLOG" and stop.
2. Dependencies (from "Depends on" in ticket.md and the "Order of work" line in backlog.md):
   - `PAN-xxx` → must be `DONE` here.
   - `org-admin-api <ID>` → read `work/backlog.md` of `mmlabs-online/org-admin-api` on `main` (GitHub MCP `get_file_contents`, or a shallow clone). Met only if that ticket is `DONE` and its PR is merged. If you cannot reach the repo, treat it as unmet and say so.
3. Read `work/tickets/<ID>/ticket.md`. Refuse to run if state is `DONE` or `ESCALATED` (say why). A `BLOCKED` ticket may run only if its blocking questions now have answers under "Notes / answers from owner".
4. Make sure the working tree is clean (`git status --porcelain`). If not, stop and report.
5. Branch: create or switch to `ticket/<ID>` from the latest `main` (`git fetch origin main` first). If the environment mandates a different working branch (e.g. a cloud session's designated branch), use that branch and say so in the report. The **base** for diffs is `origin/main`; if `main` does not exist yet, use the branch's first commit and say so.
6. If `package.json` exists, run `pnpm install --frozen-lockfile` so checks can run.
7. Set state `PLANNING` in ticket.md and backlog.md.

## 1. Consult (only for the ticket's `areas`)
| Area | Subagent |
|---|---|
| architecture | `software-architect` |
| ui | `frontend-developer` |
| ux | `ux-architect` |
| api | `api-platform-engineer` |
| auth | `identity-access-engineer` |
| security | `appsec-engineer` (consult mode) |

Dispatch the matching specialists **in parallel** (one message, several Agent calls), each with: the ticket path, "consult mode, read-only, return Findings / Recommendations / Risks / Open questions". Save each reply verbatim to `work/tickets/<ID>/consult-<agent>.md`. Skip if `areas` has none of the above.

## 2. Plan (= technical design)
Dispatch `planner` with the ticket path. When it returns, read `plan.md`:
- `Status: BLOCKED` → set state `BLOCKED`, commit `work/` (`<ID>: plan blocked`), push the branch (no PR), and **stop**: show the owner the blocking questions.
- `Status: READY` → set state `IN_PROGRESS`, commit `work/` (`<ID>: plan`), continue. No human approval gate.

## 3. Implement
Dispatch `implementer` with: ticket path, "implement plan.md; attempt N". Verify impl-log.md has a new attempt section; if not, treat it as a failed attempt.

## 4. Review
Set state `REVIEW`. Then dispatch **in parallel** (one message):
1. `reviewer` with the ticket path, base and attempt number.
2. `appsec-engineer` (review mode) if `areas` contains `security` or `auth`, **or** the diff (`git diff --name-only <base>...HEAD`) touches any of: `src/api/`, `src/auth/`, `**/auth*`, `**/permission*`, `.env.example`, `vite.config.*`, `index.html`, `package.json`, `pnpm-lock.yaml`, `Dockerfile`, `nginx*`, `.github/`. Append its reply to `security-review.md` under `## Attempt N`.
3. `accessibility-auditor` if `areas` contains `ui`, `ux` or `a11y`, **or** the diff adds/changes `*.tsx` under `src/features/` or `src/components/`. Append its reply to `a11y-review.md` under `## Attempt N`.

Then read the latest section of `review.md`. The verdict line is `Verdict: PASS` or `Verdict: REWORK`. A 🔴 finding in `security-review.md` or `a11y-review.md` turns a PASS into REWORK: append it to the review attempt under "Security / a11y blockers".

## 5. Loop decision
- **PASS** → set state `DONE`, update the backlog row (state, attempts, updated date), commit `work/` (`<ID>: done`). Go to 6.
- **REWORK** and reworks so far < 2 → increment `Attempts` in ticket.md, set state `REWORK`, dispatch `implementer` with "REWORK attempt N: fix only the issues in the latest review.md / security-review.md / a11y-review.md section", then return to step 4.
- **REWORK** and reworks so far = 2 → set state `ESCALATED`, write `work/tickets/<ID>/escalation.md` from `work/templates/escalation.md`, commit, push the branch (no PR), and **stop**.

## 6. Open the pull request (DONE only)
1. Push: `git push -u origin <branch>`.
2. Open a PR into `main` (GitHub MCP `create_pull_request`). If one is already open for this branch, update it instead.
   - Title: `<ID>: <ticket title>`.
   - Body (English, short): **Summary** (2–4 bullets) · **Screens** (routes added/changed) · **Acceptance criteria** (each ticked with one line of evidence from review.md) · **Checks** (`typecheck` / `lint` / `test` / `build` results from the review) · **API dependencies** (org-admin-api tickets/endpoints used, and any API follow-ups) · **Needs owner's decision** (spec divergences, planner assumptions, or "none") · **Follow-ups** · links to plan.md, review.md, security-review.md, a11y-review.md.
3. Write the PR URL into ticket.md (`| PR | <url> |`), commit `<ID>: link PR`, push.
4. **Never approve, merge or enable auto-merge.** The owner reviews and merges.

## 7. Report to the owner
Short summary in Vietnamese: ticket, final state, attempts, files changed (`git diff --stat <base>...HEAD`), check results, follow-ups (separate the ones that need an org-admin-api ticket), and the next step (PR link to merge, or the escalation / blocking questions).

## Guardrails
- Pass each subagent only what it needs (paths, attempt number, the exact instruction). Don't paste whole files into prompts.
- Never edit `plan.md`, `impl-log.md`, `review.md` to change an outcome.
- Never edit `mmlabs-online/org-admin-api` from this loop; API gaps become follow-ups.
- If a subagent fails or returns nothing twice in a row, set `ESCALATED` with the reason and stop.
