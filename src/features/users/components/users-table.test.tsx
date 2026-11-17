import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { type ApiClient } from '@/api'
import { apiError, fakeApi, json, testQueryClient } from '@/test-utils/api'
import { WithPermissions } from '@/test-utils/permissions'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { type User } from '../data/schema'
import { UsersDialogs } from './users-dialogs'
import { UsersProvider } from './users-provider'
import { UsersTable } from './users-table'

const USERS: User[] = [
  {
    id: '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c01',
    email: 'alice@example.com',
    display_name: 'Alice Nguyen',
    status: 'active',
    email_verified_at: '2026-02-01T10:00:00Z',
    created_at: '2026-01-15T08:30:00Z',
    updated_at: '2026-02-01T10:00:00Z',
  },
  {
    id: '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c02',
    email: 'bob@example.com',
    display_name: null,
    status: 'disabled',
    email_verified_at: null,
    created_at: '2026-03-10T12:00:00Z',
    updated_at: '2026-04-01T09:00:00Z',
  },
]

const usersPage = (items: User[] = USERS, total = items.length) =>
  json({ items, total, limit: 10, offset: 0 })

function Table() {
  const [search, setSearch] = useState<Record<string, unknown>>({})
  const navigate: NavigateFn = ({ search: next }) => {
    if (next === true) return
    setSearch((prev) => (typeof next === 'function' ? next(prev) : next))
  }
  return (
    <>
      <output data-testid='search'>{JSON.stringify(search)}</output>
      <UsersTable search={search} navigate={navigate} />
      <UsersDialogs />
    </>
  )
}

function renderUsers(
  client: ApiClient,
  granted?: Parameters<typeof WithPermissions>[0]['granted'],
  userId?: string
) {
  const tree = (
    <QueryClientProvider client={testQueryClient()}>
      <UsersProvider api={client}>
        <Table />
      </UsersProvider>
    </QueryClientProvider>
  )
  return render(
    granted ? (
      <WithPermissions granted={granted} userId={userId}>
        {tree}
      </WithPermissions>
    ) : (
      tree
    )
  )
}

const lastListUrl = (seen: Request[]) =>
  listCalls(seen)[listCalls(seen).length - 1]?.url
const listCalls = (seen: Request[]) =>
  seen.filter((r) => new URL(r.url).pathname === '/api/v1/users')

describe('UsersTable', () => {
  it('loading: a never-resolving fetch shows the loading status', async () => {
    const { client } = fakeApi(() => new Promise<Response>(() => {}))
    const screen = await renderUsers(client)
    await expect.element(screen.getByText('Loading users…')).toBeVisible()
  })

  it('renders rows from the API', async () => {
    const { client } = fakeApi(() => usersPage())
    const screen = await renderUsers(client)
    await expect
      .element(screen.getByText('alice@example.com', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByText('Alice Nguyen')).toBeVisible()
    await expect.element(screen.getByText('Disabled')).toBeVisible()
    await expect.element(screen.getByText('Not verified')).toBeVisible()
    // header row + 2 data rows
    expect(screen.getByRole('row').elements()).toHaveLength(3)
  })

  it('empty (no filters)', async () => {
    const { client } = fakeApi(() => usersPage([]))
    const screen = await renderUsers(client)
    await expect.element(screen.getByText('No users yet.')).toBeVisible()
  })

  it('empty (filtered)', async () => {
    const { client } = fakeApi(() => usersPage([]))
    const screen = await renderUsers(client)
    await userEvent.fill(screen.getByPlaceholder('Filter by email...'), 'zzz')
    await expect
      .element(screen.getByText('No users match these filters.'))
      .toBeVisible()
  })

  it('error shows an alert and Retry refetches', async () => {
    let fail = true
    const { client, seen } = fakeApi(() =>
      fail ? apiError(500, 'internal_error') : usersPage()
    )
    const screen = await renderUsers(client)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("Couldn't load users.")
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expect
      .element(screen.getByText('alice@example.com', { exact: true }))
      .toBeVisible()
    expect(listCalls(seen)).toHaveLength(2)
  })

  it('403 renders ForbiddenPanel and hides the table', async () => {
    const { client } = fakeApi(() =>
      apiError(403, 'permission_denied', { required: 'admin:users:read' })
    )
    const screen = await renderUsers(client)
    await expect
      .element(screen.getByText('admin:users:read', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByRole('table')).not.toBeInTheDocument()
    await expect
      .element(screen.getByPlaceholder('Filter by email...'))
      .not.toBeInTheDocument()
  })

  it('403 on refetch replaces stale rows', async () => {
    let forbid = false
    const { client } = fakeApi(() =>
      forbid ? apiError(403, 'permission_denied') : usersPage()
    )
    const screen = await renderUsers(client)
    await expect
      .element(screen.getByText('alice@example.com', { exact: true }))
      .toBeVisible()
    forbid = true
    // Changing the status filter issues a new request that is now forbidden.
    await userEvent.click(screen.getByRole('button', { name: /Status/ }))
    await userEvent.click(screen.getByRole('option', { name: /Disabled/ }))
    await expect
      .element(screen.getByText("You don't have permission to do this"))
      .toBeVisible()
    await expect
      .element(screen.getByText('alice@example.com', { exact: true }))
      .not.toBeInTheDocument()
  })

  it('next page requests offset=10 and updates ?page', async () => {
    const { client, seen } = fakeApi(() => usersPage(USERS, 25))
    const screen = await renderUsers(client)
    await expect
      .element(screen.getByText('alice@example.com', { exact: true }))
      .toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Go to next page' })
    )
    await expect
      .element(screen.getByTestId('search'))
      .toHaveTextContent('"page":2')
    await expect
      .poll(() =>
        listCalls(seen).map((r) => new URL(r.url).searchParams.get('offset'))
      )
      .toContain('10')
  })

  it('typed email is debounced, trimmed and sent as email=, and resets the page', async () => {
    const { client, seen } = fakeApi(() => usersPage())
    const screen = await renderUsers(client)
    await expect
      .element(screen.getByText('alice@example.com', { exact: true }))
      .toBeVisible()
    await userEvent.fill(screen.getByPlaceholder('Filter by email...'), ' bob ')
    await expect
      .poll(() =>
        listCalls(seen).map((r) => new URL(r.url).searchParams.get('email'))
      )
      .toEqual([null, 'bob'])
  })

  it('typed email never reaches the URL search', async () => {
    const { client, seen } = fakeApi(() => usersPage())
    const screen = await renderUsers(client)
    await userEvent.fill(
      screen.getByPlaceholder('Filter by email...'),
      'alice@example.com'
    )
    await expect
      .poll(() =>
        listCalls(seen).some((r) => r.url.includes('email=alice%40example.com'))
      )
      .toBe(true)
    const search = screen.getByTestId('search').element().textContent ?? ''
    expect(search).not.toContain('email')
    expect(search).not.toContain('alice')
  })

  it('one status sends status=disabled; both statuses send none', async () => {
    const { client, seen } = fakeApi(() => usersPage())
    const screen = await renderUsers(client)
    await userEvent.click(screen.getByRole('button', { name: /Status/ }))
    await userEvent.click(screen.getByRole('option', { name: /Disabled/ }))
    await expect
      .element(screen.getByTestId('search'))
      .toHaveTextContent('"status":["disabled"]')
    await expect.poll(() => lastListUrl(seen)).toContain('status=disabled')
    await userEvent.click(screen.getByRole('option', { name: /Active/ }))
    await expect.poll(() => lastListUrl(seen)).not.toContain('status=')
  })

  it('column headers have no sort buttons', async () => {
    const { client } = fakeApi(() => usersPage())
    const screen = await renderUsers(client)
    await expect
      .element(screen.getByRole('columnheader', { name: 'Email', exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('columnheader').getByRole('button'))
      .not.toBeInTheDocument()
  })

  it('has no row-selection checkboxes and no bulk toolbar', async () => {
    const { client } = fakeApi(() => usersPage())
    const screen = await renderUsers(client)
    await expect
      .element(screen.getByText('alice@example.com', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByRole('checkbox')).not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Disable selected users' }))
      .not.toBeInTheDocument()
  })

  it('without admin:users:write Enable/Disable are hidden and View details shows', async () => {
    const { client } = fakeApi(() => usersPage())
    const screen = await renderUsers(client, ['admin:users:read'])
    await userEvent.click(
      screen.getByRole('button', { name: 'Open actions for alice@example.com' })
    )
    await expect
      .element(screen.getByRole('menuitem', { name: /View details/ }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('menuitem', { name: /Disable/ }))
      .not.toBeInTheDocument()
  })

  describe('own row (PAN-011b)', () => {
    const WRITE = ['admin:users:read', 'admin:users:write'] as const

    it('own row: Disable is a disabled item with a visible reason and the trigger names it as your account', async () => {
      const { client } = fakeApi(() => usersPage())
      const screen = await renderUsers(
        client,
        [...WRITE],
        USERS[0].id.toUpperCase()
      )
      await userEvent.click(
        screen.getByRole('button', {
          name: 'Open actions for alice@example.com (your account)',
        })
      )
      const item = screen.getByRole('menuitem', { name: /Disable/ })
      await expect.element(item).toHaveAttribute('aria-disabled', 'true')
      await expect
        .element(screen.getByText("You can't change your own status"))
        .toBeVisible()
    })

    it('own row stays enabled while user_id is unknown', async () => {
      const { client } = fakeApi(() => usersPage())
      const screen = await renderUsers(client, [...WRITE])
      await userEvent.click(
        screen.getByRole('button', {
          name: 'Open actions for alice@example.com',
        })
      )
      await expect
        .element(screen.getByRole('menuitem', { name: /Disable/ }))
        .not.toHaveAttribute('aria-disabled', 'true')
    })

    it('other rows stay enabled; Disable still opens the confirm naming the target', async () => {
      const { client } = fakeApi(() => usersPage())
      const screen = await renderUsers(client, [...WRITE], USERS[1].id)
      await userEvent.click(
        screen.getByRole('button', {
          name: 'Open actions for alice@example.com',
        })
      )
      await userEvent.click(screen.getByRole('menuitem', { name: /Disable/ }))
      await expect
        .element(screen.getByRole('alertdialog'))
        .toHaveTextContent('alice@example.com')
    })
  })
})
