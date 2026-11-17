import { type QueryClient, type QueryKey } from '@tanstack/react-query'
import { isApiError } from '@/api'
import { isForbidden } from '@/lib/forbidden'
import { mePermissionsKeys } from './me-permissions'

const PERMISSION_REFRESH_CODES = new Set([
  'permission_denied',
  'admin_wildcard_required',
])
export const PERMISSION_REFRESH_WINDOW_MS = 5_000

/**
 * A 403 that says the grants changed refetches the permission query: at most
 * once per window and never while it is already fetching. It never changes how
 * the 403 is shown and never records the denial (ADR 0004).
 */
export function createPermissionRefresher(
  getClient: () => QueryClient | undefined,
  {
    windowMs = PERMISSION_REFRESH_WINDOW_MS,
    now = Date.now,
  }: { windowMs?: number; now?: () => number } = {}
) {
  let last = -Infinity
  return (error: unknown, queryKey?: QueryKey) => {
    if (
      !isForbidden(error) ||
      !isApiError(error) ||
      !PERMISSION_REFRESH_CODES.has(error.code)
    )
      return
    if (queryKey?.[0] === 'me' && queryKey[1] === 'permissions') return
    const client = getClient()
    if (!client) return
    if (now() - last < windowMs) return
    if (client.isFetching({ queryKey: mePermissionsKeys.all }) > 0) return
    last = now()
    void client.invalidateQueries({
      queryKey: mePermissionsKeys.all,
      refetchType: 'active',
    })
  }
}
