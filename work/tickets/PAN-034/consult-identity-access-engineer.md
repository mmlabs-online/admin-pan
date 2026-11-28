# PAN-034 consult: identity-access-engineer

## Findings

**F1. Issuing a credential needs `admin:*` on every call, but the registry does not say so.** In org-admin-api `app/modules/app_credentials/router.py:30-37`, `POST /apps/{key}/credentials` is `admin:apps:write` plus `requires_super="always"`. `AppCredentialService.issue` calls `require_super(actor)` before any other check (`service.py:116`). admin-pan declares `'apps.issueCredential': perm('admin:apps:write', …)` (`src/lib/permissions/registry.ts:142`), and `<Can action='apps.issueCredential' disable>` reads that. So a staff user with only `admin:apps:write` sees an enabled button and always gets 403 `admin_wildcard_required`. Today the only signal is the static text "Issuing needs admin:*." (`app-credentials-tab.tsx:115`). The scope makes no difference to the permission: every scope needs `admin:*`.

**F2. The rules for issuing by scope** (`service.py:123-133`). All refusals are 409 with `details[0] = {field: "key", reason}`:
- `admin_app`: the `admin` app with any scope other than `releases`.
- `app_disabled`
- `scope_not_available`: `limits:write`, until ADM-044.
- `credential_limit`: 2 active per (app, scope).

`credentialIssueError` (`src/features/apps/data/errors.ts:232`) has no case for `scope_not_available`. Its `credential_limit` copy says "per app", and its `admin_app` copy says "The admin app has no credentials", which is no longer true. `app-credentials-tab.tsx:79,110-113` hides the Issue button for the admin app completely, which contradicts scope item 1 (the admin app may get `releases`).

**F3. `PATCH /apps/{key}` permissions** (`rbac/router.py:152-168`, `rbac/service.py:441-629`):
- Base permission: `admin:apps:write` (`x-permission`). The extra rule is `requires_super="conditional"`, with `x-requires-super-when` "Changing the admin app or the app's super-admin role designation".
- `admin:*` is required only when `super_admin_role_id` is **in `changes`**, i.e. the value differs from the current one (`service.py:481`). Sending the same value needs nothing extra. Any real change to the `admin` app also needs `admin:*` (G1).
- The PATCH is atomic. If the super-admin part is refused, the default and owner changes in the same body are refused too.

**F4. The registry cannot express "same operation, stricter field" today.** `registry.test.ts:30-40` asserts `req.permission === x-permission` for every operation an entry names. So `perm('admin:*', 'PATCH /api/v1/apps/{key}')` fails that test. The committed snapshot `src/api/openapi.json` has no `x-requires-super` and no `super_admin_role_id`, and `schema.d.ts` has `org_owner_role_id` but no super-admin field. Both need a fragment refresh (R2).

**F5. Error reasons for the role fields collide across fields, so mapping by reason alone is wrong.**
- `role_has_org_permissions` is used for `default_role_id` and for `super_admin_role_id`.
- `org_mode_required` is used for `org_owner_role_id` and for `super_admin_role_id`.
- `unknown_role` and `same_as_default_role` are each used on more than one field.
- `same_as_super_admin_role` appears on `default_role_id` or `org_owner_role_id`.
- `appFormError` today maps `role_has_org_permissions` and `org_mode_required` to the `org_mode` field by reason only (`errors.ts:71-89`). Reused for the role fields, it would show the wrong message.
- Full refusal list:
  - 422 on `super_admin_role_id`: `admin_app_not_allowed`, `unknown_role`, `org_mode_required`, `system_role`, `same_as_default_role`, `same_as_org_owner_role`, `role_has_org_permissions`, `wildcard_not_allowed`.
  - 409 on `super_admin_role_id`: `role_has_assignments`.
  - 409 on `org_mode`: `super_admin_role_designated`.
  - 422 on `default_role_id` / `org_owner_role_id`: `unknown_role`, `role_has_admin_permissions`, `same_as_default_role`, `same_as_super_admin_role`, `role_has_org_permissions` (default role only), `org_mode_required` (owner role only).
  - 409, admin app: plain `conflict`. 409 on an IntegrityError race: "App was changed concurrently".

**F6. Acceptance criterion 2 may fail on the API, not the UI.** org-admin-api `docs/consumers.md:240-248` (simap recipe) gives `simap:admin` "invite + one admin-only key (e.g. `simap:org:manage`)" and then sets it as `org_owner_role_id`. But `_update` refuses an owner role that holds any `is_admin` permission: 422 `role_has_admin_permissions` (`service.py:496-502`, test `test_patch_org_owner_role_admin_perm_role_422`). If simap's admin role was built as documented, the PATCH will be refused.

**F7. What each role means for security** (from ADR-0030 and consumers.md):
- **Default role:** given automatically to every account that joins the app. It must hold no admin-only permissions. On an org app it must hold no org-scope permissions.
- **Org owner role:** the role an org's owner gets in every org of the app. If it is not set, org create answers 403 `org_create_unavailable` and invitations answer 403 `org_invite_unavailable`. Clearing it switches off those flows app-wide.
- **Super-admin role:** designating it lets holders (staff who are live `admin:super-admin`) mint `org_access: "super_admin"` tokens for **every org of the app** without membership. Those tokens last up to 1 h by default, have no MFA or step-up, and survive logout until `exp`. Clearing the designation is the kill switch: it blocks new mints at once, but tokens already issued run to `exp`, and holders' assignments are **not** revoked automatically (ADR-0030 §5: "staff should revoke the former holders afterwards").
- Designation preconditions: the role is not a system role, has zero assignments, has no org-scope permission and no `<app>:*`, differs from the default and owner roles, the app has `org_mode = required`, and it is not the `admin` app.

## Recommendations

**R-A. Express "field-level" gating with a new requirement kind in the registry, not ad-hoc checks** (R4, ADR 0004).
- Add a requirement kind next to `permission`:
  ```ts
  | { kind: 'super'; base: AdminPermission; operations: readonly ApiOperation[]; when: string }
  ```
  `evaluate()` returns `source.check('admin:*')` (`permits` already treats `admin:*` as exact key, so that is correct).
- Extend `registry.test.ts` so that for a `super` entry, `base === x-permission` and the operation's `x-requires-super` is `always` or `conditional`. This needs `x-requires-super` in the refreshed snapshot.
- New action: `'apps.setSuperAdminRole': superOf('admin:apps:write', 'PATCH /api/v1/apps/{key}')`.
- Change `'apps.issueCredential'` to `superOf('admin:apps:write', 'POST …/credentials')` with `always`, which fixes F1. This is the same mechanism and the dialog this ticket already touches. If the planner judges it outside R7, record it as a follow-up instead.
- In `<Can disable>`, show "Requires admin:*" for `super` entries. Today it prints `req.permission`, which would wrongly say `admin:apps:write`.
- Gate the Default and Org owner fields with the existing `apps.update` / `roles.setDefault` actions (`admin:apps:write`).

**R-B. Super-admin field UX** (scope item 3, R4, R10).
- Use `useActionPermission('apps.setSuperAdminRole')`. Disable only on `'denied'`. `unknown` stays enabled (fail-open, ADR 0004).
- When disabled, keep showing the current value by key, read-only. Use native `disabled` plus visible text linked with `aria-describedby`, e.g. "Only super admins (admin:*) can change the super-admin role."
- Show the Org owner and Super-admin fields only when the app's saved `org_mode` is `required` and the app is not `admin`. For the admin app, hide all three role fields: the API forbids a default role, an owner role or a super-admin role there.
- Send only changed fields (ticket item 3). This also keeps a no-op super-admin value from needing `admin:*`.

**R-C. Handling a 403 when the UI's guess is wrong** (R4, ADR 0004).
- On 403 `admin_wildcard_required` or `permission_denied`:
  - Show `ForbiddenPanel variant='inline'` in the dialog.
  - Keep the dialog open with the user's choices.
  - Say plainly that **nothing was saved**, since the PATCH is atomic (F3).
  - Let the existing `permission-refresh` invalidate `['me','permissions']`.
- Never remember the denial (owner rule). Never show the server `message` for mapped codes.
- Strongly recommended: submit the super-admin designation as its **own PATCH with its own confirmation**, separate from default/owner. A wrong guess then never blocks the simap owner-role change, and the access-changing step gets its own confirm (R9). If the planner keeps one form, the 403 copy must name all the fields that were not saved.

**R-D. Error mapping keyed by (field, reason)** (AC3, R4).
- Add a `appRolesError(error)` in `src/features/apps/data/errors.ts` that reads `details[0].field` **and** `reason` and returns a field error on the matching select. Unknown pairs fall back to the generic "The API rejected these values."
- Suggested copy:
  - `super_admin_role_id/role_has_assignments`: "This role already has assignments. Revoke them before designating it."
  - `org_owner_role_id/role_has_admin_permissions`: "This role holds admin-only permissions, so it can't be the org owner role."
  - `super_admin_role_id/role_has_org_permissions`: "The super-admin role may hold app-level permissions only."
  - `super_admin_role_id/wildcard_not_allowed`: "The super-admin role must not hold `<app>:*`."
  - `super_admin_role_id/system_role`: "System roles can't be the super-admin role."
  - `*/same_as_*`: name the other field.
- Do not reuse `appFormError`'s reason-only table for these fields.
- Credential issue errors: add `scope_not_available`, make the `credential_limit` copy say "2 active credentials with this scope", and change `admin_app` to "The admin app can only have releases credentials."

**R-E. Confirmations (R9).** Changing these roles changes access, so none of it is optimistic, and each needs an explicit confirm that names the app and the role **key**:
- **Super-admin set:** "`simap:super-admin` will let staff super-admins who hold it open **any org of simap** without being members. Only staff with admin:super-admin can be granted it."
- **Super-admin clear:** "Stops new super-admin org access for simap immediately. Tokens already issued stay valid until they expire (up to 1 hour). Holders keep the role assignment; revoke it afterwards." Add a link or pointer to the role's holders.
- **Org owner set/change:** "New org owners in every simap org get this role's permissions." **Clear:** "Org creation and invitations stop working for simap."
- **Default role:** "Every account that joins simap gets this role." Reuse the `role-default-dialog` pattern.
- **Issue credential:** the existing confirm phase, plus the chosen scope in the text. For runtime scopes (`org-members:read`, `usage:*`): "Store only in the backend's deploy environment, never in CI or browser code." Show-once and copy-then-clear stay unchanged (ADR 0007).
- After success, invalidate:
  - the app detail and the apps list
  - the role definitions (`is_org_owner` and the super-admin badges change; `role-name-cell`, `roles-row-actions`)
  - for credentials, the credentials list

**R-F. Role selects and detail sheet** (scope items 3–4, R1).
- Options come from `GET …/role-definitions` (`admin:apps:read`). It is paginated with `limit ≤ 100`, so fetch every page or bound the list knowingly.
- Show options as `key — name`. Use `is_system` and `assignment_count` only as hints, e.g. a "has N assignments" note on super-admin candidates. Do not re-implement the API's org-permission or wildcard checks (R1); let the API refuse.
- In the detail sheet, resolve id to key from the same query. If the role isn't found, fall back to "Unknown role (id)". Never leave the field blank: a stale or empty view hides an access setting.

**R-G. Tests** (AC4, R8).
- Registry test for the new `super` kind, with the snapshot including `x-requires-super`.
- `Can`/field shows the disabled reason when `admin:*` is denied and stays enabled when the state is unknown.
- 403 `admin_wildcard_required` on the super-admin PATCH and on issue: inline panel, dialog stays open, permission refetch.
- The (field, reason) mapping table, including the colliding reasons.
- PATCH body contains only changed fields, and contains no `super_admin_role_id` when it is unchanged.
- Confirm/cancel for set and clear.

## Risks
- **F6 may block acceptance criterion 2 on the API side.** If `simap:admin` holds an `is_admin` permission as the recipe says, the owner-role PATCH is refused with 422. The UI must show that message clearly, but the fix belongs to org-admin-api (doc or rule), not to this repo (R1/R7).
- Until R-A ships, staff with `admin:apps:write` but without `admin:*` get enabled controls that always fail. The impact is UX only, since the API enforces.
- Super-admin designation is the strongest cross-tenant power in the ecosystem, and the UI is now one click away from it. Without the separate confirm and the "revoke holders afterwards" guidance, staff may believe clearing the designation revoked access. It doesn't: tokens run until `exp`, and the assignments stay.
- Runtime credentials (`org-members:read`) read member PII across all orgs of the app. If one is pasted into CI or a frontend, every org's member list leaks. The scope hint and the show-once flow are the only UI defences.

## Open questions
1. F6: should the orchestrator raise an org-admin-api follow-up (doc fix or rule change) before running PAN-034, or ship and accept that AC2 depends on simap's role content?
2. Is the `apps.issueCredential` → `admin:*` registry fix in scope for PAN-034, or a follow-up ticket (R7)?
3. Should the super-admin change be a separate action, e.g. its own button with a confirm in the detail sheet or edit dialog, rather than a field in the shared edit form? This is recommended.
4. Changing the default or owner role probably does not back-fill existing members or owners. I did not verify this in the API. If staff copy is to say "applies to new members/owners only", someone should confirm it in org-admin-api.

## Files consulted
- /home/user/admin-pan/work/tickets/PAN-034/ticket.md
- /home/user/admin-pan/src/lib/permissions/registry.ts
- /home/user/admin-pan/src/lib/permissions/registry.test.ts
- /home/user/admin-pan/src/lib/permissions/source.ts
- /home/user/admin-pan/src/lib/permissions/permits.ts
- /home/user/admin-pan/src/context/permission-provider.tsx
- /home/user/admin-pan/src/components/permissions/can.tsx
- /home/user/admin-pan/src/features/apps/data/errors.ts
- /home/user/admin-pan/src/features/apps/components/app-credentials-tab.tsx
- /home/user/admin-pan/src/features/apps/components/app-credential-issue-dialog.tsx
- /home/user/admin-pan/src/features/roles/data/errors.ts
- /home/user/admin-pan/docs/adr/0004-permission-mirroring-and-403-handling.md
- /home/user/mmlabs-online/org-admin-api/docs/adr/0030-app-super-admin-role.md
- /home/user/mmlabs-online/org-admin-api/docs/consumers.md
- /home/user/mmlabs-online/org-admin-api/app/modules/rbac/service.py
- /home/user/mmlabs-online/org-admin-api/app/modules/rbac/router.py
- /home/user/mmlabs-online/org-admin-api/app/modules/rbac/schemas.py
- /home/user/mmlabs-online/org-admin-api/app/modules/app_credentials/router.py
- /home/user/mmlabs-online/org-admin-api/app/modules/app_credentials/service.py
- /home/user/mmlabs-online/org-admin-api/app/modules/app_credentials/models.py
- /home/user/mmlabs-online/org-admin-api/app/modules/admin_auth/deps.py
- /home/user/mmlabs-online/org-admin-api/tests/test_rbac_apps_api.py
