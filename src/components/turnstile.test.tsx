import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { Turnstile, type TurnstileHandle } from './turnstile'

const load = vi.hoisted(() => vi.fn())
vi.mock('@/lib/turnstile-loader', () => ({ loadTurnstile: load }))

function fakeApi() {
  const opts: Record<string, () => void> & { callback?: (t: string) => void } =
    {}
  const api = {
    render: vi.fn((_el: HTMLElement, o: Record<string, unknown>) => {
      Object.assign(opts, o)
      return 'w1'
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  }
  return { api, opts }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site')
})

describe('Turnstile', () => {
  it('calls onToken when the widget succeeds; null on expire/error', async () => {
    const { api, opts } = fakeApi()
    load.mockResolvedValue(api)
    const onToken = vi.fn()
    await render(<Turnstile onToken={onToken} />)
    await vi.waitFor(() => expect(api.render).toHaveBeenCalled())
    opts.callback?.('tok')
    expect(onToken).toHaveBeenLastCalledWith('tok')
    opts['expired-callback']()
    expect(onToken).toHaveBeenLastCalledWith(null)
    opts['error-callback']()
    expect(onToken).toHaveBeenLastCalledWith(null)
  })

  it('reset() resets the widget; remove on unmount', async () => {
    const { api } = fakeApi()
    load.mockResolvedValue(api)
    const ref = createRef<TurnstileHandle>()
    const onToken = vi.fn()
    const screen = await render(<Turnstile ref={ref} onToken={onToken} />)
    await vi.waitFor(() => expect(api.render).toHaveBeenCalled())
    ref.current?.reset()
    expect(api.reset).toHaveBeenCalledWith('w1')
    expect(onToken).toHaveBeenLastCalledWith(null)
    await screen.unmount()
    expect(api.remove).toHaveBeenCalledWith('w1')
  })

  it('missing site key renders a config error', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
    const screen = await render(<Turnstile onToken={vi.fn()} />)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(/not configured/i)
    expect(load).not.toHaveBeenCalled()
  })

  it('script load failure shows retry', async () => {
    load.mockRejectedValueOnce(new Error('x'))
    const { api } = fakeApi()
    load.mockResolvedValue(api)
    const screen = await render(<Turnstile onToken={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await vi.waitFor(() => expect(api.render).toHaveBeenCalled())
  })
})
