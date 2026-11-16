import { QueryClient } from '@tanstack/react-query'
import { createApiClient } from '@/api'

type Handler = (req: Request) => Response | Promise<Response>

/**
 * API client on an injected fake `fetch` (no MSW, ADR 0005). `seen` records
 * every request that reaches the network layer.
 */
export function fakeApi(handler: Handler) {
  const seen: Request[] = []
  const fetch = async (req: Request) => {
    seen.push(req)
    return handler(req)
  }
  return {
    seen,
    client: createApiClient({
      baseUrl: 'https://api.test',
      fetch: fetch as unknown as typeof globalThis.fetch,
    }),
  }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

export const apiError = (
  status: number,
  code: string,
  details: unknown = null
) => json({ error: { code, message: 'server text', details } }, status)

export const testQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
