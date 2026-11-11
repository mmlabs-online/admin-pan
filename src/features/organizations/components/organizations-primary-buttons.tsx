import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOrganizations } from './organizations-provider'

export function OrganizationsPrimaryButtons() {
  const { setOpen } = useOrganizations()
  return (
    // admin:orgs:write (planned name)
    <Button className='space-x-1' onClick={() => setOpen('create')}>
      <span>New organization</span> <Plus size={18} aria-hidden='true' />
    </Button>
  )
}
