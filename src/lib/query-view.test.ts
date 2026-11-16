import { ApiError } from '@/api'
import { describe, expect, it } from 'vitest'
import { queryView } from './query-view'

const forbidden = new ApiError({
  kind: 'http',
  status: 403,
  code: 'permission_denied',
  message: 'm',
})
const server = new ApiError({
  kind: 'http',
  status: 500,
  code: 'x',
  message: 'm',
})

describe('queryView', () => {
  it('error wins over stale data', () => {
    const v = queryView({ data: [1], error: forbidden, isPending: false })
    expect(v.status).toBe('forbidden')
  })

  it('pending / success / non-403 error', () => {
    expect(
      queryView({ data: undefined, error: null, isPending: true }).status
    ).toBe('pending')
    expect(queryView({ data: [1], error: null, isPending: false })).toEqual({
      status: 'success',
      data: [1],
    })
    expect(
      queryView({ data: [1], error: server, isPending: false }).status
    ).toBe('error')
  })
})
