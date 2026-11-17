## PAN-014 consult (frontend-developer, read-only)

I did not run anything; this is from reading the code.

### Findings

**Contract facts in the snapshot (`src/api/openapi.json`, hand-patched per PAN-013)**
- `GET /organizations` accepts only `limit` and `offset`. There is no `status` or name/slug filter parameter. The mock table's name/slug text filter and status facet therefore have no API support in this snapshot. Please check org-admin-api origin/main (a417ddb) for a `status` or `q` parameter before planning. If it has none, the ACs say "filters as the API supports", so the honest result is pagination only (R1: don't fake it in the UI), plus a follow-up for org-admin-api. Do not filter client-side within one page (ADR 0005 rejects that).
- `OrganizationRead` has no `created_by`, so the `Organization` schema must drop it. Replace the hand-written `data/schema.ts` types with `components['schemas']['OrganizationRead']` (R2). Keep only the zod form schema and the `SLUG_PATTERN` UI mirror.
- `OrganizationCreate` limits: `slug` is max 63 and matches `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`. This closes the PAN-004 follow-up on limits. `name` is 1–255. `description` is max 5000 or null.
- The current `SLUG_PATTERN` `/^[a-z0-9-]+$/` is too loose. It accepts `-a-` and anything over 63 characters. Use the API's exact pattern and `.max(63)`.
- `OrganizationUpdate` accepts `name`, `description` and `status`, all optional and nullable. The slug is immutable.
- Responses are documented only as 401, 403 and 422. 409 and 404 are not in the snapshot for organizations. The 409 code for a duplicate slug is probably `conflict`, as in `errors.test.ts`, but this is unverified. Confirm it against the API.
- 422 `details` shape is unconfirmed. `errors.ts` has two types: `ValidationErrorDetail` (`{type, loc, msg}`) and `UnprocessableDetail` (`{field, reason}`). Read how the API's error handler shapes 422 before writing the mapper.

**What PAN-013 gives you to reuse as-is**
- `useTableUrlState` with `globalFilter: { enabled: false }`.
- `useDebouncedValue(…, 300)`.
- `queryView(q)` with `ForbiddenPanel variant='page'`.
- Table options: `manualPagination`, `manualFiltering`, `enableSorting: false`, `rowCount: total`, `getRowId`.
- `placeholderData: keepPreviousData`.
- `ensurePageInRange` only when `q.isSuccess && !q.isPlaceholderData`.
- `toPageParams`.
- `MessageRow`: loading, error with Retry, and empty states.
- Provider that injects `api` (default `getApi()`).
- Mutation hook shape: `meta: { handlesOwnErrors: true }`, `onSuccess` invalidating the `all` key, and `onError` invalidating on 404/409.
- `test-utils/api.ts` (`fakeApi`, `json`, `apiError`, `testQueryClient`).
- `<Can>` keys already exist: `organizations.create`, `organizations.update` and `organizations.delete`. All three map to `admin:organizations:write`, and the route key is `admin:organizations:read`.

**What differs from PAN-013**
- The list needs `organizationsKeys.lists()`, `list(p)` and `detail(id)`, with `limit`, `offset` and any filters in the key. The existing `queries.ts` has no `keepPreviousData` and no `useMutation` yet.
- Three mutations are needed (create, update, delete) instead of one. Suspend and reactivate are the update mutation with `{status}`. Edit is the update mutation with `{name, description}`.
- Create/edit is a form dialog, not a confirm dialog. There is currently no react-hook-form dialog on the real API anywhere in the repo. This is the one new pattern.

### Recommendations

1. **Table (AC1).**
   - Rewrite `organizations-table.tsx` on the `users-table.tsx` shape.
   - Delete the `nameOrSlugFilter` and `getFilteredRowModel`, `getSortedRowModel`, `getFacetedRowModel`, `getFacetedUniqueValues` and `getPaginationRowModel` imports.
   - Pass `searchKey` and `filters` to `DataTableToolbar` only if the API supports them. If it has no filters, check whether the toolbar can render without a search input and facet (verify; I did not read it). If it can't, add a small prop to it or render only `DataTablePagination`.
   - Remove the `sortingFn: 'text'` and `DataTableColumnHeader` sort UI. Plain `<span>` headers, or keep `DataTableColumnHeader` as PAN-013 does, since users uses it with `enableSorting: false` and a test asserts there are no sort buttons. Add the equivalent test.

2. **URL state.**
   - If filters exist, put only `page`, `pageSize` and `status` in the URL.
   - The name/slug text is not personal data as such, but it is free text. Following ADR 0005 consistently, keep it in component state, debounced, and not in the URL. Drop `filter` from the route search schema. The schema silently drops unknown keys, so old `?filter=` links are ignored.
   - Move the search schema next to the feature (`organizationsSearchSchema` in `data/schema.ts`, as `usersSearchSchema` is) so tests can import it.
   - Update the route comment to the real params.

3. **Remove mock-only UI and code.**
   - Remove `data/organizations.ts` (mock rows), `data/errors.ts` (`SlugConflictError`), and `test-data.ts` / `test-fixtures.tsx` where they only support mocks. They can survive only as API-shaped fixtures for tests.
   - Remove `createOrganization`, `updateOrganization` and `deleteOrganization` plus the `organizations` state from the provider. Keep `open`, `currentRow` and `api`.
   - Remove the "(planned name)" `admin:orgs:*` comments. The real permissions are `admin:organizations:read` and `admin:organizations:write`. Delete is `write`, not a separate `delete` permission. The ACTIONS keys are fine.
   - Remove the old `created_by` field.
   - Delete the stale mock screenshot under `__screenshots__/organizations-confirm-dialogs.test.tsx/`.
   - The `DataTableRowActions` `<Can action={[…]}>` wrapper is fine.

4. **Create/edit dialog (AC2, AC3).**
   - Keep `useForm` + `zodResolver(organizationFormSchema)` with the corrected zod: slug required, `.max(63)` and the API regex; name `.trim().min(1).max(255)`; description `.trim().max(5000)`, with `''` sent as `null`.
   - The submit handler calls `mutation.mutate(vars, { onSuccess, onError })`. Do not close the dialog or reset the form until success (R9, non-optimistic).
   - Use `meta: { handlesOwnErrors: true }`, with a mapper in `data/errors.ts` modelled on `statusChangeError`.
     - 403: inline `ForbiddenPanel variant='inline'`.
     - 409 (or `code === 'conflict'`): `form.setError('slug', { message: 'An organization with this slug already exists.' }, { shouldFocus: true })`. Use a static message, not `error.message` (the server text is unreliable). Check the 409 code, not just the status. On create, only slug can conflict.
     - 422 with field details: map each `loc` or `field` of `name`, `slug` or `description` to `form.setError`. Anything unmapped goes to a form-level `role='alert'` message.
     - 404 on edit ("This organization no longer exists."): form-level alert, and invalidate the list.
     - Other errors: form-level alert with a safe `error.message.slice(0, 200)`.
   - Edit has the slug as a read-only field. Prefer `readOnly` with `aria-readonly` over `disabled`, so it stays focusable and readable. Send only `name` and `description` in the PATCH. Consider sending only changed fields. A form with no changes should disable Save, or close without a request.
   - Pending state: Save gets `aria-disabled` plus an early return, not native `disabled`, so focus is kept. Change its text to "Creating…" / "Saving…". Add an sr-only `role='status'` line. Block Escape and outside-click while pending, as the users status dialog does. The Cancel button is also blocked or `aria-disabled` while pending.
   - Unlike the current code, `onOpenChange` must call `form.reset()` and `mutation.reset()` on close.
   - Wire the form's `<form>` submit button via the `form` attribute as now, or put it inside the `<form>`.
   - Inputs need `aria-invalid` and `aria-describedby` for errors. shadcn's `FormControl` / `FormMessage` already do this. Verify that the server-set slug error renders in `FormMessage` and is linked.
   - The `OrganizationsDialogs` create case has `onOpenChange={() => setOpen('create')}`. That looks like a toggle bug, because closing re-opens or does nothing. Verify it against `useDialogState`, and make it close explicitly.

5. **Suspend/reactivate.**
   - Same pattern as `UsersStatusDialog`, using a `PATCH {status}` mutation with an inline error mapper (403 / 404 / generic).
   - Suspend is destructive and access-changing (R9), so the dialog names the organization (name and slug). The existing text is fine.
   - Reactivate is non-destructive.
   - The row action reflects `status`.

6. **Delete (R9).**
   - `DELETE` returns 204. Check that `unwrap` and the client handle an empty body, since there is no existing 204 call in this repo that I verified. Add a test for it.
   - Use typed-slug confirmation. This is the owner's PAN-004 follow-up, and org deletion is irreversible and cascades (likely memberships and access). Implement it through the shared `ConfirmDialog`: an `Input` in `children`, with `disabled` or `aria-disabled` on confirm until the trimmed value equals `currentRow.slug`.
   - The input needs a visible label ("Type {slug} to confirm"), `autoComplete='off'`, and the label linked via `htmlFor`. Don't paste-block.
   - Error mapping: 403, 404 (treat as already deleted: show the message, invalidate), 409 if the API refuses to delete an organization with dependants. Confirm this in the API. Show the API's reason, not a generic message.
   - After success: invalidate `organizationsKeys.all`, toast, and close.
   - If the deleted row was the last on the page, `ensurePageInRange` takes care of the page index.
   - Confirm whether delete should instead be soft or blocked while the organization is active. This is an open question for the API.

7. **a11y lessons from `PAN-013/a11y-review.md` to apply from the start.**
   - One persistent sr-only `role='status' aria-live='polite'` region outside the table: "Loading organizations…", then "{total} organizations, page n of m", or "No organizations match these filters." / "No organizations yet." Remove `role='status'` from the visible message row, and set `aria-busy` only while `view.status === 'pending'`.
   - A reusable result-announcement component would make sense as a shared piece; PAN-013's follow-up asks for it. If the planner doesn't want to touch shared code, copy the approach locally and record a follow-up.
   - Dialogs while pending: `aria-disabled` plus an early return, a pending label, and an sr-only status. Shared `ConfirmDialog` currently uses native `disabled` on both buttons, so focus drops to `<body>`. Either fix `ConfirmDialog` in a backward-compatible way (note that this touches the users dialog, which is in scope for tests only) or leave it and record a follow-up. This is a planner decision, but the same fix is needed in the form dialog regardless.
   - Link the inline error to the dialog description (`aria-describedby` or a `ConfirmDialog` prop), or focus the alert on failure. At minimum, focus the alert or return focus to the confirm button on error.
   - The actions column header is already `sr-only` text in the current org columns, so keep it. The users columns still lack it, and that is PAN-013's finding to fix, not this ticket's.
   - Focus after the dialog closes if the row disappears (delete, or suspend while a status filter is active): move focus to the table region or toolbar. Give the table wrapper `tabIndex={-1}` and focus it on success, or focus the "New organization" button.
   - Table wrapper: `overflow-x-auto` rather than `overflow-hidden`, because of 320 px reflow. The current org table wrapper uses `overflow-hidden`. The slug is shown under the name, so there is no sticky column to worry about.
   - Keep text on status badges, `<time dateTime>`, `aria-label` on the actions trigger, and the visually hidden "No description" text (already present).
   - Check the destructive badge contrast of `statusBadgeClasses` for `suspended` against real tokens. PAN-013 flagged the same on users.
   - The Table's `aria-label='Organizations'` exists. Keep it.

8. **Query hooks and other code.**
   - `organizationsListQueryOptions(params, api)` becomes the paginated one with `keepPreviousData`, with `toOrganizationsListParams({ pagination, status?, q? })`. Omit empty values (an empty string is a 422 in users).
   - Add `useCreateOrganizationMutation`, `useUpdateOrganizationMutation` and `useDeleteOrganizationMutation`, all with `handlesOwnErrors` and `onSuccess` invalidating `organizationsKeys.all`.
   - Keep the `// eslint-disable-next-line @tanstack/query/exhaustive-deps` comment pattern for the injected client.
   - Update the existing `queries.test.ts` (it currently passes `{limit, offset}` only).
   - `OrganizationsProvider` takes an `api` prop like `UsersProvider`.
   - The route: `validateSearch` points at the exported schema.
   - Handling of the route-level permission is already in the registry.

9. **Test list (R8).** All use `fakeApi` and `testQueryClient`, and assert against `seen` requests.
   - Table: renders rows from the API (name, slug, status, description or "No description", created date); loading (never-resolving fetch shows the status); empty without filters and with filters; error shows an alert, and Retry refetches; 403 shows `ForbiddenPanel` and hides the table; 403 on refetch replaces stale rows; next page sends `offset=10` and updates `?page`; typed text debounced, trimmed, sent, and never in the URL (only if filters exist); status filter sends `status=` only when exactly one value is chosen (only if the API supports it); no sort buttons; no selection checkboxes; the persistent live region content; permission gating (read-only user: no row menu, "New organization" disabled with the reason; write user: shown).
   - Create: client validation (required, slug pattern, 63-character limit, name 255, description 5000); success sends exact body (`description: null` for empty), closes the dialog, refetches the list and toasts; 409 sets the error on the slug field, focuses it, and keeps the dialog open with form values retained; 422 field mapping; 403 inline panel; generic error alert; pending (a never-resolving POST) shows the pending label and `aria-disabled`, the dialog does not close on Escape, and there is no double submit.
   - Edit: prefilled values, slug read-only, PATCH body has no slug, success closes and refetches; 404 message; reset on reopen; re-opening the dialog after a failed attempt shows no stale error.
   - Suspend and reactivate: confirm sends `PATCH {status}`, cancel sends nothing; error shown inline and dialog stays open; row badge changes only after refetch (non-optimistic); 403 inline.
   - Delete: confirm stays disabled until the exact slug is typed; no request on cancel; sends `DELETE` and handles the 204; 404/409/403 inline; list refetched after success; page clamps when the last row on the page is deleted.
   - Unit tests: `toOrganizationsListParams`; the error mapper (403 / 404 / 409 / 422 / other); the form zod schema (exact API regex, boundaries 63 and 64, 255 and 256, 5000 and 5001); keys.
   - Replace the old mock tests. Delete the stale confirm-dialogs test (it asserts the mock behaviour).

### Risks
- **Filters may not exist.** Without API filters, the screen loses its search and facet. Say so in the ticket and record the org-admin-api follow-up. Do not do client-side filtering of the current page.
- **Unverified 409/422 shapes.** The mapping to the slug field relies on the error code and details. Wrong assumptions give a silent generic error. Read the API source (or `/openapi.json` on main) and cover it with tests that mirror the real envelope.
- **204 handling** in `unwrap` is unverified.
- **Shared `ConfirmDialog` change** affects users and other dialogs. Keep it additive, or leave it and follow up.
- **Snapshot drift**: the snapshot predates ADM-001's final state. A hand-patch (as in PAN-013) may be needed for 409/404 responses and filter parameters. Full regeneration is deferred to PAN-016.
- **Create dialog close handler** (`setOpen('create')` on close) may leave the dialog stuck. Verify and fix as part of the rewrite (it is in scope, because the dialog is rewritten).
- Delete is one permission (`write`). A user who can edit can also delete, so typed confirmation matters more.

### Open questions
1. Does org-admin-api main's `GET /organizations` support `status` or a name/slug search parameter? If not, ship pagination only and record the follow-up.
2. Exact 409 error code for a duplicate slug, and the 422 `details` shape (`{field, reason}` or FastAPI `{loc, msg}`)?
3. Does DELETE have dependants rules (409 if memberships or entitlements exist), or does it cascade? This decides the warning text and the 409 mapping.
4. Is the typed-slug confirmation required, or optional? I recommend it (owner's PAN-004 note says "consider"). Confirm that the owner wants it.
5. Should the shared `ConfirmDialog` be fixed (aria-disabled pending, described-by error) in this ticket, or kept as a follow-up from PAN-013?
6. Is name/slug search text treated as non-PII (could stay in the URL) or kept in component state like the user's email? I recommend component state for consistency with ADR 0005.

Key files:
- /home/user/admin-pan/src/features/organizations/components/organizations-table.tsx
- /home/user/admin-pan/src/features/organizations/components/organizations-action-dialog.tsx
- /home/user/admin-pan/src/features/organizations/components/organizations-provider.tsx
- /home/user/admin-pan/src/features/organizations/components/organizations-dialogs.tsx
- /home/user/admin-pan/src/features/organizations/components/organizations-delete-dialog.tsx
- /home/user/admin-pan/src/features/organizations/components/organizations-status-dialog.tsx
- /home/user/admin-pan/src/features/organizations/api/queries.ts
- /home/user/admin-pan/src/features/organizations/data/schema.ts
- /home/user/admin-pan/src/routes/_authenticated/organizations/index.tsx
- /home/user/admin-pan/src/features/users/components/users-table.tsx
- /home/user/admin-pan/src/features/users/components/users-status-dialog.tsx
- /home/user/admin-pan/src/features/users/api/queries.ts
- /home/user/admin-pan/src/features/users/data/errors.ts
- /home/user/admin-pan/src/components/confirm-dialog.tsx
- /home/user/admin-pan/src/api/openapi.json
- /home/user/admin-pan/src/test-utils/api.ts
