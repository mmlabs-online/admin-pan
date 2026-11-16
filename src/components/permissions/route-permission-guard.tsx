import { Outlet, useMatches, useRouter } from '@tanstack/react-router'
import { routeForbiddenCopy, type ForbiddenCopy } from '@/lib/forbidden'
import { ROUTE_PERMISSIONS } from '@/lib/permissions/registry'
import { usePermission } from '@/context/permission-provider'
import { ConfigDrawer } from '@/components/config-drawer'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

export function RoutePermissionGate({
  routeId,
  children,
  fallback,
}: {
  routeId: string | undefined
  children: React.ReactNode
  fallback: (copy: ForbiddenCopy) => React.ReactNode
}) {
  const requirement =
    routeId && routeId in ROUTE_PERMISSIONS
      ? ROUTE_PERMISSIONS[routeId as keyof typeof ROUTE_PERMISSIONS]
      : { kind: 'none' as const, reason: 'Not an authenticated route' }
  const state = usePermission(requirement)
  if (state === 'denied' && requirement.kind === 'permission')
    return <>{fallback(routeForbiddenCopy(requirement.permission))}</>
  return <>{children}</>
}

/** Never navigates or redirects: the URL stays and the panel renders in the layout. */
export function RoutePermissionGuard() {
  const router = useRouter()
  const routeId = useMatches({ select: (m) => m[m.length - 1]?.routeId })
  return (
    <RoutePermissionGate
      routeId={routeId}
      fallback={(copy) => (
        <>
          <Header fixed className='border-b'>
            <Search className='me-auto' />
            <ThemeSwitch />
            <ConfigDrawer />
            <ProfileDropdown />
          </Header>
          <Main>
            <ForbiddenPanel copy={copy} onBack={() => router.history.back()} />
          </Main>
        </>
      )}
    >
      <Outlet />
    </RoutePermissionGate>
  )
}
