/**
 * The BRAND OS compile step: `POST /api/brand-os`.
 *
 * The last phase. It takes a finished `BrandState` and compiles it into the six-section
 * deliverable handed back to the user. It re-runs nothing: everything already decided
 * is projected out of the state, and the model is asked only for the material nothing
 * earlier in the pipeline produced — the purpose layer, a logo direction, sample copy
 * and the launch plan.
 *
 * Two consequences of compiling rather than regenerating. A decision that was
 * stress-tested and signed off cannot be quietly rewritten on the way out, because the
 * model never sees those fields as its own to write. And the validation section is
 * arithmetic over the findings, so the readiness it reports cannot flatter the brand it
 * describes.
 */
import { EMPTY_USAGE, addUsage } from './client.ts';
import type { DeriveOptions, SectionDeriver, Usage } from './client.ts';
import { BRAND_OS_INSTRUCTIONS, buildBrandOsPrompt } from './prompts.ts';
import { BrandOsDraftSchema, SCHEMA_VERSION, parseBrandState } from './schemas.ts';
import { SECTION_ORDER, isSectionPopulated, resolveSelectedStrategy, stableStringify } from './state.ts';
import { blockingFindings, openFindings, summarize } from './stress.ts';
import type { BrandState, StressTest } from './types.ts';
import type { z } from 'zod';

export type BrandOsDraft = z.infer<typeof BrandOsDraftSchema>;

export type RolloutMilestone = {
  milestone: string;
  timing: string;
  detail: string;
};

export type ReadinessCheck = {
  item: string;
  passed: boolean;
  detail: string;
};

export type BrandOs = {
  strategy: {
    purpose: string;
    mission: string;
    vision: string;
    targetAudience: string;
    coreSegments: string[];
    positioningStatement: string;
    competitiveDifferentiation: string;
  };
  identity: {
    name: string;
    nameRationale: string;
    coreValues: string[];
    personalityTraits: string[];
    archetype: string;
  };
  visual: {
    logoDirection: string;
    colorPalette: string[];
    typographySystem: string;
    imageryStyle: string;
  };
  voice: {
    toneGuidelines: string[];
    messagingPillars: string[];
    taglines: string[];
    sampleCopy: { headline: string; boilerplate: string };
  };
  launch: {
    goToMarketSummary: string;
    keyChannels: string[];
    rolloutSequence: RolloutMilestone[];
  };
  validation: {
    stressTestSummary: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      open: number;
      acknowledged: number;
      resolved: number;
    };
    risks: string[];
    openFlags: string[];
    readiness: {
      score: number;
      label: 'ready' | 'ready-with-caveats' | 'not-ready';
      checklist: ReadinessCheck[];
    };
  };
};

export type BrandOsRequest = {
  /** The brand session being finalized. Must agree with `brandState.id`. */
  brandId: string;
  brandState: BrandState;
  /**
   * Compile despite open critical or high findings. The result is marked
   * `not-ready` and the findings appear in `openFlags`, so a draft is never mistaken
   * for a signed-off deliverable.
   */
  allowUnvalidated?: boolean;
};

export type BrandOsResponse = {
  brandId: string;
  brandOS: BrandOs;
};

/** Thrown when a request is not a usable BRAND OS request. */
export class BrandOsInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandOsInputError';
  }
}

/**
 * Thrown when the state is missing something the deliverable requires.
 *
 * The done criteria are explicit that no required field may come back empty, so a
 * state that cannot fill one fails here rather than producing a stub.
 */
export class IncompleteBrandStateError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      `The brand state cannot be compiled: ${missing.join('; ')}. ` +
        'Every section must be derived and the name and tagline chosen before the Brand OS can be built.',
    );
    this.name = 'IncompleteBrandStateError';
    this.missing = missing;
  }
}

/** Thrown when compiling would produce an empty required field. */
export class IncompleteBrandOsError extends Error {
  readonly empty: string[];

  constructor(empty: string[]) {
    super(`The compiled Brand OS has empty required fields: ${empty.join(', ')}.`);
    this.name = 'IncompleteBrandOsError';
    this.empty = empty;
  }
}

export type BrandOsOptions = {
  /** Retries when the draft leaves a required field empty. Defaults to 1. */
  maxRetries?: number;
};

/**
 * What the state is missing before it can be compiled.
 *
 * Checked up front so a request that cannot succeed fails before spending a model
 * call, and so the message names every gap at once rather than one per attempt.
 */
export function findMissingForCompile(state: BrandState): string[] {
  const missing: string[] = [];

  for (const section of SECTION_ORDER) {
    // finalBrand is not required: the Brand OS is the deliverable, and locking is a
    // separate act that may or may not have happened yet.
    if (section === 'finalBrand') continue;
    if (!isSectionPopulated(state, section)) missing.push(`${section} has not been derived`);
  }

  if (state.naming.selectedName === undefined) missing.push('naming.selectedName has not been chosen');
  if (state.naming.tagline.selected === undefined) {
    missing.push('naming.tagline.selected has not been chosen');
  }
  if (resolveSelectedStrategy(state) === undefined) {
    missing.push('selectedStrategy does not resolve to one of strategyOptions');
  }

  return missing;
}

/** Validates a request, throwing `BrandOsInputError` with a usable message. */
export function validateBrandOsRequest(value: unknown): BrandOsRequest {
  if (value === null || typeof value !== 'object') {
    throw new BrandOsInputError('The request body must be a JSON object.');
  }

  const body = value as Record<string, unknown>;

  let brandState: BrandState;
  try {
    brandState = parseBrandState(body.brandState);
  } catch {
    throw new BrandOsInputError(
      '"brandState" is required and must be a valid BrandState object. A state written before ' +
        `schema ${SCHEMA_VERSION} needs migrating first.`,
    );
  }

  // brandId and brandState.id are the same identity recorded twice, so a mismatch is
  // reported rather than resolved in either field's favour — picking one silently is
  // how the wrong brand gets shipped.
  let brandId: string;
  if (body.brandId === undefined) {
    brandId = brandState.id;
  } else {
    if (typeof body.brandId !== 'string' || body.brandId.trim() === '') {
      throw new BrandOsInputError('"brandId" must be a non-empty string.');
    }
    brandId = body.brandId.trim();
    if (brandId !== brandState.id) {
      throw new BrandOsInputError(
        `"brandId" (${brandId}) does not match brandState.id (${brandState.id}). ` +
          'Send one or the other, or make them agree.',
      );
    }
  }

  const request: BrandOsRequest = { brandId, brandState };

  if (body.allowUnvalidated !== undefined) {
    if (typeof body.allowUnvalidated !== 'boolean') {
      throw new BrandOsInputError('"allowUnvalidated" must be a boolean.');
    }
    request.allowUnvalidated = body.allowUnvalidated;
  }

  return request;
}

/** Counts findings by severity and by status. */
export function summarizeFindings(tests: readonly StressTest[]): BrandOs['validation']['stressTestSummary'] {
  // The severity counts come from the stress module rather than being recounted here,
  // so the deliverable and the gate can never disagree about how many findings there
  // are at each severity. Only the status tally is new.
  const { blocksFinalization: _gate, ...severities } = summarize(tests);

  const byStatus = { open: 0, acknowledged: 0, resolved: 0 };
  for (const finding of tests) byStatus[finding.status ?? 'open']++;

  return { ...severities, ...byStatus };
}

/**
 * The readiness assessment.
 *
 * Deterministic on purpose. A confidence score the model writes about its own work is
 * worth nothing, so this is arithmetic over the findings and the state: each check
 * either passes or it does not, and the score follows from which ones failed.
 */
export function assessReadiness(state: BrandState): BrandOs['validation']['readiness'] {
  const blocking = blockingFindings(state.stressTests);
  const open = openFindings(state.stressTests);
  const openMedium = open.filter((finding) => finding.severity === 'medium');
  const openLow = open.filter((finding) => finding.severity === 'low');

  const checklist: ReadinessCheck[] = [
    {
      item: 'Every section derived',
      passed: findMissingForCompile(state).length === 0,
      detail:
        findMissingForCompile(state).length === 0
          ? 'All sections are populated and the name and tagline are chosen.'
          : findMissingForCompile(state).join('; '),
    },
    {
      item: 'No blocking stress-test findings open',
      passed: blocking.length === 0,
      detail:
        blocking.length === 0
          ? 'Nothing open at critical or high severity.'
          : `${blocking.length} open at critical or high: ${blocking.map((f) => f.type).join(', ')}.`,
    },
    {
      item: 'Stress test has been run',
      passed: state.stressTests.length > 0,
      detail:
        state.stressTests.length > 0
          ? `${state.stressTests.length} findings recorded.`
          : 'No stress test has been run, so nothing has been checked.',
    },
    {
      item: 'Consistency check passed',
      passed: state.consistency.status === 'consistent',
      detail:
        state.consistency.status === 'consistent'
          ? 'The sections agree.'
          : `Consistency is ${state.consistency.status}.`,
    },
    {
      item: 'Minor findings addressed',
      passed: openMedium.length === 0 && openLow.length === 0,
      detail:
        openMedium.length === 0 && openLow.length === 0
          ? 'No medium or low findings left open.'
          : `${openMedium.length} medium and ${openLow.length} low still open.`,
    },
    {
      item: 'Brand locked',
      passed: state.finalBrand !== undefined,
      detail:
        state.finalBrand === undefined
          ? 'finalBrand has not been populated, so nothing is locked yet.'
          : `Locked ${state.finalBrand.lockedAt}.`,
    },
  ];

  const passed = checklist.filter((check) => check.passed).length;
  const score = Math.round((passed / checklist.length) * 100);

  // A blocking finding is disqualifying regardless of how the rest scores: the point
  // of the gate is that it cannot be outvoted by unrelated checks passing.
  const label: BrandOs['validation']['readiness']['label'] =
    blocking.length > 0 ? 'not-ready' : passed === checklist.length ? 'ready' : 'ready-with-caveats';

  return { score, label, checklist };
}

/** One line per finding, for the risks and flags lists. */
function describeFinding(finding: StressTest): string {
  return `[${finding.severity}] ${finding.type}: ${finding.issue}`;
}

/**
 * Compiles the deliverable from the state plus the generated material.
 *
 * Exported separately from `compileBrandOs` so the projection can be tested without a
 * deriver — which is most of the logic, and the part that must not drift from the
 * state it reads.
 */
export function assembleBrandOs(state: BrandState, draft: BrandOsDraft): BrandOs {
  const missing = findMissingForCompile(state);
  if (missing.length > 0) throw new IncompleteBrandStateError(missing);

  const strategy = resolveSelectedStrategy(state)!;
  const open = openFindings(state.stressTests);
  const accepted = state.stressTests.filter((finding) => finding.status === 'acknowledged');

  const brandOs: BrandOs = {
    strategy: {
      purpose: draft.purpose,
      mission: draft.mission,
      vision: draft.vision,
      targetAudience: state.discovery.targetAudience,
      coreSegments: [...draft.coreSegments],
      // The locked statement wins where one exists, so the deliverable and the lock
      // cannot disagree about what the brand claims.
      positioningStatement: state.finalBrand?.positioningStatement ?? strategy.positioning,
      competitiveDifferentiation: `${state.positioning.differentiator} ${state.positioning.competitiveAngle}`.trim(),
    },
    identity: {
      name: state.naming.selectedName!,
      nameRationale: draft.nameRationale,
      coreValues: [...state.personality.values],
      personalityTraits: [...state.personality.traits],
      // The state's archetype wins: the draft is only asked for one when there is none.
      archetype: state.personality.archetype ?? draft.archetype,
    },
    visual: {
      logoDirection: draft.logoDirection,
      colorPalette: [...state.visualDirection.colors],
      typographySystem: state.visualDirection.typography,
      imageryStyle: `${state.visualDirection.imagery} Shape language: ${state.visualDirection.shapes}`.trim(),
    },
    voice: {
      toneGuidelines: [...state.voice.toneAttributes, ...state.voice.writingPrinciples],
      messagingPillars: [
        state.voice.messagingHierarchy.primaryMessage,
        ...state.voice.messagingHierarchy.supportingMessages,
      ],
      // The chosen tagline comes first; the rest are kept because a deliverable that
      // hides the alternatives makes the choice unauditable later.
      taglines: [
        state.naming.tagline.selected!,
        ...state.naming.tagline.candidates.filter((line) => line !== state.naming.tagline.selected),
      ],
      sampleCopy: { ...draft.sampleCopy },
    },
    launch: {
      goToMarketSummary: draft.launch.goToMarketSummary,
      keyChannels: [...draft.launch.keyChannels],
      rolloutSequence: draft.launch.rolloutSequence.map((milestone) => ({ ...milestone })),
    },
    validation: {
      stressTestSummary: summarizeFindings(state.stressTests),
      // Risks are what is still open; flags separate out the accepted trade-offs, which
      // are not open but are still things a reader must know about.
      risks: open.map(describeFinding),
      openFlags: [
        ...blockingFindings(state.stressTests).map(
          (finding) => `BLOCKING — ${describeFinding(finding)}`,
        ),
        ...accepted.map((finding) => `accepted trade-off — ${describeFinding(finding)}`),
        ...(state.consistency.status === 'issues-found'
          ? [`consistency reported issues: ${(state.consistency.notes ?? []).join(' | ')}`]
          : []),
      ],
      readiness: assessReadiness(state),
    },
  };

  const empty = findEmptyFields(brandOs);
  if (empty.length > 0) throw new IncompleteBrandOsError(empty);

  return brandOs;
}

/**
 * Required fields that came out empty.
 *
 * The done criteria say no nulls or empty stubs, so this is checked rather than
 * assumed. `risks`, `openFlags` and the notes are legitimately empty on a clean brand
 * and are exempt.
 */
export function findEmptyFields(brandOs: BrandOs): string[] {
  const exempt = new Set(['validation.risks', 'validation.openFlags']);
  const empty: string[] = [];

  const walk = (value: unknown, path: string): void => {
    if (exempt.has(path)) return;

    if (typeof value === 'string') {
      if (value.trim() === '') empty.push(path);
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) empty.push(path);
      else value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) walk(nested, `${path}.${key}`);
    }
  };

  for (const [key, value] of Object.entries(brandOs)) walk(value, key);
  return empty;
}

/**
 * Runs the compile step.
 *
 * Refuses a state with open blocking findings unless told otherwise, matching the gate
 * `finalBrand` enforces — a deliverable is exactly what should not be built on an
 * unresolved critical finding.
 */
export async function compileBrandOs(
  deriver: SectionDeriver,
  request: BrandOsRequest,
  options: BrandOsOptions = {},
): Promise<{ value: BrandOsResponse; usage: Usage }> {
  const { brandState: state, allowUnvalidated = false } = request;
  const maxRetries = Math.max(0, options.maxRetries ?? 1);

  const missing = findMissingForCompile(state);
  if (missing.length > 0) throw new IncompleteBrandStateError(missing);

  const blocking = blockingFindings(state.stressTests);
  if (blocking.length > 0 && !allowUnvalidated) {
    // Same rule as the lock step, restated here because this is the artefact that
    // actually leaves the building.
    const { FinalizationBlockedError } = await import('./stress.ts');
    throw new FinalizationBlockedError(blocking);
  }

  const prompt = buildBrandOsPrompt({
    brandState: serializeForCompile(state),
    hasArchetype: state.personality.archetype !== undefined,
    acceptedFindings: state.stressTests
      .filter((finding) => finding.status === 'acknowledged')
      .map(describeFinding),
  });

  let usage = EMPTY_USAGE;
  let lastEmpty: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const draft = await deriver.deriveSection('finalBrand', '', BrandOsDraftSchema, {
      userPrompt: prompt,
      instructions: BRAND_OS_INSTRUCTIONS,
    } satisfies DeriveOptions);

    usage = addUsage(usage, draft.usage);

    try {
      const brandOS = assembleBrandOs(state, draft.value);
      return { value: { brandId: request.brandId, brandOS }, usage };
    } catch (error) {
      if (!(error instanceof IncompleteBrandOsError) || attempt === maxRetries) throw error;
      lastEmpty = error.empty;
    }
  }

  throw new IncompleteBrandOsError(lastEmpty);
}

/** The state as the compile step sees it, with metadata and empty sections omitted. */
function serializeForCompile(state: BrandState): string {
  const view: Record<string, unknown> = { project: state.project };

  for (const section of SECTION_ORDER) {
    if (state[section] !== undefined && isSectionPopulated(state, section)) {
      view[section] = state[section];
    }
  }

  // The rejected candidates are not part of the finished brand, and sending them
  // invites the launch plan to hedge across directions nobody chose.
  delete view.strategyOptions;
  view.selectedStrategy = { ...state.selectedStrategy, strategy: resolveSelectedStrategy(state) };

  return stableStringify(view, 2);
}
