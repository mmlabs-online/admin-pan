import { useState } from 'react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { type User } from '../data/schema'
import { users as mockUsers } from '../data/users'
import { UsersDialogs } from './users-dialogs'
import { UsersProvider, useUsers } from './users-provider'
import { UsersTable } from './users-table'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn() },
}))

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
  {
    id: '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c03',
    email: 'carol@example.com',
    display_name: 'Carol Tran',
    status: 'active',
    email_verified_at: '2026-05-05T05:05:00Z',
    created_at: '2026-05-01T07:00:00Z',
    updated_at: '2026-05-05T05:05:00Z',
  },
]

function Table() {
  const { users } = useUsers()
  const [search, setSearch] = useState<Record<string, unknown>>({})
  const navigate: NavigateFn = ({ search: next }) => {
    if (next === true) return
    setSearch((prev) => (typeof next === 'function' ? next(prev) : next))
  }
  return (
    <>
      <output data-testid='search'>{JSON.stringify(search)}</output>
      <UsersTable data={users} search={search} navigate={navigate} />
      <UsersDialogs />
    </>
  )
}

function renderUsers(initialUsers: User[] = USERS) {
  return render(
    <UsersProvider initialUsers={initialUsers}>
      <Table />
    </UsersProvider>
  )
}

describe('mock users data', () => {
  it('has ~200 users matching the UserRead shape', () => {
    expect(mockUsers).toHaveLength(200)
    expect(Object.keys(mockUsers[0]).sort()).toEqual(
      [
        'created_at',
        'display_name',
        'email',
        'email_verified_at',
        'id',
        'status',
        'updated_at',
      ].sort()
    )
  })
})

describe('UsersTable', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders one row per user with status and verification', async () => {
    const screen = await renderUsers()

    await expect
      .element(screen.getByText('alice@example.com', { exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByText('bob@example.com', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByText('Carol Tran')).toBeVisible()
    await expect.element(screen.getByText('Disabled')).toBeVisible()
    await expect.element(screen.getByText('Not verified')).toBeVisible()
    // header row + 3 data rows
    expect(screen.getByRole('row').elements()).toHaveLength(4)
  })

  it('filters by email and syncs it to the URL search', async () => {
    const screen = await renderUsers()

    await userEvent.fill(screen.getByPlaceholder('Filter by email...'), 'carol')

    await expect
      .element(screen.getByText('carol@example.com', { exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByText('alice@example.com', { exact: true }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByTestId('search'))
      .toHaveTextContent('"email":"carol"')
  })

  it('filters by status facet', async () => {
    const screen = await renderUsers()

    await userEvent.click(screen.getByRole('button', { name: /Status/ }))
    await userEvent.click(screen.getByRole('option', { name: /Disabled/ }))

    await expect
      .element(screen.getByText('bob@example.com', { exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByText('alice@example.com', { exact: true }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByTestId('search'))
      .toHaveTextContent('"status":["disabled"]')
  })

  it('disables a user after confirming the dialog naming the user', async () => {
    const screen = await renderUsers()

    await userEvent.click(
      screen.getByRole('button', { name: 'Open actions for alice@example.com' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: /Disable/ }))

    const dialog = screen.getByRole('alertdialog')
    await expect
      .element(dialog.getByRole('heading', { name: 'Disable user' }))
      .toBeVisible()
    await expect.element(dialog.getByText('alice@example.com')).toBeVisible()

    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))

    await expect.element(dialog).not.toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Disabled alice@example.com')
    // Alice and Bob are now both disabled
    expect(
      screen.getByText('Disabled', { exact: true }).elements()
    ).toHaveLength(2)
  })

  it('keeps the user active when the confirm dialog is cancelled', async () => {
    const screen = await renderUsers()

    await userEvent.click(
      screen.getByRole('button', { name: 'Open actions for alice@example.com' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: /Disable/ }))
    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    await expect.element(dialog).not.toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
    expect(
      screen.getByText('Disabled', { exact: true }).elements()
    ).toHaveLength(1)
  })

  it('enables a disabled user', async () => {
    const screen = await renderUsers()

    await userEvent.click(
      screen.getByRole('button', { name: 'Open actions for bob@example.com' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: /Enable/ }))
    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(dialog.getByRole('button', { name: 'Enable' }))

    expect(toast.success).toHaveBeenCalledWith('Enabled bob@example.com')
    await expect
      .element(screen.getByText('Disabled', { exact: true }))
      .not.toBeInTheDocument()
  })

  it('shows user details with the apps & roles preview', async () => {
    const screen = await renderUsers()

    await userEvent.click(
      screen.getByRole('button', { name: 'Open actions for alice@example.com' })
    )
    await userEvent.click(
      screen.getByRole('menuitem', { name: /View details/ })
    )

    const sheet = screen.getByRole('dialog')
    await expect
      .element(sheet.getByRole('heading', { name: 'Alice Nguyen' }))
      .toBeVisible()
    await expect.element(sheet.getByText(USERS[0].id)).toBeVisible()
    await expect.element(sheet.getByText('Preview')).toBeVisible()
  })

  it('bulk disables selected active users after confirmation', async () => {
    const screen = await renderUsers()

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select alice@example.com' })
    )
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select carol@example.com' })
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Disable selected users' })
    )

    const dialog = screen.getByRole('alertdialog')
    await expect
      .element(dialog.getByRole('heading', { name: 'Disable 2 users' }))
      .toBeVisible()
    await expect.element(dialog.getByText('carol@example.com')).toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))

    expect(toast.success).toHaveBeenCalledWith('Disabled 2 users')
    expect(
      screen.getByText('Disabled', { exact: true }).elements()
    ).toHaveLength(3)
  })
})
