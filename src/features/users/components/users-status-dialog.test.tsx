import { QueryClientProvider } from '@tanstack/react-query'
import { type ApiClient } from '@/api'
import { apiError, fakeApi, json, testQueryClient } from '@/test-utils/api'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { type User } from '../data/schema'
import { UsersDialogs } from './users-dialogs'
import { UsersProvider } from './users-provider'
import { UsersTable } from './users-table'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn() },
}))

const ALICE: User = {
  id: '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c01',
  email: 'alice@example.com',
  display_name: 'Alice Nguyen',
  status: 'active',
  email_verified_at: '2026-02-01T10:00:00Z',
  created_at: '2026-01-15T08:30:00Z',
  updated_at: '2026-02-01T10:00:00Z',
}
const BOB: User = {
  ...ALICE,
  id: '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c02',
  email: 'bob@example.com',
  display_name: null,
  status: 'disabled',
}

const noop = () => {}

function renderUsers(client: ApiClient) {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <UsersProvider api={client}>
        <UsersTable search={{}} navigate={noop} />
        <UsersDialogs />
      </UsersProvider>
    </QueryClientProvider>
  )
}

/** List answers from `rows`; PATCH answers via `patch`. */
function server(
  patch: (req: Request) => Response | Promise<Response>,
  rows: () => User[] = () => [ALICE, BOB]
) {
  return fakeApi((req) =>
    req.method === 'PATCH'
      ? patch(req)
      : json({ items: rows(), total: rows().length, limit: 10, offset: 0 })
  )
}

async function openDialog(
  screen: Awaited<ReturnType<typeof renderUsers>>,
  email: string,
  action: RegExp
) {
  await userEvent.click(
    screen.getByRole('button', { name: `Open actions for ${email}` })
  )
  await userEvent.click(screen.getByRole('menuitem', { name: action }))
  return screen.getByRole('alertdialog')
}

const patches = (seen: Request[]) => seen.filter((r) => r.method === 'PATCH')
const lists = (seen: Request[]) =>
  seen.filter(
    (r) => r.method === 'GET' && new URL(r.url).pathname === '/api/v1/users'
  )

describe('UsersStatusDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('confirm names the target and the side effects', async () => {
    const { client } = server(() => json(ALICE))
    const screen = await renderUsers(client)
    const dialog = await openDialog(screen, 'alice@example.com', /Disable/)
    await expect.element(dialog.getByText('alice@example.com')).toBeVisible()
    await expect.element(dialog.getByText(/Alice Nguyen/)).toBeVisible()
    await expect
      .element(dialog.getByText(/signed out of every mmlabs app/))
      .toBeVisible()
    await expect.element(dialog.getByText(/sessions are revoked/)).toBeVisible()
    await expect
      .element(
        dialog.getByText(/password-reset or verification links stop working/)
      )
      .toBeVisible()
  })

  it('pending: dialog open and buttons disabled; the badge changes only after the response', async () => {
    let release: (r: Response) => void = noop
    const { client } = server(
      () => new Promise<Response>((resolve) => (release = resolve))
    )
    const screen = await renderUsers(client)
    await expect
      .element(screen.getByText('Active', { exact: true }))
      .toBeVisible()
    const dialog = await openDialog(screen, 'alice@example.com', /Disable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))

    await expect
      .element(dialog.getByRole('button', { name: 'Cancel' }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(dialog.getByRole('button', { name: 'Disabling…' }))
      .toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).toBeVisible()
    await expect
      .element(screen.getByText('Active', { exact: true }))
      .toBeVisible()

    release(json({ ...ALICE, status: 'disabled' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Disabled alice@example.com')
  })

  it('success sends PATCH and refetches the list, which shows the new status', async () => {
    let status: User['status'] = 'active'
    const { client, seen } = server(
      () => {
        status = 'disabled'
        return json({ ...ALICE, status })
      },
      () => [{ ...ALICE, status }, BOB]
    )
    const screen = await renderUsers(client)
    const dialog = await openDialog(screen, 'alice@example.com', /Disable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))
    await expect.element(dialog).not.toBeInTheDocument()

    expect(patches(seen)).toHaveLength(1)
    expect(await patches(seen)[0].json()).toEqual({ status: 'disabled' })
    await expect.poll(() => lists(seen).length).toBe(2)
    await expect
      .element(screen.getByText('Disabled', { exact: true }).first())
      .toBeVisible()
    expect(
      screen.getByText('Disabled', { exact: true }).elements()
    ).toHaveLength(2)
  })

  it('403 self_status_change_forbidden is shown inline and the dialog stays open', async () => {
    const { client } = server(() =>
      apiError(403, 'self_status_change_forbidden')
    )
    const screen = await renderUsers(client)
    const dialog = await openDialog(screen, 'alice@example.com', /Disable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent("You can't change your own account status")
    await expect.element(dialog).toBeVisible()
    await expect
      .element(dialog.getByText('server text'))
      .not.toBeInTheDocument()
  })

  it('a failure is linked to the confirm button via aria-describedby', async () => {
    const { client } = server(() => apiError(409, 'last_super_admin'))
    const screen = await renderUsers(client)
    const dialog = await openDialog(screen, 'alice@example.com', /Disable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))
    const alert = dialog.getByRole('alert')
    await expect.element(alert).toBeVisible()
    await expect
      .element(dialog.getByRole('button', { name: 'Disable' }))
      .toHaveAttribute('aria-describedby', alert.element().parentElement?.id)
  })

  it('403 admin_wildcard_required is shown inline', async () => {
    const { client } = server(() => apiError(403, 'admin_wildcard_required'))
    const screen = await renderUsers(client)
    const dialog = await openDialog(screen, 'alice@example.com', /Disable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('Only super admins can do this')
  })

  it('409 last_super_admin is shown and the dialog stays open', async () => {
    const { client } = server(() => apiError(409, 'last_super_admin'))
    const screen = await renderUsers(client)
    const dialog = await openDialog(screen, 'alice@example.com', /Disable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent("You can't disable the last active super admin.")
    await expect.element(dialog).toBeVisible()
  })

  it('404 is shown and the list is refetched', async () => {
    const { client, seen } = server(() => apiError(404, 'not_found'))
    const screen = await renderUsers(client)
    const dialog = await openDialog(screen, 'alice@example.com', /Disable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('This user no longer exists.')
    await expect.poll(() => lists(seen).length).toBe(2)
  })

  it('cancel sends no PATCH', async () => {
    const { client, seen } = server(() => json(ALICE))
    const screen = await renderUsers(client)
    const dialog = await openDialog(screen, 'alice@example.com', /Disable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(patches(seen)).toHaveLength(0)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('reopening after an error shows no stale error', async () => {
    const { client } = server(() => apiError(409, 'last_super_admin'))
    const screen = await renderUsers(client)
    let dialog = await openDialog(screen, 'alice@example.com', /Disable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))
    await expect.element(dialog.getByRole('alert')).toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()

    dialog = await openDialog(screen, 'alice@example.com', /Disable/)
    await expect.element(dialog).toBeVisible()
    await expect.element(dialog.getByRole('alert')).not.toBeInTheDocument()
  })

  it('enabling a disabled user sends {"status":"active"}', async () => {
    const { client, seen } = server(() => json({ ...BOB, status: 'active' }))
    const screen = await renderUsers(client)
    const dialog = await openDialog(screen, 'bob@example.com', /Enable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Enable' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await patches(seen)[0].json()).toEqual({ status: 'active' })
    expect(toast.success).toHaveBeenCalledWith('Enabled bob@example.com')
  })
})
