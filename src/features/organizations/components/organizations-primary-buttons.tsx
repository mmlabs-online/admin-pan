import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Can } from '@/components/permissions/can'
import { useOrganizations } from './organizations-provider'

export function OrganizationsPrimaryButtons() {
  const { setOpen } = useOrganizations()
  return (
    <Can action='organizations.create' disable>
      {({ disabled, describedBy }) => (
        <Button
          className='space-x-1'
          disabled={disabled}
          aria-describedby={describedBy}
          onClick={() => setOpen('create')}
        >
          <span>New organization</span> <Plus size={18} aria-hidden='true' />
        </Button>
      )}
    </Can>
  )
}
