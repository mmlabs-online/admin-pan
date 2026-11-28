# PAN-034b — security review

## Attempt 1

## Security review: PAN-034b, attempt 1 (`git diff 211da94..HEAD -- src/`)

I checked every point you listed and none of them blocks the merge. I found one should-fix and three notes. I ran typecheck, lint and the apps tests (`pnpm test src/features/apps`, 13 files, 199 tests); all passed. I did not run the full test suite, `format:check` or `build`. I wrote no files.

### How each point holds up
- **Role changes are access-changing (R9):**
  - `onSubmit` (`/home/user/admin-pan/src/features/apps/components/app-form-dialog.tsx:274-299`) sends any diff that touches a role field to a review step first. Nothing is sent before that.
  - The review (`:539-568`) names "App {name} ({key})". It shows each change as `<label>: <from key> → <to key>`, with what the change will do.
  - The save is not optimistic: it awaits `mutateAsync` and closes only on success (`:229-271`). An `inFlight` ref guards double submits. Back sends nothing (tested at `app-form-dialog.test.tsx:476`).
- **Unresolved, loading or failed role lists never become a change or a null:**
  - `editable` is empty unless `rolesQ.isSuccess` (`:189-201`), and `appUpdateDiff` skips any field not in `editable` (`/home/user/admin-pan/src/features/apps/data/data.ts:154-158`).
  - A current id missing from the loaded list stays selected as "Unknown role (id)" (`data.ts:174-175`). Its value equals the current id, so it is not in the diff.
  - Hidden owner and super-admin fields (org mode not Required) are not editable, so they are never sent.
  - `null` is sent only when "None" is picked.
  - The role list loads every page, and the query fails rather than returning a partial list (`/home/user/admin-pan/src/features/roles/api/queries.ts:93-122`).
- **(field, reason) mapping with fixed copy:**
  - The `CONFLICT_BY_FIELD` and `UNPROCESSABLE_BY_FIELD` tables (`/home/user/admin-pan/src/features/apps/data/errors.ts:95-202`) cover the full list from the consult's Finding 6.
  - When a reason is shared by several fields, `sent` decides which field gets the message (`refusalTarget`, `:205-212`).
  - Unmapped refusals get a generic fixed line: 409 "The API refused this change." (`:241-247`), 422 "The API rejected these values."
  - The server message is never shown. The only interpolation is the app key from the client, in the `wildcard_not_allowed` message.
- **The `conditional` admin:* rule applies only to the Super-admin field:**
  - `apps.setSuperAdminRole` (`/home/user/admin-pan/src/lib/permissions/registry.ts:158-162`) is used only for `superDenied`. That removes `super_admin_role_id` from `editable` and disables that select with the reason shown.
  - Save stays gated by `apps.update` only.
  - A super-admin change cannot be saved together with other changes (`superAdminNotAlone`). So non-super staff never trigger the admin:* check by accident.
- **A 403 says nothing was saved:** in edit mode, `errors.ts:282-294` adds "Nothing was saved." to the copy chosen by error code, and the inline ForbiddenPanel shows it (`app-form-dialog.tsx:572-573`). Tested at `app-form-dialog.test.tsx:620` and `errors.test.ts:292`.
- **Detail sheet shows role keys as plain text, never blank:** `RoleRef` (`/home/user/admin-pan/src/features/apps/components/app-detail-sheet.tsx:127-147`) renders React-escaped `<code>{key}</code>`. It shows "None", "Loading…", the id with "(role names couldn't be loaded)", or "Unknown role (id)". There is no HTML, no link built from data, and never an empty value.

### Findings
- 🟡 **Role queries are not refreshed after a successful role PATCH.** `/home/user/admin-pan/src/features/apps/api/queries.ts:272`
  - **Risk:** `useUpdateAppMutation` refreshes only `appsKeys.all`. After setting the default, owner or super-admin role, the cached role definitions keep the old `is_default`, `is_org_owner`, `is_super_admin` and `privileged` flags.
  - Those flags are shown on the Roles page (`roles-columns.tsx:27`, `role-default-dialog.tsx:73`) and in the "privileged" labels in the edit dialog.
  - Staff can therefore misjudge a role's power for up to the stale window, for example not seeing that the new super-admin role is now privileged. The consult required refreshing the roles queries.
  - **Fix:** also refresh the roles queries on success, e.g. `...useMutationOptions(appsKeys.all, rolesKeys.all, options)`, or the per-app key `rolesKeys.allDefinitions(key)`. Add a test that the role-definitions list is fetched again after a confirmed role change.
- 💭 **Errors appear in the form, not in the review step** (`app-form-dialog.tsx:247`). On failure the dialog goes back to the form, and the mapped error appears next to the field that caused it, which gets focus; the value is kept. This differs from the consult's wording ("errors shown in that step"). I accept it: the error is next to the field to fix, and a retry goes through the review again. Nothing fails silently.
- 💭 **Only the first `details[]` entry is read** (`errors.ts:90-93`, `firstReason` at `:58`). The consult asked to scan all entries. The API currently returns a single detail for these refusals, so there is no practical impact today. Worth hardening if the API starts returning several.
- 💭 **Option hints are weaker than the consult recommended** (`app-form-dialog.tsx:204`, `data.ts:163-176`). Privileged roles are labelled "· privileged" but not disabled, and the Super-admin select does not disable system roles, roles with assignments, or the current default and owner roles. The API refuses all of these with mapped messages, so this is a usability gap, not a security one.

### Follow-ups (out of scope)
- None for org-admin-api.

**Summary:** no blockers. The access-changing confirm step, the diff rules for unresolved role ids, the (field, reason) mapping, the Super-admin-only admin:* rule, the 403 "nothing was saved" copy and the detail sheet all meet the consult. One should-fix: refresh the role-definition queries after a successful role PATCH (`src/features/apps/api/queries.ts:272`).
