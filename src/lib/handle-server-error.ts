import { isApiError } from '@/api'
import { toast } from 'sonner'

export function handleServerError(error: unknown) {
  if (isApiError(error)) {
    // 401 is handled by the unauthorized hook; aborted requests are intentional.
    if (error.status === 401 || error.kind === 'aborted') return
    toast.error(error.message.slice(0, 200))
    return
  }
  toast.error('Something went wrong!')
}
