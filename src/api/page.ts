export type Page<T> = {
  items: T[]
  total: number
  limit: number
  offset: number
}

export const MAX_PAGE_LIMIT = 100

export function toPageParams({
  pageIndex,
  pageSize,
}: {
  pageIndex: number
  pageSize: number
}) {
  const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.floor(pageSize)))
  return { limit, offset: Math.max(0, Math.floor(pageIndex) * limit) }
}
