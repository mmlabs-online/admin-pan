import { queryOptions } from '@tanstack/react-query'
import {
  ApiError,
  getApi,
  unwrap,
  type ApiClient,
  type components,
} from '@/api'
import { permits } from './permits'
import { type PermissionSource } from './source'

// org-admin-api: GET /api/v1/me/permissions (USR-11). A UI hint only (ADR 0004).
export type MePermissions = components['schemas']['MePermissions']

export const mePermissionsKeys = {
  all: ['me', 'permissions'] as const,
  account: (accountId: string) =>
    [...mePermissionsKeys.all, accountId] as const,
}

const invalid = () =>
  new ApiError({
    kind: 'invalid_response',
    status: 0,
    code: 'invalid_response',
    message: 'Unexpected permissions response',
  })

/** Extra fields are allowed (additive within v1); `roles` is never read. */
export function parseMePermissions(data: unknown): MePermissions {
  if (typeof data !== 'object' || data === null) throw invalid()
  const d = data as Record<string, unknown>
  if (
    typeof d.user_id !== 'string' ||
    !Array.isArray(d.permissions) ||
    !d.permissions.every((p) => typeof p === 'string')
  )
    throw invalid()
  return data as MePermissions
}

// The injected client is a dependency, not cache data (tests only).
export function mePermissionsQueryOptions(
  accountId: string,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: mePermissionsKeys.account(accountId),
    queryFn: async ({ signal }) =>
      parseMePermissions(
        unwrap(await api.GET('/api/v1/me/permissions', { signal }))
      ),
    staleTime: 60_000,
  })
}

export function permissionSourceFrom(
  granted: ReadonlySet<string>
): PermissionSource {
  return { check: (p) => (permits(granted, p) ? 'granted' : 'denied') }
}
