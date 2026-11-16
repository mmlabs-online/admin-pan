import createClient, { type Middleware } from 'openapi-fetch'
import { currentAuthEpoch, notifyUnauthorized } from './auth-hooks'
import { ApiError, errorFromFetchFailure, errorFromResponse } from './errors'
import type { paths } from './schema'

// Public auth endpoints (R3 class 2/3): no bearer token, and a 401 there is not
// a session expiry.
const isPublicAuthPath = (url: string) =>
  new URL(url).pathname.startsWith('/api/v1/auth/')

// Auth failures that the gate must look at again (session gone, no access, ...).
const GATE_CODES = new Set([
  'session_invalid',
  'not_member',
  'email_unverified',
  'no_account_selected',
])

type Options = {
  baseUrl: string
  fetch?: typeof globalThis.fetch
  /** Transport for admin paths: adds the Bearer token (the auth library). */
  bearerFetch?: (req: Request) => Promise<Response>
  timeoutMs?: number
}

export function createApiClient({
  baseUrl,
  fetch: fetchImpl = (req) => globalThis.fetch(req),
  bearerFetch,
  timeoutMs,
}: Options) {
  const timedFetch = (req: Request) => {
    const ms =
      timeoutMs ??
      (req.method === 'GET' || req.method === 'HEAD' ? 15_000 : 30_000)
    const forced = new Request(req, {
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(ms)]),
      // forced here so a per-call init cannot override them
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      mode: 'cors',
    })
    return isPublicAuthPath(forced.url)
      ? fetchImpl(forced)
      : (bearerFetch ?? fetchImpl)(forced)
  }

  const epochs = new Map<string, number>()

  const middleware: Middleware = {
    onRequest({ request, id }) {
      if (new URL(request.url).origin !== baseUrl) {
        throw new ApiError({
          kind: 'config',
          status: 0,
          code: 'invalid_request',
          message: 'Request origin does not match the API base URL',
        })
      }
      epochs.set(id, currentAuthEpoch())
      return request
    },
    async onResponse({ request, response, id }) {
      const epoch = epochs.get(id) ?? currentAuthEpoch()
      epochs.delete(id)
      if (response.ok) {
        if (response.status === 204 || response.status === 205) return undefined
        const text = await response.clone().text()
        if (!text) return undefined
        let valid = (response.headers.get('content-type') ?? '').includes(
          'application/json'
        )
        if (valid) {
          try {
            JSON.parse(text)
          } catch {
            valid = false
          }
        }
        if (valid) return undefined
        throw new ApiError({
          kind: 'invalid_response',
          status: response.status,
          code: 'invalid_response',
          message: 'The server returned an invalid response',
        })
      }
      const err = await errorFromResponse(response)
      if (response.status === 401 && !isPublicAuthPath(request.url))
        notifyUnauthorized(epoch)
      throw err
    },
    onError({ error, id }) {
      const epoch = epochs.get(id) ?? currentAuthEpoch()
      epochs.delete(id)
      const err = errorFromFetchFailure(error)
      if (err.kind === 'auth' && GATE_CODES.has(err.code))
        notifyUnauthorized(epoch)
      return err
    },
  }

  const client = createClient<paths>({
    baseUrl,
    fetch: timedFetch,
    credentials: 'omit',
    mode: 'cors',
    redirect: 'error',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/json' },
  })
  client.use(middleware)
  return client
}

export type ApiClient = ReturnType<typeof createApiClient>

/** Returns the response data; 4xx/5xx never get here (the middleware throws). */
export function unwrap<T>(result: { data?: T; response: Response }): T {
  if (result.data === undefined && result.response.status !== 204) {
    throw new ApiError({
      kind: 'invalid_response',
      status: 0,
      code: 'invalid_response',
      message: 'The server returned no data',
    })
  }
  return result.data as T
}
