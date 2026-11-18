import { Badge } from '@/components/ui/badge'
import { type RoleDefinition } from '../data/role-schema'
import { useRoles } from './roles-provider'

export function RoleNameCell({ role }: { role: RoleDefinition }) {
  const { app } = useRoles()
  return (
    <span className='flex flex-wrap items-center gap-1'>
      {role.name}
      {role.is_system && <Badge variant='secondary'>System</Badge>}
      {role.is_default && <Badge variant='secondary'>Default</Badge>}
      {app?.org_owner_role_id === role.id && (
        <Badge variant='secondary'>Org owner</Badge>
      )}
    </span>
  )
}
