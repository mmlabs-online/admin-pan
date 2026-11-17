import {
  ACCOUNT_A,
  ACCOUNT_B,
  BASE,
  createTestAuthClient,
  envelope,
  fakeIdentityApi,
  memoryStorage,
  renderWithAuth,
  row,
  tokenResponse,
  type Handler,
} from '@/test-utils/auth'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

const TOKEN_KEY = 'POST /api/v1/auth/token'
const notMember: Handler = () =>
  envelope(403, 'not_member', { join_available: false })
const unverified: Handler = () => envelope(403, 'email_unverified')

const RESEND_KEY = 'POST /api/v1/auth/verify-email/resend'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

async function setup(
  token: Handler | Handler[],
  accounts = [row(ACCOUNT_A, 'a@staff.test', false)],
  resend: Handler | Handler[] = () => new Response(null, { status: 202 })
) {
  // The page calls the app singleton (getAuthClient); route its fetch to the fake API too.
  vi.stubEnv('VITE_API_BASE_URL', BASE)
  vi.stubEnv('VITE_APP_KEY', 'admin')
  const api = fakeIdentityApi({
    accounts,
    routes: { [TOKEN_KEY]: token, [RESEND_KEY]: resend },
  })
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(api.fakeFetch as typeof fetch)
  const client = createTestAuthClient(api, {
    storage: memoryStorage({ mm_account_id: ACCOUNT_A }).storage,
  })
  return { api, fetchSpy, ...(await renderWithAuth({ client })) }
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
  it('shows the new copy and a "Send the link again" button, no external link, no resend call until clicked', async () => {
    const { api, screen } = await setup(unverified)
    await expect
      .element(
        screen.getByRole('heading', { name: 'Verify your email address' })
      )
      .toHaveFocus()
    await expect
      .element(screen.getByText(/send the link again\./))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Send the link again' }))
      .toBeInTheDocument()
    const hrefs = screen.container.querySelectorAll('a[href]')
    for (const a of hrefs) {
      expect(a.getAttribute('href')).toMatch(/^\//)
    }
    expect(api.count(RESEND_KEY)).toBe(0)
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

const statusText = (screen: { container: Element }) =>
  screen.container.querySelector('p[role="status"]')?.textContent ?? ''

describe('resend', () => {
  const resendButton = (screen: Awaited<ReturnType<typeof setup>>['screen']) =>
    screen.getByRole('button', { name: 'Send the link again' })

  it('click sends one POST for the shown account with X-MM-App admin', async () => {
    const { api, fetchSpy, screen } = await setup(unverified)
    await userEvent.click(resendButton(screen))
    await expect.poll(() => api.count(RESEND_KEY)).toBe(1)
    const call = api.calls.find((c) => c.path.endsWith('/verify-email/resend'))
    expect(call?.body).toEqual({ account_id: ACCOUNT_A })
    expect(call?.headers.get('x-mm-app')).toBe('admin')
    const init = fetchSpy.mock.calls.find((c) =>
      String(c[0]).endsWith('/verify-email/resend')
    )?.[1]
    expect(init?.credentials).toBe('include')
  })

  it('202 announces the neutral sent message in the status region', async () => {
    const { screen } = await setup(unverified)
    await userEvent.click(resendButton(screen))
    await expect
      .poll(() => statusText(screen))
      .toMatch(/a new link is on its way/)
    await expect
      .element(resendButton(screen))
      .not.toHaveAttribute('aria-disabled')
  })

  it('409 email_already_verified refreshes the token and shows the app', async () => {
    const { api, screen } = await setup(
      [unverified, tokenResponse],
      undefined,
      () => envelope(409, 'email_already_verified')
    )
    await userEvent.click(resendButton(screen))
    await expect
      .element(screen.getByText('Protected: Home'))
      .toBeInTheDocument()
    expect(api.count(TOKEN_KEY)).toBe(2)
  })

  it('429 shows the wait, aria-disables the button with a countdown, ignores clicks, then re-enables', async () => {
    const { api, screen } = await setup(unverified, undefined, [
      () => envelope(429, 'rate_limited', null, { 'retry-after': '1' }),
      () => new Response(null, { status: 202 }),
    ])
    await userEvent.click(resendButton(screen))
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Too many requests.')
    for (const el of [
      screen.getByText(/You can send the link again in/).element(),
      screen.container.querySelector('p[role="status"]'),
      screen.getByRole('alert').element(),
    ]) {
      expect(
        el?.parentElement?.closest('[role="status"],[role="alert"],[aria-live]')
      ).toBeNull()
    }
    const button = resendButton(screen)
    await expect.element(button).toHaveAttribute('aria-disabled', 'true')
    await expect.element(button).toHaveFocus()
    await expect
      .element(screen.getByText(/You can send the link again in 1 s/))
      .toBeInTheDocument()
    // aria-disabled buttons are not "enabled" for the driver: click the element
    ;(button.element() as HTMLElement).click()
    expect(api.count(RESEND_KEY)).toBe(1)
    await expect
      .element(resendButton(screen), { timeout: 3000 })
      .not.toHaveAttribute('aria-disabled')
    await expect
      .poll(() => statusText(screen))
      .toContain('You can send the link again.')
    expect(screen.container.textContent).not.toContain('Too many requests')
  })

  it('403 origin_not_allowed shows the neutral not-allowed alert with the request ID', async () => {
    const { screen } = await setup(unverified, undefined, () =>
      envelope(403, 'origin_not_allowed', null, { 'x-request-id': 'req-77' })
    )
    await userEvent.click(resendButton(screen))
    const alert = screen.getByRole('alert')
    await expect
      .element(alert)
      .toHaveTextContent(/can't be sent from mmlabs Admin/)
    await expect.element(alert).toHaveTextContent('Request ID: req-77')
  })

  it('401 session_invalid reloads the accounts and goes to sign-in', async () => {
    const accounts = [row(ACCOUNT_A, 'a@staff.test', false)]
    const res = await setup(unverified, accounts, () => {
      accounts.length = 0 // the accounts list is now empty: sign-in
      return envelope(401, 'session_invalid')
    })
    await userEvent.click(resendButton(res.screen))
    await expect
      .element(res.screen.getByText('Sign-in page'))
      .toBeInTheDocument()
  })

  it('network error shows the network alert and the button works again', async () => {
    const { api, screen } = await setup(unverified, undefined, [
      () => {
        throw new TypeError('Failed to fetch')
      },
      () => new Response(null, { status: 202 }),
    ])
    await userEvent.click(resendButton(screen))
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Could not reach the server. Please try again.')
    await userEvent.click(resendButton(screen))
    await expect.poll(() => api.count(RESEND_KEY)).toBe(2)
    await expect
      .poll(() => statusText(screen))
      .toMatch(/a new link is on its way/)
  })

  it('double click while pending sends one request; pending is aria-disabled, focused, "Sending…" announced; continue is ignored while pending', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { api, screen } = await setup(unverified, undefined, async () => {
      await gate
      return new Response(null, { status: 202 })
    })
    const button = resendButton(screen)
    await userEvent.click(button)
    ;(button.element() as HTMLElement).click()
    await expect.element(button).toHaveAttribute('aria-disabled', 'true')
    await expect.element(button).toHaveFocus()
    await expect.poll(() => statusText(screen)).toContain('Sending…')
    ;(
      screen
        .getByRole('button', { name: /I've verified, continue/ })
        .element() as HTMLElement
    ).click()
    expect(api.count(TOKEN_KEY)).toBe(1)
    expect(api.count(RESEND_KEY)).toBe(1)
    release()
    await expect
      .poll(() => statusText(screen))
      .toMatch(/a new link is on its way/)
  })

  it('logs no email or token', async () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {})
    )
    const first = await setup(unverified)
    await userEvent.click(resendButton(first.screen))
    await expect
      .poll(() => statusText(first.screen))
      .toMatch(/a new link is on its way/)
    await first.screen.unmount()
    const second = await setup(unverified, undefined, () =>
      envelope(403, 'origin_not_allowed')
    )
    await userEvent.click(resendButton(second.screen))
    await expect.element(second.screen.getByRole('alert')).toBeInTheDocument()
    for (const spy of spies)
      for (const args of spy.mock.calls) {
        const text = JSON.stringify(args)
        expect(text).not.toContain('a@staff.test')
        expect(text).not.toContain('TOKEN')
      }
  })
})
