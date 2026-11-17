import { getAuthClient } from './auth-client'
import { createApiClient, type ApiClient } from './client'
import { apiBaseUrl } from './config'

export { ApiError, isApiError } from './errors'
export type { ValidationErrorDetail, UnprocessableDetail } from './errors'
export { toPageParams, type Page } from './page'
export { setUnauthorizedHandler } from './auth-hooks'
export {
  authFailure,
  getAuthClient,
  resendVerificationEmail,
} from './auth-client'
export type { Account, AuthFailure, ResendOutcome } from './auth-client'
export { appKey } from './config'
export { resetPassword, verifyEmail } from './public-auth'
export { createApiClient, unwrap, type ApiClient } from './client'
export type { paths, components } from './schema'

let api: ApiClient | undefined

/** Lazy so mock mode (empty VITE_API_BASE_URL) and builds keep working. */
export function getApi(): ApiClient {
  return (api ??= createApiClient({
    baseUrl: apiBaseUrl(),
    bearerFetch: (req) => getAuthClient().fetchWithToken(req),
  }))
}
