import {
  ACCOUNT_A,
  ACCOUNT_B,
  createTestAuthClient,
  fakeIdentityApi,
  memoryStorage,
  renderWithAuth,
  row,
  type Handler,
} from '@/test-utils/auth'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { SignOutDialog } from './sign-out-dialog'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const LOGOUT = 'POST /api/v1/auth/logout'

async function setup(scope: 'account' | 'all', logout?: Handler) {
  const api = fakeIdentityApi({
    accounts: [row(ACCOUNT_A, 'a@staff.test'), row(ACCOUNT_B, 'b@staff.test')],
    routes: logout ? { [LOGOUT]: logout } : {},
  })
  const client = createTestAuthClient(api, {
    storage: memoryStorage({ mm_account_id: ACCOUNT_A }).storage,
  })
  const onOpenChange = vi.fn()
  const rendered = await renderWithAuth({
    client,
    path: '/users?x=1',
    // The dialog sits inside the app (below the gate), like NavUser.
    extra: <SignOutDialog open onOpenChange={onOpenChange} scope={scope} />,
  })
  return { api, onOpenChange, ...rendered }
}

describe('SignOutDialog', () => {
  it('account scope: confirmation names the email; confirm POSTs logout for that account and lands on the picker/sign-in without redirect', async () => {
    const t = await setup('account')
    await expect
      .element(t.screen.getByText(/Sign out a@staff\.test on this browser/))
      .toBeInTheDocument()
    await userEvent.click(t.screen.getByRole('button', { name: /^Sign out$/ }))
    await vi.waitFor(() => expect(t.api.count(LOGOUT)).toBe(1))
    expect(t.api.calls.find((c) => c.path.endsWith('/logout'))?.body).toEqual({
      account_id: ACCOUNT_A,
    })
    expect(t.router.state.location.pathname).toBe('/')
    expect(t.router.state.location.searchStr).toBe('')
    await vi.waitFor(() => expect(t.onOpenChange).toHaveBeenCalledWith(false))
  })

  it('all scope: names "all N accounts"; confirm logs out all and goes to /sign-in with no redirect', async () => {
    const t = await setup('all')
    await expect
      .element(t.screen.getByText(/Sign out all 2 accounts on this browser/))
      .toBeInTheDocument()
    await userEvent.click(
      t.screen.getByRole('button', { name: /^Sign out all$/ })
    )
    await vi.waitFor(() => expect(t.api.count(LOGOUT)).toBe(1))
    expect(t.api.calls.find((c) => c.path.endsWith('/logout'))?.body).toEqual({
      all: true,
    })
    await vi.waitFor(() =>
      expect(t.router.state.location.pathname).toBe('/sign-in')
    )
    expect(t.router.state.location.searchStr).toBe('')
  })

  it('cancel sends nothing', async () => {
    const t = await setup('account')
    await userEvent.click(t.screen.getByRole('button', { name: /^Cancel$/ }))
    expect(t.api.count(LOGOUT)).toBe(0)
    expect(t.router.state.location.pathname).toBe('/users')
  })

  it('server failure shows an error toast (not "signed out") and still ends local state', async () => {
    const t = await setup('all', () => {
      throw new TypeError('Failed to fetch')
    })
    await userEvent.click(
      t.screen.getByRole('button', { name: /^Sign out all$/ })
    )
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Could not reach the server')
      )
    )
    // The library cleared the local selection before the failed call; the
    // server still lists the device session, so the picker shows.
    await expect
      .element(t.screen.getByRole('heading', { name: 'Choose an account' }))
      .toBeInTheDocument()
  })
})
