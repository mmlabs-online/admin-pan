import { StrictMode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createApiClient } from '@/api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { VerifyEmailPanel } from './components/verify-email-panel'
import { VerifyEmail } from './index'

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
const json = (status: number, code: string, h = {}) =>
  new Response(
    JSON.stringify({ error: { code, message: 'leak', details: null } }),
    {
      status,
      headers: { 'content-type': 'application/json', ...h },
    }
  )
const ok = () => new Response(null, { status: 204 })

describe('VerifyEmail', () => {
  let respond: () => Response | Promise<Response>
  let seen: Request[]
  let qc: QueryClient

  async function mount(): Promise<RenderResult> {
    const client = createApiClient({
      baseUrl: 'https://api.test',
      fetch: (async (req: Request) => {
        seen.push(req)
        return respond()
      }) as unknown as typeof globalThis.fetch,
    })
    return render(
      <QueryClientProvider client={qc}>
        <VerifyEmailPanel token={TOKEN} api={() => client} />
      </QueryClientProvider>
    )
  }
  const confirm = (s: RenderResult) =>
    s.getByRole('button', { name: /Confirm my email/ })

  beforeEach(() => {
    seen = []
    qc = new QueryClient()
    respond = ok
  })

  describe('page', () => {
    async function mountPage(path: string) {
      replace.mockReset()
      replace.mockImplementation((p: string) =>
        window.history.replaceState(null, '', p)
      )
      window.history.replaceState(null, '', path)
      return render(
        <StrictMode>
          <QueryClientProvider client={new QueryClient()}>
            <VerifyEmail />
          </QueryClientProvider>
        </StrictMode>
      )
    }
    afterEach(() => window.history.replaceState(null, '', '/'))

    it.each([
      ['no hash', '/verify-email'],
      ['malformed token (#token=short)', '/verify-email#token=short'],
      ['?token= in search only', `/verify-email?token=${TOKEN}`],
    ])('%s shows invalid link and sends no request', async (_n, path) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const screen = await mountPage(path)
      await expect
        .element(screen.getByRole('heading', { name: 'Invalid link' }))
        .toBeInTheDocument()
      await expect
        .element(screen.getByRole('link', { name: 'Sign in' }))
        .toHaveAttribute('href', '/sign-in')
      expect(confirm(screen).elements()).toHaveLength(0)
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })

    it('valid fragment shows the button, sends nothing, strips the hash once, token not in DOM', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const screen = await mountPage(`/verify-email#token=${TOKEN}`)
      await expect.element(confirm(screen)).toBeInTheDocument()
      await vi.waitFor(() => expect(window.location.hash).toBe(''))
      expect(window.location.href).not.toContain(TOKEN)
      expect(document.body.innerHTML).not.toContain(TOKEN)
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })
  })

  it('no request on mount', async () => {
    const screen = await mount()
    await expect.element(confirm(screen)).toBeInTheDocument()
    expect(seen).toHaveLength(0)
  })

  it('click sends exactly one POST with {token}, no Authorization / X-MM-App, credentials omit', async () => {
    const screen = await mount()
    await userEvent.click(confirm(screen))
    await expect
      .element(screen.getByText('Email address verified'))
      .toBeInTheDocument()
    expect(seen).toHaveLength(1)
    expect(seen[0].method).toBe('POST')
    expect(seen[0].url).toBe('https://api.test/api/v1/auth/verify-email')
    expect(await seen[0].json()).toEqual({ token: TOKEN })
    expect(seen[0].headers.has('authorization')).toBe(false)
    expect(seen[0].headers.has('x-mm-app')).toBe(false)
    expect(seen[0].credentials).toBe('omit')
  })

  it('double click sends one request', async () => {
    respond = () => new Promise(() => {})
    const screen = await mount()
    const el = confirm(screen).element() as HTMLButtonElement
    el.click()
    el.click()
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    expect(seen).toHaveLength(1)
  })

  it('while pending the button is aria-disabled, keeps focus, and "Verifying…" is announced', async () => {
    let release!: (r: Response) => void
    respond = () => new Promise((r) => (release = r))
    const screen = await mount()
    await userEvent.click(confirm(screen))
    await expect
      .element(confirm(screen))
      .toHaveAttribute('aria-disabled', 'true')
    await expect.element(confirm(screen)).toHaveFocus()
    const status = screen.getByRole('status').element()
    expect(status).toHaveTextContent('Verifying…')
    expect(status.closest('[aria-busy="true"]')).toBeNull()
    release(ok())
    await expect
      .element(screen.getByText('Email address verified'))
      .toBeInTheDocument()
  })

  it('204 shows "Email address verified" with focused heading and /sign-in link; button gone', async () => {
    const screen = await mount()
    await userEvent.click(confirm(screen))
    const h = screen.getByRole('heading', { name: 'Email address verified' })
    await expect.element(h).toBeInTheDocument()
    await expect.element(h).toHaveFocus()
    await expect
      .element(screen.getByRole('link', { name: 'Sign in' }))
      .toHaveAttribute('href', '/sign-in')
    expect(confirm(screen).elements()).toHaveLength(0)
  })

  it.each([
    ['token_invalid', 'token_invalid'],
    ['any other 422 (validation_error)', 'validation_error'],
  ])('422 %s shows the invalid-or-expired panel', async (_n, code) => {
    respond = () => json(422, code)
    const screen = await mount()
    await userEvent.click(confirm(screen))
    const h = screen.getByRole('heading', { name: 'Link invalid or expired' })
    await expect.element(h).toHaveFocus()
    await expect
      .element(screen.getByText(/Sign in to request a new one/))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('link', { name: 'Sign in' }))
      .toHaveAttribute('href', '/sign-in')
    expect(confirm(screen).elements()).toHaveLength(0)
  })

  it('429 shows the wait time; button stays enabled; next click resends the same token', async () => {
    respond = () => json(429, 'rate_limited', { 'retry-after': '30' })
    const screen = await mount()
    await userEvent.click(confirm(screen))
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Try again in 30 s')
    await expect.element(confirm(screen)).toBeEnabled()
    await userEvent.click(confirm(screen))
    await vi.waitFor(() => expect(seen).toHaveLength(2))
    expect((await seen[1].json()).token).toBe(TOKEN)
  })

  it('keeps focus on the Confirm button after a network error', async () => {
    respond = () => Promise.reject(new TypeError('fail'))
    const screen = await mount()
    await userEvent.click(confirm(screen))
    await expect.element(screen.getByRole('alert')).toBeInTheDocument()
    await expect.element(confirm(screen)).toHaveFocus()
    await expect.element(confirm(screen)).not.toHaveAttribute('aria-disabled')
  })

  it('network failure shows an alert; retry with the same token then succeeds', async () => {
    respond = () => Promise.reject(new TypeError('fail'))
    const screen = await mount()
    await userEvent.click(confirm(screen))
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Could not reach the server')
    respond = ok
    await userEvent.click(confirm(screen))
    await expect
      .element(screen.getByText('Email address verified'))
      .toBeInTheDocument()
    expect((await seen[1].json()).token).toBe(TOKEN)
  })

  it.each([500, 403])(
    '%i shows the generic alert and never the server message',
    async (status) => {
      respond = () => json(status, 'boom')
      const screen = await mount()
      await userEvent.click(confirm(screen))
      await expect
        .element(screen.getByRole('alert'))
        .toHaveTextContent('Something went wrong')
      expect(document.body.textContent).not.toContain('leak')
    }
  )

  it.each([
    ['204', ok, 'Email address verified'],
    ['token_invalid', () => json(422, 'token_invalid'), 'Link invalid'],
  ])('terminal state (%s) clears mutation state', async (_n, r, text) => {
    respond = r
    const screen = await mount()
    await userEvent.click(confirm(screen))
    await expect.element(screen.getByText(text)).toBeInTheDocument()
    await vi.waitFor(() =>
      expect(qc.getMutationCache().getAll()).toHaveLength(0)
    )
  })

  it('keyboard: Tab to the button, Enter sends one request', async () => {
    const screen = await mount()
    await userEvent.tab()
    await expect.element(confirm(screen)).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect
      .element(screen.getByText('Email address verified'))
      .toBeInTheDocument()
    expect(seen).toHaveLength(1)
  })
})
