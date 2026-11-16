import {
  ACCOUNT_A,
  TOKEN,
  createTestAuthClient,
  envelope as identityEnvelope,
  fakeIdentityApi,
  json as identityJson,
  memoryStorage,
  row,
  type Handler,
} from '@/test-utils/auth'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setUnauthorizedHandler } from './auth-hooks'
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
  setUnauthorizedHandler(() => {})
})

describe('createApiClient', () => {
  it('sends no Authorization header without a bearerFetch', async () => {
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

const orgs = 'GET /api/v1/organizations'

// A real AuthClient whose network is the fake identity API; bearerFetch is the
// same wiring as getApi().
function bearerSetup(routes: Record<string, Handler | Handler[]> = {}) {
  const identity = fakeIdentityApi({
    accounts: [row(ACCOUNT_A, 'a@b.c')],
    routes,
  })
  const auth = createTestAuthClient(identity, {
    storage: memoryStorage({ mm_account_id: ACCOUNT_A }).storage,
  })
  const bearerFetch = vi.fn((req: Request) => auth.fetchWithToken(req))
  const api = createApiClient({
    baseUrl: BASE,
    fetch: identity.fakeFetch as typeof globalThis.fetch,
    bearerFetch,
  })
  return { api, identity, bearerFetch }
}

describe('bearer transport (auth library)', () => {
  it('admin paths go through bearerFetch and get Authorization: Bearer from a real AuthClient', async () => {
    const { api, identity, bearerFetch } = bearerSetup()
    await api.GET('/api/v1/organizations')
    expect(bearerFetch).toHaveBeenCalledOnce()
    const call = identity.calls.find((c) => c.path === '/api/v1/organizations')
    expect(call?.headers.get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(identity.count('POST /api/v1/auth/token')).toBe(1)
  })

  it('/api/v1/auth/* never goes through bearerFetch and never carries Authorization', async () => {
    const { api, identity, bearerFetch } = bearerSetup({
      'POST /api/v1/auth/password/reset': () =>
        new Response(null, { status: 204 }),
    })
    await api.POST('/api/v1/auth/password/reset', {
      body: { token: 't', new_password: 'p' },
    })
    expect(bearerFetch).not.toHaveBeenCalled()
    expect(identity.calls[0].headers.has('authorization')).toBe(false)
  })

  it('GET 401 -> the library refreshes the token once and retries; success does not notify unauthorized', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    const { api, identity } = bearerSetup({
      [orgs]: [
        () => identityEnvelope(401, 'unauthorized'),
        () => identityJson(200, page),
      ],
    })
    expect(unwrap(await api.GET('/api/v1/organizations'))).toEqual(page)
    expect(identity.count('POST /api/v1/auth/token')).toBe(2)
    expect(handler).not.toHaveBeenCalled()
  })

  it('401 twice -> the unauthorized handler fires once', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    const { api } = bearerSetup({
      [orgs]: () => identityEnvelope(401, 'unauthorized'),
    })
    await expect(api.GET('/api/v1/organizations')).rejects.toMatchObject({
      status: 401,
    })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('403 does not notify unauthorized', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    const { api } = bearerSetup({
      [orgs]: () => identityEnvelope(403, 'permission_denied'),
    })
    await expect(api.GET('/api/v1/organizations')).rejects.toMatchObject({
      status: 403,
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([
    ['not_member', 403],
    ['email_unverified', 403],
    ['session_invalid', 401],
  ])(
    'getToken rejecting with %s -> ApiError kind auth and one unauthorized notification',
    async (code, status) => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      const { api } = bearerSetup({
        'POST /api/v1/auth/token': () => identityEnvelope(status, code),
      })
      await expect(api.GET('/api/v1/organizations')).rejects.toMatchObject({
        kind: 'auth',
        code,
      })
      expect(handler).toHaveBeenCalledTimes(1)
    }
  )

  it('rate_limited from getToken -> kind auth with retryAfter, no notification', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    const { api } = bearerSetup({
      'POST /api/v1/auth/token': () =>
        identityEnvelope(429, 'rate_limited', null, { 'Retry-After': '30' }),
    })
    await expect(api.GET('/api/v1/organizations')).rejects.toMatchObject({
      kind: 'auth',
      code: 'rate_limited',
      retryAfter: 30,
    })
    expect(handler).not.toHaveBeenCalled()
  })
})
