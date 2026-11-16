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
} from '@mmlabs/auth-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authFailure,
  authTimeoutFetch,
  createAdminAuthClient,
} from './auth-client'

afterEach(() => vi.restoreAllMocks())

describe('createAdminAuthClient', () => {
  it('uses apiBaseUrl() as baseUrl and apiOrigins, appKey from VITE_APP_KEY', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.test')
    vi.stubEnv('VITE_APP_KEY', 'admin')
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }))
    const client = createAdminAuthClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      storage: null,
      broadcast: false,
    })
    expect(client.appKey).toBe('admin')
    await client.listAccounts().catch(() => {})
    expect(fetch.mock.calls[0]).toEqual([
      'https://api.test/api/v1/auth/accounts',
      expect.objectContaining({ credentials: 'include' }),
    ])
    // apiOrigins: Bearer calls to another origin are refused before any request
    client.selectAccount('11111111-1111-4111-8111-111111111111')
    await expect(
      client.fetchWithToken('https://evil.test/api/v1/organizations')
    ).rejects.toMatchObject({ code: 'bearer_origin_not_allowed' })
  })

  it('throws on a missing config', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    expect(() => createAdminAuthClient()).toThrow()
  })
})

describe('authTimeoutFetch', () => {
  it('aborts a hung string-URL request after the timeout', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.timeout(20))
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason)
          )
        })
    )
    await expect(
      authTimeoutFetch('https://api.test/api/v1/auth/accounts')
    ).rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('passes Request inputs through unchanged', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))
    const req = new Request('https://api.test/api/v1/organizations')
    const init = { headers: { a: 'b' } }
    await authTimeoutFetch(req, init)
    expect(spy).toHaveBeenCalledWith(req, init)
  })
})

describe('authFailure', () => {
  it.each([
    [
      new SessionInvalidError('session_invalid', 401),
      { kind: 'session_invalid' },
    ],
    [new NotMemberError('not_member', 403), { kind: 'not_member' }],
    [
      new EmailUnverifiedError('email_unverified', 403),
      { kind: 'email_unverified' },
    ],
    [
      new RateLimitedError('rate_limited', 429, { retryAfter: 12 }),
      { kind: 'rate_limited', retryAfter: 12 },
    ],
    [
      new InvalidCredentialsError('invalid_credentials', 401),
      { kind: 'invalid_credentials' },
    ],
    [
      new TurnstileRequiredError('turnstile_required', 403),
      { kind: 'turnstile_required' },
    ],
    [
      new TurnstileFailedError('turnstile_failed', 403),
      { kind: 'turnstile_failed' },
    ],
    [new ValidationError('validation_error', 422), { kind: 'validation' }],
    [new NetworkError('network_error', 0), { kind: 'network' }],
    [
      new ConfigurationError('origin_not_allowed', 403, { requestId: 'r1' }),
      { kind: 'config', requestId: 'r1' },
    ],
    [new AuthError('account_changed', 0), { kind: 'account_changed' }],
    [new AuthError('no_account_selected', 0), { kind: 'no_account_selected' }],
    [new AuthError('unexpected_response', 500), { kind: 'unknown' }],
    [new TypeError('x'), { kind: 'unknown' }],
  ])('classifies %s', (error, expected) => {
    expect(authFailure(error)).toMatchObject(expected)
  })
})
