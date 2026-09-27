import type { Metadata } from 'next'
import AuthShell from '@/components/auth/auth-shell'
import ResetForm from '@/components/auth/reset-form'

export const metadata: Metadata = { title: 'Reset password · BRANDOS' }

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <ResetForm />
    </AuthShell>
  )
}
