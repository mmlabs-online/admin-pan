import { useRef, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { isApiError, type ApiClient } from '@/api'
import { ArrowRight, Loader2 } from 'lucide-react'
import { formatRetryAfter } from '@/lib/retry-after'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Turnstile, type TurnstileHandle } from '@/components/turnstile'
import { useForgotPasswordMutation } from '../../api/mutations'
import { StatusPanel } from '../../components/status-panel'

const formSchema = z.object({
  email: z.email({
    error: (iss) => (iss.input === '' ? 'Please enter your email.' : undefined),
  }),
})

type Status =
  | { state: 'idle' }
  | { state: 'sent' }
  | { state: 'error'; message: string }

function messageFor(e: unknown): string {
  if (isApiError(e)) {
    if (e.status === 403 && e.code === 'turnstile_failed') {
      return 'Verification failed. Please try again.'
    }
    if (e.status === 429) {
      return `Too many requests. Try again in ${formatRetryAfter(e.retryAfter)}.`
    }
    if (e.kind === 'network' || e.kind === 'timeout') {
      return 'Could not reach the server. Please try again.'
    }
  }
  return 'Something went wrong. Please try again later.'
}

export function ForgotPasswordForm({
  className,
  api,
  ...props
}: React.HTMLAttributes<HTMLFormElement> & { api?: () => ApiClient }) {
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstile = useRef<TurnstileHandle>(null)
  const mutation = useForgotPasswordMutation(api)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  })

  function onSubmit(data: z.infer<typeof formSchema>) {
    if (!turnstileToken) return
    setStatus({ state: 'idle' })
    mutation.mutate(
      { email: data.email, turnstile_token: turnstileToken },
      {
        onSuccess: () => {
          form.reset()
          setStatus({ state: 'sent' })
        },
        onError: (e) => {
          if (isApiError(e, 422)) {
            form.setError(
              'email',
              { message: 'Please enter a valid email.' },
              { shouldFocus: true }
            )
          } else {
            setStatus({ state: 'error', message: messageFor(e) })
          }
        },
        // the Turnstile token is single-use
        onSettled: () => turnstile.current?.reset(),
      }
    )
  }

  if (status.state === 'sent') {
    return (
      <StatusPanel title='Check your email'>
        <p>
          If an account exists for that address, we&apos;ve sent a reset link.
          It expires in 30 minutes.
        </p>
      </StatusPanel>
    )
  }

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        className={cn('grid gap-2', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type='email'
                  autoComplete='email'
                  placeholder='name@example.com'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Turnstile ref={turnstile} onToken={setTurnstileToken} />
        {status.state === 'error' && (
          <p role='alert' className='text-sm text-destructive'>
            {status.message}
          </p>
        )}
        {!turnstileToken && (
          <p id='turnstile-hint' className='text-sm text-muted-foreground'>
            Complete the verification to continue.
          </p>
        )}
        <Button
          className='mt-2'
          disabled={mutation.isPending || !turnstileToken}
          aria-describedby={!turnstileToken ? 'turnstile-hint' : undefined}
        >
          Continue
          {mutation.isPending ? (
            <Loader2 className='animate-spin' />
          ) : (
            <ArrowRight />
          )}
        </Button>
      </form>
    </Form>
  )
}
