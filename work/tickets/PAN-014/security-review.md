# PAN-014 security review

## Attempt 1

Scope: `git diff origin/main...HEAD` (40 files): `src/features/organizations/**`, `src/components/confirm-dialog.tsx`, `users-status-dialog.tsx`, regenerated `src/api/openapi.json` + `schema.d.ts`, audit-log enums, e2e fake API. No `.env*` read; pnpm checks not run (R8 is the reviewer's).

**Verdict: no blockers. Two 🟡 should-fix items, four 💭 notes.**

### Checked and sound
- **R2:** all org calls go through the injected `ApiClient` (`api.GET/POST/PATCH/DELETE` + `unwrap`); no `fetch` in feature code; bodies typed from generated `OrganizationCreate`/`OrganizationUpdate`; `Organization` = generated `OrganizationRead`.
- **Mass assignment:** create sends `slug, name, description`; edit sends `name, description`; status sends `{status}`.
- **R4:** registry maps create/update/delete to `admin:organizations:write`, route to `admin:organizations:read`, matching `x-permission` for all 5 ops; `<Can>` wraps actions; 403 → page `ForbiddenPanel` on list, inline in dialogs; `forbiddenCopy` never shows server text.
- **R9:** typed-slug delete re-checked in `handleDelete` (`organizations-delete-dialog.tsx:29`); dialogs name the target; non-optimistic; Escape/Cancel/confirm blocked while pending; `invalidateQueries(['organizations'])` on success and on 404/409; `org_has_assignments` has its own message.
- **R6:** all API strings rendered as text; no HTML sinks or data `href`; server text capped at 200 chars.
- **R5:** URL search is only `page`/`pageSize`; nothing logged.
- **ConfirmDialog** (`confirm-dialog.tsx:54-104`): `aria-disabled` + `preventDefault`; Radix respects `defaultPrevented`; `onOpenChange` blocks Escape. Other consumers (sign-out, users-status, role-delete, role-assignments, app-permissions, app-status, reports-delete) do not combine `form=` with `isLoading`, so none loses its guard.
- **Snapshot:** adds `/apps/{key}/credentials` and `app_credential.*` enums; schema and labels only.

### Findings
1. 🟡 **Create/edit can double-submit** — `organizations-action-dialog.tsx:626`, `:723-728`. The submit button is no longer `disabled`; the only guard is `if (pending) return` using the render-time `isPending`, while RHF validates asynchronously. Two fast Enter/clicks can send two POSTs (second → misleading "slug already exists" after a real success) or two PATCHes. Fix: a synchronous `useRef` in-flight guard (or check `form.formState.isSubmitting` / `mutation.isPending` in the button `onClick` with `preventDefault`); add a test that fires submit twice and expects one POST.
2. 🟡 **ConfirmDialog pending guard depends on each form consumer** — `confirm-dialog.tsx:85-104`. With `form=`, Enter in a child input still submits while pending (the `onClick` `preventDefault` only covers clicks). The org delete dialog is safe (re-checks `mutation.isPending`, `organizations-delete-dialog.tsx:29`); future consumers relying on `isLoading` alone would double-send. Fix: document the contract on the `form` prop, or block centrally (`inert`/`aria-busy` on the children wrapper while `isLoading`); add a ConfirmDialog test (Enter in a child input while `isLoading` → no submit).
3. 💭 Fallback shows the server message verbatim (truncated) — `organizations/data/errors.ts:20`. Safe as text, no PII today; consider fixed per-status copy with the code.
4. 💭 422 field text is Pydantic `msg` (`errors.ts:150-153`), no input echo; never render `d.input`.
5. 💭 Status/delete act on the list-row snapshot (`organizations-provider.tsx:16`); PATCH is idempotent and refetch fixes the view. Fine.
6. 💭 Typed-slug check uses `.trim()` (`organizations-delete-dialog.tsx:26`); slugs cannot contain whitespace, so no loosening.

### Follow-ups (out of scope)
- Lint/test that every `ConfirmDialog` with `form=` guards its own submit (or centralise, finding 2).
- org-admin-api: `If-Match`/version on `PATCH /organizations/{org_id}` to avoid lost updates.
- PAN-027 (credentials UI): the issued `mmak_` secret must be shown once only — never in cache persistence, URLs, toasts or logs.
