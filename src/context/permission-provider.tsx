/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react'
import {
  ACTIONS,
  type ActionId,
  type Requirement,
} from '@/lib/permissions/registry'
import {
  evaluate,
  evaluateAll,
  unknownPermissionSource,
  type PermissionSource,
  type PermissionState,
} from '@/lib/permissions/source'

const PermissionContext = createContext<PermissionSource>(
  unknownPermissionSource
)

/** Holds no state and persists nothing; PAN-011b supplies a real source. */
export function PermissionProvider({
  source = unknownPermissionSource,
  children,
}: {
  source?: PermissionSource
  children: React.ReactNode
}) {
  return <PermissionContext value={source}>{children}</PermissionContext>
}

export function usePermissionSource(): PermissionSource {
  return useContext(PermissionContext)
}

export function usePermission(requirement: Requirement): PermissionState {
  return evaluate(requirement, useContext(PermissionContext))
}

export function useActionPermission(
  action: ActionId | readonly ActionId[]
): PermissionState {
  const source = useContext(PermissionContext)
  const ids = typeof action === 'string' ? [action] : action
  return evaluateAll(
    ids.map((id) => ACTIONS[id]),
    source
  )
}
