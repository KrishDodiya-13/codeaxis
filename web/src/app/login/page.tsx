import type { Metadata } from 'next'
import AuthShell from '@/components/auth/auth-shell'
import AuthForm from '@/components/auth/auth-form'
import { googleConfigured } from '@/lib/auth/config'
import { safeCallbackPath } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Log in · BRANDOS' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await searchParams
  // Validated server-side before it reaches the form, so a crafted ?callbackUrl= cannot
  // turn this page into an open redirect.
  const next = safeCallbackPath(callbackUrl) ?? undefined

  return (
    <AuthShell>
      <AuthForm mode="login" googleEnabled={googleConfigured} callbackUrl={next} />
    </AuthShell>
  )
}
