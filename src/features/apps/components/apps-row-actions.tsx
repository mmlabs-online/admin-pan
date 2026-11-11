import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { Ban, CircleCheck, Eye, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type App } from '../data/schema'
import { useApps } from './apps-provider'

export function AppsRowActions({ app }: { app: App }) {
  const { setOpen, setCurrentId } = useApps()
  const openDialog = (type: 'view' | 'edit' | 'status') => {
    setCurrentId(app.id)
    setOpen(type)
  }

  return (
    <div className='flex items-center justify-end gap-1'>
      <Button
        variant='ghost'
        size='sm'
        className='h-8'
        aria-label={`View ${app.key}`}
        onClick={() => openDialog('view')}
      >
        <Eye className='size-4' />
        View
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          >
            <DotsHorizontalIcon className='h-4 w-4' />
            <span className='sr-only'>Open actions for {app.key}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-40'>
          {/* admin:apps:write (planned name) */}
          <DropdownMenuItem onClick={() => openDialog('edit')}>
            Edit
            <DropdownMenuShortcut>
              <Pencil size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* admin:apps:write (planned name) */}
          <DropdownMenuItem
            onClick={() => openDialog('status')}
            className={app.status === 'active' ? 'text-red-500!' : undefined}
          >
            {app.status === 'active' ? 'Disable' : 'Enable'}
            <DropdownMenuShortcut>
              {app.status === 'active' ? (
                <Ban size={16} />
              ) : (
                <CircleCheck size={16} />
              )}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
