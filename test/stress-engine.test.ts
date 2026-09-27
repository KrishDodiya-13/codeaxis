/**
 * The stress-test engine's contract.
 *
 * Phase 5's suite covers the mechanics. This one covers what the engine promises as a
 * product: that every finding carries all seven fields, that a pass is stated rather than
 * implied, that evidence is traceable to the actual state, and that the analysis is a
 * function of the state rather than of the idea.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeriveOptions, SectionDeriver, Usage } from '../src/client.ts';
import { buildBrandDna } from '../src/dna.ts';
import { STRESS_INSTRUCTIONS } from '../src/prompts.ts';
import {
  StressTestFindingSchema,
  StressTestResultSchema,
  StressTestSchema,
} from '../src/schemas.ts';
import { applyDelta } from '../src/state.ts';
import {
  buildReports,
  citesFieldPath,
  findUnauditableFindings,
  stressTest,
  summarize,
} from '../src/stress.ts';
import { DECISION_NAMES, TEST_TYPES } from '../src/types.ts';
import type { BrandState, StressTest, TypeEvaluation } from '../src/types.ts';
import { completeState, sectionFixtures } from './fixtures.ts';

const usage: Usage = { inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0 };

const allEvaluated: TypeEvaluation[] = TEST_TYPES.map((type) => ({ type, status: 'evaluated' }));

/** A complete finding, as the engine now requires one. */
function finding(overrides: Partial<StressTest> = {}): StressTest {
  return {
    type: 'differentiation',
    severity: 'medium',
    issue: 'The differentiator rests on reading the delivery record, which a rival could copy.',
    evidence: 'positioning.differentiator and selectedStrategy.differentiation',
    impact: 'Buyers comparing two tools next year will see no reason to pick this one.',
    recommendation: 'Rewrite positioning.differentiator around the pattern found, not the import.',
    alternative:
      'Keep the claim and move defensibility onto the record a customer has already accumulated.',
    affectedDecision: 'differentiator',
    ...overrides,
  };
}

/** A deriver returning a scripted result and recording the prompt it was given. */
function scripted(result: { tests: StressTest[]; evaluatedTypes?: TypeEvaluation[] }) {
  const prompts: string[] = [];
  const deriver: SectionDeriver & { prompts: string[] } = {
    prompts,
    async deriveSection<T>(
      _section: string,
      _state: string,
      schema: { parse(v: unknown): unknown },
      options?: DeriveOptions,
    ): Promise<{ value: T; usage: Usage }> {
      prompts.push(options?.userPrompt ?? '');
      // Parsed through the real schema, so a scripted value that would not validate fails
      // the test rather than slipping through.
      return {
        value: schema.parse({
          tests: result.tests,
          evaluatedTypes: result.evaluatedTypes ?? allEvaluated,
        }) as T,
        usage,
      };
    },
  } as never;
  return deriver;
}

function request(state: BrandState = completeState()) {
  return { selectedStrategy: state.strategyOptions[2]!, brandState: state };
}

describe('every finding carries all seven fields', () => {
  it('requires them of a new finding', () => {
    assert.deepEqual(Object.keys(StressTestFindingSchema.shape).sort(), [
      'affectedDecision',
      'alternative',
      'evidence',
      'impact',
      'issue',
      'recommendation',
      'severity',
      'status',
      'type',
    ]);
  });

  it('rejects a finding with no alternative or no affected decision', () => {
    for (const field of ['alternative', 'affectedDecision'] as const) {
      const partial = { ...finding() };
      delete partial[field];
      assert.equal(
        StressTestFindingSchema.safeParse(partial).success,
        false,
        `${field} should be required`,
      );
    }
  });

  it('accepts a stored finding that predates the two new fields', () => {
    // A legacy finding is still readable; rejecting a whole stored state over it would be
    // worse than reading it.
    const legacy = { ...finding() };
    delete legacy.alternative;
    delete legacy.affectedDecision;

    assert.ok(StressTestSchema.safeParse(legacy).success);
  });

  it('points affectedDecision at a real Brand DNA node', () => {
    // The whole point of the enum: a finding names a node the UI can highlight.
    const dnaFields = Object.keys(buildBrandDna(completeState())).filter((k) => k !== 'provenance');
    assert.deepEqual([...DECISION_NAMES].sort(), dnaFields.sort());
  });

  it('rejects an affectedDecision that is not a decision', () => {
    assert.equal(
      StressTestFindingSchema.safeParse({ ...finding(), affectedDecision: 'colours' }).success,
      false,
    );
  });

  it('keeps the alternative distinct from the recommendation in the fixtures', () => {
    for (const f of sectionFixtures.stressTests) {
      assert.notEqual(f.alternative, f.recommendation);
      assert.ok((f.alternative ?? '').length > 0, f.type);
      assert.ok(DECISION_NAMES.includes(f.affectedDecision!), `${f.type}: ${f.affectedDecision}`);
    }
  });
});

describe('a pass is stated, not implied', () => {
  it('reports pass for a test that ran and found nothing', () => {
    const reports = buildReports(allEvaluated, []);

    assert.equal(reports.length, TEST_TYPES.length);
    assert.ok(reports.every((r) => r.outcome === 'pass'));
    assert.ok(reports.every((r) => r.findings === 0));
  });

  it('reports issues-found only for the types that produced findings', () => {
    const reports = buildReports(allEvaluated, [finding({ type: 'cliché' })]);
    const byType = new Map(reports.map((r) => [r.type, r]));

    assert.equal(byType.get('cliché')!.outcome, 'issues-found');
    assert.equal(byType.get('cliché')!.findings, 1);
    assert.equal(byType.get('messaging')!.outcome, 'pass');
  });

  it('distinguishes not-testable from pass', () => {
    const evaluations: TypeEvaluation[] = [
      { type: 'contradiction', status: 'not-testable', note: 'visualDirection is empty' },
      { type: 'cliché', status: 'evaluated' },
    ];
    const reports = buildReports(evaluations, []);

    assert.equal(reports[0]!.outcome, 'not-testable');
    assert.equal(reports[0]!.note, 'visualDirection is empty');
    assert.equal(reports[1]!.outcome, 'pass');
  });

  it('reports partial when the test only half ran and found nothing', () => {
    const reports = buildReports([{ type: 'contradiction', status: 'partial' }], []);
    assert.equal(reports[0]!.outcome, 'partial');
  });

  it('counts findings itself rather than trusting the model', () => {
    // The model claims everything evaluated cleanly; the findings say otherwise, and the
    // derived count wins.
    const reports = buildReports(allEvaluated, [
      finding({ type: 'cliché' }),
      finding({ type: 'cliché' }),
    ]);
    assert.equal(reports.find((r) => r.type === 'cliché')!.findings, 2);
  });

  it('is returned by the engine alongside the findings', async () => {
    const result = await stressTest(scripted({ tests: [] }), request());

    assert.equal(result.value.reports.length, TEST_TYPES.length);
    assert.ok(result.value.reports.every((r) => r.outcome === 'pass'));
    assert.deepEqual(result.value.tests, []);
    assert.equal(result.value.summary.blocksFinalization, false);
  });
});

describe('the engine challenges rather than praises', () => {
  it('says so in the instructions', () => {
    assert.match(STRESS_INSTRUCTIONS, /challenge the strategy, not to validate it/i);
    assert.match(STRESS_INSTRUCTIONS, /is not a careful stress test; it is a broken one/i);
  });

  it('forbids a token finding invented to fill a test', () => {
    assert.match(STRESS_INSTRUCTIONS, /Do not invent a token low-severity finding/i);
  });

  it('requires the alternative to be a real second route', () => {
    assert.match(STRESS_INSTRUCTIONS, /not the recommendation reworded/i);
  });

  it('lists the decision names for affectedDecision', () => {
    for (const name of ['valueProposition', 'namingDirection', 'selectedStrategy']) {
      assert.ok(STRESS_INSTRUCTIONS.includes(name), name);
    }
  });

  it('forbids inventing competitors, statistics or research', () => {
    assert.match(STRESS_INSTRUCTIONS, /never invented ones/i);
    assert.match(STRESS_INSTRUCTIONS, /cannot be verified or fixed/i);
  });
});

describe('evidence must come from the actual BrandState', () => {
  it('accepts a citation of a real field path', () => {
    for (const evidence of [
      'personality.traits',
      'discovery.targetAudience vs selectedStrategy.audienceFit',
      'strategyOptions[2].positioning',
      'visualDirection.visualPersonality',
    ]) {
      assert.equal(citesFieldPath(evidence), true, evidence);
    }
  });

  it('rejects evidence that names no field, however plausible it reads', () => {
    for (const evidence of [
      'competitors in this space all claim the same thing',
      'industry research shows students prefer verified profiles',
      '68% of agencies abandon productisation',
      'the tone feels off',
    ]) {
      assert.equal(citesFieldPath(evidence), false, evidence);
    }
  });

  it('flags a finding whose evidence cites nothing, so it cannot be returned', () => {
    const problems = findUnauditableFindings([
      finding({ evidence: 'most competitors already do this' }),
    ]);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /cites no BrandState field path/);
  });

  it('passes the whole state to the model, so evidence has something to cite', async () => {
    const deriver = scripted({ tests: [] });
    await stressTest(deriver, request());

    const prompt = deriver.prompts[0]!;
    for (const section of ['discovery', 'positioning', 'personality', 'naming', 'voice']) {
      assert.ok(prompt.includes(section), `${section} was not sent`);
    }
  });
});

describe('severity stays meaningful', () => {
  it('only blocks finalization on critical or high', () => {
    assert.equal(summarize([finding({ severity: 'critical' })]).blocksFinalization, true);
    assert.equal(summarize([finding({ severity: 'high' })]).blocksFinalization, true);
    assert.equal(summarize([finding({ severity: 'medium' })]).blocksFinalization, false);
    assert.equal(summarize([finding({ severity: 'low' })]).blocksFinalization, false);
  });

  it('carries the rubric in the schema, where the model reads it', () => {
    const description = StressTestFindingSchema.shape.severity.description ?? '';
    for (const level of ['critical', 'high', 'medium', 'low']) {
      assert.ok(description.includes(level), level);
    }
    assert.match(description, /not by how important you want the finding to sound/);
  });

  it('rejects a severity outside the four levels', () => {
    assert.equal(
      StressTestFindingSchema.safeParse({ ...finding(), severity: 'blocker' }).success,
      false,
    );
  });
});

describe('the analysis follows the BrandState, not the idea', () => {
  it('sends a different prompt when the strategy changes', async () => {
    const trust = scripted({ tests: [] });
    await stressTest(trust, request());

    const state = completeState();
    const connection = scripted({ tests: [] });
    await stressTest(connection, {
      selectedStrategy: state.strategyOptions[0]!,
      brandState: state,
    });

    assert.notEqual(trust.prompts[0], connection.prompts[0]);
    assert.ok(trust.prompts[0]!.includes('TRUST'));
    assert.ok(connection.prompts[0]!.includes('CONNECTION'));
  });

  it('sends a different prompt when the personality changes', async () => {
    const before = scripted({ tests: [] });
    await stressTest(before, request());

    const edited = applyDelta(completeState(), 'personality', {
      traits: ['Warm', 'Encouraging', 'Playful'],
      antiTraits: ['Clinical'],
      values: ['Make the first step easy'],
      rationale: ['Edited for this test'],
    });
    const after = scripted({ tests: [] });
    await stressTest(after, request(edited));

    assert.notEqual(before.prompts[0], after.prompts[0]);
    assert.ok(after.prompts[0]!.includes('Encouraging'));
  });

  it('tells the model which sections are missing, so it does not invent findings', async () => {
    const thin = completeState();
    thin.voice = {
      toneAttributes: [],
      writingPrinciples: [],
      avoid: [],
      messagingHierarchy: { primaryMessage: '', supportingMessages: [] },
    };

    const deriver = scripted({ tests: [] });
    await stressTest(deriver, request(thin));

    assert.match(deriver.prompts[0]!, /have not been derived yet: voice/);
    assert.match(deriver.prompts[0]!, /Do not invent findings against them/);
  });

  it('drops findings outside a narrowed scope, so a re-run cannot overwrite other decisions', async () => {
    const deriver = scripted({
      tests: [finding({ type: 'cliché' }), finding({ type: 'messaging' })],
    });

    const result = await stressTest(deriver, { ...request(), scope: ['cliché'] });

    assert.deepEqual(result.value.tests.map((f) => f.type), ['cliché']);
    assert.deepEqual(result.value.reports.map((r) => r.type), ['cliché']);
  });

  it('validates the scripted findings against the real schema', () => {
    const ok = StressTestResultSchema.safeParse({
      tests: [finding()],
      evaluatedTypes: allEvaluated,
    });
    assert.ok(ok.success, ok.success ? '' : ok.error.message);
  });
});
