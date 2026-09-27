/**
 * Who is making this request.
 *
 * The only place a route obtains a user id. Every data-access function that touches a
 * project requires one, so the compiler — not a reviewer's memory — is what stops a
 * route from reading a project without establishing an owner first.
 */
import { auth } from '@/lib/auth/config';

/** Thrown when a request needs a signed-in user and does not have one. */
export class UnauthenticatedError extends Error {
  constructor() {
    super('You need to be signed in to do that.');
    this.name = 'UnauthenticatedError';
  }
}

export type CurrentUser = {
  id: string;
  email: string | null;
};

/** The signed-in user, or null. Use `requireUser` when the route needs one. */
export async function currentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (typeof id !== 'string' || id === '') return null;
  return { id, email: session?.user?.email ?? null };
}

/**
 * The signed-in user, or a thrown error the API layer turns into a 401.
 *
 * Returns the id as a plain string so a caller cannot accidentally pass an object where
 * an owner is expected.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (user === null) throw new UnauthenticatedError();
  return user;
}
