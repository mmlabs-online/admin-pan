import { describe, expect, it, vi } from 'vitest'
import {
  currentAuthEpoch,
  getAccessToken,
  notifyUnauthorized,
  setUnauthorizedHandler,
} from './auth-hooks'

describe('auth hooks', () => {
  it('getAccessToken returns null when no provider is registered', async () => {
    expect(await getAccessToken()).toBeNull()
  })

  it('notifyUnauthorized calls the handler once per epoch and advances the epoch', () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    const epoch = currentAuthEpoch()
    notifyUnauthorized(epoch)
    notifyUnauthorized(epoch)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(currentAuthEpoch()).toBe(epoch + 1)
    setUnauthorizedHandler(() => {})
  })
})
