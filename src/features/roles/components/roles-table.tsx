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
import { DataTableView } from '@/features/apps/components/data-table-view'
import { useAccessData } from '@/features/apps/data/access-store'
import { type RoleRow, rolesColumns as columns } from './roles-columns'

type RolesTableProps = {
  search: Record<string, unknown>
  navigate: NavigateFn
}

const keyOrNameFilter: FilterFn<RoleRow> = (row, _columnId, value: string) => {
  const needle = value.trim().toLowerCase()
  if (!needle) return true
  return (
    row.original.key.toLowerCase().includes(needle) ||
    row.original.name.toLowerCase().includes(needle)
  )
}

export function RolesTable({ search, navigate }: RolesTableProps) {
  const { apps, roles, role_permissions, role_assignments } = useAccessData()

  const data = useMemo<RoleRow[]>(() => {
    const appById = new Map(apps.map((a) => [a.id, a]))
    const count = (items: { role_id: string }[], id: string) =>
      items.filter((i) => i.role_id === id).length
    return roles.map((role) => {
      const app = appById.get(role.app_id)
      return {
        ...role,
        app_key: app?.key ?? '—',
        is_default: app?.default_role_id === role.id,
        permission_count: count(role_permissions, role.id),
        assignment_count: count(role_assignments, role.id),
      }
    })
  }, [apps, roles, role_permissions, role_assignments])

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
    columnFilters: [{ columnId: 'app', searchKey: 'app', type: 'array' }],
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
        searchPlaceholder='Search roles by key or name...'
        filters={[
          {
            columnId: 'app',
            title: 'App',
            options: apps.map((a) => ({ label: a.key, value: a.key })),
          },
        ]}
      />
      <DataTableView table={table} emptyText='No roles found.' />
      <DataTablePagination table={table} className='mt-auto' />
    </div>
  )
}
