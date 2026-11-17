import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getApi,
  isApiError,
  toPageParams,
  unwrap,
  type ApiClient,
  type components,
} from '@/api'
import { mePermissionsKeys } from '@/lib/permissions/me-permissions'
import { ADMIN_APP_KEY } from '../data/app-schema'

type AppCreate = components['schemas']['AppCreate']
type AppUpdate = components['schemas']['AppUpdate']
type PermissionCreate = components['schemas']['PermissionCreate']
type PermissionUpdate = components['schemas']['PermissionUpdate']

export const PERMISSIONS_PAGE_SIZE = 50

// `GET /api/v1/apps` takes only limit/offset (order is fixed: by key). Add
// status/join_policy/q/sort here when the API ships them.
export type AppsListParams = { limit: number; offset: number }
export type PermissionsParams = { limit: number; offset: number }

export const appsKeys = {
  all: ['apps'] as const,
  lists: () => [...appsKeys.all, 'list'] as const,
  list: (p: AppsListParams) =>
    [...appsKeys.lists(), { limit: p.limit, offset: p.offset }] as const,
  detail: (key: string) => [...appsKeys.all, 'detail', key] as const,
  permissions: (key: string, p: PermissionsParams) =>
    [
      ...appsKeys.detail(key),
      'permissions',
      { limit: p.limit, offset: p.offset },
    ] as const,
}

/** Table state -> `GET /api/v1/apps` params: paging only. */
export function toAppsListParams({
  pagination,
}: {
  pagination: { pageIndex: number; pageSize: number }
}): AppsListParams {
  return toPageParams(pagination)
}

// The injected client is a dependency, not cache data (tests only).
/** GET /api/v1/apps — admin:apps:read. */
export function appsListQueryOptions(
  params: AppsListParams,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: appsKeys.list(params),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/apps', { params: { query: params }, signal })
      ),
    placeholderData: keepPreviousData,
  })
}

/** GET /api/v1/apps/{key} — admin:apps:read. */
export function appQueryOptions(key: string, api: ApiClient = getApi()) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: appsKeys.detail(key),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/apps/{key}', {
          params: { path: { key } },
          signal,
        })
      ),
  })
}

/** GET /api/v1/apps/{key}/permissions — admin:apps:read. */
export function appPermissionsQueryOptions(
  key: string,
  params: PermissionsParams,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: appsKeys.permissions(key, params),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/apps/{key}/permissions', {
          params: { path: { key }, query: params },
          signal,
        })
      ),
    placeholderData: keepPreviousData,
  })
}

/**
 * Shared mutation options: never optimistic (R9); the dialogs show errors
 * themselves. Refetch on success and when the state changed elsewhere.
 */
function useMutationOptions(
  scope: readonly unknown[],
  alsoOnSuccess?: readonly unknown[]
) {
  const queryClient = useQueryClient()
  const refetch = () => queryClient.invalidateQueries({ queryKey: scope })
  return {
    meta: { handlesOwnErrors: true },
    onSuccess: () => {
      void refetch()
      if (alsoOnSuccess)
        void queryClient.invalidateQueries({ queryKey: alsoOnSuccess })
    },
    onError: (error: unknown) => {
      if (isApiError(error, 404) || isApiError(error, 409)) void refetch()
    },
  }
}

/** POST /api/v1/apps (201) — admin:apps:write. */
export function useCreateAppMutation(api: ApiClient = getApi()) {
  return useMutation({
    mutationFn: async (body: AppCreate) =>
      unwrap(await api.POST('/api/v1/apps', { body })),
    ...useMutationOptions(appsKeys.all),
  })
}

/** PATCH /api/v1/apps/{key} — admin:apps:write (+ admin:* for the admin app). */
export function useUpdateAppMutation(api: ApiClient = getApi()) {
  return useMutation({
    mutationFn: async ({ key, body }: { key: string; body: AppUpdate }) =>
      unwrap(
        await api.PATCH('/api/v1/apps/{key}', {
          params: { path: { key } },
          body,
        })
      ),
    ...useMutationOptions(appsKeys.all),
  })
}

// Writes on the admin app's permissions can change the signed-in user's own
// permissions, so the hint is refetched too (PAN-011b).
function useAppPermissionMutationOptions(appKey: string) {
  return useMutationOptions(
    appsKeys.detail(appKey),
    appKey === ADMIN_APP_KEY ? mePermissionsKeys.all : undefined
  )
}

/** POST /api/v1/apps/{key}/permissions (201) — admin:roles:manage. */
export function useCreatePermissionMutation(
  appKey: string,
  api: ApiClient = getApi()
) {
  return useMutation({
    mutationFn: async (body: PermissionCreate) =>
      unwrap(
        await api.POST('/api/v1/apps/{key}/permissions', {
          params: { path: { key: appKey } },
          body,
        })
      ),
    ...useAppPermissionMutationOptions(appKey),
  })
}

/** PATCH /api/v1/apps/{key}/permissions/{permission_id} — admin:roles:manage. */
export function useUpdatePermissionMutation(
  appKey: string,
  api: ApiClient = getApi()
) {
  return useMutation({
    mutationFn: async ({
      permissionId,
      body,
    }: {
      permissionId: string
      body: PermissionUpdate
    }) =>
      unwrap(
        await api.PATCH('/api/v1/apps/{key}/permissions/{permission_id}', {
          params: { path: { key: appKey, permission_id: permissionId } },
          body,
        })
      ),
    ...useAppPermissionMutationOptions(appKey),
  })
}
