import { ApiError } from '@/api'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleServerError } from './handle-server-error'

const toastError = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: {
    error: toastError,
  },
}))

beforeEach(() => {
  vi.mocked(toastError).mockClear()
})

const apiError = (init: Partial<ConstructorParameters<typeof ApiError>[0]>) =>
  new ApiError({ kind: 'http', status: 400, code: 'c', message: 'm', ...init })

describe('handleServerError', () => {
  it('toasts the envelope message of an ApiError', () => {
    handleServerError(apiError({ status: 409, message: 'Slug already exists' }))

    expect(toastError).toHaveBeenCalledWith('Slug already exists')
  })

  it('truncates messages to 200 characters', () => {
    handleServerError(apiError({ message: 'x'.repeat(300) }))

    expect(toastError).toHaveBeenCalledWith('x'.repeat(200))
  })

  it('shows a generic message for non-ApiError errors', () => {
    handleServerError(new Error('network'))

    expect(toastError).toHaveBeenCalledWith('Something went wrong!')
  })

  it('does not toast for 401 (handled by the unauthorized hook) or aborted requests', () => {
    handleServerError(apiError({ status: 401 }))
    handleServerError(apiError({ kind: 'aborted', status: 0 }))

    expect(toastError).not.toHaveBeenCalled()
  })

  it('never logs to the console', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    handleServerError(new Error('x'))

    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })
})
