// Token-credential public flows (forgot, reset, verify-email; R3 exception,
// owner 2026-11-15, PAN-012):
// no bearer token, no cookies; the client middleware enforces both for
// /api/v1/auth/*. Kept apart from the rest of the API surface on purpose.
import type { ApiClient } from './client'
import { appKey } from './config'
import type { components } from './schema'

type Forgot = components['schemas']['ForgotPasswordRequest']
type Reset = components['schemas']['ResetPasswordRequest']
type Verify = components['schemas']['VerifyEmailRequest']

export async function forgotPassword(api: ApiClient, body: Forgot) {
  // 202 has no body; the middleware already throws on every error status.
  await api.POST('/api/v1/auth/password/forgot', {
    body,
    // The generated types require an `origin` header; the browser sets it
    // itself and it cannot be set from JS, so it is dropped here.
    params: { header: { 'X-MM-App': appKey() } as never },
  })
}

export async function resetPassword(api: ApiClient, body: Reset) {
  await api.POST('/api/v1/auth/password/reset', { body })
}

export async function verifyEmail(api: ApiClient, body: Verify) {
  await api.POST('/api/v1/auth/verify-email', { body })
}
