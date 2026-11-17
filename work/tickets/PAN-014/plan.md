Status: READY

# Plan — PAN-014: Organizations screen on the real API

## Spec summary
`docs/spec-v1.md` §5.3 Organizations:
> List (paginated), create, detail, edit, suspend/reactivate, delete with confirmation.
> API: `/api/v1/organizations` CRUD — **org-admin-api ADM-001** (done). Note: the table moves to the Identity module and gains `created_by` in **USR-06**; members per org arrive there too.

§6: "Lists use server-side pagination (`limit` ≤ 100) and stay responsive with thousands of rows."

Owner answers that shape this plan:
- **2026-11-17 (unblock).** "Build the screen now on the API as it is (org-admin-api main 33db316). Keep only the filters and sorting `GET /api/v1/organizations` actually supports; remove or hide the others, and keep the follow-up open against `org-admin-api-request.md`."
- **2026-11-16, still valid.**
  - Typed-slug delete; "the dialog says the deletion is permanent".
  - Shared `ConfirmDialog` a11y fix, backward compatible:
    - `aria-disabled` plus an early return while pending;
    - a pending label and an sr-only status;
    - the inline error linked through `aria-describedby`.
  - This also updates the users status dialog.
- **Snapshot.** "Regenerate it again from the current org-admin-api main if needed… do not hand-patch."

**Verified API facts at org-admin-api 33db316** (`app/modules/organizations/router.py`, `schemas.py`, `service.py`, `repository.py`; `app/core/errors.py`):

- **List.** `GET /api/v1/organizations` takes only `PageDep` (`limit` 1..100, default 20; `offset` ≥ 0) (`router.py:25-33`).
  - It has no `status`, `q` or `sort`.
  - The order is fixed: `created_at DESC, id` (`repository.py:26`).
- **Detail, create, update, delete.**
  - `GET /{org_id}` returns 200 or 404.
  - `POST` returns 201, or 409 with `code: "conflict"` for a duplicate slug. The 409 comes from the pre-check and also from the IntegrityError race (`service.py:34-39`).
  - `PATCH` takes `name`, `description` and `status`, and returns 200 or 404.
  - `DELETE` returns 204 or 404, **or 409 `code: "org_has_assignments"`**, with `details: [{"field":"org_id","reason":"org_has_assignments"}]`, when any role assignment exists in the org (`service.py:57-71`, `errors.py:97-98`).
  - Read needs `admin:organizations:read`; every write needs `admin:organizations:write`.
- **`OrganizationCreate` limits.**
  - `slug`: pattern `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`, max 63.
  - `name`: 1..255.
  - `description`: max 5000 or null (`schemas.py:8-14`).
  - The same values are in `src/api/openapi.json:1202-1206`.
- **`OrganizationRead`.** It now has `created_by: uuid | null` (USR-06a, `schemas.py:33`). This is already in the snapshot (`openapi.json:1223`).
- **422 `validation_error`.** `details` is `[{type, loc, msg}]` with no input echoed (`errors.py:151-164`).
- **Suspended status.** It only blocks org-scoped token requests (`403 org_access_denied`; org-admin-api `docs/consumers.md:134`). Existing tokens keep working until `exp` (`consumers.md:374-375`).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Server-side pagination and filters (as the API supports) | The API supports only `limit` and `offset`. The table is server-side (ADR 0005), and the screen has no search box, status facet or sort buttons, so it never fakes a filter (R1). The URL holds only `page` and `pageSize`. Tests: `organizations-table.test.tsx` › "sends limit/offset only and renders rows from the API", › "next page sends offset=10 and writes page=2 to the URL", › "no search box, status facet or sort buttons", › "clamps to the last page when the current page comes back empty"; `schema.test.ts` › "organizationsSearchSchema keeps page/pageSize and drops filter/status"; `queries.test.ts` › "toOrganizationsListParams". |
| 2 | Create/edit/suspend/delete call the API with confirmation where destructive | `organizations-action-dialog.test.tsx` › "create sends POST…" / "edit sends PATCH {name, description} without slug". `organizations-status-dialog.test.tsx` › "suspend: confirm names the org and sends PATCH {status:'suspended'}; cancel sends nothing" and › "reactivate…". `organizations-delete-dialog.test.tsx` › "Delete stays disabled until the exact slug is typed" and › "confirm sends DELETE, handles 204, refetches; cancel sends nothing". The tests also cover non-optimistic behaviour: the row and badge change only after refetch. E2E: `pages.e2e.ts` › "organizations: …dialogs cancel without writes". |
| 3 | 409 conflict mapped to the slug field | `organizations-action-dialog.test.tsx` › "409 conflict on create sets the error on the slug field, focuses it, keeps the dialog open and values". The error is linked via `aria-describedby` and `aria-invalid`, and the message is a fixed UI string, not the server text. `errors.test.ts` › "organizationFormError: 409 conflict on create → slug". |
| 4 | Loading, empty, error and 403 states tested with the API mocked at the network layer via a fake `fetch` injected into `createApiClient` (no MSW; ADR 0005) | All component tests use `src/test-utils/api.ts` (`fakeApi`, `json`, `apiError`, `testQueryClient`) with `<OrganizationsProvider api={client}>`. `organizations-table.test.tsx` covers loading, empty, error + Retry, 403 page panel, and 403 on refetch. Inline 403 in each dialog is covered by its own test. `grep -r "msw" src` finds nothing. |
| — | Owner 2026-11-16: typed-slug delete, "permanent" wording | `organizations-delete-dialog.test.tsx` › "says the deletion is permanent and names the org". |
| — | Owner 2026-11-16: shared ConfirmDialog a11y fix (backward compatible) | `confirm-dialog.test.tsx` covers four things: pending makes confirm and cancel `aria-disabled`, clicks are ignored, and the dialog stays open on Escape; the pending label and sr-only status; `error` is linked via `aria-describedby` on the confirm button; `disabled` (typed mismatch) stays native `disabled`. All earlier tests still pass except the one rewritten for `isLoading`. `users-status-dialog.test.tsx` covers the pending and error tests in their updated form. |
| — | Snapshot regenerated, no hand-patch | The impl-log records the org-admin-api commit (33db316) and the command. `git diff --stat src/api/openapi.json` shows only the `/api/v1/apps/{key}/credentials…` paths and their schemas. `pnpm api:types && git diff --exit-code src/api/schema.d.ts` is clean. `registry.test.ts` passes unchanged. |
| — | E2E green | `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm e2e` passes. The `noStrayRequests` fixture shows no `unmatched` calls on `/organizations`. |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/api/openapi.json` | Regenerate from org-admin-api 33db316 (Approach step 1). Byte-identical generator output, no hand edits. | Owner 2026-11-17 (snapshot); ADR 0001 |
| `src/api/schema.d.ts` | `pnpm api:types` | CI diffs it against the snapshot |
| `src/components/confirm-dialog.tsx` | Backward-compatible a11y fix (Approach step 2). Adds the optional `pendingText` and `error` props. | Owner 2026-11-16; R10 |
| `src/components/confirm-dialog.test.tsx` | Rewrite the `isLoading` test for `aria-disabled`, and add tests for pending, status and error linking | R8 |
| `src/features/users/components/users-status-dialog.tsx` | Pass `pendingText` (`Disabling…`/`Enabling…`) and move the failure markup into the `error` prop. There is no behaviour change otherwise. | Owner 2026-11-16 ("This also updates the users status dialog") |
| `src/features/users/components/users-status-dialog.test.tsx` | The pending test asserts `aria-disabled` and the pending label instead of `toBeDisabled`. Add one test: the error is linked to the confirm button via `aria-describedby`. | R8 |
| `src/components/forbidden-panel.test.tsx` | Change `organizationsListQueryOptions({}, client)` to `({ limit: 10, offset: 0 }, client)`, because params become required. | Compile fix caused by the queries signature |
| `src/features/organizations/api/queries.ts` | Rewrite: keys (`all`, `lists()`, `list(p)`), `toOrganizationsListParams`, list options with `keepPreviousData`, and create/update/delete mutations (Approach step 3). Remove the unused `useOrganizationsQuery`. | AC1, AC2; R2, R9 |
| `src/features/organizations/api/queries.test.ts` | Rewrite for the new keys, params and mutations, using `fakeApi` | R8 |
| `src/features/organizations/data/schema.ts` | Generated types replace the zod `organizationSchema`. Add the API slug regex and limits, a tightened form schema, and `organizationsSearchSchema` (Approach step 4). | R2; PAN-004 follow-up (limits) |
| `src/features/organizations/data/schema.test.ts` | **New.** Form schema boundaries; limits equal `openapi.json`; search schema. | R8 |
| `src/features/organizations/data/errors.ts` | Rewrite: remove `SlugConflictError`. Add `organizationFormError`, `organizationStatusError` and `organizationDeleteError` (Approach step 5). | AC3; R4, R9 |
| `src/features/organizations/data/errors.test.ts` | **New.** Mapper unit tests. | R8 |
| `src/features/organizations/data/data.ts` | Import `OrganizationStatus` from the generated type. Labels and badge classes are unchanged. | R2 |
| `src/features/organizations/data/organizations.ts` | **Delete** (mock rows) | Mock phase ends (CLAUDE.md) |
| `src/features/organizations/components/organizations-provider.tsx` | Context is `{ api, open, setOpen, currentRow, setCurrentRow }`, with an `api?` prop defaulting to `getApi()`. Drop the in-memory list and mutations. | ADR 0005 |
| `src/features/organizations/components/organizations-table.tsx` | Rewrite on the audit-log table shape (Approach step 6) | AC1, AC4 |
| `src/features/organizations/components/organizations-columns.tsx` | Drop `filterFn` and `sortingFn`. Keep `DataTableColumnHeader` (sorting is off at table level). | ADR 0005 |
| `src/features/organizations/components/organizations-action-dialog.tsx` | Rewrite on the create/update mutations with the server error mapping and pending a11y (Approach step 7) | AC2, AC3; R9, R10 |
| `src/features/organizations/components/organizations-status-dialog.tsx` | Use the update mutation `{status}`, with an inline error, the pending label, and corrected copy (Approach step 8) | AC2; R9 |
| `src/features/organizations/components/organizations-delete-dialog.tsx` | Typed-slug confirmation, the DELETE mutation and the error mapping (Approach step 9) | AC2; owner 2026-11-16; R9 |
| `src/features/organizations/components/organizations-dialogs.tsx` | Explicit close handlers (`setOpen(null)`) instead of relying on the `useDialogState` toggle | Clarity during the rewrite. Behaviour is unchanged. |
| `src/features/organizations/components/data-table-row-actions.tsx` | Only the type import moves to the generated `Organization`; this happens through `schema.ts` re-export, so there may be no diff. Keep the `aria-label` "Actions for {name}". | R2 |
| `src/features/organizations/index.tsx` | `OrganizationsTableSection` passes only `search` and `navigate`. Fix the permission comment (`admin:organizations:read`). | Provider change |
| `src/routes/_authenticated/organizations/index.tsx` | `validateSearch: organizationsSearchSchema` (imported). Drop `filter` and `status`. | AC1; ADR 0005 |
| `src/features/organizations/components/test-data.ts` | Rewrite as API-shaped fixtures (`ORGS: Organization[]`, `orgsPage()`) | Tests |
| `src/features/organizations/components/test-fixtures.tsx` | Rewrite as `renderOrganizations(client, { granted?, search? })`. It renders provider, primary button, table with URL-state stub (`<output data-testid='search'>`) and dialogs inside a `QueryClientProvider`, plus `WithPermissions` when granted. | Tests |
| `src/features/organizations/components/organizations-table.test.tsx` | Rewrite (API states, paging, permissions) | AC1, AC4 |
| `src/features/organizations/components/organizations-action-dialog.test.tsx` | Rewrite (create/edit on the API) | AC2, AC3 |
| `src/features/organizations/components/organizations-status-dialog.test.tsx` | **New.** Replaces the mock confirm-dialogs test. | AC2 |
| `src/features/organizations/components/organizations-delete-dialog.test.tsx` | **New** | AC2 |
| `src/features/organizations/components/organizations-confirm-dialogs.test.tsx` | **Delete** (asserts mock behaviour) | Mock phase ends |
| `src/features/organizations/components/__screenshots__/organizations-confirm-dialogs.test.tsx/` | **Delete** (stale failure screenshot) | Housekeeping of the deleted test |
| `e2e/support/fake-api.ts` | Add `ORGS: OrganizationRead[]` (3 rows) and `'GET /api/v1/organizations': ({query}) => json(200, page(ORGS, query))` | The page now calls the API, and `noStrayRequests` fails on unmatched calls |
| `e2e/pages.e2e.ts` | Add a test: "organizations: list from the API; suspend and delete dialogs cancel without writes" (Approach step 10). The sweep entry stays unchanged. | Keeps `pnpm e2e` meaningful for the new behaviour |

No ADR. The ConfirmDialog props are a component API, and ADR 0004 and 0005 already cover the patterns.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `organizations/api/queries.test.ts` › "organizationsKeys.list = ['organizations','list',{limit,offset}]; lists() is its prefix" | Keys |
| › "toOrganizationsListParams maps pageIndex/pageSize to limit/offset and sends nothing else" | AC1 |
| › "list options GET /api/v1/organizations?limit=10&offset=20" | AC1, R2 |
| › "surfaces a 403 ApiError" | AC4 |
| › "create POSTs the body; update PATCHes /{org_id}; delete DELETEs /{org_id} and resolves on 204" | AC2 |
| › "each mutation invalidates ['organizations'] on success; on 404/409 it invalidates too; not on 500" | R9 |
| `organizations/data/schema.test.ts` › "slug: accepts a, a-b, 63 chars; rejects '', -a, a-, A, a_b, 64 chars" | PAN-004 limits |
| › "name: trims, rejects whitespace-only, accepts 255 and rejects 256; description accepts 5000 and rejects 5001" | Limits |
| › "SLUG_PATTERN.source and the max lengths equal OrganizationCreate in openapi.json" (read via `?raw`, as `registry.test.ts` does) | Drift guard |
| › "organizationsSearchSchema keeps page/pageSize and drops filter/status" | AC1, ADR 0005 |
| `organizations/data/errors.test.ts` › "organizationFormError: 409 conflict on create → slug" | AC3 |
| › "…: 409 on edit is not mapped to slug (alert)" | AC3 safety |
| › "…: 422 validation_error maps body.slug/name/description; unmapped loc → alert" | 422 |
| › "…: 403 → forbidden copy; 404 → 'no longer exists'; other ApiError → message ≤ 200; non-ApiError → generic" | R4 |
| › "organizationDeleteError: 409 org_has_assignments → fixed text; 404; 403; other" | Delete |
| › "organizationStatusError: 403; 404; other" | Status |
| `organizations-table.test.tsx` › "loading: a never-resolving fetch shows 'Loading organizations…' and aria-busy" | AC4 |
| › "sends limit/offset only and renders rows from the API (name, slug, status badge, 'No description', created date)" | AC1 |
| › "empty: 'No organizations yet.'" | AC4 |
| › "error shows an alert and Retry refetches" | AC4 |
| › "403 shows the ForbiddenPanel and no table" | AC4, R4 |
| › "403 on refetch replaces stale rows with the ForbiddenPanel" | AC4, R4 |
| › "next page sends offset=10 and writes page=2 to the URL" | AC1 |
| › "clamps to the last page when the current page comes back empty" | Paging after delete |
| › "no search box, status facet or sort buttons" | AC1, R1 |
| › "live region announces '{total} organizations, page 1 of n'" | R10 |
| › "read-only: New organization disabled with 'Requires admin:organizations:write', no row menu; write: both available" | R4 |
| `organizations-action-dialog.test.tsx` › "client validation: required, slug pattern, 63/255/5000 limits; no request sent" | Form |
| › "create sends POST {slug,name,description:null}, closes, toasts, refetches the list" | AC2 |
| › "409 conflict on create sets the error on the slug field, focuses it, keeps the dialog open and values" | AC3 |
| › "422 maps details to fields" | 422 |
| › "403 shows the inline ForbiddenPanel; dialog stays open" | R4 |
| › "pending: 'Creating…', aria-disabled, sr-only status; Escape does not close; a second click sends no second POST" | R9, R10 |
| › "edit: prefilled, slug read-only, sends PATCH {name, description} without slug; success closes and refetches" | AC2 |
| › "edit 404 shows 'This organization no longer exists.' and refetches" | Concurrency |
| › "reopening after a failure shows no stale error" | Reset |
| `organizations-status-dialog.test.tsx` › "suspend: confirm names the org and sends PATCH {status:'suspended'}; cancel sends nothing" | AC2, R9 |
| › "reactivate: offered for suspended orgs, sends PATCH {status:'active'}" | AC2 |
| › "pending: dialog open, buttons aria-disabled, 'Suspending…'; the badge changes only after the refetch" | R9 |
| › "403 / 404 / other errors are shown inline; dialog stays open" | R4, R9 |
| `organizations-delete-dialog.test.tsx` › "says the deletion is permanent and names the org" | Owner 2026-11-16 |
| › "Delete stays disabled until the exact slug is typed (wrong case or partial stays disabled)" | Owner 2026-11-16 |
| › "confirm sends DELETE, handles 204, toasts, refetches; the row disappears; cancel sends nothing" | AC2, R9 |
| › "Enter in the slug input submits only when it matches" | Keyboard |
| › "409 org_has_assignments shows the revoke-first message inline; dialog stays open" | Delete rule |
| › "403 inline panel; 404 'no longer exists' and the list refetches" | R4 |
| `components/confirm-dialog.test.tsx` › "while isLoading, confirm and cancel are aria-disabled (not disabled), clicks do nothing, Escape does not close" | Owner a11y |
| › "isLoading shows pendingText and an sr-only status" | Owner a11y |
| › "error is rendered and linked to the confirm button via aria-describedby" | Owner a11y |
| (existing) › "disables confirm when disabled is true" and the typed-mismatch test | Backward compatibility |
| `users-status-dialog.test.tsx` › pending test updated; new › "a failure is linked to the confirm button via aria-describedby" | Owner: users dialog |
| `e2e/pages.e2e.ts` › "organizations: list from the API; suspend and delete dialogs cancel without writes" | E2E, axe |

## Approach

### 1. Snapshot (do first)
1. In `/home/user/org-admin-api`, check that `git rev-parse --short HEAD` prints `33db316`. Write nothing into that repo.
2. Generate exactly as PAN-016 did: `UV_PROJECT_ENVIRONMENT=<scratchpad>/oaa-venv /root/.local/bin/uv run python -m app.cli openapi --output /home/user/admin-pan/src/api/openapi.json`. This needs no env; `cli.py:756-775` uses `Settings.model_construct(app_env="local")`.
3. **Do not copy** the scratchpad file `oaa-new.json` as is. It is minified, while the generator writes `json.dumps(indent=2, sort_keys=True, ensure_ascii=False) + "\n"` (`app/core/openapi.py:73-75`).
   - If `uv` is unavailable, re-serialise `oaa-new.json` with exactly those options. That is byte-identical to the generator output.
   - Record which path you used in the impl-log.
4. Run `pnpm api:types`.
5. Check the diff and record it in the impl-log:
   - only `/api/v1/apps/{key}/credentials` (GET, POST) and `/api/v1/apps/{key}/credentials/{credential_id}` (DELETE), plus their schemas, are added;
   - the `x-permission` set is unchanged (`admin:apps:read/write` already exist), so `registry.test.ts` stays green;
   - organization schemas are unchanged.
6. Do not wire the credential paths (R7).

### 2. Shared `ConfirmDialog` (backward compatible)
New optional props:
- `pendingText?: React.ReactNode`
- `error?: React.ReactNode`

While `isLoading`:
- **Confirm button.**
  - It gets `aria-disabled='true'`, not native `disabled`.
  - Its `onClick` calls `e.preventDefault()` and returns early. This also stops a `form` submit.
  - Otherwise it calls `handleConfirm?.()`.
  - The label is `pendingText ?? confirmText`.
- **Cancel.** It gets `aria-disabled='true'`, and its `onClick` calls `e.preventDefault()`. Radix `composeEventHandlers` skips the close when the event is default-prevented; verify this with the test.
- **Close requests.** The `onOpenChange` passed to `AlertDialog` ignores `false` (Escape).
- **Status.** An sr-only `<p role='status' aria-live='polite'>` is always rendered. Its content is `pendingText ?? 'Please wait…'` while loading, and empty otherwise.

Native `disabled` is still used for the `disabled` prop (typed mismatch), which keeps the two existing tests valid.

`error`:
- It is rendered after `children` inside `<div id={errorId}>`, with `errorId` from `useId`.
- When `error` is set, the confirm button gets `aria-describedby={errorId}`, so focus, which stayed on the button, reads the error.
- Callers keep `role='alert'` inside their own error markup. `ForbiddenPanel` inline already has it.

Callers:
- `users-status-dialog.tsx` moves its two failure branches into `error` and passes `pendingText`.
- `sign-out-dialog.tsx` needs no change. It gets `aria-disabled` while loading, with the same label.

### 3. Queries (`api/queries.ts`, R2/R9)
- **Types.** `OrganizationsListParams = { limit: number; offset: number }`.
- **Keys.**
  - `organizationsKeys.all = ['organizations']`
  - `lists() = [...all, 'list']`
  - `list(p) = [...lists(), { limit, offset }]`
- **`toOrganizationsListParams({ pagination })`** returns `toPageParams(pagination)` and nothing else. This is the documented place to add `status`, `q` and `sort` when the API ships them.
- **`organizationsListQueryOptions(params, api = getApi())`** uses `placeholderData: keepPreviousData` and keeps the existing eslint-disable comment for the injected client.
- **Mutations.** All three take `api = getApi()`, set `meta: { handlesOwnErrors: true }`, invalidate `organizationsKeys.all` in `onSuccess`, and in `onError` invalidate on `isApiError(e,404) || isApiError(e,409)`. None is optimistic.
  - `useCreateOrganizationMutation` posts `OrganizationCreate`.
  - `useUpdateOrganizationMutation` takes `{ id, body: OrganizationUpdate }`.
  - `useDeleteOrganizationMutation` takes `{ id }`. `unwrap` accepts 204 (`client.ts:123-133`, tested in `client.test.ts:77`).
- **Body types** are `components['schemas']['OrganizationCreate' | 'OrganizationUpdate']`.

### 4. Schema (`data/schema.ts`)
- **Generated types.**
  - `Organization = components['schemas']['OrganizationRead']`
  - `OrganizationStatus = components['schemas']['OrganizationStatus']`
  - `created_by` comes with the type. It is not displayed in this slice (see Split proposal).
- **`SLUG_PATTERN`** is `/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/`.
- **Exported limits.** `SLUG_MAX = 63`, `NAME_MAX = 255`, `DESCRIPTION_MAX = 5000`.
- **`organizationFormSchema`.**
  - `slug`: `.trim().min(1,'Slug is required.').max(63,'Use at most 63 characters.').regex(SLUG_PATTERN,'Use lowercase letters, digits and hyphens; start and end with a letter or digit.')`
  - `name`: `.trim().min(1,'Name is required.').max(255,'Use at most 255 characters.')`. The API does not trim, so a whitespace-only name must be stopped here.
  - `description`: `.trim().max(5000,'Use at most 5000 characters.')`.
  - The slug help text becomes "Lowercase letters, digits and hyphens; starts and ends with a letter or digit. Must be unique."
- **`organizationsSearchSchema`** is `z.object({ page: z.number().optional().catch(1), pageSize: z.number().optional().catch(10) })`. Old `?filter=` and `?status=` keys are stripped.

### 5. Error mappers (`data/errors.ts`, by status/code, ADR 0004)
**`organizationFormError(error, mode: 'create' | 'edit')`** returns `{ fields: Partial<Record<'slug'|'name'|'description', string>>; alert: null | {kind:'forbidden', copy} | {kind:'message', text} }`:
- `isForbidden` → forbidden alert.
- `mode==='create' && isApiError(e,409) && e.code==='conflict'` → `fields.slug = 'An organization with this slug already exists.'`. This is a fixed text; never parse or show the server message, which echoes the slug.
- `isApiError(e,422) && e.code==='validation_error'` → for each detail with `loc[0]==='body'` and `loc[1]` being one of the three fields, set `fields[loc[1]] = msg.slice(0,200)`. If nothing mapped, the alert is "The API rejected these values."
- `404` → "This organization no longer exists."
- Any other `ApiError` → `message.slice(0,200)`.
- Anything else → "Something went wrong."

**`organizationStatusError(error)`**: forbidden, 404 as above, otherwise generic (the same shape as users `statusChangeError`).

**`organizationDeleteError(error)`**:
- forbidden;
- `409` with `code==='org_has_assignments'` → "This organization still has role assignments. Revoke them first, then delete it.";
- 404 as above;
- otherwise generic.

### 6. Table (`organizations-table.tsx`, ADR 0005; template: `audit-log-table.tsx`)
- **URL state.** `useTableUrlState({ search, navigate, pagination: { defaultPage: 1, defaultPageSize: 10 }, globalFilter: { enabled: false } })`, with no column filters.
- **Query.** `params = toOrganizationsListParams({ pagination })`, then `q = useQuery(organizationsListQueryOptions(params, api))` and `view = queryView(q)`.
- **Table options.** `manualPagination`, `manualFiltering`, `enableSorting: false`, `enableRowSelection: false`, `rowCount: total`, `getRowId`, `getCoreRowModel` only.
- **Page clamp.** `ensurePageInRange` runs only when `q.isSuccess && !q.isPlaceholderData`.
- **403.** `view.status==='forbidden'` → `<ForbiddenPanel variant='page' onRetry>`.
- **No toolbar.** `DataTableToolbar` always renders a search input (`toolbar.tsx:35-55`), so do not use it. Render only the table and `DataTablePagination`. This is the visible change from the mock (no search or facet); it is intentional per the owner on 2026-11-17.
- **Live region.** A persistent sr-only `<p role='status' aria-live='polite'>` shows "Loading organizations…", then "{total} organizations, page n of m", or "No organizations yet."
- **Message rows.** They have no `role=status`. The error row is `role='alert'` with "Couldn't load organizations." and a Retry button.
- **Table element.** `aria-busy` only while pending; keep `aria-label='Organizations'`. The wrapper is `overflow-x-auto` (320 px reflow).

### 7. Create/edit dialog (`organizations-action-dialog.tsx`)
- **Form.** react-hook-form + `zodResolver(organizationFormSchema)`, with `useCreateOrganizationMutation(api)` or `useUpdateOrganizationMutation(api)` from `useOrganizations().api`.
- **Submit.**
  - If `mutation.isPending`, return.
  - Create sends `{slug, name, description: description || null}`.
  - Edit sends `PATCH {name, description: description || null}`; the slug is never sent.
  - On success: toast `Organization "{name}" created.` / `updated.`, `form.reset()`, `mutation.reset()`, then close.
  - On error: apply `organizationFormError(err, mode)`. Set each field with `form.setError(field, {message}, {shouldFocus: true})` for the first one. The alert renders above the footer: `ForbiddenPanel variant='inline'`, or `<p role='alert'>`.
- **Pending.**
  - The submit button gets `aria-disabled` plus the early return, with the label "Creating…" / "Saving…".
  - An sr-only `role='status'` region is added.
  - `Dialog onOpenChange` ignores close while pending (Escape, the X button and outside click).
  - Closing in other cases resets the form and the mutation.
- **Edit slug.** The field stays `readOnly` and gets `aria-readonly`, with "The slug cannot be changed."
- **Error linking.** `FormControl`/`FormMessage` already set `aria-invalid` and `aria-describedby`. The 409 test asserts the slug input's `aria-describedby` contains the message id.

### 8. Status dialog
- It uses `useUpdateOrganizationMutation(api)` with `{ id, body: { status } }`, and `ConfirmDialog` with `isLoading`, `pendingText` ('Suspending…' / 'Reactivating…') and `error` (from `organizationStatusError`).
- `handleOpenChange` blocks close while pending and resets on close, like the users dialog.
- Success closes and toasts.
- **Copy** must not claim more than the API does (R1):
  - Suspend: "Suspend **{name}** ({slug})? Members can't get new access to mmlabs apps in this organization until it is reactivated. Access already granted lasts until it expires."
  - Reactivate: "Reactivate **{name}** ({slug})? Members can get access to mmlabs apps in this organization again."
- Suspend is `destructive`.

### 9. Delete dialog (typed slug)
- **Structure.** `ConfirmDialog` with `form='organization-delete-form'`, `destructive`, `disabled={typed.trim() !== currentRow.slug}`, `isLoading`, `pendingText='Deleting…'` and `error`.
- **Description.** "Permanently delete **{name}** ({slug})? This cannot be undone."
- **Children.** A `<form id='organization-delete-form' onSubmit>` containing a labelled `Input`:
  - label "Type {slug} to confirm" (linked via `htmlFor`);
  - `autoComplete='off'`, `spellCheck={false}`;
  - no paste blocking.
- **`onSubmit`.** It calls `preventDefault`, returns if there is no match or the request is pending, then calls `mutate({id})`.
- **Success.** Close, toast `Organization "{name}" deleted.`, and let the list refetch. `ensurePageInRange` handles an emptied last page.
- **Errors.** Use `organizationDeleteError`; the 404 and 409 cases also refetch through the hook.
- The typed value is local state and resets on close.

### 10. E2E
- **`fake-api.ts`.** Add `ORGS: OrganizationRead[]` with fixed UUIDs: `acme` "Acme Corp" (active), `globex` "Globex" (suspended, description null), `initech` "Initech" (active). Add `created_by: null` if the generated type requires it. The `'GET /api/v1/organizations'` handler returns `page(ORGS, query)`. No mutation handlers: the spec never writes, and an accidental write would surface as `unmatched`.
- **`pages.e2e.ts` new test.**
  1. `signIn('/organizations')`, check the heading, then expect 4 rows (header plus 3).
  2. Open "Actions for Acme Corp", then Suspend. The alertdialog contains `acme`. Run `expectNoSeriousA11y(page, 'organizations-suspend-dialog')`, then Cancel.
  3. Open "Actions for Acme Corp", then Delete. The Delete button is disabled. Fill "Type acme to confirm" with `acm` (still disabled), then `acme` (enabled). Run `expectNoSeriousA11y(page, 'organizations-delete-dialog')`, then Cancel.
  4. Expect `api.calls` to have no PATCH, POST to organizations, or DELETE.
- The existing sweep entry (open/close New organization plus axe) now runs against API data and needs no change.
- Do not add entries to `a11y-known-issues.ts`.

### Rules
- **R1:** no client-side filtering or search, and no faked `created_by` or member counts. The copy matches the API's real effect.
- **R2:** generated types only, and HTTP only via `src/api/`.
- **R4:** `<Can>` keys `organizations.create/update/delete` (existing registry; all `write`), plus the route `admin:organizations:read`. A 403 from list or mutation is always shown.
- **R5:** URL = page and pageSize only. No email or PII is involved.
- **R6:** all API text is rendered as React text.
- **R7:** the credentials paths are left unwired.
- **R8:** all six checks, including `pnpm e2e`.
- **R9:** destructive confirmations name the target, mutations are non-optimistic with inline errors, and success invalidates.
- **R10:** see steps 2, 6, 7 and 9.

## Specialist input used
- **api-platform-engineer** (2026-11-16, API at a417ddb). Adopted: contract facts, the 409 `conflict` → slug mapping on create only with a fixed string, 422 `loc[1]` mapping, `name` trim, slug regex/max, key shape, invalidate on success and on 404/409, the page clamp, removing the filters, the follow-ups. Outdated:
  - (a) `OrganizationRead` **now has `created_by`** (USR-06a), so it must not be removed from the type. It is generated and simply not shown.
  - (b) "Delete constraints: none / no 409" is **wrong at 33db316**. DELETE returns 409 `org_has_assignments` (`service.py:60-71`), now mapped.
  - (c) The open questions on filters, typed slug and slug pattern are answered by the owner (2026-11-17, 2026-11-16) and by `openapi.json:1202-1206`.
  - (d) `organizationsKeys` is used outside the feature only by `forbidden-panel.test.tsx`, which is updated.
- **frontend-developer** (2026-11-16). Adopted: reuse PAN-013 pieces, `aria-disabled` pending, a persistent live region, `overflow-x-auto`, typed-slug via `ConfirmDialog` children, reset on close, the test list, deleting the mock test and screenshot. Outdated or changed:
  - (a) The snapshot is no longer hand-patched; it is fully regenerated (owner 2026-11-17).
  - (b) The 422 shape is confirmed as `{type, loc, msg}`, and 204 handling is confirmed (`client.test.ts:77`).
  - (c) The "create dialog toggle bug" is not a bug: `useDialogState` toggles (`use-dialog-state.tsx:14-15`). The handlers are made explicit anyway.
  - (d) Use the `audit-log-table` shape, not `users-table`, because the toolbar cannot render without a search input.
  - (e) Rejected for this slice: sending only changed fields on edit (always send `name` and `description`; the API writes no audit row for a no-op), focus management after row removal (follow-up), and a shared live-region component (follow-up from PAN-013).

## Assumptions
- The default page size is 10, as on users. Page sizes come from `DataTablePagination`, and all are ≤ 100.
- UI copy is English, as on the other screens (spec §8 Q3 is still open).
- The typed-slug match is exact and case-sensitive after trimming the typed value.
- The pending text default is "Please wait…" when a `ConfirmDialog` caller passes no `pendingText`.
- The OpenAPI snapshot at 33db316 still lacks 404/409 responses for organizations. That is harmless, because `unwrap` and the middleware read the envelope at runtime.

## Blocking questions
None.

## Split proposal
- **Size.** This slice changes well over ~400 lines, about 900 excluding tests, the generated snapshot and deletions. It is one spec feature (§5.3) and mostly a rewrite of existing mock files and their tests, the same situation as PAN-013 and PAN-016.
- **Why the core is not split.** Splitting list from mutations would leave a half-mock screen, because the in-memory list goes away.
- **Slice 1 (this plan).** List, create, edit, suspend/reactivate and delete on the API; ConfirmDialog a11y; the snapshot; e2e. Covers all four ACs.
- **Slice 2 (proposed PAN-014b, `ui`, `api`).** Covers what §5.3 calls "detail" and the PAN-016 F3 note, neither of which is in this ticket's ACs:
  - an organization detail sheet (`GET /api/v1/organizations/{org_id}`, `organizationsKeys.detail`, with its own loading/404/403 states);
  - showing `created_by` (needs a user lookup gated by `admin:users:read`, or the raw id) and `updated_at`;
  - the "Events about this organization" link to `/audit-log?targetType=organization&target=<id>`, gated by `audit.view`, as `users-detail-sheet.tsx:96-110` does.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/organizations` (`?page`, `?pageSize`) | `admin:organizations:read` (route registry) | Loading row plus the live region; "No organizations yet."; an alert with Retry; a page `ForbiddenPanel` (also on refetch); the paginated table | New organization → `POST` (`organizations.create`, write) | `['organizations']` |
| Create/edit dialog | `admin:organizations:write` | Pending ("Creating…"/"Saving…", aria-disabled, close blocked); field errors (zod, 409 → slug, 422); inline 403/404/other | Edit → `PATCH {name, description}` (`organizations.update`) | `['organizations']` (success, 404, 409) |
| Suspend/reactivate confirm | `admin:organizations:write` | Pending; inline 403/404/other | `PATCH {status}` (`organizations.update`) | `['organizations']` |
| Delete confirm (typed slug) | `admin:organizations:write` | Disabled until the slug matches; pending; inline 403/404/409 `org_has_assignments`/other | `DELETE` (`organizations.delete`) | `['organizations']` |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/organizations` | `limit`, `offset` only | `Page_OrganizationRead_` | 401 (auth layer), 403 `permission_denied`, 5xx/network | ADM-001 |
| POST | `/api/v1/organizations` | `OrganizationCreate` `{slug, name, description\|null}` | `OrganizationRead` (201) | 409 `conflict` → slug; 422 `validation_error` → fields; 403; other | ADM-001 |
| PATCH | `/api/v1/organizations/{org_id}` | `OrganizationUpdate` `{name, description}` or `{status}` | `OrganizationRead` | 404 `not_found`; 422; 403; other | ADM-001 |
| DELETE | `/api/v1/organizations/{org_id}` | — | none (204) | 409 `org_has_assignments`; 404; 403; other | ADM-001 (+ assignment guard) |

## Follow-ups (record in ticket / backlog; not in this diff)
1. **org-admin-api.** List `status`, `q` and `sort` filters. Keep `org-admin-api-request.md` open, and add a request to declare the 404/409 responses (including `org_has_assignments` on DELETE) in OpenAPI.
2. **PAN-014b.** The organization detail sheet, `created_by` and `updated_at`, and the audit-log link (Split proposal).
3. **admin-pan a11y.** Move focus to a stable target (table region or the "New organization" button) after a dialog removes the row that opened it. Shared live-region component (PAN-013 follow-up).
4. **admin-pan UX.** The delete 409 `org_has_assignments` tells staff to revoke assignments first, but there is no per-org assignments view yet. Link to it once one exists (spec §5.4).
