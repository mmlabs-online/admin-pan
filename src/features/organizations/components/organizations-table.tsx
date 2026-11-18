import { useEffect } from 'react'
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
import {
  organizationsListQueryOptions,
  toOrganizationsListParams,
} from '../api/queries'
import { organizationsSearchSchema, ORG_DEFAULT_SORT } from '../data/schema'
import { organizationsColumns as columns } from './organizations-columns'
import { useOrganizations } from './organizations-provider'
import { OrganizationsToolbar } from './organizations-toolbar'

type OrganizationsTableProps = {
  search: Record<string, unknown>
  navigate: NavigateFn
}

// Server-side paging, search, filter and sort (ADR 0005): every control only
// changes URL search params and the request; the table never filters or sorts
// a page itself (R1).
export function OrganizationsTable({
  search,
  navigate,
}: OrganizationsTableProps) {
  const { api } = useOrganizations()
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
    sort,
  } = organizationsSearchSchema.parse(search)
  // Every change goes through here, so the page always resets.
  const setListSearch = (
    patch: Record<string, unknown>,
    opts?: { replace?: boolean }
  ) =>
    navigate({
      replace: opts?.replace,
      search: (prev) => ({ ...prev, ...patch, page: undefined }),
    })
  const sorting = toSortingState(sort, ORG_DEFAULT_SORT)

  const q = useQuery(
    organizationsListQueryOptions(
      toOrganizationsListParams({
        pagination,
        q: term,
        status: statusFilter,
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
          ORG_DEFAULT_SORT
        ),
      }),
    getRowId: (row) => row.id,
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
  const filtered = Boolean(term || statusFilter)
  const status =
    view.status === 'pending' || q.isPlaceholderData
      ? 'Loading organizations…'
      : view.status === 'success'
        ? rows.length
          ? `${q.data?.total ?? 0} organizations${filtered ? ' match these filters' : ''}, page ${pagination.pageIndex + 1} of ${Math.max(pageCount, 1)}`
          : filtered
            ? 'No organizations match these filters.'
            : 'No organizations yet.'
        : ''

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <OrganizationsToolbar
        q={term}
        status={statusFilter}
        canReset={filtered || sort !== undefined}
        onQ={(value) => setListSearch({ q: value }, { replace: true })}
        onStatus={(value) => setListSearch({ status: value })}
        onReset={() =>
          setListSearch({ q: undefined, status: undefined, sort: undefined })
        }
      />
      <p role='status' aria-live='polite' className='sr-only'>
        {status}
      </p>
      <div className='overflow-x-auto rounded-md border'>
        <Table aria-label='Organizations' aria-busy={q.isFetching}>
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
              <MessageRow span={columns.length}>
                Loading organizations…
              </MessageRow>
            ) : view.status === 'error' && isApiError(view.error, 422) ? (
              <MessageRow span={columns.length}>
                <p role='alert'>The search or filters weren&apos;t accepted.</p>
              </MessageRow>
            ) : view.status === 'error' ? (
              <MessageRow span={columns.length}>
                <div role='alert' className='space-y-2'>
                  <p>Couldn&apos;t load organizations.</p>
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
                  ? 'No organizations match these filters.'
                  : 'No organizations yet.'}
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
