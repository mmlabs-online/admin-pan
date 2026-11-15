import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAccessTokenProvider, setUnauthorizedHandler } from './auth-hooks'
import { createApiClient, unwrap } from './client'
import { ApiError } from './errors'

const BASE = 'https://api.test'
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
const envelope = (status: number, code: string) =>
  json({ error: { code, message: code, details: null } }, status)

function setup(respond: (req: Request) => Response | Promise<Response>) {
  const seen: Request[] = []
  const fetch = vi.fn(async (req: Request) => {
    seen.push(req)
    return respond(req)
  })
  const api = createApiClient({
    baseUrl: BASE,
    fetch: fetch as unknown as typeof globalThis.fetch,
  })
  return { api, seen }
}

const page = { items: [], total: 0, limit: 20, offset: 0 }

afterEach(() => {
  setAccessTokenProvider(() => null)
  setUnauthorizedHandler(() => {})
})

describe('createApiClient', () => {
  it('sends Authorization: Bearer <token> when the provider returns a token', async () => {
    setAccessTokenProvider(() => 'abc')
    const { api, seen } = setup(() => json(page))
    await api.GET('/api/v1/organizations')
    expect(seen[0].headers.get('authorization')).toBe('Bearer abc')
  })

  it('sends no Authorization header when the provider returns null', async () => {
    const { api, seen } = setup(() => json(page))
    await api.GET('/api/v1/organizations')
    expect(seen[0].headers.has('authorization')).toBe(false)
  })

  it('never sends X-MM-App or cookies (credentials omit) and sets redirect error, cache no-store', async () => {
    const { api, seen } = setup(() => json(page))
    await api.GET('/api/v1/organizations')
    expect(seen[0].headers.has('x-mm-app')).toBe(false)
    expect(seen[0].credentials).toBe('omit')
    expect(seen[0].redirect).toBe('error')
    expect(seen[0].cache).toBe('no-store')
  })

  it('builds the URL from the origin + /api/v1 path and encodes path params (a/b -> a%2Fb)', async () => {
    const { api, seen } = setup(() => json(page))
    await api.GET('/api/v1/organizations')
    expect(seen[0].url).toBe(`${BASE}/api/v1/organizations`)
    const del = setup(() => new Response(null, { status: 204 }))
    await del.api.DELETE('/api/v1/organizations/{org_id}', {
      params: { path: { org_id: 'a/b' } },
    })
    expect(del.seen[0].url).toBe(`${BASE}/api/v1/organizations/a%2Fb`)
  })

  it('returns typed data for a 200 GET /api/v1/organizations', async () => {
    const { api } = setup(() => json(page))
    expect(unwrap(await api.GET('/api/v1/organizations'))).toEqual(page)
  })

  it('resolves a 204 DELETE without a body', async () => {
    const { api } = setup(() => new Response(null, { status: 204 }))
    const res = await api.DELETE('/api/v1/organizations/{org_id}', {
      params: { path: { org_id: 'x' } },
    })
    expect(res.response.status).toBe(204)
    expect(() => unwrap(res)).not.toThrow()
  })

  it('rejects with ApiError on a 4xx envelope', async () => {
    const { api } = setup(() => envelope(404, 'not_found'))
    await expect(api.GET('/api/v1/organizations')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'not_found',
    })
  })

  it.each([
    ['a 200 text/html body', '<html>secret-body</html>', 'text/html'],
    ['a 200 malformed JSON body', '{"items": secret-body', 'application/json'],
  ])(
    'rejects with ApiError invalid_response for %s',
    async (_n, body, type) => {
      const { api } = setup(
        () =>
          new Response(body, { status: 200, headers: { 'content-type': type } })
      )
      const err = await api.GET('/api/v1/organizations').catch((e) => e)
      expect(err).toMatchObject({
        name: 'ApiError',
        kind: 'invalid_response',
        status: 200,
      })
      expect(JSON.stringify(err)).not.toContain('secret-body')
    }
  )

  it('forces credentials omit and redirect error even if a call overrides them', async () => {
    const { api, seen } = setup(() => json(page))
    await api.GET('/api/v1/organizations', {
      credentials: 'include',
      redirect: 'follow',
    })
    expect(seen[0].credentials).toBe('omit')
    expect(seen[0].redirect).toBe('error')
  })

  it('rejects with ApiError network_error when fetch throws', async () => {
    const { api } = setup(() => {
      throw new TypeError('Failed to fetch')
    })
    await expect(api.GET('/api/v1/organizations')).rejects.toMatchObject({
      kind: 'network',
      code: 'network_error',
    })
  })

  it('rejects with ApiError timeout after timeoutMs', async () => {
    const api = createApiClient({
      baseUrl: BASE,
      timeoutMs: 20,
      fetch: ((req: Request) =>
        new Promise((_, reject) => {
          req.signal.addEventListener('abort', () => reject(req.signal.reason))
        })) as unknown as typeof globalThis.fetch,
    })
    const err = await api.GET('/api/v1/organizations').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.kind).toBe('timeout')
  })

  it('calls the unauthorized handler once for concurrent 401s', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    const { api } = setup(() => envelope(401, 'unauthorized'))
    await Promise.allSettled([
      api.GET('/api/v1/organizations'),
      api.GET('/api/v1/organizations'),
      api.GET('/api/v1/organizations'),
    ])
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('calls the unauthorized handler again for a 401 sent after the previous one fired', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    const { api } = setup(() => envelope(401, 'unauthorized'))
    await api.GET('/api/v1/organizations').catch(() => {})
    await api.GET('/api/v1/organizations').catch(() => {})
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('does not call the unauthorized handler on 403 and rejects with status 403', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    const { api } = setup(() => envelope(403, 'permission_denied'))
    await expect(api.GET('/api/v1/organizations')).rejects.toMatchObject({
      status: 403,
    })
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('public auth paths', () => {
  it('never sends Authorization to /api/v1/auth/* even with a token', async () => {
    setAccessTokenProvider(() => 'abc')
    const { api, seen } = setup(() => new Response(null, { status: 204 }))
    await api.POST('/api/v1/auth/password/reset', {
      body: { token: 't', new_password: 'p' },
    })
    expect(seen[0].headers.has('authorization')).toBe(false)
  })

  it('still sends Authorization to admin paths', async () => {
    setAccessTokenProvider(() => 'abc')
    const { api, seen } = setup(() => json(page))
    await api.GET('/api/v1/organizations')
    expect(seen[0].headers.get('authorization')).toBe('Bearer abc')
  })

  it('does not notify unauthorized for /api/v1/auth/* 401', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    const { api } = setup(() => envelope(401, 'unauthorized'))
    await expect(
      api.POST('/api/v1/auth/password/reset', {
        body: { token: 't', new_password: 'p' },
      })
    ).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('keeps credentials omit for auth paths', async () => {
    const { api, seen } = setup(() => new Response(null, { status: 204 }))
    await api.POST('/api/v1/auth/password/reset', {
      body: { token: 't', new_password: 'p' },
    })
    expect(seen[0].credentials).toBe('omit')
  })
})
