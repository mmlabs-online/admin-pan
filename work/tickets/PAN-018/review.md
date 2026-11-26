# Review — PAN-018

## Attempt 1 — 2026-11-26
Verdict: PASS

Base `origin/main` (5724172), branch `claude/zealous-turing-4o04h1`, head `cde8e34`.

### Checks (run by reviewer)
- pnpm typecheck: pass (`tsc -b`, no output)
- pnpm lint: pass (`eslint .`, no output)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): Test Files 120 passed (120); Tests 995 passed (995). Matches impl-log.
- pnpm build: "built in 1.01s"
- pnpm e2e (if planned): not planned

### OpenAPI snapshot verification
I regenerated the spec from org-admin-api f632a25 into the scratchpad (the clone was left unmodified, `git status` clean) and deep-compared it with `src/api/openapi.json`:
- `paths['/api/v1/organizations/{org_id}/members'].get` and `…/invitations'].get` are identical. Only `get` is present. `x-permission` is `admin:users:read` / `admin:organizations:read`.
- `OrgMemberRead`, `OrgInvitationRead`, `InvitationStatus`, `Page_OrgMemberRead_` and `Page_OrgInvitationRead_` are identical. The existing refs `UserStatus` and `ErrorEnvelope` are identical too.
- The existing `ErrorBody` differs, as impl-log records. It was not touched by this diff.
- `git diff --numstat origin/main...HEAD -- src/api`: openapi.json 626/0, schema.d.ts 304/0. The diff is insertions only.

### Acceptance criteria
- [x] Members list with role and joined date — evidence: `organization-members-tab.tsx:98-131` (user, app, role name + key, Granted `<time dateTime=created_at>`, Expires, Not expired/Expired). Test `organization-members-tab.test.tsx` › "rows: table labelled 'Role assignments in {name}' …" passes. It asserts the headers and scope=col, Ada on two rows, "No display name", the Disabled badge, the `<time datetime>` and Never/Expired. "Joined date" is shown as the grant date (plan A1, documented in the intro text; the API has no join date).
- [x] Invitations list with status — evidence: `organization-invitations-tab.tsx:150-190`. Tests in `organization-invitations-tab.test.tsx` pass: "rows: status text Pending / Accepted / Revoked / Expired …", "status filter …" (All sends no `status` and resets offset to 0; Expired sends `status=expired`) and the lazy-fetch test (default `status=pending`).
- [x] States tested — evidence: both tab test files cover the lazy fetch, loading, empty (including the per-status empty text), error + Retry recovering to rows, 404 with no Retry, 403 inline ForbiddenPanel and pagination (`offset=20`, aria-disabled at the edges). `organization-detail-sheet.test.tsx` covers per-tab permission gating (no `…/members` request without `admin:users:read`) and 403 isolation between the tabs. `api/members.test.ts` covers key nesting and request shape. `data/members.test.ts` has a guard that the status options still match the API enum. All pass.

### Issues
None.

### Scope
Every changed source file is listed in the plan's Files table. The other changed files are workflow files (`work/backlog.md`, ticket state, consult notes, plan, impl-log). No new dependencies.

### Rules R1–R11
No violations found.
- R1: the UI shows only API fields. Nothing is derived (no grouping, no N+1 lookups).
- R2: requests go through `getApi()`/`ApiClient` in `api/members.ts`, with types from `paths`/`components`. `limit` is 20.
- R4: registry entries match the router's `_route(...)` permissions (`router.py:180`, `:206`). Each tab handles its own 403.
- R5: query keys and URLs carry only the org id. Emails appear only as table text.
- R6: text and `<bdi>` only. No HTML sinks.
- R8: green, with state tests.
- R9: not applicable (read-only).
- R10: labelled tables, `th scope=col`, status shown as text, a labelled Select and `role=status`/`role=alert`.

### Security / a11y blockers
None. Areas are `api, ui`, so the orchestrator may still run the accessibility auditor. No security trigger: the diff touches no auth, client core, config, deps, Docker/nginx or CI.

### Nits (do not block)
- `organization-members-tab.tsx:120-124`: the Expires cell is plain text, while Granted uses `<time dateTime>`. Wrapping it in `<time>` would make them consistent.
- `organization-invitations-tab.tsx` and `organization-members-tab.tsx`: the "step back after the page empties" block is duplicated. It could live in `OffsetPager` or a small hook when pagers are consolidated (follow-up).
- `ticket.md` `Attempts` is still 0. The orchestrator updates it.

### Follow-ups (out of scope)
- Correct spec §5.3 and the ticket's `Depends on` from USR-06 to USR-23 (owner/orchestrator).
- Full `openapi.json` refresh to org-admin-api main, including the `ErrorBody.code` description drift and the new `admin:bug-reports:*`/`admin:usage:*` permissions, with a registry update.
- admin-pan tickets: revoke invitation (`DELETE …/invitations/{invitation_id}`, R9), invite member, remove member.
- org-admin-api: display names for `invited_by`/`accepted_by`/`granted_by`; a documented sort order for members; an org-join date if "joined" is wanted literally.
- Optional `app`/`active` filters on the Members tab.
- Extract one shared offset pager for users sessions, role holders, join requests and the org tabs.
