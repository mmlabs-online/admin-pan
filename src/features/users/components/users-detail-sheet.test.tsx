import { QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { type ApiClient } from '@/api'
import { apiError, fakeApi, json, testQueryClient } from '@/test-utils/api'
import { WithPermissions } from '@/test-utils/permissions'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { type RoleAssignment, type User } from '../data/schema'
import { UsersDialogs } from './users-dialogs'
import { UsersProvider } from './users-provider'
import { UsersTable } from './users-table'

const ALICE: User = {
  id: '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c01',
  email: 'alice@example.com',
  display_name: 'Alice Nguyen',
  status: 'active',
  email_verified_at: '2026-02-01T10:00:00Z',
  created_at: '2026-01-15T08:30:00Z',
  updated_at: '2026-02-01T10:00:00Z',
}
const ORG = '7d1f0c52-9a3b-4e6f-8c21-5b4a3d2e1f00'

const assignment = (over: Partial<RoleAssignment>): RoleAssignment => ({
  id: '11111111-1111-4111-8111-111111111111',
  app: 'stoktok',
  role_id: '22222222-2222-4222-8222-222222222222',
  role_key: 'member',
  org_id: null,
  expires_at: null,
  active: true,
  granted_by: null,
  created_at: '2026-03-01T00:00:00Z',
  ...over,
})

type Respond = (path: string) => Response | Promise<Response>

function setup(respond: Respond) {
  const api = fakeApi((req) => {
    const path = new URL(req.url).pathname
    return path === '/api/v1/users'
      ? json({ items: [ALICE], total: 1, limit: 10, offset: 0 })
      : respond(path)
  })
  return api
}

async function openDetails(
  client: ApiClient,
  granted?: Parameters<typeof WithPermissions>[0]['granted']
) {
  // The sheet renders router <Link>s, so it needs a router around it.
  const Page = () => {
    const tree = (
      <>
        <UsersTable search={{}} navigate={() => {}} />
        <UsersDialogs />
      </>
    )
    return granted ? (
      <WithPermissions granted={granted}>{tree}</WithPermissions>
    ) : (
      tree
    )
  }
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/', component: Page }),
      createRoute({
        getParentRoute: () => root,
        path: '/audit-log',
        component: () => null,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const screen = await render(
    <QueryClientProvider client={testQueryClient()}>
      <UsersProvider api={client}>
        <RouterProvider router={router} />
      </UsersProvider>
    </QueryClientProvider>
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Open actions for alice@example.com' })
  )
  await userEvent.click(screen.getByRole('menuitem', { name: /View details/ }))
  return screen.getByRole('dialog')
}

const USER_PATH = `/api/v1/users/${ALICE.id}`
const emptyPage = () => json({ items: [], total: 0, limit: 100, offset: 0 })

describe('UsersDetailSheet', () => {
  it('shows the list row immediately, then the fetched user', async () => {
    let release: (r: Response) => void = () => {}
    const { client } = setup((path) =>
      path === USER_PATH
        ? new Promise<Response>((resolve) => (release = resolve))
        : emptyPage()
    )
    const sheet = await openDetails(client)
    await expect
      .element(sheet.getByRole('heading', { name: 'Alice Nguyen' }))
      .toBeVisible()
    release(json({ ...ALICE, display_name: 'Alice Fetched' }))
    await expect
      .element(sheet.getByRole('heading', { name: 'Alice Fetched' }))
      .toBeVisible()
  })

  it('detail 404 shows "This user no longer exists."', async () => {
    const { client } = setup((path) =>
      path === USER_PATH ? apiError(404, 'not_found') : emptyPage()
    )
    const sheet = await openDetails(client)
    await expect
      .element(sheet.getByText('This user no longer exists.'))
      .toBeVisible()
  })

  it('assignments: loading status shows while the user fields render', async () => {
    const { client } = setup((path) =>
      path === USER_PATH ? json(ALICE) : new Promise<Response>(() => {})
    )
    const sheet = await openDetails(client)
    await expect
      .element(sheet.getByText('Loading role assignments…'))
      .toBeVisible()
    await expect.element(sheet.getByText(ALICE.id)).toBeVisible()
  })

  it('assignments: rows with app-wide and org scope, expiry and Inactive', async () => {
    const { client } = setup((path) =>
      path === USER_PATH
        ? json(ALICE)
        : json({
            items: [
              assignment({}),
              assignment({
                id: '33333333-3333-4333-8333-333333333333',
                app: 'admin',
                role_key: 'viewer',
                org_id: ORG,
                expires_at: '2030-01-01T00:00:00Z',
                active: false,
              }),
            ],
            total: 2,
            limit: 100,
            offset: 0,
          })
    )
    const sheet = await openDetails(client)
    const table = sheet.getByRole('table', { name: 'Apps & roles' })
    await expect.element(table.getByText('stoktok')).toBeVisible()
    await expect.element(table.getByText('App-wide')).toBeVisible()
    await expect.element(table.getByText('Never')).toBeVisible()
    await expect.element(table.getByText(ORG)).toBeVisible()
    await expect.element(table.getByText('viewer')).toBeVisible()
    await expect.element(table.getByText('Inactive')).toBeVisible()
    await expect
      .element(table.getByText('Active', { exact: true }))
      .toBeVisible()
    await expect
      .element(table.getByRole('columnheader', { name: 'Expires' }))
      .toBeVisible()
  })

  it('assignments: empty', async () => {
    const { client } = setup((path) =>
      path === USER_PATH ? json(ALICE) : emptyPage()
    )
    const sheet = await openDetails(client)
    await expect.element(sheet.getByText('No role assignments.')).toBeVisible()
  })

  it('assignments: error shows an alert with Retry and keeps the user fields', async () => {
    const { client } = setup((path) =>
      path === USER_PATH ? json(ALICE) : apiError(500, 'internal_error')
    )
    const sheet = await openDetails(client)
    await expect
      .element(sheet.getByRole('alert'))
      .toHaveTextContent("Couldn't load role assignments.")
    await expect
      .element(sheet.getByRole('button', { name: 'Retry' }))
      .toBeVisible()
    await expect.element(sheet.getByText(ALICE.id)).toBeVisible()
  })

  it('assignments: 403 shows an inline panel and keeps the user fields', async () => {
    const { client } = setup((path) =>
      path === USER_PATH ? json(ALICE) : apiError(403, 'permission_denied')
    )
    const sheet = await openDetails(client)
    await expect
      .element(sheet.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
    await expect.element(sheet.getByText(ALICE.id)).toBeVisible()
  })

  it('assignments: total 130 with 100 items shows "Showing 100 of 130"', async () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      assignment({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      })
    )
    const { client } = setup((path) =>
      path === USER_PATH
        ? json(ALICE)
        : json({ items, total: 130, limit: 100, offset: 0 })
    )
    const sheet = await openDetails(client)
    await expect.element(sheet.getByText('Showing 100 of 130')).toBeVisible()
  })

  it('has no Preview badge or sample data', async () => {
    const { client } = setup((path) =>
      path === USER_PATH ? json(ALICE) : emptyPage()
    )
    const sheet = await openDetails(client)
    await expect.element(sheet.getByText('No role assignments.')).toBeVisible()
    await expect.element(sheet.getByText('Preview')).not.toBeInTheDocument()
    await expect.element(sheet.getByText('Sample data')).not.toBeInTheDocument()
  })

  it('with admin:audit:read shows "Events about this user" and "Actions by this user" links', async () => {
    const { client } = setup((path) =>
      path === USER_PATH ? json(ALICE) : emptyPage()
    )
    const sheet = await openDetails(client, [
      'admin:users:read',
      'admin:audit:read',
    ])
    const about = sheet.getByRole('link', { name: 'Events about this user' })
    await expect.element(about).toBeVisible()
    const aboutHref = new URL(
      (await about.element()).getAttribute('href')!,
      'http://x'
    )
    expect(aboutHref.pathname).toBe('/audit-log')
    expect(aboutHref.searchParams.get('targetType')).toBe('user')
    expect(aboutHref.searchParams.get('target')).toBe(ALICE.id)
    const by = await sheet
      .getByRole('link', { name: 'Actions by this user' })
      .element()
    const byHref = new URL(by.getAttribute('href')!, 'http://x')
    expect(byHref.searchParams.get('actor')).toBe(ALICE.id)
    expect(byHref.searchParams.has('target')).toBe(false)
  })

  it('without admin:audit:read the links are hidden', async () => {
    const { client } = setup((path) =>
      path === USER_PATH ? json(ALICE) : emptyPage()
    )
    const sheet = await openDetails(client, ['admin:users:read'])
    await expect
      .element(sheet.getByRole('heading', { name: 'Alice Nguyen' }))
      .toBeVisible()
    await expect
      .element(sheet.getByRole('link', { name: 'Events about this user' }))
      .not.toBeInTheDocument()
    await expect
      .element(sheet.getByRole('heading', { name: 'Audit history' }))
      .not.toBeInTheDocument()
  })
})
