import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createApiClient } from '@/api'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { ForgotPasswordForm } from './forgot-password-form'

const reset = vi.hoisted(() => vi.fn())
vi.mock('@/components/turnstile', async () => {
  const React = await import('react')
  return {
    Turnstile: ({
      onToken,
      ref,
    }: {
      onToken: (t: string | null) => void
      ref?: React.Ref<{ reset: () => void }>
    }) => {
      React.useImperativeHandle(ref, () => ({
        reset: () => {
          reset()
          onToken(null)
        },
      }))
      return (
        <button type='button' onClick={() => onToken('tt')}>
          Solve
        </button>
      )
    },
  }
})

const err = (status: number, code: string, headers: HeadersInit = {}) =>
  new Response(
    JSON.stringify({ error: { code, message: code, details: null } }),
    { status, headers: { 'content-type': 'application/json', ...headers } }
  )

describe('ForgotPasswordForm', () => {
  let respond: () => Response | Promise<Response>
  let seen: Request[]

  async function mount(): Promise<RenderResult> {
    vi.stubEnv('VITE_APP_KEY', 'admin')
    const client = createApiClient({
      baseUrl: 'https://api.test',
      fetch: (async (req: Request) => {
        seen.push(req)
        return respond()
      }) as unknown as typeof globalThis.fetch,
    })
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <ForgotPasswordForm api={() => client} />
      </QueryClientProvider>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    seen = []
    respond = () => new Response(null, { status: 202 })
  })

  async function submit(screen: RenderResult, email = 'a@b.com') {
    await userEvent.fill(
      screen.getByRole('textbox', { name: /^Email$/i }),
      email
    )
    await userEvent.click(screen.getByRole('button', { name: 'Solve' }))
    await userEvent.click(screen.getByRole('button', { name: /^Continue$/i }))
  }

  it('submit disabled until Turnstile token', async () => {
    const screen = await mount()
    const btn = screen.getByRole('button', { name: /^Continue$/i })
    await expect.element(btn).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Solve' }))
    await expect.element(btn).toBeEnabled()
  })

  it('invalid email blocked client-side', async () => {
    const screen = await mount()
    await submit(screen, 'nope')
    await expect.element(screen.getByText(/invalid email/i)).toBeInTheDocument()
    expect(seen).toHaveLength(0)
  })

  it('shows the identical confirmation for two different emails', async () => {
    const texts: string[] = []
    for (const email of ['a@b.com', 'other@example.org']) {
      const screen = await mount()
      await submit(screen, email)
      const status = screen.getByRole('status')
      await expect.element(status).toBeInTheDocument()
      texts.push(status.element().textContent ?? '')
      await screen.unmount()
    }
    expect(texts[0]).toBe(texts[1])
    expect(texts[0]).toMatch(/If an account exists/)
  })

  it('never renders the email after submit', async () => {
    const screen = await mount()
    await submit(screen, 'secret@example.org')
    await expect.element(screen.getByRole('status')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('secret@example.org')
  })

  it('turnstile_failed resets the widget and asks to retry', async () => {
    respond = () => err(403, 'turnstile_failed')
    const screen = await mount()
    await submit(screen)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(/Verification failed/)
    expect(reset).toHaveBeenCalled()
  })

  it('app_header_required/origin_not_allowed shows generic error', async () => {
    respond = () => err(403, 'origin_not_allowed')
    const screen = await mount()
    await submit(screen)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(/Something went wrong/)
  })

  it('429 shows wait time', async () => {
    respond = () => err(429, 'rate_limited', { 'retry-after': '120' })
    const screen = await mount()
    await submit(screen)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(/Try again in 2 min/)
  })

  it('422 email shows field error', async () => {
    respond = () => err(422, 'validation_error')
    const screen = await mount()
    await submit(screen)
    await expect.element(screen.getByText(/valid email/i)).toBeInTheDocument()
  })

  it('network/timeout keeps input and allows retry', async () => {
    respond = () => Promise.reject(new TypeError('fail'))
    const screen = await mount()
    await submit(screen)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(/Could not reach/)
    await expect
      .element(screen.getByRole('textbox', { name: /^Email$/i }))
      .toHaveValue('a@b.com')
  })

  it('resets Turnstile after every submit', async () => {
    const screen = await mount()
    await submit(screen)
    await expect.element(screen.getByRole('status')).toBeInTheDocument()
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
