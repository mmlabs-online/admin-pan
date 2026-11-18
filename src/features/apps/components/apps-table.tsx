import { useEffect, useId, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  flexRender,
  functionalUpdate,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { isApiError } from '@/api'
import { nextApiSort, toSortingState } from '@/lib/list-sort'
import { queryView } from '@/lib/query-view'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination } from '@/components/data-table'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { appsListQueryOptions, toAppsListParams } from '../api/queries'
import { APP_DEFAULT_SORT, appsSearchSchema } from '../data/app-schema'
import { appsColumns as columns } from './apps-columns'
import { useApps } from './apps-provider'
import { AppsToolbar } from './apps-toolbar'

type AppsTableProps = {
  search: Record<string, unknown>
  navigate: NavigateFn
}

// Server-side paging, search, filters and sort (ADR 0005): every control only
// changes URL search params and the request; the table never filters or sorts
// a page itself (R1).
export function AppsTable({ search, navigate }: AppsTableProps) {
  const { api } = useApps()
  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search,
      navigate,
      pagination: { defaultPage: 1, defaultPageSize: 10 },
      globalFilter: { enabled: false },
    })

  const {
    q: term,
    status: statusFilter,
    join_policy: joinPolicy,
    org_mode: orgMode,
    sort,
  } = appsSearchSchema.parse(search)
  // Every change goes through here, so the page always resets.
  const setListSearch = (
    patch: Record<string, unknown>,
    opts?: { replace?: boolean }
  ) =>
    navigate({
      replace: opts?.replace,
      search: (prev) => ({ ...prev, ...patch, page: undefined }),
    })
  const searchRef = useRef<HTMLInputElement>(null)
  const invalidId = useId()
  const sorting = toSortingState(sort, APP_DEFAULT_SORT)

  const q = useQuery(
    appsListQueryOptions(
      toAppsListParams({
        pagination,
        q: term,
        status: statusFilter,
        join_policy: joinPolicy,
        org_mode: orgMode,
        sort,
      }),
      api
    )
  )
  const view = queryView(q)

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: q.data?.items ?? [],
    columns,
    rowCount: q.data?.total ?? 0,
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    sortDescFirst: false,
    enableMultiSort: false,
    enableRowSelection: false,
    state: { pagination, sorting },
    onSortingChange: (updater) =>
      setListSearch({
        sort: nextApiSort(
          sorting,
          functionalUpdate(updater, sorting),
          APP_DEFAULT_SORT
        ),
      }),
    getRowId: (row) => row.key,
    onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
  })

  const pageCount = table.getPageCount()
  const settled = q.isSuccess && !q.isPlaceholderData
  useEffect(() => {
    if (settled) ensurePageInRange(pageCount)
  }, [settled, pageCount, ensurePageInRange])

  if (view.status === 'forbidden')
    return (
      <ForbiddenPanel
        variant='page'
        copy={view.copy}
        onRetry={() => void q.refetch()}
      />
    )

  const rows = table.getRowModel().rows
  const rejected = view.status === 'error' && isApiError(view.error, 422)
  const filtered = Boolean(term || statusFilter || joinPolicy || orgMode)
  const status =
    view.status === 'pending' || q.isPlaceholderData
      ? 'Loading apps…'
      : view.status === 'success'
        ? rows.length
          ? `${q.data?.total ?? 0} apps${filtered ? ' match these filters' : ''}, page ${pagination.pageIndex + 1} of ${Math.max(pageCount, 1)}`
          : filtered
            ? 'No apps match these filters.'
            : 'No apps registered yet.'
        : ''

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <AppsToolbar
        q={term}
        status={statusFilter}
        join_policy={joinPolicy}
        org_mode={orgMode}
        canReset={filtered || sort !== undefined}
        searchRef={searchRef}
        searchInvalid={rejected}
        searchDescribedBy={rejected ? invalidId : undefined}
        onQ={(value) => setListSearch({ q: value }, { replace: true })}
        onStatus={(value) => setListSearch({ status: value })}
        onJoinPolicy={(value) => setListSearch({ join_policy: value })}
        onOrgMode={(value) => setListSearch({ org_mode: value })}
        onReset={() => {
          setListSearch({
            q: undefined,
            status: undefined,
            join_policy: undefined,
            org_mode: undefined,
            sort: undefined,
          })
          searchRef.current?.focus()
        }}
      />
      <p role='status' aria-live='polite' className='sr-only'>
        {status}
      </p>
      <div className='overflow-x-auto rounded-md border'>
        <Table
          aria-label='Apps'
          aria-busy={view.status === 'pending' || q.isPlaceholderData}
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    aria-sort={
                      header.column.getCanSort()
                        ? ariaSort(header.column.getIsSorted())
                        : undefined
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {view.status === 'pending' ? (
              <MessageRow span={columns.length}>Loading apps…</MessageRow>
            ) : view.status === 'error' && isApiError(view.error, 422) ? (
              <MessageRow span={columns.length}>
                <p role='alert' id={invalidId}>
                  The search or filters weren&apos;t accepted. Shorten or change
                  the search, or reset the filters.
                </p>
              </MessageRow>
            ) : view.status === 'error' ? (
              <MessageRow span={columns.length}>
                <div role='alert' className='space-y-2'>
                  <p>Couldn&apos;t load apps.</p>
                  <Button size='sm' onClick={() => void q.refetch()}>
                    Retry
                  </Button>
                </div>
              </MessageRow>
            ) : rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <MessageRow span={columns.length}>
                {filtered
                  ? 'No apps match these filters.'
                  : 'No apps registered yet.'}
              </MessageRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} className='mt-auto' />
    </div>
  )
}

const ariaSort = (s: false | 'asc' | 'desc') =>
  s === 'asc' ? 'ascending' : s === 'desc' ? 'descending' : 'none'

function MessageRow({
  span,
  children,
}: {
  span: number
  children: React.ReactNode
}) {
  return (
    <TableRow>
      <TableCell colSpan={span} className='h-24 text-center'>
        {children}
      </TableCell>
    </TableRow>
  )
}
