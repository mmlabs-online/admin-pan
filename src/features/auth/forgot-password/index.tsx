import { Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'

export function ForgotPassword() {
  return (
    <AuthLayout>
      <Card className='max-w-sm gap-4 sm:min-w-sm'>
        <CardHeader>
          <CardTitle className='text-lg tracking-tight'>
            Forgot your password?
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          <p>
            mmlabs Admin can&apos;t send password reset emails. Reset your
            password from any mmlabs app you use with this account: choose its
            &quot;Forgot password&quot; option and follow the link in the email.
            Then come back here and sign in with your new password.
          </p>
          <p>
            If you don&apos;t use any other mmlabs app, contact an
            administrator.
          </p>
        </CardContent>
        <CardFooter>
          <p className='mx-auto px-8 text-center text-sm text-balance text-muted-foreground'>
            Remember your password?{' '}
            <Link
              to='/sign-in'
              className='underline underline-offset-4 hover:text-primary'
            >
              Sign in
            </Link>
            .
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
