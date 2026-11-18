import { type SortingState } from '@tanstack/react-table'

/** API `sort` value ('name', '-name') -> table sorting; none -> the default. */
export function toSortingState(
  sort: string | undefined,
  defaultSort: string
): SortingState {
  const value = sort ?? defaultSort
  return value.startsWith('-')
    ? [{ id: value.slice(1), desc: true }]
    : [{ id: value, desc: false }]
}

/**
 * Table sorting change -> API `sort` value. Three states per column: asc,
 * desc, back to the default. The default itself is never returned (`undefined`),
 * so it stays out of the URL and the request. The column that holds the default
 * sort cycles between its other direction and the default.
 */
export function nextApiSort(
  prev: SortingState,
  next: SortingState,
  defaultSort: string
): string | undefined {
  let result: string
  if (next.length === 0) {
    const was = prev[0]
    const wasDefault = was && (was.desc ? `-${was.id}` : was.id) === defaultSort
    result = wasDefault ? was.id : defaultSort
  } else {
    result = next[0].desc ? `-${next[0].id}` : next[0].id
  }
  return result === defaultSort ? undefined : result
}
