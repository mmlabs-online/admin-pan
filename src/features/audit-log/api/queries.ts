import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { getApi, toPageParams, unwrap, type ApiClient, type paths } from '@/api'
import { APP_KEY_PATTERN } from '../data/data'
import { type AuditLogSearch } from '../data/search'
import { toAuditRange } from '../lib/format'

export type AuditListParams = NonNullable<
  paths['/api/v1/audit-logs']['get']['parameters']['query']
>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const auditLogsKeys = {
  all: ['audit-logs'] as const,
  lists: () => [...auditLogsKeys.all, 'list'] as const,
  list: (p: AuditListParams) =>
    [
      ...auditLogsKeys.lists(),
      Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)),
    ] as const,
}

/**
 * URL search -> `GET /api/v1/audit-logs` params. Empty or invalid values are
 * omitted (a bad uuid or app key would be a 422). Days become local-day
 * instants; see `toAuditRange`.
 */
export function toAuditListParams(search: Partial<AuditLogSearch>) {
  const pagination = {
    pageIndex: Math.max(0, (search.page ?? 1) - 1),
    pageSize: search.pageSize ?? 20,
  }
  return {
    ...toPageParams(pagination),
    ...(search.action ? { action: search.action } : {}),
    ...(search.targetType ? { target_type: search.targetType } : {}),
    ...(search.actorKind ? { actor_kind: search.actorKind } : {}),
    ...(search.outcome ? { outcome: search.outcome } : {}),
    ...(search.app && APP_KEY_PATTERN.test(search.app)
      ? { app_key: search.app }
      : {}),
    ...(search.actor && UUID.test(search.actor)
      ? { actor_user_id: search.actor }
      : {}),
    ...(search.target && UUID.test(search.target)
      ? { target_id: search.target }
      : {}),
    ...toAuditRange(search.from, search.to),
  } satisfies AuditListParams
}

// The injected client is a dependency, not cache data (tests only).
export function auditLogsQueryOptions(
  params: AuditListParams,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: auditLogsKeys.list(params),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/audit-logs', {
          params: { query: params },
          signal,
        })
      ),
    placeholderData: keepPreviousData,
  })
}
