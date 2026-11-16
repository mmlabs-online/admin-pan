import { createFileRoute } from '@tanstack/react-router'
import { PermissionProvider } from '@/context/permission-provider'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { RoutePermissionGuard } from '@/components/permissions/route-permission-guard'
import { AuthGate } from '@/features/auth/gate/auth-gate'

export const Route = createFileRoute('/_authenticated')({
  component: () => (
    <AuthGate>
      <PermissionProvider>
        <AuthenticatedLayout>
          <RoutePermissionGuard />
        </AuthenticatedLayout>
      </PermissionProvider>
    </AuthGate>
  ),
})
