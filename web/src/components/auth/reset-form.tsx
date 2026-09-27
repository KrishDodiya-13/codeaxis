'use client'

/**
 * Password recovery: email, then code, then new password.
 *
 * Three steps in one component because they are one task and the email has to be carried
 * between them. Styling is lifted from `auth-form` rather than invented, so this reads as
 * the same product — no redesign, just the controls the flow needs.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import HoverLetters from '@/components/hover-letters'

type Step = 'email' | 'code' | 'password' | 'done'

const hoverText = 'transition-colors hover:text-poster-green'
const labelClass = `text-xs font-extrabold uppercase tracking-wide ${hoverText}`
const inputClass =
  'h-12 w-full rounded-full border-2 border-poster-ink bg-white px-5 text-sm font-semibold text-poster-ink placeholder:font-medium placeholder:text-poster-ink/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40'

const COPY: Record<Step, { title: string; subtitle: string; submit: string }> = {
  email: {
    title: 'Reset your password',
    subtitle: 'Enter your email and we will send a verification code.',
    submit: 'Send code',
  },
  code: {
    title: 'Check your email',
    subtitle: 'Enter the 6-digit code. It expires in 10 minutes.',
    submit: 'Verify code',
  },
  password: {
    title: 'Set a new password',
    subtitle: 'At least 10 characters. This signs you out everywhere else.',
    submit: 'Save password',
  },
  done: {
    title: 'Password changed',
    subtitle: 'Sign in with your new password.',
    submit: 'Go to login',
  },
}

/** Reads `{ error }` from a response body, falling back to a plain sentence. */
async function errorFrom(res: Response, fallback: string): Promise<string> {
  const data: unknown = await res.json().catch(() => null)
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  return typeof record.error === 'string' ? record.error : fallback
}

export default function ResetForm() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const copy = COPY[step]

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (busy) return

    if (step === 'done') {
      router.push('/login')
      return
    }

    setBusy(true)
    setNotice(null)

    try {
      if (step === 'email') {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        if (!res.ok) {
          setNotice(await errorFrom(res, 'Could not send a code.'))
          return
        }
        // The server says the same thing whether or not the account exists, and so does
        // this: moving on regardless is what keeps the UI from leaking what the API hides.
        const data: unknown = await res.json().catch(() => null)
        const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
        setNotice(typeof record.message === 'string' ? record.message : null)
        setStep('code')
        return
      }

      if (step === 'code') {
        const res = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code }),
        })
        if (!res.ok) {
          setNotice(await errorFrom(res, 'That code is not valid.'))
          return
        }
        setStep('password')
        return
      }

      // step === 'password'
      const form = new FormData(e.currentTarget)
      const password = String(form.get('password') ?? '')

      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The code is sent again: the server re-verifies it rather than trusting the
        // earlier step, so there is no intermediate token to hold or leak.
        body: JSON.stringify({ email, code, password }),
      })
      if (!res.ok) {
        setNotice(await errorFrom(res, 'Could not set the password.'))
        return
      }
      setStep('done')
    } catch {
      setNotice('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-display text-4xl uppercase leading-[0.95] tracking-[-0.03em]">
        <HoverLetters text={copy.title} />
      </h1>
      <p className={`mt-3 text-sm font-semibold text-poster-ink/60 ${hoverText}`}>{copy.subtitle}</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        {step === 'email' && (
          <div className="space-y-2">
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className={inputClass}
            />
          </div>
        )}

        {step === 'code' && (
          <div className="space-y-2">
            <label htmlFor="code" className={labelClass}>
              Verification code
            </label>
            <input
              id="code"
              name="code"
              // `inputMode` gives a numeric keypad without rejecting a pasted code.
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className={`${inputClass} tracking-[0.4em]`}
            />
          </div>
        )}

        {step === 'password' && (
          <div className="space-y-2">
            <label htmlFor="password" className={labelClass}>
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              placeholder="At least 10 characters"
              className={inputClass}
            />
          </div>
        )}

        <Button
          type="submit"
          disabled={busy}
          className="group h-12 w-full rounded-full border-2 border-poster-ink bg-poster-green text-base font-extrabold text-poster-ink shadow-none transition-colors hover:bg-poster-ink hover:text-poster-paper focus-visible:ring-4 focus-visible:ring-poster-green/40 disabled:opacity-60"
        >
          {busy ? 'One moment…' : copy.submit}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </Button>
      </form>

      {notice !== null && (
        <p role="status" className="mt-4 text-sm font-semibold text-poster-ink/70">
          {notice}
        </p>
      )}

      <p className="mt-8 text-sm font-semibold text-poster-ink/60">
        <Link href="/login" className={`font-extrabold text-poster-ink ${hoverText}`}>
          Back to login
        </Link>
      </p>
    </div>
  )
}
