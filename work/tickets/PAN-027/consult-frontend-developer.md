PAN-027 consult (frontend, read-only). Nothing was edited. I read the ticket, app-detail-sheet.tsx, app-permissions-tab.tsx, queries.ts, errors.ts, confirm-dialog.tsx, registry.ts, the openapi credential ops, and the API's app_credentials/service.py and ADR-0016. I only grepped test-utils/api.ts and e2e/support/fake-api.ts, and did not read the permission dialogs' tests.

## Findings

1. **API shape** (src/api/openapi.json, 2937-3290; org-admin-api app_credentials/service.py:77-142)
   - `GET /apps/{key}/credentials` returns `Page<AppCredentialRead>` (limit ≤ 100, offset). Fields: `id`, `key_id`, `app`, `active`, `created_at`, `created_by`, `last_used_at`, `revoked_at`. The list never returns the secret or the hash.
   - `POST` returns 201 `AppCredentialIssued`, which is the same fields plus `credential`, the full `mmak_<key_id>_<secret>` string. `Cache-Control: no-store` is set per ADR-0016 §5. The POST has no request body.
   - `DELETE .../credentials/{credential_id}` returns 204. Revoking an already-revoked credential is a silent 204 no-op (service.py:130). An unknown credential or app gives 404.
   - Issue 409s carry `details[0].reason` ∈ `admin_app` | `app_disabled` | `credential_limit` (service.py:86-94). The limit is 2 active credentials.
   - Issue needs `admin:apps:write` plus `admin:*`. The `admin:*` check is `require_super`, and the 403 is audited as denied. The API's error code for a missing `admin:*` is probably `admin_wildcard_required`: permission-refresh.test.ts:16 already treats it that way. Verify against org-admin-api before hard-coding it.
   - Revoke needs only `admin:apps:write`.
   - The openapi `x-permission` for POST is `admin:apps:write`. The `admin:*` requirement appears only in the 409 description (openapi.json:3142), not in a machine-readable field.

2. **Where it plugs in**
   - Tabs are in app-detail-sheet.tsx:82-93 (`Overview`, `Permissions`). The permissions tab mounts only while selected (app-permissions-tab.tsx:27-28), so nothing is fetched early. Copy that pattern.
   - Permissions tab pagination uses a local `offset` plus Previous/Next (app-permissions-tab.tsx:144-170). Table has `aria-label`, `scope='col'` headers, an empty row, `role=status` loading, `role=alert` plus Retry, and `ForbiddenPanel` via `queryView`.
   - Mutation helper `useMutationOptions` (queries.ts:109-126) sets `meta.handlesOwnErrors`, invalidates the scope on success, and refetches on 404/409. Key factory `appsKeys.detail(key)` (queries.ts:35) means a key under `[...detail(key), 'credentials', {limit, offset}]` is invalidated whenever the detail is.
   - Registry (registry.ts:109-123) has `ACTIONS` entries with `perm(permission, ...operations)`. registry.test.ts checks them against the openapi `x-permission`. `Requirement` supports a single permission only, and `ADMIN_PERMISSIONS` (registry.ts:7-17) does not contain `admin:*`. The `permits` hint accepts `admin:*` as a grant of every listed key (permits.test.ts:17).
   - Focus-return and double-submit patterns are in app-permission-form-dialog.tsx: `inFlight = useRef(false)` at :56, guarded at :79-80 and reset at :101; `returnFocus()` at :121. The toggle confirm uses an effect-based refocus (app-permissions-tab.tsx:35-47) because ConfirmDialog has no close-focus hook.
   - ConfirmDialog (confirm-dialog.tsx:57-61) blocks close while `isLoading`, takes `pendingText` and an `error` node linked by `aria-describedby`, and has `destructive`.
   - errors.ts has `AppAlert`, `fallback()` for 403/404/other, a private `firstReason`, and per-dialog mappers (`appStatusError`, `permissionAdminError`). Follow that shape.
   - E2E fake (fake-api.ts:223-252) registers only GETs for apps and permissions, plus `/me/permissions` returning `admin:*`. There is no credentials route yet.

3. **Secret-holding design.** The main risk is the TanStack Query `useMutation` result. `mutation.data` sits in the MutationCache for `gcTime` (default 5 min) after the observer unmounts, and is visible to devtools. A custom `useMutation` with `gcTime: 0` also still holds it while the observer is mounted. Never put it in a query key, `setQueryData`, or `invalidateQueries` payload.

## Recommendations

**A. Files**
- `src/features/apps/components/app-credentials-tab.tsx` (list, paging, Issue and Revoke buttons).
- `app-credential-issue-dialog.tsx` (issue plus one-time reveal).
- `app-credential-revoke-dialog.tsx`, or reuse ConfirmDialog directly.
- `queries.ts` additions: `appCredentialsQueryOptions`, `useIssueCredentialMutation`, `useRevokeCredentialMutation`, and `credentials` in `appsKeys`.
- `errors.ts` additions: `credentialIssueError`, `credentialRevokeError`.
- `registry.ts` additions: `apps.issueCredential` and `apps.revokeCredential`.
- A new tab `value='credentials'` in app-detail-sheet.tsx:83-93, after Permissions, labelled "Credentials". Add a `TabsContent` and keep the content mounted only when selected.
- Extend the `getApi()` types from the generated schema: `components['schemas']['AppCredentialRead' | 'AppCredentialIssued']`. No hand-written types (R2).

**B. One-time secret handling** (R3/R5 and acceptance criterion 2)
- Do not read the secret from `mutation.data`. In the issue dialog's `onClick`, call `await issue.mutateAsync()` (or `api.POST` via a plain async wrapper). Put `credential` in a component-local `useState<string|null>` in the dialog, and immediately call `issue.reset()` so the MutationCache drops it. Preferably strip `credential` in the mutation's `mutationFn`: return `{ credential, meta }` only through a callback `onSecret(secret)` passed by the dialog, and have the cached result be the metadata alone.
- Set `gcTime: 0` on the issue mutation as a second guard.
- Never `console.log` the result. Never put it in `toast()`, the URL, `localStorage`/`sessionStorage`, a zustand store, or form-state persistence. A reviewer lint check is cheap: grep that `credential` appears only in the dialog and the mutation's wrapper.
- Do not invalidate `credentials` queries while the secret is on screen in a way that remounts the dialog. The list is a separate query, so `invalidateQueries` is safe, but keep the dialog's state in a parent that stays mounted. Better: have the dialog own the state and render the list only behind it.
- Clear on close with `useEffect(() => () => setSecret(null), [])` plus clearing in `onOpenChange(false)`. Unmounting the dialog (`{issued && <Dialog/>}`) is the strongest clear, because it drops the state with the component.
- Use a modal `Dialog`, not `AlertDialog`. Block outside-click and Escape dismissal (`onInteractOutside`/`onEscapeKeyDown` preventDefault) once the secret is shown, so closing is deliberate via a "Done" button. Optionally add a checkbox, "I have stored this value", that enables Done. Without it, closing is fine, but the copy must say the value can't be shown again.
- Display: `<code>` in a `readOnly` input or a block with `select-all`, `aria-label='New app credential'`. Do not use `aria-live` on it, because that would read the secret aloud. Announce a separate `role='status'` line instead: "Credential created. Copy it now, you will not see it again."
- Warning is a persistent visible alert, not tooltip or toast text.
- Copy: `navigator.clipboard.writeText(secret)` in a try/catch. On success set a "Copied" state (`role='status'`, resets after ~2 s) and on failure say "Copy failed, select the value and copy it manually". Clipboard needs a secure context, which the production origin has, and the e2e fake may need `context.grantPermissions(['clipboard-read','clipboard-write'])`. The text stays selectable as a fallback.
- Add `autoComplete='off'`, no `name` on the value field, and no `<form>` submission of it.
- Optional hardening: auto-clear the secret state on `visibilitychange` hidden or after a timeout. I would skip it, since losing the secret on a tab switch costs the user more than it protects.

**C. Issue flow and states**
- Step 1: an "Issue credential" button opens a confirm-style dialog ("Issue a new credential for `<app key>`? It grants deploy-time write access to this app's catalog. The value is shown once."), then step 2 reveals the secret. A confirm step is not required by R9, since issuing is not destructive, but ADR-0016 calls it a long-lived external secret and the extra click is cheap. If you want fewer dialogs, make a single dialog with an "Issue" button and show the secret in place. State this in the plan.
- Guard with `inFlight = useRef(false)` as in app-permission-form-dialog.tsx:56-101 to prevent a double POST, which would issue two secrets and burn the limit of 2. Also disable the button on `isPending`. Show `pendingText='Issuing…'`.
- If the response arrives after the dialog was closed during pending, ConfirmDialog already blocks closing while `isLoading` (:59). Keep that behaviour, so the secret is never orphaned.
- Errors, inline in the dialog via an `AppAlert` mapper:
  - 403: `forbidden` copy. If the code is `admin_wildcard_required`, say "Issuing needs the full admin permission (admin:*)" (confirm the code first).
  - 409 `admin_app`: "The admin app has no credentials."
  - 409 `app_disabled`: "This app is disabled. Enable it first."
  - 409 `credential_limit`: "At most 2 active credentials. Revoke one first."
  - 404: "This app no longer exists."
  - Default: `fallback`.
  - Export a `firstReason`-based mapper from errors.ts (the helper is currently module-private, which is fine since the mappers live there).
- On a 409 or 404, the existing `useMutationOptions` refetches the app and credentials queries.

**D. List table** (acceptance criterion 1)
- Columns: Key ID (`font-mono`), Status (Active/Revoked badge; `revoked_at` as a time), Created, Last used ("Never" when null), Actions (Revoke).
- Reuse `formatDate`. Add `last_used_at` as `<time dateTime>`.
- Page size 20 (the API default) or the same 50 constant. Copy the Previous/Next block with a new `CREDENTIALS_PAGE_SIZE`.
- Also clamp the offset when a page comes back empty after a revoke or filter (there is an existing test "clamps to page 1 when the page comes back empty" in apps-table.test.tsx). The permissions tab does not clamp, so the credentials tab should.
- Row sort: the API order is not documented. Do not sort client-side beyond what the page returns.
- Revoked rows show no Revoke button (or a disabled one with a visible "Revoked" status). Do not rely on colour alone for the status (R10).
- Note the list includes revoked credentials, so the "2 active" limit is not `total`. Show "N active of 2" computed from the current page only if total ≤ page size, otherwise omit the count. Do not invent it from a partial page.

**E. Revoke** (acceptance criterion 3, R9)
- Use ConfirmDialog with `destructive`, title "Revoke credential", desc naming the key id and app: "Revoke credential `<key_id>` of `<app key>`? Anything deploying with it will stop working immediately. This can't be undone." Use `confirmText='Revoke'`, `pendingText='Revoking…'`, and an `error` node.
- Never optimistic. Call `useRevokeCredentialMutation` (DELETE), then invalidate `credentials` (the whole scope, not just the current page) on success. A 204 has no body; check that `unwrap` handles an empty body, as the other DELETEs (roles) presumably do.
- Focus return: the row disappears or changes after revoke, so focus the tab's Issue button or the table (`tabIndex=-1`), not the removed row. Use the `useEffect` + ref approach at app-permissions-tab.tsx:35-47.
- A 404 means it is already gone: show "This credential no longer exists." and refetch. A repeat revoke is a 204, so no special case.
- Inflight guard as in C.

**F. Permissions (R4)**
- Add two actions to `ACTIONS`: `apps.issueCredential` (`perm('admin:apps:write', 'POST /api/v1/apps/{key}/credentials')`) and `apps.revokeCredential` (`perm('admin:apps:write', 'DELETE /api/v1/apps/{key}/credentials/{credential_id}')`). registry.test.ts will confirm the `x-permission` match. The tab's list read uses `apps.view`, which would need `GET /api/v1/apps/{key}/credentials` added to its operations, or a separate `apps.listCredentials` entry. The latter is cleaner.
- `admin:*` for issue cannot be expressed by `Requirement` today. Options: (a) leave the button enabled with `admin:apps:write` and let the API's 403 show inline (R4 explicitly allows this: the UI hint is advisory); (b) add an optional `alsoRequires` to `Requirement` plus a registry-test exception. I recommend (a) for this ticket, plus a hint line "Issuing needs admin:*", and a follow-up for (b). Do not widen `ADMIN_PERMISSIONS` casually, because registry.test.ts and the permission-pattern tests depend on it.
- Use `<Can action=... disable>` as in app-permissions-tab.tsx:83-96.

**G. Admin app and disabled app**
- Admin app (`ADMIN_APP_KEY`): the API refuses issuing (409 `admin_app`) and listing presumably returns an empty page. Do not show the tab's Issue button for it. Disable it with an explanation ("The admin app has no credentials"), or hide the whole tab. I recommend keeping the tab with an empty state plus the explanation, so the layout is predictable. The 409 is still mapped in case of mismatch.
- Disabled app (`app.status === 'disabled'`): disable Issue with "Enable this app to issue credentials." Revoke stays enabled (it only removes access, and ADR-0016 says disabling blocks the credential anyway). The `app.status` comes from the already-loaded `app` prop, so no extra query.
- Both are hints only; the dialog still maps the 409 for stale data.

**H. Tests** (R8, ADR 0005; test-utils/api.ts `fakeApi`, `json`, `apiError`, `testQueryClient`)
- Unit, Vitest browser: `errors.test.ts` cases for each issue 409 reason, the 403 variants, 404 and the default.
- `app-credentials-tab.test.tsx`: loading, empty, error plus Retry, 403 (ForbiddenPanel), list rendering ("Never" for null last used, revoked status text), paging, and clamping after an empty page.
- Issue dialog: sends POST with no body; shows the full `mmak_…` value once with the warning; copy button calls the clipboard (stub `navigator.clipboard`) and shows "Copied"; a failed copy shows the fallback message; Done closes and clears; reopening shows no secret; the double-click sends one POST; each 409 reason and 403 render inline; the secret never reaches the DOM after close (`queryByText(secret)` null).
- Secret-leak regression: after closing, assert the QueryClient's mutation cache holds no entry containing the secret (`queryClient.getMutationCache().getAll()` serialized does not contain it) and `localStorage`/`sessionStorage` are empty of it. This is the key test for criterion 2.
- Revoke: confirm names the `key_id` and app; Cancel sends nothing; Confirm sends DELETE; the row stays until the refetch (non-optimistic); error shows inline and does not close; focus returns to a stable control.
- Disabled-app and admin-app states: Issue disabled with the explanation.
- Sheet test (app-detail-sheet.test.tsx): the Credentials tab exists and fetches nothing until selected.
- e2e fake (e2e/support/fake-api.ts:246-252): add per-app `GET /api/v1/apps/${a.key}/credentials` (page of fixtures; `[]` for the admin app), `POST` that returns an `AppCredentialIssued` with a fixed fake `mmak_` value and stateful `calls` recording, and `DELETE .../credentials/{id}` returning 204. Make the fake stateful (issue adds a row, revoke sets `revoked_at`) so the refetch after revoke is observable, and enforce the limit of 2 with a 409 `credential_limit` body so the e2e covers the error. Use an obviously fake secret, never a realistic one (secret-scanning). Also add a Playwright check that the secret is absent from `localStorage`/`sessionStorage`/`page.url()` after the flow, if PAN-023 e2e covers apps.

## Risks

- **Secret in MutationCache**: the default `gcTime` keeps `mutation.data` for 5 minutes after unmount. Mitigated by B; without the explicit reset it is the likeliest R3/R5 failure, and a reviewer should look for `mutation.data.credential` or `issue.data`.
- **Double POST**: a double click issues two credentials and can hit the limit of 2, blocking rotation. The `inFlight` ref plus pending-disabled button covers it.
- **Closing before copying**: an accidental Escape or outside click would lose the secret permanently, which costs a revoke and a reissue within the limit of 2. Block those dismissals once the secret shows.
- **Clipboard API**: only works in secure contexts, and can be denied; a text fallback is needed. Copied secrets stay in the clipboard and clipboard managers, which the UI cannot control; mention in the warning copy.
- **Secret scanners and logs**: do not put realistic `mmak_` fixtures in tests, snapshots or `__screenshots__` (the repo keeps screenshots under `__screenshots__/`; a failing visual test could capture the secret, so use a clearly fake value like `mmak_0000000000000000_FAKE...`).
- **`admin:*` cannot be mirrored** by the current registry (see F), so non-wildcard staff with `admin:apps:write` see an enabled Issue button that returns 403. Acceptable under R4, but needs the inline message.
- **Stale credentials list and limit**: the 2-active limit is enforced by the API only; the UI count is advisory and can be wrong after concurrent changes. Handle 409 `credential_limit` by refetching (already done by `useMutationOptions.onError`).
- **R7**: do not add the `label`/`expires_at` columns, which the API lacks (listed as follow-ups in ADR-0016) and the manifest feature (USR-05b), which is a separate route.
- ADR-0016 is "Proposed, pending owner" (approve by merging USR-05a). The ticket says 05a is merged in 33db316, but the ADR status line still says Proposed. This is low risk, but confirm the contract is final.

## Open questions

1. Exact 403 error code when `admin:*` is missing on issue (`admin_wildcard_required`?). Check org-admin-api `require_super` and `DENIED_ERRORS`.
2. Does `GET .../credentials` for the `admin` app return an empty page or an error? Does it include revoked credentials, and in what order (newest first)? The service view (service.py:115-120) leaves ordering to `repo.page`.
3. Single issue dialog or confirm step then reveal step? I recommend the two-step flow, but the single dialog is simpler. Owner/planner decision.
4. Should Done require a "stored it" checkbox? Recommended off; it adds friction.
5. Hide the Credentials tab for the admin app, or show it with an explanation? I recommend showing it with an explanation.
6. Should `Requirement` get an `alsoRequires: 'admin:*'` field (follow-up) so the Issue button is disabled for non-wildcard staff? Not in this ticket's plan unless the owner says so.
7. Add `apps.issueCredential`/`revokeCredential` to the PAN-011 permission docs/spec §5.3, or is the registry the only record?

Relevant files: /home/user/admin-pan/src/features/apps/components/app-detail-sheet.tsx, /home/user/admin-pan/src/features/apps/components/app-permissions-tab.tsx, /home/user/admin-pan/src/features/apps/components/app-permission-form-dialog.tsx, /home/user/admin-pan/src/features/apps/api/queries.ts, /home/user/admin-pan/src/features/apps/data/errors.ts, /home/user/admin-pan/src/components/confirm-dialog.tsx, /home/user/admin-pan/src/lib/permissions/registry.ts, /home/user/admin-pan/e2e/support/fake-api.ts, /home/user/admin-pan/src/test-utils/api.ts, /home/user/org-admin-api/app/modules/app_credentials/service.py, /home/user/org-admin-api/docs/adr/0016-app-credential-auth-class-and-manifest.md.
