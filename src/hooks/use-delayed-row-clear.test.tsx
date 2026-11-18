import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { useDelayedRowClear } from './use-delayed-row-clear'

type Props = { open: string | null }

async function setup(initial: string | null = null) {
  const clearRow = vi.fn()
  const hook = await renderHook<Props, () => void>(
    (props) => useDelayedRowClear(props?.open ?? null, clearRow),
    { initialProps: { open: initial } }
  )
  return { clearRow, ...hook }
}

describe('useDelayedRowClear', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterEach(() => vi.useRealTimers())

  it('re-opening a dialog before the delay cancels the pending row clear', async () => {
    const { clearRow, result, rerender } = await setup('status')
    await rerender({ open: null })
    result.current()
    vi.advanceTimersByTime(300)
    await rerender({ open: 'status' })
    vi.advanceTimersByTime(1000)
    expect(clearRow).not.toHaveBeenCalled()
  })

  it('clears the row once after the delay when nothing re-opens', async () => {
    const { clearRow, result, rerender } = await setup('status')
    await rerender({ open: null })
    result.current()
    vi.advanceTimersByTime(499)
    expect(clearRow).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(clearRow).toHaveBeenCalledTimes(1)
  })

  it('a second close restarts the delay (one clear only)', async () => {
    const { clearRow, result, rerender } = await setup('status')
    await rerender({ open: null })
    result.current()
    vi.advanceTimersByTime(300)
    result.current()
    vi.advanceTimersByTime(499)
    expect(clearRow).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(clearRow).toHaveBeenCalledTimes(1)
  })

  it('unmount cancels the pending clear', async () => {
    const { clearRow, result, rerender, unmount } = await setup('status')
    await rerender({ open: null })
    result.current()
    await unmount()
    vi.advanceTimersByTime(1000)
    expect(clearRow).not.toHaveBeenCalled()
  })

  it('does not clear while a dialog is open even if open did not change', async () => {
    const { clearRow, result } = await setup('status')
    result.current()
    vi.advanceTimersByTime(500)
    expect(clearRow).not.toHaveBeenCalled()
  })
})
