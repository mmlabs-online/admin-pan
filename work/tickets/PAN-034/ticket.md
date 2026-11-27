# PAN-034: Apps — issue credentials by scope (slice 1; roles moved to PAN-034b)

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Areas | ui, api, auth, security |
| Attempts | 1 |
| Created | 2026-11-27 |
| PR | https://github.com/mmlabs-online/admin-pan/pull/39 |

## Goal
Let staff finish an org app's setup in admin-pan instead of raw admin-API calls in a shell (org-admin-api `docs/deploy.md` "Admin access"): issue app credentials with a chosen scope, and set the app's default, org-owner and super-admin roles. UI-only work; org-admin-api already supports both.

Blocked case today: simap needs (a) an `org-members:read` app credential (org-admin-api ADR-0025, `docs/consumers.md` "Reading an org's members from your backend") and (b) `org_owner_role_id = simap:admin` (`docs/consumers.md` "Org apps without self-service org creation (simap)", step 4; without it invitations answer 403 `org_invite_unavailable`).

## Spec reference
`docs/spec-v1.md` §5.4 (Apps registry: join policy, org mode, origins, default role; roles). App credentials as in PAN-027.

## Depends on
PAN-015, PAN-015b, PAN-027 (all DONE); org-admin-api ADM-034 and ADM-041 (credential scopes), USR-29 (`org-members:read`), USR-06c (org owner role), USR-38 (super-admin role, ADR-0030) — all MERGED on org-admin-api `main` (a77e819, checked 2026-11-27).

## API facts (verify against org-admin-api `main` before coding)
- `POST /api/v1/apps/{key}/credentials` takes an optional body `{"scope": <AppCredentialScope>}`, default `"manifest"`. Values: `manifest`, `releases`, `org-members:read`, `usage:read`, `usage:write`, `limits:write` (refused until org-admin-api ADM-044). At most 2 active keys per (app, scope). The `admin` app may only get `releases`. `GET …/credentials` returns `scope` on each row.
- `PATCH /api/v1/apps/{key}` accepts `default_role_id`, `org_owner_role_id` and `super_admin_role_id` (uuid, or `null` to clear where allowed; `super_admin_role_id` needs `admin:*` when it changes, ADR-0030). Known refusals include: owner role == default role, an admin-only permission held by the default or owner role, and `org_mode` must stay `required` while an owner role is set. Map each refusal code to clear copy, the same way `src/features/apps/data/errors.ts` does.
- The committed `src/api/openapi.json` snapshot may lack these fields; refresh only the needed fragments (as PAN-018 did), no hand-written types (R2).

## Scope
1. **Issue credential dialog** (`app-credential-issue-dialog.tsx`): add a required "Scope" select. Offer only the scopes valid for this app (`admin` app → `releases` only; hide `limits:write`). One-line hint per scope; for runtime scopes (`org-members:read`, `usage:*`) say "backend deploy environment only, never CI or browser code". Send `{"scope": …}`. Keep the existing show-once and copy-then-clear secret handling unchanged (ADR 0007).
2. **Credentials tab** (`app-credentials-tab.tsx`): add a "Scope" column, and show the 2-active limit per scope, not per app.
3. **Edit app**: let staff set Default role, Org owner role and Super-admin role. Selects list the app's roles by key and name, with a "None" option where clearing is allowed. Disable the Super-admin field without `admin:*` and say why. Send only the fields that changed.
4. **App detail sheet** (`app-detail-sheet.tsx`): show those three roles by key (e.g. `simap:admin`), not by raw id.

## Out of scope
- No org-admin-api change; no new endpoints.
- No change to the secret-reveal flow beyond adding the scope.

## Acceptance criteria
- [x] A staff user can issue an `org-members:read` credential for simap from the UI, and the credentials list shows its scope.
- [ ] (moved to PAN-034b) A staff user can set simap's Org owner role to `simap:admin` from the UI; the detail sheet then shows "simap:admin".
- [x] (credential calls; role PATCH in PAN-034b) Every API refusal for these calls shows a specific message; nothing fails silently.
- [x] (credential parts; role-field PATCH in PAN-034b) Tests cover scope options per app (admin vs other), the request bodies sent, the role-field PATCH diff, and the refusal-message mapping.

## Notes / answers from owner
- 2026-11-27 (owner): ticket text provided by the owner; created as written.
- 2026-11-27: the planner split the ticket for PR size. This ticket now delivers scope items 1–2 (credentials by scope) and AC1, plus AC3/AC4 for the credential calls. Scope items 3–4 and AC2 (special roles) move to **PAN-034b**.
