import { useEffect, useState } from 'react'

/** Whole seconds left until the absolute time `until` (ms), 0 when null or past. */
export function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until === null) return
    const tick = () => {
      const t = Date.now()
      setNow(t)
      if (t >= until) clearInterval(id)
    }
    const id = setInterval(tick, 1000)
    const first = setTimeout(tick, 0) // sync `now` when `until` was just set
    return () => {
      clearInterval(id)
      clearTimeout(first)
    }
  }, [until])
  if (until === null) return 0
  return Math.max(0, Math.ceil((until - now) / 1000))
}
