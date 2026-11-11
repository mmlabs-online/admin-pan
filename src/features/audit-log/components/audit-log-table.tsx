import { useEffect, useMemo, useState } from 'react'
import { Cross2Icon } from '@radix-ui/react-icons'
import {
  type SortingState,
  type Table as TanstackTable,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination } from '@/components/data-table'
import { DataTableFacetedFilter } from '@/components/data-table/faceted-filter'
import { DatePicker } from '@/components/date-picker'
import { actionOptions, appOptions, targetTypeOptions } from '../data/data'
import { type AuditLogEntry } from '../data/schema'
import { filterByDateRange, formatDay, parseDay, toCsv } from '../lib/format'
import { getAuditLogColumns } from './audit-log-columns'
import { AuditLogDetailSheet } from './audit-log-detail-sheet'

type AuditLogTableProps = {
  data: AuditLogEntry[]
  search: Record<string, unknown>
  navigate: NavigateFn
}

const asDay = (value: unknown) =>
  typeof value === 'string' && parseDay(value) ? value : undefined

export function AuditLogTable({ data, search, navigate }: AuditLogTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'occurred_at', desc: true },
  ])
  const [selected, setSelected] = useState<AuditLogEntry | null>(null)

  const from = asDay(search.from)
  const to = asDay(search.to)
  const rangedData = useMemo(
    () => filterByDateRange(data, from, to),
    [data, from, to]
  )
  const columns = useMemo(() => getAuditLogColumns(setSelected), [])

  // Keys/defaults mirror the audit-log route search schema.
  const {
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search,
    navigate,
    pagination: { defaultPage: 1, defaultPageSize: 20 },
    globalFilter: { enabled: false },
    columnFilters: [
      { columnId: 'actor', searchKey: 'actor', type: 'string' },
      { columnId: 'action', searchKey: 'action', type: 'array' },
      { columnId: 'target_type', searchKey: 'targetType', type: 'array' },
      { columnId: 'app_key', searchKey: 'app', type: 'array' },
    ],
  })

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rangedData,
    columns,
    state: { sorting, pagination, columnFilters },
    onPaginationChange,
    onColumnFiltersChange,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getRowId: (row) => row.id,
  })

  useEffect(() => {
    ensurePageInRange(table.getPageCount())
  }, [table, ensurePageInRange])

  const setDay = (key: 'from' | 'to', date: Date | undefined) =>
    navigate({
      search: (prev) => ({
        ...prev,
        page: undefined,
        [key]: date ? formatDay(date) : undefined,
      }),
    })

  const isFiltered = columnFilters.length > 0 || !!from || !!to
  const resetAll = () => {
    table.resetColumnFilters()
    navigate({
      search: (prev) => ({
        ...prev,
        page: undefined,
        from: undefined,
        to: undefined,
      }),
    })
  }

  const filteredCount = table.getFilteredRowModel().rows.length

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <div
        role='search'
        aria-label='Filter audit log'
        className='flex flex-wrap items-end gap-2'
      >
        <div className='flex flex-col gap-1'>
          <Label htmlFor='audit-actor-filter' className='text-xs'>
            Actor
          </Label>
          <Input
            id='audit-actor-filter'
            placeholder='Email, user ID or "system"'
            value={(table.getColumn('actor')?.getFilterValue() as string) ?? ''}
            onChange={(event) =>
              table.getColumn('actor')?.setFilterValue(event.target.value)
            }
            className='h-8 w-56'
          />
        </div>
        <DateFilter
          label='From'
          value={from}
          onChange={(d) => setDay('from', d)}
        />
        <DateFilter label='To' value={to} onChange={(d) => setDay('to', d)} />
        <div className='flex flex-wrap gap-2'>
          <DataTableFacetedFilter
            column={table.getColumn('action')}
            title='Action'
            options={actionOptions}
          />
          <DataTableFacetedFilter
            column={table.getColumn('target_type')}
            title='Target type'
            options={targetTypeOptions}
          />
          <DataTableFacetedFilter
            column={table.getColumn('app_key')}
            title='App'
            options={appOptions}
          />
        </div>
        {isFiltered && (
          <Button
            variant='ghost'
            onClick={resetAll}
            className='h-8 px-2 lg:px-3'
          >
            Reset
            <Cross2Icon className='ms-2 h-4 w-4' aria-hidden='true' />
          </Button>
        )}
        <Button
          variant='outline'
          size='sm'
          className='ms-auto h-8'
          disabled={filteredCount === 0}
          onClick={() => downloadCsv(table)}
        >
          <Download aria-hidden='true' className='size-4' />
          Export CSV
        </Button>
      </div>

      <p role='status' className='sr-only'>
        {filteredCount} matching entries
      </p>

      <div className='overflow-hidden rounded-md border'>
        <Table aria-label='Audit log entries'>
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
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn('cursor-pointer')}
                  onClick={() => setSelected(row.original)}
                >
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
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center'
                >
                  No audit entries match these filters.
                </TableCell>
              </TableRow>
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

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | undefined
  onChange: (date: Date | undefined) => void
}) {
  const labelId = `audit-date-${label.toLowerCase()}`
  return (
    <div role='group' aria-labelledby={labelId} className='flex flex-col gap-1'>
      <span id={labelId} className='text-xs font-medium'>
        {label} date
      </span>
      <div className='flex items-center gap-1 [&>button]:h-8 [&>button:first-child]:w-40'>
        <DatePicker
          selected={parseDay(value)}
          onSelect={onChange}
          placeholder={`${label} date`}
        />
        {value && (
          <Button
            variant='ghost'
            size='icon'
            className='size-8'
            aria-label={`Clear ${label.toLowerCase()} date`}
            onClick={() => onChange(undefined)}
          >
            <Cross2Icon aria-hidden='true' />
          </Button>
        )}
      </div>
    </div>
  )
}

function downloadCsv(table: TanstackTable<AuditLogEntry>) {
  const rows = table.getPrePaginationRowModel().rows.map((r) => r.original)
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-log-${formatDay(new Date())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
