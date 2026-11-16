import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { createApiClient, setUnauthorizedHandler } from '@/api'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { shouldRetryQuery } from '@/lib/query-client'
import { queryView } from '@/lib/query-view'
import { organizationsListQueryOptions } from '@/features/organizations/api/queries'
import { ForbiddenPanel } from './forbidden-panel'

const BASE = 'https://api.test'

const envelope = (code: string, details: unknown = null) =>
  new Response(
    JSON.stringify({ error: { code, message: 'secret text', details } }),
    { status: 403, headers: { 'content-type': 'application/json' } }
  )
const page = () =>
  new Response(JSON.stringify({ items: [], total: 0, limit: 20, offset: 0 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

function setup(responses: (() => Response)[]) {
  const fetch = vi.fn(async () => {
    const next = responses.length > 1 ? responses.shift()! : responses[0]
    return next()
  })
  const client = createApiClient({
    baseUrl: BASE,
    fetch: fetch as unknown as typeof globalThis.fetch,
  })
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (n, e) => shouldRetryQuery(n, e, { dev: false }),
        retryDelay: 0,
      },
    },
  })
  function Probe() {
    const q = useQuery(organizationsListQueryOptions({}, client))
    const view = queryView(q)
    if (view.status === 'forbidden')
      return (
        <>
          <ForbiddenPanel copy={view.copy} variant='inline' />
          <button onClick={() => void q.refetch()}>Refetch</button>
        </>
      )
    if (view.status === 'success')
      return (
        <>
          <p>Loaded {view.data.total}</p>
          <button onClick={() => void q.refetch()}>Refetch</button>
        </>
      )
    return <p>Pending or error</p>
  }
  return {
    fetch,
    ui: (
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>
    ),
  }
}

describe('ForbiddenPanel', () => {
  it('renders title, description and the required permission as text', async () => {
    const screen = await render(
      <ForbiddenPanel
        copy={{
          title: 'T',
          description: 'D',
          required: 'admin:users:read',
        }}
      />
    )
    await expect
      .element(screen.getByRole('heading', { name: 'T' }))
      .toBeInTheDocument()
    await expect.element(screen.getByRole('alert')).toHaveTextContent('D')
    await expect
      .element(screen.getByText('admin:users:read'))
      .toBeInTheDocument()
  })

  it('Try again and Go back call their handlers; they are absent when no handler is given', async () => {
    const onRetry = vi.fn()
    const onBack = vi.fn()
    const copy = { title: 'T', description: 'D' }
    const screen = await render(
      <ForbiddenPanel copy={copy} onRetry={onRetry} onBack={onBack} />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await userEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onBack).toHaveBeenCalledOnce()
    await screen.unmount()

    const bare = await render(<ForbiddenPanel copy={copy} />)
    await expect
      .element(bare.getByRole('button', { name: 'Try again' }))
      .not.toBeInTheDocument()
    await expect
      .element(bare.getByRole('button', { name: 'Go back' }))
      .not.toBeInTheDocument()
  })

  it('a 403 query renders the forbidden panel with the required permission', async () => {
    const { ui } = setup([
      () =>
        envelope('permission_denied', { required: 'admin:organizations:read' }),
    ])
    const screen = await render(ui)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Required permission: admin:organizations:read')
    await expect
      .element(screen.getByText('secret text'))
      .not.toBeInTheDocument()
  })

  it('data then a 403 on refetch replaces the data with the panel', async () => {
    const { ui } = setup([page, () => envelope('permission_denied')])
    const screen = await render(ui)
    await expect.element(screen.getByText('Loaded 0')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Refetch' }))
    await expect.element(screen.getByRole('alert')).toBeInTheDocument()
    await expect.element(screen.getByText('Loaded 0')).not.toBeInTheDocument()
  })

  it('a 403 never calls the unauthorized handler and is fetched once', async () => {
    const spy = vi.fn()
    setUnauthorizedHandler(spy)
    const { ui, fetch } = setup([() => envelope('permission_denied')])
    const screen = await render(ui)
    await expect.element(screen.getByRole('alert')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(spy).not.toHaveBeenCalled()
    setUnauthorizedHandler(() => {})
  })
})
