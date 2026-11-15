import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createApiClient } from '@/api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { ResetPassword } from '../index'
import { ResetPasswordForm } from './reset-password-form'

const replace = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ history: { replace } }),
  Link: ({ to, children, ...p }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...p}>
      {children}
    </a>
  ),
}))

const TOKEN = 'a'.repeat(43)
const json = (status: number, code: string, details: unknown = null, h = {}) =>
  new Response(JSON.stringify({ error: { code, message: 'm', details } }), {
    status,
    headers: { 'content-type': 'application/json', ...h },
  })

describe('ResetPasswordForm', () => {
  let respond: () => Response | Promise<Response>
  let seen: Request[]

  async function mount(): Promise<RenderResult> {
    const client = createApiClient({
      baseUrl: 'https://api.test',
      fetch: (async (req: Request) => {
        seen.push(req)
        return respond()
      }) as unknown as typeof globalThis.fetch,
    })
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <ResetPasswordForm token={TOKEN} api={() => client} />
      </QueryClientProvider>
    )
  }

  async function submit(screen: RenderResult, pw: string, confirm = pw) {
    await userEvent.fill(screen.getByLabelText('New password'), pw)
    await userEvent.fill(screen.getByLabelText('Confirm password'), confirm)
    await userEvent.click(
      screen.getByRole('button', { name: /Change password/ })
    )
  }

  beforeEach(() => {
    seen = []
    respond = () => new Response(null, { status: 204 })
  })

  describe('page token handling', () => {
    async function mountPage(hash: string) {
      replace.mockReset()
      replace.mockImplementation((p: string) =>
        window.history.replaceState(null, '', p)
      )
      window.history.replaceState(null, '', `/${hash}`)
      return render(
        <QueryClientProvider client={new QueryClient()}>
          <ResetPassword />
        </QueryClientProvider>
      )
    }
    afterEach(() => window.history.replaceState(null, '', '/'))

    it.each([
      ['no hash', ''],
      ['malformed token', '#token=short'],
    ])('%s shows invalid link and sends no request', async (_n, hash) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const screen = await mountPage(hash)
      await expect
        .element(screen.getByRole('heading', { name: 'Invalid link' }))
        .toBeInTheDocument()
      await expect
        .element(screen.getByRole('link', { name: 'Forgot password' }))
        .toHaveAttribute('href', '/forgot-password')
      expect(screen.getByLabelText('New password').elements()).toHaveLength(0)
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })

    it('valid token shows the form and removes the token from the URL', async () => {
      const screen = await mountPage(`#token=${TOKEN}`)
      await expect
        .element(screen.getByLabelText('New password'))
        .toBeInTheDocument()
      expect(window.location.hash).toBe('')
      expect(window.location.href).not.toContain(TOKEN)
    })
  })

  it('requires password and matching confirmation', async () => {
    const screen = await mount()
    await userEvent.click(
      screen.getByRole('button', { name: /Change password/ })
    )
    await expect
      .element(screen.getByText('Please enter your new password.'))
      .toBeInTheDocument()
    await submit(screen, 'abc', 'abd')
    await expect
      .element(screen.getByText('Passwords do not match.'))
      .toBeInTheDocument()
    expect(seen).toHaveLength(0)
  })

  it('rejects more than 128 characters', async () => {
    const screen = await mount()
    await submit(screen, 'a'.repeat(129))
    await expect.element(screen.getByText(/at most 128/)).toBeInTheDocument()
    expect(seen).toHaveLength(0)
  })

  it('maps weak_password reasons to field errors and keeps the form', async () => {
    respond = () => json(422, 'weak_password', { reasons: ['too_short'] })
    const screen = await mount()
    await submit(screen, 'abc')
    await expect
      .element(screen.getByText('Password is too short.'))
      .toBeInTheDocument()
    await expect.element(screen.getByLabelText('New password')).toBeVisible()
  })

  it('token_invalid shows the expired-or-used panel with a link to /forgot-password', async () => {
    respond = () => json(422, 'token_invalid')
    const screen = await mount()
    await submit(screen, 'abcdefgh1!')
    await expect
      .element(screen.getByText(/invalid, expired or already used/))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('link', { name: 'Request a new link' }))
      .toHaveAttribute('href', '/forgot-password')
  })

  it('204 shows success with a link to /sign-in and clears the form', async () => {
    const screen = await mount()
    await submit(screen, 'abcdefgh1!')
    await expect
      .element(screen.getByRole('link', { name: 'Sign in' }))
      .toHaveAttribute('href', '/sign-in')
    expect(await seen[0].json()).toEqual({
      token: TOKEN,
      new_password: 'abcdefgh1!',
    })
    expect(document.body.textContent).not.toContain('abcdefgh1!')
  })

  it('429 shows wait time; network error allows retry with same token', async () => {
    respond = () => json(429, 'rate_limited', null, { 'retry-after': '60' })
    const screen = await mount()
    await submit(screen, 'abcdefgh1!')
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(/Try again in 1 min/)
    respond = () => Promise.reject(new TypeError('fail'))
    await userEvent.click(
      screen.getByRole('button', { name: /Change password/ })
    )
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(/Could not reach/)
    respond = () => new Response(null, { status: 204 })
    await userEvent.click(
      screen.getByRole('button', { name: /Change password/ })
    )
    await expect
      .element(screen.getByText('Password changed'))
      .toBeInTheDocument()
    expect((await seen[0].json()).token).toBe(TOKEN)
    expect((await seen[2].json()).token).toBe(TOKEN)
  })

  it('token never appears in the DOM', async () => {
    await mount()
    expect(document.body.innerHTML).not.toContain(TOKEN)
  })

  it('inputs are labelled, errors linked, status announced', async () => {
    const screen = await mount()
    await userEvent.click(
      screen.getByRole('button', { name: /Change password/ })
    )
    await expect
      .element(screen.getByLabelText('New password'))
      .toHaveAttribute('aria-invalid', 'true')
    await expect
      .element(screen.getByLabelText('New password'))
      .toHaveAttribute('aria-describedby')
    await submit(screen, 'abcdefgh1!')
    await expect.element(screen.getByRole('status')).toBeInTheDocument()
  })
})
