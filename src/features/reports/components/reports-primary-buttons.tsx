import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Can } from '@/components/permissions/can'
import { useReports } from './reports-provider'

export function ReportsPrimaryButtons() {
  const { setOpen } = useReports()
  return (
    <Can action='reports.create' disable>
      {({ disabled, describedBy }) => (
        <Button
          className='space-x-1'
          disabled={disabled}
          aria-describedby={describedBy}
          onClick={() => setOpen('create')}
        >
          <span>New report</span> <Plus size={18} aria-hidden='true' />
        </Button>
      )}
    </Can>
  )
}
