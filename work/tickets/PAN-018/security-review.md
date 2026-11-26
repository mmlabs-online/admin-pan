# PAN-018 — security review

## Attempt 1

## Security review: PAN-018, attempt 1 (read-only)

I found no 🔴 blocker and no 🟡 should-fix issue in this diff.

**Findings**

- 💭 Member emails (PII, R5). They show up in one place only: as text in the Members table, `src/features/organizations/components/organization-members-tab.tsx` lines 107–109 (`<bdi>{m.email}</bdi>`). They are not in query keys (`src/features/organizations/api/members.ts:20-38`, which only use org id, limit, offset and status), URLs, toasts, logs, or the sr-only live regions (those only say "N role assignments"). The diff adds no `console.*` calls. Cached member data is in memory only, and `clearOnAuthChange` (`src/lib/query-client.ts:27-34`) wipes it on every auth event, so it doesn't carry over to another account.
- 💭 XSS (R6). The diff adds no `dangerouslySetInnerHTML`, `innerHTML` or data-driven `href`. All API fields (`display_name`, `email`, `app`, `role_name`, `role_key`, invitation status) render as React text. Unknown statuses fall back to the raw string as text (`src/features/organizations/data/members.ts` lines 21–25), which is safe.
- 💭 Authorization (R4). The registry entries match the spec's `x-permission` values:
  - `organizations.viewMembers` is `admin:users:read` (`src/lib/permissions/registry.ts`, around line 114; spec `src/api/openapi.json:10504` region, diff line 625).
  - `organizations.viewInvitations` is `admin:organizations:read` (`src/api/openapi.json:10504`).
  - Both tabs are hidden only when the permission is `denied` (`organization-detail-sheet.tsx`, in the hunk at line 42). Each tab still handles the API's 403 with an inline `ForbiddenPanel` (members-tab line 62, invitations-tab line 116), so the UI does not rely on its own gating.
- 💭 Contract and data minimisation. The `OrgInvitationRead` schema has no invitee email, token or token hash (`src/api/openapi.json:2017`: "No invitee email, token, token hash or email HMAC."). The UI doesn't show bare UUIDs (`user_id`, `granted_by`, `invited_by`, `accepted_by`). Both lists use `limit=20`, under the R2 limit of 100.
- 💭 Supply chain and config. The diff doesn't touch `package.json`, `pnpm-lock.yaml`, nginx, the Dockerfile or `.github/`. The `openapi.json`/`schema.d.ts` change only adds the two endpoints and their schemas. Test fixtures use `@example.com` addresses (`src/features/organizations/components/test-data.ts:97,124`).
- `pnpm typecheck` and `pnpm lint` pass. I did not run test, build or `format:check`; the reviewer should confirm those for R8.

**Follow-ups (out of scope)**
- If revoke invitation or remove member are added later (`DELETE …/invitations/{id}`, `admin:organizations:write`), they need R9 confirmations, 409 `invitation_accepted` handling, and their own security review.
- Refreshing `openapi.json` in full to match org-admin-api main (new `admin:bug-reports:*` and `admin:usage:*` permissions) should be its own ticket with a registry update, as `plan.md` already notes.

**Summary:** No security findings: emails only appear as table text, there are no HTML sinks, permissions match the spec's `x-permission` values and 403s are handled in each tab.
