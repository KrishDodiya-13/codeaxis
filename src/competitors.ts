/**
 * An optional competitor lookup backed by Gemini's Google Search grounding.
 *
 * Entirely opt-in. POSITION works correctly with no lookup at all — its prompt
 * already asks for the realistic informal alternative when no competitors are
 * supplied — and nothing here is on the default path. Deployments without web
 * access simply never construct this.
 *
 * Kept in its own file so the core never imports it, and so a different backend
 * (an internal catalogue, a CRM, a static list) can satisfy `CompetitorLookup`
 * without touching anything else.
 */
import { GoogleGenAI } from '@google/genai';
import { CREDENTIAL_ENV_VAR, DEFAULT_MODEL } from './client.ts';
import type { CompetitorLookup } from './position.ts';
import type { Discovery } from './types.ts';

export type WebSearchLookupOptions = {
  client?: GoogleGenAI;
  model?: string;
  /** Cap on searches per lookup. Kept low: this is one narrow question. */
  maxUses?: number;
  /** Most competitors to return. */
  limit?: number;
};

/**
 * Builds a lookup that asks the model to search for existing alternatives.
 *
 * The result is advisory. Anything unparseable yields an empty list rather than an
 * error, because `position` treats the lookup as an enhancement and an empty
 * result is a perfectly good answer — it means the prompt falls back to naming the
 * informal status quo, which is the correct behaviour anyway.
 */
export function createWebSearchCompetitorLookup(
  options: WebSearchLookupOptions = {},
): CompetitorLookup {
  const client =
    options.client ?? new GoogleGenAI({ apiKey: (process.env[CREDENTIAL_ENV_VAR] ?? '').trim() });
  const model = options.model ?? DEFAULT_MODEL;
  const maxUses = options.maxUses ?? 3;
  const limit = options.limit ?? 6;

  return async (discovery: Discovery): Promise<string[]> => {
    const response = await client.models.generateContent({
      model,
      contents: `Search for existing products that solve this problem.

Problem: ${discovery.problem}
Audience: ${discovery.targetAudience}
Need: ${discovery.userNeed}

Return at most ${limit} real, existing products or services, including informal alternatives people improvise with (a spreadsheet, a group chat, a subreddit) where those are what people actually use.

Reply with nothing but a JSON array of strings, e.g. ["Product A", "Discord servers"]. If you find none, reply with [].`,
      config: {
        systemInstruction:
          'You identify existing products that solve a given problem. You are a lookup step, not a ' +
          'strategist: return names only, and never invent a product you did not find.',
        // Grounding runs on Google's side. A structured response schema cannot be combined
        // with a tool, so the reply is parsed tolerantly instead — which is fine here,
        // because an empty result is a perfectly good answer for an advisory lookup.
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 2000,
      },
    });

    if (response.promptFeedback?.blockReason !== undefined) return [];

    return parseCompetitorList(textOf(response), limit);
  };
}

function textOf(response: { text?: string }): string {
  return response.text ?? '';
}

/**
 * Pulls a JSON array of names out of the reply.
 *
 * Tolerant on purpose: the model was asked for a bare array but may wrap it in
 * prose or a fenced block, and this is an advisory lookup where a parse failure
 * should cost nothing.
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
