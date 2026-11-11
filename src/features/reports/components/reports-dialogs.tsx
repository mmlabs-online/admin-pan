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

  const closeWithRow = (type: 'edit' | 'delete') => () => {
    setOpen(type)
    setTimeout(() => setCurrentRow(null), 500)
  }

  return (
    <>
      <ReportsActionDialog
        key='report-create'
        open={open === 'create'}
        onOpenChange={() => setOpen('create')}
        onSubmit={createReport}
      />

      {currentRow && (
        <>
          <ReportsActionDialog
            key={`report-edit-${currentRow.id}`}
            open={open === 'edit'}
            onOpenChange={closeWithRow('edit')}
            currentRow={currentRow}
            onSubmit={(values) => updateReport(currentRow.id, values)}
          />

          <ReportsDeleteDialog
            key={`report-delete-${currentRow.id}`}
            open={open === 'delete'}
            onOpenChange={closeWithRow('delete')}
            currentRow={currentRow}
            onConfirm={deleteReport}
          />
        </>
      )}
    </>
  )
}
