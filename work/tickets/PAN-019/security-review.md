# PAN-019 security review

## Attempt 1

Diff `origin/main...HEAD`. Checks not run (reviewer's R8).

**Verdict: no blockers.** One 🟡 should-fix (a type cast), several 💭 notes.

### Findings
- 🟡 **`EntitlementCreate` cast weakens the R2 type guarantee** — `src/features/organizations/api/entitlements.ts:80` (`body: body as EntitlementCreate`; `mutationFn` typed `Omit<EntitlementCreate, 'enabled'>` at :77). Not exploitable (API `extra="forbid"`, body built field by field, pinned by unit and e2e tests). The cast exists because openapi-typescript 7 `defaultNonNullable: true` marks defaulted `enabled` required; but it hides drift if a new required field appears. Fix: (a) a `GrantBody = Omit<…,'enabled'> & Partial<Pick<…,'enabled'>>` + `satisfies`, cast kept in one documented helper; or (b) follow-up ticket to generate with `--default-non-nullable false`. At minimum add a type-level test that `keyof EntitlementCreate` is exactly `'app_key' | 'plan' | 'limits' | 'enabled'`.
- 💭 **R4 correct.** `ADMIN_PERMISSIONS`/`ACTIONS` match `x-permission` (`organizations.view` → `admin:organizations:read`; `entitlements.view/grant/update` → read/write/write), enforced by `registry.test.ts:22-41`. 403 handled on org detail, entitlements list, grant/edit, toggle, and `GET /apps` (falls back to typed app key). Tab shows unless `'denied'`; `'unknown'` relies on the API 403.
- 💭 **No mass assignment.** POST body from three named fields (`entitlement-form-dialog.tsx:105-121`); PATCH only changed `plan`/`limits`; toggle sends `{ enabled }` (`entitlement-enabled-dialog.tsx:36`).
- 💭 **R6 fine.** plan, limits, app_key, org name/slug rendered as text; `formatLimitValue` uses `JSON.stringify` for unexpected shapes; no HTML sinks, `href` or selectors from API data (focus maps keyed by id); server text capped at 200 chars (`entitlement-errors.ts:26,53`); `toLimits` cannot pollute prototypes (`LIMIT_KEY_PATTERN`, `Object.fromEntries`).
- 💭 **R5 fine.** URLs carry only UUIDs; no `console.*`; toasts show org name and app key.
- 💭 **R9 fine.** Enable/disable confirm naming `"<app_key> for <org name>"` (`entitlement-enabled-dialog.tsx:31,65`); e2e checks Cancel sends no PATCH; switch flips only after refetch; inline errors; `inFlight` guards (tested); grant `retry: false`; unknown outcome refetches and warns; invalidation on success and 404/409. No confirm on plan/limits edit (not required by R9).
- 💭 **E2E fake API looser than the API** (`e2e/support/fake-api.ts:315-391`): test-only, requires bearer (:445), but does not reject unknown keys or check patterns; tests assert exact bodies (`pages.e2e.ts:306-308,326`). Optional: 422 on unknown keys. Its permissive CORS is acceptable because it never ships.
- 💭 **Snapshot** consistent with c41ef57 entitlements schemas (patterns, `maxProperties: 32`, `maxLength: 32`, `additionalProperties: false`) and mirrored by the client zod schema (`entitlement-schema.ts:12-15`, drift-guarded); full regeneration not verified here.

### Follow-ups (out of scope)
1. Tooling: generate types with `--default-non-nullable false`; then remove request-body casts.
2. E2E fake API rejects unknown body keys on mutating routes.
3. `closeWithRow` 500 ms timer race (`pages.e2e.ts:331-333` `waitForTimeout` workaround) — UX, already in impl-log.
4. Revoke (`DELETE …/entitlements/{id}`) UI later needs an R9 confirmation and an `entitlements.revoke` registry entry.
