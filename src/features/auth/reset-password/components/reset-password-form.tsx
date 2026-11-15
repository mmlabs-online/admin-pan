import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { isApiError, type ApiClient } from '@/api'
import { Loader2 } from 'lucide-react'
import { passwordErrorsFrom } from '@/lib/password-errors'
import { formatRetryAfter } from '@/lib/retry-after'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { PasswordInput } from '@/components/password-input'
import { useResetPasswordMutation } from '../../api/mutations'
import { StatusPanel } from '../../components/status-panel'
import { resetPasswordSchema, type ResetPasswordValues } from '../schema'

type Status = 'idle' | 'success' | 'expired'

const linkClass = 'underline underline-offset-4 hover:text-primary'

export function InvalidLink() {
  return (
    <StatusPanel title='Invalid link'>
      <p>This link is invalid. Request a new one.</p>
      <Link to='/forgot-password' className={linkClass}>
        Forgot password
      </Link>
    </StatusPanel>
  )
}

export function ResetPasswordForm({
  token,
  api,
}: {
  token: string
  api?: () => ApiClient
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [formError, setFormError] = useState<string | null>(null)
  const mutation = useResetPasswordMutation(api)
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { new_password: '', confirm: '' },
  })

  function onSubmit(values: ResetPasswordValues) {
    setFormError(null)
    mutation.mutate(
      { token, new_password: values.new_password },
      {
        onSuccess: () => {
          form.reset()
          setStatus('success')
        },
        onError: (e) => {
          if (isApiError(e, 422) && e.code === 'token_invalid') {
            form.reset()
            setStatus('expired')
            return
          }
          const mapped = passwordErrorsFrom(e)
          if (mapped) {
            for (const [name, message] of Object.entries(mapped.fields)) {
              form.setError(
                name as keyof ResetPasswordValues,
                { message },
                { shouldFocus: true }
              )
            }
            if (mapped.form) setFormError(mapped.form)
          } else if (isApiError(e, 429)) {
            setFormError(
              `Too many requests. Try again in ${formatRetryAfter(e.retryAfter)}.`
            )
          } else if (isApiError(e) && ['network', 'timeout'].includes(e.kind)) {
            setFormError('Could not reach the server. Please try again.')
          } else {
            setFormError('Something went wrong. Please try again later.')
          }
        },
      }
    )
  }

  if (status === 'success') {
    return (
      <StatusPanel title='Password changed'>
        <p>
          All sessions of this account were signed out. Sign in with your new
          password.
        </p>
        <Link to='/sign-in' className={linkClass}>
          Sign in
        </Link>
      </StatusPanel>
    )
  }
  if (status === 'expired') {
    return (
      <StatusPanel title='Link expired'>
        <p>This link is invalid, expired or already used.</p>
        <Link to='/forgot-password' className={linkClass}>
          Request a new link
        </Link>
      </StatusPanel>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='grid gap-2'>
        <FormField
          control={form.control}
          name='new_password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete='new-password' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='confirm'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete='new-password' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {formError && (
          <p role='alert' className='text-sm text-destructive'>
            {formError}
          </p>
        )}
        <Button className='mt-2' disabled={mutation.isPending}>
          Change password
          {mutation.isPending && <Loader2 className='animate-spin' />}
        </Button>
      </form>
    </Form>
  )
}
