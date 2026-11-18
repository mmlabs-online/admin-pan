import { ForbiddenPanel } from '@/components/forbidden-panel'
import { type AppAlert } from '@/features/apps/data/errors'

/** An API failure as text (R6): the 403 panel, or a `role=alert` message. */
export function RoleAlertView({
  alert,
  id,
}: {
  alert: AppAlert | null
  id?: string
}) {
  if (!alert) return null
  return (
    <div id={id}>
      {alert.kind === 'forbidden' ? (
        <ForbiddenPanel variant='inline' copy={alert.copy} />
      ) : (
        <p role='alert' className='text-sm text-destructive'>
          {alert.text}
        </p>
      )}
    </div>
  )
}
