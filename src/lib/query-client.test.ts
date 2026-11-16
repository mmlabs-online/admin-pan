import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearOnAuthChange,
  createQueryClient,
  shouldRetryQuery,
} from './query-client'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

beforeEach(() => toastError.mockClear())

const http = (status: number) =>
  new ApiError({ kind: 'http', status, code: 'c', message: 'm' })
const kind = (k: 'network' | 'timeout' | 'aborted') =>
  new ApiError({ kind: k, status: 0, code: k, message: 'm' })
const prod = { dev: false }

describe('shouldRetryQuery', () => {
  it('does not retry 401, 403, 404, 422, 429 or aborted', () => {
    for (const e of [401, 403, 404, 422, 429]
      .map(http)
      .concat(kind('aborted'))) {
      expect(shouldRetryQuery(0, e, prod)).toBe(false)
    }
  })

  it('does not retry kind auth', () => {
    const e = new ApiError({
      kind: 'auth',
      status: 403,
      code: 'not_member',
      message: 'm',
    })
    expect(shouldRetryQuery(0, e, prod)).toBe(false)
  })

  it('retries network, timeout and 5xx at most 3 times in production', () => {
    for (const e of [kind('network'), kind('timeout'), http(503)]) {
      expect(shouldRetryQuery(2, e, prod)).toBe(true)
      expect(shouldRetryQuery(3, e, prod)).toBe(false)
    }
  })

  it('does not retry at all in dev', () => {
    expect(shouldRetryQuery(0, kind('network'), { dev: true })).toBe(false)
  })
})

describe('createQueryClient', () => {
  it('mutations never retry', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false)
  })

  it('query errors toast only for network/timeout/5xx, not for 401/403/aborted', () => {
    const onError = createQueryClient().getQueryCache().config.onError!
    const q = undefined as never
    for (const e of [http(401), http(403), kind('aborted')]) onError(e, q)
    expect(toastError).not.toHaveBeenCalled()
    for (const e of [kind('network'), kind('timeout'), http(500)]) onError(e, q)
    expect(toastError).toHaveBeenCalledTimes(3)
  })
})

describe('clearOnAuthChange', () => {
  it('cancels and clears the cache on an auth event', () => {
    const qc = new QueryClient()
    qc.setQueryData(['x'], 1)
    let fire = () => {}
    const unsubscribe = vi.fn()
    const ret = clearOnAuthChange(qc, (l) => {
      fire = l
      return unsubscribe
    })
    expect(qc.getQueryData(['x'])).toBe(1)
    fire()
    expect(qc.getQueryData(['x'])).toBeUndefined()
    expect(ret).toBe(unsubscribe)
  })
})
