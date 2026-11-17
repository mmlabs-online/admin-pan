**Findings: PAN-014 org-admin-api contract for organizations (read-only; API at a417ddb)**

**Endpoints (Bearer, `aud=admin`)**
- `GET /api/v1/organizations` needs `admin:organizations:read`. The only query params are `limit` (1..100, default 20) and `offset` (>=0). It returns `Page<OrganizationRead>` = `{items,total,limit,offset}`.
  - There is no filter, search or sort. Order is fixed: `created_at DESC, id`.
  - Unknown query params are ignored, so sending `status=` or `q=` would silently do nothing.
- `POST /api/v1/organizations` needs `:write`. It returns 201 + `OrganizationRead`.
- `GET /api/v1/organizations/{org_id}` returns 200, or 404.
- `PATCH /api/v1/organizations/{org_id}` needs `:write`. It returns 200 + `OrganizationRead`, or 404.
- `DELETE /api/v1/organizations/{org_id}` needs `:write`. It returns 204, or 404.

**Fields and limits**
- `OrganizationRead` is `{id (uuid), slug, name, description|null, status, created_at, updated_at}`. There is no `created_by` and no member count.
- `status` is `"active" | "suspended"`. There is no separate suspend endpoint. Suspend and reactivate are `PATCH {status}`.
- Create body:
  - `slug` is required, matches `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`, max 63. It must start and end with an alphanumeric, so `-foo`, `foo-` and uppercase are all 422.
  - `name` is required, 1..255.
  - `description` is optional, max 5000, nullable.
- PATCH body is `name`, `description` and `status` only. Slug is immutable. All three fields are optional.
  - `name: null` and `status: null` are treated as "no change", with no 422. `description: null` clears it.
  - An empty `{}` patch returns 200 and writes no audit row.
- The name `min_length=1` is not trimmed server-side. A whitespace-only name passes the API, so keep the form's `.trim().min(1)`.

**Errors (envelope `{error:{code,message,details}}`)**
- **Duplicate slug:** 409, `code: "conflict"`, `details: null`. The message is `Slug '<slug>' is already taken` and echoes the slug.
  - It is the generic `conflict` code, not a slug-specific one. The only org-related 409 is this one, so map `isApiError(e,409)` on **create** to the slug field.
  - Do not parse the message. Use a fixed UI string.
  - A concurrent-insert race also yields the same 409 (IntegrityError is caught).
- **404:** `code: "not_found"`, `details: null`. It happens on get, patch or delete of a row removed elsewhere. Refetch the list and close the dialog with a toast or inline message.
- **422:** `code: "validation_error"`. `details` is `[{type, loc:[ "body","slug"], msg}]`, with no input echoed. Map by `loc[1]` to the form field.
  - `loc` is `["body", field]`. A malformed `org_id` gives `["path","org_id"]`.
  - `msg` is pydantic English text. Prefer the client-side zod message and use `msg` only as a fallback.
  - Note `UnprocessableError` uses a different details shape (`[{field,reason}]`), but organizations never raises it.
- **403:** `permission_denied`. 401 is handled by the auth layer.

**Delete constraints**
- There is none. It is a hard delete, and no FK in `app/` references `organizations.id` (grep found none). There is no 409 "has dependants".
- Audit entries persist with `org_id` set.
- The confirm dialog should say deletion is permanent. Typing the slug to confirm (the PAN-004 follow-up) is cheap and worthwhile, but it is a UI choice and the API does not require it.

**Snapshot vs source drift**
- `src/api/schema.d.ts` is consistent with the source for organizations: the three schemas, the status enum, `Page_OrganizationRead_`, and all 5 operations.
- openapi.json carries `maxLength` and `minLength` for `description` and `name`; I saw 5000/255/min 1.
- I did not confirm `pattern` or `maxLength: 63` on `slug`, because the grep window stopped before it. Check `OrganizationCreate.slug` in `openapi.json`. The d.ts cannot express these constraints anyway.
- The 404 and 409 responses are not declared in the snapshot (only 401, 403 and 422). That is not a blocker, because `unwrap` reads the envelope at runtime.
- The `list_organizations` operation's query params should be `limit` and `offset` only. Confirm that the generated typing accepts `{limit, offset}`; the existing `ListParams` in `queries.ts` does.
- No hand-patch of the snapshot looks necessary for organizations. USR-06 (`created_by`) is the only expected future change.

**Mock vs API mapping**
- `schema.ts` `organizationSchema` has `created_by`, which the API does not return. Drop it, and drop the column or show "n/a". Do not keep it in zod as nullable.
- R2 says types must come from the generated schema, so replace the hand-written `Organization` type with `components['schemas']['OrganizationRead']`. Keep zod only for the form.
- `SLUG_PATTERN` `/^[a-z0-9-]+$/` is looser than the API. Change it to the API regex, with a max of 63.
- Add max length 255 for name and 5000 for description to the form schema.
- Form `description ''` maps to `null` on create and on patch. On patch, `null` clears it, and the API can distinguish unset from null.
- Check the mock data and the table columns for any member counts or a `created_by` display. The API has neither, so remove them. R1 forbids faking them.
- Delete `data/errors.ts` (`SlugConflictError`) and the mock data. Mock mutations become API calls.

**Filters vs R5 and ADR 0005**
- The API has no filter. Server-side acceptance is "pagination only".
- The existing mock toolbar status filter and free-text search must not be sent to the server. Either remove them, or filter client-side only within the current page, which is misleading. I recommend removing them and recording an org-admin-api follow-up: `status` and `q`/`slug` filters, and `sort`.
- URL state is then just `page` and `pageSize`, which is non-personal and fits R5.
- PAN-013 `toUsersListParams` is the template. Use `toPageParams(pagination)` only.

**Cache keys and invalidation**
- Follow the usersKeys shape: `all`, `lists()`, `list({limit,offset})`, `detail(id)`.
- Use `keepPreviousData` on the list for stable paging.
- The existing `queries.ts` key `['organizations','list',params]` works, but add `lists()` and `detail()`.
- Every mutation (create, patch, delete, set-status) invalidates `organizationsKeys.all`, non-optimistic, with `meta:{handlesOwnErrors:true}`.
- On 404 or 409 in onError, also refetch.
- After a delete that empties the last page, the offset may exceed `total`. The API returns empty items with a valid `total`, so clamp the pageIndex to the last page.
- The dependants are `organizations` keys used elsewhere (users, org dropdowns, audit). Check whether other features key off `['organizations']`.

**Recommendations**
1. (AC1) List with `limit` and `offset` only. Remove status and search from the request, and record a follow-up for API filters.
2. (AC2) Use `useCreateOrganizationMutation`, `useUpdateOrganizationMutation` (name and description), `useSetOrganizationStatusMutation` (`PATCH {status}`) and `useDeleteOrganizationMutation`. Gate them with `<Can>` on `admin:organizations:write`. List and page are gated on `read` via `queryView` / `ForbiddenPanel`.
3. (AC3) In the create dialog, `isApiError(e,409)` calls `form.setError('slug', fixed message)`. A 422 with `loc[1]` in `{slug,name,description}` calls `setError` for that field. Anything else becomes an inline dialog error (R9). A 404 on edit, status or delete shows inline text and refetches.
4. (AC4) Tests via the fake fetch for: loading, empty (`items:[]`, `total:0`), 500, 403, 409 mapping to the slug field, 422 mapping, and 404 on delete. Assert 204 handling in `unwrap` for DELETE (the PAN-013 client presumably handles empty bodies; verify).
5. Tighten `SLUG_PATTERN` and the lengths in the form schema to match the API. Add unit tests for the boundaries (63 chars, trailing hyphen, 255 and 5000).
6. Delete confirm: name the org (slug) per R9 and state it is permanent. Optionally require typing the slug.
7. Follow-ups to record: USR-06 `created_by`; list `status`, `q` and `sort` filters; slug in the 409 `details` (optional); a member count.

**Risks**
- Dropping the toolbar filter and search is a visible regression against the mock screen. Make it an explicit note in the plan.
- A 409 is generic. If the API later adds other conflicts on create (none today), the slug mapping would be wrong. Mitigate by mapping only on create.
- The pattern forbids a leading or trailing hyphen. The old form regex let `-a-` through, giving a 422 from the API. Fixing the zod regex avoids it.
- A concurrent suspend and delete from two staff gives 404 on the second. Handle it with a refetch.
- Pagination offset drift after deletions (see above).
- A single-page failure of the 403 state: the PAN-013 `ForbiddenPanel` is for the list, and write-403s must also appear inline in dialogs.

**Open questions**
- Remove the status filter and search, or keep them as client-side within the loaded page? (Recommend remove.)
- Require typing the slug for delete? (Recommend yes, low cost.)
- Does `pattern`/`maxLength: 63` for `slug` exist in `openapi.json`? Verify, as above.
- Do other features (users, role assignments, audit) read from `organizationsKeys`, so their invalidation is affected?

Files: /home/user/admin-pan/src/features/organizations/api/queries.ts, /home/user/admin-pan/src/features/organizations/data/schema.ts, /home/user/admin-pan/src/features/organizations/data/errors.ts, /home/user/admin-pan/src/api/schema.d.ts, /home/user/admin-pan/src/api/openapi.json, /home/user/admin-pan/src/api/errors.ts, /home/user/admin-pan/src/features/users/api/queries.ts, /home/user/org-admin-api/app/modules/organizations/{router,schemas,service,repository,models}.py, /home/user/org-admin-api/app/core/errors.py, /home/user/org-admin-api/app/core/pagination.py.

Not read: ADR 0004 and 0005, the mock screen components, and `src/test-utils/api.ts`. The ADR points above come from the ticket's orchestrator notes, not from the ADR files.
