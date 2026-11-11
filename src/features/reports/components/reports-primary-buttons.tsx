import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useReports } from './reports-provider'

export function ReportsPrimaryButtons() {
  const { setOpen } = useReports()
  return (
    // admin:reports:write (planned name)
    <Button className='space-x-1' onClick={() => setOpen('create')}>
      <span>New report</span> <Plus size={18} aria-hidden='true' />
    </Button>
  )
}
