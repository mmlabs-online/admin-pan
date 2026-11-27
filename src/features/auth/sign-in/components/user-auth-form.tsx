import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { authFailure } from '@/api'
import { useAuth } from '@mmlabs/auth-client/react'
import { Loader2, LogIn } from 'lucide-react'
import { formatRetryAfter } from '@/lib/retry-after'
import { safeRedirect } from '@/lib/safe-redirect'
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
import { PasswordInput } from '@/components/password-input'
import { Turnstile, type TurnstileHandle } from '@/components/turnstile'

// The server owns the password policy, so only "not empty" is checked here.
const formSchema = z.object({
  email: z.email({
    error: (iss) => (iss.input === '' ? 'Please enter your email.' : undefined),
  }),
  password: z.string().min(1, 'Please enter your password.'),
})

function messageFor(e: unknown): string {
  const f = authFailure(e)
  switch (f.kind) {
    case 'invalid_credentials':
      return 'Email or password is incorrect.'
    case 'turnstile_required':
      return 'Complete the verification, then sign in again.'
    case 'turnstile_failed':
      return 'Verification failed. Please try again.'
    case 'rate_limited':
      return `Too many attempts. Try again in ${formatRetryAfter(f.retryAfter)}.`
    case 'network':
      return 'Could not reach the server. Please try again.'
    case 'validation':
      return 'Please check your email and password.'
    default:
      return 'Something went wrong. Please try again later.'
  }
}

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

export function UserAuthForm({
  className,
  redirectTo,
  ...props
}: UserAuthFormProps) {
  const navigate = useNavigate()
  const { login, reload, status } = useAuth()
  const [signedIn, setSignedIn] = useState(false)
  const navigated = useRef(false)
  const [needsTurnstile, setNeedsTurnstile] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstile = useRef<TurnstileHandle>(null)
  // Set synchronously on submit: guards a second submit before React re-renders.
  const inFlight = useRef(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })

  // The password goes straight to the auth library and nowhere else (R3).
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    meta: { handlesOwnErrors: true },
    mutationFn: async (v: {
      email: string
      password: string
      turnstileToken?: string
    }) => {
      await login(v)
      // login() resolves before the provider's state catches up; wait for it
      // so the guard does not bounce us back to /sign-in (BUG-003).
      await reload()
    },
    onError: (e) => {
      inFlight.current = false
      if (authFailure(e).kind === 'turnstile_required') setNeedsTurnstile(true)
    },
    onSuccess: () => {
      setSignedIn(true)
    },
    onSettled: () => {
      form.resetField('password')
      // the Turnstile token is single-use
      turnstile.current?.reset()
    },
  })

  // Navigate once, on the committed auth status. ready / needs-account / error
  // are rendered by AuthGate at the target (target, picker, retry).
  useEffect(() => {
    if (!signedIn || status === 'signed-out' || status === 'loading') return
    if (!navigated.current) {
      navigated.current = true
      void navigate({ href: safeRedirect(redirectTo), replace: true })
    }
  }, [signedIn, status, navigate, redirectTo])

  // signed-out after a successful login: stay here with an alert, no loop
  const sessionError = signedIn && status === 'signed-out'
  const busy = mutation.isPending || (signedIn && !sessionError)
  const turnstileMissing = needsTurnstile && !turnstileToken
  const blocked = busy || turnstileMissing

  useEffect(() => {
    if (sessionError) inFlight.current = false
  }, [sessionError])

  function onSubmit(data: z.infer<typeof formSchema>) {
    if (busy || inFlight.current || turnstileMissing) return
    inFlight.current = true
    setSignedIn(false)
    mutation.mutate({
      ...data,
      ...(needsTurnstile && turnstileToken ? { turnstileToken } : {}),
    })
  }

  return (
    <Form {...form}>
      <form
        method='post'
        noValidate
        onSubmit={(e) => {
          if (inFlight.current || blocked) {
            e.preventDefault()
            return
          }
          void form.handleSubmit(onSubmit)(e)
        }}
        className={cn('grid gap-3', className)}
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
                  autoComplete='username'
                  placeholder='name@example.com'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete='current-password'
                  placeholder='********'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <p className='text-sm text-muted-foreground'>
          Forgot your password? Reset it from any mmlabs app you use.
        </p>
        {needsTurnstile && (
          <Turnstile ref={turnstile} onToken={setTurnstileToken} />
        )}
        {(mutation.isError || sessionError) && (
          <p role='alert' className='text-sm text-destructive'>
            {mutation.isError
              ? messageFor(mutation.error)
              : 'Could not start your session. Please try again.'}
          </p>
        )}
        <p role='status' className='sr-only'>
          {busy ? 'Signing in…' : ''}
        </p>
        {/* aria-disabled, not disabled: the button keeps keyboard focus while
            busy; submits are blocked in the form's onSubmit instead. */}
        <Button
          className='mt-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
          aria-disabled={blocked || undefined}
          aria-busy={busy}
        >
          {busy ? (
            <Loader2 className='animate-spin' aria-hidden='true' />
          ) : (
            <LogIn aria-hidden='true' />
          )}
          Sign in
        </Button>
      </form>
    </Form>
  )
}
