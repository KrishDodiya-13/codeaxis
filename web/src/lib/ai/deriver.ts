/**
 * The one place a route gets a deriver.
 *
 * Every stage route calls `deriverFor(state)` instead of constructing a client, so mode
 * selection and caching are decided once rather than repeated — and a new route cannot
 * accidentally bypass either.
 *
 * The cache scope is built here from the `BrandState` the route already loaded from the
 * database. Nothing from the request body reaches the key: a cache keyed on anything the
 * caller controls is a way to read another project's result by guessing a key, and the
 * scope is in the key so two projects can never collide. The cache decides only whether
 * work can be skipped, never who may see a result.
 */
import {
  CachingDeriver,
  DeriverCache,
  createDeriver,
  onTiming,
  resolveAiMode,
  summarizeTimings,
  timings,
} from 'brandstate';
import type { BrandState, SectionDeriver } from 'brandstate';

/**
 * One cache for the process.
 *
 * Kept on `globalThis` because the dev server re-evaluates modules on edit, and a cache
 * that resets on every hot reload would not cache anything across the reloads that make
 * development expensive in the first place.
 */
const globalForCache = globalThis as typeof globalThis & { brandosCache?: DeriverCache };

export const deriverCache: DeriverCache =
  globalForCache.brandosCache ?? new DeriverCache({ maxEntries: 200, ttlMs: 60 * 60 * 1000 });

if (process.env.NODE_ENV !== 'production') globalForCache.brandosCache = deriverCache;

/** Logged once per process, not per request, so the log says it without repeating it. */
let modeAnnounced = false;

/**
 * Registers the timing log once.
 *
 * One line per stage, carrying durations and token counts and nothing else — no key, no
 * prompt, no model output. Live timings are the useful ones, so a mock timing is marked
 * as such rather than left to look like an AI latency.
 */
let timingWired = false;

function wireTiming(): void {
  if (timingWired) return;
  timingWired = true;

  onTiming((timing) => {
    const tokens = timing.mode === 'live' ? ` tokens=${timing.inputTokens}/${timing.outputTokens}` : '';
    console.info(
      `[brandos] stage=${timing.section} mode=${timing.mode} ` +
        `total=${timing.totalMs}ms model=${timing.modelMs}ms zod=${timing.validationMs}ms` +
        `${tokens} ok=${timing.ok}${timing.errorKind === undefined ? '' : ` error=${timing.errorKind}`}`,
    );
  });
}

/**
 * The deriver for one project's stage call.
 *
 * Caching is on by default and can be turned off per call — a regenerate is an explicit
 * request for a different answer, so serving the previous one would ignore the user.
 */
export function deriverFor(state: BrandState, options: { cache?: boolean } = {}): SectionDeriver {
  wireTiming();

  const inner = createDeriver({
    onMode: (message) => {
      if (modeAnnounced) return;
      modeAnnounced = true;
      // Server-side only. Nothing about the mode is sent to the browser: a development
      // mode that showed through in the UI would make the product look like a mock-up.
      console.info(message);
    },
  });

  if (options.cache === false) return inner;

  return new CachingDeriver(
    inner,
    { projectId: state.id, schemaVersion: state.schemaVersion },
    deriverCache,
  );
}

/** The configured mode, for a health or diagnostics response. */
export function aiMode() {
  return resolveAiMode();
}

/**
 * Stage timings held by this process.
 *
 * Live-only by default: a mock timing measures fixture lookup, so averaging it with a
 * real call would describe neither. Pass 'all' to see both.
 */
export function stageTimings(mode: 'live' | 'mock' | 'all' = 'live') {
  return { summary: summarizeTimings(mode), samples: timings().length };
}
