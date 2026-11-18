import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ApiClient } from '@/api'
import { apiError, fakeApi, json } from '@/test-utils/api'
import { WithPermissions } from '@/test-utils/permissions'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { unknownPermissionSource } from '@/lib/permissions/source'
import {
  MePermissionProvider,
  PermissionProvider,
} from '@/context/permission-provider'
import {
  RouteForbiddenPanel,
  RoutePermissionGate,
} from './route-permission-guard'

const gate = (routeId: string) => (
  <RoutePermissionGate
    routeId={routeId}
    fallback={(copy) => <p>Denied: {copy.required}</p>}
  >
    <p>The page</p>
  </RoutePermissionGate>
)

describe('RoutePermissionGate', () => {
  it('a denied route renders the fallback with the required permission, not the page', async () => {
    const screen = await render(
      <WithPermissions granted={[]}>
        {gate('/_authenticated/users/')}
      </WithPermissions>
    )
    await expect
      .element(screen.getByText('Denied: admin:users:read'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('The page')).not.toBeInTheDocument()
  })

  it('an unknown or granted route renders the page', async () => {
    const unknown = await render(
      <PermissionProvider source={unknownPermissionSource}>
        {gate('/_authenticated/users/')}
      </PermissionProvider>
    )
    await expect.element(unknown.getByText('The page')).toBeInTheDocument()
    await unknown.unmount()

    const granted = await render(
      <WithPermissions granted={['admin:users:read']}>
        {gate('/_authenticated/users/')}
      </WithPermissions>
    )
    await expect.element(granted.getByText('The page')).toBeInTheDocument()
  })

  it('`/` without admin:stats:read renders the fallback; with it renders the page', async () => {
    const denied = await render(
      <WithPermissions granted={[]}>{gate('/_authenticated/')}</WithPermissions>
    )
    await expect
      .element(denied.getByText('Denied: admin:stats:read'))
      .toBeInTheDocument()
    await expect.element(denied.getByText('The page')).not.toBeInTheDocument()
    await denied.unmount()

    const granted = await render(
      <WithPermissions granted={['admin:stats:read']}>
        {gate('/_authenticated/')}
      </WithPermissions>
    )
    await expect.element(granted.getByText('The page')).toBeInTheDocument()
  })

  it('a none or pending route renders under a deny-all source', async () => {
    for (const id of [
      '/_authenticated/settings/account',
      '/_authenticated/reports/',
    ]) {
      const screen = await render(
        <WithPermissions granted={[]}>{gate(id)}</WithPermissions>
      )
      await expect.element(screen.getByText('The page')).toBeInTheDocument()
      await screen.unmount()
    }
  })
})

describe('RoutePermissionGate with the real source', () => {
  const mount = (api: ApiClient) =>
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MePermissionProvider accountId='acc' api={api}>
          <RoutePermissionGate
            routeId='/_authenticated/users/'
            fallback={(copy) => (
              <RouteForbiddenPanel copy={copy} onBack={() => {}} />
            )}
          >
            <p>The page</p>
          </RoutePermissionGate>
        </MePermissionProvider>
      </QueryClientProvider>
    )
  const me = (permissions: string[]) =>
    json({ user_id: 'u1', roles: [], permissions })

  it('Try again on a denied route refetches and renders the page when now granted', async () => {
    let granted = false
    const { client, seen } = fakeApi(() =>
      me(granted ? ['admin:users:read'] : [])
    )
    const screen = await mount(client)
    await expect
      .element(screen.getByText("You don't have access to this page"))
      .toBeVisible()
    granted = true
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await expect.element(screen.getByText('The page')).toBeVisible()
    expect(seen).toHaveLength(2)
  })

  it('Try again that is still denied keeps the panel and announces "Still no access"', async () => {
    const { client } = fakeApi(() => me([]))
    const screen = await mount(client)
    await userEvent.click(
      await screen.getByRole('button', { name: 'Try again' }).findElement()
    )
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Still no access after checking again.')
    await expect
      .element(screen.getByRole('button', { name: 'Try again' }))
      .toBeVisible()
  })

  it('Try again whose refetch errors renders the page (fail-open)', async () => {
    let fail = false
    const { client } = fakeApi(() =>
      fail ? apiError(500, 'internal_error') : me([])
    )
    const screen = await mount(client)
    fail = true
    await userEvent.click(
      await screen.getByRole('button', { name: 'Try again' }).findElement()
    )
    await expect.element(screen.getByText('The page')).toBeVisible()
  })

  it('"Checking your permissions…" is in a role=status region while fetching; a second click does not start a second request', async () => {
    let hang = false
    const { client, seen } = fakeApi(() =>
      hang ? new Promise<Response>(() => {}) : me([])
    )
    const screen = await mount(client)
    await expect
      .element(screen.getByRole('button', { name: 'Try again' }))
      .toBeVisible()
    hang = true
    const button = screen.getByRole('button', { name: 'Try again' })
    await userEvent.click(button)
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Checking your permissions…')
    await userEvent.click(button)
    expect(seen).toHaveLength(2)
  })

  it('with the source erroring the page renders, not the panel', async () => {
    const { client } = fakeApi(() => apiError(500, 'internal_error'))
    const screen = await mount(client)
    await expect.element(screen.getByText('The page')).toBeVisible()
  })
})
