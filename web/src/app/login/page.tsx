import type { Metadata } from 'next'
import AuthShell from '@/components/auth/auth-shell'
import AuthForm from '@/components/auth/auth-form'

export const metadata: Metadata = { title: 'Log in · BRANDOS' }

export default function LoginPage() {
  return (
    <AuthShell>
      <AuthForm mode="login" />
    </AuthShell>
  )
}
