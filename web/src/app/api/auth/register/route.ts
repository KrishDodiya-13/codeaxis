/**
 * POST /api/auth/register — create an email/password account.
 *
 * Auth.js signs people in; it does not create accounts for a credentials provider, so
 * this does. Signing in afterwards is a separate call to the Auth.js sign-in endpoint —
 * this route deliberately does not mint a session, so there is one place that issues one.
 *
 * ## On telling people an address is taken
 *
 * The forgot-password endpoint must not reveal whether an account exists, because the
 * person asking may not own the address. Registration is different: the person is
 * asserting the address is theirs, and refusing without saying why leaves them stuck with
 * no way forward. So this does say "that address is already registered" — the trade is
 * deliberate, and it is the same choice every major provider makes.
 *
 * Where it matters, the response is still shaped so an existing *Google-only* account is
 * pointed at Google rather than told the password was wrong.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { normalizeEmail } from '@/lib/auth/email-address';
import { MIN_PASSWORD_LENGTH, hashPassword, passwordProblems } from '@/lib/auth/password';
import { LIMITS, rateLimit, requestIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const RegisterBody = z
  .object({
    email: z.string().trim().min(3).max(320),
    password: z.string().min(1).max(200),
    name: z.string().trim().max(120).optional(),
  })
  .strict();

export async function POST(request: Request) {
  // Keyed on the requesting address, so accounts cannot be created in bulk from one host.
  // Not an authorization decision, so a spoofable header is a nuisance rather than a hole.
  const limit = rateLimit(`register:${requestIp(request)}`, LIMITS.register.limit, LIMITS.register.windowMs);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many accounts created from here. Try again later.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }

  const parsed = RegisterBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter an email address and a password.' }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);
  if (email === null) {
    return NextResponse.json({ error: 'That does not look like an email address.' }, { status: 400 });
  }

  const problems = passwordProblems(parsed.data.password);
  if (problems.length > 0) {
    return NextResponse.json(
      { error: problems[0], problems, minLength: MIN_PASSWORD_LENGTH },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);

  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        ...(parsed.data.name === undefined || parsed.data.name === ''
          ? {}
          : { name: parsed.data.name }),
      },
      // Never select the hash. It has no business leaving the database.
      select: { id: true, email: true, name: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    // P2002 is the unique constraint on email. Relying on the constraint rather than a
    // prior lookup closes the race where two requests both find the address free.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { passwordHash: true },
      });

      if (existing !== null && existing.passwordHash === null) {
        return NextResponse.json(
          {
            error:
              'That address is already registered through Google. Use "Continue with Google" to sign in.',
            useGoogle: true,
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: 'That address is already registered. Log in instead.' },
        { status: 409 },
      );
    }

    console.error('[brandos] registration failed', error);
    return NextResponse.json({ error: 'Could not create the account.' }, { status: 500 });
  }
}
