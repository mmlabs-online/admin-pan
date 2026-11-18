import { queryOptions } from '@tanstack/react-query'
import { getApi, unwrap, type ApiClient, type components } from '@/api'

export type DashboardStats = components['schemas']['DashboardStats']

export const dashboardKeys = {
  all: ['stats'] as const,
  dashboard: () => [...dashboardKeys.all, 'dashboard'] as const,
}

// The counts are approximate; a short staleTime bounds the refetch cost.
export const DASHBOARD_STALE_TIME = 60_000

// The injected client is a dependency, not cache data (tests only).
export function dashboardStatsQueryOptions(api: ApiClient = getApi()) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: dashboardKeys.dashboard(),
    staleTime: DASHBOARD_STALE_TIME,
    queryFn: async ({ signal }) =>
      unwrap(await api.GET('/api/v1/stats/dashboard', { signal })),
  })
}
