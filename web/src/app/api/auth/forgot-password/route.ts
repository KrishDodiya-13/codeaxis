/**
 * POST /api/auth/forgot-password — send a reset code.
 *
 * ## Every path returns the same thing
 *
 * Unknown address, known address, address that only has Google sign-in, rate-limited,
 * mail provider broken — all return the same 200 and the same sentence. Anything else
 * turns this endpoint into a way to ask "does this person have a BRANDOS account", which
 * is information the person asking may have no right to.
 *
 * That includes failures: if sending throws, it is logged server-side and the caller is
 * still told the same thing. A 500 on a known address and a 200 on an unknown one would
 * leak exactly what the identical wording is there to hide.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { normalizeEmail } from '@/lib/auth/email-address';
import { OTP_TTL_MS, issueOtp, otpEmail } from '@/lib/auth/otp';
import { sendEmail } from '@/lib/email/send';
import { LIMITS, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/** The one sentence this endpoint says, whatever happened. */
const GENERIC = 'If an account exists for this email, a verification code has been sent.';

const Body = z.object({ email: z.string().trim().min(3).max(320) }).strict();

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  // A malformed body is a client bug, not an enumeration vector, so it may say so.
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter an email address.' }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);
  // Even a syntactically invalid address gets the generic answer — "that is not an
  // address" and "no such account" are different answers, and the difference is a signal.
  if (email === null) return NextResponse.json({ message: GENERIC }, { status: 200 });

  // Keyed on the address so one mailbox cannot be sprayed, whatever IP is asking.
  const limit = rateLimit(`otp:req:${email}`, LIMITS.otpRequest.limit, LIMITS.otpRequest.windowMs);
  if (!limit.allowed) {
    // Still the same wording, still 200: a 429 here would confirm the address is being
    // asked about, and an attacker can already tell they are sending a lot of requests.
    return NextResponse.json({ message: GENERIC }, { status: 200 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    // No account, or a Google-only account with no password to reset. Both do nothing and
    // say the same thing — telling a Google user to use Google would confirm they exist.
    if (user !== null && user.passwordHash !== null) {
      const issued = await issueOtp(email);

      if (issued.issued) {
        const { subject, text } = otpEmail(issued.code, Math.round(OTP_TTL_MS / 60000));
        await sendEmail({ to: email, subject, text });
        // Nothing about the code is recorded — not the code, not its hash, not its length.
        console.info('[brandos] password reset code sent');
      }
      // On cooldown: deliberately silent. The previous code is still valid.
    }
  } catch (error) {
    // Logged with no address and no code, so the log is useful without being a leak.
    console.error(
      '[brandos] password reset could not be processed',
      error instanceof Error ? error.name : 'unknown',
    );
  }

  return NextResponse.json({ message: GENERIC }, { status: 200 });
}
