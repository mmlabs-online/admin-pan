Status: READY

# Plan — PAN-034: Apps — issue credentials by scope (slice 1 of 2; slice 2 = special roles, see Split proposal)

## Spec summary
- `docs/spec-v1.md` §5.4: "Apps registry (join policy, org mode, origins, default role), roles and their permissions, role assignments per user (app scope or one org), revoke sessions." App credentials as delivered in PAN-027 (ADR 0007).
- Ticket scope items 1 and 2 (quoted):
  1. "**Issue credential dialog** (`app-credential-issue-dialog.tsx`): add a required "Scope" select. Offer only the scopes valid for this app (`admin` app → `releases` only; hide `limits:write`). One-line hint per scope; for runtime scopes (`org-members:read`, `usage:*`) say "backend deploy environment only, never CI or browser code". Send `{"scope": …}`. Keep the existing show-once and copy-then-clear secret handling unchanged (ADR 0007)."
  2. "**Credentials tab** (`app-credentials-tab.tsx`): add a "Scope" column, and show the 2-active limit per scope, not per app."
- API contract, verified on org-admin-api `main` a77e819 (read-only clone):
  - `app/modules/app_credentials/router.py:26-50`: `POST /api/v1/apps/{key}/credentials`, `x-permission: admin:apps:write`, `requires_super="always"`; body `AppCredentialIssue | None`, `None` gives `manifest`; response `AppCredentialIssued`, `Cache-Control: no-store`. `GET …/credentials` is `admin:apps:read`, `Page[AppCredentialRead]`.
  - `app_credentials/schemas.py:9-34`: `AppCredentialRead.scope: AppCredentialScope` (always present, required); `AppCredentialIssue` has `extra="forbid"` and `scope` defaulting to `manifest`.
  - `app_credentials/models.py:17-36`: `AppCredentialScope` = `manifest`, `releases`, `org-members:read`, `usage:read`, `usage:write`, `limits:write`; `RUNTIME_SCOPES` = `org-members:read`, `usage:read`, `usage:write`, `limits:write`.
  - `app_credentials/service.py:111-133`, in order: 404 `not_found`; 403 `admin_wildcard_required` (`require_super`, audited); 409 `conflict` with `details=[{field:"key", reason}]` and reason `admin_app` (the `admin` app and a scope other than `releases`), `app_disabled`, `scope_not_available` (`limits:write`, until ADM-044), `credential_limit` (2 active per app **and scope**). A bad scope or extra key gives 422 `validation_error`.

## Acceptance criteria → verification
This plan covers AC1, plus AC3 and AC4 for the credential calls. AC2, and AC3/AC4 for the role PATCH, belong to slice 2 (Split proposal).

| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | "A staff user can issue an `org-members:read` credential for simap from the UI, and the credentials list shows its scope." | `app-credential-issue-dialog.test.tsx` › "select org-members:read, Issue: one POST with body exactly {"scope":"org-members:read"} …". `app-credentials-tab.test.tsx` › "Scope column shows each row's scope …" (a fixture row has `org-members:read`). Uses the fixture app `simap` (org_mode required). e2e `pages.e2e.ts` credentials test picks a scope. |
| 3 (credentials) | "Every API refusal for these calls shows a specific message; nothing fails silently." | `errors.test.ts` › `credentialIssueError` table: 403 ×2, 404, 409 `admin_app` / `app_disabled` / `scope_not_available` / `credential_limit` (names the chosen scope) / unknown reason, 422 `validation_error`, unknown outcome. The dialog test asserts each one as `role=alert` text, or as the inline ForbiddenPanel. |
| 4 (credentials) | "Tests cover scope options per app (admin vs other), the request bodies sent, … and the refusal-message mapping." | `data.test.ts` › `credentialScopeOptions` for `admin` vs `calechip`. The dialog DOM test lists the options for both apps. `queries.test.tsx` and the dialog test assert the POST body. `errors.test.ts` covers the mapping. |
| — | ADR 0007 unchanged in behaviour | The existing leak-regression test passes and also runs for scope `org-members:read`. The reveal input is still outside any `<form>`. |
| — | R8 | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` all green. `pnpm api:types && git diff --exit-code src/api/schema.d.ts` is clean (CI step). `pnpm e2e` is green (CI job). |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/api/openapi.json` | Fragment refresh from a77e819 (Approach §0). **Replace** `paths['/api/v1/apps/{key}/credentials'].post` (adds `requestBody`, `x-requires-super: "always"`, the new 409 text). **Replace** `components.schemas.AppCredentialRead` and `AppCredentialIssued` (adds `scope`). **Add** `AppCredentialScope` and `AppCredentialIssue`. Nothing else. | R2: types come from the generated schema |
| `src/api/schema.d.ts` | Output of `pnpm api:types` | R2; the CI drift check |
| `src/lib/permissions/registry.ts` | New `Requirement` kind `{ kind: 'super'; base: AdminPermission; when: 'always' \| 'conditional'; operations }` and a `superOf()` helper. `'apps.issueCredential'` becomes `superOf('admin:apps:write', 'always', 'POST /api/v1/apps/{key}/credentials')`. | R4: the UI must mirror the API's `admin:*` requirement. Today the button shows as enabled for staff who will always get a 403 (identity consult F1). |
| `src/lib/permissions/source.ts` | `evaluate`: `super` → `source.check('admin:*')` | R4 / ADR 0004 tri-state |
| `src/components/permissions/can.tsx` | With `disable` and a `super` requirement, show "Requires admin:*" | R4/R10: the visible reason must be the real one |
| `src/lib/permissions/registry.test.ts` | For `super` entries: `base === x-permission` and `when === x-requires-super` of every named operation | ADR 0004 drift guard |
| `src/lib/permissions/source.test.ts` | Case: `super` is granted, denied or unknown exactly as the source answers for `admin:*`. `admin:apps:write` alone gives denied. | R8 |
| `docs/adr/0004-permission-mirroring-and-403-handling.md` | "Amendment (PAN-034)": the `super` requirement kind | Rule 7: this decision outlives the ticket, and slice 2 reuses it |
| `docs/adr/0007-one-time-secrets-in-the-ui.md` | "Amendment (PAN-034)": the mutation variables are `{ <non-secret request fields>, onSecret }`. Still no `mutationKey`. Non-secret fields such as `scope` may appear in variables and UI text, never the value. | Keeps the ADR true; the reviewer checks against it |
| `src/features/apps/data/app-schema.ts` | `export type AppCredentialScope = components['schemas']['AppCredentialScope']`. `APP_CREDENTIAL_SCOPES` as a const tuple of all 6 values, with a `Same<>` compile-time guard against the generated type. | R2, drift guard |
| `src/features/apps/data/data.ts` | `ISSUABLE_SCOPES` (5 values, no `limits:write`). `credentialScopeOptions(appKey)`: `admin` → `[releases]`, any other app → the 5 values. `isRuntimeScope(scope)`. `credentialScopeHints: Record<AppCredentialScope, string>` (copy in Approach §4). `CREDENTIAL_LIMIT_NOTE`. | Scope item 1; pure logic is unit-testable |
| `src/features/apps/data/data.test.ts` | Tests for the helpers above | AC4, R8 |
| `src/features/apps/api/queries.ts` | `useIssueCredentialMutation`: variables become `{ scope: AppCredentialScope; onSecret }` and the body is `{ scope }`. `retry: false`, `gcTime: 0`, no `mutationKey`, the invalidation and the sink all stay unchanged. | Scope item 1, ADR 0007 |
| `src/features/apps/api/queries.test.tsx` | Update the two `useIssueCredentialMutation` tests: the body is `{"scope":"manifest"}` / `{"scope":"org-members:read"}`; everything else asserted as before | AC4 |
| `src/features/apps/data/errors.ts` | `credentialIssueError(error, scope)`: new and changed 409 copy, plus a 422 branch (Approach §5) | AC3 |
| `src/features/apps/data/errors.test.ts` | Extend the `credentialIssueError` table | AC3/AC4 |
| `src/features/apps/components/app-credential-issue-dialog.tsx` | Required Scope select (react-hook-form + zod) in the confirm phase only. Hint per scope. Runtime-scope warning. Scope named in the reveal phase and the storage advice chosen by scope. Per-scope limit copy. | Scope item 1 |
| `src/features/apps/components/app-credential-issue-dialog.test.tsx` | Update the existing tests (select a scope first; body no longer empty; new copy). Add the tests listed below. | AC1/AC3/AC4, R8 |
| `src/features/apps/components/app-credentials-tab.tsx` | "Scope" column (`<code>`), `colSpan` 6. Per-scope limit copy. The Issue button is now shown for the `admin` app too, with the note "The admin app can only have releases credentials." | Scope items 1–2 |
| `src/features/apps/components/app-credentials-tab.test.tsx` | Update the admin-app test and the "Requires admin:apps:write" test (it becomes "Requires admin:*"). Add the Scope column test. | R8 |
| `src/features/apps/components/test-data.ts` | `scope` on every `credential()` fixture (default `manifest`). Add app `simap` (org_mode `required`) with credentials including an `org-members:read` row. | Types now require `scope`; AC1 fixture |
| `src/features/apps/components/apps-table.test.tsx` (only if needed) | Fix any count or row assertion that breaks because `simap` was added to `APPS` | Fixture change; record it in impl-log if touched |
| `e2e/support/fake-api.ts` | Seed credential gets `scope: 'manifest'`. POST reads `body.scope ?? 'manifest'`, sets it on the row, and refuses like the API: `admin` with a non-`releases` scope → `admin_app`; disabled → `app_disabled`; `limits:write` → `scope_not_available`; 2 active of that scope → `credential_limit`. | Typecheck (`AppCredentialRead.scope` is required); the e2e flow |
| `e2e/pages.e2e.ts` | Credentials test: pick scope `manifest` before each Issue. The limit text becomes "already has 2 active manifest credentials". | The CI e2e job |

The implementer must not touch other files without recording why in impl-log (R7).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `data.test.ts` › "credentialScopeOptions: admin → [releases]; calechip → manifest, releases, org-members:read, usage:read, usage:write; never limits:write" | AC4 scope options |
| `data.test.ts` › "isRuntimeScope true only for org-members:read, usage:read, usage:write, limits:write; every runtime hint says 'Backend deploy environment only, never CI or browser code'; every AppCredentialScope has a hint" | Scope item 1 copy |
| `data.test.ts` › "APP_CREDENTIAL_SCOPES equals the AppCredentialScope enum in openapi.json" (reads `openapi.json?raw`, as PAN-018's drift guard) | R2 drift |
| `queries.test.tsx` › "useIssueCredentialMutation: POST with body {scope}; sink receives FAKE_CREDENTIAL; resolves with metadata (incl. scope) without `credential`; mutation state has no FAKE_CREDENTIAL; invalidates credentialsAll(key) only" | ADR 0007, body |
| `errors.test.ts` › "credentialIssueError: 409 admin_app / app_disabled / scope_not_available / credential_limit (names the chosen scope) / other 409 / 422 validation_error / 404 / 403 ×2 -> forbidden / unknown outcome / non-ApiError" | AC3 |
| `app-credential-issue-dialog.test.tsx` › "Scope select is labelled 'Scope', required, nothing preselected; Issue without a scope shows 'Select a scope.' linked to the trigger and sends no POST" | Required, no preselect, R10 |
| `…dialog.test.tsx` › "calechip offers 5 scopes (no limits:write); admin offers only releases" | AC4 (DOM) |
| `…dialog.test.tsx` › "select org-members:read, Issue: one POST with body exactly {"scope":"org-members:read"} even on double click; the runtime warning is visible before Issue and in the reveal phase; the reveal names key id and scope" | AC1, runtime copy |
| `…dialog.test.tsx` › "manifest: the hint says CI deploy secret store; no runtime warning" | Scope hints |
| `…dialog.test.tsx` › existing "leak regression …", now parametrised over `manifest` and `org-members:read` | ADR 0007 |
| `…dialog.test.tsx` › existing refusal test extended: 403 ×2, 409 `admin_app` ("only have releases credentials") / `app_disabled` / `scope_not_available` / `credential_limit` ("2 active org-members:read credentials"), 404, 422 → alert; the dialog stays in the confirm phase with the chosen scope kept | AC3 |
| `…dialog.test.tsx` › existing "network failure and 502 …" (select a scope first) | Unknown outcome unchanged |
| `app-credentials-tab.test.tsx` › "Scope column shows each row's scope (manifest, org-members:read); table header 'Scope'; empty row spans 6 columns; copy says 'Each scope can have at most 2 active credentials.'" | Scope item 2, AC1 |
| `app-credentials-tab.test.tsx` › "admin app: Issue button shown with 'The admin app can only have releases credentials.'; disabled app note unchanged" (replaces the old admin test) | Scope item 1 |
| `app-credentials-tab.test.tsx` › "granted admin:apps:read + admin:apps:write without admin:*: Issue disabled with 'Requires admin:*' linked by aria-describedby; granted all: enabled" (replaces the "Requires admin:apps:write" test) | R4 via the `super` kind |
| `registry.test.ts` › "every super requirement: base equals x-permission and `when` equals x-requires-super of each operation it names" | ADR 0004 amendment |
| `source.test.ts` › "evaluate: super returns the source's answer for admin:*" | ADR 0004 amendment |
| `e2e/pages.e2e.ts` › existing credentials test, updated (scope pick, per-scope limit text, axe still clean) | End to end |

## Approach
0. **Snapshot (R2), the PAN-018 method.**
   1. `git -C /home/user/mmlabs-online/org-admin-api rev-parse --short HEAD` must print `a77e819`.
   2. Generate into the scratchpad without writing to the clone: `cd /home/user/mmlabs-online/org-admin-api && UV_PROJECT_ENVIRONMENT=<scratchpad>/oaa-venv DATABASE_URL=postgresql+asyncpg://x:x@localhost/x uv run python -m app.cli openapi --output <scratchpad>/openapi-a77e819.json`.
   3. A scratchpad Python script (Python keeps the `0.0` number formatting, as PAN-018) copies exactly the fragments in the Files table into `src/api/openapi.json`. It replaces whole objects, keeps keys sorted, and writes 2-space JSON with a trailing newline. Every schema `$ref`ed by those fragments must already be in the snapshot and be deep-equal to the generated version (`ErrorEnvelope`, …). If one is not, stop and record it in impl-log rather than overwrite it.
   4. `pnpm api:types`. In `git diff src/api/`, only the credential POST operation and the four schemas may change. Record the commit, the command and the diff stat in impl-log.
   5. Fallback, only if the generator cannot run: hand-transcribe the same fragments from `app_credentials/router.py`, `schemas.py` and `models.py`, and record "hand-patched" in impl-log (precedent PAN-013).
1. **Registry `super` kind (R4, ADR 0004).**
   - Add the kind and `superOf(base, when, ...operations)`. `evaluate` returns `source.check('admin:*')`; `permits()` already treats `admin:*` as an exact key, so holding `admin:*` grants it.
   - `Can disable` prints "Requires admin:*" for `super`. `route-permission-guard.tsx` only special-cases `permission`; `super` is not used on routes. Leave it as is and note this in the ADR amendment.
   - Switch `apps.issueCredential` to `super`. Do not add `apps.setSuperAdminRole` here; that is slice 2.
   - Write the ADR 0004 amendment.
2. **Types and helpers.** `AppCredentialScope` comes from `components['schemas']`. `APP_CREDENTIAL_SCOPES` has a `Same<>` guard, like the other enums in `app-schema.ts`. Put `credentialScopeOptions`, `isRuntimeScope` and `credentialScopeHints` in `data.ts`. No hand-written copies of API shapes.
3. **Mutation.** `mutationFn: async ({ scope, onSecret }) => … api.POST('/api/v1/apps/{key}/credentials', { params: { path: { key } }, body: { scope } })`. Everything else is unchanged. Always send `scope`, `manifest` included. Write the ADR 0007 amendment.
4. **Dialog, confirm phase.**
   - `useForm({ resolver: zodResolver(z.object({ scope: z.enum(APP_CREDENTIAL_SCOPES, { error: 'Select a scope.' }) })), defaultValues: { scope: undefined } })`. Wrap only the select in `<form id='credential-issue-form' noValidate>`.
   - The footer Issue button becomes `type='submit' form='credential-issue-form'`. It keeps its label "Issue credential" and the `aria-disabled` / `inFlight` pattern. `onSubmit` calls the existing `onIssue(values.scope)`.
   - `FormField name='scope'`: `FormLabel` "Scope". `SelectDropdown isControlled placeholder='Select a scope'`, with items from `credentialScopeOptions(app.key)` and the label equal to the value (the API names). `FormDescription` shows the hint for the selected scope, or "Choose what this credential may do." when none is selected. `FormMessage` shows the error. `FormControl` already links the description and the message via `aria-describedby` (R10).
   - When `isRuntimeScope(scope)`, show a static `Alert` above the footer: "Backend deploy environment only, never CI or browser code. This key can read data of every org of {app.name}." For `usage:*` the second sentence is "…can read or report usage for {app.name}".
   - Description copy: "Issue a new credential for {name} ({key})? The value is shown once and can't be retrieved later. Each scope can have at most 2 active credentials. Issuing needs admin:apps:write and admin:*." For `admin`, add: "A releases credential for the admin app is a CI secret for the control plane itself."
   - The scope stays in form state only: not in the URL, a toast, a query key or a `mutationKey`.
   - Hints (`credentialScopeHints`):

     | Scope | Hint |
     |---|---|
     | `manifest` | "Deploy jobs publish the app's permission manifest with it. Store it in the CI deploy secret store." |
     | `releases` | "Deploy jobs record the app's releases with it. Store it in the CI deploy secret store." |
     | `org-members:read` | "The app's backend reads an org's members and invitations with it. Backend deploy environment only, never CI or browser code." |
     | `usage:read` | "The app's backend reads usage with it. Backend deploy environment only, never CI or browser code." |
     | `usage:write` | "The app's backend reports usage with it. Backend deploy environment only, never CI or browser code." |
     | `limits:write` | "Not available yet." (never offered) |
5. **Errors (AC3).** `credentialIssueError(error, scope)` keeps its order:
   - Unknown outcome: unchanged text.
   - 409:
     - `admin_app`: "The admin app can only have releases credentials."
     - `app_disabled`: unchanged.
     - `scope_not_available`: "This scope can't be issued yet."
     - `credential_limit`: "This app already has 2 active {scope} credentials. Revoke one, then issue a new one." `{scope}` is the one the user chose, never server text.
     - Other: unchanged "The API refused to issue a credential for this app."
   - 422 (any code): "The API rejected this scope."
   - Otherwise `fallback` (403 → ForbiddenPanel copy, 404 → "This app no longer exists.").
   - On error the dialog stays in the confirm phase and keeps the selected scope.
6. **Reveal phase (ADR 0007 unchanged).**
   - Description: "Credential {issued.key_id} ({issued.scope}) for {name} ({key})."
   - The storage `Alert` keeps "It can't be shown again. Clipboard history or sync tools may keep a copy." Its first sentence depends on `isRuntimeScope(issued.scope)`:
     - runtime: "Copy this credential now and store it only in the backend's deploy environment, never in CI variables or browser code."
     - other scopes: today's "…store it in your deploy secret store."
   - Masking, Show/Copy, `pagehide` clearing, "I've saved it" and the no-X rule are untouched.
7. **Tab.**
   - Add a `Scope` column after Key ID: `<TableCell><code>{credential.scope}</code></TableCell>`, rendered as React text (R6). Empty row `colSpan={6}`.
   - Copy: "Deploy jobs and app backends use a credential to call org-admin-api for this app. Each scope can have at most 2 active credentials."
   - Remove the `!isAdminApp` guard around the Issue button. For `admin` the note reads "The admin app can only have releases credentials. Issuing needs admin:*."; other apps keep "Issuing needs admin:*.".
   - No client-side per-scope counts and no pre-disabling from the paged list: the API's `credential_limit` 409 is the authority (R1/R4; appsec and frontend consults).
8. **Fixtures and e2e** as in the Files table. Add `simap` to `APPS`; if that breaks counts in other app tests, adjust only those assertions and record it.
9. Run all R8 checks, plus `pnpm e2e` if the sandbox can (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`). Otherwise record "e2e left to CI".

Rules: R1 (no UI-side rules beyond the ticket's option list, and the API refuses the rest), R2 (generated types; the only HTTP is in `queries.ts` via the client), R4 (`super` kind; the 403 is still handled), R5/ADR 0007 (secret handling unchanged; scope is not secret), R6 (scope shown as text), R7 (role fields are not touched here), R8, R9 (the dialog is the explicit confirmation naming the app and showing the scope; not optimistic), R10 (labelled select, linked hint and error, live status unchanged).

## Specialist input used
- **api-platform-engineer.** Adopted: the scope enum, `admin:*` always, the 409 reasons including `scope_not_available`, `scope` always present, the fragment list, and "send `{scope}` always". The role PATCH findings (B, D) are deferred to slice 2 and recorded in the Split proposal. Rejected: "derive N of 2 per scope from the list", because the list is paged and may mislead (decision 4).
- **frontend-developer.** Adopted: `{scope, onSecret}` variables, react-hook-form + zod with no preselect, the form wrapping only the select (the reveal input stays outside any form), the option helper in `data.ts`, `colSpan` 6, per-scope limit copy, and the updated existing tests. Rejected: the per-scope summary computed from the visible page (decision 4).
- **identity-access-engineer.** Adopted: F1/R-A, the `super` requirement kind, with `apps.issueCredential` fixed in this slice (decision 3); F2 copy changes; R-C (403 inline panel, dialog keeps the user's choice). F3–F7 and R-B/R-D/R-E/R-F go to slice 2. F6 is recorded below.
- **appsec-engineer.** Adopted: no preselect, so a runtime key is never issued by default; runtime-specific warnings in the confirm and reveal phases; scope only in component state; the leak test also run for `org-members:read`; the limit as text only; `credential_limit` copy uses the chosen scope, never the server echo; the admin app named as a control-plane CI secret. Partly adopted: the "button names the scope" suggestion. The button keeps "Issue credential" (a stable name for tests and AT); the selected scope is visible next to it in the same view. Role-field items go to slice 2.

## Assumptions
- The generator runs at a77e819 as it did for PAN-018. If not, use the hand-patch fallback.
- The generated `AppCredentialRead` and `AppCredentialIssued` differ from the snapshot only by `scope`, apart from descriptions. If more fields appear (for example new required fields), stop at Approach §0.3 and record it.
- `usage:*` and `org-members:read` are offered for any non-admin app. The API does not tie them to `org_mode` (api consult A), so the UI does not either (R1).
- Adding `simap` to the test `APPS` is a fixture-only change.
- Follow-ups (not in this diff):
  - (a) admin-pan: offer `limits:write` once org-admin-api ADM-044 lands (new ticket + fragment refresh).
  - (b) admin-pan: `created_by` column on credentials.
  - (c) admin-pan: full `openapi.json` refresh to org-admin-api main.

## Needs owner's decision
None of these blocks this slice. Each one has a chosen default, the safer option within R4/R9/ADR 0004/ADR 0007.
1. **Admin app Issue button now visible (`releases` only).** Chosen: show it. The ticket's scope item 1 names "`admin` app → `releases` only", and the API allows it. It is gated by `admin:*`, uses the same confirm dialog, and its copy calls it a control-plane CI secret. Alternative: keep it hidden and drop the admin row from the options.
2. **Scope preselect.** Chosen: no preselect; "Select a scope." is required (the ticket says "required"; appsec says never default to a runtime scope). Alternative: preselect `manifest`.
3. **`apps.issueCredential` → `admin:*` in the registry (new `super` requirement kind, ADR 0004 amendment).** Chosen: in scope. The ticket touches this dialog and button, and today the button looks enabled for staff whom the API always refuses. Alternative: a separate follow-up ticket.
4. **Per-scope limit display.** Chosen: copy only ("Each scope can have at most 2 active credentials.") plus the Scope column. No counts computed from a paged list; the API's 409 names the limit. Alternative: an unpaged count query.
5. **Slice 2 decisions** are listed in the Split proposal (items S1–S5).
6. **org-admin-api conflict (identity consult F6; confirmed by the orchestrator).** org-admin-api `docs/consumers.md` (simap recipe, step 3) gives `simap:admin` "invite + one admin-only key". `app/modules/rbac/service.py:496-502` refuses an org owner role that holds any `is_admin` permission (422 `org_owner_role_id` / `role_has_admin_permissions`). So AC2 may be refused for the real simap data. This is an org-admin-api matter (R1/R7). Proposed org-admin-api follow-up: either fix the recipe (`simap:admin` without admin-only keys) or change the rule. The owner picks. The UI will not work around it. Slice 2 shows the refusal as "This role holds admin-only permissions, so it can't be the org owner role.", and tests AC2 against the network fake (success) plus this refusal.

## Blocking questions
None.

## Split proposal
The whole ticket is about 1,300 changed lines without the generated files. It spans two features (credentials, and app role designation) and touches the shared edit form, the sheet, the errors module, the registry, fixtures and e2e. That is well over one implement/review cycle (planner rule 2), so it is split into two PRs:

- **Slice 1, this plan (PAN-034): credentials by scope.** Scope items 1–2, AC1, AC3/AC4 for the credential calls. Also the registry `super` kind, which slice 2 reuses. About 450 lines.
- **Slice 2, proposed ticket PAN-034b: set an app's special roles.** Scope items 3–4, AC2, AC3/AC4 for `PATCH /api/v1/apps/{key}`. It depends on PAN-034. Design decisions to carry into its plan:
  - **S0 Snapshot.** Refresh `AppRead` and `AppUpdate` (adds `super_admin_role_id`) and `paths['/api/v1/apps/{key}'].patch` (`x-requires-super: conditional`, refusal descriptions). Leave `RoleDefinitionRead` alone; its new fields (`is_org_owner`, `is_super_admin`, `assignment_count`) would force fixture changes in the roles feature, so they are a follow-up.
  - **S1 Where.** Three selects in the existing edit form (`app-form-dialog.tsx`), edit mode only, hidden for the `admin` app. Org owner and Super-admin show only while the form's `org_mode` is `required` (live value), because the API needs `org_mode` and the owner role together in one PATCH (#18). Chosen over a separate super-admin action, since the ticket says "Edit app" with a disabled Super-admin field. Mitigated by S2 and the 403 copy. Alternative: a separate dialog with its own PATCH.
  - **S2 Confirm (R9).** When any role field changed, Save opens a review phase in the same dialog. It lists "App simap (simap): Org owner role: None → simap:admin" per change, with the consequence:
    - default role: new joiners get it;
    - owner role cleared: org creation and invitations stop for the app;
    - super-admin set: cross-org access for staff super-admins;
    - super-admin cleared: new mints stop, issued tokens run to expiry, holders keep the assignment; revoke them afterwards.

    "Confirm and save" sends the PATCH; Back returns to the form. Not optimistic. Precedent: `role-default-dialog.tsx`.
  - **S3 Permission.** `apps.setSuperAdminRole = superOf('admin:apps:write', 'conditional', 'PATCH /api/v1/apps/{key}')`. The Super-admin select is natively disabled when denied, with the `FormDescription` "Requires admin:*. Only super admins can change the super-admin role." auto-linked by `FormControl`. On 403 `admin_wildcard_required` the inline ForbiddenPanel says nothing was saved (the PATCH is atomic) and the dialog keeps the user's values.
  - **S4 Data safety.**
    - Options come from `allRoleDefinitionsQueryOptions(app.key)` (all pages; key nested under the app detail, so `useUpdateAppMutation`'s `['apps']` invalidation refreshes it). Labels are `key — name`. Roles are not disabled by `privileged`, `is_system` or other flags (R1; ADR 0004: hints are advisory); `privileged` may only annotate the label.
    - "None" is the sentinel `'none'`, sent as `null`.
    - While roles load or have failed, the role selects are disabled and never sent.
    - A current id not in the list shows as "Unknown role (<id>)" and stays selected.
    - The diff, extracted as a pure function `appUpdateDiff(currentRow, values)` in `data/`, sends only changed fields. A role nobody touched is never sent as `null`.
  - **S5 Errors.** Map by `(details[0].field, reason)` plus the fields that were sent, never by reason alone (api consult B; identity F5; appsec 5–6). Cover:
    - every 422 reason on `default_role_id`, `org_owner_role_id` and `super_admin_role_id`;
    - the 409s `role_has_assignments`, `super_admin_role_designated` and `org_mode_in_use`, and the reason-less admin-app and concurrent cases.

    `org_mode_required` and `role_has_org_permissions` go on the `org_mode` field only when `org_mode` was the changed field. Otherwise they go on the role field, with role-side copy. The edit 409 fallback "changed by someone else" is used only for reason-less 409s on non-admin apps.
  - **Sheet.** Resolve the three ids to `<code>{key}</code>` from the same query: "Loading…" while pending, "None" for null, "Unknown role (<id>)" when not found. Add a "Super-admin role" row when `org_mode` is `required`.
  - **AC2 test.** On the network fake: PATCH body exactly `{"org_owner_role_id":"<simap:admin id>"}`; after the refetch the sheet shows `simap:admin`. Plus the 422 `role_has_admin_permissions` message path (F6).

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/apps` → detail sheet → Credentials tab (existing, `/_authenticated/apps/`) | Route `admin:apps:read`. Tab list `admin:apps:read` (`apps.view`). Issue button `apps.issueCredential` = `admin:apps:write` + `admin:*` (`super`, always): disabled with "Requires admin:*" when denied, enabled when unknown. Revoke `admin:apps:write` (unchanged). | Unchanged: "Loading credentials…", "No credentials yet." (`colSpan` 6), "Couldn't load credentials." + Retry, inline ForbiddenPanel. Happy: the table now has a Scope column. Disabled app: Issue disabled with the existing note. | "Issue credential" → dialog | — |
| Issue credential dialog (in the tab) | as above | Confirm: Scope select (required, no preselect), hint, runtime warning. Pending: "Issuing…" (`aria-disabled`, sr-only status). Error: `role=alert` text or inline ForbiddenPanel; unknown outcome removes Issue and shows only Close. Reveal: unchanged (ADR 0007) plus scope and scope-specific storage advice. | Issue → `POST /api/v1/apps/{key}/credentials` `{scope}` (non-optimistic, `retry: false`); Cancel / Close / "I've saved it" → none | Success: `appsKeys.credentialsAll(key)`. 404/409: `appsKeys.detail(key)`. Unknown outcome: `credentialsAll(key)` (unchanged). |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| POST | `/api/v1/apps/{key}/credentials` | path `key`; body `components['schemas']['AppCredentialIssue']` = `{ scope: AppCredentialScope }`, always sent | `AppCredentialIssued` (201; `credential` goes to the sink only) | 403 `admin_wildcard_required`, 403 `permission_denied`, 404 `not_found`, 409 `conflict` + reason `admin_app` / `app_disabled` / `scope_not_available` / `credential_limit` / other, 422 `validation_error`, network/timeout/5xx/invalid 201 (unknown outcome) | ADM-034, ADM-041 (scopes), USR-29 (`org-members:read`); merged at a77e819 |
| GET | `/api/v1/apps/{key}/credentials` | `limit=20`, `offset` (unchanged) | `Page_AppCredentialRead_` (rows now carry `scope`) | 403 (inline panel), 404/other (error + Retry), unchanged | ADM-034 |
