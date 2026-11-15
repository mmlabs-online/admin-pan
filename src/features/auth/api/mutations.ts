import { useMutation } from '@tanstack/react-query'
import {
  forgotPassword,
  getApi,
  resetPassword,
  type ApiClient,
  type components,
} from '@/api'

type Forgot = components['schemas']['ForgotPasswordRequest']
type Reset = components['schemas']['ResetPasswordRequest']

// Variables hold an email / token / password: never retried, never kept in the
// cache, no mutationKey or meta (R5).
export function useForgotPasswordMutation(api: () => ApiClient = getApi) {
  return useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: (body: Forgot) => forgotPassword(api(), body),
  })
}

export function useResetPasswordMutation(api: () => ApiClient = getApi) {
  return useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: (body: Reset) => resetPassword(api(), body),
  })
}
