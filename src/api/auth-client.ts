// The one @mmlabs/auth-client instance (R2/R3): sign-in, accounts, tokens and
// logout go only through the library. The token never leaves it; Bearer calls
// reach the API through createApiClient's bearerFetch (ADR 0003).
import {
  AuthError,
  ConfigurationError,
  EmailUnverifiedError,
  InvalidCredentialsError,
  NetworkError,
  NotMemberError,
  RateLimitedError,
  SessionInvalidError,
  TurnstileFailedError,
  TurnstileRequiredError,
  ValidationError,
  createAuthClient,
  type Account,
  type AuthClient,
  type AuthClientOptions,
} from '@mmlabs/auth-client'
import { appKey, apiBaseUrl } from './config'

export type { Account }

const AUTH_TIMEOUT_MS = 15_000

/**
 * fetch for the library. Library calls to /api/v1/auth/* carry no signal, so a
 * hung request would keep the app on "Restoring your session…" for ever.
 * Bearer calls arrive as a Request that createApiClient already timed.
 */
export function authTimeoutFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  if (input instanceof Request) return globalThis.fetch(input, init)
  const timeout = AbortSignal.timeout(AUTH_TIMEOUT_MS)
  return globalThis.fetch(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  })
}

export function createAdminAuthClient(
  overrides: Partial<AuthClientOptions> = {}
): AuthClient {
  const baseUrl = apiBaseUrl()
  return createAuthClient({
    baseUrl,
    appKey: appKey(),
    apiOrigins: [baseUrl],
    allowInsecureLocalhost: import.meta.env.DEV,
    fetch: authTimeoutFetch,
    ...overrides,
  })
}

let client: AuthClient | undefined

/** Lazy, like getApi(): a missing VITE_* config throws here, not at import. */
export function getAuthClient(): AuthClient {
  return (client ??= createAdminAuthClient())
}

/** A library error as data. Never carries a message, email or token. */
export type AuthFailure =
  | { kind: 'session_invalid' }
  | { kind: 'not_member' }
  | { kind: 'email_unverified' }
  | { kind: 'rate_limited'; retryAfter?: number }
  | { kind: 'invalid_credentials' }
  | { kind: 'turnstile_required' }
  | { kind: 'turnstile_failed' }
  | { kind: 'validation' }
  | { kind: 'network' }
  | { kind: 'config'; requestId?: string }
  | { kind: 'account_changed' }
  | { kind: 'no_account_selected' }
  | { kind: 'unknown'; requestId?: string }

export function authFailure(e: unknown): AuthFailure {
  if (e instanceof SessionInvalidError) return { kind: 'session_invalid' }
  if (e instanceof NotMemberError) return { kind: 'not_member' }
  if (e instanceof EmailUnverifiedError) return { kind: 'email_unverified' }
  if (e instanceof RateLimitedError)
    return { kind: 'rate_limited', retryAfter: e.retryAfter }
  if (e instanceof InvalidCredentialsError)
    return { kind: 'invalid_credentials' }
  if (e instanceof TurnstileRequiredError) return { kind: 'turnstile_required' }
  if (e instanceof TurnstileFailedError) return { kind: 'turnstile_failed' }
  if (e instanceof ValidationError) return { kind: 'validation' }
  if (e instanceof NetworkError) return { kind: 'network' }
  if (e instanceof ConfigurationError)
    return { kind: 'config', requestId: e.requestId }
  if (e instanceof AuthError) {
    if (e.code === 'account_changed') return { kind: 'account_changed' }
    if (e.code === 'no_account_selected') return { kind: 'no_account_selected' }
    return { kind: 'unknown', requestId: e.requestId }
  }
  return { kind: 'unknown' }
}

export type ResendOutcome =
  | { kind: 'sent' }
  | { kind: 'already_verified' }
  | { kind: 'not_allowed'; requestId?: string }
  | AuthFailure

/**
 * Asks the API to send the verification email again (cookie class). The
 * account is always the one the page shows. The library maps a 409
 * `email_already_verified` to the return value 'already_verified'.
 */
export async function resendVerificationEmail(
  accountId: string,
  client: Pick<AuthClient, 'resendVerification'> = getAuthClient()
): Promise<ResendOutcome> {
  try {
    return { kind: await client.resendVerification(accountId) }
  } catch (e) {
    // An unverified account without an admin role: the API checks the
    // verified email before membership, so this is a normal case.
    if (e instanceof ConfigurationError && e.code === 'origin_not_allowed')
      return { kind: 'not_allowed', requestId: e.requestId }
    return authFailure(e)
  }
}
