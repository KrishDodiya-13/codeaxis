/**
 * The page-level authentication gate.
 *
 * One helper, called from the server components that need a signed-in user, so a page
 * never renders a UI whose first action would be a 401. It reuses `currentUser` rather
 * than reading the session again — there is one definition of "who is this", and this is
 * not a second one.
 *
 * ## Why here and not in middleware
 *
 * Middleware would also work and is the more familiar answer, but Next runs it on the edge
 * runtime by default, and this app's auth config uses the Prisma adapter and a `jwt`
 * callback that queries the database — neither of which runs on the edge. The documented
 * way round that is to split the config in two and keep an edge-safe copy, which means two
 * descriptions of the same rules that can drift apart. A check in the server component is
 * the same guarantee with one source of truth.
 *
 * The API routes keep their own `requireUser` checks regardless. This stops a logged-out
 * user reaching a dead end; it is not what makes the API safe.
 */
import { redirect } from 'next/navigation';
import { currentUser, type CurrentUser } from '@/lib/auth/session';
import { safeCallbackPath } from '@/lib/auth/callback-path';

export { safeCallbackPath };

/**
 * The signed-in user, or a redirect to the login page.
 *
 * `destination` is where to return after signing in — normally the page doing the asking.
 * It is validated before use, so a caller cannot accidentally introduce an open redirect
 * by passing something from a query string.
 */
export async function requirePageAuth(destination: string): Promise<CurrentUser> {
  const user = await currentUser();
  if (user !== null) return user;

  const target = safeCallbackPath(destination) ?? '/new';
  // `redirect` throws, so nothing after this line runs and the page never renders.
  redirect(`/login?callbackUrl=${encodeURIComponent(target)}`);
}
