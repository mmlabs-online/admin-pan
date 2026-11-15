import { createApiClient, type ApiClient } from './client'
import { apiBaseUrl } from './config'

export { ApiError, isApiError } from './errors'
export type { ValidationErrorDetail, UnprocessableDetail } from './errors'
export { toPageParams, type Page } from './page'
export { setAccessTokenProvider, setUnauthorizedHandler } from './auth-hooks'
export { appKey } from './config'
export { forgotPassword, resetPassword } from './public-auth'
export { createApiClient, unwrap, type ApiClient } from './client'
export type { paths, components } from './schema'

let api: ApiClient | undefined

/** Lazy so mock mode (empty VITE_API_BASE_URL) and builds keep working. */
export function getApi(): ApiClient {
  return (api ??= createApiClient({ baseUrl: apiBaseUrl() }))
}
