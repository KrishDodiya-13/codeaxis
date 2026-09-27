/**
 * The STRESS TEST step: `POST /api/stress-test`.
 *
 * The highest-priority phase, and the only one whose job is to say "this is wrong".
 * Everything before it generates; if this step is weak, every upstream mistake flows
 * straight into the finished brand unexamined. It is the last checkpoint before
 * commitment, so it gates `finalBrand`.
 *
 * Two things are computed here rather than asked of the model: the summary counts
 * and the finalization gate. A model that reports its own severity totals can
 * disagree with the findings it just wrote, and the gate is a rule, not a judgement.
 */
import { overlapRatio } from './archetypes.ts';
import { EMPTY_USAGE, addUsage } from './client.ts';
import type { DeriveOptions, SectionDeriver, Usage } from './client.ts';
import { buildStressPrompt, buildStressRetryPrompt } from './prompts.ts';
import { StressTestResultSchema, parseBrandState } from './schemas.ts';
import { isSectionPopulated, resolveSelectedStrategy, stableStringify } from './state.ts';
import { SECTION_ORDER } from './state.ts';
import { TEST_TYPES } from './types.ts';
import type {
  BrandState,
  EvaluationStatus,
  Severity,
  StrategyOption,
  StressTest,
  TestType,
  TypeEvaluation,
} from './types.ts';

/** Severities that stop the brand being finalized while still open. */
export const BLOCKING_SEVERITIES: readonly Severity[] = ['critical', 'high'] as const;

export type StressTestRequest = {
  /** The one strategy the human picked. This is what gets tested. */
  selectedStrategy: StrategyOption;
  /** The full state as it currently stands. Sections may be empty. */
  brandState: BrandState;
  /** Restrict to specific test types, for a cheap re-run after a small edit. */
  scope?: TestType[];
};

export type StressSummary = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  /** True while any `critical` or `high` finding is still open. */
  blocksFinalization: boolean;
};

export type StressTestResponse = {
  tests: StressTest[];
  summary: StressSummary;
  /**
   * Per test type, whether it could actually run — rendered as the flat strings the
   * endpoint contract specifies. `evaluations` carries the same information
   * structured, for callers that need to branch on it.
   */
  evaluatedTypes: Record<string, string>;
  evaluations: TypeEvaluation[];
};

/** Thrown when a request is not a usable STRESS TEST request. */
export class StressTestInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StressTestInputError';
  }
}

/** Thrown when findings still fail the evidence bar after a retry. */
export class UnauditableFindingsError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      `The findings cannot be audited: ${problems.join('; ')}. A finding that does not cite ` +
        'BrandState fields, or whose impact only restates its issue, cannot be verified or fixed.',
    );
    this.name = 'UnauditableFindingsError';
    this.problems = problems;
  }
}

/**
 * Thrown when `finalBrand` is attempted with blocking findings still open.
 *
 * Carries the findings so the caller can fix them, or accept them with
 * `acknowledgeFinding` — which is a decision a human makes, not this code.
 */
export class FinalizationBlockedError extends Error {
  readonly blocking: StressTest[];

  constructor(blocking: StressTest[]) {
    super(
      `The brand cannot be finalized: ${blocking.length} open ` +
        `${blocking.length === 1 ? 'finding' : 'findings'} at critical or high severity. ` +
        `${blocking.map((finding) => `[${finding.severity}] ${finding.type}: ${finding.issue}`).join(' | ')}` +
        ' — fix them and re-run the stress test, or acknowledge them as accepted trade-offs.',
    );
    this.name = 'FinalizationBlockedError';
    this.blocking = blocking;
  }
}

export type StressTestOptions = {
  /** Retries allowed when findings fail the evidence bar. Defaults to 1. */
  maxRetries?: number;
  /**
   * How much `impact` may overlap `issue` before it counts as a restatement.
   * Lexical overlap over content words; 0.7 is loose enough that sharing subject
   * matter is fine.
   */
  maxImpactOverlap?: number;
};

/**
 * Matches a citation of an actual `BrandState` field path.
 *
 * Accepts an array index between the section and the field, because evidence
 * pointing at one entry of a list — `strategyOptions[2].positioning`,
 * `stressTests[0].issue` — is a more precise citation, not a worse one.
 */
const FIELD_PATH = new RegExp(
  `\\b(project|${SECTION_ORDER.join('|')})(\\[\\d+\\])?\\.[A-Za-z][A-Za-z0-9_.\\[\\]]*`,
);

/** Whether `evidence` cites at least one real field path rather than a vague gesture. */
export function citesFieldPath(evidence: string): boolean {
  return FIELD_PATH.test(evidence);
}

/**
 * Checks each finding against the two rules a deterministic check can enforce:
 * evidence must cite field paths, and impact must not be the issue restated.
 *
 * Returns a human-readable problem per offending finding, which goes straight into
 * the retry prompt. Severity consistency and whether a finding was manufactured are
 * judgements no code here can make; those live in the instructions.
 */
export function findUnauditableFindings(
  tests: readonly StressTest[],
  maxImpactOverlap = 0.7,
): string[] {
  const problems: string[] = [];

  for (const finding of tests) {
    const label = `${finding.type} (${finding.severity})`;

    if (!citesFieldPath(finding.evidence)) {
      problems.push(
        `${label}: evidence "${finding.evidence}" cites no BrandState field path, so the finding cannot be checked`,
      );
    }

    if (overlapRatio(finding.issue, finding.impact) > maxImpactOverlap) {
      problems.push(
        `${label}: impact restates the issue rather than naming a downstream consequence`,
      );
    }
  }

  return problems;
}

/** Findings that are still open. A finding with no status set is open. */
export function openFindings(tests: readonly StressTest[]): StressTest[] {
  return tests.filter((finding) => (finding.status ?? 'open') === 'open');
}

/** Open findings at a severity that blocks finalization. */
export function blockingFindings(tests: readonly StressTest[]): StressTest[] {
  return openFindings(tests).filter((finding) => BLOCKING_SEVERITIES.includes(finding.severity));
}

/**
 * Counts by severity, plus the gate.
 *
 * The counts cover every finding regardless of status, because they describe what
 * the test found. The gate looks only at open ones, because an accepted trade-off is
 * not a blocker.
 */
export function summarize(tests: readonly StressTest[]): StressSummary {
  const summary: StressSummary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    blocksFinalization: false,
  };

  for (const finding of tests) summary[finding.severity]++;
  summary.blocksFinalization = blockingFindings(tests).length > 0;

  return summary;
}

/**
 * Whether `finalBrand` may be populated.
 *
 * True when no open finding sits at critical or high — either because they were
 * fixed and the test re-run, or because they were explicitly acknowledged.
 */
export function canFinalize(state: BrandState): boolean {
  return blockingFindings(state.stressTests).length === 0;
}

/**
 * Records a decision about a finding, returning a new list.
 *
 * Findings are matched on type and issue rather than by index, so a re-run that
 * reorders them does not reassign somebody's decision to a different finding.
 */
export function acknowledgeFinding(
  tests: readonly StressTest[],
  match: { type: TestType; issue?: string },
  status: 'acknowledged' | 'resolved' | 'open' = 'acknowledged',
): StressTest[] {
  let matched = 0;

  const updated = tests.map((finding) => {
    const isMatch =
      finding.type === match.type &&
      (match.issue === undefined || finding.issue.includes(match.issue));
    if (!isMatch) return finding;
    matched++;
    return { ...finding, status };
  });

  if (matched === 0) {
    throw new StressTestInputError(
      `No finding matches type "${match.type}"${match.issue ? ` containing "${match.issue}"` : ''}.`,
    );
  }

  return updated;
}

/** Validates a request, throwing `StressTestInputError` with a usable message. */
export function validateStressTestRequest(value: unknown): StressTestRequest {
  if (value === null || typeof value !== 'object') {
    throw new StressTestInputError('The request body must be a JSON object.');
  }

  const body = value as Record<string, unknown>;

  let brandState: BrandState;
  try {
    brandState = parseBrandState(body.brandState);
  } catch {
    throw new StressTestInputError(
      '"brandState" is required and must be a valid BrandState object.',
    );
  }

  // The strategy defaults to whichever one the state says was chosen, so a caller
  // holding a complete state does not have to pull it out and send it twice.
  let selectedStrategy: StrategyOption | undefined;
  if (body.selectedStrategy === undefined) {
    selectedStrategy = resolveSelectedStrategy(brandState);
    if (selectedStrategy === undefined) {
      throw new StressTestInputError(
        '"selectedStrategy" is required, and brandState.selectedStrategy does not resolve to one ' +
          'of brandState.strategyOptions. Choose a direction first.',
      );
    }
  } else {
    if (body.selectedStrategy === null || typeof body.selectedStrategy !== 'object') {
      throw new StressTestInputError('"selectedStrategy" must be a strategy object.');
    }
    const candidate = body.selectedStrategy as Record<string, unknown>;
    if (typeof candidate.direction !== 'string' || typeof candidate.positioning !== 'string') {
      throw new StressTestInputError(
        '"selectedStrategy" must be one of the Phase 4 strategy options, with at least a direction and a positioning.',
      );
    }
    selectedStrategy = body.selectedStrategy as StrategyOption;
  }

  const request: StressTestRequest = { selectedStrategy, brandState };

  if (body.scope !== undefined) {
    if (!Array.isArray(body.scope) || !body.scope.every((entry) => typeof entry === 'string')) {
      throw new StressTestInputError('"scope" must be an array of test type names.');
    }
    if (body.scope.length === 0) {
      throw new StressTestInputError('"scope" was empty. Omit it to run all five tests.');
    }

    const unknown = body.scope.filter((entry) => !(TEST_TYPES as readonly string[]).includes(entry));
    if (unknown.length > 0) {
      throw new StressTestInputError(
        `Unknown test ${unknown.length === 1 ? 'type' : 'types'}: ${unknown.join(', ')}. ` +
          `Choose from: ${TEST_TYPES.join(', ')}.`,
      );
    }
    request.scope = [...new Set(body.scope as TestType[])];
  }

  return request;
}

/** Sections a stress test would want that have not been derived yet. */
export function missingSections(state: BrandState): string[] {
  return SECTION_ORDER.filter(
    (section) => section !== 'stressTests' && section !== 'consistency' && section !== 'finalBrand',
  ).filter((section) => !isSectionPopulated(state, section));
}

/** Renders the structured evaluations as the flat strings the contract specifies. */
export function renderEvaluatedTypes(evaluations: readonly TypeEvaluation[]): Record<string, string> {
  const rendered: Record<string, string> = {};
  for (const evaluation of evaluations) {
    rendered[evaluation.type] =
      evaluation.status === 'evaluated' && evaluation.note === undefined
        ? 'evaluated'
        : `${evaluation.status}${evaluation.note ? ` — ${evaluation.note}` : ''}`;
  }
  return rendered;
}

/**
 * Fills in any test type the model failed to report on.
 *
 * A silently missing entry would read as a pass, which is the false sense of
 * security `evaluatedTypes` exists to prevent — so an unreported type is recorded as
 * not-testable with the reason stated.
 */
function completeEvaluations(
  reported: readonly TypeEvaluation[],
  scope: readonly TestType[],
): TypeEvaluation[] {
  return scope.map((type) => {
    const entry = reported.find((evaluation) => evaluation.type === type);
    if (entry !== undefined) return entry;
    return {
      type,
      status: 'not-testable' as EvaluationStatus,
      note: 'the model did not report on this test, so it cannot be treated as passed',
    };
  });
}

/**
 * Runs the stress test.
 *
 * Does not fix anything, does not decide what is worth fixing, and does not rank the
 * findings — it diagnoses, and the rest is a human call.
 */
export async function stressTest(
  deriver: SectionDeriver,
  request: StressTestRequest,
  options: StressTestOptions = {},
): Promise<{ value: StressTestResponse; usage: Usage }> {
  const scope = request.scope ?? [...TEST_TYPES];
  const maxRetries = Math.max(0, options.maxRetries ?? 1);
  const maxImpactOverlap = options.maxImpactOverlap ?? 0.7;

  // The chosen strategy is sent on its own, and stripped from the state view so it
  // is not sent twice under two names.
  const stateForPrompt = { ...request.brandState };
  delete (stateForPrompt as { strategyOptions?: unknown }).strategyOptions;

  const basePrompt = buildStressPrompt({
    selectedStrategy: stableStringify(request.selectedStrategy, 2),
    brandState: serializePopulated(stateForPrompt as BrandState),
    scope,
    missingSections: missingSections(request.brandState),
  });

  let usage = EMPTY_USAGE;
  let prompt = basePrompt;
  let tests: StressTest[] = [];
  let evaluations: TypeEvaluation[] = [];
  let problems: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await deriver.deriveSection('stressTests', '', StressTestResultSchema, {
      userPrompt: prompt,
    } satisfies DeriveOptions);

    usage = addUsage(usage, result.usage);

    // Findings outside the requested scope are dropped rather than returned: a
    // scoped re-run that quietly reported on everything would overwrite decisions
    // already recorded against the types it was told to leave alone.
    tests = result.value.tests.filter((finding) => scope.includes(finding.type));
    evaluations = completeEvaluations(result.value.evaluatedTypes, scope);

    problems = findUnauditableFindings(tests, maxImpactOverlap);
    if (problems.length === 0) break;

    prompt = buildStressRetryPrompt(basePrompt, problems);
  }

  if (problems.length > 0) throw new UnauditableFindingsError(problems);

  return {
    value: {
      tests,
      summary: summarize(tests),
      evaluatedTypes: renderEvaluatedTypes(evaluations),
      evaluations,
    },
    usage,
  };
}

/** The state as the model sees it, with unpopulated sections left out. */
function serializePopulated(state: BrandState): string {
  const view: Record<string, unknown> = { project: state.project };
  for (const section of SECTION_ORDER) {
    if (section === 'stressTests') continue;
    if (state[section] !== undefined && isSectionPopulated(state, section)) {
      view[section] = state[section];
    }
  }
  return stableStringify(view, 2);
}

/**
 * Which test types should be re-run after an edit.
 *
 * Stress testing is not a one-time gate. When a section changes, the tests that
 * depend on it are stale — this maps the change to the narrowest `scope` that covers
 * it, so a re-check after a small edit does not cost a full suite.
 */
export function shouldRerunStressTests(before: BrandState, after: BrandState): TestType[] {
  const changed = (section: (typeof SECTION_ORDER)[number]) =>
    stableStringify(before[section]) !== stableStringify(after[section]);

  const affected = new Set<TestType>();

  // Each section feeds the tests that read from it.
  if (changed('discovery')) {
    affected.add('audienceMismatch');
    affected.add('differentiation');
    affected.add('contradiction');
    affected.add('messaging');
  }
  if (changed('positioning')) {
    affected.add('cliché');
    affected.add('differentiation');
    affected.add('contradiction');
    affected.add('messaging');
  }
  if (changed('selectedStrategy') || changed('strategyOptions')) {
    for (const type of TEST_TYPES) affected.add(type);
  }
  if (changed('personality')) {
    affected.add('cliché');
    affected.add('audienceMismatch');
    affected.add('contradiction');
  }
  if (changed('naming')) {
    affected.add('cliché');
    affected.add('contradiction');
    affected.add('messaging');
  }
  if (changed('voice')) {
    affected.add('cliché');
    affected.add('contradiction');
    affected.add('messaging');
  }
  if (changed('visualDirection')) {
    affected.add('contradiction');
  }

  // Returned in the canonical order, so the scope is stable between calls.
  return TEST_TYPES.filter((type) => affected.has(type));
}
