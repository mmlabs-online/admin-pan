import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { isApiError, toPageParams } from '@/api'
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
import { type App } from '@/features/apps/data/app-schema'
import { roleDefinitionsQueryOptions } from '../api/queries'
import { rolesColumns as columns } from './roles-columns'
import { useRoles } from './roles-provider'

type RolesTableProps = {
  app: App
  search: Record<string, unknown>
  navigate: NavigateFn
}

// Server-side paging only (ADR 0005): the list endpoint has no search or sort
// parameters, so none are offered (R1).
export function RolesTable({ app, search, navigate }: RolesTableProps) {
  const { api } = useRoles()
  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search,
      navigate,
      pagination: { defaultPage: 1, defaultPageSize: 10 },
      globalFilter: { enabled: false },
    })

  const q = useQuery(
    roleDefinitionsQueryOptions(app.key, toPageParams(pagination), api)
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
  const gone = view.status === 'error' && isApiError(view.error, 404)
  const status =
    view.status === 'pending'
      ? 'Loading roles…'
      : view.status === 'success'
        ? rows.length
          ? `${q.data?.total ?? 0} roles, page ${pagination.pageIndex + 1} of ${Math.max(pageCount, 1)}`
          : `No roles in ${app.name} yet.`
        : ''

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <p role='status' aria-live='polite' className='sr-only'>
        {status}
      </p>
      <div className='overflow-x-auto rounded-md border'>
        <Table
          aria-label={`Roles of ${app.name}`}
          aria-busy={view.status === 'pending'}
        >
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
              <MessageRow span={columns.length}>Loading roles…</MessageRow>
            ) : view.status === 'error' ? (
              <MessageRow span={columns.length}>
                <div role='alert' className='space-y-2'>
                  {gone ? (
                    <p>This app no longer exists.</p>
                  ) : (
                    <>
                      <p>Couldn&apos;t load roles.</p>
                      <Button size='sm' onClick={() => void q.refetch()}>
                        Retry
                      </Button>
                    </>
                  )}
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
                No roles in {app.name} yet.
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
