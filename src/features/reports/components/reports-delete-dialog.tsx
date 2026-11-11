import { AlertTriangle } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type Report } from '../data/schema'

type ReportsDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Report
  onConfirm: (id: string) => void
}

// admin:reports:delete (planned name)
export function ReportsDeleteDialog({
  open,
  onOpenChange,
  currentRow,
  onConfirm,
}: ReportsDeleteDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={() => {
        onConfirm(currentRow.id)
        onOpenChange(false)
      }}
      title={
        <span className='text-destructive'>
          <AlertTriangle
            className='me-1 inline-block stroke-destructive'
            size={18}
            aria-hidden='true'
          />{' '}
          Delete report
        </span>
      }
      desc={
        <p>
          Are you sure you want to delete the report{' '}
          <span className='font-bold'>{currentRow.name}</span>? Its definition,
          schedule and past runs will be removed. This cannot be undone.
        </p>
      }
      confirmText='Delete'
      destructive
    />
  )
}
