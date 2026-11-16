import {
  ACCOUNT_A,
  ACCOUNT_B,
  createTestAuthClient,
  envelope,
  fakeIdentityApi,
  memoryStorage,
  renderWithAuth,
  row,
  tokenResponse,
  type Handler,
} from '@/test-utils/auth'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

const TOKEN_KEY = 'POST /api/v1/auth/token'
const notMember: Handler = () =>
  envelope(403, 'not_member', { join_available: false })
const unverified: Handler = () => envelope(403, 'email_unverified')

async function setup(
  token: Handler | Handler[],
  accounts = [row(ACCOUNT_A, 'a@staff.test', false)]
) {
  const api = fakeIdentityApi({ accounts, routes: { [TOKEN_KEY]: token } })
  const client = createTestAuthClient(api, {
    storage: memoryStorage({ mm_account_id: ACCOUNT_A }).storage,
  })
  return { api, ...(await renderWithAuth({ client })) }
}

describe('not_member page', () => {
  it('shows the heading (focused), the account email, use another account and sign out, no join button', async () => {
    const { screen } = await setup(notMember)
    const heading = screen.getByRole('heading', {
      name: 'No access to the admin app',
    })
    await expect.element(heading).toHaveFocus()
    await expect.element(screen.getByText(/a@staff\.test/)).toBeInTheDocument()
    await expect
      .element(screen.getByRole('link', { name: 'Use another account' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Sign out' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: /join/i }))
      .not.toBeInTheDocument()
  })
})

describe('email_unverified page', () => {
  it('is text only: any mmlabs app, no external link, no resend button, never calls /verify-email/resend', async () => {
    const { api, screen } = await setup(unverified)
    await expect
      .element(
        screen.getByRole('heading', { name: 'Verify your email address' })
      )
      .toHaveFocus()
    await expect
      .element(screen.getByText(/any mmlabs app you use/))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: /resend/i }))
      .not.toBeInTheDocument()
    const hrefs = screen.container.querySelectorAll('a[href]')
    for (const a of hrefs) {
      expect(a.getAttribute('href')).toMatch(/^\//)
    }
    expect(api.calls.some((c) => c.path.includes('/verify-email/resend'))).toBe(
      false
    )
  })

  it('"I\'ve verified, continue" forces a token refresh and shows the app on success', async () => {
    const { api, screen } = await setup([unverified, tokenResponse])
    await userEvent.click(
      screen.getByRole('button', { name: /I've verified, continue/ })
    )
    await expect
      .element(screen.getByText('Protected: Home'))
      .toBeInTheDocument()
    expect(api.count(TOKEN_KEY)).toBe(2)
  })

  it('still unverified after refresh shows an inline alert and keeps the page', async () => {
    const { screen } = await setup(unverified)
    await userEvent.click(
      screen.getByRole('button', { name: /I've verified, continue/ })
    )
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Your email address is still not verified.')
    await expect
      .element(
        screen.getByRole('heading', { name: 'Verify your email address' })
      )
      .toBeInTheDocument()
  })

  it('lists other accounts as "Continue as …" and "Use another account"', async () => {
    const { screen } = await setup(unverified, [
      row(ACCOUNT_A, 'a@staff.test', false),
      row(ACCOUNT_B, 'b@staff.test'),
    ])
    await expect
      .element(
        screen.getByRole('button', { name: /Continue as b@staff\.test/ })
      )
      .toBeInTheDocument()
    await expect
      .element(
        screen.getByRole('button', { name: /Continue as a@staff\.test/ })
      )
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('link', { name: 'Use another account' }))
      .toBeInTheDocument()
  })
})
