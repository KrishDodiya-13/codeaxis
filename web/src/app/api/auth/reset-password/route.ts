/**
 * POST /api/auth/reset-password — set a new password with a valid code.
 *
 * The code is re-verified here rather than trusted from the verify step. That is the point
 * of not issuing an intermediate token: there is exactly one credential in this flow, it
 * is checked at the moment it is used, and a client cannot hold anything that would let it
 * skip the check.
 *
 * Resetting also revokes every existing session, by stamping `passwordChangedAt`. Sessions
 * are JWTs, so there are no rows to delete — the `jwt` callback rejects any token issued
 * before that timestamp. Whoever knew the old password is signed out everywhere.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { normalizeEmail } from '@/lib/auth/email-address'
import { clearOtps, consumeOtp, verifyOtp } from '@/lib/auth/otp'
import { MIN_PASSWORD_LENGTH, hashPassword, passwordProblems } from '@/lib/auth/password'
import { LIMITS, rateLimit, resetRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const REJECTED = 'That code is not valid. Request a new one.'

const Body = z
  .object({
    email: z.string().trim().min(3).max(320),
    code: z.string().trim().regex(/^\d{4,10}$/),
    password: z.string().min(1).max(200),
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

  const limit = rateLimit(
    `pwreset:${email}`,
    LIMITS.passwordReset.limit,
    LIMITS.passwordReset.windowMs,
  )
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.', retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    )
  }

  // The password is checked before the code is spent, so a rejected password does not
  // cost the user their code and force another round trip through their inbox.
  const problems = passwordProblems(parsed.data.password)
  if (problems.length > 0) {
    return NextResponse.json(
      { error: problems[0], problems, minLength: MIN_PASSWORD_LENGTH },
      { status: 400 },
    )
  }

  const verified = await verifyOtp(email, parsed.data.code)
  if (!verified.ok) {
    if (verified.reason === 'expired') {
      return NextResponse.json({ error: 'That code has expired. Request a new one.' }, { status: 400 })
    }
    if (verified.reason === 'exhausted') {
      return NextResponse.json({ error: 'Too many incorrect attempts. Request a new code.' }, { status: 429 })
    }
    return NextResponse.json({ error: REJECTED }, { status: 400 })
  }

  // Claim the code before touching the password. If two requests race, only one claim
  // succeeds, so the password cannot be set twice from one code.
  const claimed = await consumeOtp(verified.otpId)
  if (!claimed) return NextResponse.json({ error: REJECTED }, { status: 400 })

  const passwordHash = await hashPassword(parsed.data.password)

  const updated = await prisma.user.updateMany({
    where: { email },
    data: {
      passwordHash,
      // Revokes every session issued before now. See the note at the top.
      passwordChangedAt: new Date(),
    },
  })

  if (updated.count === 0) {
    // The account went away between verifying and writing. Nothing was changed.
    return NextResponse.json({ error: REJECTED }, { status: 400 })
  }

  // Nothing is left that could be replayed.
  await clearOtps(email)
  // The user is legitimate and about to sign in; leaving them throttled would punish them
  // for the reset they just completed.
  resetRateLimit(`otp:verify:${email}`)
  resetRateLimit(`otp:req:${email}`)

  console.info('[brandos] password reset completed')

  // No session is issued here. Signing in is a separate act through the one endpoint that
  // mints sessions, so there is a single place that does.
  return NextResponse.json({ reset: true, next: '/login' }, { status: 200 })
}
