// Advisory only (ADR 0004). A permission state must never decide whether data
// is fetched or shown, never replace a confirmation (R9) and never replace 403
// handling. `unknown` means "render as allowed; the API is the gate": never
// fail closed. The UI never reads the token (R3, ADR 0003).
import {
  type AdminPermission,
  type Requirement,
} from '@/lib/permissions/registry'

export type PermissionState = 'granted' | 'denied' | 'unknown'

export interface PermissionSource {
  check(permission: AdminPermission): PermissionState
}

/** Production source until PAN-011b: there is no permission data yet. */
export const unknownPermissionSource: PermissionSource = {
  check: () => 'unknown',
}

export function evaluate(
  requirement: Requirement,
  source: PermissionSource
): PermissionState {
  if (requirement.kind === 'none') return 'granted'
  if (requirement.kind === 'pending') return 'unknown'
  return source.check(requirement.permission)
}

export function evaluateAll(
  requirements: readonly Requirement[],
  source: PermissionSource
): PermissionState {
  const states = requirements.map((r) => evaluate(r, source))
  if (states.includes('granted')) return 'granted'
  if (states.length > 0 && states.every((s) => s === 'denied')) return 'denied'
  return 'unknown'
}
