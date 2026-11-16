import { useLocation } from '@tanstack/react-router'
import { safeRedirect } from '@/lib/safe-redirect'

/** The current page as a validated `redirect` value (no hash); undefined at "/". */
export function useReturnTo(): string | undefined {
  const location = useLocation()
  const target = safeRedirect(location.pathname + location.searchStr)
  return target === '/' ? undefined : target
}
