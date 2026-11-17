## Attempt 1 — 2026-11-17
Verdict: PASS

Reviewed `git diff origin/main...HEAD` at 404a5a6 (code commit 404a5a6; the other branch commits are work/ only). API reference: org-admin-api 8a4efb2.

### Checks (run by reviewer)
- pnpm typecheck: exit 0 (tsc -b clean)
- pnpm lint: exit 0 (eslint clean)
- pnpm format:check: exit 0 ("All matched files use Prettier code style")
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): Test Files 68 passed (68), Tests 467 passed (467). Matches impl-log.
- pnpm build: exit 0 ("built in 1.11s")
- pnpm e2e (if planned): not planned
- Extra: `openapi-typescript src/api/openapi.json` into the scratchpad is byte-identical to the committed `src/api/schema.d.ts` (the generated types match the snapshot).
- Extra: regenerated org-admin-api 8a4efb2 OpenAPI (`uv run --frozen python -m app.cli openapi`, temp venv, into the scratchpad). `components.schemas.MePermissions` is byte-identical to the snapshot. The path `/api/v1/me/permissions` matches except for what impl-log reports: the response `headers` (`X-Request-ID`) and the 401 `content` (`$ref ErrorEnvelope`) are removed.

### Snapshot deviation (judged against R2 and plan D1)
Acceptable. R2 requires request and response types to come from the generated schema. The 200 body type (`MePermissions`) is the API's own generator output, unchanged, and `schema.d.ts` is generated from it. The removed parts are the `X-Request-ID` response header and the 401 envelope `$ref`. The current snapshot has neither for any path (no `ErrorEnvelope` schema exists in it), so keeping the `$ref` would have broken `api:types`. The resulting fragment has exactly the shape of the existing Bearer paths (e.g. `GET /api/v1/users/{user_id}` 401 = `{"description":"Missing or invalid Bearer token"}`), and that is the shape the plan's own fallback prescribes (Approach step 1). Error parsing goes through the existing `unwrap`/`ApiError`, not through generated 401 types, so nothing reads the removed parts. The full refresh is a follow-up for PAN-016.

### Acceptance criteria
- [x] `PermissionSource` reads the new endpoint through `src/api/`, with types from the regenerated snapshot. Evidence: `src/lib/permissions/me-permissions.ts:13` (`components['schemas']['MePermissions']`), `:62-66` (`api.GET('/api/v1/me/permissions', { signal })` via `unwrap`); `src/routes/_authenticated/route.tsx:10` (`AuthPermissionProvider` in production); test `me-permissions.test.tsx › requests GET /api/v1/me/permissions with no query string` passes; `registry.test.ts` unchanged and green.
- [x] `permits()` mirrors the server exactly, with unit tests for the ADR-0003 edge cases. Evidence: `src/lib/permissions/permits.ts:9-12` is equivalent to `authz.py:20-23` (`partition` → `i <= 0` covers no separator or empty app, `i === length-1` covers empty rest; exact key or `<app>:*`). `permits.test.ts` covers the ADR-0003 table, `admin:*` over every registry key, no prefix/global wildcard, case sensitivity, malformed keys, and the empty set. All pass.
- [x] The query is cleared on every auth change and refetched after a 403 `permission_denied` or `admin_wildcard_required`. Evidence: `main.tsx:57` `clearOnAuthChange` (whole cache); `query-client.test.ts › clearOnAuthChange removes the me/permissions query`; `permission-refresh.ts:26-41` (codes match `org-admin-api app/core/errors.py:60,66`); `permission-refresh.test.ts` (codes, exclusions, the query itself, 5 s throttle, in-flight skip); `query-client.test.ts › a burst of three 403 … exactly one permission refetch` and `› a 403 from a mutation with handlesOwnErrors triggers the refetch`; `me-permissions.test.tsx › a mounted provider refetches after an auth change` and `› account switch A→B`.
- [x] If the source fails, the UI fails open to `unknown`. Evidence: `permission-provider.tsx:702-717` derives the source only on `status === 'success'`; `me-permissions.test.tsx › loading …`, `› 500, network error, 403, 404 and malformed body all give unknown, never denied`, `› success then a failed refetch gives unknown, not stale denied`; `route-permission-guard.test.tsx › with the source erroring the page renders` and `› Try again whose refetch errors renders the page (fail-open)`.
- [x] Self-actions are disabled using `user_id` from the endpoint, and the UI never decodes the token. Evidence: `data-table-row-actions.tsx:26-28,62,70-74`; `users-table.test.tsx › own row (PAN-011b)` (3 tests, mixed-case id). A grep of the added lines finds no `atob`, `jwt` or token parsing, and no `localStorage`/`sessionStorage`/`console` outside tests.
- [x] Tests cover allowed, denied, unknown and the source error case. Evidence: `me-permissions.test.tsx › granted, denied and unknown` plus the cases above; all green.

### Issues
None blocking.

### Rules R1–R11
No violations found.
- R1: client-side logic is only the documented matcher port; the API still enforces.
- R2: the only HTTP call goes through the `src/api/` client with generated types (see the snapshot deviation above).
- R3: state lives only in the in-memory QueryClient, keyed per account; no persistence (tested); no token reading.
- R4: the permission state is advisory. 403 display is unchanged, the refresher never retries the failed call or records the denial, and no `enabled:` reads permission state.
- R5: `user_id` is not logged, put in a URL or stored (tested).
- R6: no new HTML sinks.
- R7: every changed `src/` and `docs/` file is in the plan's file list.
- R9: the confirm dialog on other rows is unchanged (tested).
- R10: the retry status is in an always-mounted `role='status'`; the disabled item shows a visible reason and the trigger name says "(your account)".

### Security / a11y blockers
None. Left to the orchestrator: security-review.md and a11y-review.md are not in the ticket folder at the time of this review.

### Nits (do not block)
- `data-table-row-actions.tsx:63-66`: the self-row item keeps its `onClick`, but plan step 7 says "no `onClick`". It is unreachable in practice: Radix skips disabled items for the keyboard and shadcn sets `data-disabled:pointer-events-none`. Still, `onClick={isSelf ? undefined : …}` would match the plan and not depend on CSS.
- `route-permission-guard.test.tsx:309-310` (diff numbering): `expect(seen).toHaveLength(2)` runs right after the second click with no wait, so a late duplicate request could slip past. A short `vi.waitFor`/delay before the assertion would make it meaningful.
- `me-permissions.test.tsx › a mounted provider refetches after an auth change` uses an account switch, which also changes the query key. It does not prove a refetch after a same-account auth event (cache cleared, key unchanged). `clearOnAuthChange` plus the `useAuth()` re-render should cover it; a same-account `onChange` case would pin it.
- The self-row reason text sits inside an item with `opacity-50`. Disabled controls are exempt from WCAG 1.4.3, but the a11y auditor may want the reason itself at full contrast.

### Follow-ups (out of scope)
- PAN-016: refresh `src/api/openapi.json` in full (restores `ErrorEnvelope` / `X-Request-ID`) and add `admin:audit:read`.
- PAN-015b / PAN-015c: invalidate `mePermissionsKeys.all` after admin-app role writes; disable self-assignment with `useSelfUserId()`.
- a11y / owner: native `disabled` vs focusable `aria-disabled` in `<Can disable>` (ADR 0004); optional nav skeleton during the first permission load.
