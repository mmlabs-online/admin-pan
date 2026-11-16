import { isForbidden, forbiddenCopy, type ForbiddenCopy } from '@/lib/forbidden'

type QueryLike<T> = { data: T | undefined; error: unknown; isPending: boolean }

export type QueryView<T> =
  | { status: 'forbidden'; copy: ForbiddenCopy }
  | { status: 'error'; error: unknown }
  | { status: 'pending' }
  | { status: 'success'; data: T }

/**
 * Checks `error` before `data`: TanStack Query keeps the old data when a
 * refetch fails, so a revoked permission must not keep showing stale rows.
 */
export function queryView<T>(q: QueryLike<T>): QueryView<T> {
  if (q.error != null) {
    return isForbidden(q.error)
      ? { status: 'forbidden', copy: forbiddenCopy(q.error) }
      : { status: 'error', error: q.error }
  }
  if (q.isPending || q.data === undefined) return { status: 'pending' }
  return { status: 'success', data: q.data }
}
