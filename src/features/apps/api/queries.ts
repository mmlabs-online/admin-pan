import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  ApiError,
  getApi,
  isApiError,
  toPageParams,
  unwrap,
  type ApiClient,
  type components,
  type paths,
} from '@/api'
import { toSearchTerm } from '@/lib/list-search'
import { type MutationSuccessOptions } from '@/lib/mutation-success'
import { mePermissionsKeys } from '@/lib/permissions/me-permissions'
import { usersKeys } from '@/features/users/api/queries'
import {
  ADMIN_APP_KEY,
  APP_DEFAULT_SORT,
  type AppCredential,
  type AppCredentialScope,
} from '../data/app-schema'
import { isUnknownOutcome, joinRequestRefusal } from '../data/errors'

type AppCreate = components['schemas']['AppCreate']
type AppUpdate = components['schemas']['AppUpdate']
type PermissionCreate = components['schemas']['PermissionCreate']
type PermissionUpdate = components['schemas']['PermissionUpdate']
type UpdateAppVars = { key: string; body: AppUpdate }
type UpdatePermissionVars = { permissionId: string; body: PermissionUpdate }

export const PERMISSIONS_PAGE_SIZE = 50
export const CREDENTIALS_PAGE_SIZE = 20
export const JOIN_REQUESTS_PAGE_SIZE = 20

type AppsQuery = NonNullable<
  paths['/api/v1/apps']['get']['parameters']['query']
>
// Optional filters are left out when unset; the default order is not sent.
export type AppsListParams = {
  limit: number
  offset: number
  status?: NonNullable<AppsQuery['status']>
  join_policy?: NonNullable<AppsQuery['join_policy']>
  org_mode?: NonNullable<AppsQuery['org_mode']>
  q?: string
  sort?: AppsQuery['sort']
}
export type PermissionsParams = { limit: number; offset: number }
export type CredentialsParams = { limit: number; offset: number }
export type JoinRequestStatus = NonNullable<
  paths['/api/v1/apps/{key}/join-requests']['get']['parameters']['query']
>['status']
export type JoinRequestsParams = {
  status: JoinRequestStatus
  limit: number
  offset: number
}

export const appsKeys = {
  all: ['apps'] as const,
  lists: () => [...appsKeys.all, 'list'] as const,
  list: (p: AppsListParams) =>
    [
      ...appsKeys.lists(),
      {
        limit: p.limit,
        offset: p.offset,
        ...(p.status && { status: p.status }),
        ...(p.join_policy && { join_policy: p.join_policy }),
        ...(p.org_mode && { org_mode: p.org_mode }),
        ...(p.q && { q: p.q }),
        ...(p.sort && { sort: p.sort }),
      },
    ] as const,
  detail: (key: string) => [...appsKeys.all, 'detail', key] as const,
  permissions: (key: string, p: PermissionsParams) =>
    [
      ...appsKeys.detail(key),
      'permissions',
      { limit: p.limit, offset: p.offset },
    ] as const,
  credentialsAll: (key: string) =>
    [...appsKeys.detail(key), 'credentials'] as const,
  credentials: (key: string, p: CredentialsParams) =>
    [
      ...appsKeys.credentialsAll(key),
      { limit: p.limit, offset: p.offset },
    ] as const,
  joinRequestsAll: (key: string) =>
    [...appsKeys.detail(key), 'join-requests'] as const,
  // Only the app key, status and paging: never an email or a name (R5).
  joinRequests: (key: string, p: JoinRequestsParams) =>
    [
      ...appsKeys.joinRequestsAll(key),
      { status: p.status, limit: p.limit, offset: p.offset },
    ] as const,
}

/** Table state -> `GET /api/v1/apps` params. */
export function toAppsListParams({
  pagination,
  q,
  status,
  join_policy,
  org_mode,
  sort,
}: {
  pagination: { pageIndex: number; pageSize: number }
  q?: string
  status?: AppsListParams['status']
  join_policy?: AppsListParams['join_policy']
  org_mode?: AppsListParams['org_mode']
  sort?: AppsListParams['sort']
}): AppsListParams {
  const term = toSearchTerm(q)
  return {
    ...toPageParams(pagination),
    ...(status && { status }),
    ...(join_policy && { join_policy }),
    ...(org_mode && { org_mode }),
    ...(term && { q: term }),
    ...(sort && sort !== APP_DEFAULT_SORT && { sort }),
  }
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

/** GET /api/v1/apps/{key}/credentials — admin:apps:read. Metadata only. */
export function appCredentialsQueryOptions(
  key: string,
  params: CredentialsParams,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: appsKeys.credentials(key, params),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/apps/{key}/credentials', {
          params: { path: { key }, query: params },
          signal,
        })
      ),
    placeholderData: keepPreviousData,
  })
}

/**
 * GET /api/v1/apps/{key}/join-requests — admin:users:read. No
 * keepPreviousData: rows of another status must not show with the wrong actions.
 */
export function appJoinRequestsQueryOptions(
  key: string,
  params: JoinRequestsParams,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: appsKeys.joinRequests(key, params),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/apps/{key}/join-requests', {
          params: { path: { key }, query: params },
          signal,
        })
      ),
  })
}

/**
 * Shared mutation options: never optimistic (R9); the dialogs show errors
 * themselves. Refetch on success and when the state changed elsewhere.
 */
function useMutationOptions<TVars = unknown>(
  scope: readonly unknown[],
  alsoOnSuccess?: readonly unknown[],
  extra?: MutationSuccessOptions<unknown, TVars>
) {
  const queryClient = useQueryClient()
  const refetch = () => queryClient.invalidateQueries({ queryKey: scope })
  return {
    meta: { handlesOwnErrors: true },
    onSuccess: (data: unknown, vars: TVars) => {
      void refetch()
      if (alsoOnSuccess)
        void queryClient.invalidateQueries({ queryKey: alsoOnSuccess })
      extra?.onSuccess?.(data, vars)
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
export function useUpdateAppMutation(
  api: ApiClient = getApi(),
  options?: MutationSuccessOptions<unknown, UpdateAppVars>
) {
  return useMutation({
    mutationFn: async ({ key, body }: UpdateAppVars) =>
      unwrap(
        await api.PATCH('/api/v1/apps/{key}', {
          params: { path: { key } },
          body,
        })
      ),
    ...useMutationOptions(appsKeys.all, undefined, options),
  })
}

// Writes on the admin app's permissions can change the signed-in user's own
// permissions, so the hint is refetched too (PAN-011b).
function useAppPermissionMutationOptions<TVars = unknown>(
  appKey: string,
  extra?: MutationSuccessOptions<unknown, TVars>
) {
  return useMutationOptions(
    appsKeys.detail(appKey),
    appKey === ADMIN_APP_KEY ? mePermissionsKeys.all : undefined,
    extra
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
  api: ApiClient = getApi(),
  options?: MutationSuccessOptions<unknown, UpdatePermissionVars>
) {
  return useMutation({
    mutationFn: async ({ permissionId, body }: UpdatePermissionVars) =>
      unwrap(
        await api.PATCH('/api/v1/apps/{key}/permissions/{permission_id}', {
          params: { path: { key: appKey, permission_id: permissionId } },
          body,
        })
      ),
    ...useAppPermissionMutationOptions(appKey, options),
  })
}

/**
 * POST /api/v1/apps/{key}/credentials (201) — admin:apps:write + admin:*
 * (the API checks the latter). The secret never enters TanStack state (R3/R5,
 * ADR 0007): it goes to the caller's sink and the mutation resolves with
 * metadata only. No retry: a retry would issue a second key.
 */
export function useIssueCredentialMutation(
  appKey: string,
  api: ApiClient = getApi()
) {
  const queryClient = useQueryClient()
  const invalidate = (key: readonly unknown[]) =>
    void queryClient.invalidateQueries({ queryKey: key })
  return useMutation({
    mutationFn: async ({
      scope,
      onSecret,
    }: {
      scope: AppCredentialScope
      onSecret: (credential: string) => void
    }): Promise<AppCredential> => {
      const { credential, ...meta } = unwrap(
        await api.POST('/api/v1/apps/{key}/credentials', {
          params: { path: { key: appKey } },
          body: { scope },
        })
      )
      if (typeof credential !== 'string' || !credential)
        throw new ApiError({
          kind: 'invalid_response',
          status: 0,
          code: 'invalid_response',
          message: 'The server returned no credential',
        })
      onSecret(credential)
      return meta
    },
    retry: false,
    gcTime: 0,
    meta: { handlesOwnErrors: true },
    onSuccess: () => invalidate(appsKeys.credentialsAll(appKey)),
    onError: (error: unknown) => {
      if (isApiError(error, 404) || isApiError(error, 409))
        invalidate(appsKeys.detail(appKey))
      else if (isUnknownOutcome(error))
        invalidate(appsKeys.credentialsAll(appKey))
    },
  })
}

/** DELETE /api/v1/apps/{key}/credentials/{credential_id} (204) — admin:apps:write. */
export function useRevokeCredentialMutation(
  appKey: string,
  api: ApiClient = getApi(),
  options?: MutationSuccessOptions<unknown, string>
) {
  return useMutation({
    mutationFn: async (credentialId: string) =>
      unwrap(
        await api.DELETE('/api/v1/apps/{key}/credentials/{credential_id}', {
          params: { path: { key: appKey, credential_id: credentialId } },
        })
      ),
    ...useMutationOptions(appsKeys.credentialsAll(appKey), undefined, options),
  })
}

/**
 * POST /api/v1/apps/{key}/join-requests/{request_id}/approve|reject — no body,
 * admin:roles:assign. Never optimistic (R9). Approve may create an app-scope
 * assignment, so the user's detail is refetched; `me/permissions` is not (the
 * grant never targets the admin app).
 */
export function useDecideJoinRequestMutation(
  appKey: string,
  decision: 'approve' | 'reject',
  api: ApiClient = getApi(),
  options?: MutationSuccessOptions<unknown, string>
) {
  const queryClient = useQueryClient()
  const invalidate = (key: readonly unknown[]) =>
    void queryClient.invalidateQueries({ queryKey: key })
  return useMutation({
    mutationFn: async (requestId: string) => {
      const params = {
        params: { path: { key: appKey, request_id: requestId } },
      }
      return unwrap(
        decision === 'approve'
          ? await api.POST(
              '/api/v1/apps/{key}/join-requests/{request_id}/approve',
              params
            )
          : await api.POST(
              '/api/v1/apps/{key}/join-requests/{request_id}/reject',
              params
            )
      )
    },
    retry: false,
    meta: { handlesOwnErrors: true },
    onSuccess: (data, requestId) => {
      invalidate(appsKeys.joinRequestsAll(appKey))
      if (decision === 'approve') invalidate(usersKeys.detail(data.user_id))
      options?.onSuccess?.(data, requestId)
    },
    onError: (error: unknown) => {
      if (
        isApiError(error, 404) ||
        isApiError(error, 409) ||
        isUnknownOutcome(error)
      )
        invalidate(appsKeys.joinRequestsAll(appKey))
      const reason = joinRequestRefusal(error)
      if (
        reason === 'app_disabled' ||
        reason === 'join_policy_changed' ||
        reason === 'default_role_unusable'
      )
        invalidate(appsKeys.detail(appKey))
    },
  })
}
