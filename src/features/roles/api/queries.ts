import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { ApiError, getApi, isApiError, unwrap, type ApiClient } from '@/api'
import { mePermissionsKeys } from '@/lib/permissions/me-permissions'
import { appsKeys } from '@/features/apps/api/queries'
import { ADMIN_APP_KEY, type Permission } from '@/features/apps/data/app-schema'
import { isUnknownOutcome } from '@/features/apps/data/errors'
import { type RoleCreate } from '../data/role-schema'

export type RolesParams = { limit: number; offset: number }

const ALL_PERMISSIONS_PAGE = 100
const ALL_PERMISSIONS_MAX_PAGES = 50

// Nested under the app, so `useUpdateAppMutation` (invalidates ['apps']) also
// refreshes `is_default`.
export const rolesKeys = {
  all: (app: string) => [...appsKeys.detail(app), 'roles'] as const,
  list: (app: string, p: RolesParams) =>
    [
      ...rolesKeys.all(app),
      'list',
      { limit: p.limit, offset: p.offset },
    ] as const,
  detail: (app: string, id: string) =>
    [...rolesKeys.all(app), 'detail', id] as const,
  allPermissions: (app: string) =>
    [...appsKeys.detail(app), 'permissions', 'all'] as const,
}

// The injected client is a dependency, not cache data (tests only).
/** GET /api/v1/apps/{key}/role-definitions — admin:apps:read. */
export function roleDefinitionsQueryOptions(
  app: string,
  params: RolesParams,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: rolesKeys.list(app, params),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/apps/{key}/role-definitions', {
          params: { path: { key: app }, query: params },
          signal,
        })
      ),
    // Keep the previous page within one app only: another app's rows must
    // never show under this app's name.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[2] === app ? prev : undefined,
  })
}

/** GET /api/v1/apps/{key}/role-definitions/{role_id} — admin:apps:read. */
export function roleDefinitionQueryOptions(
  app: string,
  roleId: string,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: rolesKeys.detail(app, roleId),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/apps/{key}/role-definitions/{role_id}', {
          params: { path: { key: app, role_id: roleId } },
          signal,
        })
      ),
  })
}

/**
 * Every permission of the app, all pages (limit 100). A paged picker would
 * silently drop keys on the full-replace PUT, so the dialogs wait for this.
 */
export function appAllPermissionsQueryOptions(
  app: string,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: rolesKeys.allPermissions(app),
    queryFn: async ({ signal }): Promise<Permission[]> => {
      const items: Permission[] = []
      for (let n = 0; n < ALL_PERMISSIONS_MAX_PAGES; n++) {
        const page = unwrap(
          await api.GET('/api/v1/apps/{key}/permissions', {
            params: {
              path: { key: app },
              query: { limit: ALL_PERMISSIONS_PAGE, offset: items.length },
            },
            signal,
          })
        )
        items.push(...page.items)
        if (!page.items.length || items.length >= page.total) return items
      }
      throw new ApiError({
        kind: 'invalid_response',
        status: 0,
        code: 'invalid_response',
        message: 'Too many permissions to load',
      })
    },
  })
}

/**
 * Shared mutation options: never optimistic (R9); dialogs show errors
 * themselves. Writes on the admin app can change the signed-in user's own
 * permissions, so the hint is refetched too (PAN-011b).
 */
function useRoleMutationOptions(app: string, alsoOnError?: readonly unknown[]) {
  const queryClient = useQueryClient()
  const invalidate = (key: readonly unknown[]) =>
    void queryClient.invalidateQueries({ queryKey: key })
  return {
    meta: { handlesOwnErrors: true },
    onSuccess: () => {
      invalidate(rolesKeys.all(app))
      if (app === ADMIN_APP_KEY) invalidate(mePermissionsKeys.all)
    },
    onError: (error: unknown) => {
      if (
        isApiError(error, 404) ||
        isApiError(error, 409) ||
        isUnknownOutcome(error)
      )
        invalidate(rolesKeys.all(app))
      if (
        alsoOnError &&
        (isApiError(error, 404) ||
          isApiError(error, 409) ||
          isApiError(error, 422))
      )
        invalidate(alsoOnError)
    },
  }
}

/** POST /api/v1/apps/{key}/roles (201) — admin:roles:manage. No retry: a retry could create twice. */
export function useCreateRoleMutation(app: string, api: ApiClient = getApi()) {
  return useMutation({
    mutationFn: async (body: RoleCreate) =>
      unwrap(
        await api.POST('/api/v1/apps/{key}/roles', {
          params: { path: { key: app } },
          body,
        })
      ),
    retry: false,
    ...useRoleMutationOptions(app),
  })
}

/** PATCH /api/v1/apps/{key}/roles/{role_id} — admin:roles:manage. */
export function useRenameRoleMutation(app: string, api: ApiClient = getApi()) {
  return useMutation({
    mutationFn: async ({ roleId, name }: { roleId: string; name: string }) =>
      unwrap(
        await api.PATCH('/api/v1/apps/{key}/roles/{role_id}', {
          params: { path: { key: app, role_id: roleId } },
          body: { name },
        })
      ),
    ...useRoleMutationOptions(app),
  })
}

/**
 * PUT /api/v1/apps/{key}/roles/{role_id}/permissions — admin:roles:manage. A
 * full replace by permission keys. On 404/409/422 the permission list is
 * refetched too (a key may have been removed).
 */
export function useReplaceRolePermissionsMutation(
  app: string,
  api: ApiClient = getApi()
) {
  return useMutation({
    mutationFn: async ({ roleId, keys }: { roleId: string; keys: string[] }) =>
      unwrap(
        await api.PUT('/api/v1/apps/{key}/roles/{role_id}/permissions', {
          params: { path: { key: app, role_id: roleId } },
          body: { permission_keys: keys },
        })
      ),
    retry: false,
    ...useRoleMutationOptions(app, appsKeys.detail(app)),
  })
}

/** DELETE /api/v1/apps/{key}/roles/{role_id} (204) — admin:roles:manage. */
export function useDeleteRoleMutation(app: string, api: ApiClient = getApi()) {
  return useMutation({
    mutationFn: async (roleId: string) =>
      unwrap(
        await api.DELETE('/api/v1/apps/{key}/roles/{role_id}', {
          params: { path: { key: app, role_id: roleId } },
        })
      ),
    ...useRoleMutationOptions(app),
  })
}
