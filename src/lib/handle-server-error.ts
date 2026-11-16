import { isApiError } from '@/api'
import { toast } from 'sonner'
import { forbiddenCopy, isForbidden } from '@/lib/forbidden'
import { formatRetryAfter } from '@/lib/retry-after'

export function handleServerError(error: unknown) {
  if (isApiError(error)) {
    // 401 is handled by the unauthorized hook; aborted requests are intentional.
    if (error.status === 401 || error.kind === 'aborted') return
    if (error.kind === 'auth') {
      // The auth gate shows the state; only a 429 needs a message.
      if (error.code === 'rate_limited')
        toast.error(
          `Too many requests. Try again in ${formatRetryAfter(error.retryAfter)}.`
        )
      return
    }
    if (isForbidden(error)) {
      const c = forbiddenCopy(error)
      toast.error(c.title, {
        description:
          c.description +
          (c.required ? ` Required permission: ${c.required}.` : ''),
      })
      return
    }
    toast.error(error.message.slice(0, 200))
    return
  }
  toast.error('Something went wrong!')
}
