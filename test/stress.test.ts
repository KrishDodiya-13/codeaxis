import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeriveOptions, SectionDeriver, Usage } from '../src/client.ts';
import { STRESS_INSTRUCTIONS } from '../src/prompts.ts';
import { StressTestSchema } from '../src/schemas.ts';
import { resolveSelectedStrategy } from '../src/state.ts';
import {
  BLOCKING_SEVERITIES,
  FinalizationBlockedError,
  StressTestInputError,
  UnauditableFindingsError,
  acknowledgeFinding,
  blockingFindings,
  canFinalize,
  citesFieldPath,
  findUnauditableFindings,
  missingSections,
  openFindings,
  renderEvaluatedTypes,
  shouldRerunStressTests,
  stressTest,
  summarize,
  validateStressTestRequest,
} from '../src/stress.ts';
import { TEST_TYPES } from '../src/types.ts';
import type { BrandState, StressTest, TestType, TypeEvaluation } from '../src/types.ts';
import { StubDeriver, completeState } from './fixtures.ts';

const usage: Usage = { inputTokens: 10, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 0 };

const allEvaluated: TypeEvaluation[] = TEST_TYPES.map((type) => ({ type, status: 'evaluated' }));

/** A well-formed finding: cites fields, and its impact is a consequence. */
function finding(overrides: Partial<StressTest> = {}): StressTest {
  return {
    type: 'differentiation',
    severity: 'medium',
    issue: 'The differentiator rests on reading the delivery record, which a rival could copy.',
    evidence: 'positioning.differentiator and selectedStrategy.differentiation',
    impact: 'Buyers comparing two tools next year will see no reason to pick this one.',
    recommendation: 'Rewrite positioning.differentiator around the pattern found, not the import.',
    ...overrides,
  };
}

/** A deriver returning scripted results and recording the prompts it was given. */
function scriptedDeriver(results: Array<{ tests: StressTest[]; evaluatedTypes?: TypeEvaluation[] }>) {
  const prompts: string[] = [];
  let index = 0;

  const deriver: SectionDeriver & { prompts: string[] } = {
    prompts,
    async deriveSection<T>(
      _section: string,
      _state: string,
      _schema: unknown,
      options?: DeriveOptions,
    ): Promise<{ value: T; usage: Usage }> {
      prompts.push(options?.userPrompt ?? '');
      const result = results[Math.min(index, results.length - 1)]!;
      index++;
      return {
        value: { tests: result.tests, evaluatedTypes: result.evaluatedTypes ?? allEvaluated } as T,
        usage,
      };
    },
  } as never;

  return deriver;
}

function request(state: BrandState = completeState()) {
  return { selectedStrategy: resolveSelectedStrategy(state)!, brandState: state };
}

describe('the STRESS TEST instructions', () => {
  it('frame the step as adversarial and as the last checkpoint', () => {
    assert.match(STRESS_INSTRUCTIONS, /this one is adversarial/i);
    assert.match(STRESS_INSTRUCTIONS, /last checkpoint/i);
  });

  it('describe all five tests', () => {
    for (const type of TEST_TYPES) {
      assert.match(STRESS_INSTRUCTIONS, new RegExp(`\\*\\*${type}\\*\\*`), type);
    }
  });

  it('carry the cliché test as the ten-homepages question', () => {
    assert.match(STRESS_INSTRUCTIONS, /ten unrelated startups' homepages/i);
    assert.match(STRESS_INSTRUCTIONS, /seamless/);
  });

  it('carry the differentiation test as the straight-face question', () => {
    assert.match(STRESS_INSTRUCTIONS, /with a straight face/i);
  });

  it('require evidence to cite field paths', () => {
    assert.match(STRESS_INSTRUCTIONS, /cannot be verified or fixed/i);
  });

  it('require impact to be a consequence rather than the issue restated', () => {
    assert.match(STRESS_INSTRUCTIONS, /not the issue restated/i);
  });

  it('forbid manufacturing findings, and forbid softening real ones', () => {
    assert.match(STRESS_INSTRUCTIONS, /empty findings list is a valid and good result/i);
    assert.match(STRESS_INSTRUCTIONS, /do not soften a real problem to be agreeable/i);
  });

  it('carry the severity rubric including critical', () => {
    assert.match(STRESS_INSTRUCTIONS, /\*\*critical\*\* — the brand is unusable as-is/i);
  });

  it('say related findings stay separate', () => {
    assert.match(STRESS_INSTRUCTIONS, /Report both/i);
  });

  it('tell it to report fewer findings, not invented ones, on a partial state', () => {
    assert.match(STRESS_INSTRUCTIONS, /never invented ones/i);
  });

  it('rule out fixing, aesthetics, and deciding what is worth fixing', () => {
    assert.match(STRESS_INSTRUCTIONS, /You diagnose; you do not fix/i);
    assert.match(STRESS_INSTRUCTIONS, /design review/i);
    assert.match(STRESS_INSTRUCTIONS, /human call/i);
  });
});

describe('citesFieldPath', () => {
  it('accepts a real field path', () => {
    for (const evidence of [
      'personality.traits',
      'voice.toneAttributes',
      'naming.selectedName',
      'discovery.targetAudience vs selectedStrategy.audienceFit',
      'visualDirection.mood ("calm")',
      'strategyOptions[2].positioning',
      'project.idea',
    ]) {
      assert.equal(citesFieldPath(evidence), true, evidence);
    }
  });

  it('rejects a vague gesture at a section', () => {
    for (const evidence of [
      'the tone feels off',
      'the personality section',
      'the voice',
      'discovery',
      'the positioning and the shape disagree',
    ]) {
      assert.equal(citesFieldPath(evidence), false, evidence);
    }
  });
});

describe('findUnauditableFindings', () => {
  it('passes a well-formed finding', () => {
    assert.deepEqual(findUnauditableFindings([finding()]), []);
  });

  it('flags evidence that cites no field path', () => {
    const problems = findUnauditableFindings([finding({ evidence: 'the tone feels off' })]);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /cites no BrandState field path/);
  });

  it('flags an impact that only restates the issue', () => {
    const issue = 'The differentiator rests on reading the delivery record, which a rival could copy.';
    const problems = findUnauditableFindings([finding({ issue, impact: issue })]);
    assert.ok(problems.some((problem) => /restates the issue/.test(problem)));
  });

  it('allows an impact that shares subject matter with the issue', () => {
    // Sharing words is fine; saying the same thing is not.
    assert.deepEqual(findUnauditableFindings([finding()]), []);
  });

  it('names the finding so the retry knows which one to fix', () => {
    const problems = findUnauditableFindings([
      finding({ type: 'cliché', severity: 'low', evidence: 'nowhere in particular' }),
    ]);
    assert.match(problems[0]!, /^cliché \(low\)/);
  });
});

describe('summarize', () => {
  it('counts by severity', () => {
    const summary = summarize([
      finding({ severity: 'critical' }),
      finding({ severity: 'high' }),
      finding({ severity: 'high' }),
      finding({ severity: 'medium' }),
      finding({ severity: 'low' }),
    ]);

    assert.equal(summary.critical, 1);
    assert.equal(summary.high, 2);
    assert.equal(summary.medium, 1);
    assert.equal(summary.low, 1);
  });

  it('blocks finalization on an open critical or high finding', () => {
    for (const severity of BLOCKING_SEVERITIES) {
      assert.equal(summarize([finding({ severity })]).blocksFinalization, true, severity);
    }
  });

  it('does not block on medium or low', () => {
    assert.equal(summarize([finding({ severity: 'medium' }), finding({ severity: 'low' })]).blocksFinalization, false);
  });

  it('does not block on a finding that was acknowledged or resolved', () => {
    for (const status of ['acknowledged', 'resolved'] as const) {
      assert.equal(summarize([finding({ severity: 'critical', status })]).blocksFinalization, false, status);
    }
  });

  it('still counts an acknowledged finding, because it describes what was found', () => {
    assert.equal(summarize([finding({ severity: 'high', status: 'acknowledged' })]).high, 1);
  });

  it('does not block on an empty findings list', () => {
    assert.equal(summarize([]).blocksFinalization, false);
  });
});

describe('openFindings and blockingFindings', () => {
  it('treats a finding with no status as open', () => {
    assert.equal(openFindings([finding()]).length, 1);
  });

  it('excludes acknowledged and resolved findings', () => {
    const tests = [finding({ status: 'acknowledged' }), finding({ status: 'resolved' }), finding()];
    assert.equal(openFindings(tests).length, 1);
  });

  it('returns only blocking severities that are still open', () => {
    const tests = [
      finding({ severity: 'critical' }),
      finding({ severity: 'high', status: 'acknowledged' }),
      finding({ severity: 'medium' }),
    ];
    assert.deepEqual(blockingFindings(tests).map((f) => f.severity), ['critical']);
  });
});

describe('canFinalize', () => {
  it('is false while the fixture state has an open high finding', () => {
    assert.equal(canFinalize(completeState()), false);
  });

  it('is true once it is acknowledged', () => {
    const state = completeState();
    state.stressTests = state.stressTests.map((f) =>
      f.severity === 'high' ? { ...f, status: 'acknowledged' as const } : f,
    );
    assert.equal(canFinalize(state), true);
  });

  it('is true when no stress test has run — the gate only knows about findings', () => {
    const state = completeState();
    state.stressTests = [];
    assert.equal(canFinalize(state), true);
  });
});

describe('acknowledgeFinding', () => {
  const tests = [finding({ type: 'cliché' }), finding({ type: 'differentiation' })];

  it('marks the matching finding acknowledged by default', () => {
    const updated = acknowledgeFinding(tests, { type: 'cliché' });
    assert.equal(updated[0]!.status, 'acknowledged');
    assert.equal(updated[1]!.status, undefined);
  });

  it('can mark a finding resolved or reopen it', () => {
    assert.equal(acknowledgeFinding(tests, { type: 'cliché' }, 'resolved')[0]!.status, 'resolved');
    assert.equal(acknowledgeFinding(tests, { type: 'cliché' }, 'open')[0]!.status, 'open');
  });

  it('narrows by issue text when several findings share a type', () => {
    const many = [
      finding({ type: 'cliché', issue: 'the mood copy is generic' }),
      finding({ type: 'cliché', issue: 'the personality uses innovative' }),
    ];
    const updated = acknowledgeFinding(many, { type: 'cliché', issue: 'innovative' });

    assert.equal(updated[0]!.status, undefined);
    assert.equal(updated[1]!.status, 'acknowledged');
  });

  it('does not mutate the list it was given', () => {
    acknowledgeFinding(tests, { type: 'cliché' });
    assert.equal(tests[0]!.status, undefined);
  });

  it('throws when nothing matches, rather than silently doing nothing', () => {
    assert.throws(() => acknowledgeFinding(tests, { type: 'messaging' }), StressTestInputError);
    assert.throws(
      () => acknowledgeFinding(tests, { type: 'cliché', issue: 'no such text' }),
      StressTestInputError,
    );
  });
});

describe('validateStressTestRequest', () => {
  it('accepts a state and an explicit strategy', () => {
    const state = completeState();
    const parsed = validateStressTestRequest({
      brandState: state,
      selectedStrategy: resolveSelectedStrategy(state),
    });
    assert.equal(parsed.selectedStrategy.direction, 'TRUST');
  });

  it('falls back to the strategy the state says was chosen', () => {
    const parsed = validateStressTestRequest({ brandState: completeState() });
    assert.equal(parsed.selectedStrategy.direction, 'TRUST');
  });

  it('refuses when no strategy was given and none is chosen', () => {
    const state = completeState();
    delete state.selectedStrategy;

    assert.throws(() => validateStressTestRequest({ brandState: state }), (error: unknown) => {
      assert.ok(error instanceof StressTestInputError);
      assert.match(error.message, /Choose a direction first/);
      return true;
    });
  });

  it('requires a valid brandState', () => {
    for (const body of [{}, { brandState: 'text' }, { brandState: { project: {} } }]) {
      assert.throws(() => validateStressTestRequest(body), StressTestInputError);
    }
  });

  it('rejects a body that is not an object', () => {
    for (const body of [null, 'text', 42]) {
      assert.throws(() => validateStressTestRequest(body), StressTestInputError);
    }
  });

  it('rejects a strategy that is not one', () => {
    assert.throws(
      () => validateStressTestRequest({ brandState: completeState(), selectedStrategy: { direction: 'TRUST' } }),
      /at least a direction and a positioning/,
    );
  });

  it('accepts a scope of test types and de-duplicates it', () => {
    const parsed = validateStressTestRequest({
      brandState: completeState(),
      scope: ['cliché', 'cliché', 'messaging'],
    });
    assert.deepEqual(parsed.scope, ['cliché', 'messaging']);
  });

  it('rejects an unknown test type, listing the real ones', () => {
    assert.throws(
      () => validateStressTestRequest({ brandState: completeState(), scope: ['vibes'] }),
      (error: unknown) => {
        assert.ok(error instanceof StressTestInputError);
        assert.match(error.message, /cliché/);
        return true;
      },
    );
  });

  it('rejects an empty scope rather than silently running everything', () => {
    assert.throws(
      () => validateStressTestRequest({ brandState: completeState(), scope: [] }),
      /Omit it to run all five/,
    );
  });
});

describe('missingSections', () => {
  it('is empty for a complete state', () => {
    assert.deepEqual(missingSections(completeState()), []);
  });

  it('names the sections not derived yet', () => {
    const state = completeState();
    state.personality = { traits: [], antiTraits: [], values: [], rationale: [] };
    state.visualDirection = { colors: [], typography: '', imagery: '', shapes: '', composition: '', visualPersonality: '', mood: '', avoid: [], rationale: [] };

    assert.deepEqual(missingSections(state), ['personality', 'visualDirection']);
  });
});

describe('renderEvaluatedTypes', () => {
  it('renders a plain evaluated status as the bare word', () => {
    assert.deepEqual(renderEvaluatedTypes([{ type: 'cliché', status: 'evaluated' }]), {
      'cliché': 'evaluated',
    });
  });

  it('renders a partial status with its note, as the contract shows', () => {
    assert.deepEqual(
      renderEvaluatedTypes([
        { type: 'contradiction', status: 'partial', note: 'shape/visualDirection incomplete' },
      ]),
      { contradiction: 'partial — shape/visualDirection incomplete' },
    );
  });

  it('renders not-testable', () => {
    assert.deepEqual(renderEvaluatedTypes([{ type: 'messaging', status: 'not-testable' }]), {
      messaging: 'not-testable',
    });
  });
});

describe('stressTest', () => {
  it('returns the findings, a computed summary, and the evaluations', async () => {
    const result = await stressTest(scriptedDeriver([{ tests: [finding({ severity: 'high' })] }]), request());

    assert.equal(result.value.tests.length, 1);
    assert.equal(result.value.summary.high, 1);
    assert.equal(result.value.summary.blocksFinalization, true);
    assert.equal(Object.keys(result.value.evaluatedTypes).length, TEST_TYPES.length);
  });

  it('accepts an empty findings list as a good result', async () => {
    const result = await stressTest(scriptedDeriver([{ tests: [] }]), request());

    assert.deepEqual(result.value.tests, []);
    assert.equal(result.value.summary.blocksFinalization, false);
  });

  it('computes the summary rather than trusting the model for it', async () => {
    // The model is never asked for counts, so they cannot disagree with the findings.
    const result = await stressTest(
      scriptedDeriver([{ tests: [finding({ severity: 'critical' }), finding({ severity: 'low' })] }]),
      request(),
    );

    assert.equal(result.value.summary.critical, 1);
    assert.equal(result.value.summary.low, 1);
  });

  it('sends the chosen strategy and the state separately', async () => {
    const deriver = scriptedDeriver([{ tests: [] }]);
    await stressTest(deriver, request());

    const prompt = deriver.prompts[0]!;
    assert.match(prompt, /<selected_strategy>/);
    assert.match(prompt, /<brand_state>/);
    // The rejected candidates are not sent, so they cannot be tested by mistake.
    assert.doesNotMatch(prompt, /strategyOptions/);
  });

  it('lists the tests it is asking for', async () => {
    const deriver = scriptedDeriver([{ tests: [] }]);
    await stressTest(deriver, request());

    for (const type of TEST_TYPES) {
      assert.ok(deriver.prompts[0]!.includes(type), type);
    }
  });

  it('honours a narrowed scope, and drops findings outside it', async () => {
    const deriver = scriptedDeriver([
      { tests: [finding({ type: 'cliché' }), finding({ type: 'messaging' })] },
    ]);

    const result = await stressTest(deriver, { ...request(), scope: ['cliché'] });

    assert.deepEqual(result.value.tests.map((f) => f.type), ['cliché']);
    assert.deepEqual(Object.keys(result.value.evaluatedTypes), ['cliché']);
  });

  it('tells the model which sections are missing, so it does not invent findings', async () => {
    const state = completeState();
    state.visualDirection = { colors: [], typography: '', imagery: '', shapes: '', composition: '', visualPersonality: '', mood: '', avoid: [], rationale: [] };

    const deriver = scriptedDeriver([{ tests: [] }]);
    await stressTest(deriver, request(state));

    assert.match(deriver.prompts[0]!, /have not been derived yet: visualDirection/);
    assert.match(deriver.prompts[0]!, /Do not invent findings against them/);
  });

  it('records an unreported test type as not-testable rather than as a pass', async () => {
    const result = await stressTest(
      scriptedDeriver([{ tests: [], evaluatedTypes: [{ type: 'cliché', status: 'evaluated' }] }]),
      request(),
    );

    assert.equal(result.value.evaluatedTypes['cliché'], 'evaluated');
    assert.match(result.value.evaluatedTypes.messaging!, /not-testable/);
    assert.match(result.value.evaluatedTypes.messaging!, /did not report/);
  });

  it('retries when a finding cites no field path, quoting the problem back', async () => {
    const deriver = scriptedDeriver([
      { tests: [finding({ evidence: 'the tone feels off' })] },
      { tests: [finding()] },
    ]);

    const result = await stressTest(deriver, request());

    assert.equal(deriver.prompts.length, 2);
    assert.match(deriver.prompts[1]!, /cites no BrandState field path/);
    assert.match(deriver.prompts[1]!, /Do not drop a finding to avoid fixing it/);
    assert.equal(result.value.tests.length, 1);
  });

  it('fails rather than returning findings that cannot be audited', async () => {
    const bad = { tests: [finding({ evidence: 'somewhere in the brand' })] };
    const deriver = scriptedDeriver([bad, bad]);

    await assert.rejects(() => stressTest(deriver, request()), (error: unknown) => {
      assert.ok(error instanceof UnauditableFindingsError);
      assert.match(error.problems[0]!, /cites no BrandState field path/);
      return true;
    });
  });

  it('honours a retry budget of zero', async () => {
    const deriver = scriptedDeriver([{ tests: [finding({ evidence: 'nowhere' })] }]);

    await assert.rejects(
      () => stressTest(deriver, request(), { maxRetries: 0 }),
      UnauditableFindingsError,
    );
    assert.equal(deriver.prompts.length, 1);
  });

  it('accumulates usage across the retry', async () => {
    const deriver = scriptedDeriver([
      { tests: [finding({ evidence: 'nowhere' })] },
      { tests: [finding()] },
    ]);
    const result = await stressTest(deriver, request());

    assert.equal(result.usage.inputTokens, 20);
  });

  it('returns findings that validate against the BrandState schema', async () => {
    const result = await stressTest(scriptedDeriver([{ tests: [finding()] }]), request());
    for (const test of result.value.tests) {
      assert.ok(StressTestSchema.safeParse(test).success);
    }
  });
});

describe('shouldRerunStressTests', () => {
  const before = completeState();

  it('recommends nothing when nothing changed', () => {
    assert.deepEqual(shouldRerunStressTests(before, completeState()), []);
  });

  it('recommends every test when the chosen strategy changes', () => {
    const after = completeState();
    after.selectedStrategy = { direction: 'CONNECTION', chosenAt: '2026-01-01T00:00:00.000Z' };

    assert.deepEqual(shouldRerunStressTests(before, after), [...TEST_TYPES]);
  });

  it('recommends only contradiction when the visual direction changes', () => {
    const after = completeState();
    after.visualDirection = { ...after.visualDirection, mood: 'something else entirely' };

    assert.deepEqual(shouldRerunStressTests(before, after), ['contradiction']);
  });

  it('recommends the language and consistency tests when personality changes', () => {
    const after = completeState();
    after.personality = { ...after.personality, traits: ['warm', 'friendly', 'approachable'] };

    assert.deepEqual(shouldRerunStressTests(before, after), [
      'cliché',
      'audienceMismatch',
      'contradiction',
    ]);
  });

  it('recommends the language tests when voice changes', () => {
    const after = completeState();
    after.voice = { ...after.voice, toneAttributes: ['breezy'] };

    assert.deepEqual(shouldRerunStressTests(before, after), ['cliché', 'contradiction', 'messaging']);
  });

  it('recommends the audience and claim tests when discovery changes', () => {
    const after = completeState();
    after.discovery = { ...after.discovery, targetAudience: 'a different audience' };

    assert.deepEqual(shouldRerunStressTests(before, after), [
      'audienceMismatch',
      'differentiation',
      'contradiction',
      'messaging',
    ]);
  });

  it('returns the types in the canonical order, so the scope is stable', () => {
    const after = completeState();
    after.discovery = { ...after.discovery, problem: 'changed' };
    after.positioning = { ...after.positioning, category: 'changed' };

    const scope = shouldRerunStressTests(before, after);
    assert.deepEqual(scope, TEST_TYPES.filter((type) => scope.includes(type)));
  });
});

describe('the finalization gate in the pipeline', () => {
  it('refuses to finalize while a blocking finding is open', async () => {
    const { runStep } = await import('../src/steps.ts');

    await assert.rejects(
      () => runStep(new StubDeriver(), completeState(), 'finalBrand'),
      (error: unknown) => {
        assert.ok(error instanceof FinalizationBlockedError);
        assert.equal(error.blocking.length, 1);
        assert.match(error.message, /acknowledge them as accepted trade-offs/);
        return true;
      },
    );
  });

  it('finalizes once the blocking finding is acknowledged', async () => {
    const { runStep } = await import('../src/steps.ts');
    const state = completeState();
    state.stressTests = acknowledgeFinding(state.stressTests, { type: 'contradiction' });

    const result = await runStep(new StubDeriver(), state, 'finalBrand');
    assert.ok(result.state.finalBrand);
  });

  it('does not call the model when it refuses', async () => {
    const { runStep } = await import('../src/steps.ts');
    const deriver = new StubDeriver();

    await assert.rejects(() => runStep(deriver, completeState(), 'finalBrand'));
    assert.equal(deriver.calls.length, 0);
  });
});

describe('the pipeline stressTests step', () => {
  it('stores the findings and nothing derived from them', async () => {
    const { runStep } = await import('../src/steps.ts');
    const state = completeState();
    state.stressTests = [];

    const result = await runStep(new StubDeriver(), state, 'stressTests');

    assert.ok(result.state.stressTests.length > 0);
    for (const test of result.state.stressTests) {
      assert.ok(StressTestSchema.safeParse(test).success);
    }
  });

  it('tests the chosen strategy, not the alternatives', async () => {
    const { runStep } = await import('../src/steps.ts');
    const state = completeState();
    state.stressTests = [];

    const deriver = new StubDeriver();
    await runStep(deriver, state, 'stressTests');

    assert.match(deriver.calls[0]!.userPrompt!, /<selected_strategy>/);
    assert.match(deriver.calls[0]!.userPrompt!, /TRUST/);
  });
});
