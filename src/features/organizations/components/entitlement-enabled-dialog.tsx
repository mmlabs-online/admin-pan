import { useRef } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { useUpdateEntitlementMutation } from '../api/entitlements'
import { entitlementToggleError } from '../data/entitlement-errors'
import { type Entitlement } from '../data/entitlement-schema'
import { type Organization } from '../data/schema'
import { useOrganizations } from './organizations-provider'

type EntitlementEnabledDialogProps = {
  org: Organization
  entitlement: Entitlement
  /** Called when the dialog closes (cancel or success). */
  onDone: () => void
}

// PATCH …/entitlements/{id} { enabled } — admin:entitlements:write. Mounted
// only while open. Never optimistic (R9): the switch reads query data, so it
// flips after the refetch.
export function EntitlementEnabledDialog({
  org,
  entitlement,
  onDone,
}: EntitlementEnabledDialogProps) {
  const { api } = useOrganizations()
  const disabling = entitlement.enabled
  const target = `${entitlement.app_key} for ${org.name}`
  const mutation = useUpdateEntitlementMutation(org.id, api, {
    onSuccess: () =>
      toast.success(`${target} ${disabling ? 'disabled' : 'enabled'}.`),
  })
  const inFlight = useRef(false)

  const handleConfirm = () => {
    if (inFlight.current) return
    inFlight.current = true
    mutation.mutate(
      { entitlementId: entitlement.id, body: { enabled: !disabling } },
      {
        onSuccess: () => {
          onDone()
        },
        onSettled: () => {
          inFlight.current = false
        },
      }
    )
  }

  const handleOpenChange = (next: boolean) => {
    if (next || mutation.isPending) return
    mutation.reset()
    onDone()
  }

  const failure = mutation.isError
    ? entitlementToggleError(mutation.error)
    : null

  return (
    <ConfirmDialog
      open
      onOpenChange={handleOpenChange}
      handleConfirm={handleConfirm}
      isLoading={mutation.isPending}
      pendingText={disabling ? 'Disabling…' : 'Enabling…'}
      destructive={disabling}
      title={`${disabling ? 'Disable' : 'Enable'} ${target}?`}
      desc={
        disabling
          ? 'The entitlement becomes inactive. Its plan and limits are kept and you can enable it again. The change is recorded in the audit log.'
          : 'The entitlement is active again while the organization and the app are active. The change is recorded in the audit log.'
      }
      confirmText={disabling ? 'Disable' : 'Enable'}
      error={
        failure?.kind === 'forbidden' ? (
          <ForbiddenPanel variant='inline' copy={failure.copy} />
        ) : failure?.kind === 'message' ? (
          <p role='alert' className='text-sm text-destructive'>
            {failure.text}
          </p>
        ) : undefined
      }
    />
  )
}
