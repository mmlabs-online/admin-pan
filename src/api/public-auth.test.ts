import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from './client'
import { ApiError } from './errors'
import { forgotPassword, resetPassword } from './public-auth'

function setup(respond: () => Response) {
  const seen: Request[] = []
  const fetch = vi.fn(async (req: Request) => {
    seen.push(req)
    return respond()
  })
  const api = createApiClient({
    baseUrl: 'https://api.test',
    fetch: fetch as unknown as typeof globalThis.fetch,
  })
  return { api, seen }
}
const err = (status: number, code: string, headers: HeadersInit = {}) =>
  new Response(
    JSON.stringify({ error: { code, message: code, details: null } }),
    { status, headers: { 'content-type': 'application/json', ...headers } }
  )

beforeEach(() => vi.stubEnv('VITE_APP_KEY', 'admin'))
afterEach(() => vi.unstubAllEnvs())

describe('public auth calls', () => {
  it('forgot sends X-MM-App and body {email, turnstile_token}', async () => {
    const { api, seen } = setup(() => new Response(null, { status: 202 }))
    await forgotPassword(api, { email: 'a@b.com', turnstile_token: 'tt' })
    expect(seen[0].url).toBe('https://api.test/api/v1/auth/password/forgot')
    expect(seen[0].headers.get('x-mm-app')).toBe('admin')
    expect(await seen[0].json()).toEqual({
      email: 'a@b.com',
      turnstile_token: 'tt',
    })
  })

  it('reset sends no X-MM-App or Authorization, and body {token, new_password}', async () => {
    const { api, seen } = setup(() => new Response(null, { status: 204 }))
    await resetPassword(api, { token: 't', new_password: 'pw' })
    expect(seen[0].headers.has('x-mm-app')).toBe(false)
    expect(seen[0].headers.has('authorization')).toBe(false)
    expect(await seen[0].json()).toEqual({ token: 't', new_password: 'pw' })
  })

  it('never sets an origin header', async () => {
    const { api, seen } = setup(() => new Response(null, { status: 202 }))
    await forgotPassword(api, { email: 'a@b.com', turnstile_token: 'tt' })
    expect(seen[0].headers.has('origin')).toBe(false)
  })

  it('422/429 throw ApiError with code and retryAfter', async () => {
    const a = setup(() => err(422, 'token_invalid'))
    await expect(
      resetPassword(a.api, { token: 't', new_password: 'pw' })
    ).rejects.toMatchObject({ status: 422, code: 'token_invalid' })
    const b = setup(() => err(429, 'rate_limited', { 'retry-after': '90' }))
    const e = await forgotPassword(b.api, {
      email: 'a@b.com',
      turnstile_token: 'tt',
    }).catch((x) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ status: 429, retryAfter: 90 })
  })
})
