'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import HoverLetters from '@/components/hover-letters'

type Mode = 'login' | 'signup'

const COPY: Record<
  Mode,
  { title: string; subtitle: string; submit: string; switchText: string; switchLink: string; switchHref: string }
> = {
  login: {
    title: 'Welcome back',
    subtitle: 'Sign in to your BRANDOS workspace.',
    submit: 'Sign in',
    switchText: 'No account?',
    switchLink: 'Create one',
    switchHref: '/signup',
  },
  signup: {
    title: 'Create your account',
    subtitle: 'Turn a rough idea into a launch-ready Brand OS.',
    submit: 'Create account',
    switchText: 'Already have an account?',
    switchLink: 'Log in',
    switchHref: '/login',
  },
}

// There is no auth backend yet (ARCHITECTURE.md keeps auth out of the MVP),
// so the form says so instead of pretending to sign anyone in.
const NOT_CONNECTED = "Accounts aren't connected yet, so nothing was sent."

// Text turns green on hover; the boxes themselves do not.
const hoverText = 'transition-colors hover:text-poster-green'

const labelClass = `text-xs font-extrabold uppercase tracking-wide ${hoverText}`

const inputClass =
  'h-12 w-full rounded-full border-2 border-poster-ink bg-white px-5 text-sm font-semibold text-poster-ink placeholder:font-medium placeholder:text-poster-ink/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

export default function AuthForm({ mode }: { mode: Mode }) {
  const copy = COPY[mode]
  const [notice, setNotice] = useState<string | null>(null)

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setNotice(NOT_CONNECTED)
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-display text-4xl uppercase leading-[0.95] tracking-[-0.03em]">
        <HoverLetters text={copy.title} />
      </h1>
      <p className={`mt-3 text-sm font-semibold text-poster-ink/60 ${hoverText}`}>{copy.subtitle}</p>

      <Button
        type="button"
        onClick={() => setNotice(NOT_CONNECTED)}
        className="group mt-8 h-12 w-full rounded-full border-2 border-poster-ink bg-white font-extrabold text-poster-ink shadow-none hover:bg-white focus-visible:ring-4 focus-visible:ring-poster-green/40"
      >
        <GoogleIcon />
        <span className="transition-colors group-hover:text-poster-green">Continue with Google</span>
      </Button>

      <div className="my-6 flex items-center gap-4 text-xs font-extrabold text-poster-ink/40" aria-hidden="true">
        <span className="h-0.5 flex-1 bg-poster-ink/15" />
        OR
        <span className="h-0.5 flex-1 bg-poster-ink/15" />
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        {mode === 'signup' && (
          <div className="space-y-2">
            <label htmlFor="name" className={labelClass}>
              Name
            </label>
            <input id="name" name="name" autoComplete="name" required placeholder="Ada Lovelace" className={inputClass} />
          </div>
        )}

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
            placeholder="you@company.com"
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            {mode === 'login' && (
              <button
                type="button"
                onClick={() => setNotice(NOT_CONNECTED)}
                className={`rounded text-xs font-bold text-poster-ink/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-poster-green ${hoverText}`}
              >
                Forgot?
              </button>
            )}
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'signup' ? 8 : undefined}
            placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
            className={inputClass}
          />
        </div>

        {/* Same green pill as the landing page's "Start building". */}
        <Button
          type="submit"
          className="group h-12 w-full rounded-full border-2 border-poster-ink bg-poster-green text-base font-extrabold text-poster-ink shadow-none transition-colors hover:bg-poster-ink hover:text-poster-paper focus-visible:ring-4 focus-visible:ring-poster-green/40"
        >
          {copy.submit}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </Button>
      </form>

      <p role="status" className="mt-4 min-h-5 text-center text-sm font-semibold">
        {notice && (
          <>
            <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-poster-green ring-1 ring-poster-ink" />
            {notice}
          </>
        )}
      </p>

      <p className="mt-4 text-center text-sm font-semibold text-poster-ink/60">
        <span className={hoverText}>{copy.switchText}</span>{' '}
        <Link
          href={copy.switchHref}
          className={`rounded font-extrabold text-poster-ink underline decoration-poster-green decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-poster-green ${hoverText}`}
        >
          {copy.switchLink}
        </Link>
      </p>
    </div>
  )
}
