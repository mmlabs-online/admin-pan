import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { queryView } from '@/lib/query-view'
import { cn } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
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
import { DataTablePagination, DataTableToolbar } from '@/components/data-table'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { toUsersListParams, usersListQueryOptions } from '../api/queries'
import { statusOptions } from '../data/data'
import { type UserStatus } from '../data/schema'
import { usersColumns as columns } from './users-columns'
import { useUsers } from './users-provider'

type DataTableProps = {
  search: Record<string, unknown>
  navigate: NavigateFn
}

export function UsersTable({ search, navigate }: DataTableProps) {
  const { api } = useUsers()
  // Local UI-only state
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  // Only `status` and paging live in the URL. The typed email stays in the
  // hook's local state (no column filter entry for it), so it never reaches the
  // URL (R5, ADR 0005).
  const {
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search,
    navigate,
    pagination: { defaultPage: 1, defaultPageSize: 10 },
    globalFilter: { enabled: false },
    columnFilters: [{ columnId: 'status', searchKey: 'status', type: 'array' }],
  })

  const emailInput =
    (columnFilters.find((f) => f.id === 'email')?.value as string) ?? ''
  const email = useDebouncedValue(emailInput, 300)
  const status =
    (columnFilters.find((f) => f.id === 'status')?.value as UserStatus[]) ?? []

  const params = toUsersListParams({ pagination, status, email })
  const q = useQuery(usersListQueryOptions(params, api))
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
    state: { pagination, columnFilters, columnVisibility },
    getRowId: (row) => row.id,
    onPaginationChange,
    onColumnFiltersChange,
    onColumnVisibilityChange: setColumnVisibility,
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

  const filtered = email.trim() !== '' || status.length > 0
  const rows = table.getRowModel().rows

  return (
    <div
      className={cn(
        'max-sm:has-[div[role="toolbar"]]:mb-16', // Add margin bottom to the table on mobile when the toolbar is visible
        'flex flex-1 flex-col gap-4'
      )}
    >
      <DataTableToolbar
        table={table}
        searchPlaceholder='Filter by email...'
        searchKey='email'
        filters={[
          { columnId: 'status', title: 'Status', options: statusOptions },
        ]}
      />
      <div className='overflow-hidden rounded-md border'>
        <Table aria-busy={q.isFetching}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className='group/row'>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className={cn(
                        'bg-background group-hover/row:bg-muted',
                        header.column.columnDef.meta?.className,
                        header.column.columnDef.meta?.thClassName
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {view.status === 'pending' ? (
              <MessageRow>
                <span role='status'>Loading users…</span>
              </MessageRow>
            ) : view.status === 'error' ? (
              <MessageRow>
                <div role='alert' className='space-y-2'>
                  <p>Couldn&apos;t load users.</p>
                  <Button size='sm' onClick={() => void q.refetch()}>
                    Retry
                  </Button>
                </div>
              </MessageRow>
            ) : rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id} className='group/row'>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        'bg-background group-hover/row:bg-muted',
                        cell.column.columnDef.meta?.className,
                        cell.column.columnDef.meta?.tdClassName
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <MessageRow>
                {filtered ? 'No users match these filters.' : 'No users yet.'}
              </MessageRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} className='mt-auto' />
    </div>
  )
}

function MessageRow({ children }: { children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={columns.length} className='h-24 text-center'>
        {children}
      </TableCell>
    </TableRow>
  )
}
