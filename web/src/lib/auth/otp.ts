/**
 * One-time codes for password recovery. Server-side only.
 *
 * The code exists in plaintext in exactly two places and never anywhere else: the
 * variable returned by `issueOtp`, which goes straight into an email and is then dropped,
 * and the request body of a verification attempt. It is never logged, never stored, never
 * returned through an API, and never written to a timing record.
 *
 * ## Why a hash and not encryption
 *
 * A hash is one-way, so a database leak yields nothing usable. SHA-256 rather than a slow
 * KDF is deliberate and safe here, for reasons that do not apply to passwords: the code is
 * high-entropy relative to its tiny lifetime, it expires in ten minutes, and it is
 * destroyed after five wrong guesses — so an offline attack has nothing to chew on and an
 * online one runs out of attempts long before a faster hash would matter.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db/client';

/** Digits in a code. Six is the familiar length; the attempt cap is what protects it. */
const CODE_LENGTH = 6;

/** How long a code stays valid. Short enough to limit exposure, long enough to be usable. */
export const OTP_TTL_MS = 10 * 60 * 1000;

/** Wrong guesses allowed before the code is destroyed. */
export const MAX_ATTEMPTS = 5;

/** How long before another code can be requested for the same address. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

export type IssueResult =
  | { issued: true; code: string; expiresAt: Date }
  /** A code was requested too soon after the last one. */
  | { issued: false; reason: 'cooldown'; retryAfterMs: number };

export type VerifyResult =
  | { ok: true; otpId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'exhausted' | 'none' };

/**
 * A cryptographically secure numeric code.
 *
 * `randomInt` draws from the CSPRNG and is unbiased across the range, which
 * `Math.random()` is not and `randomBytes % 10` would not be.
 */
function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += randomInt(0, 10).toString();
  return code;
}

/** The stored form. Salting adds nothing at this entropy and lifetime. */
function hashCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex digests. */
function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/**
 * Issues a code for `email`, replacing any earlier one.
 *
 * Deleting the previous rows is what makes "only the newest code works" true rather than
 * merely intended — two live codes would double an attacker's guessing budget.
 *
 * Callers must treat the returned code as write-only: send it, then let it go.
 */
export async function issueOtp(email: string): Promise<IssueResult> {
  // Cooldown is measured against the most recent code for this address, so requesting
  // repeatedly cannot be used to spray mail at someone.
  const latest = await prisma.passwordResetOtp.findFirst({
    where: { email },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (latest !== null) {
    const elapsed = Date.now() - latest.createdAt.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      return { issued: false, reason: 'cooldown', retryAfterMs: RESEND_COOLDOWN_MS - elapsed };
    }
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.$transaction([
    // Any earlier code stops working the moment a new one is issued.
    prisma.passwordResetOtp.deleteMany({ where: { email } }),
    prisma.passwordResetOtp.create({ data: { email, codeHash: hashCode(code), expiresAt } }),
  ]);

  return { issued: true, code, expiresAt };
}

/**
 * Checks a code without consuming it.
 *
 * Separate from consumption because the flow has two steps: verifying tells the UI to show
 * the new-password form, and the code is only spent once the password is actually set.
 * A wrong guess is counted here, so guessing is bounded either way.
 */
export async function verifyOtp(email: string, code: string): Promise<VerifyResult> {
  const record = await prisma.passwordResetOtp.findFirst({
    where: { email },
    orderBy: { createdAt: 'desc' },
  });

  if (record === null) return { ok: false, reason: 'none' };
  if (record.consumedAt !== null) return { ok: false, reason: 'none' };

  if (record.expiresAt.getTime() <= Date.now()) {
    // Expired codes are removed rather than left to accumulate.
    await prisma.passwordResetOtp.delete({ where: { id: record.id } }).catch(() => {});
    return { ok: false, reason: 'expired' };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'exhausted' };
  }

  if (!hashesMatch(hashCode(code), record.codeHash)) {
    const attempts = record.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      // Burned through the budget: destroy it rather than leave a known-hot target.
      await prisma.passwordResetOtp.delete({ where: { id: record.id } }).catch(() => {});
      return { ok: false, reason: 'exhausted' };
    }
    await prisma.passwordResetOtp.update({ where: { id: record.id }, data: { attempts } });
    return { ok: false, reason: 'invalid' };
  }

  return { ok: true, otpId: record.id };
}

/**
 * Marks a code used. Called only after the password has actually changed.
 *
 * Conditional on `consumedAt` still being null, so two concurrent resets cannot both
 * succeed against one code — the second update matches nothing.
 */
export async function consumeOtp(otpId: string): Promise<boolean> {
  const result = await prisma.passwordResetOtp.updateMany({
    where: { id: otpId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return result.count === 1;
}

/** Drops every code for an address, e.g. once the password is reset. */
export async function clearOtps(email: string): Promise<void> {
  await prisma.passwordResetOtp.deleteMany({ where: { email } });
}

/** The email body. Names the product, the expiry, and what to do if it was not them. */
export function otpEmail(code: string, minutes: number): { subject: string; text: string } {
  return {
    subject: `Your BRANDOS verification code`,
    text: [
      `Your BRANDOS password reset code is:`,
      ``,
      `    ${code}`,
      ``,
      `It expires in ${minutes} minutes and can be used once.`,
      ``,
      `If you did not ask to reset your BRANDOS password, you can ignore this email —`,
      `nothing has changed. Do not share this code with anyone; BRANDOS will never ask`,
      `you for it.`,
      ``,
      `— BRANDOS`,
    ].join('\n'),
  };
}
