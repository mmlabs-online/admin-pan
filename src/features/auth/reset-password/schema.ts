import { z } from 'zod'

// No minimum length here: the API owns the password policy (R1/R4).
// Length is measured after NFKC like the API does; the value is not trimmed.
export const resetPasswordSchema = z
  .object({
    new_password: z
      .string()
      .min(1, 'Please enter your new password.')
      .refine((v) => v.normalize('NFKC').length <= 128, {
        message: 'Password must be at most 128 characters.',
      }),
    confirm: z.string().min(1, 'Please confirm your password.'),
  })
  .refine((d) => d.new_password === d.confirm, {
    message: 'Passwords do not match.',
    path: ['confirm'],
  })

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
