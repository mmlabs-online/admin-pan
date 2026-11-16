import { createFileRoute } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { AuthGate } from '@/features/auth/gate/auth-gate'

export const Route = createFileRoute('/_authenticated')({
  component: () => (
    <AuthGate>
      <AuthenticatedLayout />
    </AuthGate>
  ),
})
