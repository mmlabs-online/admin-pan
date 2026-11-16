import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import {
  ACCOUNT_A,
  PASSWORD,
  createTestAuthClient,
  envelope,
  fakeIdentityApi,
  json,
  memoryStorage,
  type Handler,
} from '@/test-utils/auth'
import { AuthProvider } from '@mmlabs/auth-client/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { UserAuthForm } from './user-auth-form'

const load = vi.hoisted(() => vi.fn())
vi.mock('@/lib/turnstile-loader', () => ({ loadTurnstile: load }))

const LOGIN = 'POST /api/v1/auth/login'
const EMAIL = 'staff@example.test'

async function setup({
  redirectTo,
  login,
}: { redirectTo?: string; login?: Handler | Handler[] } = {}) {
  const api = fakeIdentityApi({ routes: login ? { [LOGIN]: login } : {} })
  const client = createTestAuthClient(api, { storage: memoryStorage().storage })
  const root = createRootRoute({ component: Outlet })
  const routes = [
    createRoute({
      getParentRoute: () => root,
      path: '/sign-in',
      component: () => <UserAuthForm redirectTo={redirectTo} />,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => <p>Home page</p>,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/users',
      component: () => <p>Users page</p>,
    }),
  ]
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/sign-in'] }),
  })
  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider client={client}>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  )
  const email = screen.getByRole('textbox', { name: /^Email$/i })
  const password = screen.getByLabelText(/^Password$/i)
  const submit = screen.getByRole('button', { name: /^Sign in$/i })
  async function signIn() {
    await userEvent.fill(email, EMAIL)
    await userEvent.fill(password, PASSWORD)
    await userEvent.click(submit)
  }
  return { api, router, screen, email, password, submit, signIn }
}

beforeEach(() => vi.clearAllMocks())

describe('UserAuthForm', () => {
  it('posts email+password only via the auth client login (POST /api/v1/auth/login)', async () => {
    const t = await setup()
    await t.signIn()
    await vi.waitFor(() => expect(t.router.state.location.pathname).toBe('/'))
    const logins = t.api.calls.filter((c) => c.path === '/api/v1/auth/login')
    expect(logins).toHaveLength(1)
    expect(logins[0].method).toBe('POST')
    expect(logins[0].body).toEqual({ email: EMAIL, password: PASSWORD })
    expect(logins[0].headers.get('x-mm-app')).toBe('admin')
    const others = t.api.calls.filter((c) => c !== logins[0])
    expect(JSON.stringify(others.map((c) => c.body))).not.toContain(PASSWORD)
  })

  it('after login navigates to the validated redirect (and to "/" for //evil.com)', async () => {
    const ok = await setup({ redirectTo: '/users?q=1#x' })
    await ok.signIn()
    await vi.waitFor(() =>
      expect(ok.router.state.location.pathname).toBe('/users')
    )
    expect(ok.router.state.location.searchStr).toBe('?q=1')

    const evil = await setup({ redirectTo: '//evil.com' })
    await evil.signIn()
    await vi.waitFor(() =>
      expect(evil.router.state.location.pathname).toBe('/')
    )
    expect(evil.router.state.location.href).toBe('/')
  })

  it('invalid_credentials shows one generic message and clears the password', async () => {
    const t = await setup({
      login: () => envelope(401, 'invalid_credentials'),
    })
    await t.signIn()
    const alert = t.screen.getByRole('alert')
    await expect
      .element(alert)
      .toHaveTextContent('Email or password is incorrect.')
    await expect.element(alert).not.toHaveTextContent(EMAIL)
    await expect.element(t.password).toHaveValue('')
  })

  it('turnstile_required reveals the widget; submit sends turnstileToken; widget is reset after each attempt', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site')
    const opts: { callback?: (t: string) => void } = {}
    const widget = {
      render: vi.fn((_el: HTMLElement, o: typeof opts) => {
        Object.assign(opts, o)
        return 'w1'
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    }
    load.mockResolvedValue(widget)
    const ok: Handler = () =>
      json(200, {
        account_id: ACCOUNT_A,
        user: { id: 'u', email: EMAIL, email_verified: true },
      })
    const t = await setup({
      login: [() => envelope(403, 'turnstile_required'), ok],
    })
    await t.signIn()
    await expect
      .element(t.screen.getByRole('alert'))
      .toHaveTextContent('Complete the verification, then sign in again.')
    await vi.waitFor(() => expect(widget.render).toHaveBeenCalled())
    await userEvent.fill(t.password, PASSWORD)
    await expect.element(t.submit).toBeDisabled()
    opts.callback?.('ts-token')
    await expect.element(t.submit).toBeEnabled()
    await userEvent.click(t.submit)
    await vi.waitFor(() => expect(t.router.state.location.pathname).toBe('/'))
    const logins = t.api.calls.filter((c) => c.path === '/api/v1/auth/login')
    expect(logins[0].body).not.toHaveProperty('turnstile_token')
    expect(logins[1].body).toMatchObject({ turnstile_token: 'ts-token' })
    expect(widget.reset).toHaveBeenCalledWith('w1')
  })

  it('rate_limited shows the wait time', async () => {
    const t = await setup({
      login: () =>
        envelope(429, 'rate_limited', null, { 'Retry-After': '120' }),
    })
    await t.signIn()
    await expect
      .element(t.screen.getByRole('alert'))
      .toHaveTextContent('Too many attempts. Try again in 2 min.')
  })

  it('network error shows the retry message', async () => {
    const t = await setup({
      login: () => {
        throw new TypeError('Failed to fetch')
      },
    })
    await t.signIn()
    await expect
      .element(t.screen.getByRole('alert'))
      .toHaveTextContent('Could not reach the server. Please try again.')
  })

  it('has no link to /forgot-password and shows the reset-from-any-mmlabs-app hint', async () => {
    const t = await setup()
    await expect
      .element(t.screen.getByText(/Reset it from any mmlabs app you use/))
      .toBeInTheDocument()
    expect(t.screen.container.querySelector('a[href]')).toBe(null)
  })

  it('empty fields show linked validation errors; no 7-character rule', async () => {
    const t = await setup()
    await userEvent.click(t.submit)
    await expect
      .element(t.screen.getByText('Please enter your email.'))
      .toBeInTheDocument()
    await expect
      .element(t.screen.getByText('Please enter your password.'))
      .toBeInTheDocument()
    await expect.element(t.email).toBeInvalid()
    await userEvent.fill(t.email, EMAIL)
    await userEvent.fill(t.password, '1')
    await userEvent.click(t.submit)
    await vi.waitFor(() => expect(t.router.state.location.pathname).toBe('/'))
  })
})
