## Findings (PAN-011b, frontend consult, read-only)

- **Seam shape.** `PermissionSource.check(p)` is synchronous (`src/lib/permissions/source.ts`). `PermissionProvider` takes an optional `source` and defaults to `unknownPermissionSource` (`src/context/permission-provider.tsx`). `_authenticated/route.tsx` renders `<PermissionProvider>` with no props, so the real source is one place to plug in. Consumers are `Can`, `usePermission`, `useActionPermission`, `useVisibleNavGroups` and the route gate.
- **Nav filter.** `nav-filter.ts` hides items only on `denied`, so while loading it shows everything. Once real data arrives, forbidden items disappear. That is the "flash of visible nav" you want to avoid. The command menu appears to reuse `useVisibleNavGroups`; please confirm when implementing.
- **Query client.** `createQueryClient` (`src/lib/query-client.ts`) has `clearOnAuthChange` (`cancelQueries` plus `clear`), a global `staleTime` of 10s, and a `QueryCache.onError` that ignores 403s. `MutationCache.onError` returns early for `handlesOwnErrors`. There is no 403 refetch hook yet.
- **API client.** `getApi()` and `unwrap` exist. Every query is `queryOptions` with an injectable `api` argument (see `features/users/api/queries.ts`), and `fakeApi`/`json`/`apiError`/`testQueryClient` exist in `test-utils/api.ts`. Follow that pattern.
- **Snapshot.** `/api/v1/me/permissions` is missing from `openapi.json`. `registry.test.ts` asserts that `ADMIN_PERMISSIONS` equals the set of `x-permission` values in the snapshot. The new endpoint declares no permission (self-scoped), so a hand-patch leaves that test green.
- **`Can`.**
  - It passes native `disabled` to the render prop, and the callers set `aria-describedby`.
  - PAN-011 a11y 🟡1 (a natively disabled button is skipped by Tab, so the reason is never focusable or announced) and 🟡2 (`describedBy` is set even when the reason span is not rendered, `can.tsx:36` vs `:38`) both still apply.
  - Both become user-visible once denials are real.
- **Users self row.**
  - `data-table-row-actions.tsx` shows Disable/Enable behind `<Can action='users.setStatus'>` with no self check.
  - The API answers a self status change with 403 `self_status_change_forbidden`.
  - The details sheet has no status action, so the row menu is the only place to change.

## Recommendations

1. **Source on TanStack Query (AC1, AC3, AC4; F2).**
   - Add `src/api/me.ts` (or `src/features/permissions/api`) with `mePermissionsKeys = ['me','permissions']` and `mePermissionsQueryOptions(api = getApi())`. It calls `GET /api/v1/me/permissions` through `unwrap`.
   - Use `staleTime` around 60s, `refetchOnWindowFocus` as the default, and `retry` as the default (it already skips non-transient errors).
   - Add a pure `permits(permissions: readonly string[], required)` in `src/lib/permissions/`: an exact match or `'admin:*'`, case-sensitive, with no prefix wildcards such as `admin:users:*`. Validate defensively: if `permissions` is not an array of strings, return `unknown`.
   - Add `createQuerySource(data | undefined)`: no data means `unknown`; data means `granted` or `denied`. Do not return `denied` from an error.
   - In `PermissionProvider`, call `useQuery` and build the source with `useMemo` on `data`. Keep the `source` prop as an override so existing tests and fakes keep working. Production code passes no prop.
2. **`self` user id (AC5).** Do not add it to `PermissionSource`, because the fakes would break. Add it to the same context (or a second one) and expose `useSelfUserId(): string | undefined`. It is `undefined` while loading or on error, which means "do not disable". Extend `WithPermissions` with an optional `userId`.
3. **Loading, no flash (recommend).**
   - Expose a `status: 'loading' | 'ready' | 'unavailable'` hook from the provider, `usePermissionStatus()`.
   - `useVisibleNavGroups` should return skeleton rows while `loading`, instead of the full nav. On `unavailable` (error), show the full nav (fail-open).
   - Do not block pages or routes on loading. `unknown` renders children, as ADR 0004 says.
   - Alternative: prefetch in `AuthGate` with `ensureQueryData` and a `.catch`. That adds latency before the first paint, so I prefer the skeleton.
   - The command menu must share the same filtered list and must not show items while `loading`.
4. **Refetch on 403 (AC3).**
   - In `createQueryClient`, add a helper `refreshPermissionsOn403(error)`. It acts when `isApiError(error, 403)` and the code is `permission_denied` or `admin_wildcard_required`, and the failing query is not the permission query itself.
   - It calls `queryClient.invalidateQueries({ queryKey: ['me','permissions'] })`, with a short coalescing window (for example one call per 5s). That gives "at most once per burst" and no loops.
   - Call it from both `QueryCache.onError` and `MutationCache.onError`. In the mutation cache it must run before the `handlesOwnErrors` early return, because most 403s come from mutations.
   - Also invalidate `['me','permissions']` after writes to the admin app (PAN-015 identity note). The role-assignment mutations in the apps/roles features are the likely ones.
   - `clearOnAuthChange` already drops the cache. Add a test that a mounted provider refetches after `clear()`. If the observer does not recreate the query, key the provider by the auth epoch or remount it.
5. **Route panel retry (appsec N1).**
   - Add `onRetry` to `RoutePermissionGuard`. It refetches the permission query and shows `role='status'` text "Checking your permissions…" while pending.
   - If the result is still denied, the panel stays. If it is granted, the gate renders `<Outlet/>` automatically.
   - Check `ForbiddenPanel`'s props; I did not open it. A retry button should keep focus afterwards.
6. **Snapshot (AC1).**
   - Hand-patch only the `/api/v1/me/permissions` path and the `MePermissions` schema (plus any schema it references).
   - Copy them verbatim from org-admin-api main's `/openapi.json` (a scripted copy, not retyped).
   - Then regenerate `schema.d.ts` with the repo's openapi-typescript script, so the types are generated, not hand-edited (R2).
   - Do not regenerate fully. It brings in `/audit-logs` and `admin:audit:read`, which breaks `registry.test.ts` until PAN-016 (R7).
   - The deviation from AC1's "regenerated snapshot" must be written up in `impl-log.md`. Add a follow-up that PAN-016 refreshes the snapshot in full.
7. **`<Can>` a11y (do it now).**
   - Fix 🟡2 unconditionally. It is a one-liner: `describedBy: denied && req.kind === 'permission' ? id : undefined`. Add a test.
   - For 🟡1, I recommend the preferred fix now, because users will start to meet disabled controls. Extend the render prop with `disabledProps: { 'aria-disabled': true, 'aria-describedby': id }` (or `{}`) and keep `disabled` for transition.
   - The five callers are `roles/index.tsx`, `role-assignments-sheet.tsx`, `app-permissions-tab.tsx` (two spots) and `organizations-primary-buttons.tsx`. Each needs `onClick`/`onCheckedChange` to no-op while denied.
   - The planner must list these files explicitly (R7). The fallback is the minimum fix: the reason sits directly after the control in reading order, with a test, and the rest becomes a follow-up.
   - In the app-permissions-tab, make the repeated "Requires …" text `sr-only` on repeat rows, or use one shared description.
8. **Users self row (AC5).**
   - In `data-table-row-actions.tsx`, compute `isSelf = selfId !== undefined && user.id === selfId`.
   - For a self row, render the Disable/Enable item disabled, with the reason as text ("You can't change your own status"). Keep it visible and do not hide it.
   - Radix menu items skip disabled entries in keyboard navigation, so also put the reason in the trigger's accessible name or as description text in the menu.
   - This is advisory only. Keep the confirm dialog (R9) and the 403 `self_status_change_forbidden` handling.
   - `roles.assign` for your own user (403 `self_assignment_forbidden`) is the same idea. Include it only if the plan lists it; AC5 says "self-actions" generically.

## Test list (R8, Vitest browser, API faked at the network layer)

- `permits`: exact match; `admin:*` grants everything; no prefix wildcard; case-sensitive; empty list denies all; non-array or garbage returns `unknown`; duplicates and extra whitespace are not special.
- Query source: loading is `unknown`; success is `granted` and `denied`; a 5xx, network error, or malformed body gives `unknown` and no `denied`.
- Request: `GET /api/v1/me/permissions` carries no token in the URL or logs, and the permission set is never persisted (no `localStorage`/`sessionStorage` writes).
- Provider: the cache is cleared on auth change and no previous account's permissions leak; a refetch after 403 `permission_denied`/`admin_wildcard_required` happens once for a burst of N errors; other 403 codes and other statuses do not trigger it; the mutation-cache path triggers it.
- Nav and command menu: skeleton while loading; hidden when denied; fully visible on error.
- Route gate: denied shows the panel; Retry refetches and recovers to the page when granted; stays denied when still denied; the status text is announced.
- `Can`: hide, and disable with `aria-disabled`, a valid `describedBy`, and no dangling id; the click is a no-op while denied.
- Users: the self row has Disable disabled and with a reason; other rows are enabled; `selfId` undefined means enabled; the 403 `self_status_change_forbidden` is still shown.
- Snapshot: `registry.test.ts` stays green, and a type test or compile check covers `MePermissions`.

## Risks

- The skeleton adds a loading state to the main navigation. Keep it short. It must never leave the user without nav on error.
- A burst of 403s with an unthrottled refetch could hammer the API. The coalescing window and the "not on the permission query itself" check prevent that.
- Hand-patching the snapshot can drift from upstream. A scripted copy plus a PAN-016 full refresh limits this.
- Changing `Can`'s render-prop contract touches several features. Keep `disabled` in the contract for transition.
- `queryClient.clear()` with a mounted observer may not refetch. Test it and remount if needed.
- A wildcard-required route (`admin_wildcard_required`) needs `admin:*`. If the registry only declares plain permissions, the UI cannot predict it, so the 403 panel stays the gate there.

## Open questions

- Do you want the nav skeleton, or fail-open display until data arrives and accept a brief flash?
- Is the preferred `aria-disabled` fix in scope for this ticket, or is it a follow-up with only the one-liner now?
- Should `roles.assign` self-assignment be disabled in the role assignments sheet, or only the users status action?
- Is the hand-patch deviation from AC1 acceptable to the owner?

Files read: `/home/user/admin-pan/work/tickets/PAN-011b/ticket.md`, `src/lib/permissions/source.ts`, `src/context/permission-provider.tsx`, `src/components/permissions/can.tsx`, `src/components/permissions/route-permission-guard.tsx`, `src/components/layout/nav-filter.ts`, `src/routes/_authenticated/route.tsx`, `src/test-utils/permissions.tsx`, `src/test-utils/api.ts`, `src/lib/query-client.ts`, `src/api/client.ts`, `src/api/index.ts`, `src/features/users/api/queries.ts`, `src/features/users/components/data-table-row-actions.tsx`, and the PAN-011 and PAN-013 a11y reviews (grep only).
