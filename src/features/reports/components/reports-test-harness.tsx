import { useState } from 'react'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { type Report } from '../data/schema'
import { ReportsDialogs } from './reports-dialogs'
import { ReportsProvider, useReports } from './reports-provider'
import { ReportsTable } from './reports-table'

type SearchRecord = Record<string, unknown>

function Table() {
  const { reports } = useReports()
  const [search, setSearch] = useState<SearchRecord>({})
  const navigate: NavigateFn = ({ search: next }) =>
    setSearch((prev) =>
      next === true ? prev : typeof next === 'function' ? next(prev) : next
    )
  return <ReportsTable data={reports} search={search} navigate={navigate} />
}

/** Test-only: the reports table + dialogs with URL state kept in memory. */
export function ReportsTestHarness({
  reports,
  runDelayMs = 50,
}: {
  reports: Report[]
  runDelayMs?: number
}) {
  return (
    <ReportsProvider initialReports={reports} runDelayMs={runDelayMs}>
      <Table />
      <ReportsDialogs />
    </ReportsProvider>
  )
}
