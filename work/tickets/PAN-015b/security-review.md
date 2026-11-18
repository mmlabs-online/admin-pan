# PAN-015b: security review

## Attempt 1

Commit 3433e3b.

**Verdict: no blockers.** R4, R5, R6 and R9, and the full-replace PUT hazard, are handled correctly for the reviewed scope. There are two 💭 notes and two follow-ups below, and no 🔴 or 🟡 findings. The `pnpm` checks were not run here; R8 is the reviewer's to confirm.

### What was checked and found correct
- **R4 permission mirror** (`src/lib/permissions/registry.ts:68-73, 159-176`)
  - Every entry matches the regenerated `src/api/openapi.json`:
    - role-definitions GET (list and detail) → `admin:apps:read`
    - POST, PATCH, DELETE roles and the PUT on permissions → `admin:roles:manage`
    - `PATCH /apps/{key}` → `admin:apps:write`
  - `roles.create` correctly declares both POST and PUT.
  - The UI never relies on hidden controls:
    - Rename, Set as default and Delete are wrapped in `<Can>`.
    - The Permissions dialog is read-only without `roles.setPermissions`.
    - Delete and Set as default are disabled using only the API's own row flags (`is_system`, `is_default`, `org_owner_role_id`), labelled as advisory.
    - Every API 403 is still mapped by `fallback` → `forbiddenCopy`, which has dedicated copy for `admin_wildcard_required` (`src/lib/forbidden.ts:42-46`).
    - That copy is shown inline in create, rename, permissions, delete and default. A page-level `ForbiddenPanel` covers the apps-list and role-list reads.
- **R9 safe mutations**
  - Global mutations use `retry: false` (`src/lib/query-client.ts:47`). Create and PUT also set it explicitly.
  - Every dialog has an `inFlight` ref guard against double submit, and closing is blocked while a request is pending.
  - Nothing is optimistic: the Default badge and the rows change only after invalidation.
  - Confirmations name the target:
    - delete: `Delete role {key}?` plus the name and the app
    - default: the role and the app
    - permission removal: a confirm phase that lists the removed keys
  - The two-step create (`role-create-dialog.tsx:118-167`) keeps the created role in `createdRef`. After a failed PUT it only offers the PUT again (idempotent) and never re-POSTs. A POST with an unknown outcome is not retried automatically; a manual resubmit gets a 409 on the same key, so there is no duplicate.
  - Invalidation:
    - On success: `['apps','detail',app,'roles']`, plus `['me','permissions']` for the `admin` app only (`queries.ts:117-123`).
    - On 404/409/unknown outcome: the role list again.
    - Setting the default goes through `useUpdateAppMutation`, which invalidates `['apps']`; the role keys are nested under it, so the roles list refreshes too.
- **Full-replace PUT**
  - `appAllPermissionsQueryOptions` pages with `limit=100` until it reaches `total` (capped at 50 pages, then it errors instead of returning partial data).
  - Save is `aria-disabled` until the role detail has been fetched fresh (not the placeholder) and every permissions page has loaded.
  - The picker keeps any key the role holds that is missing from the app's permission list (`role-permission-picker.tsx:36-37, 91-102`).
  - The `admin:*` lock never traps a key the role already holds (line 127).
  - Removals are diffed against the latest detail, so a concurrent addition that would be dropped shows up in the confirm list.
- **R6 (no XSS sinks)**
  - There is no `dangerouslySetInnerHTML`, `innerHTML` or data-driven `href` in `src/features/roles`.
  - Role names and keys, permission keys and server messages are all rendered as React text.
  - Server text is cut to 200 characters (`errors.ts:21`, `apps/data/errors.ts:39,66`).
  - `forbiddenCopy` ignores the server message and only accepts a `required` value that matches the permission pattern.
- **R5 (no secrets or PII in URLs, logs or storage)**
  - URL state is only `{app, page, pageSize}`; role ids never go in the URL.
  - Toasts contain only role keys and app names.
  - There is no `console.*` and no storage use.
  - The `?app=` value goes into the path through openapi-fetch's `encodeURIComponent` (`openapi-fetch@0.17.0` `index.mjs:472`), so path traversal is blocked. The client's origin check (`src/api/client.ts:55`) also stays in place.
- **No mock code calling the network**
  - The `apps` mock store, mock data and old schema are deleted, and the new guard test enforces this.
  - `test-data.ts` and the e2e `fake-api.ts` are static fixtures.
  - The e2e test asserts there are zero writes, and `noStrayRequests` covers the new role-definition routes.

### Findings
- 💭 **`src/features/roles/components/roles-dialogs.tsx:16-17`**: `focusOpener` puts the API-supplied role key straight into a CSS selector (`[aria-label="Actions for ${key}"]`).
  - **Risk:** it is not an XSS vector. But a key containing `"` or `\` (for example a seeded system role that skipped API validation) would make `querySelector` throw a `SyntaxError` inside `requestAnimationFrame`. That breaks focus return and logs an uncaught error.
  - **Fix:** `` `[aria-label="Actions for ${CSS.escape(key)}"]` ``, or find the button through a `data-role-id` attribute instead.
- 💭 **`src/features/roles/components/role-permissions-dialog.tsx:89-108` (`send`) and `:231-239` (the confirm button)**
  - **Risk:** `send()` does not re-check `ready`. If the role detail refetches during the confirm phase (window focus, or an invalidation from another tab), the confirm list re-renders live. Clicking "Remove and save" then sends the user's `edit` set, measured against a base that is still in flight. In practice the live `removed` list makes this visible, and the API is the authority.
  - **Fix (hardening):** in `send`, `if (!ready) return`, and set `aria-disabled={pending || !ready || undefined}` on the confirm button.

### Follow-ups (out of scope)
1. **org-admin-api: optimistic concurrency on `PUT …/roles/{id}/permissions`.** There is no `If-Match` or version check, and `updated_at` is not bumped by a permission replace. Two admins saving at once is last-writer-wins, and that can silently remove permissions the other admin just granted. Propose bumping `updated_at` on replace and accepting an `expected_updated_at` field (or `If-Match`) that returns 409. Record this as an org-admin-api ticket; do not work around it in the UI.
2. **Delete/default disable is based on cached row flags.** If the list is stale, a valid delete can be blocked until it refetches. This is a usability issue, not a security one: the API's 409 is still handled.

### Risks
- **Fail-open UX on concurrent edits:** low risk (see follow-up 1). The UI's diff-and-confirm step reduces it but cannot remove it without API support.
- **`admin`-app writes change the signed-in user's own access straight away:** handled by the `['me','permissions']` invalidation and by the "can reduce staff access to this console" warning in the confirm phase.
