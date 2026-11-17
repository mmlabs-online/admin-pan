// Token-credential public flows (reset, verify-email; R3 exception,
// owner 2026-11-15, PAN-012):
// no bearer token, no cookies; the client middleware enforces both for
// /api/v1/auth/*. Kept apart from the rest of the API surface on purpose.
import type { ApiClient } from './client'
import type { components } from './schema'

type Reset = components['schemas']['ResetPasswordRequest']
type Verify = components['schemas']['VerifyEmailRequest']

export async function resetPassword(api: ApiClient, body: Reset) {
  await api.POST('/api/v1/auth/password/reset', { body })
}

export async function verifyEmail(api: ApiClient, body: Verify) {
  await api.POST('/api/v1/auth/verify-email', { body })
}
