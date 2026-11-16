import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { type Row } from '@tanstack/react-table'
import { Download, Pencil, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Can } from '@/components/permissions/can'
import { type Report } from '../data/schema'
import { canDownload } from '../lib/csv'
import { useReports } from './reports-provider'

type ReportsRowActionsProps = {
  row: Row<Report>
}

export function ReportsRowActions({ row }: ReportsRowActionsProps) {
  const { setOpen, setCurrentRow, runReport, downloadReport } = useReports()
  const report = row.original
  const isRunning = report.status === 'running'

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
        >
          <DotsHorizontalIcon className='h-4 w-4' aria-hidden='true' />
          <span className='sr-only'>Actions for {report.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-44'>
        <Can action='reports.update'>
          <DropdownMenuItem
            onClick={() => {
              setCurrentRow(report)
              setOpen('edit')
            }}
          >
            Edit
            <DropdownMenuShortcut>
              <Pencil size={16} aria-hidden='true' />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </Can>
        <Can action='reports.run'>
          <DropdownMenuItem
            disabled={isRunning}
            onClick={() => runReport(report.id)}
          >
            Run now
            <DropdownMenuShortcut>
              <Play size={16} aria-hidden='true' />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </Can>
        <Can action='reports.export'>
          <DropdownMenuItem
            disabled={!canDownload(report)}
            onClick={() => downloadReport(report)}
          >
            Download
            <DropdownMenuShortcut>
              <Download size={16} aria-hidden='true' />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </Can>
        <Can action='reports.delete'>
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isRunning}
              onClick={() => {
                setCurrentRow(report)
                setOpen('delete')
              }}
              variant='destructive'
            >
              Delete
              <DropdownMenuShortcut>
                <Trash2 size={16} aria-hidden='true' />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        </Can>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
