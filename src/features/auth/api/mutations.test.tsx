import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createApiClient } from '@/api'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useResetPasswordMutation } from './mutations'

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
})
