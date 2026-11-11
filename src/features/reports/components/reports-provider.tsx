import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import useDialogState from '@/hooks/use-dialog-state'
import { reports as mockReports } from '../data/reports'
import { ALL_APPS, type Report, type ReportFormValues } from '../data/schema'
import {
  buildCsv,
  buildReportRows,
  canDownload,
  downloadCsv,
  reportFileName,
} from '../lib/csv'

type ReportsDialogType = 'create' | 'edit' | 'delete'

/** Signed-in staff email; mock until auth-client is wired in. */
export const CURRENT_USER_EMAIL = 'you@mmlabs.online'

type ReportsContextType = {
  reports: Report[]
  open: ReportsDialogType | null
  setOpen: (str: ReportsDialogType | null) => void
  currentRow: Report | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Report | null>>
  createReport: (values: ReportFormValues) => void
  updateReport: (id: string, values: ReportFormValues) => void
  deleteReport: (id: string) => void
  runReport: (id: string) => void
  downloadReport: (report: Report) => void
}

const ReportsContext = React.createContext<ReportsContextType | null>(null)

const toParams = (values: ReportFormValues): Report['params'] => ({
  ...(values.app_key && values.app_key !== ALL_APPS
    ? { app_key: values.app_key }
    : {}),
  date_from: values.date_from,
  date_to: values.date_to,
})

type ReportsProviderProps = {
  children: React.ReactNode
  /** Initial data; defaults to the mock reports. */
  initialReports?: Report[]
  /** Simulated run duration in ms. */
  runDelayMs?: number
}

export function ReportsProvider({
  children,
  initialReports = mockReports,
  runDelayMs = 1500,
}: ReportsProviderProps) {
  const [reports, setReports] = useState<Report[]>(initialReports)
  const [open, setOpen] = useDialogState<ReportsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<Report | null>(null)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  // admin:reports:write (planned name)
  const createReport = useCallback((values: ReportFormValues) => {
    const report: Report = {
      id: crypto.randomUUID(),
      name: values.name,
      type: values.type,
      params: toParams(values),
      format: values.format,
      schedule: values.schedule,
      status: values.schedule === 'none' ? 'ready' : 'scheduled',
      last_run_at: null,
      row_count: null,
      created_by: CURRENT_USER_EMAIL,
      created_at: new Date().toISOString(),
    }
    setReports((prev) => [report, ...prev])
    toast.success(`Report "${report.name}" created.`)
  }, [])

  // admin:reports:write (planned name)
  const updateReport = useCallback((id: string, values: ReportFormValues) => {
    setReports((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              name: values.name,
              type: values.type,
              params: toParams(values),
              format: values.format,
              schedule: values.schedule,
            }
          : r
      )
    )
    toast.success(`Report "${values.name}" updated.`)
  }, [])

  // admin:reports:delete (planned name)
  const deleteReport = useCallback(
    (id: string) => {
      const target = reports.find((r) => r.id === id)
      setReports((prev) => prev.filter((r) => r.id !== id))
      if (target) toast.success(`Report "${target.name}" deleted.`)
    },
    [reports]
  )

  // admin:reports:run (planned name)
  const runReport = useCallback(
    (id: string) => {
      const target = reports.find((r) => r.id === id)
      if (!target || target.status === 'running') return
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'running' } : r))
      )
      toast.info(`Report "${target.name}" is running.`)
      const timer = setTimeout(() => {
        timers.current.delete(timer)
        setReports((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: 'ready',
                  last_run_at: new Date().toISOString(),
                  row_count: Math.floor(Math.random() * 5000) + 10,
                }
              : r
          )
        )
        toast.success(`Report "${target.name}" is ready to download.`)
      }, runDelayMs)
      timers.current.add(timer)
    },
    [reports, runDelayMs]
  )

  // admin:reports:read (planned name) — export endpoint
  const downloadReport = useCallback((report: Report) => {
    if (!canDownload(report)) return
    const { columns, rows } = buildReportRows(report)
    downloadCsv(reportFileName(report), buildCsv(columns, rows))
    if (report.format === 'xlsx') {
      toast.info(
        'Downloaded as CSV. XLSX export will be available with the reports API.'
      )
    } else {
      toast.success(`Downloaded "${report.name}".`)
    }
  }, [])

  return (
    <ReportsContext
      value={{
        reports,
        open,
        setOpen,
        currentRow,
        setCurrentRow,
        createReport,
        updateReport,
        deleteReport,
        runReport,
        downloadReport,
      }}
    >
      {children}
    </ReportsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useReports = () => {
  const ctx = React.useContext(ReportsContext)
  if (!ctx) {
    throw new Error('useReports has to be used within <ReportsProvider>')
  }
  return ctx
}
