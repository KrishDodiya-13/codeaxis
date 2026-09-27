/**
 * The Prisma client.
 *
 * Cached on `globalThis` because Next's dev server re-evaluates modules on every hot
 * reload, and a fresh client each time exhausts the database connection pool within a
 * few saves.
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Whether a database is configured at all, so a missing one is a clear message. */
export function hasDatabaseUrl(): boolean {
  return (process.env.DATABASE_URL ?? '') !== '';
}
