## Findings (PAN-011, frontend consult, read-only)

**Current state**
- Nothing declares permissions as data. The only trace is a stray comment in `src/features/organizations/components/organizations-primary-buttons.tsx` saying `admin:orgs:write (planned name)`. The real key in openapi is `admin:organizations:write`, so that comment is wrong.
- Nav is plain data in `src/components/layout/data/sidebar-data.ts`, typed by `src/components/layout/types.ts` (`NavLink`/`NavCollapsible`). There is no per-item metadata. `nav-group.tsx` renders it.
- `src/routes/_authenticated/route.tsx` wraps everything in `AuthGate` and `AuthenticatedLayout`. The per-feature routes in `src/routes/_authenticated/<feature>/index.tsx` are thin, with no `beforeLoad`.
- `src/features/errors/forbidden.tsx` (`ForbiddenError`) is a full-page `h-svh` 403 with a hard-coded "view this resource" message. It is not reusable inside the layout or for an action.
- `src/lib/handle-server-error.ts` toasts `error.message.slice(0,200)` for any ApiError except 401 and aborted. A 403 therefore shows the API's raw message.
- `queryCache.onError` in `src/lib/query-client.ts` only toasts transient errors. The comment says "403 is left to the caller", but no caller handles it yet. The mutationCache goes through `handleServerError` unless `meta.handlesOwnErrors` is set.
- `x-permission` appears on 24 operations in `src/api/openapi.json`. `pnpm api:types` (openapi-typescript) does not carry extensions into `schema.d.ts`; a grep for `x-permission` there finds nothing. So the types cannot give the keys, but openapi.json can.
- Permission keys in openapi:
  - `admin:apps:read|write`
  - `admin:organizations:read|write`
  - `admin:users:read|write`
  - `admin:roles:manage`
  - `admin:roles:assign`
- Mapping by route and action:
  - `/apps`: list `apps:read`. Register, edit, delete `apps:write`. Permissions tab: view `apps:read`, mutate `roles:manage`.
  - `/organizations`: `organizations:read`. Create, edit, delete `organizations:write`.
  - `/users`: list and detail `users:read`. Status change (suspend/disable) `users:write`.
  - `/roles`: the catalog `GET /apps/{key}/roles` is public and has no permission. Create, update, delete and replace permissions need `roles:manage`. Assign and revoke on users need `roles:assign`. The role-assignments list needs `users:read`.
  - `/audit-log`: no endpoint in openapi yet (ADM-004 has not landed).
  - `/reports`: no endpoint in openapi at all.
  - Dashboard and `/settings/*`: no permission. The settings screens are local or profile, not API admin resources.
- The mock phase has bulk actions (`users/components/data-table-bulk-actions.tsx`) and row actions in apps, roles, organizations, users and reports. All of them need a `Can` wrapper.

## Recommendations

**1. Single source of truth (AC1)**
- Add `src/lib/permissions/keys.ts`, generated from openapi.json by a small script, for example `pnpm api:permissions` chained after `api:types`. It writes `src/api/permissions.gen.ts`. Contents:
  - `export const ADMIN_PERMISSIONS = [...] as const`
  - `export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]`
  - an `OPERATION_PERMISSION: Record<operationId, AdminPermission>` map
- Add a unit test that fails if the generated file is stale compared with openapi.json (R2/R8). Put the file in `src/api/` so the "API contract lives here" rule holds.
- Define `type Requirement = AdminPermission | { anyOf: AdminPermission[] } | { allOf: AdminPermission[] } | 'public'`.
- Add `src/lib/permissions/registry.ts` with typed `ROUTE_PERMISSIONS` (`satisfies Record<RoutePath, Requirement>`) and a few action constants, e.g. `ACTIONS.orgCreate = 'admin:organizations:write'`. Prefer deriving an action's permission from the operationId (`OPERATION_PERMISSION['create_organization_api_v1_organizations_post']`), so it cannot drift from the API. Components then take a named action, not a string literal.
- Nav: add an optional `permission?: Requirement` to `BaseNavItem` in `types.ts`. Reference the registry in `sidebar-data.ts` rather than duplicating strings. Filter nav through the same evaluator. A collapsible group hides when all its children are hidden.
- Routes: set `beforeLoad` or a `staticData: { permission }` in each route file. A shared `<RouteGuard permission=...>` can sit in the feature page. `denied` renders the in-layout Forbidden panel, not a redirect. `unknown` renders the page, because the API will answer.

**2. API shape, tri-state (AC2)**
- `type PermissionState = 'allowed' | 'denied' | 'unknown'`.
- `usePermission(req): PermissionState`.
- Provide `useCan(req)` returning `{ state, allowed: state !== 'denied', denied: state === 'denied' }`.
- `<Can permission fallback='hide'|'disable' reason?>{children}</Can>`:
  - `denied` + hide renders nothing.
  - `denied` + disable renders a disabled control. Use `aria-disabled` and a tooltip or `aria-describedby` that says "Requires permission X". Keep it focusable, as `access-pages.tsx` already does.
  - `unknown` renders as allowed.
- Rationale: "unknown" must not be treated as denied, or the app has no usable controls today. It must not be treated as a proven grant either, so never show "you have access" text. The API stays the authority (R4).
- Put a `PermissionSource` behind a `PermissionProvider` (React context, or a zustand store in `src/stores/`). `PermissionProvider` placed inside `AuthGate`.
  - Today the source returns `{ kind: 'unknown' }`.
  - Later it can return `{ kind: 'known', permissions: Set<AdminPermission> }`, once org-admin-api offers something like `GET /api/v1/auth/me/permissions` (needs a follow-up ticket there, since only the API can resolve role to permission).
  - Reset on account change and sign-out. `clearOnAuthChange` already clears the query cache; the store should clear alongside it.
- Learned denials (useful now): when any API call returns 403, record the denied permission for that operation in a session store.
  - Do it in a central place: the QueryCache/MutationCache `onError`, or the API client. Use the operationId, or a `meta.permission` set on the query or mutation hook.
  - After that, `usePermission` returns `denied` for that key, so controls disable after the first refusal.
  - Cap this so one 403 cannot mislead: the denial is for that key only, clears on auth change, and is never treated as a grant when absent.
- Never read the JWT or its roles (ticket notes, PAN-010 security). Do not invent role-key to permission tables client-side, since the catalog for `admin` is refused. That would be R1 faking.

**3. Forbidden and 403 UX**
- Split `ForbiddenError` into a reusable `ForbiddenPanel` (props: `title?`, `permission?`, `onRetry?`) that fits inside `Main`. Keep a thin full-page wrapper for the `(errors)/403` route. Use `role='alert'` or a heading, with a "Back" action, and mention the required permission key only as plain text.
- Use it in three places:
  - the route guard when `denied`
  - the query error state: a `useQuery` error with `isApiError(e, 403)` renders `ForbiddenPanel` in place of the table
  - a toast, for mutations
- In `handleServerError`, add a `status === 403` branch with a stable, friendly message, e.g. "You don't have permission to do this." Optionally add the action name via `mutation.meta.action`. Do not echo the server message (the 200-char slice is arbitrary). Keep 401 and aborted as they are.
- Per-mutation message: `useMutation({ meta: { forbiddenMessage: 'You are not allowed to delete organizations.' } })`. The MutationCache reads `mutation.meta` when status is 403. No `handlesOwnErrors` is needed, so R9's "show the API error on failure" is met.
- Also in the MutationCache on a 403, invalidate or reset the learned-denial store (see above), and never apply optimistic updates (R9).
- Query 403s: `retry` already skips non-transient errors, so it is OK. Add a QueryCache toast only if the screen does not render its own panel. Prefer the inline panel (a11y: announced through `role='alert'`/`aria-live`).
- Dialogs: if confirming a delete returns 403, keep the dialog open and show an inline `role='alert'` message. Or close it and toast; either way the message names the target (R9).

**4. Tests (AC3, R8)**
- Unit tests for the evaluator (`anyOf`, `allOf`, `public`, an unknown key). Cover known-allowed, known-denied and unknown separately, using a fake `PermissionSource`.
- Component tests (vitest browser): `<Can>` with allowed (visible), denied+hide (absent), denied+disable (`aria-disabled`, keyboard-focusable, reason announced), unknown (visible).
- Nav test: a denied item and an all-denied group are filtered out; unknown shows everything.
- Route guard test: denied renders `ForbiddenPanel`; unknown renders the page.
- Learned-denial test: a mocked network 403 on the delete mutation produces the toast, the control becomes denied, and the denial clears on an auth event.
- Generated-keys test: `ADMIN_PERMISSIONS` equals the set of `x-permission` values in openapi.json. A lint-style test should fail on any string literal matching `admin:\w+:\w+` outside `src/api/permissions.gen.ts` and the registry.
- Every row-action and primary-button component gets a test for the denied state.

## Risks
- If the data source never arrives, the UI is only fail-open plus learned denials. That honestly meets R4 ("never relies on hiding"), but "hidden/disabled controls without permission" is only partly met. State this limitation in the plan and acceptance review.
- Learned denials are per-session and per-key. A user may see a control that fails once, so the message must be clear.
- The `audit-log` and `reports` screens have no API permission today. Inventing keys (`admin:audit:read`) would be wrong; use `permission: undefined` plus a TODO until ADM-004 and a reports endpoint exist.
- Generated-key drift: `openapi.json` is a snapshot, so keys can be stale against the live API. A refresh check and CI diff help.
- Disabled controls must stay focusable (`aria-disabled`, not `disabled`) for WCAG 2.2 AA (R10). A tooltip alone is not enough; use `aria-describedby`.
- Showing a permission name in the UI is fine (it is not secret), but never include tokens, emails or full response bodies in logs or toasts (R5).
- The nav filter must not flash all items then remove them. With `unknown` there is no flash because everything shows; when a source becomes known, gate on it being loaded.

## Open questions
1. Is a "who am I / my effective permissions" endpoint in scope for org-admin-api (follow-up ticket there)? Without it PAN-011 stays tri-state. Is that acceptable for DONE?
2. Does the API's 403 body (`error.code`, `details`) name the missing permission? If so, learned denial can use it and `ForbiddenPanel` can show it.
3. Which keys should `audit-log` and `reports` use? They have no `x-permission` yet.
4. Should `denied` for a nav item hide it (Recommendation: hide nav, disable actions) or disable it?
5. Is the generated `x-permission` map from a hand-run script acceptable, or should it live in the existing `api:types` step?
