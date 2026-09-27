/**
 * The consistency engine.
 *
 * Run against a stub deriver, so nothing here needs a credential or a network call. What
 * these check is the part a prompt cannot guarantee: that the status is derived from the
 * findings, that uncheckable evidence is refused rather than rendered, that a clean run
 * is reported explicitly, and that nothing outside `consistency` is ever written.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONSISTENCY_DIMENSIONS,
  ConsistencyInputError,
  UncheckableConsistencyError,
  buildConsistencyReports,
  checkConsistency,
  completeDimensionEvaluations,
  findUncheckableFindings,
  summarizeConsistency,
  testableDimensions,
  validateConsistencyRequest,
} from '../src/index.ts';
import { ConsistencySchema } from '../src/schemas.ts';
import { createInitialState } from '../src/state.ts';
import { CONSISTENCY_CATEGORIES } from '../src/types.ts';
import type {
  ConsistencyDimension,
  ConsistencyFinding,
  DimensionEvaluation,
} from '../src/types.ts';
import { completeState, project } from './fixtures.ts';

/** A finding with everything the contract promises, overridable per test. */
function finding(overrides: Partial<ConsistencyFinding> = {}): ConsistencyFinding {
  return {
    category: 'toneMismatch',
    severity: 'medium',
    conflictingElements: ['personality', 'voice'],
    evidence: 'personality.traits says exacting while voice.tone reads as warm.',
    explanation: 'A precise promise delivered soothingly reads as hedging.',
    recommendedCorrection: 'Move voice.tone toward plain and precise; voice is the later decision.',
    ...overrides,
  };
}

const allEvaluated: DimensionEvaluation[] = CONSISTENCY_DIMENSIONS.map((dimension) => ({
  dimension,
  status: 'evaluated' as const,
}));

/** A deriver that returns one canned payload. */
function stub(payload: { findings: ConsistencyFinding[]; dimensionsChecked: DimensionEvaluation[] }) {
  const prompts: string[] = [];
  const deriver = {
    deriveSection: async (_section: unknown, _state: unknown, _schema: unknown, options?: any) => {
      prompts.push(options?.userPrompt ?? '');
      return {
        value: { status: 'consistent', ...payload },
        usage: { inputTokens: 10, outputTokens: 10, cacheCreationTokens: 0, cacheReadTokens: 0 },
      };
    },
  };
  return { deriver: deriver as any, prompts };
}

describe('the consistency contract covers what the phase promises', () => {
  it('compares the eight named parts of the brand', () => {
    assert.deepEqual([...CONSISTENCY_DIMENSIONS], [
      'audience',
      'positioning',
      'personality',
      'voice',
      'visualDirection',
      'messaging',
      'valueProposition',
      'differentiator',
    ]);
  });

  it('detects the six named kinds of disagreement', () => {
    assert.deepEqual([...CONSISTENCY_CATEGORIES], [
      'contradiction',
      'weakAlignment',
      'unclearPositioning',
      'toneMismatch',
      'visualStrategicConflict',
      'messagingInconsistency',
    ]);
  });

  it('requires all six fields on every finding, so none arrives half-formed', () => {
    for (const field of [
      'category',
      'severity',
      'conflictingElements',
      'evidence',
      'explanation',
      'recommendedCorrection',
    ] as const) {
      const incomplete: Record<string, unknown> = { ...finding() };
      delete incomplete[field];
      const parsed = ConsistencySchema.safeParse({
        status: 'issues-found',
        findings: [incomplete],
        dimensionsChecked: allEvaluated,
      });
      assert.equal(parsed.success, false, `${field} should be required`);
    }
  });
});

describe('evidence must come from the actual BrandState', () => {
  it('rejects a finding whose evidence cites no field path', () => {
    const problems = findUncheckableFindings(
      [finding({ evidence: 'the tone feels inconsistent with the brand' })],
      [...CONSISTENCY_DIMENSIONS],
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /cites no BrandState field path/);
  });

  it('rejects invented external evidence, however plausible it reads', () => {
    for (const evidence of [
      'industry benchmarks show warm tones convert better',
      'competitors in this category all use precise language',
      '72% of buyers expect a consistent tone',
    ]) {
      const problems = findUncheckableFindings([finding({ evidence })], [...CONSISTENCY_DIMENSIONS]);
      assert.ok(problems.length > 0, evidence);
    }
  });

  it('accepts evidence that cites real paths', () => {
    assert.deepEqual(findUncheckableFindings([finding()], [...CONSISTENCY_DIMENSIONS]), []);
  });

  it('rejects a finding that names only one element, which is not a conflict', () => {
    const problems = findUncheckableFindings(
      [finding({ conflictingElements: ['voice'] })],
      [...CONSISTENCY_DIMENSIONS],
    );
    assert.ok(problems.some((p) => /nothing is in conflict/.test(p)));
  });

  it('throws rather than returning findings it could not audit', async () => {
    const { deriver } = stub({
      findings: [finding({ evidence: 'it just feels off' })],
      dimensionsChecked: allEvaluated,
    });

    await assert.rejects(
      () => checkConsistency(deriver, { brandState: completeState() }, { maxRetries: 1 }),
      UncheckableConsistencyError,
    );
  });

  it('re-asks with the problems named before giving up', async () => {
    const { deriver, prompts } = stub({
      findings: [finding({ evidence: 'it just feels off' })],
      dimensionsChecked: allEvaluated,
    });

    await assert.rejects(() =>
      checkConsistency(deriver, { brandState: completeState() }, { maxRetries: 1 }),
    );

    assert.equal(prompts.length, 2, 'should retry once');
    assert.match(prompts[1]!, /do not meet the bar/);
    assert.match(prompts[1]!, /cites no BrandState field path/);
  });
});

describe('the status is derived from the findings, never taken from the model', () => {
  it('reports issues-found when there are open findings, whatever the model said', async () => {
    const { deriver } = stub({ findings: [finding()], dimensionsChecked: allEvaluated });
    const result = await checkConsistency(deriver, { brandState: completeState() });

    // The stub claims 'consistent'; the findings say otherwise and they are the evidence.
    assert.equal(result.value.consistency.status, 'issues-found');
  });

  it('returns an explicit clean result when the parts genuinely agree', async () => {
    const { deriver } = stub({ findings: [], dimensionsChecked: allEvaluated });
    const result = await checkConsistency(deriver, { brandState: completeState() });

    assert.equal(result.value.consistency.status, 'consistent');
    assert.deepEqual(result.value.consistency.findings, []);
    assert.equal(result.value.summary.clean, true);
    // Every dimension says so in its own words, so a pass is stated not implied.
    assert.equal(result.value.reports.length, CONSISTENCY_DIMENSIONS.length);
    for (const report of result.value.reports) {
      assert.match(report.message, /No conflict found/);
    }
  });

  it('does not call nothing-found "clean" when nothing could be checked', () => {
    const summary = summarizeConsistency(
      [],
      CONSISTENCY_DIMENSIONS.map((dimension) => ({ dimension, status: 'not-testable' as const })),
    );
    assert.equal(summary.clean, false);
  });

  it('counts only open findings, so an accepted trade-off stops inflating severity', () => {
    const summary = summarizeConsistency(
      [
        finding({ severity: 'high' }),
        finding({ severity: 'critical', status: 'resolved' }),
        finding({ severity: 'critical', status: 'acknowledged' }),
      ],
      allEvaluated,
    );
    assert.equal(summary.high, 1);
    assert.equal(summary.critical, 0);
  });
});

describe('a dimension that could not be compared is not a pass', () => {
  it('records an unreported dimension as not-testable rather than silently fine', () => {
    const evaluations = completeDimensionEvaluations([], [...CONSISTENCY_DIMENSIONS], completeState());
    assert.equal(evaluations.length, CONSISTENCY_DIMENSIONS.length);
    for (const evaluation of evaluations) {
      assert.equal(evaluation.status, 'not-testable');
      assert.match(evaluation.note ?? '', /did not report|not written yet/);
    }
  });

  it('names the missing section on a fresh project, so the reason is visible', () => {
    const fresh = createInitialState(project);
    const evaluations = completeDimensionEvaluations([], ['personality', 'voice'], fresh);
    assert.deepEqual(
      evaluations.map((e) => e.status),
      ['not-testable', 'not-testable'],
    );
    assert.match(evaluations[0]!.note ?? '', /personality not written yet/);
  });

  it('reports which dimensions are comparable on a fresh project', () => {
    assert.deepEqual(testableDimensions(createInitialState(project)), []);
  });

  it('reports every dimension comparable on a complete state', () => {
    assert.deepEqual(testableDimensions(completeState()), [...CONSISTENCY_DIMENSIONS]);
  });

  it('distinguishes "checked and clean" from "could not check" in the report text', () => {
    const reports = buildConsistencyReports(
      [
        { dimension: 'voice', status: 'evaluated' },
        { dimension: 'personality', status: 'not-testable', note: 'personality not written yet' },
      ],
      [],
    );
    assert.match(reports[0]!.message, /No conflict found/);
    assert.match(reports[1]!.message, /Not checked/);
  });
});

describe('a scoped run leaves the parts it was not asked about alone', () => {
  it('drops findings that involve no in-scope dimension', async () => {
    const { deriver } = stub({
      findings: [finding({ conflictingElements: ['visualDirection', 'messaging'] })],
      dimensionsChecked: [{ dimension: 'personality', status: 'evaluated' }],
    });

    const result = await checkConsistency(deriver, {
      brandState: completeState(),
      scope: ['personality', 'voice'],
    });

    assert.deepEqual(result.value.consistency.findings, []);
    assert.deepEqual(
      result.value.consistency.dimensionsChecked.map((d) => d.dimension),
      ['personality', 'voice'],
    );
  });

  it('rejects an unknown dimension instead of silently ignoring it', () => {
    assert.throws(
      () => validateConsistencyRequest({ brandState: {}, scope: ['tagline'] }),
      ConsistencyInputError,
    );
  });

  it('rejects an empty scope, which would otherwise mean "check nothing"', () => {
    assert.throws(
      () => validateConsistencyRequest({ brandState: {}, scope: [] }),
      ConsistencyInputError,
    );
  });

  it('accepts a request with no scope as "compare everything"', () => {
    const request = validateConsistencyRequest({ brandState: completeState() });
    assert.equal(request.scope, undefined);
  });
});

describe('recommendations never overwrite an approved decision', () => {
  it('writes only the consistency section, leaving every other decision untouched', async () => {
    const before = completeState();
    const { deriver } = stub({
      findings: [
        finding({
          recommendedCorrection: 'Move voice.tone toward plain and precise.',
          conflictingElements: ['personality', 'voice'],
        }),
      ],
      dimensionsChecked: allEvaluated,
    });

    const result = await checkConsistency(deriver, { brandState: before });

    // The correction proposes changing voice. The engine must not have changed it.
    assert.deepEqual(result.value.consistency.findings.length, 1);
    assert.deepEqual(before.voice, completeState().voice, 'voice must be untouched');
    assert.deepEqual(
      before.personality,
      completeState().personality,
      'personality must be untouched',
    );
  });

  it('leaves a returned finding open, so accepting it stays a human act', async () => {
    const { deriver } = stub({ findings: [finding()], dimensionsChecked: allEvaluated });
    const result = await checkConsistency(deriver, { brandState: completeState() });
    assert.equal(result.value.consistency.findings[0]!.status, undefined);
  });

  it('stamps when the check ran and what it ran against', async () => {
    const state = completeState();
    const { deriver } = stub({ findings: [], dimensionsChecked: allEvaluated });
    const result = await checkConsistency(deriver, { brandState: state });

    assert.equal(result.value.consistency.checkedAgainstVersion, state.schemaVersion);
    assert.ok(
      !Number.isNaN(Date.parse(result.value.consistency.lastCheckedAt ?? '')),
      'lastCheckedAt should be an ISO timestamp',
    );
  });
});

describe('the prompt sends the state and nothing invented', () => {
  it('sends the brand state and names the dimensions to compare', async () => {
    const { deriver, prompts } = stub({ findings: [], dimensionsChecked: allEvaluated });
    await checkConsistency(deriver, { brandState: completeState() });

    assert.match(prompts[0]!, /<brand_state>/);
    for (const dimension of CONSISTENCY_DIMENSIONS) {
      assert.ok(prompts[0]!.includes(dimension), `prompt should name ${dimension}`);
    }
  });

  it('does not feed the previous consistency result back in', async () => {
    const state = completeState();
    const { deriver, prompts } = stub({ findings: [], dimensionsChecked: allEvaluated });
    await checkConsistency(deriver, { brandState: state });

    // Its own last verdict is not evidence for the next one.
    assert.ok(!prompts[0]!.includes('"consistency"'));
  });

  it('tells the model which parts cannot be compared yet', async () => {
    const { deriver, prompts } = stub({ findings: [], dimensionsChecked: [] });
    await checkConsistency(deriver, { brandState: createInitialState(project) });

    assert.match(prompts[0]!, /cannot be compared yet/);
    assert.match(prompts[0]!, /not-testable/);
  });
});
