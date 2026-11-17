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
import {
  actionBadgeClass,
  outcomeBadgeClass,
  outcomeLabels,
} from '../data/data'
import { type AuditLogEntry } from '../data/schema'
import {
  actorDisplay,
  describeChanges,
  formatTimestamp,
  formatValue,
} from '../lib/format'

type Props = {
  entry: AuditLogEntry | null
  onOpenChange: (open: boolean) => void
}

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

const dash = '—'

function DetailBody({ entry }: { entry: AuditLogEntry }) {
  // Every value below is rendered as a React text node (R6).
  const fields: [string, string][] = [
    ['ID', entry.id],
    ['Time', `${formatTimestamp(entry.occurred_at)} (${entry.occurred_at})`],
    ['Actor kind', entry.actor_kind],
    ['Actor', entry.actor_label ?? dash],
    ['Actor user ID', entry.actor_user_id ?? dash],
    ['Target type', entry.target_type ?? dash],
    ['Target ID', entry.target_id ?? dash],
    ['App', entry.app_key ?? dash],
    ['Organization ID', entry.org_id ?? dash],
    ['IP', entry.ip ?? dash],
    ['User agent', entry.user_agent ?? dash],
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
          <Badge variant='outline' className={outcomeBadgeClass(entry.outcome)}>
            {outcomeLabels[entry.outcome] ?? entry.outcome}
          </Badge>
        </SheetTitle>
        <SheetDescription>
          {formatTimestamp(entry.occurred_at)} by {actorDisplay(entry)}
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
          {entry.request_id && (
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
                  onClick={() => void copyRequestId(entry.request_id!)}
                >
                  <Copy aria-hidden='true' className='size-3.5' />
                  Copy request ID
                </Button>
              </dd>
            </div>
          )}
        </dl>
        <ChangesView changes={entry.changes} />
      </div>
    </>
  )
}

const th = 'px-3 py-2 text-start font-medium'
const td = 'px-3 py-2 align-top font-mono text-xs break-all'

function ChangesView({ changes }: { changes: AuditLogEntry['changes'] }) {
  const { diff, values } = describeChanges(changes)
  return (
    <section className='space-y-3'>
      <h3 className='font-semibold'>Changes</h3>
      {changes === null ? (
        <p className='text-sm text-muted-foreground'>
          No changes recorded for this event.
        </p>
      ) : (
        <>
          {diff.length > 0 && (
            <div
              tabIndex={0}
              role='region'
              aria-label='Before and after'
              className='overflow-x-auto rounded-md border focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'
            >
              <table className='w-full text-sm'>
                <caption className='sr-only'>Before and after</caption>
                <thead className='text-muted-foreground'>
                  <tr>
                    <th scope='col' className={th}>
                      Field
                    </th>
                    <th scope='col' className={th}>
                      Before
                    </th>
                    <th scope='col' className={th}>
                      After
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y'>
                  {diff.map((r) => (
                    <tr key={r.field}>
                      <th scope='row' className={cn(th, 'font-mono text-xs')}>
                        {r.field}
                      </th>
                      <td className={td}>{formatValue(r.from)}</td>
                      <td className={td}>{formatValue(r.to)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {values.length > 0 && (
            <div
              tabIndex={0}
              role='region'
              aria-label='Recorded values'
              className='overflow-x-auto rounded-md border focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'
            >
              <table className='w-full text-sm'>
                <caption className='sr-only'>Recorded values</caption>
                <thead className='text-muted-foreground'>
                  <tr>
                    <th scope='col' className={th}>
                      Field
                    </th>
                    <th scope='col' className={th}>
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y'>
                  {values.map((r) => (
                    <tr key={r.field}>
                      <th scope='row' className={cn(th, 'font-mono text-xs')}>
                        {r.field}
                      </th>
                      <td className={td}>{formatValue(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <details>
            <summary className='cursor-pointer text-sm'>Raw JSON</summary>
            <pre
              tabIndex={0}
              role='region'
              aria-label='Raw JSON'
              className='mt-2 overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'
            >
              {JSON.stringify(changes, null, 2)}
            </pre>
          </details>
        </>
      )}
    </section>
  )
}
