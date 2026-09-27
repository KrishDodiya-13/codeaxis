/**
 * CONSISTENCY: does the brand agree with itself?
 *
 * Distinct from the stress test, which asks whether each decision is *good*. This asks
 * only whether the decisions are compatible — a brand can be internally consistent and
 * still unambitious, and saying so is not this step's job.
 *
 * Two rules are enforced here rather than left to the prompt, because a model cannot be
 * trusted to police itself on either:
 *
 *   - evidence must cite real BrandState field paths, so every finding is checkable
 *   - `status` must agree with `findings`, so "consistent" cannot be returned alongside
 *     a list of conflicts
 *
 * Nothing in this module writes to another section. `recommendedCorrection` is a
 * proposal; applying it is a human decision, made through the decision endpoints.
 */
import {
  EMPTY_USAGE,
  addUsage,
  type DeriveOptions,
  type SectionDeriver,
  type Usage,
} from './client.ts';
import { ConsistencySchema } from './schemas.ts';
import { buildConsistencyPrompt, buildConsistencyRetryPrompt } from './prompts.ts';
import { SECTION_ORDER, isSectionPopulated, stableStringify } from './state.ts';
import { citesFieldPath } from './stress.ts';
import {
  CONSISTENCY_DIMENSIONS,
  type BrandState,
  type Consistency,
  type ConsistencyDimension,
  type ConsistencyFinding,
  type DimensionEvaluation,
  type Severity,
} from './types.ts';

export type ConsistencyRequest = {
  /** The state to check. Sections may be empty; the check reports what it could not do. */
  brandState: BrandState;
  /** Restrict to specific dimensions, for a cheap re-check after one edit. */
  scope?: ConsistencyDimension[];
};

export type ConsistencySummary = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  /** True when nothing was found and every dimension in scope was actually compared. */
  clean: boolean;
};

export type ConsistencyResponse = {
  /** The section as it should be stored. */
  consistency: Consistency;
  summary: ConsistencySummary;
  /** Human-readable line per dimension, for the UI. */
  reports: DimensionReport[];
};

export type DimensionReport = {
  dimension: ConsistencyDimension;
  status: DimensionEvaluation['status'];
  /** How many findings named this dimension. */
  findingCount: number;
  /** What to show: the pass statement, or why it could not be checked. */
  message: string;
};

export type ConsistencyOptions = {
  /** Retries when a finding comes back uncheckable. One is usually enough. */
  maxRetries?: number;
};

/** Thrown when the request itself is malformed. */
export class ConsistencyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsistencyInputError';
  }
}

/**
 * Thrown when findings still cannot be audited after the retries are spent.
 *
 * Raised rather than returned: a finding whose evidence cites nothing is indistinguishable
 * from an invented one, and rendering it would put an unfalsifiable claim in front of the
 * user as though the engine had checked it.
 */
export class UncheckableConsistencyError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      `The consistency check returned ${problems.length} finding(s) that cannot be audited: ` +
        problems.join(' | '),
    );
    this.name = 'UncheckableConsistencyError';
    this.problems = problems;
  }
}

/** Which BrandState sections each dimension is read from. */
const DIMENSION_SOURCES: Record<ConsistencyDimension, string[]> = {
  audience: ['discovery'],
  positioning: ['positioning'],
  personality: ['personality'],
  voice: ['voice'],
  visualDirection: ['visualDirection'],
  // These three live inside other sections but are what a conflict is about.
  messaging: ['selectedStrategy', 'voice'],
  valueProposition: ['positioning'],
  differentiator: ['positioning'],
};

/** Dimensions whose source sections are all populated, so they can be compared. */
export function testableDimensions(state: BrandState): ConsistencyDimension[] {
  return CONSISTENCY_DIMENSIONS.filter((dimension) =>
    DIMENSION_SOURCES[dimension].every((section) =>
      isSectionPopulated(state, section as (typeof SECTION_ORDER)[number]),
    ),
  );
}

/** Sections a dimension needs that are not written yet. */
function missingFor(state: BrandState, dimension: ConsistencyDimension): string[] {
  return DIMENSION_SOURCES[dimension].filter(
    (section) => !isSectionPopulated(state, section as (typeof SECTION_ORDER)[number]),
  );
}

export function validateConsistencyRequest(value: unknown): ConsistencyRequest {
  if (value === null || typeof value !== 'object') {
    throw new ConsistencyInputError('The request body must be an object.');
  }

  const body = value as { brandState?: unknown; scope?: unknown };
  if (body.brandState === null || typeof body.brandState !== 'object') {
    throw new ConsistencyInputError('brandState is required.');
  }

  if (body.scope === undefined) return { brandState: body.brandState as BrandState };

  if (!Array.isArray(body.scope) || body.scope.length === 0) {
    throw new ConsistencyInputError('scope, when given, must be a non-empty array.');
  }

  const unknownNames = body.scope.filter(
    (name) => !CONSISTENCY_DIMENSIONS.includes(name as ConsistencyDimension),
  );
  if (unknownNames.length > 0) {
    throw new ConsistencyInputError(
      `Unknown dimension(s): ${unknownNames.join(', ')}. Valid: ${CONSISTENCY_DIMENSIONS.join(', ')}.`,
    );
  }

  return {
    brandState: body.brandState as BrandState,
    scope: body.scope as ConsistencyDimension[],
  };
}

/**
 * The checks a deterministic pass can make on the returned findings.
 *
 * Whether a conflict is real is a judgement; whether it is *checkable* is not. These
 * go straight into the retry prompt.
 */
export function findUncheckableFindings(
  findings: readonly ConsistencyFinding[],
  scope: readonly ConsistencyDimension[],
): string[] {
  const problems: string[] = [];

  for (const finding of findings) {
    const label = `${finding.category} (${finding.severity})`;

    if (!citesFieldPath(finding.evidence)) {
      problems.push(
        `${label}: evidence "${finding.evidence}" cites no BrandState field path, so the finding cannot be checked`,
      );
    }

    // A conflict needs two sides. One element means a weak decision, not a disagreement.
    if (finding.conflictingElements.length < 2) {
      problems.push(
        `${label}: conflictingElements names ${finding.conflictingElements.length} element, so nothing is in conflict`,
      );
    }

    const outside = finding.conflictingElements.filter((element) => !scope.includes(element));
    if (outside.length > 0) {
      problems.push(
        `${label}: names ${outside.join(', ')}, which was not in the requested scope`,
      );
    }
  }

  return problems;
}

/** Findings still open. A finding with no status set is open. */
export function openConsistencyFindings(
  findings: readonly ConsistencyFinding[],
): ConsistencyFinding[] {
  return findings.filter((finding) => (finding.status ?? 'open') === 'open');
}

/** Counts by severity, plus whether the brand came back genuinely clean. */
export function summarizeConsistency(
  findings: readonly ConsistencyFinding[],
  evaluations: readonly DimensionEvaluation[],
): ConsistencySummary {
  const summary: ConsistencySummary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    clean: false,
  };

  for (const finding of openConsistencyFindings(findings)) summary[finding.severity]++;

  // Clean means "checked and agreed", not merely "nothing reported": a run where every
  // dimension was not-testable found nothing because it looked at nothing.
  summary.clean =
    openConsistencyFindings(findings).length === 0 &&
    evaluations.length > 0 &&
    evaluations.some((evaluation) => evaluation.status === 'evaluated');

  return summary;
}

/**
 * Fills in any dimension the model failed to report on.
 *
 * Silence is not a pass. An unreported dimension is recorded as not-testable with a
 * note saying why it is not being treated as checked.
 */
export function completeDimensionEvaluations(
  reported: readonly DimensionEvaluation[],
  scope: readonly ConsistencyDimension[],
  state: BrandState,
): DimensionEvaluation[] {
  return scope.map((dimension) => {
    const entry = reported.find((evaluation) => evaluation.dimension === dimension);
    if (entry !== undefined) return entry;

    const missing = missingFor(state, dimension);
    return {
      dimension,
      status: 'not-testable' as const,
      note:
        missing.length > 0
          ? `${missing.join(', ')} not written yet`
          : 'the model did not report on this dimension, so it cannot be treated as agreed',
    };
  });
}

/** One line per dimension, so a clean pass is stated rather than implied by silence. */
export function buildConsistencyReports(
  evaluations: readonly DimensionEvaluation[],
  findings: readonly ConsistencyFinding[],
): DimensionReport[] {
  return evaluations.map((evaluation) => {
    const count = findings.filter((finding) =>
      finding.conflictingElements.includes(evaluation.dimension),
    ).length;

    const message =
      evaluation.status === 'not-testable'
        ? `Not checked — ${evaluation.note ?? 'the state it depends on is not there yet'}.`
        : count === 0
          ? evaluation.status === 'partial'
            ? `No conflict found, but only partly checked — ${evaluation.note ?? 'some inputs were missing'}.`
            : 'No conflict found. This part agrees with the rest.'
          : `${count} conflict${count === 1 ? '' : 's'} involve this part.`;

    return { dimension: evaluation.dimension, status: evaluation.status, findingCount: count, message };
  });
}

/**
 * Runs CONSISTENCY.
 *
 * The status is recomputed from the findings rather than taken from the model, so the
 * two cannot disagree: a response claiming `consistent` while listing conflicts is a
 * contradiction, and the findings are the evidence.
 */
export async function checkConsistency(
  deriver: SectionDeriver,
  request: ConsistencyRequest,
  options: ConsistencyOptions = {},
): Promise<{ value: ConsistencyResponse; usage: Usage }> {
  const scope = request.scope ?? [...CONSISTENCY_DIMENSIONS];
  const maxRetries = Math.max(0, options.maxRetries ?? 1);
  const state = request.brandState;

  const basePrompt = buildConsistencyPrompt({
    brandState: serializePopulatedForConsistency(state),
    scope,
    testable: testableDimensions(state),
  });

  let usage = EMPTY_USAGE;
  let prompt = basePrompt;
  let findings: ConsistencyFinding[] = [];
  let evaluations: DimensionEvaluation[] = [];
  let problems: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await deriver.deriveSection('consistency', '', ConsistencySchema, {
      userPrompt: prompt,
    } satisfies DeriveOptions);

    usage = addUsage(usage, result.usage);

    // Findings touching only out-of-scope dimensions are dropped: a scoped re-check
    // must not overwrite decisions recorded against parts it was told to leave alone.
    findings = result.value.findings.filter((finding) =>
      finding.conflictingElements.some((element) => scope.includes(element)),
    );
    evaluations = completeDimensionEvaluations(result.value.dimensionsChecked, scope, state);

    problems = findUncheckableFindings(findings, scope);
    if (problems.length === 0) break;

    prompt = buildConsistencyRetryPrompt(basePrompt, problems);
  }

  if (problems.length > 0) throw new UncheckableConsistencyError(problems);

  const summary = summarizeConsistency(findings, evaluations);

  return {
    value: {
      consistency: {
        // Derived, not trusted: the findings are the evidence for the status.
        status: openConsistencyFindings(findings).length > 0 ? 'issues-found' : 'consistent',
        findings,
        dimensionsChecked: evaluations,
        lastCheckedAt: new Date().toISOString(),
        checkedAgainstVersion: state.schemaVersion,
        ...(state.consistency.notes !== undefined ? { notes: state.consistency.notes } : {}),
      },
      summary,
      reports: buildConsistencyReports(evaluations, findings),
    },
    usage,
  };
}

/** The state as the model sees it, with unpopulated sections left out. */
function serializePopulatedForConsistency(state: BrandState): string {
  const view: Record<string, unknown> = { project: state.project };
  for (const section of SECTION_ORDER) {
    // Its own previous result is not an input: re-checking against the last check
    // would let an earlier verdict justify itself.
    if (section === 'consistency') continue;
    if (isSectionPopulated(state, section)) view[section] = state[section];
  }
  return stableStringify(view, 2);
}

/** Severity ordering, for sorting findings worst-first in a UI. */
export const CONSISTENCY_SEVERITY_ORDER: readonly Severity[] = [
  'critical',
  'high',
  'medium',
  'low',
];
