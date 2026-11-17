import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
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
import { appsColumns as columns } from './apps-columns'
import { useApps } from './apps-provider'

type AppsTableProps = {
  search: Record<string, unknown>
  navigate: NavigateFn
}

// Server-side paging only (ADR 0005): the list endpoint has no search, status
// or sort parameters, so none are offered (R1).
export function AppsTable({ search, navigate }: AppsTableProps) {
  const { api } = useApps()
  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search,
      navigate,
      pagination: { defaultPage: 1, defaultPageSize: 10 },
      globalFilter: { enabled: false },
    })

  const q = useQuery(
    appsListQueryOptions(toAppsListParams({ pagination }), api)
  )
  const view = queryView(q)

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: q.data?.items ?? [],
    columns,
    rowCount: q.data?.total ?? 0,
    manualPagination: true,
    manualFiltering: true,
    enableSorting: false,
    enableRowSelection: false,
    state: { pagination },
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
  const status =
    view.status === 'pending'
      ? 'Loading apps…'
      : view.status === 'success'
        ? rows.length
          ? `${q.data?.total ?? 0} apps, page ${pagination.pageIndex + 1} of ${Math.max(pageCount, 1)}`
          : 'No apps registered yet.'
        : ''

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <p role='status' aria-live='polite' className='sr-only'>
        {status}
      </p>
      <div className='overflow-x-auto rounded-md border'>
        <Table aria-label='Apps' aria-busy={view.status === 'pending'}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
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
                No apps registered yet.
              </MessageRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} className='mt-auto' />
    </div>
  )
}

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
