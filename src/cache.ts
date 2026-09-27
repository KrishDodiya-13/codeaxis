/**
 * A memo in front of the deriver, so an identical stage is not paid for twice.
 *
 * Wraps any `SectionDeriver`. Re-running a stage with the same inputs is common in
 * development — a page reload, a retried request, a stage re-run after an unrelated edit
 * — and each one is a real provider charge against a finite allowance.
 *
 * ## Scope is server-derived, never taken from the request
 *
 * The cache is constructed with a `scope` the route supplies from its own validated
 * context: the project it already loaded, and the user it already authenticated. Nothing
 * a client sends contributes to the key. This matters for a reason beyond tidiness — a
 * cache keyed on anything the caller controls becomes a way to read somebody else's
 * result by guessing their key. The scope is part of the key precisely so two projects
 * can never collide, and the cache is only ever a memo: it decides whether work can be
 * skipped, never whether a caller is allowed to see something.
 *
 * ## What the key covers
 *
 * stage, scope, schema version, and the normalized request — the serialized state plus
 * any custom prompt or instructions. Anything that would change the answer is in the
 * key, so a stale entry cannot be served after a decision changes.
 *
 * Process-local and bounded. Restarting clears it; it is a development and cost
 * safeguard, not a durable store.
 */
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { DeriveOptions, DeriveResult, SectionDeriver, Usage } from './client.ts';
import type { BrandStateSection } from './types.ts';

/**
 * What the cached result belongs to.
 *
 * Both fields come from the server's own context. `userId` is optional only because the
 * project routes are not user-scoped yet; once they are, passing it keeps one user's
 * result from being served to another even if they somehow share a project id.
 */
export type CacheScope = {
  projectId: string;
  userId?: string;
  /** The state version the answer was derived against. */
  schemaVersion: string;
};

export type CacheStats = {
  hits: number;
  misses: number;
  entries: number;
};

export type DeriverCacheOptions = {
  /** Most entries to hold. Oldest are evicted first. Default 200. */
  maxEntries?: number;
  /** How long an entry stays usable, in milliseconds. Default one hour. */
  ttlMs?: number;
};

type Entry = {
  key: string;
  value: unknown;
  usage: Usage;
  storedAt: number;
  /** Kept alongside so entries can be dropped per project; the key is a hash. */
  projectId: string;
};

const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/** Collapses whitespace, so a cosmetically different request still hits. */
function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * A shared store, so every request in a process sees the same cache.
 *
 * Keys are hashes that already contain the scope, so one store holding several projects
 * is safe — two scopes cannot produce the same key.
 */
export class DeriverCache {
  private readonly entries = new Map<string, Entry>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  private hits = 0;
  private misses = 0;

  constructor(options: DeriverCacheOptions = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
    this.ttlMs = Math.max(0, options.ttlMs ?? DEFAULT_TTL_MS);
  }

  /**
   * The key for one request.
   *
   * SHA-256 over the parts, rather than a joined string, so a value containing the
   * separator cannot be arranged to look like a different set of parts.
   */
  keyFor(
    scope: CacheScope,
    section: BrandStateSection,
    serializedState: string,
    options: DeriveOptions,
  ): string {
    const hash = createHash('sha256');
    for (const part of [
      'v1',
      scope.userId ?? 'no-user',
      scope.projectId,
      scope.schemaVersion,
      section,
      normalize(serializedState),
      normalize(options.userPrompt ?? ''),
      normalize(options.instructions ?? ''),
    ]) {
      hash.update(part);
      hash.update('\u0000');
    }
    return hash.digest('hex');
  }

  get(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      this.misses++;
      return undefined;
    }

    if (this.ttlMs > 0 && Date.now() - entry.storedAt > this.ttlMs) {
      this.entries.delete(key);
      this.misses++;
      return undefined;
    }

    // Refresh recency: re-inserting moves it to the end of the iteration order, which is
    // what makes the eviction below least-recently-used rather than merely oldest.
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits++;
    return entry;
  }

  set(key: string, value: unknown, usage: Usage, projectId: string): void {
    this.entries.delete(key);
    this.entries.set(key, { key, value, usage, storedAt: Date.now(), projectId });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
  }

  /** Drops every entry for one project, e.g. when it is deleted or reset. */
  clearProject(projectId: string): void {
    // The key is a hash, so the project is recorded on the entry for exactly this.
    for (const [key, entry] of this.entries) {
      if (entry.projectId === projectId) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  stats(): CacheStats {
    return { hits: this.hits, misses: this.misses, entries: this.entries.size };
  }
}

/**
 * Wraps a deriver so identical requests within one scope are served from memory.
 *
 * Only successes are stored. A failure is not a result — caching one would turn a
 * transient provider problem into a sticky one that survives the retry that would have
 * fixed it.
 */
export class CachingDeriver implements SectionDeriver {
  private readonly inner: SectionDeriver;
  private readonly cache: DeriverCache;
  private readonly scope: CacheScope;

  constructor(inner: SectionDeriver, scope: CacheScope, cache: DeriverCache) {
    this.inner = inner;
    this.cache = cache;
    this.scope = scope;
  }

  async deriveSection<T>(
    section: BrandStateSection,
    serializedState: string,
    schema: z.ZodType<T>,
    options: DeriveOptions = {},
  ): Promise<DeriveResult<T>> {
    const key = this.cache.keyFor(this.scope, section, serializedState, options);

    const hit = this.cache.get(key);
    if (hit !== undefined) {
      // Re-validated on the way out. A cached value has to clear the same bar as a fresh
      // one, so a schema change cannot let a stale shape through.
      const parsed = schema.safeParse(hit.value);
      if (parsed.success) {
        // Zero usage: the cost was paid when it was first derived, and counting it twice
        // would overstate what the run actually spent.
        return {
          value: parsed.data,
          usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
        };
      }
    }

    const result = await this.inner.deriveSection(section, serializedState, schema, options);
    this.cache.set(key, result.value, result.usage, this.scope.projectId);
    return result;
  }
}
