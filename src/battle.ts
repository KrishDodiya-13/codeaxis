/**
 * The BRAND BATTLE step: `POST /api/battle`.
 *
 * Generates several genuinely different strategic directions for the same problem,
 * so a human can compare trade-offs and choose. The reason this phase exists is
 * that a single position chosen without comparison is a guess dressed up as a
 * decision; the reason it needs real machinery is that "each must be meaningfully
 * different" is easy to ask for and easy to fake.
 *
 * Divergence is therefore enforced in three places rather than asked for once:
 * archetypes are chosen to be far apart before anything is generated, the batch is
 * generated in one call so the model differentiates as it writes, and the result is
 * checked afterwards — with only the offending strategy rebuilt, told exactly what
 * it collided with.
 */
import {
  ARCHETYPES,
  DIRECTIONS,
  InvalidDirectionsError,
  chooseDirections,
  listOverlapRatio,
  normalizeDirections,
  overlapRatio,
} from './archetypes.ts';
import type { Direction } from './archetypes.ts';
import { EMPTY_USAGE, addUsage } from './client.ts';
import type { DeriveOptions, SectionDeriver, Usage } from './client.ts';
import { buildBattlePrompt, buildStrategyRetryPrompt } from './prompts.ts';
import type { CollisionReason } from './prompts.ts';
import {
  BattleResultSchema,
  DiscoverySchema,
  PositioningSchema,
  StrategyRegenerationSchema,
} from './schemas.ts';
import { stableStringify } from './state.ts';
import type { Discovery, Positioning, StrategyOption } from './types.ts';
import type { z } from 'zod';

export type StrategyCandidate = z.infer<typeof BattleResultSchema>['strategies'][number];

export const DEFAULT_STRATEGY_COUNT = 3;

export type BattleRequest = {
  /** The grounding facts. Every strategy must trace back to this. */
  discovery: Discovery;
  /**
   * The Phase 3 positioning, when it exists. Supplying it makes each strategy a
   * variant of one value proposition; omitting it explores more broadly, with each
   * strategy deriving its own positioning straight from discovery.
   */
  positioning?: Positioning;
  /** Force the archetypes instead of having them chosen. */
  directions?: Direction[];
  /** How many strategies to generate. Defaults to 3. */
  count?: number;
};

/** Thrown when a request is not a usable BATTLE request. */
export class BattleInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BattleInputError';
  }
}

/** Thrown when strategies still collide after their rebuild attempts. */
export class IndistinctStrategiesError extends Error {
  readonly reasons: CollisionReason[];

  constructor(reasons: CollisionReason[]) {
    super(
      `The strategies are not meaningfully different after rebuilding: ${reasons
        .map((reason) => `${reason.direction}${reason.collidedWith ? ` collides with ${reason.collidedWith}` : ''}`)
        .join('; ')}.`,
    );
    this.name = 'IndistinctStrategiesError';
    this.reasons = reasons;
  }
}

/**
 * Thresholds for the distinctness check.
 *
 * These are lexical-overlap ratios over content words, applied to the short
 * canonical fields the model writes for the purpose. They are tuned to catch
 * restatement, not to police vocabulary — two strategies may well share a word.
 */
export type DistinctnessThresholds = {
  /** `uniqueClaim` overlap above this means the same bet twice. */
  claim: number;
  /** `coreIdea` overlap above this means the same strategic logic twice. */
  coreIdea: number;
  /** `primarySegment` overlap above this means the same slice of the audience. */
  segment: number;
  /** `risks` overlap above this means the same failure mode. */
  risks: number;
  /** Sentences allowed in `positioning` before it stops being a comparison document. */
  maxPositioningSentences: number;
};

export const DEFAULT_THRESHOLDS: DistinctnessThresholds = {
  claim: 0.5,
  coreIdea: 0.5,
  segment: 0.6,
  risks: 0.5,
  maxPositioningSentences: 4,
};

export type BattleOptions = {
  thresholds?: Partial<DistinctnessThresholds>;
  /** Rebuild attempts per offending strategy. Defaults to 1. */
  maxRebuildsPerStrategy?: number;
};

/** Validates a request, throwing `BattleInputError` with a usable message. */
export function validateBattleRequest(value: unknown): BattleRequest {
  if (value === null || typeof value !== 'object') {
    throw new BattleInputError('The request body must be a JSON object.');
  }

  const body = value as Record<string, unknown>;

  const discovery = DiscoverySchema.safeParse(body.discovery);
  if (!discovery.success) {
    const detail = discovery.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new BattleInputError(`"discovery" is required and must be a valid discovery object: ${detail}`);
  }

  const request: BattleRequest = { discovery: discovery.data };

  if (body.positioning !== undefined) {
    const positioning = PositioningSchema.safeParse(body.positioning);
    if (!positioning.success) {
      const detail = positioning.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      throw new BattleInputError(`"positioning" is not a valid positioning object: ${detail}`);
    }
    request.positioning = positioning.data;
  }

  if (body.count !== undefined) {
    if (typeof body.count !== 'number' || !Number.isInteger(body.count)) {
      throw new BattleInputError('"count" must be an integer.');
    }
    if (body.count < 2 || body.count > DIRECTIONS.length) {
      throw new BattleInputError(
        `"count" must be between 2 and ${DIRECTIONS.length}. There is nothing to compare below 2, ` +
          `and only ${DIRECTIONS.length} directions exist.`,
      );
    }
    request.count = body.count;
  }

  if (body.directions !== undefined) {
    if (!Array.isArray(body.directions) || !body.directions.every((entry) => typeof entry === 'string')) {
      throw new BattleInputError('"directions" must be an array of strings.');
    }
    try {
      request.directions = normalizeDirections(body.directions);
    } catch (error) {
      if (error instanceof InvalidDirectionsError) throw new BattleInputError(error.message);
      throw error;
    }
  }

  // A count that disagrees with an explicit direction list is a mistake worth
  // reporting rather than silently resolving in either direction's favour.
  if (request.directions !== undefined && request.count !== undefined) {
    if (request.directions.length !== request.count) {
      throw new BattleInputError(
        `"count" is ${request.count} but ${request.directions.length} directions were given. ` +
          'Supply one or the other, or make them agree.',
      );
    }
  }

  return request;
}

/** The directions a request will use: the forced ones, or the widest spread available. */
export function resolveDirections(request: BattleRequest): Direction[] {
  if (request.directions !== undefined) return request.directions;
  return chooseDirections(request.count ?? DEFAULT_STRATEGY_COUNT);
}

/** Rough sentence count, for the positioning length rule. */
export function countSentences(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '').length;
}

/** Strips the internal comparison fields, leaving a `strategyOptions` entry. */
export function toStrategyOption(candidate: StrategyCandidate): StrategyOption {
  const { uniqueClaim: _claim, primarySegment: _segment, ...option } = candidate;
  return { ...option, strengths: [...option.strengths], risks: [...option.risks], rationale: [...option.rationale] };
}

/**
 * Runs the distinctness check across a batch.
 *
 * Returns one reason per strategy that needs rebuilding. When two strategies
 * collide, only the later one is named: the earlier is treated as settled so the
 * rebuild has a fixed thing to differ from, and blaming both would rebuild the
 * whole batch, which is what this is designed to avoid.
 */
export function findDistinctnessIssues(
  strategies: readonly StrategyCandidate[],
  thresholds: DistinctnessThresholds = DEFAULT_THRESHOLDS,
): CollisionReason[] {
  const reasons = new Map<string, CollisionReason>();
  const flag = (reason: CollisionReason) => {
    if (!reasons.has(reason.direction)) reasons.set(reason.direction, reason);
  };

  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i]!;

    // Rule 2 from the prompt design: an empty risk list is a generation failure.
    // The schema requires one, so this catches a list of nothing but whitespace.
    if (strategy.risks.every((risk) => risk.trim() === '')) {
      flag({
        direction: strategy.direction,
        instruction:
          'It listed no real risk. Name at least one substantial cost of this direction — a narrower audience, slower proof, a thinner launch — and mean it.',
      });
    }

    if (strategy.tradeoffs.every((tradeoff) => tradeoff.trim() === '')) {
      flag({
        direction: strategy.direction,
        instruction:
          'It listed no tradeoff. Say what this direction gives up even when it works — the audience it will not serve, the claim it cannot make. A direction with no cost has not been chosen, only described.',
      });
    }

    if (countSentences(strategy.positioning) > thresholds.maxPositioningSentences) {
      flag({
        direction: strategy.direction,
        instruction: `Its positioning ran to ${countSentences(strategy.positioning)} sentences. Cut it to two or three — this is a comparison document, not a brand brief.`,
      });
    }

    for (let j = 0; j < i; j++) {
      const earlier = strategies[j]!;

      // Check 1: direction uniqueness. Structurally prevented upstream, verified here.
      if (strategy.direction === earlier.direction) {
        flag({
          direction: strategy.direction,
          collidedWith: earlier.direction,
          instruction: `Two strategies were returned for ${strategy.direction}. Rebuild this one against its assigned direction.`,
        });
        continue;
      }

      // Check 4: no shared unique selling point.
      if (overlapRatio(strategy.uniqueClaim, earlier.uniqueClaim) > thresholds.claim) {
        flag({
          direction: strategy.direction,
          collidedWith: earlier.direction,
          instruction:
            `Its differentiation is functionally identical to ${earlier.direction}'s — both come down to "${earlier.uniqueClaim}". ` +
            `Rebuild it around what ${ARCHETYPES[strategy.direction as Direction]?.coreAppeal ?? 'its own direction'} ` +
            `actually offers here, on a genuinely different axis.`,
        });
        continue;
      }

      // The directions must differ in strategic logic, not only in wording, so the
      // stated bet is compared before anything else about how it reads.
      if (overlapRatio(strategy.coreIdea, earlier.coreIdea) > thresholds.coreIdea) {
        flag({
          direction: strategy.direction,
          collidedWith: earlier.direction,
          instruction:
            `Its core idea is the same bet as ${earlier.direction}'s ("${earlier.coreIdea}"). ` +
            'Two directions that believe the same thing about the customer are one direction written twice. ' +
            `Find what ${ARCHETYPES[strategy.direction as Direction]?.coreAppeal ?? 'this direction'} ` +
            'believes that the other does not.',
        });
        continue;
      }

      // Check 2: audience divergence.
      if (overlapRatio(strategy.primarySegment, earlier.primarySegment) > thresholds.segment) {
        flag({
          direction: strategy.direction,
          collidedWith: earlier.direction,
          instruction:
            `It targets the same slice of the audience as ${earlier.direction} ("${earlier.primarySegment}"). ` +
            'Different strategic bets should suit somewhat different people — find the slice this direction genuinely serves better than the others do.',
        });
        continue;
      }

      // Check 3: risk divergence.
      if (listOverlapRatio(strategy.risks, earlier.risks) > thresholds.risks) {
        flag({
          direction: strategy.direction,
          collidedWith: earlier.direction,
          instruction:
            `Its risks are near-identical to ${earlier.direction}'s. Different strategic bets fail in different ways — ` +
            'work out how this direction specifically would go wrong.',
        });
      }
    }
  }

  return [...reasons.values()];
}

/**
 * Runs BRAND BATTLE.
 *
 * Deliberately does not choose a winner, rank the strategies, or order them by
 * anything other than the directions requested.
 */
export async function battle(
  deriver: SectionDeriver,
  request: BattleRequest,
  options: BattleOptions = {},
): Promise<{ value: StrategyOption[]; usage: Usage }> {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  const maxRebuilds = Math.max(0, options.maxRebuildsPerStrategy ?? 1);
  const directions = resolveDirections(request);

  const basePrompt = buildBattlePrompt({
    discovery: stableStringify(request.discovery, 2),
    ...(request.positioning === undefined
      ? {}
      : { positioning: stableStringify(request.positioning, 2) }),
    directions: directions.map((direction) => ({
      direction,
      coreAppeal: ARCHETYPES[direction].coreAppeal,
      typicalAngle: ARCHETYPES[direction].typicalAngle,
    })),
  });

  const first = await deriver.deriveSection('strategyOptions', '', BattleResultSchema, {
    userPrompt: basePrompt,
  } satisfies DeriveOptions);

  let usage = first.usage;
  let strategies = [...first.value.strategies];

  // Rebuild only what collided, one strategy at a time, each told what it hit.
  for (let round = 0; round < maxRebuilds; round++) {
    const issues = findDistinctnessIssues(strategies, thresholds);
    if (issues.length === 0) break;

    for (const issue of issues) {
      const index = strategies.findIndex((strategy) => strategy.direction === issue.direction);
      if (index === -1) continue;

      const others = strategies.filter((_, position) => position !== index);
      const rebuilt = await deriver.deriveSection(
        'strategyOptions',
        '',
        StrategyRegenerationSchema,
        {
          userPrompt: buildStrategyRetryPrompt(
            basePrompt,
            issue,
            stableStringify(others.map(toStrategyOption), 2),
          ),
        } satisfies DeriveOptions,
      );

      usage = addUsage(usage, rebuilt.usage);
      strategies[index] = rebuilt.value.strategy;
    }
  }

  const remaining = findDistinctnessIssues(strategies, thresholds);
  if (remaining.length > 0) {
    // Returning strategies the check says are the same idea twice would defeat the
    // whole point of the phase, so this fails loudly instead.
    throw new IndistinctStrategiesError(remaining);
  }

  return { value: strategies.map(toStrategyOption), usage };
}

/**
 * Records a human's choice of direction.
 *
 * Never inferred and never defaulted — this function exists so that choosing is
 * always an explicit act with a caller behind it.
 */
export function selectStrategy(
  options: readonly StrategyOption[],
  direction: string,
  reasonChosen?: string,
): { direction: Direction; chosenAt: string; reasonChosen?: string } {
  const normalized = direction.trim().toUpperCase();
  const chosen = options.find((option) => option.direction === normalized);

  if (chosen === undefined) {
    throw new BattleInputError(
      `"${direction}" is not one of the strategy options. Available: ${options
        .map((option) => option.direction)
        .join(', ')}.`,
    );
  }

  return {
    direction: chosen.direction,
    chosenAt: new Date().toISOString(),
    ...(reasonChosen !== undefined && reasonChosen.trim() !== ''
      ? { reasonChosen: reasonChosen.trim() }
      : {}),
  };
}
