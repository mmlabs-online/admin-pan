Status: READY

# Plan: PAN-019, Org product entitlements screen

- **Base:** origin/main 36a18ce (PAN-027 merged). Working branch `claude/great-edison-3g2y0h`.
- **API reference:** org-admin-api c41ef57 (read-only checkout at `/home/user/org-admin-api`). ADM-006 is DONE there.
- **Code cited:** `app/modules/entitlements/{router,schemas,service,repository}.py` (cited as code, per the api-platform consult; the ADM-006 consult file is out of date).
- **Snapshot:** `src/api/openapi.json` is **regenerated** at c41ef57 with the generator, then `pnpm api:types` (Approach §1).

## Spec summary
- `docs/spec-v1.md` §5.6: "Org product entitlements — Enable/disable a product for an org, set plan/limits. API: **org-admin-api ADM-006** (backlog)."
  - "(backlog)" is stale: ADM-006 is DONE at c41ef57. Follow-up for the product-manager.
- §7: "Every admin task org-admin-api supports can be done in the UI, without raw API calls."
- §3 / R11: there is no billing. `plan` and `limits` are labels and numbers owned by the consuming app (service.py docstring; `schemas.py:9-19`).
- Product = app key. The app must be active, have `org_mode=required` and not be `admin` (service.py:64-77).
- `active` = `enabled` AND org active AND app active. The API computes it (repository.py:13-16).

## Acceptance criteria → verification
| # | Criterion (ticket) | How the reviewer verifies it |
|---|---|---|
| 1 | Entitlements per org listed and editable | `organization-entitlements-tab.test.tsx` › "fetches GET …/organizations/{id}/entitlements?limit=100&offset=0 only when the Entitlements tab is selected", › "rows: app key (mono), plan, limits as `key: value` or 'None', Enabled switch, status text Active / Disabled / Inactive, updated date". `entitlement-form-dialog.test.tsx` › grant and edit cases. `entitlement-enabled-dialog.test.tsx` › toggle cases. e2e `pages.e2e.ts` › "organizations entitlements: …" grants calechip to Acme and disables it. |
| 2 | Changes confirmed and audited by the API | **Confirmed:** every write starts from an explicit dialog that names the org and the app. Enable/disable uses a `ConfirmDialog` (R9). Grant and edit use a form dialog whose submit names the action. No optimistic update. Success shows a toast naming org and app, and the row changes only after the refetch. Tests: `entitlement-enabled-dialog.test.tsx` › "cancel sends nothing; confirm sends one PATCH {enabled:false}; the switch flips only after the refetch". **Audited:** the API writes `entitlement.granted` / `entitlement.updated` in the same transaction (service.py:90-98, 117-127). The UI sends nothing extra for audit. Dialog copy says "The change is recorded in the audit log." The audit-log screen can filter the new actions and target: `audit-log/data/data.test.ts` › "entitlement audit entries …". |
| 3 | States tested | Tab: loading / empty / error + Retry / 403 / list. Sheet: 404 / 403 / error. Dialogs: pending (aria-disabled, double click sends one request), every mapped API error, cancel. All run on the fake fetch (`src/test-utils/api.ts`, ADR 0005), plus one e2e test with axe. |

Checks (R8): `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`), `pnpm build`, `pnpm e2e`.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/api/openapi.json` | Regenerated with the generator at c41ef57. No hand edits | R2: entitlement operations and schemas |
| `src/api/schema.d.ts` | `pnpm api:types` | R2. CI diffs it against the snapshot |
| `src/lib/permissions/registry.ts` | `ADMIN_PERMISSIONS` gains `'admin:entitlements:read'` and `'admin:entitlements:write'` (sorted). New `ACTIONS`: `organizations.view`, `entitlements.view`, `entitlements.grant`, `entitlements.update` (Approach §2) | R4. `registry.test.ts:22` fails without the keys |
| `src/features/audit-log/data/schema.ts` | Add the new `AuditAction` and `AuditTarget` values from the regenerated snapshot to the zod enums. **Enum-only** | The `Same<>` guards fail typecheck otherwise (unavoidable, Approach §1) |
| `src/features/audit-log/data/data.ts` | Add `actionTones` and `targetLabels` entries for the same values | Exhaustive `Record`s fail typecheck otherwise |
| `src/features/audit-log/data/data.test.ts` | New `describe('entitlement audit entries')` | AC2 (audit visible) |
| `src/features/organizations/api/queries.ts` | Add `organizationsKeys.detail(id)` = `[...all,'detail',id]` and `organizationQueryOptions(id, api)` (GET `/organizations/{org_id}`) | Detail sheet (AC1) |
| `src/features/organizations/api/entitlements.ts` (new) | `ENTITLEMENTS_PAGE_SIZE = 100`, `entitlementsKeys`, `orgEntitlementsQueryOptions`, `useGrantEntitlementMutation`, `useUpdateEntitlementMutation` | AC1/AC2 data layer (R2, R9) |
| `src/features/organizations/api/entitlements.test.ts` (new) | Keys, URLs, bodies, invalidation | R8 logic tests |
| `src/features/organizations/api/queries.test.ts` | Add a test for `organizationQueryOptions` and the detail key | R8 |
| `src/features/organizations/data/entitlement-schema.ts` (new) | Generated types `Entitlement`, `EntitlementCreate`, `EntitlementUpdate`. Constants `PLAN_PATTERN`, `LIMIT_KEY_PATTERN`, `LIMITS_MAX = 32`, `LIMIT_VALUE_MAX = Number.MAX_SAFE_INTEGER`. `entitlementFormSchema` (zod) plus `toLimits`, `fromLimits`, `limitsEqual`, `formatLimitValue` | Form validation (R8) |
| `src/features/organizations/data/entitlement-schema.test.ts` (new) | Boundaries and drift against `openapi.json?raw` | R8 |
| `src/features/organizations/data/entitlement-errors.ts` (new) | `entitlementFormError(error, mode)` and `entitlementToggleError(error)` | ADR 0004 copy by status/reason |
| `src/features/organizations/data/entitlement-errors.test.ts` (new) | Mapper tables | R8 |
| `src/features/organizations/components/organizations-provider.tsx` | Dialog type gains `'view'`. Context gains `viewButtons: RefObject<Map<string, HTMLButtonElement>>` | Open the sheet; focus return without selectors |
| `src/features/organizations/components/organizations-dialogs.tsx` | Render `OrganizationDetailSheet` for `open === 'view'` with `closeWithRow` and `returnFocus={() => viewButtons.current.get(currentRow.id)?.focus()}` | Sheet mount |
| `src/features/organizations/components/data-table-row-actions.tsx` | Wrap in a flex div. Add a "View" ghost button (`Eye` icon, `aria-label="View {name}"`, ref registered in `viewButtons` by `org.id`) gated by `<Can action='organizations.view'>`, before the existing dropdown. The dropdown and its `Can` stay unchanged | Entry point (same as `apps-row-actions.tsx`) |
| `src/features/organizations/components/organization-detail-sheet.tsx` (new) | Minimal sheet: header, Overview tab, Entitlements tab (hidden when `entitlements.view` is denied) | AC1, PAN-014b shell (see Split proposal) |
| `src/features/organizations/components/organization-detail-sheet.test.tsx` (new) | Sheet states, tabs, focus return | AC3 |
| `src/features/organizations/components/organization-entitlements-tab.tsx` (new) | List, hints, Grant button, rows with Enabled switch and Edit, focus handling | AC1 |
| `src/features/organizations/components/organization-entitlements-tab.test.tsx` (new) | Tab states, rows, gating | AC1, AC3 |
| `src/features/organizations/components/entitlement-form-dialog.tsx` (new) | One dialog with `mode: 'grant' \| 'edit'`: app picker (grant only), plan, limits rows | AC1, AC2 |
| `src/features/organizations/components/entitlement-form-dialog.test.tsx` (new) | Grant and edit flows and errors | AC1–3 |
| `src/features/organizations/components/entitlement-enabled-dialog.tsx` (new) | `ConfirmDialog` for enable/disable | AC2, R9 |
| `src/features/organizations/components/entitlement-enabled-dialog.test.tsx` (new) | Toggle flows | AC2, AC3 |
| `src/features/organizations/components/test-data.ts` | `ENTITLEMENTS: Record<orgId, Entitlement[]>`, `entitlementsPage(...)`, `PICKER_APPS: AppRead[]` | Fixtures |
| `src/features/organizations/components/test-fixtures.tsx` | `renderOrgSheet(client, {org, granted, queryClient?})` renders provider + `OrganizationDetailSheet` open on `org`. Optional `orgsServer(state)` handler for detail, entitlements GET/POST/PATCH and `GET /apps` | Test harness |
| `e2e/support/fake-api.ts` | Per-org detail route; stateful entitlement routes (Approach §8) | e2e (ADR 0006) |
| `e2e/pages.e2e.ts` | New, **separate** test "organizations entitlements: …" | e2e + axe |

No other files. In particular, do not change:
- `src/components/ui/*`, `confirm-dialog.tsx`, `src/api/client.ts` or `src/api/index.ts`.
- Any `src/features/apps/*` file. It is imported from (`appsListQueryOptions`, `isUnknownOutcome`, `ADMIN_APP_KEY`, `APP_KEY_PATTERN`, `formatDate`), never edited. Cross-feature imports already exist (`roles` → `apps`).
- Org edit/status/delete dialogs, routes, `routeTree.gen.ts`, nginx and CI.
- Join-request UI (PAN-028).

If the regenerated snapshot breaks types elsewhere beyond the enum/registry items listed here, the implementer may make only mechanical fixture fixes (e.g. a new required field in a typed fixture). Each one is recorded in impl-log with the reason. Anything more → stop and record.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `entitlements.test.ts` › "entitlementsKeys.list(org,p) is under entitlementsKeys.all(org), which is under organizationsKeys.detail(org) and not under organizationsKeys.lists()" | keys |
| `entitlements.test.ts` › "orgEntitlementsQueryOptions sends GET /api/v1/organizations/{id}/entitlements?limit=100&offset=0 (no `active`) and returns the page" | AC1 |
| `entitlements.test.ts` › "useGrantEntitlementMutation: POST body {app_key, plan, limits} exactly (no `enabled`); 201 invalidates entitlementsKeys.all(org) only; 409 and 404 invalidate organizationsKeys.detail(org); a 502 sends one POST and invalidates entitlementsKeys.all(org)" | R9, unknown outcome |
| `entitlements.test.ts` › "useUpdateEntitlementMutation: PATCH …/entitlements/{entitlement_id} (row id, not app key) with the given body; success invalidates entitlementsKeys.all(org); 404 invalidates organizationsKeys.detail(org)" | AC1 |
| `queries.test.ts` › "organizationQueryOptions sends GET /api/v1/organizations/{org_id} under organizationsKeys.detail(id)" | sheet |
| `entitlement-schema.test.ts` › "drift: PLAN_PATTERN, LIMIT_KEY_PATTERN (patternProperties key), minimum 0, maximum = Number.MAX_SAFE_INTEGER, maxProperties 32 and app_key pattern equal EntitlementCreate in openapi.json" | R2 drift |
| `entitlement-schema.test.ts` › "plan: accepts 'pro', 'a', 'team_2-x', 63 chars; rejects '', 'Pro', '-x', 'a b', 64 chars; ' pro ' is trimmed to 'pro'" | validation |
| `entitlement-schema.test.ts` › "limits: accepts 0 rows, 32 rows, value '0' and '9007199254740991'; rejects 33 rows, key 'Seats' / '1x' / 65 chars, value '' / '-1' / '1.5' / '1e3' / '9007199254740992', duplicate keys (error on the later row)" | validation |
| `entitlement-schema.test.ts` › "toLimits / fromLimits round-trip; limitsEqual ignores key order; formatLimitValue renders non-number values as JSON text" | helpers |
| `entitlement-errors.test.ts` › "grant: 409 admin_app / app_disabled / org_mode_none / entitlement_exists → app field messages; unknown 409 reason → alert; 404 unknown_app → app field; 404 without reason → 'This organization no longer exists.'; 422 loc body.plan → plan, body.limits.* → limits, body.app_key → app, other → alert; 403 → forbidden; network / timeout / 502 → unknown-outcome text; other → message (≤ 200 chars)" | ADR 0004 |
| `entitlement-errors.test.ts` › "edit and toggle: 404 → 'This entitlement no longer exists.'; 422 mapping (edit); 403 → forbidden; unknown outcome → 'check the list; saving again is safe'" | ADR 0004 |
| `organization-detail-sheet.test.tsx` › "View opens the sheet: title name + slug; Overview shows slug, status text, description or 'No description', created; GET /organizations/{id} is sent; tabs are Overview and Entitlements" | AC1 shell |
| `organization-detail-sheet.test.tsx` › "detail 404 → 'This organization no longer exists.' (no Retry); 500 → error + Retry; 403 → inline ForbiddenPanel" | AC3 |
| `organization-detail-sheet.test.tsx` › "without admin:entitlements:read the Entitlements tab is not rendered and no entitlements request is sent" | R4, hidden-tab decision |
| `organization-detail-sheet.test.tsx` › "closing the sheet returns focus to that row's View button (not body)" | R10 |
| `organization-entitlements-tab.test.tsx` › "fetches …/entitlements?limit=100&offset=0 only when the tab is selected" | lazy mount |
| `organization-entitlements-tab.test.tsx` › "loading 'Loading entitlements…' / empty 'No products granted yet.' / error + Retry / 403 inline ForbiddenPanel" | AC3 |
| `organization-entitlements-tab.test.tsx` › "rows: table labelled 'Entitlements of {name}', th scope=col; app key mono; plan; limits 'seats: 10' or 'None'; status text Active / Disabled / Inactive; the Inactive note appears only when a row is enabled but inactive" | AC1, R10 (status not colour only) |
| `organization-entitlements-tab.test.tsx` › "suspended org shows 'This organization is suspended …' hint; Grant stays enabled" | suspended hint |
| `organization-entitlements-tab.test.tsx` › "granted only admin:entitlements:read: Grant and switches natively disabled with 'Requires admin:entitlements:write', Edit hidden; list still shown" | R4, ADR 0004 |
| `organization-entitlements-tab.test.tsx` › "total 150 with 100 items → 'Showing 100 of 150 entitlements.'" | Page cap |
| `entitlement-form-dialog.test.tsx` › "grant: Select lists only active, org_mode=required, non-admin apps not yet granted (calechip yes; admin, stoktok, disabled and already-granted apps no); sends POST {app_key, plan, limits:{seats:10}}; toast names app and org; dialog closes; list refetched; focus returns to Grant" | AC1, AC2 |
| `entitlement-form-dialog.test.tsx` › "grant: GET /apps 403 → text 'App key' input with the 'Type the app key' hint; typed key is POSTed; invalid key pattern blocked client-side" | text fallback |
| `entitlement-form-dialog.test.tsx` › "grant: no eligible apps → 'No eligible apps …' text and Grant natively disabled" | picker |
| `entitlement-form-dialog.test.tsx` › "grant: 409 org_mode_none → message on the app field, dialog stays open; 409 entitlement_exists → message and the list is refetched; 404 unknown_app → app field" | errors |
| `entitlement-form-dialog.test.tsx` › "grant pending: 'Granting…' aria-disabled, sr-only status, Escape ignored; a double click sends one POST" | in-flight guard |
| `entitlement-form-dialog.test.tsx` › "edit: app shown read-only; changing only plan PATCHes {plan}; changing a limit PATCHes the whole limits object (unchanged plan not sent); removing all rows sends limits:{}; no change → 'Nothing to save.' and no request; focus returns to that row's Edit" | AC1, replace semantics |
| `entitlement-form-dialog.test.tsx` › "edit: duplicate limit key and a '1.5' value show linked field errors (aria-describedby) and send nothing; 'Add limit' disabled at 32 rows; 422 body.plan maps to the plan field; 404 → alert" | validation, R10 |
| `entitlement-enabled-dialog.test.tsx` › "disable: switch opens a confirm naming org and app; Cancel sends nothing and focus returns to the switch" | AC2, R9, R10 |
| `entitlement-enabled-dialog.test.tsx` › "disable confirm sends one PATCH {enabled:false} even on double click; 'Disabling…' aria-disabled; the switch stays on until the refetch, then off; status 'Disabled'; toast" | AC2, non-optimistic |
| `entitlement-enabled-dialog.test.tsx` › "enable confirm sends PATCH {enabled:true} (non-destructive button)" | AC2 |
| `entitlement-enabled-dialog.test.tsx` › "errors inline, dialog stays open: 403 → ForbiddenPanel; 404 → 'no longer exists' and list refetched" | AC3 |
| `audit-log/data/data.test.ts` › "entitlement audit entries: granted/updated/revoked have non-neutral tones and are in actionOptions; 'Entitlement' is a target type; auditLogSearchSchema accepts action entitlement.granted with targetType entitlement" | AC2 |
| `registry.test.ts` (unchanged) | new keys and actions match `x-permission` |
| `e2e/pages.e2e.ts` › "organizations entitlements: sheet and tab pass axe; grant calechip to Acme (one POST, exact body); disable confirm names Acme Corp and calechip, Cancel sends no PATCH, confirm sends one; suspended Globex shows Inactive" | AC1–3 end to end, R10 axe |

## Approach

### 1. Snapshot regeneration (first commit step)
1. Generate with the same command as PAN-014/PAN-016, from the read-only checkout (do not modify it):
   `cd /home/user/org-admin-api && UV_PROJECT_ENVIRONMENT=/tmp/claude-0/-home-user/ce8daed7-26f0-593f-9bf8-a95df9f28817/scratchpad/oaa-venv /root/.local/bin/uv run python -m app.cli openapi --output /home/user/admin-pan/src/api/openapi.json`
   - If settings demand it, prefix a dummy `DATABASE_URL=postgresql+asyncpg://x:x@localhost/x`.
   - Do **not** copy the scratchpad `oaa-new2.json`. It is minified; the generator writes `indent=2, sort_keys=True`.
2. Run `pnpm api:types`. Re-running it must leave no diff.
3. Record the commit (c41ef57), the command and `git diff --stat src/api/` in impl-log.
4. Expected drift, as read in the scratchpad copy. Confirm it against the generated file:
   - **Paths:** `/api/v1/organizations/{org_id}/entitlements` (GET, POST), `/api/v1/organizations/{org_id}/entitlements/{entitlement_id}` (PATCH, DELETE), plus the join-request operations and `PUT /api/v1/apps/{key}/manifest` (not used here).
   - **New `x-permission` values:** only `admin:entitlements:read` and `admin:entitlements:write`.
   - **New `AuditAction` values:** `app.join_requested`, `app.join_request_approved`, `app.join_request_rejected`, `app.manifest_synced`, `entitlement.granted`, `entitlement.updated`, `entitlement.revoked`. The frontend consult missed `app.manifest_synced`.
   - **New `AuditTarget` values:** `join_request`, `entitlement`.
5. **Audit-log enum additions:** the snapshot has to change, and that forces these. Add every new value, whatever the final list is, in API order.
   - Tones:
     - `entitlement.granted` success, `entitlement.updated` info, `entitlement.revoked` warning;
     - `app.join_requested` info, `app.join_request_approved` success, `app.join_request_rejected` warning;
     - `app.manifest_synced` info.
   - Target labels: `entitlement` "Entitlement", `join_request` "Join request".
   - Nothing else changes in audit-log. There is no join-request UI, query or registry action (PAN-028).

### 2. Registry (R4)
- `ADMIN_PERMISSIONS` gains the two keys, in sorted position.
- New `ACTIONS`:
  - `'organizations.view': perm('admin:organizations:read', 'GET /api/v1/organizations/{org_id}')`
  - `'entitlements.view': perm('admin:entitlements:read', 'GET /api/v1/organizations/{org_id}/entitlements')`
  - `'entitlements.grant': perm('admin:entitlements:write', 'POST /api/v1/organizations/{org_id}/entitlements')`
  - `'entitlements.update': perm('admin:entitlements:write', 'PATCH /api/v1/organizations/{org_id}/entitlements/{entitlement_id}')`
- No `entitlements.revoke`: revoke is out of scope (see decisions).
- The ADR 0004 "hide vs disable" rule applies:
  - Entitlements tab: hidden when `useActionPermission('entitlements.view') === 'denied'`. It is navigation, and the hidden tab sends no request.
  - Grant button: page-level primary button → `Can disable`.
  - Enabled switch: a control that also shows data → `Can disable` (native `disabled` plus "Requires admin:entitlements:write").
  - Edit: a row action → hidden.
  - `unknown` renders the control. A 403 is always shown inline.

### 3. Data layer
- `organizationQueryOptions(id, api)`: `api.GET('/api/v1/organizations/{org_id}', {params:{path:{org_id:id}}, signal})` + `unwrap`, key `organizationsKeys.detail(id)`.
  - Existing org mutations invalidate `organizationsKeys.all`, which also covers the detail and the entitlements. Suspending an org therefore refreshes `active`.
- `entitlementsKeys.all(orgId) = [...organizationsKeys.detail(orgId), 'entitlements']`. `entitlementsKeys.list(orgId, p) = [...all(orgId), {limit, offset}]`.
- `orgEntitlementsQueryOptions(orgId, {limit: 100, offset: 0}, api)`:
  - GET with `params:{path:{org_id}, query}`.
  - No `active` filter: no `?active=` UI (see decisions).
  - Order is the API's (`app_key`, id). No client sort (R1).
- `useGrantEntitlementMutation(orgId, api)`:
  - `mutationFn: (body: EntitlementCreate) => unwrap(await api.POST(…, {params:{path:{org_id}}, body}))`.
  - `retry: false`, `meta: { handlesOwnErrors: true }`. Never optimistic, never `setQueryData`.
  - `onSuccess`: invalidate `entitlementsKeys.all(orgId)`.
  - `onError`: 404/409 → invalidate `organizationsKeys.detail(orgId)` (covers the list). `isUnknownOutcome` (imported from `@/features/apps/data/errors`) → invalidate `entitlementsKeys.all(orgId)`.
- `useUpdateEntitlementMutation(orgId, api)`: PATCH `{entitlementId, body: EntitlementUpdate}`, with the same options except `retry` (default). PATCH is idempotent.
- Request/response types: `components['schemas']['EntitlementRead' | 'EntitlementCreate' | 'EntitlementUpdate']` only (R2).

### 4. Form schema (`entitlement-schema.ts`)
- **Constants** match `schemas.py:9-19`. The drift test checks them against the snapshot, which has `pattern`, `patternProperties`, `minimum`, `maximum` and `maxProperties`.
- **Form values:** `{ app_key: string; plan: string; limits: { key: string; value: string }[] }`.
- **`app_key`:** checked only in grant mode. Required; matches `APP_KEY_PATTERN` (imported from apps).
- **`plan`:** `.trim()`, required, `PLAN_PATTERN`. Message: "Use lowercase letters, digits, - and _; start with a letter or digit (max 63)." It is a free text input with no suggestions: there is no plan catalogue (R1, R11).
- **`limits`** (`superRefine`):
  - Row count ≤ 32.
  - Key: `LIMIT_KEY_PATTERN`. Message: "Start with a lowercase letter; then lowercase letters, digits or _ (max 64)."
  - Value: `/^\d+$/` and `Number.isSafeInteger(Number(v))`. Message: "Use a whole number from 0 to 9007199254740991."
  - Duplicate key: error on the later row's key, "Each limit name must be used once."
  - Errors use `path: ['limits', i, 'key' | 'value']` so `FormMessage` links them.
- **Helpers:**
  - `toLimits(rows) → Record<string, number>`.
  - `fromLimits(record) → rows`. A non-number value (future API shape) becomes its JSON text, and validation then blocks saving it.
  - `limitsEqual(a, b)`: order-insensitive.
  - `formatLimitValue(v)`: `String(v)` for numbers, `JSON.stringify(v)` otherwise. No `toLocaleString`, so no precision or format surprises.

### 5. Detail sheet (minimal PAN-014b shell)
- Copy the `app-detail-sheet.tsx` shape:
  - `useQuery({...organizationQueryOptions(currentRow.id, api), placeholderData: currentRow, enabled: open})` + `queryView`.
  - forbidden → inline `ForbiddenPanel`; 404 → "This organization no longer exists."; other error → message + Retry.
  - `Sheet` / `SheetContent className='w-full gap-0 sm:max-w-2xl'`.
- Title `{org.name} <span className='font-mono text-sm'>({org.slug})</span>`. Description "Organization details and product entitlements."
- **Tabs:** `overview` and, unless denied, `entitlements` ("Entitlements"). Radix unmounts inactive content, so the entitlements list is fetched only when its tab is selected.
- **Overview** (`dl`):
  - Slug (mono), Name;
  - Status: the existing org status badge classes and label from `organizations/data/data.ts`, as text;
  - Description, or "No description";
  - Created (`<time>`).
  - Left for PAN-014b: `created_by`, `updated_at`, the audit-log link.
- **Focus.** `SheetContent onCloseAutoFocus={(e) => { e.preventDefault(); returnFocus() }}`. `returnFocus` focuses `viewButtons.current.get(currentRow.id)`, a ref registered by the row's View button. There is no `querySelector`.

### 6. Entitlements tab (`organization-entitlements-tab.tsx`, props `{ org: Organization }`)
- **Header:**
  - `<h3 ref={heading} tabIndex={-1}>Entitlements</h3>`.
  - Help text: "Products this organization can use. Plan and limits are read by each app; there is no billing here. Changes are recorded in the audit log."
- **Suspended hint.** When `org.status === 'suspended'` (from the sheet's detail data): "This organization is suspended, so its entitlements are inactive. You can still grant and edit them." Grant is **not** blocked: the API allows it (service.py:38-40, 63).
- **Grant** button: `ref={grantButton}`, `<Can action='entitlements.grant' disable>`, `Plus` icon, label "Grant product".
- **States:**
  - pending: `<p role=status>Loading entitlements…</p>`;
  - error: `role=alert` "Couldn't load entitlements." + Retry;
  - forbidden: inline `ForbiddenPanel`;
  - empty: a row "No products granted yet."
- **Table** (`overflow-x-auto rounded-md border`, `aria-label="Entitlements of {org.name}"`, `TableHead scope='col'`):
  - **App:** `app_key`, mono.
  - **Plan.**
  - **Limits:** a `ul` of `key: value`, or "None" for `{}`.
  - **Enabled:** `Switch checked={e.enabled}` with `aria-label="{app_key} enabled"`, inside `<Can action='entitlements.update' disable>`. `onCheckedChange` opens the confirm (`setToggle(e)`). The ref goes into `switches = useRef(new Map<string, HTMLButtonElement>())` by `e.id`.
  - **Status:** text Badge: `!e.enabled` → "Disabled"; `e.enabled && !e.active` → "Inactive"; else "Active". `active` is read from the API, never recomputed (R1).
  - **Updated:** `<time>` using apps `formatDate`.
  - **Actions** (sr-only header): `<Can action='entitlements.update'>` with `Button variant='outline' size='sm'`, `aria-label="Edit {app_key}"`, text "Edit". The ref goes into an `editButtons` map by `e.id`. Outline stays contrast-safe; there is no red text.
  - When any row is Inactive, a note under the table: "Inactive: enabled, but the organization is suspended or the app is disabled."
- **Page cap.** If `total > items.length`: `<p role=status>` "Showing {items.length} of {total} entitlements." There is no pager: the number of rows is bounded by the apps with `org_mode=required`.
- **Focus** (credentials-tab pattern):
  - `focusAfter = useRef<{kind:'switch'|'edit'; id} | {kind:'heading'} | null>`.
  - Effects run when `toggle` / `editing` return to null. Focus the mapped element, or `heading.current` if it is gone (e.g. after a 404 refetch).
  - Grant focus returns through the dialog's `returnFocus` to `grantButton`.
  - No selectors built from API data.
- **Dialogs**, conditionally mounted so each open starts fresh:
  - `{granting && <EntitlementFormDialog mode='grant' org existing={items.map(i=>i.app_key)} …/>}`
  - `{editing && <EntitlementFormDialog mode='edit' org entitlement={editing} …/>}`
  - `{toggle && <EntitlementEnabledDialog org entitlement={toggle} onDone=… />}`

### 7. Dialogs
**`EntitlementFormDialog`** uses Radix `Dialog`, following `app-permission-form-dialog.tsx`.
- **Close handling:**
  - `onOpenChange` ignores close while pending.
  - `onEscapeKeyDown` / `onInteractOutside` call `preventDefault` while pending.
  - `onCloseAutoFocus` calls `preventDefault()` then `returnFocus()`.
- **Submit guard:**
  - `inFlight = useRef(false)` is checked and set synchronously before `mutateAsync`, and reset in `finally`.
  - Submit button: `aria-disabled={pending || undefined}` with `opacity-50`, label "Granting…" / "Saving…".
  - sr-only `role=status` while pending.
  - Inline alert area: `ForbiddenPanel` or `<p role=alert className='text-sm text-destructive'>`.
- **Grant mode:**
  - Title "Grant product". Description: "Grant a product to {org.name} ({org.slug}). The change is recorded in the audit log."
  - When the org is suspended, also: "The organization is suspended: the entitlement stays inactive until it is reactivated."
  - **App field:**
    - Data: `useQuery(appsListQueryOptions({limit: 100, offset: 0}, api))` (admin:apps:read).
    - pending: `<p role=status>Loading apps…</p>` in place of the field.
    - success with `total <= items.length`: `SelectDropdown` (as in `app-form-dialog.tsx`), label "App". Options are `{name} ({key})` for apps with `status==='active'`, `org_mode==='required'`, `key !== ADMIN_APP_KEY`, and not in `existing`. This filter is a convenience only; the API enforces the rule with 409 and the mapping stays.
    - zero eligible: the text "No eligible apps. An app must be active, use organizations, and not be granted here yet." replaces the field, and the Grant button is natively `disabled`.
    - 403, other error, or `total > items.length`: a text `Input` labelled "App key" (`autoComplete='off'`). Description: 403 → "You can't list apps (needs admin:apps:read). Type the app key."; otherwise "Couldn't load the app list. Type the app key."
  - **Plan:** `Input`, hint "Lowercase letters, digits, - and _".
  - **Limits:**
    - `useFieldArray` rows of two inputs: "Limit name" and "Value". Each has a visible label on the first row and `aria-label="Limit name, row {n}"` / `"Value, row {n}"`.
    - The value input is `type='text' inputMode='numeric'`. No `type=number`: it loses precision and accepts `e`.
    - Each row has a remove button (`aria-label="Remove limit row {n}"`, ghost, `X` icon).
    - "Add limit" (outline) is natively disabled at 32 rows, with the text "At most 32 limits."
    - Empty list: "No limits."
  - **Request:** sends `{app_key, plan, limits: toLimits(rows)}`. `enabled` is omitted (API default `true`); disabling is a separate, confirmed action.
  - **Success:** `toast.success('{app_key} granted to {org.name}.')`, then close.
- **Edit mode:**
  - Title "Edit {app_key} for {org.name}". The app is shown read-only (text, not an input). Plan and limits are prefilled from the row.
  - Body: `plan` only if the trimmed plan differs; `limits: toLimits(rows)` (the whole object) only if `!limitsEqual`. Never `null`; `{}` clears.
  - Empty body: inline "Nothing to save." and no request. The API would write no audit row anyway.
  - Success: `toast.success('{app_key} for {org.name} updated.')`, then close.
- **Error mapping:**
  - `entitlementFormError(error, mode)` returns `{fields: {app_key?, plan?, limits?}, alert}`.
  - The first field error gets `setError(…, {shouldFocus:true})`. A `limits` field error is shown under the limits group (`role=alert`, linked from the "Add limit" group via `aria-describedby`).

**`EntitlementEnabledDialog`** uses `ConfirmDialog`, following `app-permission-admin-dialog.tsx`.
- **Disable** (`destructive`):
  - Title "Disable {app_key} for {org.name}?"
  - Description: "The entitlement becomes inactive. Its plan and limits are kept and you can enable it again. The change is recorded in the audit log."
  - Confirm "Disable", pending "Disabling…".
- **Enable:**
  - Title "Enable {app_key} for {org.name}?"
  - Description: "The entitlement is active again while the organization and the app are active. The change is recorded in the audit log."
  - Confirm "Enable", pending "Enabling…".
- **Mechanics:**
  - `inFlight` ref guard; `mutation.mutate({entitlementId, body:{enabled: !e.enabled}})`.
  - On success: toast "{app_key} disabled/enabled for {org.name}.", then `onDone('success')`.
  - Errors from `entitlementToggleError` are shown inline. Close is blocked while pending, and `mutation.reset()` runs on close.
  - The switch reads only query data, so it flips after the refetch.

### 8. Errors (`entitlement-errors.ts`)
- Same structure and helpers as `apps/data/errors.ts`. Small private copies of `detailObjects`, `firstReason` and a `bodyLoc` that keeps the full `loc`. The apps helpers are private, and lifting them would edit apps files (R7 → follow-up).
- **Grant**, checked in order:
  1. Unknown outcome: "We couldn't confirm whether the product was granted. Check the list before trying again."
  2. 409, by `reason`:
     - `admin_app`: "The admin app can't be granted to an organization."
     - `app_disabled`: "This app is disabled. Enable it before granting it."
     - `org_mode_none`: "This app doesn't use organizations."
     - `entitlement_exists`: "This organization already has this app."
     - other: alert "The API refused this grant."
  3. 404 with `unknown_app`: app field "No app with this key."
  4. 404: alert "This organization no longer exists."
  5. 422 `validation_error`: `loc[1]` of `plan` / `limits` / `app_key` → that field (msg ≤ 200 chars); nothing mapped → "The API rejected these values."
  6. `fallback`: 403 → forbidden copy; otherwise the message cut to 200 characters.
- **Edit:**
  - 404: "This entitlement no longer exists."
  - 422: as above (plan / limits).
  - Unknown outcome: "We couldn't confirm the change. Check the list; saving again is safe."
  - Otherwise `fallback`.
- **Toggle:** same as edit, without fields.
- Server text is never shown for mapped cases. 422 `msg` values contain no echoed input (api consult).

### 9. e2e (`fake-api.ts`, `pages.e2e.ts`)
- **Types:** `type EntitlementRead = components['schemas']['EntitlementRead']`.
- **State:** a per-install `ents: Record<orgId, EntitlementRead[]>`.
  - acme: `[]`.
  - globex (suspended): one calechip row, `plan 'pro'`, `limits {seats: 5}`, `enabled: true`, `active: false`, id `88888881-8888-4888-8888-888888888888`.
  - initech: `[]`.
- **Routes per org:**
  - `GET /api/v1/organizations/${o.id}` → `json(200, o)`.
  - `GET …/entitlements` → `page(ents[o.id], query)`.
  - `POST …/entitlements`, checked in order:
    - unknown app → 404 `unknown_app`;
    - `admin` → 409 `admin_app`;
    - disabled → `app_disabled`;
    - `org_mode !== 'required'` → `org_mode_none`;
    - exists → `entitlement_exists`.
    - Otherwise create a row with a fixed id `88888882-…`, `enabled: body.enabled ?? true` and `active = enabled && o.status==='active' && app.status==='active'`. Register its PATCH route and return 201.
  - `PATCH …/entitlements/${id}`, per row (helper `addPatchRoute`, as `addRevokeRoute`): apply non-null `plan` / `limits` / `enabled`, recompute `active`, set `updated_at`, return 200.
- **New test** (separate from the existing org test, which asserts zero org writes):
  1. `signIn('/organizations')`. Click "View Acme Corp", then `selectTab('Entitlements')`. Expect "No products granted yet." Run `expectNoSeriousA11y(page,'organizations-entitlements')`.
  2. Click "Grant product". Pick calechip, plan `pro`, Add limit `seats` = `10`. Run `expectNoSeriousA11y(page,'organizations-entitlement-grant')`. Click Grant.
     - Expect `api.count('POST /api/v1/organizations/<acme>/entitlements') === 1`, with body `{app_key:'calechip', plan:'pro', limits:{seats:10}}`.
     - The row shows "seats: 10" and "Active".
  3. Click the switch "calechip enabled". The alertdialog contains "Acme Corp" and "calechip". Run `expectNoSeriousA11y(page,'organizations-entitlement-disable')`. Cancel: 0 PATCH. Repeat and confirm: 1 PATCH with body `{enabled:false}`; the row shows "Disabled".
  4. Close the sheet, then open Globex → Entitlements. The calechip row shows "Inactive", and the suspended hint is visible.
- The 409 reasons stay in unit tests. `me/permissions` is `admin:*`, so denied paths are unit-only. No `a11y-known-issues` entries.

### Rules
- **R1:** only API data is shown. `active` is never recomputed in the UI; the e2e fake computes it because it stands in for the API. There is no plan catalogue and no "unlimited" option. Copy claims only what the API does.
- **R2:** generated types; HTTP only via `src/api` through the query modules. The snapshot comes from the generator.
- **R3/R5:** untouched. No new `VITE_*`.
- **R4:** registry entries. The tab is hidden, Grant and switch use `Can disable`, Edit is hidden. Every 403 is shown inline.
- **R6:** all values render as React text.
- **R7:** the sheet shell is a deliberate, recorded overlap with PAN-014b (see Split proposal). No revoke, no `active` filter, no join-request UI. Audit-log changes are enum-only. Apps files are not edited.
- **R9:** enable/disable confirm names org and app. No mutation is optimistic. Errors are shown inline, and the list is invalidated after success and after 404/409.
- **R10:**
  - labelled inputs with linked errors (`FormMessage`);
  - semantic table with `scope=col` headers;
  - status as text, not colour only;
  - pending status announced;
  - focus returns through refs to the View, Grant, Edit or switch control, or to the stable heading;
  - axe in e2e.
- **R11:** no billing; staff-only.

## Specialist input used
Decisions on the questions the caller asked to settle:
- **Detail-sheet shell, PAN-014b overlap: adopted, minimal** (frontend rec 2).
  - AC1 needs a per-org place, and the API is org-scoped.
  - In scope: Sheet + Overview (slug, name, status, description, created) + Entitlements tab, and `GET /organizations/{org_id}` for 404/403.
  - `created_by`, `updated_at` and the audit link stay in PAN-014b.
- **Revoke (DELETE): out.** Spec §5.6 and AC1 say enable/disable and set plan/limits. Disable covers the need and is reversible. Revoke is irreversible and would need a type-to-confirm dialog, a registry action and more tests on an already large ticket. Follow-up PAN-019b. This follows the frontend Q2; the api-platform rec "offer both" is deferred. Listed for the owner.
- **"Changes confirmed" (AC2): confirm dialog for enable and disable** (both directions, frontend rec 6). Grant and edit are confirmed by their own dialog submit; there is no second confirm. Read together with "audited by the API": every change is an explicit dialog action naming org and app, non-optimistic, with toast feedback after the API answers. This follows frontend Q3. api-platform rec 4 asked to confirm only disable; enable is added for symmetry with "changes confirmed".
- **Tab without `entitlements:read`: hidden** (ADR 0004: navigation is hidden; frontend Q4). It also avoids a guaranteed 403 request.
- **Grant app picker with text fallback: adopted.** Select of eligible apps from `GET /apps?limit=100`. The text "App key" input is used on 403, on an error, or when the list is truncated. "No eligible apps" disables Grant. The API's 404/409 mapping stays (frontend rec 6, api-platform rec 2 / Q4: `org_mode` is in `AppRead`).
- **Suspended-org grant: hint, not block.** The API allows it (service.py:63). The tab and grant dialog say the entitlement stays inactive (api-platform Q1).
- **Other consult items:**
  - Generator, not the scratchpad copy (frontend rec 4): adopted.
  - Audit enum additions (frontend Findings): adopted, plus `app.manifest_synced`, which the consult missed.
  - Registry keys (both): adopted. `entitlements.revoke` dropped with revoke.
  - Keys under `organizationsKeys.detail(org)` so org mutations also refresh entitlements: adopted. The frontend proposed `['organizations','entitlements',orgId]`; nesting under detail lets 404 handling refresh both at once.
  - `limit=100` + "Showing N of total" (both): adopted. No pager.
  - **`?active=` three-state filter (api-platform rec 2): rejected.** It is not in the AC (rule 1: no extras), and the rows are few. Status is shown per row.
  - `enabled` switch + `active` status text (api-platform): adopted. The status uses text with a note instead of a tooltip, so it is keyboard- and touch-accessible.
  - Limits as text/numeric inputs, duplicate keys rejected, 32 cap, whole-object replace, `{}` to clear, PATCH only changed fields (both): adopted.
  - **"Disable Save while unchanged" (frontend): replaced** by the inline "Nothing to save." on submit. A disabled button gives no reason; the message does.
  - **Enabled checkbox in grant (frontend rec 6): rejected.** The API default is true, and disabling is the confirmed action.
  - Error-helper duplication (frontend risk): private copies in the new errors file. Lifting them is a follow-up.
  - **Refetch on edit open (both risks): not done.** Last write wins is accepted for v1. A 404 is mapped. ETag is a follow-up.
  - e2e seeds and a separate test (frontend rec 7): adopted. Globex is seeded inactive.

## Assumptions
- The regenerated snapshot at c41ef57 matches the drift listed in Approach §1. Any extra drift is handled as stated under Files.
- `EntitlementRead.limits` is typed `{[key: string]: number}`. The display tolerates other value types anyway.
- `GET /api/v1/apps` returns all apps on one page at `limit=100` today (3 in e2e). Truncation falls back to text input.
- Radix `TabsContent` unmounts inactive tabs (as the Apps sheet already relies on), so the hidden-or-unselected tab sends no request.
- A nested `Dialog`/`AlertDialog` inside the `Sheet` blocks Escape on the inner layer only (verified in PAN-015/PAN-027).
- UI labels are in English, as on every screen (spec §8 Q3 open).
- The `admin:entitlements:*` keys are granted to no role (migration `20261117_c8a1f4e72d95`). In practice only `admin:*` holders see the tab. This is the API's choice; no UI work.

## Needs owner's decision (non-blocking; the safer option is planned)
1. **Revoke (DELETE)**: deferred to a follow-up PAN-019b (type-to-confirm). Planned: disable only.
2. **Confirm scope**: a confirm dialog for enable and disable; grant and edit are confirmed by their dialog submit.
3. **Hidden Entitlements tab** for staff without `admin:entitlements:read` (vs a disabled tab with a reason).
4. **Suspended org**: grant allowed, with a hint (mirrors the API), vs blocking in the UI.
5. **Role seeding**: should an admin role get `admin:entitlements:read/write`? Today only `admin:*` holders can use the screen. This is an org-admin-api / ops decision.
6. Spec §5.6 still says ADM-006 "(backlog)". A product-manager edit is needed.

## Blocking questions
None.

## Split proposal
No split into separate tickets. One spec feature (§5.6) with no API change. The ticket does carry two recorded extras:
- **(a)** the minimal org detail sheet, which PAN-014 proposed as PAN-014b. Only the shell is taken; PAN-014b keeps `created_by`, `updated_at` and the audit link.
- **(b)** the unavoidable enum-only audit-log and registry updates from the snapshot.

Production code is roughly 900 lines; tests are most of the diff. This is above the ~400-line guide, as PAN-027 was (~550). It stays one slice because AC1 needs sheet + list + edit together.

Fallback if attempt 1 runs far over:
- **PAN-019a:** snapshot, registry, audit enums, sheet, tab list and enable/disable confirm.
- **PAN-019c:** grant and edit form dialog.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/organizations` → row "View {name}" → detail sheet | `admin:organizations:read` (`organizations.view`) | placeholder = list row / — / "Couldn't load this organization." + Retry; 404 "This organization no longer exists." / inline ForbiddenPanel / Overview | — | — |
| same, tab **Entitlements** (hidden when `entitlements.view` denied) | `admin:entitlements:read` (`entitlements.view`) | "Loading entitlements…" / "No products granted yet." / "Couldn't load entitlements." + Retry / inline ForbiddenPanel / table + suspended hint + Inactive note | — | — |
| same, **Grant product** dialog | `admin:entitlements:write` (`entitlements.grant`, Can disable); picker uses `admin:apps:read` (text fallback) | "Granting…" / "No eligible apps" / field errors + alert / inline ForbiddenPanel / toast + new row after refetch | Grant → `POST …/entitlements` | success, unknown outcome: `entitlementsKeys.all(org)`; 404/409: `organizationsKeys.detail(org)` |
| same, **Edit** dialog (row action, hidden when denied) | `admin:entitlements:write` (`entitlements.update`) | "Saving…" / "Nothing to save." / field errors + alert / inline ForbiddenPanel / toast + row after refetch | Save → `PATCH …/entitlements/{id}` `{plan?, limits?}` | same |
| same, **Enabled** switch → confirm | `admin:entitlements:write` (`entitlements.update`, Can disable) | "Disabling…"/"Enabling…" / — / inline alert / inline ForbiddenPanel / toast; switch flips after refetch | Confirm → `PATCH …/entitlements/{id}` `{enabled}` | same |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/organizations/{org_id}` | path `org_id` | `OrganizationRead` | 401 (client), 403, 404, 5xx/network (Retry) | ADM-001 (existing) |
| GET | `/api/v1/organizations/{org_id}/entitlements` | path `org_id`; query `limit=100`, `offset=0` | `Page_EntitlementRead_` | 401, 403 `permission_denied`, 404 (org gone → generic error), 422, 5xx/network (Retry) | ADM-006 (DONE, c41ef57) |
| POST | `/api/v1/organizations/{org_id}/entitlements` | `EntitlementCreate` `{app_key, plan, limits}` | `EntitlementRead` (201) | 403; 404 `unknown_app` / org; 409 `conflict` + `admin_app` / `app_disabled` / `org_mode_none` / `entitlement_exists`; 422 `validation_error` (loc); network/timeout/5xx → unknown outcome | ADM-006 |
| PATCH | `/api/v1/organizations/{org_id}/entitlements/{entitlement_id}` | `EntitlementUpdate` `{plan?}`, `{limits}` (whole), or `{enabled}` | `EntitlementRead` | 403; 404 (entitlement or org gone) + refetch; 422 (loc); network/5xx → "saving again is safe" | ADM-006 |
| GET | `/api/v1/apps` | `limit=100`, `offset=0` | `Page_AppRead_` | 403 / any error / truncation → text input fallback | existing (PAN-015) |

## Follow-ups (out of scope, R7)
- **PAN-019b:** revoke an entitlement (`DELETE`, type-to-confirm, `entitlements.revoke` action), if the owner wants it.
- **PAN-014b:**
  - add `created_by` and `updated_at` to the sheet, plus the audit-log link (`?targetType=organization&target=<id>`);
  - optionally an entitlement audit link (`?targetType=entitlement&target=<id>`);
  - the org delete dialog surfacing 409 `org_has_entitlements` with a pointer to the Entitlements tab.
- **Apps screen:**
  - surface `app_has_entitlements` on app delete if delete is ever added;
  - lift `detailObjects` / `firstReason` / `bodyFields` to `src/lib/api-errors.ts`.
- **Organizations row menu:** `text-red-500!` on Delete is a contrast risk (apps uses `text-red-700 dark:text-red-400`). Edit/status dialogs do not restore focus to the row.
- **org-admin-api:**
  - an ETag / If-Match on PATCH (last write wins on `limits`);
  - a reverse view "which orgs have app X";
  - guard `org_mode` changes against existing entitlements (ADM-006 review);
  - the `entitlement_exists` reason on a concurrent delete;
  - seed `admin:entitlements:*` into a staff role.
- **Spec:** product-manager updates §5.6 "(backlog)" → done.
- **PAN-028:** join-request UI. Its audit enums already land here.
