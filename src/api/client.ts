import createClient, { type Middleware } from 'openapi-fetch'
import {
  currentAuthEpoch,
  getAccessToken,
  notifyUnauthorized,
} from './auth-hooks'
import { ApiError, errorFromFetchFailure, errorFromResponse } from './errors'
import type { paths } from './schema'

type Options = {
  baseUrl: string
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

export function createApiClient({
  baseUrl,
  fetch: fetchImpl = (req) => globalThis.fetch(req),
  timeoutMs,
}: Options) {
  const timedFetch = (req: Request) => {
    const ms =
      timeoutMs ??
      (req.method === 'GET' || req.method === 'HEAD' ? 15_000 : 30_000)
    return fetchImpl(
      new Request(req, {
        signal: AbortSignal.any([req.signal, AbortSignal.timeout(ms)]),
        // forced here so a per-call init cannot override them
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        mode: 'cors',
      })
    )
  }

  const epochs = new Map<string, number>()

  const middleware: Middleware = {
    async onRequest({ request, id }) {
      if (new URL(request.url).origin !== baseUrl) {
        throw new ApiError({
          kind: 'config',
          status: 0,
          code: 'invalid_request',
          message: 'Request origin does not match the API base URL',
        })
      }
      epochs.set(id, currentAuthEpoch())
      const token = await getAccessToken()
      if (token) request.headers.set('Authorization', `Bearer ${token}`)
      return request
    },
    async onResponse({ response, id }) {
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
      if (response.status === 401) notifyUnauthorized(epoch)
      throw err
    },
    onError({ error, id }) {
      epochs.delete(id)
      return errorFromFetchFailure(error)
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
