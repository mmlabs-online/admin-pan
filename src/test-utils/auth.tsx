/* eslint-disable react-refresh/only-export-components */
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { createAuthClient, type AuthClient } from '@mmlabs/auth-client'
import { AuthProvider } from '@mmlabs/auth-client/react'
import { render } from 'vitest-browser-react'
import { clearOnAuthChange } from '@/lib/query-client'
import { AuthGate } from '@/features/auth/gate/auth-gate'

export const BASE = 'https://api.test'
export const ACCOUNT_A = '11111111-1111-4111-8111-111111111111'
export const ACCOUNT_B = '22222222-2222-4222-8222-222222222222'
export const TOKEN = 'sentinel-token-7f3a91.payload.signature'
export const PASSWORD = 'Sentinel-Password-7f3a91'

export type Row = {
  account_id: string
  email: string
  email_verified: boolean
  display_name: string | null
}
export const row = (
  account_id: string,
  email: string,
  email_verified = true,
  display_name: string | null = null
): Row => ({ account_id, email, email_verified, display_name })

export type Call = {
  method: string
  path: string
  headers: Headers
  body: unknown
}
export type Handler = (call: Call) => Response | Promise<Response>

export const json = (status: number, body: unknown, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
export const envelope = (
  status: number,
  code: string,
  details: unknown = null,
  headers = {}
) => json(status, { error: { code, message: code, details } }, headers)
export const tokenResponse = () =>
  json(200, {
    access_token: TOKEN,
    token_type: 'Bearer',
    expires_in: 900,
    audience: 'admin',
  })

/**
 * Answers the identity API and one admin endpoint at the network layer. Shapes
 * follow the library's own contract tests. `routes` (key "METHOD /path") replaces
 * a default; an array is consumed in order and its last handler repeats.
 */
export function fakeIdentityApi(
  init: { accounts?: Row[]; routes?: Record<string, Handler | Handler[]> } = {}
) {
  const state = { accounts: init.accounts ?? [] }
  const calls: Call[] = []
  const routes: Record<string, Handler | Handler[]> = {
    'GET /api/v1/auth/accounts': () =>
      state.accounts.length
        ? json(200, { items: state.accounts })
        : envelope(401, 'session_invalid'),
    'POST /api/v1/auth/token': tokenResponse,
    'POST /api/v1/auth/login': ({ body }) => {
      const email = (body as { email: string }).email
      state.accounts = [row(ACCOUNT_A, email)]
      return json(200, {
        account_id: ACCOUNT_A,
        user: { id: ACCOUNT_B, email, email_verified: true },
      })
    },
    'POST /api/v1/auth/logout': ({ body }) => {
      const b = body as { all?: boolean; account_id?: string }
      state.accounts = b.all
        ? []
        : state.accounts.filter((a) => a.account_id !== b.account_id)
      return new Response(null, { status: 204 })
    },
    'GET /api/v1/organizations': () =>
      json(200, { items: [], total: 0, limit: 20, offset: 0 }),
    ...init.routes,
  }

  const fakeFetch = async (
    input: RequestInfo | URL,
    init: RequestInit = {}
  ): Promise<Response> => {
    const isRequest = input instanceof Request
    const url = isRequest ? input.url : String(input)
    const method = (
      init.method ?? (isRequest ? input.method : 'GET')
    ).toUpperCase()
    const text =
      typeof init.body === 'string'
        ? init.body
        : isRequest && method !== 'GET'
          ? await input.clone().text()
          : ''
    const call: Call = {
      method,
      path: new URL(url).pathname,
      headers: new Headers(init.headers ?? (isRequest ? input.headers : {})),
      body: text ? JSON.parse(text) : undefined,
    }
    calls.push(call)
    const route = routes[`${call.method} ${call.path}`]
    const handler = Array.isArray(route)
      ? route.length > 1
        ? route.shift()
        : route[0]
      : route
    if (!handler) throw new Error(`unexpected request ${method} ${call.path}`)
    return handler(call)
  }

  return {
    state,
    calls,
    routes,
    fakeFetch,
    count: (key: string) =>
      calls.filter((c) => `${c.method} ${c.path}` === key).length,
  }
}
export type FakeIdentityApi = ReturnType<typeof fakeIdentityApi>

export function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    storage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  }
}

/** A real AuthClient whose fetch is the fake API. */
export function createTestAuthClient(
  api: FakeIdentityApi,
  { storage }: { storage: ReturnType<typeof memoryStorage>['storage'] }
): AuthClient {
  return createAuthClient({
    baseUrl: BASE,
    appKey: 'admin',
    apiOrigins: [BASE],
    fetch: api.fakeFetch as typeof fetch,
    storage,
    broadcast: false,
  })
}

function Probe({ name, onQuery }: { name: string; onQuery?: () => void }) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- onQuery only observes
  useQuery({
    queryKey: ['probe', name],
    queryFn: () => {
      onQuery?.()
      return 1
    },
  })
  return <p>Protected: {name}</p>
}

/** Minimal router: /sign-in stub and an AuthGate layout with / and /users. */
export async function renderWithAuth({
  client,
  path = '/',
  onQuery,
  extra,
}: {
  client: AuthClient
  path?: string
  onQuery?: () => void
  /** Rendered inside the gate, next to the page (e.g. a dialog). */
  extra?: React.ReactNode
}) {
  const root = createRootRoute({ component: Outlet })
  const signIn = createRoute({
    getParentRoute: () => root,
    path: '/sign-in',
    validateSearch: (s: Record<string, unknown>) => ({
      redirect: typeof s.redirect === 'string' ? s.redirect : undefined,
    }),
    component: () => <p>Sign-in page</p>,
  })
  const layout = createRoute({
    getParentRoute: () => root,
    id: '_authenticated',
    component: () => (
      <AuthGate>
        <Outlet />
        {extra}
      </AuthGate>
    ),
  })
  const home = createRoute({
    getParentRoute: () => layout,
    path: '/',
    component: () => <Probe name='Home' onQuery={onQuery} />,
  })
  const users = createRoute({
    getParentRoute: () => layout,
    path: '/users',
    component: () => <Probe name='Users' onQuery={onQuery} />,
  })
  const router = createRouter({
    routeTree: root.addChildren([signIn, layout.addChildren([home, users])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clearOnAuthChange(queryClient, (l) => client.onChange(l))
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider client={client}>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  )
  return { screen, router, queryClient }
}
