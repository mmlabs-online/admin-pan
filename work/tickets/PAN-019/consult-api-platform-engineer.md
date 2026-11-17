PAN-019 consult: org-admin-api entitlements (ADM-006, c41ef57). Read-only; nothing edited. Paths are under /home/user/org-admin-api unless noted.

NOTE: the earlier consult at work/tickets/ADM-006/consult-api-platform-engineer.md is NOT the shipped contract (it proposed GET/PATCH/DELETE by app key, `enabled` filter, 422/409 variants). Use only the code below.

## FINDINGS

### Endpoints (app/modules/entitlements/router.py:15-88)
All under `/api/v1/organizations/{org_id}/entitlements`, Bearer admin token (aud=admin), `current_admin` router-wide. There are 4 routes. There is no GET-by-id and no `/apps/{key}/entitlements` route.
- GET `` (:31) needs `admin:entitlements:read`. Returns `Page[EntitlementRead]`. Query: `limit` (<=100), `offset`, `active: bool|None`.
- POST `` (:46) needs `admin:entitlements:write`. Returns 201 `EntitlementRead`.
- PATCH `/{entitlement_id}` (:63) needs write. Returns 200 `EntitlementRead`. The path id is the entitlement UUID, NOT the app key.
- DELETE `/{entitlement_id}` (:78) needs write. Returns 204. This is a hard delete (revoke); there is no soft state.
- "Disable" is PATCH `enabled=false`. "Revoke" is DELETE. The UI should offer both and label them differently.

### Permissions
- New keys `admin:entitlements:read` and `admin:entitlements:write` (router.py:21-22). They are seeded by migrations/versions/20261117_c8a1f4e72d95_adm006_org_entitlements.py:29-30, `is_admin`, granted to no role. Only `admin:*` holders (super-admin) hold them until a role is given them.
- The OpenAPI 409 note (router.py:50) says the POST 409 covers "admin app, disabled app, org_mode none or duplicate".
- Add both keys to admin-pan's permission registry. The route needs read; the grant/edit/revoke/enable controls need write.

### Shapes (schemas.py)
- `EntitlementRead` (:41-52): `id` uuid, `org_id` uuid, `app_key` str, `plan` str, `limits` {str: int}, `enabled` bool, `active` bool (read-only, derived), `created_at`, `updated_at`.
- `Page` is `{items, total, limit, offset}` (app/core/pagination.py:19-21).
- `EntitlementCreate` (:22-28, `extra="forbid"`):
  - `app_key`: pattern `APP_KEY_RE` (app/modules/rbac/models.py), max 32.
  - `plan`: required, `^[a-z0-9][a-z0-9_-]{0,62}$` (:9). It is a free-form slug, there is no plan catalogue, and the UI must not hard-code plan names. Use a text input, optionally with suggestions.
  - `limits`: dict, default `{}`. Keys match `^[a-z][a-z0-9_]{0,63}$` (:10), max 32 keys. Values are StrictInt, 0..2^53-1 (:13-19), so no floats, bools, strings, null or nested values. There is no "unlimited = null".
  - `enabled`: StrictBool, default true.
- `EntitlementUpdate` (:31-38): `plan`, `limits`, `enabled`, all optional. An explicit `null` means no change (service.py:112-114). `limits` REPLACES the whole object (no merge), so the UI must send the full object. `app_key` cannot be changed (`extra=forbid` gives 422). An empty body is a no-op 200 with no audit row.
- Product = app key. It must be an app with `org_mode=required`, status active, and not `admin`.
- Ordering is by `app_key`, then id (repository.py:77). There is no sort parameter and no text search.
- "active" (repository.py:13-16) = `enabled` AND org.status=="active" AND app.status=="active". It is computed server-side and is the only filter (`?active=true|false`). Do not recompute it in the UI (R1). The UI should show `enabled` as the editable switch and `active` as the effective-state badge, with a tooltip explaining the difference.
- The list has no embedded app name/status. To pick an app in the grant dialog, use the existing apps list endpoint (`/api/v1/apps`) and filter client-side on `org_mode==="required"`, `status==="active"`, `key!=="admin"`. This is only a convenience filter; the API enforces the rule with 409. Check the existing generated `apps` types in src/api for the `org_mode` field.

### Errors (envelope `{"error":{code,message,details}}`; app/core/errors.py)
Service rules are in app/modules/entitlements/service.py:
- 401 `unauthorized`; 403 `permission_denied` (missing permission). Handle both per R4.
- 404 `not_found`:
  - org not found (service.py:40);
  - entitlement not found, or it belongs to a different org (:46);
  - POST with unknown `app_key`: message "App not found", `details=[{"field":"app_key","reason":"unknown_app"}]` (:66-68).
- 409 `conflict`, always `details=[{"field":"app_key","reason":...}]` (:27-28), on POST only:
  - `admin_app` ("The admin app has no entitlements", :70)
  - `app_disabled` (:72)
  - `org_mode_none` ("The app does not use organizations", :73)
  - `entitlement_exists` (pre-check :76 and a concurrent IntegrityError :88-89). Note the review flagged that a concurrent org or app delete may also surface as `entitlement_exists`, which is misleading but rare.
  - The UI should map `reason` to friendly messages, and fall back to the API `message` for unknown reasons.
- 422 `validation_error`, with `details=[{type, loc, msg}]` and no echoed values:
  - bad plan pattern, bad limit key, negative or non-int limit, more than 32 keys;
  - unknown extra field;
  - non-strict bool (e.g. "true" string);
  - non-UUID path ids.
  - Map `loc` to the form fields.
- 429 `rate_limited` is possible generically.
- Related 409s on other screens:
  - DELETE `/organizations/{id}` returns 409 `org_has_entitlements` with reason `org_has_entitlements` (organizations/service.py:70-74, errors.py:101). The org-delete UI (PAN-014) should surface it, with a link to the entitlements tab.
  - DELETE `/apps/{key}` returns 409 reason `app_has_entitlements` (rbac/service.py:508-512). PAN apps screen: "disable instead".
  - PATCH app `org_mode` is not guarded against existing entitlements (open follow-up in ADM-006 review.md:37).

### Business rules (service.py:1-6, 60-99)
- Only a NEW grant is validated (app exists, not admin, active, org_mode=required, no duplicate).
- Suspended org, disabled app and `org_mode` change do not touch existing rows. PATCH and DELETE stay allowed on those rows, and reads still list them with `active=false`. The UI must not block editing on a suspended org or disabled app; it should display `active=false` clearly.
- Granting is not blocked for a suspended org: `_require_org` only checks existence (:38-40, :63). Grant on a suspended org is allowed, the row will report `active=false`. Consider a UI hint only.
- There is no billing; `plan` and `limits` are labels and numbers owned by the consuming app. The API does not validate the key set against any manifest.
- No service-to-service read exists; it is deferred to ADM-018 (spec-v1.md:59). The UI only uses the staff endpoints.

### Audit side effects (same transaction, R4; service.py:90-98, 117-127, 137-145)
- POST writes `entitlement.granted`; PATCH writes `entitlement.updated` only when a field changed; DELETE writes `entitlement.revoked`. Targets: `AuditTarget.ENTITLEMENT` (audit/actions.py:29, 54-56), with `org_id` and `app_key` on the audit row.
- `changes` use the allowlist `("app_id","plan","limits","enabled")` (audit/diff.py:26), as `{field:{from,to}}`. It contains `app_id` (a uuid), not `app_key`. The audit-log screen should not assume the key appears inside `changes`; use the row's `app_key`.
- The audit-log screen (PAN-0xx) needs to know three new action strings and the new target type `entitlement`, so its filter option lists must include them.
- Nothing needs to be sent by the UI for audit; it is automatic. The UI must not log itself.

## RECOMMENDATIONS (per acceptance criteria / rules)
1. AC1 "listed and editable": regenerate src/api/openapi.json from c41ef57 (scratchpad file oaa-new2.json has the new ops). Build hooks in src/api for list, grant, patch and revoke. Types must come from the generated schema (R2); do not hand-write `EntitlementRead`.
2. Use a list keyed by `id` (not `app_key`) for PATCH/DELETE. Page with `limit<=100` (a single org rarely has more than a few; still pass `limit=100` and honour `total`). Offer an `active` three-state filter (all, active, inactive) wired to `?active=`.
3. Forms (react-hook-form + zod; R8): `plan` regex as above; `limits` as an editable key/integer list (max 32 rows, key regex, integer 0..2^53-1, reject blanks/floats; no unlimited/null option). On edit send the whole `limits` object, and only changed top-level fields (or all fields; both are safe because null means no change). App field is read-only on edit.
4. AC2 "confirmed": R9 confirmation naming target (org and app key) for revoke (DELETE) and for disabling (`enabled=false`). Grant and enabling can use a normal submit. No optimistic updates. After success invalidate the entitlements list for that org (and the org detail if it shows a count). Show the API `message` on failure.
5. R4: route needs `admin:entitlements:read`; hide or disable the grant, edit, switch and revoke controls without `admin:entitlements:write`. Always handle 403 from the API (e.g. role lost permission mid-session).
6. Error mapping: 409 `details[0].reason` to inline messages on the app select (admin_app, app_disabled, org_mode_none, entitlement_exists); 422 `loc` to field errors; 404 on PATCH/DELETE means refetch and tell the user it was removed. Tests (R8): list, filter, empty, loading, error, 403, grant success, each 409 reason, 422, edit, replace-limits, disable confirm/cancel, revoke confirm/cancel (API mocked at the network layer).
7. Accessibility (R10): status of `active` conveyed in text, not colour alone; the `enabled` switch is labelled with org and app; error messages linked with `aria-describedby`.
8. Follow-ups to record (not in the diff, R7): reverse view "which orgs have app X" (not in API); audit-log filter options for the new actions; PAN-014 org delete surface of `org_has_entitlements`; apps screen `app_has_entitlements`.

## RISKS
- The ADM-006 consult doc is out of date versus the code; the plan must cite the code.
- `limits` is a permanent contract owned by the consuming apps, and values are integers only. If the owner later wants unlimited/boolean limits, the API loosens (additive); the UI form must not block unknown future shapes when displaying (render unknown value types read-only rather than crash).
- Replace-whole `limits` semantics: concurrent edits by two staff overwrite each other silently (no ETag/If-Match). Acceptable for v1, but refetch on dialog open to reduce the window.
- `active` can be false although `enabled` is true (suspended org/disabled app); a naive UI that shows only `enabled` will mislead staff.
- Missing permissions in seeded roles: only `admin:*` holders see the screen until a role carries the keys; verify what the dev/mock auth permission set includes.
- Duplicate-reason ambiguity on concurrent delete (service.py:88).
- Org suspension is allowed to still grant entitlements; product expectation may differ.

## OPEN QUESTIONS (for owner / planner)
1. Should the UI warn or block granting on a suspended org (API allows it)?
2. Is `plan` a text input with free-form slugs, or should the UI offer suggested plans (not in API)? No catalogue exists.
3. Where does the screen live: an "Entitlements" tab on the org detail (the API is org-scoped, so recommended) versus a standalone page?
4. Does the app picker use the existing apps list API (and is `org_mode` exposed in its generated type)? Confirm against src/api/openapi.json at the refreshed spec.
5. Permissions registry: confirm that admin-pan's registry and any dev-auth fixture get `admin:entitlements:read` and `admin:entitlements:write`.

Key files: /home/user/org-admin-api/app/modules/entitlements/{router,schemas,service,repository,models}.py; /home/user/org-admin-api/migrations/versions/20261117_c8a1f4e72d95_adm006_org_entitlements.py; /home/user/org-admin-api/app/modules/audit/{actions,diff}.py; /home/user/org-admin-api/docs/spec-v1.md:56-59; /home/user/org-admin-api/work/tickets/ADM-006/review.md; /tmp/claude-0/-home-user/ce8daed7-26f0-593f-9bf8-a95df9f28817/scratchpad/oaa-new2.json (I only confirmed it contains entitlement ops, did not diff its schemas against the code above).
