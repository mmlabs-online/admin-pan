import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAccessData } from '../data/access-store'
import { type App } from '../data/schema'

export function AppRolesTab({ app }: { app: App }) {
  const { roles, role_permissions } = useAccessData()
  const appRoles = useMemo(
    () => roles.filter((r) => r.app_id === app.id),
    [roles, app.id]
  )

  if (!appRoles.length) {
    return (
      <p className='pt-2 text-sm text-muted-foreground'>
        This app has no roles yet.
      </p>
    )
  }

  return (
    <div className='space-y-2 pt-2'>
      <p className='text-sm text-muted-foreground'>
        Manage roles on the Roles page.
      </p>
      <div className='overflow-hidden rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className='text-end'>Permissions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appRoles.map((role) => (
              <TableRow key={role.id}>
                <TableCell className='font-mono text-sm'>{role.key}</TableCell>
                <TableCell>
                  <div className='flex flex-wrap items-center gap-1'>
                    {role.name}
                    {role.id === app.default_role_id && <Badge>Default</Badge>}
                    {role.is_system && (
                      <Badge variant='secondary'>System</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className='text-end'>
                  {
                    role_permissions.filter((rp) => rp.role_id === role.id)
                      .length
                  }
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
