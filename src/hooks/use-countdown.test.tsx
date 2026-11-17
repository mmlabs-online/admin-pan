import { describe, expect, it } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { useCountdown } from './use-countdown'

describe('useCountdown', () => {
  it('returns 0 for null', async () => {
    const { result } = await renderHook(() => useCountdown(null))
    expect(result.current).toBe(0)
  })

  it('counts down from a future timestamp to 0 and stays at 0', async () => {
    const until = Date.now() + 1500
    const { result } = await renderHook(() => useCountdown(until))
    expect(result.current).toBe(2)
    await expect.poll(() => result.current, { timeout: 4000 }).toBe(0)
    await new Promise((r) => setTimeout(r, 1200))
    expect(result.current).toBe(0)
  })
})
