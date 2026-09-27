/**
 * The POSITION step: `POST /api/position`.
 *
 * Takes a completed discovery object and decides where the brand stands in the
 * market. This is the first phase that makes a real strategic claim, so it is the
 * first that can fail by being *generic* rather than by being wrong — a position
 * that is technically true and equally true of every competitor. The category
 * specificity check and the rationale requirements exist for that.
 *
 * Two disciplines carry forward from DISCOVER. It refuses to build on ground it
 * knows is shaky: unresolved discovery questions block the step unless the caller
 * explicitly proceeds, and then every assumed answer is recorded rather than
 * quietly absorbed. And it never edits discovery — if positioning reveals
 * discovery was wrong, that is flagged, not fixed here.
 */
import { createHash } from 'node:crypto';
import type { DeriveOptions, SectionDeriver, Usage } from './client.ts';
import { EMPTY_USAGE, addUsage } from './client.ts';
import {
  buildCategoryRetryPrompt,
  buildPositionPrompt,
} from './prompts.ts';
import { DiscoverySchema, PositionResultSchema } from './schemas.ts';
import { stableStringify } from './state.ts';
import type { Discovery, Positioning } from './types.ts';
import type { z } from 'zod';

export type PositionResult = z.infer<typeof PositionResultSchema>;
/** The response body: the result minus the internal self-check. */
export type PositionResponse = Omit<PositionResult, 'categoryCheck'>;

export type PositionRequest = {
  /** The completed discovery object from Phase 2. */
  discovery: Discovery;
  /**
   * Alternatives the user already knows about. Supplying them lets the
   * competitive angle be concrete rather than guessed.
   */
  knownCompetitors?: string[];
  /**
   * Proceed even though discovery has unresolved questions. Every question then
   * produces an entry in `assumptionsUsed` and a matching note in `rationale`.
   */
  forceProceed?: boolean;
  /**
   * Return one or two angles considered and passed over. Off by default: the
   * step returns one position, not a menu, unless asked.
   */
  includeAlternatives?: boolean;
};

/** Thrown when a request is not a usable POSITION request. */
export class PositionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PositionInputError';
  }
}

/**
 * Thrown when discovery still has open questions and the caller did not opt in.
 *
 * Carries the questions so the caller can put them to the user rather than
 * guessing at what is missing. Maps to a 422.
 */
export class DiscoveryIncompleteError extends Error {
  readonly openQuestions: string[];

  constructor(openQuestions: string[]) {
    super(
      `Discovery is not finished: ${openQuestions.length} question${openQuestions.length === 1 ? '' : 's'} ` +
        'still unresolved. Answer them via POST /api/discover, or pass forceProceed: true to position on ' +
        'assumed answers — which will be recorded in assumptionsUsed.',
    );
    this.name = 'DiscoveryIncompleteError';
    this.openQuestions = openQuestions;
  }
}

/** Thrown when the model could not produce a specific enough category. */
export class VagueCategoryError extends Error {
  readonly category: string;
  readonly unrelatedProducts: string[];

  constructor(category: string, unrelatedProducts: string[]) {
    super(
      `The category "${category}" is too vague to position on: it could also describe ` +
        `${unrelatedProducts.join('; ') || 'unrelated products'}. A retry did not improve it.`,
    );
    this.name = 'VagueCategoryError';
    this.category = category;
    this.unrelatedProducts = unrelatedProducts;
  }
}

/**
 * Looks up alternatives the user did not supply.
 *
 * Pluggable and entirely optional: the step must work correctly with no external
 * lookup, since not every deployment has one. `createWebSearchCompetitorLookup`
 * is one implementation.
 */
export type CompetitorLookup = (discovery: Discovery) => Promise<string[]>;

export type PositionOptions = {
  /** Used only when `knownCompetitors` is empty. Failures are non-fatal. */
  competitorLookup?: CompetitorLookup;
  /** Attempts allowed for the category specificity check. Defaults to 2. */
  maxCategoryAttempts?: number;
};

/**
 * A stable fingerprint of a discovery object.
 *
 * Keys are sorted before hashing, so a re-serialized but unchanged discovery
 * hashes the same. This is what makes staleness detection meaningful rather than
 * noisy.
 */
export function hashDiscovery(discovery: Discovery): string {
  return createHash('sha256').update(stableStringify(discovery)).digest('hex').slice(0, 16);
}

/**
 * Whether a positioning was derived from a discovery other than the current one.
 *
 * Returns false when no hash was recorded — an unknown provenance is not evidence
 * of staleness, and reporting it as stale would make the signal useless on
 * hand-written states.
 */
export function isPositioningStale(discovery: Discovery, positioning: Positioning): boolean {
  if (positioning.sourceDiscoveryHash === undefined) return false;
  return positioning.sourceDiscoveryHash !== hashDiscovery(discovery);
}

/** Validates a request, throwing `PositionInputError` with a usable message. */
export function validatePositionRequest(value: unknown): PositionRequest {
  if (value === null || typeof value !== 'object') {
    throw new PositionInputError('The request body must be a JSON object.');
  }

  const body = value as Record<string, unknown>;

  // Accept the discovery object at the top level too, since Phase 2's response
  // body is exactly that shape and forwarding it unwrapped is the obvious move.
  const rawDiscovery = body.discovery ?? body;
  const parsed = DiscoverySchema.safeParse(rawDiscovery);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new PositionInputError(`"discovery" is not a valid discovery object: ${detail}`);
  }

  const request: PositionRequest = { discovery: parsed.data };

  if (body.knownCompetitors !== undefined) {
    if (
      !Array.isArray(body.knownCompetitors) ||
      !body.knownCompetitors.every((entry) => typeof entry === 'string')
    ) {
      throw new PositionInputError('"knownCompetitors" must be an array of strings.');
    }
    request.knownCompetitors = body.knownCompetitors.filter((name) => name.trim() !== '');
  }

  for (const flag of ['forceProceed', 'includeAlternatives'] as const) {
    if (body[flag] !== undefined) {
      if (typeof body[flag] !== 'boolean') {
        throw new PositionInputError(`"${flag}" must be a boolean.`);
      }
      request[flag] = body[flag];
    }
  }

  return request;
}

/**
 * Whether discovery is settled enough to position on.
 *
 * Mirrors DISCOVER's sufficiency rule: anything left in `openQuestions` means the
 * conversation is not finished.
 */
export function isDiscoveryReadyToPosition(discovery: Discovery): boolean {
  return discovery.openQuestions.length === 0;
}

/**
 * Detects that positioning narrowed the audience discovery gave it.
 *
 * Deliberately coarse — it flags that the two differ so a caller can check the
 * rationale accounts for it, and does not try to judge whether the narrowing was
 * a good idea. Whitespace and case are normalized so cosmetic edits do not flag.
 */
export function detectsAudienceNarrowing(discoveryAudience: string, positionedAudience: string): boolean {
  const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalize(discoveryAudience) !== normalize(positionedAudience);
}

/**
 * Words that cannot carry a category on their own.
 *
 * This is a narrow backstop, not the real check — the model's own `categoryCheck`
 * is the semantic judgement. This only catches a category built entirely from
 * filler, which is the case a self-report is most likely to wave through. Kept
 * conservative on purpose: a false positive here rejects good work.
 */
const FILLER_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'of', 'to', 'with', 'in', 'on', 'your', 'our', 'that', 'this',
  'modern', 'innovative', 'seamless', 'powerful', 'intuitive', 'smart', 'simple', 'easy', 'fast',
  'nextgeneration', 'next', 'generation', 'cuttingedge', 'edge', 'leading', 'advanced', 'robust',
  'userfriendly', 'friendly', 'user', 'allinone', 'all', 'one', 'endtoend', 'end', 'comprehensive',
  'digital', 'online', 'cloud', 'cloudbased', 'based', 'aipowered', 'ai', 'powered', 'collaborative',
  'platform', 'solution', 'ecosystem', 'suite', 'hub', 'portal', 'system', 'software', 'app',
  'application', 'tool', 'tooling', 'service', 'product', 'experience', 'framework', 'engine',
]);

/** True when a category is made of nothing but filler and generic nouns. */
export function isCategoryAllFiller(category: string): boolean {
  const words = category
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/[\s-]+/)
    .filter((word) => word !== '');

  if (words.length === 0) return true;
  return words.every((word) => FILLER_WORDS.has(word));
}

/** Strips the internal self-check, leaving the response body. */
export function toPositionResponse(result: PositionResult): PositionResponse {
  const { categoryCheck: _categoryCheck, ...response } = result;
  return response;
}

/**
 * Maps a POSITION result onto `BrandState.positioning`.
 *
 * `audience` and `problem` are dropped: they are echoed in the API response for
 * traceability, but `discovery` stays the single source of truth for both, and
 * duplicating them into the state would create a second copy to drift.
 * `assumptionsUsed` is dropped too — the state carries those as rationale notes,
 * which is where the model was told to put them.
 */
export function toPositioningSection(
  response: PositionResponse,
  discovery: Discovery,
): Positioning {
  return {
    category: response.category,
    valueProposition: response.valueProposition,
    differentiator: response.differentiator,
    competitiveAngle: response.competitiveAngle,
    rationale: [...response.rationale],
    sourceDiscoveryHash: hashDiscovery(discovery),
  };
}

/**
 * Runs POSITION.
 *
 * Throws `DiscoveryIncompleteError` when discovery has open questions and
 * `forceProceed` was not set, and `VagueCategoryError` when the category fails
 * its specificity check twice.
 */
export async function position(
  deriver: SectionDeriver,
  request: PositionRequest,
  options: PositionOptions = {},
): Promise<{ value: PositionResponse; usage: Usage }> {
  const { discovery, forceProceed = false, includeAlternatives = false } = request;
  const maxAttempts = Math.max(1, options.maxCategoryAttempts ?? 2);

  if (!isDiscoveryReadyToPosition(discovery) && !forceProceed) {
    throw new DiscoveryIncompleteError([...discovery.openQuestions]);
  }

  const knownCompetitors = await resolveCompetitors(request, options);

  const basePrompt = buildPositionPrompt({
    discovery: stableStringify(discovery, 2),
    knownCompetitors,
    // Only when proceeding past them; otherwise the guard above already returned.
    assumedQuestions: forceProceed ? [...discovery.openQuestions] : [],
    includeAlternatives,
  });

  let usage = EMPTY_USAGE;
  let lastResult: PositionResult | undefined;
  let prompt = basePrompt;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const options_: DeriveOptions = { userPrompt: prompt };
    const result = await deriver.deriveSection('positioning', '', PositionResultSchema, options_);
    usage = addUsage(usage, result.usage);
    lastResult = result.value;

    const vague =
      result.value.categoryCheck.couldDescribeUnrelatedProducts ||
      isCategoryAllFiller(result.value.category);

    if (!vague) return { value: toPositionResponse(result.value), usage };

    prompt = buildCategoryRetryPrompt(
      basePrompt,
      result.value.category,
      result.value.categoryCheck.unrelatedProducts,
    );
  }

  // Out of attempts. Better to fail loudly than to persist a position that the
  // model itself said describes unrelated products.
  throw new VagueCategoryError(
    lastResult!.category,
    lastResult!.categoryCheck.unrelatedProducts,
  );
}

/** Known competitors, or a lookup's best effort, or nothing. */
async function resolveCompetitors(
  request: PositionRequest,
  options: PositionOptions,
): Promise<string[]> {
  const known = request.knownCompetitors ?? [];
  if (known.length > 0 || options.competitorLookup === undefined) return known;

  try {
    return await options.competitorLookup(request.discovery);
  } catch {
    // A lookup is an enhancement. The prompt already handles an empty list by
    // asking for the informal status quo, so a failure here must not fail the
    // step — that would make an optional feature load-bearing.
    return [];
  }
}
