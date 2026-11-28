# PAN-034b — review

## Attempt 1 — 2026-11-28
Verdict: PASS

Scope reviewed: `git diff 211da94..HEAD` (commits 9ca4830, 52b342f, 76211fc) on `claude/zealous-turing-4o04h1`; PAN-034 slice 1 not re-reviewed.

### Checks (run by reviewer, PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium)
- pnpm typecheck: clean (`tsc -b`, exit 0)
- pnpm lint: clean (no output from `eslint .`)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test: Test Files 124 passed (124); Tests 1071 passed (1071)
- pnpm build: "built in 1.14s"
- pnpm e2e: 30 passed (1.3m)
- `pnpm api:types`: no drift in `src/api/` afterwards.
- These match impl-log.md attempt 1 exactly.

### Snapshot (R2) verification
- org-admin-api clone at `a77e819`, clean. I regenerated the spec myself (`uv run python -m app.cli openapi`) into the scratchpad.
- `components.schemas.AppRead`, `components.schemas.AppUpdate` and `paths['/api/v1/apps/{key}'].patch` in `src/api/openapi.json` are deep-equal to the generated ones.
- Deep diff against the snapshot at 211da94 touches only those three fragments: `super_admin_role_id` in AppRead/AppUpdate, plus on PATCH `x-requires-super`, `x-requires-super-when`, the 403/409/422 descriptions and the 404 response. `$ref` targets `AppStatus`, `ErrorEnvelope`, `JoinPolicy`, `OrgMode` are deep-equal to the generated spec. AppRead `required` is unchanged (`super_admin_role_id` is optional).

### Refusal mapping vs `app/modules/rbac/service.py` (`_update` l.441-583, `_check_super_admin_role` l.585-629)
- Every `(field, reason)` the service raises for PATCH has an entry in `errors.ts` (`UNPROCESSABLE_BY_FIELD` 17 pairs, `CONFLICT_BY_FIELD` 3 pairs). That covers the default role (unknown_role, role_has_admin_permissions, role_has_org_permissions, same_as_super_admin_role), the owner role (unknown_role, role_has_admin_permissions, org_mode_required, same_as_default_role, same_as_super_admin_role), the 8 super-admin 422s plus the 409 role_has_assignments, and the org_mode 409s super_admin_role_designated / org_mode_in_use.
- Shared-reason routing (`refusalTarget`) matches when the API raises each one:
  - `default_role_id/role_has_org_permissions` fires on a change to `default_role_id` OR `org_mode`, so it routes to org_mode when only org_mode was sent.
  - `org_owner_role_id/org_mode_required` fires on a stored owner when org_mode changes to none, so it routes to org_mode.
  - `org_owner_role_id/same_as_default_role` fires when only the default was sent, so it routes to default_role_id.
- `same_as_super_admin_role` is raised with field = whichever of default/owner changed, and it is keyed by field. Reason-less 409s (the admin invariant, IntegrityError) keep the admin/"changed by someone else" copy. A reasoned but unmapped 409 shows "The API refused this change."; an unmapped 422 shows REJECTED. Nothing is silent. The wildcard copy uses `ctx.appKey`, never server text.
- Tests: `errors.test.ts` › "appFormError role refusals" (table), "shared reasons are routed by the fields that were sent", "409 reasons map by field…", "edit 403 says nothing was saved…", "validation_error on body.org_owner_role_id".

### Untouched / unresolved roles never sent as null
- `data.ts` `appUpdateDiff` looks only at fields in `editable` and compares `values[f]` (with 'none' mapped to null) against `current[f] ?? null`. An untouched role, including `undefined` super_admin_role_id → 'none', gives no key.
- In `app-form-dialog.tsx`, `editable` is empty unless `rolesQ.isSuccess`. Owner and super-admin are editable only while org mode is Required, and super-admin only when not `denied`. An unknown current id is kept as its own select item, so its value equals the current value and it is not sent.
- Evidence:
  - `data.test.ts` › "unchanged values give {}; a current undefined super_admin_role_id equals none", "role fields not in editable are never sent…", "an untouched default role with the org owner changed sends org_owner_role_id only";
  - dialog › "untouched roles are never sent: … sends {name} only" and "roles failed to load: … a name edit sends {name} only" (calechip, owner set, Org owner shows "Unknown role (").

### Acceptance criteria
- [x] AC1 simap Org owner → simap:admin, and the sheet shows it. Evidence: `app-form-dialog.test.tsx` › "simap: set Org owner role to simap:admin -> review -> one PATCH with that body; the sheet then shows simap:admin, never the uuid". The test runs on the network fake, the body is exactly `{org_owner_role_id: SIMAP_ADMIN_ID}`, and it passed. The refetch comes from `['apps']` invalidation, which also covers `rolesKeys.allDefinitions` (nested under `appsKeys.detail`, roles/api/queries.ts:27,36).
- [x] AC2 every refusal → specific message by (field, reason). Evidence: the mapping verification above, plus the dialog tests "422 org_owner_role_id/role_has_admin_permissions -> …field error linked and focused" and "409 super_admin_role_id/role_has_assignments … 403 admin_wildcard_required -> inline panel saying nothing was saved".
- [x] AC3 tests for the diff and the refusal mapping incl. shared reasons. Evidence: the tests cited above.
- [x] R4 gate: `registry.ts` `apps.setSuperAdminRole = superOf('admin:apps:write','conditional',…)`; registry.test "every super requirement…" checks it against the snapshot's `x-requires-super: conditional`. Dialog test "without admin:* the Super-admin select is disabled with the reason linked; with admin:* it is enabled".
- [x] R9: review phase naming the app and the from→to keys. Back sends nothing; Confirm sends one PATCH on a double click (`inFlight`). Not optimistic. Dialog test "role change -> review; Back sends nothing…".

### Scope
- Every changed file is in the plan's list, apart from `src/features/apps/data/app-schema.test.ts`. That file is justified under Out-of-plan in impl-log: the fixture gains the three now-required `'none'` role values (3 added lines, no assertion changed). This is a necessary consequence of the planned schema change, so it is accepted.
- `work/backlog.md` and `ticket.md` changed state only. No new dependencies.

### Issues
#### Issue 1 — 🟡 should-fix — a11y focus after a failed confirm (a11y-review #1)
- **Where**: `src/features/apps/components/app-form-dialog.tsx:247-257` (`flushSync(() => setPhase('form'))` in `submit`'s catch)
- **Expected**: after a failed "Confirm and save" with no field error (403, 5xx, network), keyboard focus lands on a meaningful control.
- **Actual**: the focused Confirm button unmounts, and focus drops to the body/dialog. The alert is still announced.
- **Fix instruction**: give the Save button a ref. When `mapped.fields` is empty, focus it (or the alert) after `setPhase('form')`. Not a blocker: no WCAG A/AA failure per the a11y review, and the alert is announced.

#### Issue 2 — 🟡 should-fix — Super-admin denied reason hidden while roles load or fail (a11y-review #5)
- **Where**: `app-form-dialog.tsx` `roleHint` (l.79-94)
- **Expected**: "Requires admin:*. …" whenever `denied`.
- **Actual**: the loading/error text replaces it until the roles load.
- **Fix instruction**: check `field === 'super_admin_role_id' && denied` before the status branches.

### Rules R1–R11
No violations found.
- R1: no client-side role filtering; the F6 refusal is shown.
- R2: generated types; HTTP calls only through the existing query modules.
- R3: not touched.
- R4: conditional super gate, fail-open on unknown, 403 handled inline.
- R5: no ids in URLs or toasts.
- R6: text rendering only.
- R7: see Scope.
- R8: green.
- R9: see above.
- R10: see a11y review.

### Security / a11y blockers
None. `a11y-review.md` attempt 1 has no 🔴 items (should-fix #1 and #5 are listed above). No `security-review.md` exists in the ticket folder at review time.

### Nits (do not block)
- 💭 `refusalTarget` can route an error to a field that is not rendered: `org_owner_role_id/org_mode_required` with `sent` lacking both fields while org mode is None. That needs an inconsistent stored app, so it can't happen in practice. If it did, `setError` on a hidden field would show nothing. Consider an alert fallback when the target field is not rendered.
- 💭 a11y-review #2–#4 (announcing the role load state, a review-phase title/description, the `→` read-out) are worth a small follow-up.
- 💭 impl-log's snapshot diff stat says "+54/-?"; the real stat is 71 insertions, 7 deletions across both files.

### Follow-ups (out of scope)
- org-admin-api: resolve the simap recipe (`docs/consumers.md:241-248`) vs. the owner-role rule (`rbac/service.py:496-502`, 422 `org_owner_role_id/role_has_admin_permissions`).
- admin-pan: refresh `RoleDefinitionRead` (`is_org_owner`, `is_super_admin`, `assignment_count`) for badges and option hints.
- admin-pan: `roleDefaultError` lacks `same_as_super_admin_role` copy.
- admin-pan: link from the super-admin "cleared" review copy to that role's holders.
- admin-pan: full `openapi.json` refresh.
- admin-pan: a11y polish from a11y-review #2–#4.
