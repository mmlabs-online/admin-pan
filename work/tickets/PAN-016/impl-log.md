## Attempt 1 — 2026-11-17

### Snapshot regeneration (plan Approach step 1)
- (a) `git rev-parse --short HEAD` in `/home/user/org-admin-api` printed `8a4efb2`. Generated with `uv run python -m app.cli openapi --output src/api/openapi.json` (venv in the scratchpad; nothing written to org-admin-api), then `pnpm api:types`. No hand edits.
- (b) PAN-013's 409s are in the generated output: `PATCH /api/v1/users/{user_id}` and `DELETE .../role-assignments/{assignment_id}` both have a 409 "Last active super-admin" response with an `ErrorEnvelope` body.
- (c) `/me/permissions`: the generated `MePermissions` schema is identical to the PAN-011b hand-patch, so it is superseded with no difference.
- (d) x-permission set is the old 8 plus `admin:audit:read` (checked by script against the old snapshot).
- (e) `HTTPValidationError` and `ValidationError` are gone; `ErrorEnvelope` and `ErrorBody` are added; responses carry `X-Request-ID` headers.
- (f) New unrelated paths: `/api/v1/auth/orgs`, `/api/v1/auth/orgs/{org_id}/invitations`, `/api/v1/auth/invitations/accept` (plus the audit path). They are cookie/identity endpoints with no `x-permission`; left in the snapshot, not wired (R7).
- `pnpm typecheck` after regeneration, before any other change: clean, so no retyped field needed a fix.

### Files touched
| File | Required because |
|---|---|
| `src/api/openapi.json`, `src/api/schema.d.ts` | Regenerated from 8a4efb2 |
| `src/api/errors.ts` | Header comment replaced; added `export type ErrorEnvelopeWire = z.infer<typeof envelope>` (see Out-of-plan) |
| `src/api/errors.test.ts` | Type-level test tying the envelope to the generated `ErrorEnvelope` |
| `src/lib/permissions/registry.ts` | `admin:audit:read`, route entry via `perm(...)`, action `audit.view` |
| `src/components/permissions/route-permission-guard.test.tsx` | `/audit-log/` removed from the none/pending list |
| `src/features/audit-log/index.tsx` | Mock removed, route permission comment, subtitle |
| `src/features/audit-log/data/schema.ts`, `search.ts`, `data.ts` | Rewritten on generated types, URL schema, tone/label maps, `APP_KEY_PATTERN` |
| `src/features/audit-log/data/audit-logs.ts`, `audit-logs.test.ts` | Deleted (mock) |
| `src/features/audit-log/data/schema.test.ts` (new) | Search schema tests |
| `src/features/audit-log/lib/format.ts`, `format.test.ts` | Rewritten for new helpers |
| `src/features/audit-log/api/queries.ts`, `queries.test.ts` (new) | Params, keys, query options |
| `src/features/audit-log/components/audit-log-table.tsx`, `-columns.tsx`, `-detail-sheet.tsx` | Server-side table, columns, detail sheet |
| `src/features/audit-log/components/audit-log-filters.tsx` (new) | Filter group |
| `src/features/audit-log/components/audit-log-table.test.tsx`, `audit-log-detail-sheet.test.tsx` (new) | Tests |
| `src/features/users/components/users-detail-sheet.tsx`, `.test.tsx` | Audit history links, router wrapper in tests |

### Tests added / changed
- `data/schema.test.ts`: valid values kept and invalid dropped; unknown keys dropped; app key pattern.
- `lib/format.test.ts`: `toAuditRange` (local midnight, next-day `to`, one-sided, same day, year rollover), `isRangeInverted`, `localZoneLabel`, `describeChanges`, `formatValue`, `actorDisplay`.
- `api/queries.test.ts`: param mapping, omitted/invalid values, keys, request URL.
- `audit-log-table.test.tsx` (fake fetch): loading, rows, empty (both), error and Retry, 422 with Reset, 403, 403 on refetch, next page offset, every filter sends its param, from/to instants, filter resets page, invalid id/app key not sent, deep link, zone note, inverted range sends nothing, Reset, no export and no sortable headers, View via keyboard.
- `audit-log-detail-sheet.test.tsx`: fields and dashes, Before/After table, Field/Value table, null changes, R6 HTML payloads, unknown action, copy toasts and hidden button.
- `users-detail-sheet.test.tsx`: two audit links with the right search params (with `admin:audit:read`); hidden without it. Existing tests now run inside a memory router.
- `api/errors.test.ts`: envelope type test.

### Checks (actual output summary)
- pnpm typecheck: clean (`tsc -b`, no output).
- pnpm lint: clean (`eslint .`, no problems).
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test: 70 files passed, 491 tests passed (with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`).
- pnpm build: built OK.
- pnpm e2e: not planned.

### Out-of-plan files
- `src/api/errors.ts` also gets `export type ErrorEnvelopeWire`, because the type-level test needs the zod envelope's inferred type and the schema was not exported. Type-only, no behaviour change.

### Follow-ups (noticed, not done)
- org-admin-api: F1 server-side audit export endpoint (owner, 2026-11-17).
- org-admin-api: F2 `org_id` filter on `GET /audit-logs`.
- PAN-014: F3 org detail -> `/audit-log?targetType=organization&target=<org id>` once Organizations runs on real ids (switch to `org_id` after F2).
- org-admin-api: F4 role grants/revokes have `target_type=role_assignment`; a subject-user filter would let "Events about this user" include them.
- org-admin-api: F5 `GET /audit-logs/{id}` for shareable entry links.
- admin-pan: F6 amend ADR 0001's "envelope type is hand-written" note.
- admin-pan: F7 invalidate `['audit-logs']` after users/roles mutations.
- admin-pan: F8 "Filter by this actor/target" shortcuts in the audit detail sheet.
- admin-pan: F9 snapshot now has `/auth/orgs...` and invitation paths; no UI uses them.
- admin-pan: `pnpm knip` already reports unused exports in other features; not part of the required checks, left alone.

### Scope self-check
- Could the diff be smaller? No: it is a rewrite of one screen plus tests (plan notes it exceeds ~500 lines excluding generated files).
- Diff size: about +707 / -602 lines excluding `openapi.json` and `schema.d.ts` (tracked files only; new files are extra).
