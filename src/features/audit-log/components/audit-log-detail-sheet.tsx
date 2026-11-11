import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { actionBadgeClass } from '../data/data'
import { type AuditLogEntry } from '../data/schema'
import { actorLabel, diffChanges, formatJson } from '../lib/format'
import { formatTimestamp } from './audit-log-columns'

type Props = {
  entry: AuditLogEntry | null
  onOpenChange: (open: boolean) => void
}

const diffLineClass = {
  added: 'bg-teal-100/40 text-teal-900 dark:bg-teal-900/30 dark:text-teal-100',
  removed:
    'bg-destructive/10 text-destructive dark:bg-destructive/30 dark:text-red-100',
  unchanged: 'text-muted-foreground',
} as const

async function copyRequestId(requestId: string) {
  try {
    await navigator.clipboard.writeText(requestId)
    toast.success('Request ID copied')
  } catch {
    toast.error('Could not copy the request ID')
  }
}

export function AuditLogDetailSheet({ entry, onOpenChange }: Props) {
  return (
    <Sheet open={entry !== null} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
        {entry && <DetailBody entry={entry} />}
      </SheetContent>
    </Sheet>
  )
}

function DetailBody({ entry }: { entry: AuditLogEntry }) {
  const diff = diffChanges(entry.changes)
  const fields: [string, string][] = [
    ['ID', entry.id],
    ['Time', `${formatTimestamp(entry.occurred_at)} (${entry.occurred_at})`],
    ['Actor', actorLabel(entry)],
    ['Actor user ID', entry.actor_user_id ?? '—'],
    ['Target type', entry.target_type],
    ['Target ID', entry.target_id],
    ['App', entry.app_key ?? '—'],
    ['Organization ID', entry.org_id ?? '—'],
    ['IP', entry.ip],
    ['User agent', entry.user_agent],
  ]

  return (
    <>
      <SheetHeader className='pe-10'>
        <SheetTitle className='flex flex-wrap items-center gap-2'>
          Audit entry
          <Badge
            variant='outline'
            className={cn('font-mono', actionBadgeClass(entry.action))}
          >
            {entry.action}
          </Badge>
        </SheetTitle>
        <SheetDescription>
          {formatTimestamp(entry.occurred_at)} by {actorLabel(entry)}
        </SheetDescription>
      </SheetHeader>

      <div className='flex flex-col gap-6 px-4 pb-6'>
        <dl className='grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm'>
          {fields.map(([label, value]) => (
            <div key={label} className='contents'>
              <dt className='text-muted-foreground'>{label}</dt>
              <dd className='font-mono text-xs break-all'>{value}</dd>
            </div>
          ))}
          <div className='contents'>
            <dt className='text-muted-foreground'>Request ID</dt>
            <dd className='flex flex-wrap items-center gap-2'>
              <span className='font-mono text-xs break-all'>
                {entry.request_id}
              </span>
              <Button
                variant='outline'
                size='sm'
                className='h-7'
                onClick={() => copyRequestId(entry.request_id)}
              >
                <Copy aria-hidden='true' className='size-3.5' />
                Copy request ID
              </Button>
            </dd>
          </div>
        </dl>

        <section aria-labelledby='audit-changes-heading' className='space-y-3'>
          <h3 id='audit-changes-heading' className='font-semibold'>
            Changes
          </h3>
          {entry.changes ? (
            <>
              <div>
                <h4
                  id='audit-diff-heading'
                  className='mb-1 text-sm font-medium'
                >
                  Diff
                </h4>
                <pre
                  aria-labelledby='audit-diff-heading'
                  className='overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs'
                >
                  {diff.map((line, i) => (
                    <span
                      key={i}
                      className={cn('block', diffLineClass[line.kind])}
                    >
                      {line.text}
                    </span>
                  ))}
                </pre>
              </div>
              <div className='grid gap-3 sm:grid-cols-2'>
                <div>
                  <h4
                    id='audit-before-heading'
                    className='mb-1 text-sm font-medium'
                  >
                    Before
                  </h4>
                  <pre
                    aria-labelledby='audit-before-heading'
                    className='overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs'
                  >
                    {formatJson(entry.changes.before)}
                  </pre>
                </div>
                <div>
                  <h4
                    id='audit-after-heading'
                    className='mb-1 text-sm font-medium'
                  >
                    After
                  </h4>
                  <pre
                    aria-labelledby='audit-after-heading'
                    className='overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs'
                  >
                    {formatJson(entry.changes.after)}
                  </pre>
                </div>
              </div>
            </>
          ) : (
            <p className='text-sm text-muted-foreground'>
              No changes recorded for this event.
            </p>
          )}
        </section>
      </div>
    </>
  )
}
