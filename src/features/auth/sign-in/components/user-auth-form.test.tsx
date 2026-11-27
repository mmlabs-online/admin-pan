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
  ACCOUNT_B,
  PASSWORD,
  createTestAuthClient,
  envelope,
  fakeIdentityApi,
  json,
  memoryStorage,
  renderWithAuth,
  row,
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
    // eslint-disable-next-line prefer-const -- assigned after the handlers exist
    let t: Awaited<ReturnType<typeof setup>>
    const ok: Handler = () => {
      // a real login leaves a session, which the post-login reload lists
      t.api.state.accounts = [row(ACCOUNT_A, EMAIL)]
      return json(200, {
        account_id: ACCOUNT_A,
        user: { id: 'u', email: EMAIL, email_verified: true },
      })
    }
    t = await setup({
      login: [() => envelope(403, 'turnstile_required'), ok],
    })
    await t.signIn()
    await expect
      .element(t.screen.getByRole('alert'))
      .toHaveTextContent('Complete the verification, then sign in again.')
    await vi.waitFor(() => expect(widget.render).toHaveBeenCalled())
    await userEvent.fill(t.password, PASSWORD)
    await expect.element(t.submit).toHaveAttribute('aria-disabled', 'true')
    opts.callback?.('ts-token')
    await expect.element(t.submit).not.toHaveAttribute('aria-disabled')
    await userEvent.click(t.submit)
    await vi.waitFor(() => expect(t.router.state.location.pathname).toBe('/'))
    const logins = t.api.calls.filter((c) => c.path === '/api/v1/auth/login')
    expect(logins[0].body).not.toHaveProperty('turnstile_token')
    expect(logins[1].body).toMatchObject({ turnstile_token: 'ts-token' })
    expect(widget.reset).toHaveBeenCalledWith('w1')
  })

  it('invalid_credentials: focus stays on the button, status empties, Enter retries', async () => {
    const t = await setup({
      login: () => envelope(401, 'invalid_credentials'),
    })
    await t.signIn()
    await expect.element(t.screen.getByRole('alert')).toBeVisible()
    await expect.element(t.submit).toHaveFocus()
    await expect.element(t.submit).not.toHaveAttribute('aria-disabled')
    await expect.element(t.screen.getByRole('status')).toHaveTextContent('')
    await userEvent.fill(t.password, PASSWORD)
    ;(t.submit.element() as HTMLElement).focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(t.api.count(LOGIN)).toBe(2))
  })

  it('rate_limited: focus stays on the button after the alert', async () => {
    const t = await setup({
      login: () =>
        envelope(429, 'rate_limited', null, { 'Retry-After': '120' }),
    })
    await t.signIn()
    await expect.element(t.screen.getByRole('alert')).toBeVisible()
    await expect.element(t.submit).toHaveFocus()
  })

  it('turnstile_required: focus stays on the aria-disabled button; Enter submits nothing until a token arrives', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site')
    const opts: { callback?: (t: string) => void } = {}
    load.mockResolvedValue({
      render: vi.fn((_el: HTMLElement, o: typeof opts) => {
        Object.assign(opts, o)
        return 'w1'
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    })
    const t = await setup({
      login: () => envelope(403, 'turnstile_required'),
    })
    await t.signIn()
    await expect.element(t.screen.getByRole('alert')).toBeVisible()
    await expect.element(t.submit).toHaveFocus()
    await expect.element(t.submit).toHaveAttribute('aria-disabled', 'true')
    await userEvent.fill(t.password, PASSWORD)
    ;(t.submit.element() as HTMLElement).focus()
    await userEvent.keyboard('{Enter}')
    expect(t.api.count(LOGIN)).toBe(1)
    await vi.waitFor(() => expect(opts.callback).toBeDefined())
    opts.callback?.('ts-token')
    await expect.element(t.submit).not.toHaveAttribute('aria-disabled')
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

describe('UserAuthForm (behind AuthGate)', () => {
  const ACCOUNTS = 'GET /api/v1/auth/accounts'

  async function gatedSetup({
    postLogin,
    accounts,
    login,
    storage,
    path = '/users',
  }: {
    postLogin?: Handler
    accounts?: ReturnType<typeof row>[]
    login?: Handler
    storage?: Record<string, string>
    path?: string
  } = {}) {
    const api = fakeIdentityApi({
      accounts,
      routes: login ? { [LOGIN]: login } : {},
    })
    const base = api.routes[ACCOUNTS] as Handler
    api.routes[ACCOUNTS] = async (c) => {
      // delay only the listings made after login
      if (api.count(LOGIN) === 0) return base(c)
      await new Promise((r) => setTimeout(r, 150))
      return (postLogin ?? base)(c)
    }
    const client = createTestAuthClient(api, {
      storage: memoryStorage(storage).storage,
    })
    const { screen, router } = await renderWithAuth({
      client,
      path,
      signInPage: ({ redirect }) => <UserAuthForm redirectTo={redirect} />,
    })
    const paths: string[] = []
    router.subscribe('onResolved', (e) => paths.push(e.toLocation.pathname))
    const email = screen.getByRole('textbox', { name: /^Email$/i })
    const password = screen.getByLabelText(/^Password$/i)
    const submit = screen.getByRole('button', { name: /^Sign in$/i })
    async function signIn() {
      await userEvent.fill(email, EMAIL)
      await userEvent.fill(password, PASSWORD)
      await userEvent.click(submit)
    }
    return { api, router, screen, paths, email, password, submit, signIn }
  }

  it('one sign-in reaches the protected redirect target without bouncing to /sign-in (BUG-003)', async () => {
    const t = await gatedSetup()
    await expect.element(t.submit).toBeVisible()
    expect(t.router.state.location.pathname).toBe('/sign-in')
    await t.signIn()
    await expect.element(t.screen.getByText('Protected: Users')).toBeVisible()
    expect(t.router.state.location.pathname).toBe('/users')
    const firstUsers = t.paths.indexOf('/users')
    expect(firstUsers).toBeGreaterThanOrEqual(0)
    expect(t.paths.slice(firstUsers)).not.toContain('/sign-in')
    expect(t.api.count(LOGIN)).toBe(1)
  })

  it('keeps focus on the aria-disabled button while busy; a second click or Enter does not log in again (BUG-003)', async () => {
    const t = await gatedSetup()
    await t.signIn()
    await expect.element(t.submit).toHaveAttribute('aria-disabled', 'true')
    await expect.element(t.submit).not.toHaveAttribute('disabled')
    await expect.element(t.submit).toHaveAttribute('aria-busy', 'true')
    await expect.element(t.submit).toHaveFocus()
    ;(t.submit.element() as HTMLElement).click()
    await userEvent.keyboard('{Enter}')
    await expect.element(t.screen.getByText('Protected: Users')).toBeVisible()
    expect(t.api.count(LOGIN)).toBe(1)
  })

  it('Enter in the password field while busy submits nothing and shows no validation message', async () => {
    const t = await gatedSetup()
    await userEvent.fill(t.email, EMAIL)
    await userEvent.fill(t.password, PASSWORD)
    await userEvent.click(t.password)
    await userEvent.keyboard('{Enter}')
    await expect.element(t.submit).toHaveAttribute('aria-busy', 'true')
    await userEvent.keyboard('{Enter}')
    expect(t.screen.getByText('Please enter your password.').query()).toBe(null)
    await expect.element(t.screen.getByText('Protected: Users')).toBeVisible()
    expect(t.api.count(LOGIN)).toBe(1)
  })

  it('status region exists empty before submit and says Signing in… while busy', async () => {
    const t = await gatedSetup()
    const status = t.screen.getByRole('status')
    await expect.element(status).toHaveTextContent('')
    await t.signIn()
    await expect.element(status).toHaveTextContent('Signing in…')
  })

  it('spinner is aria-hidden while busy', async () => {
    const t = await gatedSetup()
    await t.signIn()
    await expect.element(t.submit).toHaveAttribute('aria-busy', 'true')
    expect(
      t.submit.element().querySelector('svg')?.getAttribute('aria-hidden')
    ).toBe('true')
  })

  it('session error: focus stays on the button; Enter retries', async () => {
    const t = await gatedSetup({
      postLogin: () => envelope(401, 'session_invalid'),
    })
    await t.signIn()
    await expect.element(t.screen.getByRole('alert')).toBeVisible()
    await expect.element(t.submit).toHaveFocus()
    await expect.element(t.submit).not.toHaveAttribute('aria-disabled')
    await expect.element(t.screen.getByRole('status')).toHaveTextContent('')
    await userEvent.fill(t.password, PASSWORD)
    ;(t.submit.element() as HTMLElement).focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(t.api.count(LOGIN)).toBe(2))
  })

  it('signed-out after a successful login stays on the form with a generic alert, no navigation', async () => {
    const t = await gatedSetup({
      postLogin: () => envelope(401, 'session_invalid'),
    })
    await t.signIn()
    const alert = t.screen.getByRole('alert')
    await expect
      .element(alert)
      .toHaveTextContent('Could not start your session. Please try again.')
    await expect.element(alert).not.toHaveTextContent(EMAIL)
    expect(t.router.state.location.pathname).toBe('/sign-in')
    expect(t.paths).not.toContain('/users')
    expect(t.api.count(LOGIN)).toBe(1)
    await expect.element(t.submit).toBeEnabled()
    await expect.element(t.submit).not.toHaveAttribute('aria-disabled')
  })

  it('accounts error after login opens the target, where the gate shows retry', async () => {
    const t = await gatedSetup({ postLogin: () => envelope(500, 'internal') })
    await t.signIn()
    await expect
      .element(t.screen.getByText(/Could not reach mmlabs Identity/))
      .toBeVisible()
    await expect
      .element(t.screen.getByRole('button', { name: /retry/i }))
      .toBeVisible()
    expect(t.router.state.location.pathname).toBe('/users')
    expect(t.paths.slice(t.paths.indexOf('/users'))).not.toContain('/sign-in')
  })

  it('needs-account after login opens the target with the account picker', async () => {
    const t = await gatedSetup({
      postLogin: () => json(200, { items: [row(ACCOUNT_B, 'b@staff.test')] }),
    })
    await t.signIn()
    await expect.element(t.screen.getByText(/Choose an account/)).toBeVisible()
    expect(t.router.state.location.pathname).toBe('/users')
    expect(t.paths.slice(t.paths.indexOf('/users'))).not.toContain('/sign-in')
  })

  it('account switch from a ready account lands as the newly signed-in account', async () => {
    const t = await gatedSetup({
      accounts: [row(ACCOUNT_A, 'a@staff.test')],
      storage: { mm_account_id: ACCOUNT_A },
      path: '/sign-in?redirect=/users',
      login: () => {
        t.api.state.accounts = [
          row(ACCOUNT_A, 'a@staff.test'),
          row(ACCOUNT_B, EMAIL),
        ]
        return json(200, {
          account_id: ACCOUNT_B,
          user: { id: ACCOUNT_A, email: EMAIL, email_verified: true },
        })
      },
    })
    await t.signIn()
    await expect.element(t.screen.getByText('Protected: Users')).toBeVisible()
    const tokens = t.api.calls.filter((c) => c.path === '/api/v1/auth/token')
    expect(tokens[tokens.length - 1]?.body).toMatchObject({
      account_id: ACCOUNT_B,
    })
  })
})
