import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { type Row } from '@tanstack/react-table'
import { Ban, CircleCheck, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type Organization } from '../data/schema'
import { useOrganizations } from './organizations-provider'

type DataTableRowActionsProps = {
  row: Row<Organization>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const { setOpen, setCurrentRow } = useOrganizations()
  const org = row.original
  const isSuspended = org.status === 'suspended'

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          aria-label={`Actions for ${org.name}`}
        >
          <DotsHorizontalIcon className='h-4 w-4' aria-hidden='true' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-44'>
        {/* admin:orgs:write (planned name) */}
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(org)
            setOpen('edit')
          }}
        >
          Edit
          <DropdownMenuShortcut>
            <Pencil size={16} aria-hidden='true' />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* admin:orgs:write (planned name) */}
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(org)
            setOpen('status')
          }}
        >
          {isSuspended ? 'Reactivate' : 'Suspend'}
          <DropdownMenuShortcut>
            {isSuspended ? (
              <CircleCheck size={16} aria-hidden='true' />
            ) : (
              <Ban size={16} aria-hidden='true' />
            )}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* admin:orgs:delete (planned name) */}
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(org)
            setOpen('delete')
          }}
          className='text-red-500!'
        >
          Delete
          <DropdownMenuShortcut>
            <Trash2 size={16} aria-hidden='true' />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
