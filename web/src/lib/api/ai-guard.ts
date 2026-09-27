/**
 * The gate in front of every route that spends AI quota.
 *
 * These four routes are stateless — they take a BrandState in the request body and store
 * nothing — so they leak no data. What they do spend is provider quota, which is finite
 * and shared, so an open one is an abuse vector even though it is not a data breach.
 *
 * Two checks, in this order:
 *
 *   1. A signed-in user. Enforced here on the server; a frontend check is a suggestion.
 *   2. A per-user rate limit, keyed on the authenticated id rather than anything the
 *      client sends — a limit keyed on client input is a limit the client can opt out of.
 *
 * Returns a response to send, or the user to carry on with. Written this way because these
 * routes hand-roll their responses rather than going through `handle()`, and converting
 * them was not worth the churn.
 */
import { errorResponse } from '@/lib/api/model-errors';
import { currentUser, type CurrentUser } from '@/lib/auth/session';
import { LIMITS, rateLimit } from '@/lib/rate-limit';

export type AiGuardResult = { user: CurrentUser; response?: undefined } | { response: Response; user?: undefined };

/**
 * Requires a signed-in user and charges the call against their rate limit.
 *
 * `stage` only labels the limit bucket, so one slow stage cannot starve the others.
 */
export async function guardAiRoute(stage: string): Promise<AiGuardResult> {
  const user = await currentUser();

  if (user === null) {
    // 401: no identity at all, so the remedy is to sign in. Matches the code the project
    // routes already return, so a client has one thing to handle.
    return {
      response: errorResponse(401, 'You need to be signed in to do that.'),
    };
  }

  const limit = rateLimit(`ai:${stage}:${user.id}`, LIMITS.aiStage.limit, LIMITS.aiStage.windowMs);
  if (!limit.allowed) {
    return {
      response: errorResponse(
        429,
        'You have made a lot of requests. Wait a moment and try again.',
        `retry after ${Math.ceil(limit.retryAfterMs / 1000)}s`,
      ),
    };
  }

  return { user };
}
