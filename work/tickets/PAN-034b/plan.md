Status: READY

# Plan — PAN-034b: Apps — set an app's default, org-owner and super-admin roles (slice 2 of PAN-034)

## Spec summary
- `docs/spec-v1.md` §5.4: "Apps registry (join policy, org mode, origins, default role), roles and their permissions, role assignments per user (app scope or one org), revoke sessions."
- Ticket scope (quoted):
  - 3. "**Edit app**: let staff set Default role, Org owner role and Super-admin role. Selects list the app's roles by key and name, with a "None" option where clearing is allowed. Disable the Super-admin field without `admin:*` and say why. Send only the fields that changed."
  - 4. "**App detail sheet** (`app-detail-sheet.tsx`): show those three roles by key (e.g. `simap:admin`), not by raw id."
- Goal: "Unblocks simap's `org_owner_role_id = simap:admin` (org-admin-api `docs/consumers.md` … step 4)". consumers.md:248: "`PATCH /api/v1/apps/simap` `{"org_owner_role_id": <simap:admin id>}` (invitations need it)."
- API contract, checked on org-admin-api `main` a77e819 (read-only clone):
  - `app/modules/rbac/router.py:152-168`: `PATCH /api/v1/apps/{key}`, `x-permission: admin:apps:write`, `requires_super="conditional"`, `super_when="Changing the admin app or the app's super-admin role designation"`. The 409 and 422 descriptions name `super_admin_role_designated`, `role_has_assignments` and the eight `super_admin_role_id` reasons.
  - `rbac/schemas.py:59-93`: `AppUpdate` (`extra="forbid"`) adds `super_admin_role_id: uuid | None`. Null is allowed only for `default_role_id`, `org_owner_role_id` and `super_admin_role_id`. `schemas.py:96-111`: `AppRead` (through `AppFields`) adds `super_admin_role_id: uuid | None = None`, which is optional, like `org_owner_role_id`.
  - `rbac/service.py:441-583` (`_update`): a sent field equal to the stored value is dropped from `changes`. `admin:*` is required when `super_admin_role_id in changes` (l.481, set or clear) and for any real change to the `admin` app (l.456). The refusal order and the (field, reason) pairs are exactly the 25 rows in `work/tickets/PAN-034/consult-api-platform-engineer.md` §B. I re-checked them against l.456-629. Codes: 422 is `unprocessable`, 409 is `conflict` (`app/core/errors.py:40-45`).
  - `rbac/schemas.py:245-279`: on main, `RoleDefinitionRead` has `is_org_owner`, `is_super_admin` and `assignment_count`. Our snapshot (`src/api/openapi.json:3161`) has only `is_system`, `is_default` and `privileged`. It stays as it is (decision S0, see Assumptions).
  - Owner role vs. admin-only permissions (identity consult F6). `service.py:496-502` refuses an owner role that holds an `is_admin` permission: 422 `org_owner_role_id`/`role_has_admin_permissions`. The simap recipe (`consumers.md:241,246`) gives `simap:admin` "invite + admin-only key". Owner decision 2026-11-28: implement now, show this refusal clearly, no UI workaround.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | "A staff user can set simap's Org owner role to `simap:admin` from the UI; the detail sheet then shows "simap:admin"." | `app-form-dialog.test.tsx` › "simap: set Org owner role to simap:admin → review lists 'Org owner role: None → simap:admin' → Confirm and save sends one PATCH with body exactly {"org_owner_role_id":"<simap:admin id>"}; then View simap shows simap:admin, never the uuid". This runs on the network fake (`appsServer`). The PATCH handler updates the app that the refetch returns. |
| 2 | "Every API refusal for `PATCH /api/v1/apps/{key}` role changes shows a specific message, chosen by (field, reason); nothing fails silently." | `errors.test.ts` › the `appFormError` role table covers every (field, reason) pair from api consult §B rows 3–25. That includes the colliding reasons on more than one field, routed by the fields that were sent, and the 409s that must not read "changed by someone else". The 403 edit copy says "Nothing was saved." DOM: `app-form-dialog.test.tsx` › "422 org_owner_role_id/role_has_admin_permissions → field error on Org owner role …" (F6), "409 super_admin_role_id/role_has_assignments → field error on Super-admin role", "403 admin_wildcard_required → inline panel …". |
| 3 | "Tests cover the role-field PATCH diff (only changed fields; untouched roles never sent as `null`) and the refusal-message mapping, including the reasons shared by several fields." | `data.test.ts` › the `appUpdateDiff` cases. `app-form-dialog.test.tsx` › "untouched roles are never sent" and "roles failed to load: role selects disabled; a name edit sends {name} only". `errors.test.ts` › the shared-reason cases (`role_has_org_permissions`, `org_mode_required`, `unknown_role`, `same_as_default_role`, `same_as_super_admin_role`). |
| — | R4: Super-admin field gated on `admin:*` | `registry.test.ts` (existing super test, now also on `apps.setSuperAdminRole` with `conditional`). Dialog test › "without admin:* the Super-admin role select is disabled with 'Requires admin:*. Only super admins can change the super-admin role.' linked by aria-describedby; with admin:* enabled". |
| — | R9: confirmation naming the target, not optimistic | Dialog test › "role change → review phase; Back sends nothing and returns to the form with values kept; Confirm and save sends one PATCH (double click → one)". |
| — | R8 | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` all green. `pnpm api:types && git diff --exit-code src/api/schema.d.ts` is clean. `pnpm e2e` is green (CI). |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/api/openapi.json` | Fragment refresh from a77e819, using the PAN-034 method (Approach §0). **Replace** `components.schemas.AppRead` and `AppUpdate` (adds `super_admin_role_id` and its description). **Replace** `paths['/api/v1/apps/{key}'].patch` (adds `x-requires-super: "conditional"`, the super-when text, and the new 409/422 descriptions). Nothing else. `RoleDefinitionRead` is **not** touched (S0). | R2 |
| `src/api/schema.d.ts` | Output of `pnpm api:types` | R2, CI drift check |
| `src/lib/permissions/registry.ts` | Add `'apps.setSuperAdminRole': superOf('admin:apps:write', 'conditional', 'PATCH /api/v1/apps/{key}')` | R4, S3. The existing registry test then checks it against the refreshed snapshot. |
| `src/features/apps/data/app-schema.ts` | `appFormSchema` gains `default_role_id`, `org_owner_role_id`, `super_admin_role_id`, each `z.string()`. Export `ROLE_NONE = 'none'` and `type AppRoleField = 'default_role_id' \| 'org_owner_role_id' \| 'super_admin_role_id'` plus `APP_ROLE_FIELDS`. | Scope item 3. A sentinel is needed because Radix Select forbids `''`. |
| `src/features/apps/data/data.ts` | Pure helpers (Approach §2): `appUpdateDiff`, `roleSelectItems`, `describeRole`, `roleChanges`, `superAdminNotAlone`, `ROLE_FIELD_LABELS`. | Scope items 3–4. Pure logic can be unit-tested (AC3). |
| `src/features/apps/data/data.test.ts` | Tests for those helpers | AC3, R8 |
| `src/features/apps/data/errors.ts` | `AppFormField` and `APP_FIELDS` gain the three role fields. `appFormError` ctx gains `sent?: readonly string[]`. Add a (field, reason) table for 422 `unprocessable` and the reasoned 409s. Remove `role_has_org_permissions` and `org_mode_required` from the reason-only `UNPROCESSABLE_FIELD`; they are routed by field and `sent`. Edit-mode 403 copy adds "Nothing was saved." | AC2 (api consult B, identity F5/R-D, appsec 5–6) |
| `src/features/apps/data/errors.test.ts` | Update the existing reason-only `role_has_org_permissions` / `org_mode_required` case, which used `field: 'x'`, to real fields and `sent`. Add the role table. | AC2/AC3 |
| `src/features/apps/components/app-form-dialog.tsx` | Edit mode on a non-admin app: three role selects fed by `allRoleDefinitionsQueryOptions`, the super-admin gate, the diff through `appUpdateDiff`, the review phase (R9), and the "save the super-admin role on its own" guard. Error routing passes `sent`. | Scope item 3 |
| `src/features/apps/components/app-form-dialog.test.tsx` | New tests below. The existing tests stay as they are (stoktok/admin bodies are unchanged). | AC1–AC3, R8 |
| `src/features/apps/components/app-detail-sheet.tsx` | Resolve the role ids to `<code>{key}</code>` from `allRoleDefinitionsQueryOptions`. Add a "Super-admin role" row when `org_mode` is `required`. | Scope item 4 |
| `src/features/apps/components/app-detail-sheet.test.tsx` | The two tests that assert raw uuids now assert keys. Add the loading / unknown / error / super-admin row tests. | Scope item 4, R8 |
| `src/features/apps/components/test-data.ts` | `ROLE_DEFINITIONS: Record<string, RoleDefinition[]>` and `roleDefinitionsPage()`. Keys: `stoktok:member` (id `4d4d…`, is_default), `calechip:owner` (id `5e5e…`), `calechip:member`, and simap `simap:admin`, `simap:manager`, `simap:user`, `simap:support` (non-system, for the super-admin cases). | Fixtures for AC1, the sheet and the selects |
| `src/features/apps/components/test-fixtures.tsx` | `appsServer`: add a `/role-definitions` GET branch (honours `limit`/`offset`, returns a `Page`) | The dialog and sheet now call it. Today it 404s (frontend consult). |

No change to `src/features/apps/api/queries.ts`. `useUpdateAppMutation` already invalidates `['apps']`, and that covers `rolesKeys.*`, which are nested under `appsKeys.detail(key)`. No change to `e2e/`. The e2e fake already serves `role-definitions` (`e2e/support/fake-api.ts:626`), and no e2e test opens Edit app or asserts a role id. No ADR change: ADR 0004's PAN-034 amendment already names this reuse (l.40).

The implementer must not touch other files without recording why in impl-log (R7).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `data.test.ts` › "appUpdateDiff: unchanged values → {}; name/join_policy/org_mode/origins as before; a role changed to another id → that id; changed to 'none' → null; role fields not in `editable` are never sent, even if their value differs; a current `undefined` super_admin_role_id equals 'none' (no diff)" | AC3 |
| `data.test.ts` › "appUpdateDiff: untouched default role (current id) with org owner changed → body has org_owner_role_id only" | AC3, AC1 body |
| `data.test.ts` › "roleSelectItems: 'None' first, then `key — name` sorted by key, ' · privileged' only when `annotatePrivileged`; a current id not in the list is added as 'Unknown role (<id>)'" | S4, option hints |
| `data.test.ts` › "describeRole: null → 'None'; found → key; not found → 'Unknown role (<id>)'" | Scope item 4 |
| `data.test.ts` › "roleChanges: one entry per changed role field with from/to keys and the consequence copy for default set/clear, owner set/clear, super-admin set/clear/replace; non-role changed fields returned as `others`" | R9 copy |
| `data.test.ts` › "superAdminNotAlone: true only when super_admin_role_id is in the diff with any other key" | Super-admin save on its own |
| `errors.test.ts` › "appFormError 422 role table: every (field, reason) of api consult §B → the expected field and fixed copy; never 'server text'" (table-driven, one row per pair below) | AC2 |
| `errors.test.ts` › "shared reasons: default_role_id/role_has_org_permissions → org_mode when sent=['org_mode'], → default_role_id when default_role_id was sent; org_owner_role_id/org_mode_required → org_mode when sent=['org_mode'], → org_owner_role_id otherwise; org_owner_role_id/same_as_default_role → default_role_id when only default_role_id was sent, else org_owner_role_id; unknown_role on each of the three fields has that field's error" | AC3 shared reasons |
| `errors.test.ts` › "409: super_admin_role_id/role_has_assignments → super-admin field; org_mode/super_admin_role_designated and org_mode/org_mode_in_use → org_mode; origin_taken unchanged; a 409 with an unmapped reason → 'The API refused this change.'; reason-less 409 on admin → admin rule, on others → 'changed by someone else'" | AC2, not silent |
| `errors.test.ts` › "edit 403 admin_wildcard_required / permission_denied → forbidden alert whose description ends 'Nothing was saved.'; create 403 unchanged" | AC2, identity R-C |
| `errors.test.ts` › "validation_error loc body.org_owner_role_id → org_owner_role_id field" | APP_FIELDS |
| `app-form-dialog.test.tsx` › "simap: set Org owner role to simap:admin → review lists 'Org owner role: None → simap:admin' → Confirm and save sends one PATCH with body exactly {"org_owner_role_id":"<simap:admin id>"}; then View simap shows simap:admin, never the uuid" | **AC1** |
| `…dialog.test.tsx` › "selects: Default role always; Org owner role and Super-admin role only while Org mode is Required (live); options are 'None' + 'key — name'; admin app and Register show no role selects" | Scope item 3, S1 |
| `…dialog.test.tsx` › "untouched roles are never sent: calechip with owner set, edit name only → PATCH {name}; no review phase" | AC3 |
| `…dialog.test.tsx` › "role change → review phase; Back sends nothing and returns to the form with the chosen values kept; Confirm and save → one PATCH even on double click; 'Saving…' with aria-disabled" | R9 |
| `…dialog.test.tsx` › "Org owner → None: review warns 'Org creation and invitations stop working for Simap.'; body {"org_owner_role_id":null}" | Clear path, R9 copy |
| `…dialog.test.tsx` › "without admin:* (granted every permission except admin:*) the Super-admin role select is disabled with 'Requires admin:*. Only super admins can change the super-admin role.' linked by aria-describedby; with admin:* it is enabled" | R4, scope item 3 |
| `…dialog.test.tsx` › "super-admin changed together with another field → field error 'Save the super-admin role on its own …' and no PATCH; super-admin alone → review with the cross-org warning → body {super_admin_role_id}" | Owner decision 2 |
| `…dialog.test.tsx` › "422 org_owner_role_id/role_has_admin_permissions → back in the form; Org owner role shows 'This role holds admin-only permissions, so it can't be the org owner role. …' (aria-invalid, linked), focus on that select, chosen value kept" | AC2, F6 |
| `…dialog.test.tsx` › "409 super_admin_role_id/role_has_assignments → error on Super-admin role; 403 admin_wildcard_required → inline panel with 'Nothing was saved.', the dialog stays open with values kept" | AC2, R4 |
| `…dialog.test.tsx` › "roles failed to load: role selects disabled with 'Couldn't load this app's roles.' + Retry; a name edit sends {name} only (no role keys); a current id missing from the list shows 'Unknown role (<id>)' and is not sent" | S4, appsec data-safety |
| `app-detail-sheet.test.tsx` › "Overview: Default role shows stoktok:member (not the uuid)"; "calechip shows Org owner role calechip:owner and Super-admin role None" (replaces the raw-id assertions) | Scope item 4 |
| `app-detail-sheet.test.tsx` › "role names loading → 'Loading…'; an id not in the list → 'Unknown role (<id>)'; role-definitions 500 → the id plus '(role names couldn't be loaded)'; no role-definitions request when all three ids are null" | Scope item 4, never blank |

## Approach
0. **Snapshot (R2), the PAN-034 method.**
   1. `git -C /home/user/mmlabs-online/org-admin-api rev-parse --short HEAD` must print `a77e819`.
   2. Generate into the scratchpad as in PAN-034 (`uv run python -m app.cli openapi --output <scratchpad>/openapi-a77e819.json`, with `UV_PROJECT_ENVIRONMENT` and `DATABASE_URL` as recorded in PAN-034's impl-log).
   3. A scratchpad Python script replaces exactly `components.schemas.AppRead`, `components.schemas.AppUpdate` and `paths['/api/v1/apps/{key}'].patch`, keeping key order and formatting as PAN-034 did. Every `$ref` they use (`JoinPolicy`, `OrgMode`, `AppStatus`, `ErrorEnvelope`, …) must already be deep-equal in the snapshot; otherwise stop and record it. If the generated `AppRead`/`AppUpdate` differ from the snapshot by more than `super_admin_role_id` and descriptions (for example a new required field), stop and record it in impl-log.
   4. `pnpm api:types`. `git diff src/api/` may show only those three fragments. Record commit, command and diff stat.
   5. Fallback, only if the generator cannot run: hand-transcribe from `rbac/schemas.py:59-111` and `rbac/router.py:152-168`, and record "hand-patched" (precedent PAN-013).
1. **Registry.** Add `apps.setSuperAdminRole` (S3). `apps.update` and `roles.setDefault` stay `perm('admin:apps:write', …)`. The permission test still passes, because `x-permission` is unchanged.
2. **Pure helpers in `data/data.ts`.** Types come from `App`, `AppForm`, `AppUpdate` (`components['schemas']`) and `RoleDefinition` (`@/features/roles/data/role-schema`). No hand-written copies.
   - **`appUpdateDiff(current: App, values: AppForm, editable: readonly AppRoleField[]): AppUpdate`**
     - Moves today's inline `changed` object out of the dialog unchanged (name, join_policy, org_mode, trimmed origins vs `sameOrigins`).
     - For each role field **in `editable` only**: `toApi(v) = v === ROLE_NONE ? null : v` is compared with `current[field] ?? null`, and the field is included only when they differ. So a field that is not editable, or is untouched, is never sent (S4).
   - **`roleSelectItems(roles: RoleDefinition[], currentId: string | null | undefined, { annotatePrivileged })`**
     - Returns `[{ value: 'none', label: 'None' }, …roles sorted by key as { value: id, label: `${key} — ${name}${annotatePrivileged && privileged ? ' · privileged' : ''}` }]`.
     - If `currentId` is set and not in `roles`, it appends `{ value: currentId, label: `Unknown role (${currentId})` }`.
     - No option is ever disabled or removed because of a flag (owner decision 3; R1).
   - **`describeRole(id, byId: Map<string, RoleDefinition>)`**
     - Returns `{ kind: 'none' } | { kind: 'role', key } | { kind: 'unknown', id }`.
   - **`roleChanges(current, diff, byId, appName)`**
     - Returns `{ changes: { field, label, from, to, consequence }[], others: string[] }`. `from` and `to` are role keys, "None" or "Unknown role (<id>)". `others` holds the labels of the non-role keys in `diff`.
     - Labels: `ROLE_FIELD_LABELS` = Default role / Org owner role / Super-admin role.
     - Consequence copy (identity R-E, appsec):

       | Change | Consequence |
       |---|---|
       | default set or changed | "Accounts that join {appName} from now on get this role. Existing assignments don't change." |
       | default cleared | "Accounts that join {appName} from now on get no role automatically." |
       | owner set or changed | "New org owners in every {appName} organization get this role. Existing assignments don't change." |
       | owner cleared | "Org creation and invitations stop working for {appName}." |
       | super-admin set | "Staff super-admins who hold this role can open any organization of {appName} without being a member." |
       | super-admin cleared | "New super-admin access to {appName} stops at once. Tokens already issued stay valid until they expire (up to 1 hour). Holders keep the role assignment; revoke it on the Roles page afterwards." |
       | super-admin replaced | the "set" sentence, then "Tokens already issued for {old key} stay valid until they expire (up to 1 hour); its holders keep the assignment." |

   - **`superAdminNotAlone(diff)`**
     - Returns `'super_admin_role_id' in diff && Object.keys(diff).length > 1`.
3. **Errors (`appFormError`, AC2).**
   - **ctx** becomes `{ mode, appKey?, sent?: readonly string[] }`, where `sent` is the keys of the PATCH body. Rules apply in this order. Copy is fixed, and the server `message` is never shown for a mapped pair.
   - **409**
     - `origin_taken`: unchanged.
     - Create conflict: unchanged.
     - Otherwise look up `(details[0].field, reason)` in `CONFLICT_BY_FIELD`:
       - `super_admin_role_id/role_has_assignments` → super_admin_role_id: "Users already hold this role. Revoke its assignments on the Roles page, then designate it."
       - `org_mode/super_admin_role_designated` → org_mode: "This app has a super-admin role, so org mode must stay Required. Clear the super-admin role first."
       - `org_mode/org_mode_in_use` → org_mode: "This app still has organization data (entitlements or org role assignments), so org mode can't be None. Revoke them first."
     - A 409 with an unmapped reason → alert "The API refused this change."
     - A reason-less 409 → today's admin-app rule or `CHANGED`, so "changed by someone else" applies only to reason-less 409s on non-admin apps.
   - **422 `unprocessable`**
     - The origin reasons stay reason-only (`apex_not_allowed`, `too_many_origins`, `loopback_not_allowed`; they are unique).
     - Everything else goes through `UNPROCESSABLE_BY_FIELD[`${field}/${reason}`]`, then the routing rules below.
     - An unmapped pair → alert `REJECTED`.

     | Pair | Target field | Copy |
     |---|---|---|
     | `default_role_id/unknown_role`, `org_owner_role_id/unknown_role`, `super_admin_role_id/unknown_role` | same field | "This role no longer exists in this app. Choose another." |
     | `default_role_id/role_has_admin_permissions` | default_role_id | "This role holds admin-only permissions, so it can't be the default role." |
     | `default_role_id/role_has_org_permissions` | default_role_id if sent, else org_mode | default: "This app requires organizations and this role holds org-scoped permissions, so it can't be the default role." · org_mode: today's "The default role holds org-scoped permissions, so org mode can't be Required." |
     | `default_role_id/same_as_super_admin_role` | default_role_id | "This role is the super-admin role, so it can't also be the default role." |
     | `org_owner_role_id/role_has_admin_permissions` (F6) | org_owner_role_id | "This role holds admin-only permissions, so it can't be the org owner role. Choose another role, or remove its admin-only permissions on the Roles page." |
     | `org_owner_role_id/org_mode_required` | org_owner_role_id if sent, else org_mode | owner: "An org owner role needs org mode Required." · org_mode: today's "This app has an org owner role, so org mode must stay Required." |
     | `org_owner_role_id/same_as_default_role` | org_owner_role_id if sent, else default_role_id | owner: "This role is the default role, so it can't also be the org owner role." · default: "This role is the org owner role, so it can't also be the default role." |
     | `org_owner_role_id/same_as_super_admin_role` | org_owner_role_id | "This role is the super-admin role, so it can't also be the org owner role." |
     | `super_admin_role_id/admin_app_not_allowed` | super_admin_role_id | "The admin app can't have a super-admin role." |
     | `super_admin_role_id/org_mode_required` | super_admin_role_id | "A super-admin role needs org mode Required." |
     | `super_admin_role_id/system_role` | super_admin_role_id | "System roles can't be the super-admin role." |
     | `super_admin_role_id/same_as_default_role` | super_admin_role_id | "This role is the default role, so it can't also be the super-admin role." |
     | `super_admin_role_id/same_as_org_owner_role` | super_admin_role_id | "This role is the org owner role, so it can't also be the super-admin role." |
     | `super_admin_role_id/role_has_org_permissions` | super_admin_role_id | "This role holds org-scoped permissions. The super-admin role may hold app-level permissions only." |
     | `super_admin_role_id/wildcard_not_allowed` | super_admin_role_id | "This role holds {ctx.appKey}:*, so it can't be the super-admin role." (the app key comes from ctx, never from the server) |

     Routing rule: "X if sent, else Y" means if X is in `ctx.sent` use X; else if Y is in `ctx.sent` use Y; else use X.
   - **422 `validation_error`**: unchanged, but `APP_FIELDS` now includes the three role fields.
   - **403 in edit mode**: `{ kind: 'forbidden', copy: { ...forbiddenCopy(error), description: `${desc} Nothing was saved.` } }`. The PATCH is atomic (identity F3/R-C). Create mode is unchanged. 404 and others: `fallback`, unchanged.
4. **Edit dialog (`app-form-dialog.tsx`).**
   - **When to show the role selects.** `showRoles = isEdit && currentRow.key !== ADMIN_APP_KEY` (the API forbids all three on `admin`: §B rows 3/7).
   - **Role data.** `useQuery({ ...allRoleDefinitionsQueryOptions(currentRow.key, api), enabled: open && showRoles })`. `byId = new Map(roles.map(r => [r.id, r]))`.
   - **Defaults.**
     - Edit: `default_role_id: currentRow.default_role_id ?? ROLE_NONE`, the same for `org_owner_role_id` and `super_admin_role_id` (`?? ROLE_NONE` covers `undefined`).
     - Create: all `ROLE_NONE`. The create body is unchanged (existing test).
   - **Live org mode.** `orgMode = form.watch('org_mode')`. Org owner and Super-admin render only while `orgMode === 'required'` (S1). Default role always renders.
   - **Super-admin gate.** `superState = useActionPermission('apps.setSuperAdminRole')`. The select is disabled only when it is `'denied'`. `'unknown'` stays enabled (ADR 0004 fail-open).
   - **`editable`.** A role field is in `editable` only when all of these hold:
     - roles have loaded (`q.isSuccess`);
     - the field is rendered;
     - for super-admin, the gate is not `'denied'`.
   - **Each field.** `FormField` with:
     - `FormLabel` (Default role / Org owner role / Super-admin role);
     - `SelectDropdown isControlled triggerRef={field.ref}` (so `setError(…, { shouldFocus })` focuses it), `disabled={!editable.includes(name)}`, items from `roleSelectItems`. `annotatePrivileged` is true for default and owner, false for super-admin;
     - `FormDescription`, which `FormControl` links (R10). Text by state:

       | State | `FormDescription` text |
       |---|---|
       | loading | "Loading roles…" |
       | error | "Couldn't load this app's roles. Role fields can't be changed." plus a `Retry` button (`q.refetch()`), rendered once under the role group |
       | default or owner field | "Roles marked privileged hold admin-only permissions or are the super-admin role; the API refuses them here." |
       | owner field (also) | "Must stay set while org mode is Required for org creation and invitations." |
       | super-admin field, denied | "Requires admin:*. Only super admins can change the super-admin role." |
       | super-admin field, otherwise | "Lets staff super-admins who hold it open any organization of this app. Needs admin:*." |

     - While loading or on error, `items` = `roleSelectItems([], current, …)`, so the current value stays visible as "None" or "Unknown role (<id>)" and is never blanked.
   - **Submit (form phase).**
     1. `diff = appUpdateDiff(currentRow, values, editable)`. If it is empty, close with no request (today's behaviour).
     2. If `superAdminNotAlone(diff)`: `form.setError('super_admin_role_id', { message: 'Save the super-admin role on its own: undo your other changes, or save them first.' }, { shouldFocus: true })` and return. No request.
     3. If `diff` has any role field: `setPending(diff)`, `setPhase('review')`, and focus the review heading.
     4. Otherwise send the PATCH, as today.
   - **Review phase.**
     - The `<form>` stays mounted with `hidden` (RHF keeps the values and refs). In its place, `<section aria-labelledby>` shows:
       - heading "Review role changes" (`tabIndex={-1}`, focused);
       - "App {name} ({key}):";
       - a `<ul>` with one `<li>` per change: "{label}: {from} → {to}" (`<code>` keys), followed by the consequence;
       - when `others` is not empty: "Also saves: {others joined}."
     - Footer: `Back` (type button: `setPhase('form')` and focus the first changed role select) and `Confirm and save` (type button: sends `pending` with the `inFlight` guard; while pending it shows "Saving…" with `aria-disabled`, as today).
     - Not optimistic (R9). Precedent: `role-default-dialog.tsx`.
   - **On error (either phase).** `appFormError(error, { mode: 'edit', appKey, sent: Object.keys(body) })`. Then:
     - return to the form phase;
     - set the field errors, focusing the first (the existing logic, now also for the role fields);
     - show the alert (ForbiddenPanel or message) as today.

     The values are kept. On success: toast "App {key} updated.", reset and close (unchanged).
   - **R6.** All role keys and names render as React text.
   - **R5.** No role id in a URL or toast. (Ids are not secrets, but we add none anyway.)
5. **Detail sheet (`AppOverview`).**
   - **Role data.** `ids = [default_role_id, org_owner_role_id, super_admin_role_id]`. `useQuery({ ...allRoleDefinitionsQueryOptions(app.key, api), enabled: ids.some(Boolean) })`. It uses the same cache key as the dialog, so there is no N+1 (api consult D).
   - **`RoleRef({ id })`** renders by state:

     | State | Rendered |
     |---|---|
     | id is null or undefined | "None" |
     | pending | "Loading…" |
     | error | `<code>{id}</code>` + " (role names couldn't be loaded)" |
     | found | `<code>{key}</code>` |
     | not found | "Unknown role (" `<code>{id}</code>` ")" |

     It is never blank (identity R-F, appsec).
   - **Rows.** Default role; then, when `org_mode === 'required'`, Org owner role and **Super-admin role**.
   - **After a save.** `['apps']` invalidation refetches the app detail and `rolesKeys.allDefinitions`, so the sheet shows the new key (AC1).
6. **Fixtures.**
   - `ROLE_DEFINITIONS` and `roleDefinitionsPage` in `test-data.ts`.
   - `appsServer` regex gains `|\/role-definitions`. The branch returns `roleDefinitionsPage((ROLE_DEFINITIONS[app.key] ?? []).slice(offset, offset + limit), total)`.
   - The AC1 test passes a mutable `apps` getter, and its `write` handler applies the PATCH body to that row.
7. **Checks.** Run all R8 checks, plus `pnpm e2e` if the sandbox can (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`). Otherwise record "e2e left to CI".

Rules:
- **R1.** No client-side role rules. Options are never filtered by flags, and the API's refusal is shown (F6 included). The "on its own" guard is a save-flow choice, not a business rule.
- **R2.** Generated types; the HTTP calls stay in the existing query modules.
- **R4.** `super` kind with `conditional`; 403 handled inline.
- **R6.** Text only.
- **R7.** RoleDefinitionRead and `roleDefaultError` are not touched (follow-ups).
- **R8.**
- **R9.** Review phase naming the app and each role key; not optimistic; error shown; `['apps']` invalidated.
- **R10.** Labelled selects; description and errors linked by `FormControl`; review heading focused; status line unchanged.

## Specialist input used
The orchestrator reused the PAN-034 consults (ticket note 2026-11-28).
- **api-platform-engineer §B/§C/§D.** Adopted:
  - the 25-row refusal table (re-checked against `service.py:441-629`) and the (field, reason) keying;
  - the "changed by someone else" text only for reason-less 409s;
  - the three role fields in `AppFormField`;
  - send only changed fields;
  - `allRoleDefinitionsQueryOptions` (all pages, no N+1);
  - the fragment list for AppRead/AppUpdate/PATCH.

  Rejected:
  - client-side pre-filtering of roles (Recommendation 3, Open question 2), because of R1 and owner decision 3;
  - "show 'Unknown role' without the id" (D), because appsec and identity ask for the id so the field is never ambiguous;
  - refreshing `RoleDefinitionRead` (C), deferred per S0.
- **frontend-developer.** Adopted:
  - the `'none'` sentinel;
  - edit-only role fields;
  - `appUpdateDiff` extracted to `data/`;
  - selects disabled while loading or failed, with the current value kept;
  - the unknown id as a fallback item;
  - the `/role-definitions` branch in `appsServer` and the simap role fixtures;
  - the AC1 network-fake test;
  - a shared cache for the sheet and the dialog.

  Adapted: the `aria-describedby` gap in `SelectDropdown` is solved by `FormDescription` inside `FormItem`, because `SelectDropdown` already wraps the trigger in `FormControl`. No component change is needed.
- **identity-access-engineer.** Adopted:
  - F3 (admin:* only when super-admin is in `changes`; atomic PATCH);
  - F5/R-D (the copy, keyed by field);
  - F7/R-E (the consequence copy in the review phase, including "holders keep the assignment; revoke afterwards");
  - R-B (disable only on `denied`, with the reason linked);
  - R-C (inline panel, values kept, "Nothing was saved.").

  R-C "own PATCH for super-admin" is adopted as the "save the super-admin role on its own" guard, inside the same Edit app form (owner decision 2). F6 is recorded in Assumptions and handled by a specific message, as the owner decided.
- **appsec-engineer.** Adopted:
  - a confirm step listing "App simap (simap): Org owner role: None → simap:admin";
  - never turning an unresolved value into a change (`editable` gating);
  - "Unknown role (<id>)" kept selected and never sent;
  - fixed copy, never server text;
  - plain-text rendering in the sheet.

  Partly adopted: option hints. `privileged` only annotates the label. Nothing is disabled for `privileged`, `is_system` or `assignment_count`, because:
  - the snapshot lacks `assignment_count`/`is_super_admin`;
  - the owner wants the API refusal shown;
  - R1.

## Assumptions
- **Generator.** It runs at a77e819 as it did for PAN-034; otherwise use the hand-patch fallback.
- **Snapshot drift.** The generated `AppRead`/`AppUpdate` differ from the snapshot only by `super_admin_role_id` and descriptions. If not, stop at Approach §0.3.
- **`privileged` description.** The stale description in our snapshot ("…or the role holds a permission with is_admin") does not change the field's meaning for the label annotation. On main it also covers the designated super-admin role, and the hint copy says so.
- **Existing assignments.** "Existing assignments don't change" for a default/owner change matches the shipped `role-default-dialog.tsx` copy. It is not re-verified in org-admin-api (identity Open question 4).
- **Roles over 100.** Apps with more than 100 roles are served by `allRoleDefinitionsQueryOptions` paging (max 50 pages). Its error state then disables the role fields, which is safe.
- **F6 (owner decision 2026-11-28).** If simap's real `simap:admin` holds an admin-only key, AC1 is refused by the API with 422 `org_owner_role_id`/`role_has_admin_permissions`. The UI shows "This role holds admin-only permissions, so it can't be the org owner role. …" on the field. AC1 is verified against the network fake, where `simap:admin` is accepted. The fix belongs to org-admin-api (recipe or rule), not this repo.
- **Follow-ups (not in this diff):**
  - (a) org-admin-api: resolve the simap recipe vs. the owner-role rule conflict (`consumers.md:241-248` vs `rbac/service.py:496-502`). The owner chooses doc or rule.
  - (b) admin-pan: refresh `RoleDefinitionRead` (`is_org_owner`, `is_super_admin`, `assignment_count`). Then show owner and super-admin badges on the Roles page and a "has N assignments" hint on super-admin options.
  - (c) admin-pan: `roleDefaultError` (Roles page "Make default") lacks `same_as_super_admin_role` copy; it falls back to "The API rejected these values.".
  - (d) admin-pan: a link from the super-admin "cleared" review copy to that role's holders sheet.
  - (e) admin-pan: full `openapi.json` refresh (carried from PAN-034).

## Needs owner's decision
None blocks this slice. Each has a chosen default, the safer option within R1/R4/R9/ADR 0004.
1. **Confirm step for role changes (R9).** Chosen: a review phase in the same dialog whenever a role field changed. It lists each change with from/to keys and the consequence. Confirm sends the PATCH; Back returns to the form. Plain edits (name, origins, …) keep today's one-step save. Alternative: no extra step, with the Save button naming the changes.
2. **Super-admin save: separate or combined.** Chosen: the field lives in Edit app (the ticket's wording), but a super-admin change must be **saved on its own**. If it is combined with any other change, the form says "Save the super-admin role on its own: undo your other changes, or save them first." and sends nothing. Why this is safer:
   - the strongest cross-org power gets its own confirm, its own PATCH and its own audit entry;
   - a 403 or 422 on it can never discard an owner or default change;
   - it costs one extra save when an app goes to org mode Required and gets a super-admin role at once.

   Alternative: one combined PATCH (PAN-034 S1), or a separate dialog in the sheet.
3. **Option hints.** Chosen: show every role of the app, label `key — name`, with " · privileged" on the default and owner selects only, and a hint that the API refuses privileged roles there. Never disable or hide an option. Why:
   - R1;
   - our snapshot has no `assignment_count`/`is_super_admin`;
   - the owner wants the API refusal (F6) visible, not pre-empted.

   Alternative: disable privileged roles for default/owner and system roles for super-admin (appsec suggestion), after follow-up (b).
4. **Org owner / Super-admin visibility.** Chosen: shown only while the form's org mode is Required (live), and not sent when hidden. Alternative: always shown, relying on the 422 `org_mode_required`.
5. **org-admin-api conflict (F6).** Recorded as follow-up (a). The UI does not work around it.

## Blocking questions
None.

## Split proposal
None. This is already slice 2 of PAN-034. Estimate: about 550 changed lines of non-test, non-generated code (dialog about 200, data helpers about 130, errors about 90, sheet about 50, fixtures about 60, registry/schema about 20), plus tests. That is one existing screen and one spec feature (§5.4, app role designation).

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/apps` → row actions → Edit app dialog (`/_authenticated/apps/`) | Route `admin:apps:read`. Edit `apps.update` = `admin:apps:write` (unchanged). Default/Org owner selects: `apps.update`. Super-admin select: `apps.setSuperAdminRole` = `admin:apps:write` + `admin:*` (`super`, conditional). Disabled with "Requires admin:*. Only super admins can change the super-admin role." when denied; enabled when unknown. | Roles loading: role selects disabled, "Loading roles…", current value shown. Roles error: disabled, "Couldn't load this app's roles. …" + Retry. Empty (app has no roles): only "None" offered. 403 on save: inline ForbiddenPanel + "Nothing was saved.", values kept. 422/409: field error on the named select (or org_mode), or an alert, values kept. Happy: review phase, then saved, toast, close. Admin app / Register: no role selects. | Save (role changed) → review phase → "Confirm and save" → `PATCH /api/v1/apps/{key}` with the changed fields only (non-optimistic). Back → none. Save (no role changed) → PATCH as today. No change → close, no request. Super-admin + other change → field error, no request. | Success: `['apps']` (app list, detail, `rolesKeys.*` incl. `allDefinitions`). 404/409: `['apps']` (existing `useMutationOptions`). |
| `/apps` → detail sheet → Overview | `admin:apps:read` (`apps.view`) | Role names loading: "Loading…". Error: id + "(role names couldn't be loaded)". Unknown id: "Unknown role (<id>)". Null: "None". Happy: `<code>{key}</code>` for Default role, plus Org owner role and Super-admin role when org mode is Required. | — | — |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| PATCH | `/api/v1/apps/{key}` | path `key`. Body `components['schemas']['AppUpdate']`: only changed fields. Role fields are `uuid` or `null` (None) and are sent only when changed and editable. | `AppRead` (now with `super_admin_role_id`) | 403 `permission_denied` / `admin_wildcard_required`. 404 `not_found`. 409 `conflict` + `super_admin_role_id/role_has_assignments`, `org_mode/super_admin_role_designated`, `org_mode/org_mode_in_use`, `origins/origin_taken`, unmapped reason, reason-less (admin invariant / concurrent). 422 `unprocessable` + every (field, reason) in Approach §3. 422 `validation_error` (`bodyFields`). Others → `fallback`. | USR-06c, USR-38 (ADR-0030); merged at a77e819 |
| GET | `/api/v1/apps/{key}/role-definitions` | `limit=100`, `offset` (all pages, via the existing `allRoleDefinitionsQueryOptions`) | `Page_RoleDefinitionRead_` (snapshot shape) | Any error → role fields disabled with Retry (dialog), or the id shown with a note (sheet) | USR-16 |
| GET | `/api/v1/apps/{key}` | unchanged | `AppRead` (now with `super_admin_role_id`) | unchanged | — |
