import type { Metadata } from 'next'
import AuthShell from '@/components/auth/auth-shell'
import AuthForm from '@/components/auth/auth-form'

export const metadata: Metadata = { title: 'Sign up · BRANDOS' }

export default function SignupPage() {
  return (
    <AuthShell>
      <AuthForm mode="signup" />
    </AuthShell>
  )
}
