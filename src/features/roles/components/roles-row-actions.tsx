import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { Pencil, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type Role } from '@/features/apps/data/schema'
import { useRoles } from './roles-provider'

export function RolesRowActions({ role }: { role: Role }) {
  const { setOpen, setCurrentId } = useRoles()
  const openDialog = (type: 'edit' | 'delete' | 'assignments') => {
    setCurrentId(role.id)
    setOpen(type)
  }

  return (
    <div className='flex items-center justify-end gap-1'>
      <Button
        variant='ghost'
        size='sm'
        className='h-8'
        aria-label={`Assignments of ${role.key}`}
        onClick={() => openDialog('assignments')}
      >
        <Users className='size-4' />
        Assignments
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          >
            <DotsHorizontalIcon className='h-4 w-4' />
            <span className='sr-only'>Open actions for {role.key}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-48'>
          {/* admin:apps:write (planned name) */}
          <DropdownMenuItem onClick={() => openDialog('edit')}>
            Edit
            <DropdownMenuShortcut>
              <Pencil size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* admin:apps:write (planned name); system roles cannot be deleted */}
          <DropdownMenuItem
            disabled={role.is_system}
            onClick={() => openDialog('delete')}
            className='text-red-500!'
          >
            {role.is_system ? 'System role' : 'Delete'}
            <DropdownMenuShortcut>
              <Trash2 size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
