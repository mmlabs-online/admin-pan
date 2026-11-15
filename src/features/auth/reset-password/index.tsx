import { useFragmentToken } from '@/lib/fragment-token'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import {
  InvalidLink,
  ResetPasswordForm,
} from './components/reset-password-form'

export function ResetPassword() {
  const token = useFragmentToken('/reset-password')

  return (
    <AuthLayout>
      <Card className='max-w-sm gap-4 sm:min-w-sm'>
        <CardHeader>
          <CardTitle className='text-lg tracking-tight'>
            Reset password
          </CardTitle>
          <CardDescription>
            Choose a new password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {token ? <ResetPasswordForm token={token} /> : <InvalidLink />}
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
