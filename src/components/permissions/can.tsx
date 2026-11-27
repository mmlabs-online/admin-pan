import { useId } from 'react'
import { ACTIONS, type ActionId } from '@/lib/permissions/registry'
import { useActionPermission } from '@/context/permission-provider'

type CanProps =
  | {
      action: ActionId | readonly ActionId[]
      fallback?: React.ReactNode
      disable?: false
      children: React.ReactNode
    }
  | {
      action: ActionId
      disable: true
      children: (state: {
        disabled: boolean
        describedBy: string | undefined
      }) => React.ReactNode
    }

/**
 * Hides (default) or disables (`disable`) a control when the permission is
 * denied. Advisory only: `unknown` renders the control, the API is the gate.
 */
export function Can(props: CanProps) {
  const id = useId()
  const state = useActionPermission(props.action)
  const denied = state === 'denied'

  if (props.disable) {
    const req = ACTIONS[props.action]
    return (
      <>
        {props.children({
          disabled: denied,
          describedBy: denied ? id : undefined,
        })}
        {denied && (req.kind === 'permission' || req.kind === 'super') && (
          <span id={id} className='text-sm text-muted-foreground'>
            Requires {req.kind === 'super' ? 'admin:*' : req.permission}
          </span>
        )}
      </>
    )
  }
  return denied ? (props.fallback ?? null) : props.children
}
