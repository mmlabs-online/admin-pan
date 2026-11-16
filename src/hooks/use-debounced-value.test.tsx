import { describe, expect, it } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { useDebouncedValue } from './use-debounced-value'

describe('useDebouncedValue', () => {
  it('returns the initial value, then the last value after the delay, ignoring intermediate ones', async () => {
    const { result, rerender } = await renderHook<{ v: string }, string>(
      (props) => useDebouncedValue(props?.v ?? 'a', 50),
      { initialProps: { v: 'a' } }
    )
    expect(result.current).toBe('a')
    await rerender({ v: 'b' })
    await rerender({ v: 'c' })
    expect(result.current).toBe('a')
    await expect.poll(() => result.current).toBe('c')
  })
})
