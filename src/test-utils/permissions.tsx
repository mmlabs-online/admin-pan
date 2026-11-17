/* eslint-disable react-refresh/only-export-components */
import { type AdminPermission } from '@/lib/permissions/registry'
import { type PermissionSource } from '@/lib/permissions/source'
import { PermissionProvider } from '@/context/permission-provider'

/** Grants exactly `granted`; every other key is denied. Test-only. */
export function fakePermissionSource(
  granted: readonly AdminPermission[]
): PermissionSource {
  return { check: (p) => (granted.includes(p) ? 'granted' : 'denied') }
}

export function WithPermissions({
  granted,
  userId,
  children,
}: {
  granted: readonly AdminPermission[]
  userId?: string
  children: React.ReactNode
}) {
  return (
    <PermissionProvider
      source={fakePermissionSource(granted)}
      selfUserId={userId}
    >
      {children}
    </PermissionProvider>
  )
}
