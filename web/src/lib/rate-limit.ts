/**
 * Server-side rate limiting.
 *
 * A fixed window counter in process memory. Deliberately simple: the alternative is a
 * Redis dependency, and for a single-instance deployment this stops the abuse that
 * matters — a script hammering an AI route or spraying OTP requests at an address.
 *
 * ## What it does not survive
 *
 * A restart clears it, and two instances each keep their own counts, so the effective
 * limit on N instances is N times the configured one. That is a real limitation and the
 * reason to move the store to Redis if this ever runs horizontally scaled. It is written
 * down rather than left to be discovered.
 *
 * ## Keys are server-derived
 *
 * Every caller builds its key from an authenticated user id or the request's own IP, never
 * from a header or body field a client controls — a limit keyed on client input is a limit
 * the client can opt out of by changing the key.
 */

export type RateLimitResult = {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** Milliseconds until the window resets. */
  retryAfterMs: number;
};

type Window = { count: number; resetAt: number };

/**
 * Held on `globalThis` so the dev server's module reloading does not reset the counters
 * on every edit, which would make the limits untestable.
 */
const store: Map<string, Window> = (() => {
  const g = globalThis as typeof globalThis & { brandosRateLimit?: Map<string, Window> };
  g.brandosRateLimit ??= new Map();
  return g.brandosRateLimit;
})();

/** Dropped opportunistically, so an idle process does not hold every key it ever saw. */
function prune(now: number): void {
  if (store.size < 1000) return;
  for (const [key, window] of store) {
    if (window.resetAt <= now) store.delete(key);
  }
}

/**
 * Counts one request against `key`.
 *
 * Returns whether it is allowed. Callers that want to *check* without consuming should
 * not use this — every call is a request.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  prune(now);

  const existing = store.get(key);

  if (existing === undefined || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: windowMs };
  }

  existing.count++;
  const remaining = Math.max(0, limit - existing.count);
  return {
    allowed: existing.count <= limit,
    remaining,
    retryAfterMs: existing.resetAt - now,
  };
}

/** Forgets a key, e.g. after a successful reset so the user is not left throttled. */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/** Only for tests. */
export function clearAllRateLimits(): void {
  store.clear();
}

/**
 * The client's address, as well as it can be known.
 *
 * `x-forwarded-for` is only trustworthy behind a proxy that sets it, which is the normal
 * deployment. It is used for limiting unauthenticated requests only — never for
 * authorization, where a spoofable header would be a hole rather than a nuisance.
 */
export function requestIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded !== null && forwarded !== '') {
    const first = forwarded.split(',')[0]?.trim();
    if (first !== undefined && first !== '') return first;
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/** The limits, in one place so they can be read at a glance. */
export const LIMITS = {
  /** OTP requests per address. Generous enough for a mistyped address, tight enough to
   *  stop mail being sprayed at someone. */
  otpRequest: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** OTP verification attempts per address. Backstop to the per-code attempt cap, which
   *  a new code would otherwise reset. */
  otpVerify: { limit: 10, windowMs: 15 * 60 * 1000 },
  /** Password resets per address. */
  passwordReset: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** AI stage calls per user. Each one costs provider quota. */
  aiStage: { limit: 30, windowMs: 10 * 60 * 1000 },
  /** Registrations per IP, so accounts cannot be created in bulk. */
  register: { limit: 10, windowMs: 60 * 60 * 1000 },
} as const;
