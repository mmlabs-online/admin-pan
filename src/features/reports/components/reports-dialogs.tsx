import { useDelayedRowClear } from '@/hooks/use-delayed-row-clear'
import { ReportsActionDialog } from './reports-action-dialog'
import { ReportsDeleteDialog } from './reports-delete-dialog'
import { useReports } from './reports-provider'

export function ReportsDialogs() {
  const {
    open,
    setOpen,
    currentRow,
    setCurrentRow,
    createReport,
    updateReport,
    deleteReport,
  } = useReports()

  const scheduleClear = useDelayedRowClear(open, () => setCurrentRow(null))
  const closeWithRow = () => {
    setOpen(null)
    scheduleClear()
  }

  return (
    <>
      <ReportsActionDialog
        key='report-create'
        open={open === 'create'}
        onOpenChange={(next) => {
          if (!next) setOpen(null)
        }}
        onSubmit={createReport}
      />

      {currentRow && (
        <>
          <ReportsActionDialog
            key={`report-edit-${currentRow.id}`}
            open={open === 'edit'}
            onOpenChange={closeWithRow}
            currentRow={currentRow}
            onSubmit={(values) => updateReport(currentRow.id, values)}
          />

          <ReportsDeleteDialog
            key={`report-delete-${currentRow.id}`}
            open={open === 'delete'}
            onOpenChange={closeWithRow}
            currentRow={currentRow}
            onConfirm={deleteReport}
          />
        </>
      )}
    </>
  )
}
