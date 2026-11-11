import { useEffect, useMemo, useState } from 'react'
import {
  type FilterFn,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { DataTablePagination, DataTableToolbar } from '@/components/data-table'
import { useAccessData } from '../data/access-store'
import { joinPolicyOptions } from '../data/data'
import { type AppRow, appsColumns as columns } from './apps-columns'
import { DataTableView } from './data-table-view'

type AppsTableProps = {
  search: Record<string, unknown>
  navigate: NavigateFn
}

const keyOrNameFilter: FilterFn<AppRow> = (row, _columnId, value: string) => {
  const needle = value.trim().toLowerCase()
  if (!needle) return true
  return (
    row.original.key.toLowerCase().includes(needle) ||
    row.original.name.toLowerCase().includes(needle)
  )
}

export function AppsTable({ search, navigate }: AppsTableProps) {
  const { apps, app_member_counts } = useAccessData()
  const data = useMemo<AppRow[]>(
    () =>
      apps.map((app) => ({
        ...app,
        member_count: app_member_counts[app.id] ?? 0,
      })),
    [apps, app_member_counts]
  )

  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const {
    globalFilter,
    onGlobalFilterChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search,
    navigate,
    pagination: { defaultPage: 1, defaultPageSize: 10 },
    globalFilter: { enabled: true, key: 'filter' },
    columnFilters: [
      { columnId: 'join_policy', searchKey: 'join_policy', type: 'array' },
    ],
  })

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    getRowId: (row) => row.id,
    globalFilterFn: keyOrNameFilter,
    onGlobalFilterChange,
    onPaginationChange,
    onColumnFiltersChange,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  useEffect(() => {
    ensurePageInRange(table.getPageCount())
  }, [table, ensurePageInRange])

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Search apps by key or name...'
        filters={[
          {
            columnId: 'join_policy',
            title: 'Join policy',
            options: joinPolicyOptions,
          },
        ]}
      />
      <DataTableView table={table} emptyText='No apps found.' />
      <DataTablePagination table={table} className='mt-auto' />
    </div>
  )
}
