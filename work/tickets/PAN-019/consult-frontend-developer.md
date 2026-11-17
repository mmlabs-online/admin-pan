# PAN-019 consult (frontend-developer): org entitlements

## Findings

**API contract (org-admin-api c41ef57)**
- Routes: `GET|POST /organizations/{org_id}/entitlements`, `PATCH|DELETE .../{entitlement_id}` (`app/modules/entitlements/router.py:15-88`). Read needs `admin:entitlements:read`, the other three need `admin:entitlements:write`. Both keys are `is_admin` and granted to no role (migration `20261117_c8a1f4e72d95_adm006_org_entitlements.py:9`; plan.md:239). In practice only `admin:*` holders have them. Staff with `organizations:*` alone will not.
- `EntitlementRead` (`schemas.py:41-52`): `id, org_id, app_key, plan, limits: dict[str,int], enabled, active, created_at, updated_at`. `active` = enabled AND org active AND app active (spec note, spec-v1.md:59 in the API repo). The API does not tell you which of the three failed.
- Validation (`schemas.py:9-19`):
  - `plan` must match `^[a-z0-9][a-z0-9_-]{0,62}$`.
  - Limit keys must match `^[a-z][a-z0-9_]{0,63}$`.
  - Limit values are strict integers, 0..2^53-1, at most 32 entries.
  - `EntitlementCreate` is `{app_key, plan, limits={}, enabled=true}` with `extra=forbid`.
  - `EntitlementUpdate` is all-optional. An explicit `null` means no change. `limits` replaces the whole object (`schemas.py:31-38`, `service.py:112-114`).
  - An update that changes nothing writes no audit row (`service.py:118`).
- 409 reasons in `details[0].reason` (`service.py:69-77`): `admin_app`, `app_disabled`, `org_mode_none`, `entitlement_exists`. A concurrent grant also maps to `entitlement_exists`. A 404 can mean an unknown org, an unknown entitlement, or `details[0].reason=unknown_app` on POST (`service.py:66-68`). A UI that tells the three 404s apart must read `details`.
- There is no `GET` for a single entitlement and no plan catalog. Plan is a free label and billing is out of scope (R11), so no plan dropdown.
- The list takes `limit`≤100, `offset` and `active` (bool). The number of rows is bounded by the number of apps with `org_mode=required`, so it is small.

**admin-pan today**
- The organizations screen is list-only. It has row actions for edit, status and delete (`organizations/components/data-table-row-actions.tsx:21-90`). The whole menu is gated on `organizations.update|delete` at `:27`. The provider only knows `'create'|'edit'|'status'|'delete'` (`organizations-provider.tsx:6`). There is no sheet and no `GET /organizations/{org_id}` hook (`api/queries.ts:23-31` has only list keys).
- `GET /api/v1/organizations/{org_id}` already exists in the snapshot with `x-permission admin:organizations:read` (`src/api/openapi.json:6972`). There is no registry action for it.
- The apps detail sheet is the pattern to copy:
  - Opened via `open==='view'` and `currentRow` (`apps-dialogs.tsx:66-71`).
  - Tabs mounted lazily, so nothing is fetched before the tab is selected (`app-permissions-tab.tsx:27-28`).
  - `placeholderData: currentRow` plus `queryView` with a forbidden/error/404 panel (`app-detail-sheet.tsx:43-79`).
  - `inFlight` ref guard, `aria-disabled` while pending, Escape ignored while pending (`app-permission-form-dialog.tsx:56-79,111-116,229-236`).
  - Focus return: `onCloseAutoFocus` plus `returnFocus` for Dialog, an effect keyed on state for AlertDialog (`app-permissions-tab.tsx:35-47`, `apps-dialogs.tsx:29-41`).
  - Switch toggle opening a `ConfirmDialog` that shows the API error and flips only after the refetch (`app-permission-admin-dialog.tsx:56-86`).
  - Error mapping by status and `details[].reason`, with helpers `detailObjects`, `firstReason`, `bodyFields`, `isUnknownOutcome` (`apps/data/errors.ts:43-69,219-229`). The helpers are not exported. Copy them or lift them to `src/lib/` (see R7 below).
- Org mutation hooks already set the pattern: `meta.handlesOwnErrors`, never optimistic, invalidate on success, refetch on 404/409 (`organizations/api/queries.ts:62-77`).
- The registry is `src/lib/permissions/registry.ts`. `ADMIN_PERMISSIONS` is at `:7-17`. `ApiOperation` is typed against generated `paths` (`:25-26`).
- `registry.test.ts:22-27` asserts `ADMIN_PERMISSIONS` equals the set of all `x-permission` values in `openapi.json`. `:30-41` checks each action's operations against the snapshot.
- I read the scratchpad `oaa-new2.json` (`/tmp/claude-0/-home-user/ce8daed7-26f0-593f-9bf8-a95df9f28817/scratchpad/oaa-new2.json`) and it adds exactly two `x-permission` values over the current snapshot: `admin:entitlements:read` and `admin:entitlements:write`.

**Regenerating the snapshot has knock-on effects (the biggest hidden cost)**
1. `src/features/audit-log/data/schema.ts:64-71` has compile-time `Same<>` guards against the generated enums. The new snapshot adds these actions:
   - `entitlement.granted`
   - `entitlement.updated`
   - `entitlement.revoked`
   - `app.join_requested`
   - `app.join_request_approved`
   - `app.join_request_rejected`

   It also adds targets `entitlement` and `join_request`. `pnpm typecheck` will fail until `auditActionSchema` and `auditTargetSchema` are extended. `data.ts:25` (`Record<AuditAction, Tone>`) and `:80` (`Record<AuditTarget, string>`) are exhaustive records, so they need entries too (probable labels: "Entitlement", "Join request"). The join-request additions are not PAN-019 scope, but they cannot be left out without breaking typecheck. Record them as an unavoidable enum-only addition.
2. `registry.test.ts:22` fails until the two new keys are in `ADMIN_PERMISSIONS`.
3. Other drift since 33db316 (the last PAN-014 pin) may appear. Check `git diff --stat`.

**e2e fake API**
- `e2e/support/fake-api.ts:349-350` matches handlers by the exact string `"METHOD /path"`. The existing idiom registers per-row routes in a loop (`:278-312`, `addRevokeRoute` `:271-277`). Only `GET /api/v1/organizations` is faked (`:249`), not the detail endpoint. Of the seeded apps, only `calechip` has `org_mode: 'required'` (`:92`). `stoktok` and `admin` are not grantable.
- CORS allow-methods already include PATCH and DELETE (`:335`).
- The existing org e2e asserts zero writes under `/api/v1/organizations*` (`e2e/pages.e2e.ts:170-176`). A new entitlements test must be a separate test.

## Recommendations

1. **Placement: an org detail sheet with an Entitlements tab, no new route.**
   - It matches Users and Apps and needs no `routeTree.gen.ts` change or `ROUTE_PERMISSIONS` entry.
   - Add `'view'` to `OrganizationsDialogType` (`organizations-provider.tsx:6`).
   - Render `OrganizationDetailSheet` in `organizations-dialogs.tsx` after `:42`, with the same `closeWithRow` and focus-restore as `apps-dialogs.tsx:21-41`.
   - Add a "View" (or "Entitlements") item to row actions and make the org name cell open it. Widen the `Can` gate at `data-table-row-actions.tsx:27` to include the view action.
   - Acceptance criterion: "Entitlements per org listed".

2. **Fold in a minimal PAN-014b shell, not the whole of it.**
   - In scope: the `Sheet` + `Tabs` (Overview | Entitlements), a header with name and slug, and an Overview tab that shows list-row fields through `placeholderData`.
   - I recommend including `GET /organizations/{org_id}` and `organizationsKeys.detail`, because the 404 and 403 panels depend on it (`app-detail-sheet.tsx:62-79`). Add `organizations.view` to `ACTIONS` with `GET /api/v1/organizations/{org_id}`.
   - Leave for PAN-014b: `created_by`/`updated_at` rows and the audit-log link (PAN-014/plan.md:334-337).
   - Document this as a deliberate overlap in the PAN-019 plan under R7. Without a sheet, AC1 cannot be met.
   - The Overview tab must show `status`. A suspended org makes every entitlement `active:false`. Explain "Enabled, but not active" with generic copy such as "Organization suspended or app disabled".

3. **Registry keys (R4).**
   - Add `'admin:entitlements:read'` and `'admin:entitlements:write'` to `ADMIN_PERMISSIONS` (`registry.ts:7-17`, keep it sorted).
   - Add these `ACTIONS`:
     - `entitlements.view` -> `admin:entitlements:read`, `GET /api/v1/organizations/{org_id}/entitlements`
     - `entitlements.grant` -> `admin:entitlements:write`, `POST` on the same path
     - `entitlements.update` -> `admin:entitlements:write`, `PATCH .../{entitlement_id}`
     - `entitlements.revoke` -> `admin:entitlements:write`, `DELETE .../{entitlement_id}` (only if revoke is built, see Q2)
     - `organizations.view` -> `admin:organizations:read`
   - Hide the Entitlements tab when `entitlements.view` is not permitted. Use `Can` with `disable` and `describedBy` for the write controls. Handle a runtime 403 with `ForbiddenPanel` (`isForbidden`/`forbiddenCopy`).
   - Because the keys are admin-only, the copy for a missing permission should say "needs admin:*" like `app-permission-admin-dialog.tsx:73`.

4. **Snapshot and types.**
   - Pin org-admin-api c41ef57 and use the generator, as in PAN-014/plan.md:156-157: `uv run python -m app.cli openapi --output src/api/openapi.json`, then `pnpm api:types`.
   - Do not copy `oaa-new2.json` as is. It is minified and the generator writes `indent=2, sort_keys=True` (`app/core/openapi.py:73-75`).
   - Record the commit and commands in the impl-log.
   - Make the audit-log enum and label additions in the same commit (see Findings).
   - `schema.test.ts` for entitlements should read `openapi.json` via `?raw`, as the org schema test does. It should assert the plan and limit-key patterns, the 0..2^53-1 range and the 32-entry cap. Check that FastAPI emits `pattern` for the `Annotated` types and `maxProperties` for `Limits`. If it does not, hardcode the constants in the schema with a comment naming `schemas.py:9-19`, and drop the drift assertion for that part.

5. **Query layer: `src/features/organizations/api/entitlements-queries.ts` (or a new `src/features/entitlements/`).**
   - Use the generated `components['schemas']['EntitlementRead|Create|Update']` types (R2).
   - Keys: `entitlementsKeys.list(orgId)` under `['organizations', 'entitlements', orgId]`, so `organizationsKeys.all` invalidations also hit it (`queries.ts:23`). Mind the key shape: `organizationsKeys.lists()` is `[..., 'list']`, so entitlement keys must not collide with it.
   - List with `limit: 100`. If `total > 100`, show a "showing N of total" notice.
   - Mutations copy `useOrganizationMutationOptions` (`queries.ts:66-77`): invalidate the entitlement list and the org list; refetch on 404/409.
   - Never optimistic (R9).

6. **UI: tab, table and dialogs.**
   - Table with `aria-label="Entitlements of <org name>"` and `scope='col'` headers. Columns: App (key, mono), Plan, Limits, Enabled (Switch), Status (`active` badge, text rather than colour alone), Updated, Actions.
   - Limits render as `key: value` text, and a "None" placeholder for `{}`.
   - Empty state: "No products enabled yet. Grant one." with the Grant button.
   - Grant dialog fields:
     - **App**: a Select fed by `GET /apps?limit=100`, filtered client-side to non-`admin`, `active` and `org_mode=required` apps that the org does not already have. This is advisory only. The API's 409/404 mapping stays and is covered in unit tests.
       - If `GET /apps` returns 403, fall back to a plain `app_key` text input.
       - If no apps are eligible, show "No eligible apps" in place of the select.
     - **Plan**: text, pattern per API, hint "lowercase letters, digits, - and _".
     - **Limits**: `useFieldArray` rows of key and value, "Add limit", remove button per row.
     - **Enabled** checkbox, default on.
   - Edit dialog: plan and limits only (app is immutable).
   - Edit form details:
     - Limit value `Input` is `type='text' inputMode='numeric'`, validated with `/^\d+$/` and `Number.isSafeInteger`. Do not use `type=number`, which loses precision above 2^53 and accepts `e` notation.
     - The zod schema must reject duplicate limit keys client-side, because an object would silently dedupe them. It must also cap at 32 rows, check key and plan patterns, and run cross-field validation with `superRefine`.
     - Inline errors are linked via `FormMessage`. Add a row-level `aria-label` such as "Limit name, row 2".
     - PATCH sends only changed fields, and sends the whole `limits` object when any limit changed. Disable Save while the form is unchanged, since the API writes no audit row for a no-op.
     - Send `{}` to clear all limits. Never send `null`.
   - Enable/disable: a Switch in the row opens `ConfirmDialog` naming the org and the app. Disabling is access-changing (R9); copy: "Disabling stops <org> from using <app>. Plan and limits are kept." Enabling also confirms (AC2 "changes confirmed"). Flip only after the refetch. Restore focus to the same switch (`app-permissions-tab.tsx:35-47`).
   - Every mutating dialog needs the `inFlight` ref, `aria-disabled`, a `role=status` announcement, Escape/outside-click ignored while pending, and an inline error area.
   - Error mapping in `entitlements/data/errors.ts`:
     - 409 `admin_app` / `app_disabled` / `org_mode_none` -> specific text, shown as an app field error.
     - 409 `entitlement_exists` -> "This organization already has this app." and refetch.
     - 404 with `unknown_app` -> app field error. A 404 without it -> "no longer exists".
     - 422 `validation_error` -> map `loc` `['body', field, ...]` to plan, limits or app. `limits.<key>` entries map to the limits group, using the `bodyFields` approach but keeping the key path.
     - 403 -> `ForbiddenPanel`.
     - Network, timeout and 5xx on POST -> "couldn't confirm; check the list" (`isUnknownOutcome` pattern).
   - Audit (AC2): the API writes the audit rows. The UI only says "Changes are recorded in the audit log" in the dialog description. A deep link to the audit log is optional. Its filter schema (`audit-log/data/schema.ts`) will accept `entitlement` once the enum is extended, so `?targetType=entitlement&target=<id>` would work. Put it in PAN-014b or a follow-up.

7. **Tests (R8).**
   - Unit tests:
     - `entitlements/data/schema.test.ts` (boundaries and drift).
     - `errors.test.ts` (every status and reason above).
     - `queries.test.tsx` (URLs, bodies, invalidation).
     - A registry test passes for free once the two keys are added and the operations exist in the snapshot.
   - Browser component tests with a network-level mock, following `app-permissions-tab.test.tsx` and `organizations-status-dialog.test.tsx`:
     - Tab states: loading, empty, error with Retry, 403, list.
     - Grant: success (POST body, toast, refetch, focus returns to the button) and the 409 reasons inline.
     - Edit: only changed fields are PATCHed, limits are sent whole, duplicate key blocked.
     - Toggle: cancel sends nothing, confirm sends PATCH, a double click sends one request, pending state, flip only after the refetch.
     - Permission hiding: the tab is hidden without `entitlements.view` and the write controls are disabled without `.write`.
   - e2e, in `e2e/support/fake-api.ts` and `e2e/pages.e2e.ts`:
     - Add `type EntitlementRead` and an `ENTS` per-install map keyed by org id.
     - Seed `acme` with a `calechip` entitlement. Seed `globex` (suspended) with an entitlement that has `enabled:true, active:false`.
     - Add routes `GET /api/v1/organizations/{id}` and `GET|POST /api/v1/organizations/{id}/entitlements` in a per-org loop. Register PATCH and DELETE per row, and again for rows created by POST, like `addRevokeRoute` (`:271-277`).
     - Add a new test: open the sheet, select the Entitlements tab, run axe on the sheet and the dialogs, cancel the toggle (0 writes), grant once (assert the POST body), done.
     - The 409 reasons stay in unit tests, because the filtered select will not offer `stoktok` or `admin`.

## Risks

- The snapshot regeneration touches `audit-log` enums and the registry test as above. If this is not done in one step, `pnpm typecheck` or `pnpm test` fails.
- Other changes since c41ef57 may appear in the snapshot diff, so verify before committing.
- `admin:entitlements:*` is not granted to any role. In real use the screen works only for `admin:*` users. e2e uses `admin:*` (`fake-api.ts:228-233`), so no permission-denied path is covered there. Cover it in unit tests.
- Two staff editing the same entitlement: a PATCH replaces `limits` wholesale, so last write wins. Refetch the row when the edit dialog opens and show a "changed by someone else" message on a 404/409.
- Precision: values up to 2^53-1 are valid. JSON parsing is safe up to that, but display with `toLocaleString` only for values <= `Number.MAX_SAFE_INTEGER`.
- Grant-dialog app Select depends on `GET /apps` (needs `admin:apps:read`). The text-input fallback is in the plan above. Without it the grant flow is unusable for someone who holds only the entitlements permissions.
- Error-helper duplication: `apps/data/errors.ts:43-69` helpers are private. Copying is quick, but lifting `detailObjects`/`firstReason`/`bodyFields` to `src/lib/` would touch apps files, which is R7 territory. Prefer copying and note a follow-up.

## Open questions

1. **Scope: fold minimal PAN-014b.** Is a detail-sheet shell inside PAN-019 acceptable, with the audit link and `created_by`/`updated_at` staying in PAN-014b?
2. **Revoke (DELETE).** The AC covers list/enable/disable/set plan and limits, not delete. I recommend deferring revoke to a follow-up, since disable covers the need and revoke is irreversible. If the owner wants it, use a type-to-confirm alert dialog modelled on the org delete dialog (`organizations-delete-dialog.tsx`) and add the `entitlements.revoke` action.
3. **"Changes confirmed" (AC2).** Does it mean a confirm dialog for every change, or just for enable/disable, with the Save click on the edit form counting as confirmation for plan/limits? My default is the latter, with a confirm dialog for toggles and no extra confirm for Save.
4. **Staff with `organizations:read` but not `entitlements:read`.** Hide the tab (my default) or show a disabled tab with an explanation?
5. **Grant flow.** Are the Select plus the `app_key` text fallback acceptable, or should the app picker be omitted and typed free-form?
6. **Spec text.** Spec §5.6 (`docs/spec-v1.md:58-60`) still says "ADM-006 (backlog)". Update that line once ADM-006 is done. This is outside this repo's agent scope, so flag it to the owner.
