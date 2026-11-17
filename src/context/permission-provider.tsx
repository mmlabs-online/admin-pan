/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type ApiClient } from '@/api'
import { useAuth } from '@mmlabs/auth-client/react'
import {
  mePermissionsQueryOptions,
  permissionSourceFrom,
} from '@/lib/permissions/me-permissions'
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

type PermissionContextValue = {
  source: PermissionSource
  /** `user_id` from GET /api/v1/me/permissions; only for disabling self-actions. */
  selfUserId: string | undefined
  refresh: (() => void) | undefined
  refreshing: boolean
}

const PermissionContext = createContext<PermissionContextValue>({
  source: unknownPermissionSource,
  selfUserId: undefined,
  refresh: undefined,
  refreshing: false,
})

/** Holds no state and persists nothing. */
export function PermissionProvider({
  source = unknownPermissionSource,
  selfUserId,
  refresh,
  refreshing = false,
  children,
}: {
  source?: PermissionSource
  selfUserId?: string
  refresh?: () => void
  refreshing?: boolean
  children: React.ReactNode
}) {
  const value = useMemo(
    () => ({ source, selfUserId, refresh, refreshing }),
    [source, selfUserId, refresh, refreshing]
  )
  return <PermissionContext value={value}>{children}</PermissionContext>
}

/**
 * Real source (PAN-011b, ADR 0004 amendment). State comes from `status ===
 * 'success'` only: loading and every error, also after an earlier success,
 * give `unknown` (fail open; the API still enforces).
 */
export function MePermissionProvider({
  accountId,
  api,
  children,
}: {
  accountId: string
  api?: ApiClient
  children: React.ReactNode
}) {
  const q = useQuery(mePermissionsQueryOptions(accountId, api))
  const { status, data, isFetching, refetch } = q
  const source = useMemo(
    () =>
      status === 'success'
        ? permissionSourceFrom(new Set(data.permissions))
        : unknownPermissionSource,
    [status, data]
  )
  const refresh = useMemo(
    () => () => void refetch({ cancelRefetch: false }),
    [refetch]
  )
  return (
    <PermissionProvider
      source={source}
      selfUserId={status === 'success' ? data.user_id : undefined}
      refresh={refresh}
      refreshing={isFetching}
    >
      {children}
    </PermissionProvider>
  )
}

/** Under `AuthGate`, so `accountId` is set; calling `useAuth()` re-renders on every auth event. */
export function AuthPermissionProvider({
  api,
  children,
}: {
  api?: ApiClient
  children: React.ReactNode
}) {
  const { accountId } = useAuth()
  if (!accountId) return <PermissionProvider>{children}</PermissionProvider>
  return (
    <MePermissionProvider accountId={accountId} api={api}>
      {children}
    </MePermissionProvider>
  )
}

export function usePermissionSource(): PermissionSource {
  return useContext(PermissionContext).source
}

export function useSelfUserId(): string | undefined {
  return useContext(PermissionContext).selfUserId
}

export function usePermissionRefresh() {
  const { refresh, refreshing } = useContext(PermissionContext)
  return { refresh, refreshing }
}

export function usePermission(requirement: Requirement): PermissionState {
  return evaluate(requirement, useContext(PermissionContext).source)
}

export function useActionPermission(
  action: ActionId | readonly ActionId[]
): PermissionState {
  const { source } = useContext(PermissionContext)
  const ids = typeof action === 'string' ? [action] : action
  return evaluateAll(
    ids.map((id) => ACTIONS[id]),
    source
  )
}
