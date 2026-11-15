import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createApiClient } from '@/api'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { createQueryClient } from '@/lib/query-client'
import {
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useVerifyEmailMutation,
} from './mutations'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function Probe({ onFetch }: { onFetch: () => Response }) {
  const client = createApiClient({
    baseUrl: 'https://api.test',
    fetch: (async () => onFetch()) as unknown as typeof globalThis.fetch,
  })
  const m = useResetPasswordMutation(() => client)
  return (
    <button
      onClick={() =>
        m.mutate(
          { token: 't', new_password: 'secret-pw' },
          { onError: () => {} }
        )
      }
    >
      go
    </button>
  )
}

describe('auth mutations', () => {
  it('do not retry and keep no cached variables', async () => {
    const qc = new QueryClient()
    const fetchSpy = vi.fn(() => new Response('', { status: 503, headers: {} }))
    const screen = await render(
      <QueryClientProvider client={qc}>
        <Probe onFetch={fetchSpy} />
      </QueryClientProvider>
    )
    await screen.getByRole('button', { name: 'go' }).click()
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    await screen.unmount()
    await vi.waitFor(() =>
      expect(qc.getMutationCache().getAll()).toHaveLength(0)
    )
  })

  it('failures do not trigger the app-wide error toast', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.test',
      fetch: (async () =>
        new Response(
          JSON.stringify({
            error: { code: 'x', message: 'leak', details: null },
          }),
          { status: 422, headers: { 'content-type': 'application/json' } }
        )) as unknown as typeof globalThis.fetch,
    })
    let allErrored = false
    const done = (v: boolean) => (allErrored = v)
    function Both() {
      const r = useResetPasswordMutation(() => client)
      const f = useForgotPasswordMutation(() => client)
      const v = useVerifyEmailMutation(() => client)
      useEffect(() => {
        done(r.isError && f.isError && v.isError)
      })
      const noop = { onError: () => {} }
      return (
        <>
          <button
            onClick={() => r.mutate({ token: 't', new_password: 'p' }, noop)}
          >
            reset
          </button>
          <button
            onClick={() =>
              f.mutate({ email: 'a@b.com', turnstile_token: 't' }, noop)
            }
          >
            forgot
          </button>
          <button onClick={() => v.mutate({ token: 't' }, noop)}>verify</button>
        </>
      )
    }
    const qc = createQueryClient()
    const screen = await render(
      <QueryClientProvider client={qc}>
        <Both />
      </QueryClientProvider>
    )
    await screen.getByRole('button', { name: 'reset' }).click()
    await screen.getByRole('button', { name: 'forgot' }).click()
    await screen.getByRole('button', { name: 'verify' }).click()
    await vi.waitFor(() => expect(allErrored).toBe(true))
    expect(toast.error).not.toHaveBeenCalled()
    // control: a mutation without the opt-out still toasts
    await qc
      .getMutationCache()
      .build(qc, { mutationFn: () => Promise.reject(new Error('boom')) })
      .execute(undefined)
      .catch(() => {})
    expect(toast.error).toHaveBeenCalledTimes(1)
  })
})
