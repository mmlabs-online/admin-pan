import { useRef, useState } from 'react'
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
  const { login } = useAuth()
  const [needsTurnstile, setNeedsTurnstile] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstile = useRef<TurnstileHandle>(null)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })

  // The password goes straight to the auth library and nowhere else (R3).
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    meta: { handlesOwnErrors: true },
    mutationFn: (v: {
      email: string
      password: string
      turnstileToken?: string
    }) => login(v),
    onError: (e) => {
      if (authFailure(e).kind === 'turnstile_required') setNeedsTurnstile(true)
    },
    onSuccess: () => {
      void navigate({ href: safeRedirect(redirectTo), replace: true })
    },
    onSettled: () => {
      form.resetField('password')
      // the Turnstile token is single-use
      turnstile.current?.reset()
    },
  })

  function onSubmit(data: z.infer<typeof formSchema>) {
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
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
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
        {mutation.isError && (
          <p role='alert' className='text-sm text-destructive'>
            {messageFor(mutation.error)}
          </p>
        )}
        <Button
          className='mt-2'
          disabled={mutation.isPending || (needsTurnstile && !turnstileToken)}
          aria-busy={mutation.isPending}
        >
          {mutation.isPending ? (
            <Loader2 className='animate-spin' />
          ) : (
            <LogIn />
          )}
          Sign in
        </Button>
      </form>
    </Form>
  )
}
