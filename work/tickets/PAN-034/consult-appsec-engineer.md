PAN-034 security consult (appsec, read-only)

I checked these against org-admin-api `main` at a77e819:
- `app/modules/app_credentials/{models,service,router,schemas}.py`
- `app/modules/rbac/{service,schemas,router}.py`
- ADR-0021, ADR-0025, ADR-0030

And these in admin-pan:
- `src/features/apps/components/app-credential-issue-dialog.tsx`
- `src/features/apps/components/app-credentials-tab.tsx`
- `src/features/apps/api/queries.ts`
- `src/features/apps/data/errors.ts`
- `docs/adr/0007-one-time-secrets-in-the-ui.md`

## Findings

1. **The API facts in the ticket are confirmed, with some gaps.**
   - `POST /apps/{key}/credentials` takes an optional `AppCredentialIssue {scope}`, default `manifest`.
   - The refusal order is: `require_super` (403, audited as denied), then `admin_app` for the admin app with any scope other than `releases`, then `app_disabled`, then `scope_not_available` (`limits:write`), then `credential_limit` (counted per app and scope).
   - All of these refusals are 409 with `details[0] = {field: "key", reason}`. The response carries `Cache-Control: no-store`. The audit entry records the scope.
   - An invalid scope returns 422 `validation_error`.

2. **The admin-app credential path is a real change in behaviour, not just a new option.** Today `app-credentials-tab.tsx` hides "Issue credential" for `admin` and says "The admin app has no credentials." The tab and `credentialIssueError` (`admin_app` → "The admin app has no credentials.") must change together.
   - A `releases` key on `admin` records releases of org-admin-api itself (ADR-0021 §11: admin-pan has its own app row). It is a CI deploy secret for the control plane, so it carries more risk than other scopes.

3. **ADR 0007 shape today.** The mutation's variables are the sink function, and the result is metadata only (`retry: false`, `gcTime: 0`, no `mutationKey`, no `setQueryData`). Adding a scope will most likely turn the variables into `{ scope, onSecret }`. That is safe, because `scope` is not secret. The risk is someone "simplifying" this:
   - by returning `credential` inside `meta`,
   - by adding a `mutationKey` that includes the scope,
   - or by putting the scope into a success toast that also echoes the value.

   The leak regression test exists (`app-credential-issue-dialog.test.tsx:165`). It must stay, and it must also run for a runtime scope.

4. **Runtime scopes are a different class of secret** (`org-members:read`, `usage:*`; ADR-0025 §2: "backend deploy environment only: never CI, never browser or mobile code"). A leaked `org-members:read` key exposes member emails and invitations for every org of the app. The ticket asks for a hint only. The current dialog copy ("store it in your deploy secret store", "Deploy jobs use a credential") actually points staff toward CI, which is the wrong place for these keys.

5. **The error mapping in `errors.ts` is keyed by `reason` only and reads `details[0]`. That is unsafe for the role fields.**
   - `role_has_org_permissions` already maps to the `org_mode` field ("The default role holds org-scoped permissions…"). For `super_admin_role_id` the same reason means something else (the super-admin role holds org-scope permissions), so the user would see wrong copy.
   - `org_mode_required` is reused under `org_owner_role_id` and `super_admin_role_id` with different meanings.
   - In `appFormError`, every 409 except `origin_taken` / create-conflict falls into the generic "changed by someone else" message. That would mislabel these specific refusals:
     - `role_has_assignments` (409, `super_admin_role_id`)
     - `super_admin_role_designated` (409, `org_mode`)
     - `org_mode_in_use`
   - That breaks the "nothing fails silently or vaguely" acceptance criterion.

6. **Full list of PATCH refusals to map, by (field, reason):**
   - `default_role_id`: `unknown_role`, `role_has_admin_permissions`, `role_has_org_permissions`, `same_as_super_admin_role`.
   - `org_owner_role_id`: `unknown_role`, `role_has_admin_permissions`, `org_mode_required`, `same_as_default_role`, `same_as_super_admin_role`.
   - `super_admin_role_id` (422): `admin_app_not_allowed`, `unknown_role`, `org_mode_required`, `system_role`, `same_as_default_role`, `same_as_org_owner_role`, `role_has_org_permissions`, `wildcard_not_allowed`.
   - `super_admin_role_id` (409): `role_has_assignments`.
   - `org_mode` (409): `super_admin_role_designated`, `org_mode_in_use`.
   - 409 with no details: concurrent change (IntegrityError).
   - 403 `admin_wildcard_required`.

7. **The OpenAPI snapshot is stale.** `src/api/openapi.json` has `AppCredentialRead` without `scope`, no `AppCredentialIssue`, and no `super_admin_role_id`. These fragments must be refreshed, not hand-written (R2).

8. **`RoleDefinitionRead`** (staff roles read) already returns `is_system`, `is_default`, `is_org_owner`, `is_super_admin`, `privileged` and `assignment_count`. That is enough for safe role-select hints without new API work.

## Recommendations

**Credential dialog**
- Offer scopes by app:
  - `admin` → `releases` only.
  - Other apps → `manifest`, `releases`, `org-members:read`, `usage:read`, `usage:write`.
  - Never offer `limits:write`.
- No default selection for a runtime scope. Either the field is required with no preselect, or it preselects `manifest`. Staff must not issue a runtime key by accident.
- Make the confirm step name the target: the title or description says "Issue a `org-members:read` credential for simap (simap)?" and the button says "Issue org-members:read credential". This dialog already is the explicit confirmation, so no second dialog is needed for issuing. It must name app and scope in the same view as the button.
- For runtime scopes, change the warning in both the confirm view and the reveal view: "Store it only in the backend's runtime environment. Never in CI variables, browser or mobile code." For `manifest` / `releases` keep "CI deploy secret store".
- The reveal heading and status line may show `key_id` and scope. Never the value. Keep the masked `mmak_<key_id>_` prefix. No toast on issue (unchanged).
- Keep the `scope` select in component state only. Not in route search params, not in the URL.
- Map the per-scope refusals:
  - `credential_limit` → "This app already has 2 active `<scope>` credentials. Revoke one, then issue a new one." `<scope>` is the scope the user chose, never echoed from the server.
  - `scope_not_available` → "This scope can't be issued yet."
  - `admin_app` → "The admin app only takes releases credentials."
  - 422 `validation_error` → generic rejected copy.
- Keep unknown-outcome handling unchanged: remove the Issue button and refetch the list.
- On the tab, show the 2-active limit as text only. Don't pre-disable the Issue button by counting active rows (the count is a snapshot); the API is authoritative.

**Role fields (edit app)**
- **Treat role changes as access-changing (R9).**
  - The org owner role is granted to every future org creator.
  - The default role is granted to every future joiner.
  - Setting the super-admin role enables cross-org staff access, and clearing it is the kill switch (ADR-0030 §5).
  - So: when any of the three role fields changed, the save goes through a confirm step listing each change as "App simap (simap): Org owner role: None → simap:admin". Non-optimistic, and API errors are shown in that step.
  - A plain name/origins edit keeps the current flow.
- **Never turn an unresolved value into a change.** Role options come from a query that can be loading, error, or paged.
  - If the app's current role id is not among the loaded options, show it as "Unknown role (`<id>`)" and keep it selected.
  - While roles are loading or failed, disable the three selects and leave those fields out of the PATCH.
  - Build the diff by comparing ids against the app as loaded. `undefined` means "not sent"; `null` is sent only when the user picked "None".
  - Without this, a stale or partial list can silently clear `org_owner_role_id` (breaking simap invitations) or `super_admin_role_id`.
  - Fetch all roles of the app (page through, `limit` ≤ 100), or use a per-app filter.
- **Option hints** come from `RoleDefinitionRead`. They are hints only; always handle the 422/409.
  - Default role and Org owner role: show roles with `privileged = true` (they hold an `is_admin` permission, or they are the super-admin role) as disabled, with the reason "Holds admin-only permissions". Also disable the role already chosen in the other special-role fields.
  - Super-admin role: disable `is_system` roles ("System role") and roles with `assignment_count > 0` ("Has assignments; revoke them first"). Also disable the current default and owner role. Don't offer the field at all for `admin` or when `org_mode ≠ required` (explain why).
  - Show the "None" option only where clearing is allowed. For `admin`, the default role must stay None (existing 409).
- **Super-admin field without `admin:*`:** disabled, with the reason linked via `aria-describedby`. Still handle 403 `admin_wildcard_required` with the ForbiddenPanel (R4). Never send `super_admin_role_id` unless it changed; this also keeps non-super staff from triggering the `admin:*` check.
- **Error mapping:** replace the reason-only lookup with a `(field, reason)` table across all `details[]` entries. Use the list in Finding 6, with fixed copy and never the server message. Add tests for the collisions (`role_has_org_permissions` under `default_role_id` vs `super_admin_role_id`; `org_mode_required` under each field) and for the 409s that must not read as "changed by someone else".
- **After a successful PATCH,** invalidate the app detail, the apps list and the roles queries: the role flags `is_default`, `is_org_owner`, `is_super_admin` and `privileged` change.
- **Detail sheet:** resolve ids to role keys rendered as plain text (React-escaped; no HTML, no link built from API data). If an id can't be resolved, show "Unknown role" plus the id. Never show a blank, which reads as "None".

**Tests (beyond the ticket's list)**
- The leak regression run with scope `org-members:read`.
- The request body sent is exactly `{scope}`.
- The admin app offers only `releases`, and its Issue button is now visible.
- A PATCH while roles failed to load sends no role fields.
- An unresolved current role id is not sent as `null`.
- The confirm step lists the role changes; cancel sends nothing.

## Risks
- Runtime keys issued and stored in CI or frontend env by mistake, because the copy and the default steer that way. This exposes org member PII for the whole app. Mitigation: no runtime preselect, plus scope-specific warnings.
- Accidental clearing of the owner or super-admin role caused by a partial or stale role list. Mitigation: the resolve and diff rules above.
- The admin-app `releases` key is a control-plane CI secret. Mitigations: `admin:*`, at most 2 per scope, audited. The UI should name "admin (org-admin-api)" clearly in the confirm step.
- Misleading 409 copy hides why a designation failed, and staff fall back to shell calls (the situation this ticket is meant to remove).
- Clipboard history and sync remain a residual risk (already disclosed by ADR 0007).

## Open questions (for the planner or owner)
1. Owner: confirm that showing "Issue credential" for the admin app (`releases` only) is wanted now. Today the UI says the admin app has no credentials.
2. Should the default scope be `manifest` (keeps today's behaviour) or no preselect (forces a choice)? I recommend no preselect, or `manifest`; never a runtime scope.
3. Is a separate confirm step for role changes acceptable UX? It is my reading of R9 for the owner and super-admin designation. The alternative is a single dialog where the Save button names the app and the role changes.
4. Which roles endpoint and filter does the edit form use, and does it page beyond 100? This decides how the "unresolved current role" case is handled.

Follow-ups (out of scope): none for org-admin-api. All needed fields and flags exist.
