/**
 * Helpers for the optional competitor list POSITION can be given.
 *
 * Supplying competitors is entirely opt-in. POSITION works correctly with none — its
 * prompt already asks for the realistic informal alternative when none are supplied —
 * and nothing on the default path provides any.
 *
 * Provider note: this used to also export `createWebSearchCompetitorLookup`, backed by
 * Gemini's Google Search grounding. That went when the provider moved to Groq, which has
 * no drop-in equivalent: keeping it would have meant retaining the entire Gemini SDK and
 * a second API key for a path the application never took. The `CompetitorLookup`
 * interface in `position.ts` is unchanged and provider-agnostic, so a lookup backed by
 * anything — a search API, an internal catalogue, a static list — still plugs in, and
 * `knownCompetitors` still works as it always did.
 */

/**
 * Pulls a JSON array of names out of a reply.
 *
 * Tolerant on purpose: a lookup is asked for a bare array but may wrap it in prose or a
 * fenced block, and this is advisory, where a parse failure should cost nothing.
 */
export function parseCompetitorList(text: string, limit = 6): string[] {
  const match = /\[[\s\S]*\]/.exec(text);
  if (match === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const names = parsed
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  // De-duplicate case-insensitively, keeping first-seen spelling.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }

  return unique.slice(0, limit);
}
