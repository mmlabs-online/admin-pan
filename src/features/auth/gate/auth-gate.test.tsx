import {
  ACCOUNT_A,
  ACCOUNT_B,
  TOKEN,
  createTestAuthClient,
  envelope,
  fakeIdentityApi,
  memoryStorage,
  renderWithAuth,
  row,
  tokenResponse,
  type Handler,
} from '@/test-utils/auth'
import { describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { useSessionRecheck } from '@/stores/session-recheck-store'

const A = row(ACCOUNT_A, 'a@staff.test')
const B = row(ACCOUNT_B, 'b@staff.test')

function setup(opts: {
  accounts?: ReturnType<typeof row>[]
  chosen?: string
  routes?: Record<string, Handler | Handler[]>
  path?: string
  onQuery?: () => void
}) {
  const api = fakeIdentityApi({ accounts: opts.accounts, routes: opts.routes })
  const mem = memoryStorage(opts.chosen ? { mm_account_id: opts.chosen } : {})
  const client = createTestAuthClient(api, { storage: mem.storage })
  const rendered = renderWithAuth({
    client,
    path: opts.path,
    onQuery: opts.onQuery,
  })
  return { api, mem, client, rendered }
}
const TOKEN_KEY = 'POST /api/v1/auth/token'
const ACCOUNTS_KEY = 'GET /api/v1/auth/accounts'

describe('AuthGate', () => {
  it('loading shows "Restoring your session…" status and no protected child', async () => {
    const { rendered } = setup({
      accounts: [A],
      chosen: ACCOUNT_A,
      routes: { [ACCOUNTS_KEY]: () => new Promise<Response>(() => {}) },
    })
    const { screen } = await rendered
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Restoring your session…')
    await expect
      .element(screen.getByText(/^Protected:/))
      .not.toBeInTheDocument()
  })

  it('signed-out redirects to /sign-in?redirect=<path+search, no hash>; at "/" no redirect param', async () => {
    const first = await setup({ path: '/users?x=1#h' }).rendered
    await vi.waitFor(() =>
      expect(first.router.state.location.pathname).toBe('/sign-in')
    )
    expect(first.router.state.location.searchStr).toBe(
      '?redirect=%2Fusers%3Fx%3D1'
    )
    expect(first.router.state.location.hash).toBe('')
    const second = await setup({ path: '/' }).rendered
    await vi.waitFor(() =>
      expect(second.router.state.location.pathname).toBe('/sign-in')
    )
    expect(second.router.state.location.searchStr).toBe('')
  })

  it('restores the session on load from the device cookie (accounts + token), no sign-in form', async () => {
    const { api, rendered } = setup({ accounts: [A], chosen: ACCOUNT_A })
    const { screen, router } = await rendered
    await expect
      .element(screen.getByText('Protected: Home'))
      .toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(api.count(ACCOUNTS_KEY)).toBe(1)
    expect(api.count(TOKEN_KEY)).toBe(1)
  })

  it('never writes the token to localStorage, sessionStorage or document.cookie', async () => {
    const { mem, rendered } = setup({ accounts: [A], chosen: ACCOUNT_A })
    const { screen } = await rendered
    await expect
      .element(screen.getByText('Protected: Home'))
      .toBeInTheDocument()
    expect([...mem.data.keys()]).toEqual(['mm_account_id'])
    expect([...mem.data.values()].join()).not.toContain(TOKEN)
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        expect(store.getItem(store.key(i)!)).not.toContain(TOKEN)
      }
    }
    expect(document.cookie).not.toContain(TOKEN)
  })

  it('renders no protected child (and runs no query) until the token check passes', async () => {
    let release = () => {}
    const onQuery = vi.fn()
    const { rendered } = setup({
      accounts: [A],
      chosen: ACCOUNT_A,
      onQuery,
      routes: {
        [TOKEN_KEY]: () =>
          new Promise<Response>((r) => {
            release = () => r(tokenResponse())
          }),
      },
    })
    const { screen } = await rendered
    await vi.waitFor(() => expect(release).not.toBe(undefined))
    await new Promise((r) => setTimeout(r, 50))
    await expect
      .element(screen.getByText(/^Protected:/))
      .not.toBeInTheDocument()
    expect(onQuery).not.toHaveBeenCalled()
    release()
    await expect
      .element(screen.getByText('Protected: Home'))
      .toBeInTheDocument()
    await vi.waitFor(() => expect(onQuery).toHaveBeenCalled())
  })

  it('needs-account shows the picker; choosing an account checks the token and renders the app', async () => {
    const { api, mem, rendered } = setup({ accounts: [A, B] })
    const { screen } = await rendered
    await expect
      .element(screen.getByRole('heading', { name: 'Choose an account' }))
      .toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: /Continue as b@staff\.test/ })
    )
    await expect
      .element(screen.getByText('Protected: Home'))
      .toBeInTheDocument()
    expect(mem.data.get('mm_account_id')).toBe(ACCOUNT_B)
    expect(
      api.calls.find((c) => c.path.endsWith('/token'))?.body
    ).toMatchObject({ account_id: ACCOUNT_B, audience: 'admin' })
  })

  it('accounts error shows retry, does not redirect to sign-in', async () => {
    const { rendered } = setup({
      accounts: [A],
      chosen: ACCOUNT_A,
      routes: {
        [ACCOUNTS_KEY]: [
          () => {
            throw new TypeError('Failed to fetch')
          },
          () =>
            new Response(JSON.stringify({ items: [A] }), {
              headers: { 'content-type': 'application/json' },
            }),
        ],
      },
    })
    const { screen, router } = await rendered
    await expect
      .element(
        screen.getByRole('heading', { name: 'Could not reach mmlabs Identity' })
      )
      .toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expect
      .element(screen.getByText('Protected: Home'))
      .toBeInTheDocument()
  })

  it('token 429 shows the wait time', async () => {
    const { rendered } = setup({
      accounts: [A],
      chosen: ACCOUNT_A,
      routes: {
        [TOKEN_KEY]: () =>
          envelope(429, 'rate_limited', null, { 'Retry-After': '90' }),
      },
    })
    const { screen } = await rendered
    await expect
      .element(screen.getByText('Too many requests. Try again in 2 min.'))
      .toBeInTheDocument()
  })

  it('network failure shows retry', async () => {
    const { rendered } = setup({
      accounts: [A],
      chosen: ACCOUNT_A,
      routes: {
        [TOKEN_KEY]: [
          () => {
            throw new TypeError('Failed to fetch')
          },
          tokenResponse,
        ],
      },
    })
    const { screen } = await rendered
    await expect
      .element(screen.getByText('Could not reach the server.'))
      .toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expect
      .element(screen.getByText('Protected: Home'))
      .toBeInTheDocument()
  })

  it('config error shows the request id and no retry', async () => {
    const { rendered } = setup({
      accounts: [A],
      chosen: ACCOUNT_A,
      routes: {
        [TOKEN_KEY]: () =>
          envelope(403, 'origin_not_allowed', null, {
            'X-Request-ID': 'req-42',
          }),
      },
    })
    const { screen } = await rendered
    await expect
      .element(screen.getByText('Request ID: req-42'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Retry' }))
      .not.toBeInTheDocument()
  })

  it('unauthorized signal re-lists accounts and force-refreshes the token; a second signal within 60 s shows the "session rejected" panel', async () => {
    const { api, rendered } = setup({ accounts: [A], chosen: ACCOUNT_A })
    const { screen } = await rendered
    await expect
      .element(screen.getByText('Protected: Home'))
      .toBeInTheDocument()
    expect(api.count(TOKEN_KEY)).toBe(1)

    useSessionRecheck.getState().request()
    await vi.waitFor(() => expect(api.count(TOKEN_KEY)).toBe(2))
    expect(api.count(ACCOUNTS_KEY)).toBe(2)
    await expect
      .element(screen.getByText('Protected: Home'))
      .toBeInTheDocument()

    useSessionRecheck.getState().request()
    await expect
      .element(screen.getByText('The admin API did not accept your session.'))
      .toBeInTheDocument()
    expect(api.count(TOKEN_KEY)).toBe(2)
  })

  it('account switch (selectAccount) clears the query cache and re-checks the token', async () => {
    const { api, client, rendered } = setup({
      accounts: [A, B],
      chosen: ACCOUNT_A,
    })
    const { screen, queryClient } = await rendered
    await expect
      .element(screen.getByText('Protected: Home'))
      .toBeInTheDocument()
    queryClient.setQueryData(['secret'], 'account-a-data')
    client.selectAccount(ACCOUNT_B)
    await vi.waitFor(() => expect(api.count(TOKEN_KEY)).toBe(2))
    expect(queryClient.getQueryData(['secret'])).toBeUndefined()
    expect(
      api.calls.filter((c) => c.path.endsWith('/token'))[1]?.body
    ).toMatchObject({ account_id: ACCOUNT_B })
  })
})
