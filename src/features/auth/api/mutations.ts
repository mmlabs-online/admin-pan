import { useMutation } from '@tanstack/react-query'
import {
  getApi,
  resetPassword,
  verifyEmail,
  type ApiClient,
  type components,
} from '@/api'

type Reset = components['schemas']['ResetPasswordRequest']
type Verify = components['schemas']['VerifyEmailRequest']

// Variables hold an token / password: never retried, never kept in the
// cache, no mutationKey (R5). The only meta is a boolean opting out of the
// app-wide error toast: these forms render their own fixed messages.
export function useResetPasswordMutation(api: () => ApiClient = getApi) {
  return useMutation({
    retry: false,
    gcTime: 0,
    meta: { handlesOwnErrors: true },
    mutationFn: (body: Reset) => resetPassword(api(), body),
  })
}

export function useVerifyEmailMutation(api: () => ApiClient = getApi) {
  return useMutation({
    retry: false,
    gcTime: 0,
    meta: { handlesOwnErrors: true },
    mutationFn: (body: Verify) => verifyEmail(api(), body),
  })
}
