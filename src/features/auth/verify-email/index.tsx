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
  InvalidVerifyLink,
  VerifyEmailPanel,
} from './components/verify-email-panel'

export function VerifyEmail() {
  const token = useFragmentToken('/verify-email')

  return (
    <AuthLayout>
      <Card className='max-w-sm gap-4 sm:min-w-sm'>
        <CardHeader>
          <CardTitle className='text-lg tracking-tight'>
            Confirm email
          </CardTitle>
          <CardDescription>
            Confirm the email address of your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {token ? <VerifyEmailPanel token={token} /> : <InvalidVerifyLink />}
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
