import type { Metadata } from 'next'
import AuthShell from '@/components/auth/auth-shell'
import AuthForm from '@/components/auth/auth-form'
import { googleConfigured } from '@/lib/auth/config'
import { safeCallbackPath } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Sign up · BRANDOS' }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await searchParams
  const next = safeCallbackPath(callbackUrl) ?? undefined

  return (
    <AuthShell>
      <AuthForm mode="signup" googleEnabled={googleConfigured} callbackUrl={next} />
    </AuthShell>
  )
}
