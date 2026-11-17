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

type OrganizationCreate = components['schemas']['OrganizationCreate']
type OrganizationUpdate = components['schemas']['OrganizationUpdate']

// `GET /api/v1/organizations` takes only limit/offset (order is fixed:
// created_at DESC). Add status/q/sort here when the API ships them.
export type OrganizationsListParams = { limit: number; offset: number }

export const organizationsKeys = {
  all: ['organizations'] as const,
  lists: () => [...organizationsKeys.all, 'list'] as const,
  detail: (id: string) => [...organizationsKeys.all, 'detail', id] as const,
  list: (p: OrganizationsListParams) =>
    [
      ...organizationsKeys.lists(),
      { limit: p.limit, offset: p.offset },
    ] as const,
}

/** Table state -> `GET /api/v1/organizations` params: paging only. */
export function toOrganizationsListParams({
  pagination,
}: {
  pagination: { pageIndex: number; pageSize: number }
}): OrganizationsListParams {
  return toPageParams(pagination)
}

// Needs admin:organizations:read (R4). The injected client is a dependency,
// not cache data (tests only).
export function organizationsListQueryOptions(
  params: OrganizationsListParams,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: organizationsKeys.list(params),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/organizations', {
          params: { query: params },
          signal,
        })
      ),
    placeholderData: keepPreviousData,
  })
}

/** GET /api/v1/organizations/{org_id} — admin:organizations:read. */
export function organizationQueryOptions(
  id: string,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: organizationsKeys.detail(id),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/organizations/{org_id}', {
          params: { path: { org_id: id } },
          signal,
        })
      ),
  })
}

/**
 * Shared mutation options: never optimistic (R9); the dialogs show errors
 * themselves. Refetch on success and when the state changed elsewhere.
 */
function useOrganizationMutationOptions() {
  const queryClient = useQueryClient()
  const refetch = () =>
    queryClient.invalidateQueries({ queryKey: organizationsKeys.all })
  return {
    meta: { handlesOwnErrors: true },
    onSuccess: refetch,
    onError: (error: unknown) => {
      if (isApiError(error, 404) || isApiError(error, 409)) void refetch()
    },
  }
}

/** POST /api/v1/organizations — admin:organizations:write. */
export function useCreateOrganizationMutation(api: ApiClient = getApi()) {
  return useMutation({
    mutationFn: async (body: OrganizationCreate) =>
      unwrap(await api.POST('/api/v1/organizations', { body })),
    ...useOrganizationMutationOptions(),
  })
}

/** PATCH /api/v1/organizations/{org_id} — admin:organizations:write. */
export function useUpdateOrganizationMutation(api: ApiClient = getApi()) {
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: OrganizationUpdate
    }) =>
      unwrap(
        await api.PATCH('/api/v1/organizations/{org_id}', {
          params: { path: { org_id: id } },
          body,
        })
      ),
    ...useOrganizationMutationOptions(),
  })
}

/** DELETE /api/v1/organizations/{org_id} (204) — admin:organizations:write. */
export function useDeleteOrganizationMutation(api: ApiClient = getApi()) {
  return useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      unwrap(
        await api.DELETE('/api/v1/organizations/{org_id}', {
          params: { path: { org_id: id } },
        })
      ),
    ...useOrganizationMutationOptions(),
  })
}
