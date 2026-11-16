import {
  ACCOUNT_A,
  ACCOUNT_B,
  createTestAuthClient,
  fakeIdentityApi,
  memoryStorage,
  renderWithAuth,
  row,
} from '@/test-utils/auth'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { SidebarProvider } from '@/components/ui/sidebar'
import { NavUser } from './nav-user'

async function setup() {
  const api = fakeIdentityApi({
    accounts: [
      row(ACCOUNT_A, 'a@staff.test', true, 'Ann Staff'),
      row(ACCOUNT_B, 'b@staff.test'),
    ],
  })
  const mem = memoryStorage({ mm_account_id: ACCOUNT_A })
  const client = createTestAuthClient(api, { storage: mem.storage })
  const rendered = await renderWithAuth({
    client,
    path: '/users',
    extra: (
      <SidebarProvider>
        <NavUser />
      </SidebarProvider>
    ),
  })
  await userEvent.click(
    rendered.screen.getByRole('button', { name: /Ann Staff/ })
  )
  return { mem, ...rendered }
}

describe('NavUser', () => {
  it('shows the current account; switch account calls selectAccount and goes to "/"; no Billing / Upgrade items', async () => {
    const { screen, mem, router } = await setup()
    await expect.element(screen.getByText('a@staff.test').first()).toBeVisible()
    await expect
      .element(screen.getByRole('menuitem', { name: /Billing/ }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('menuitem', { name: /Upgrade/ }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('menuitem', { name: 'Use another account' }))
      .toBeVisible()
    await expect
      .element(
        screen.getByRole('menuitem', { name: 'Sign out of all accounts' })
      )
      .toBeVisible()

    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Switch to b@staff.test' })
    )
    expect(mem.data.get('mm_account_id')).toBe(ACCOUNT_B)
    await expect.poll(() => router.state.location.pathname).toBe('/')
  })
})
