/**
 * POST /api/auth/verify-otp — check a code without spending it.
 *
 * Two steps rather than one, because the UI needs to show the new-password form before
 * the password exists. The code is only consumed by the reset endpoint, so a user who
 * verifies and then closes the tab has not silently burned their code.
 *
 * A wrong guess is still counted here, so the attempt cap bounds guessing whether or not
 * the caller ever gets as far as setting a password.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizeEmail } from '@/lib/auth/email-address'
import { MAX_ATTEMPTS, verifyOtp } from '@/lib/auth/otp'
import { LIMITS, rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

/** One wording for every failure, so a wrong code and an unknown address look alike. */
const REJECTED = 'That code is not valid. Request a new one.'

const Body = z
  .object({
    email: z.string().trim().min(3).max(320),
    code: z.string().trim().regex(/^\d{4,10}$/, 'A code is digits only.'),
  })
  .strict()

export async function POST(request: Request) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 })
  }

  const parsed = Body.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: REJECTED }, { status: 400 })

  const email = normalizeEmail(parsed.data.email)
  if (email === null) return NextResponse.json({ error: REJECTED }, { status: 400 })

  // A backstop above the per-code cap: without it, requesting a fresh code would reset
  // the attempt budget and guessing could continue indefinitely.
  const limit = rateLimit(`otp:verify:${email}`, LIMITS.otpVerify.limit, LIMITS.otpVerify.windowMs)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.', retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    )
  }

  const result = await verifyOtp(email, parsed.data.code)

  if (result.ok) {
    // No token is issued. The reset endpoint re-verifies the code, so there is no second
    // credential to leak and nothing to keep in client state.
    return NextResponse.json({ verified: true }, { status: 200 })
  }

  if (result.reason === 'exhausted') {
    return NextResponse.json(
      { error: `Too many incorrect attempts. Request a new code.`, maxAttempts: MAX_ATTEMPTS },
      { status: 429 },
    )
  }

  if (result.reason === 'expired') {
    return NextResponse.json({ error: 'That code has expired. Request a new one.' }, { status: 400 })
  }

  return NextResponse.json({ error: REJECTED }, { status: 400 })
}
