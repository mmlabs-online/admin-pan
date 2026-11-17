import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { getApi, isApiError, type ApiClient } from '@/api'
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
import { auditLogsQueryOptions, toAuditListParams } from '../api/queries'
import { type AuditLogEntry } from '../data/schema'
import { auditLogSearchSchema } from '../data/search'
import { isRangeInverted } from '../lib/format'
import { getAuditLogColumns } from './audit-log-columns'
import { AuditLogDetailSheet } from './audit-log-detail-sheet'
import { AuditLogFilters } from './audit-log-filters'

type AuditLogTableProps = {
  search: Record<string, unknown>
  navigate: NavigateFn
  /** Injected client (tests only). */
  api?: ApiClient
}

const RESET_KEYS = [
  'action',
  'targetType',
  'actorKind',
  'outcome',
  'app',
  'actor',
  'target',
  'from',
  'to',
] as const

export function AuditLogTable({
  search: rawSearch,
  navigate,
  api = getApi(),
}: AuditLogTableProps) {
  const [selected, setSelected] = useState<AuditLogEntry | null>(null)
  const columns = useMemo(() => getAuditLogColumns(setSelected), [])
  const search = useMemo(
    () => auditLogSearchSchema.parse(rawSearch),
    [rawSearch]
  )

  // Paging only; the filters are plain URL keys handled by AuditLogFilters.
  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search: rawSearch,
      navigate,
      pagination: { defaultPage: 1, defaultPageSize: 20 },
      globalFilter: { enabled: false },
    })

  const inverted = isRangeInverted(search.from, search.to)
  const params = toAuditListParams({
    ...search,
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
  })
  const q = useQuery({
    ...auditLogsQueryOptions(params, api),
    enabled: !inverted,
  })
  const view = queryView(q)

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: q.data?.items ?? [],
    columns,
    rowCount: q.data?.total ?? 0,
    manualPagination: true,
    manualFiltering: true,
    enableSorting: false,
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

  const resetFilters = () =>
    navigate({
      search: (prev) => ({
        ...prev,
        page: undefined,
        ...Object.fromEntries(RESET_KEYS.map((k) => [k, undefined])),
      }),
    })

  if (view.status === 'forbidden')
    return (
      <ForbiddenPanel
        variant='page'
        copy={view.copy}
        onRetry={() => void q.refetch()}
      />
    )

  const filtered = RESET_KEYS.some((k) => search[k] !== undefined)
  const rows = table.getRowModel().rows
  const emptyCopy = filtered
    ? 'No audit entries match these filters.'
    : 'No audit entries yet.'
  const rejected = view.status === 'error' && isApiError(view.error, 422)
  const status = inverted
    ? ''
    : view.status === 'pending'
      ? 'Loading audit log…'
      : view.status === 'success'
        ? rows.length
          ? `${q.data?.total ?? 0} entries, page ${pagination.pageIndex + 1} of ${Math.max(pageCount, 1)}`
          : emptyCopy
        : ''

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <AuditLogFilters search={search} navigate={navigate} />
      <p role='status' aria-live='polite' className='sr-only'>
        {status}
      </p>
      <div className='overflow-hidden rounded-md border'>
        <Table
          aria-label='Audit log entries'
          aria-busy={view.status === 'pending' && !inverted}
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
            {inverted ? (
              <MessageRow span={columns.length}>
                Fix the date range to load entries.
              </MessageRow>
            ) : view.status === 'pending' ? (
              <MessageRow span={columns.length}>Loading audit log…</MessageRow>
            ) : view.status === 'error' ? (
              <MessageRow span={columns.length}>
                <div role='alert' className='space-y-2'>
                  {rejected ? (
                    <>
                      <p>The API rejected these filters.</p>
                      <Button size='sm' onClick={resetFilters}>
                        Reset
                      </Button>
                    </>
                  ) : (
                    <>
                      <p>Couldn&apos;t load the audit log.</p>
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
              <MessageRow span={columns.length}>{emptyCopy}</MessageRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} className='mt-auto' />

      <AuditLogDetailSheet
        entry={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      />
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
