/**
 * Authentication. Server-side only.
 *
 * Auth.js rather than a hand-rolled flow: OAuth state, PKCE, the callback exchange and
 * cookie signing are all places where a subtle mistake is a silent vulnerability, and
 * they are the parts a well-maintained library has already got right.
 *
 * ## Why JWT sessions and not a sessions table
 *
 * The Credentials provider only works with the `jwt` strategy in Auth.js v5 — a database
 * session is created during the OAuth callback, which a credentials sign-in never
 * reaches. So sessions are signed, httpOnly, same-site cookies rather than rows.
 *
 * That normally costs you the ability to revoke, which a password reset needs. The
 * `passwordChangedAt` column buys it back: a token issued before that timestamp is
 * rejected in the `jwt` callback, so changing a password invalidates every existing
 * session at once without a table to sweep.
 *
 * ## What the browser never sees
 *
 * The OAuth client secret and `AUTH_SECRET` are read from the server environment and
 * never reach a client bundle — no `NEXT_PUBLIC_` variable is involved anywhere here.
 * Provider tokens live in the `accounts` table.
 */
import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { prisma } from '@/lib/db/client';
import { equalizeVerifyTiming, verifyPassword } from '@/lib/auth/password';
import { normalizeEmail } from '@/lib/auth/email-address';

/** Whether Google sign-in is configured. The button is hidden when it is not. */
export const googleConfigured =
  (process.env.AUTH_GOOGLE_ID ?? '').trim() !== '' &&
  (process.env.AUTH_GOOGLE_SECRET ?? '').trim() !== '';

const config: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),

  // Stateless sessions. See the note above on why, and how revocation still works.
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },

  pages: { signIn: '/login' },

  // Trust the deployment's own host header. Required behind a proxy, and Vercel sets it.
  trustHost: true,

  providers: [
    // Only registered when configured, so a missing secret is a hidden button rather
    // than a runtime crash on the sign-in page.
    ...(googleConfigured
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
            // Asking for nothing beyond identity. There is no reason for this product to
            // hold a token that can read anyone's mail or files.
            authorization: { params: { scope: 'openid email profile' } },
          }),
        ]
      : []),

    Credentials({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const email = normalizeEmail(typeof raw?.email === 'string' ? raw.email : '');
        const password = typeof raw?.password === 'string' ? raw.password : '';

        if (email === null || password === '') {
          await equalizeVerifyTiming();
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });

        if (user === null) {
          // Hash anyway, so "no such account" costs about what a real check costs and
          // cannot be told apart by how fast the answer comes back.
          await equalizeVerifyTiming();
          return null;
        }

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        // Returned fields become the JWT's seed. Nothing sensitive: no hash, no tokens.
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],

  callbacks: {
    /**
     * Google's own verification is what is trusted here.
     *
     * Auth.js has already validated the ID token signature and issuer by this point. The
     * extra check is `email_verified`: a Google account with an unverified address must
     * not be able to take over a local account that uses the same address.
     */
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return true;

      const verified = profile?.email_verified;
      if (verified === false) return false;
      return typeof profile?.email === 'string' && profile.email !== '';
    },

    async jwt({ token, user }) {
      // On sign-in, stamp the identity and when the token was issued.
      if (user !== undefined && user.id !== undefined) {
        token.uid = user.id;
        token.iat_ms = Date.now();
        return token;
      }

      // On every later request, re-check that the password has not changed since the
      // token was issued. This is what makes a reset revoke existing sessions.
      if (typeof token.uid === 'string') {
        const record = await prisma.user.findUnique({
          where: { id: token.uid },
          select: { passwordChangedAt: true },
        });

        // The account is gone: the token must stop working.
        if (record === null) return null;

        const changedAt = record.passwordChangedAt?.getTime();
        const issuedAt = typeof token.iat_ms === 'number' ? token.iat_ms : 0;
        if (changedAt !== undefined && changedAt > issuedAt) return null;
      }

      return token;
    },

    async session({ session, token }) {
      // The user id is what every authorization check needs, so it is put where a route
      // can reach it without another query.
      if (typeof token.uid === 'string' && session.user !== undefined) {
        session.user.id = token.uid;
      }
      return session;
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(config);
