import { useCallback, useEffect, useRef } from 'react'

/**
 * Returns a scheduler that clears a dialog host's `currentRow` after the exit
 * animation (~200 ms; the delay keeps the row mounted through it). Re-opening
 * a dialog (`open !== null`) or unmounting cancels the pending clear, so a
 * stale timer can never unmount a newly opened dialog (BUG-002).
 */
export function useDelayedRowClear(
  open: unknown,
  clearRow: () => void,
  delayMs = 500
) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const openRef = useRef(open)
  const clearRowRef = useRef(clearRow)

  useEffect(() => {
    clearRowRef.current = clearRow
  })
  useEffect(() => {
    openRef.current = open
    if (open !== null) clearTimeout(timer.current)
  }, [open])
  useEffect(() => () => clearTimeout(timer.current), [])

  return useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (openRef.current === null) clearRowRef.current()
    }, delayMs)
  }, [delayMs])
}
