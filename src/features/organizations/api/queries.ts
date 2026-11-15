import { queryOptions, useQuery } from '@tanstack/react-query'
import { getApi, unwrap, type ApiClient } from '@/api'

type ListParams = { limit?: number; offset?: number }

export const organizationsKeys = {
  all: ['organizations'] as const,
  list: (params: ListParams) =>
    [...organizationsKeys.all, 'list', params] as const,
}

// Needs admin:organizations:read (R4). Mutations follow the same shape with
// useMutation and, on success, queryClient.invalidateQueries({ queryKey:
// organizationsKeys.all }); never optimistic (R9). See docs/adr/0001.
export function organizationsListQueryOptions(
  params: ListParams,
  api: ApiClient = getApi()
) {
  // The injected client is a dependency, not cache data (tests only).
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
  })
}

export function useOrganizationsQuery(params: ListParams) {
  return useQuery(organizationsListQueryOptions(params))
}
