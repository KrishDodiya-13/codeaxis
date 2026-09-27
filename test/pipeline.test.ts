import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isComplete, rollbackTo, runPipeline, runPipelineFromProject } from '../src/pipeline.ts';
import { SECTION_ORDER, applyDelta, createInitialState, isSectionPopulated, populatedSections, validateState } from '../src/state.ts';
import {
  MissingDependencyError,
  StrategySelectionRequiredError,
  missingDependencies,
  runStep,
} from '../src/steps.ts';
import { selectStrategy } from '../src/battle.ts';
import { FinalizationBlockedError, acknowledgeFinding, blockingFindings } from '../src/stress.ts';
import type { SectionDeriver } from '../src/client.ts';
import type { BrandState } from '../src/types.ts';
import { StubDeriver, completeState, project, sectionFixtures } from './fixtures.ts';

/**
 * Runs the whole pipeline, making the choice a human would make at the checkpoint.
 *
 * The pipeline refuses to choose a direction on its own, so an end-to-end test has
 * to stand in for the person — which is the behaviour being relied on, not a
 * workaround for it.
 */
async function runWithSelection(
  deriver: SectionDeriver,
  initial: BrandState,
  direction = 'TRUST',
) {
  // Decision 1: which direction. The pipeline refuses to make it.
  const first = await runPipeline(deriver, initial, { until: 'strategyOptions' });
  const chosen: BrandState = {
    ...first.state,
    selectedStrategy: selectStrategy(first.state.strategyOptions, direction),
  };

  // Decision 2: what to do about the blocking stress-test findings. The pipeline
  // refuses to finalize while any are open, so a run to completion needs a person
  // to have either fixed or accepted them.
  const middle = await runPipeline(deriver, chosen, { until: 'consistency' });
  let accepted: BrandState = middle.state;
  for (const finding of blockingFindings(accepted.stressTests)) {
    accepted = {
      ...accepted,
      stressTests: acknowledgeFinding(accepted.stressTests, {
        type: finding.type,
        issue: finding.issue,
      }),
    };
  }

  const last = await runPipeline(deriver, accepted);
  const passes = [first, middle, last];

  return {
    state: last.state,
    // Steps skipped on a later pass because an earlier one did them are dropped,
    // except selectedStrategy, which the human did rather than the pipeline.
    steps: [
      ...first.steps,
      ...middle.steps.filter((step) => step.skipped !== true || step.section === 'selectedStrategy'),
      ...last.steps.filter((step) => step.skipped !== true),
    ],
    snapshots: passes.flatMap((pass) => pass.snapshots),
    usage: passes.reduce(
      (total, pass) => ({
        inputTokens: total.inputTokens + pass.usage.inputTokens,
        outputTokens: total.outputTokens + pass.usage.outputTokens,
        cacheCreationTokens: total.cacheCreationTokens + pass.usage.cacheCreationTokens,
        cacheReadTokens: total.cacheReadTokens + pass.usage.cacheReadTokens,
      }),
      { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
    ),
  };
}

describe('runStep', () => {
  it('writes the section it was asked for and nothing else', async () => {
    const deriver = new StubDeriver();
    const before = createInitialState(project);
    const { state } = await runStep(deriver, before, 'discovery');

    assert.equal(state.discovery.problem, sectionFixtures.discovery.problem);
    assert.deepEqual(populatedSections(state), ['discovery']);
  });

  it('stores the stress-test findings as the section, dropping the derived summary', async () => {
    const deriver = new StubDeriver();
    const state = completeState();
    state.stressTests = [];

    const result = await runStep(deriver, state, 'stressTests');

    assert.ok(Array.isArray(result.state.stressTests));
    assert.equal(result.state.stressTests.length, sectionFixtures.stressTests.length);
    // The summary and the evaluation notes are recomputed, never persisted.
    assert.equal((result.state as Record<string, unknown>).summary, undefined);
    assert.equal((result.state as Record<string, unknown>).evaluatedTypes, undefined);
  });

  it('refuses to run before its dependencies are derived', async () => {
    const deriver = new StubDeriver();
    await assert.rejects(
      () => runStep(deriver, createInitialState(project), 'positioning'),
      (error: unknown) => {
        assert.ok(error instanceof MissingDependencyError);
        assert.deepEqual(error.missing, ['discovery']);
        return true;
      },
    );
  });

  it('sends the whole state derived so far to the model', async () => {
    const deriver = new StubDeriver();
    let state = createInitialState(project);
    state = (await runStep(deriver, state, 'discovery')).state;
    state = (await runStep(deriver, state, 'positioning')).state;
    state = (await runStep(deriver, state, 'strategyOptions')).state;
    state = { ...state, selectedStrategy: selectStrategy(state.strategyOptions, 'TRUST') };
    state = (await runStep(deriver, state, 'shape')).state;

    // shape is a plain section step, so it receives the serialized state.
    const shapeCall = deriver.calls[3]!;
    assert.match(shapeCall.serializedState, /discovery/);
    assert.match(shapeCall.serializedState, /positioning/);
    assert.match(shapeCall.serializedState, /project/);
    // Sections not yet derived are not sent, so the model cannot fill them in.
    assert.doesNotMatch(shapeCall.serializedState, /visualDirection/);
  });

  it('gives discovery and positioning their own purpose-built prompts', async () => {
    const deriver = new StubDeriver();
    let state = createInitialState(project);
    state = (await runStep(deriver, state, 'discovery')).state;
    await runStep(deriver, state, 'positioning');

    // Both go through their endpoint's flow, which sends a tailored user turn
    // rather than the generic serialized state.
    assert.match(deriver.calls[0]!.userPrompt!, /<idea>/);
    assert.match(deriver.calls[1]!.userPrompt!, /<discovery>/);
    assert.equal(deriver.calls[1]!.serializedState, '');
  });
});

describe('missingDependencies', () => {
  it('finds nothing missing for the first step', () => {
    assert.deepEqual(missingDependencies(createInitialState(project), 'discovery'), []);
  });

  it('lists every unmet dependency for a late step', () => {
    const missing = missingDependencies(createInitialState(project), 'finalBrand');
    assert.deepEqual(missing, [
      'selectedStrategy',
      'shape',
      'visualDirection',
      'stressTests',
      'consistency',
    ]);
  });
});

describe('runPipeline', () => {
  it('halts at strategy selection rather than choosing for the user', async () => {
    const deriver = new StubDeriver();

    await assert.rejects(
      () => runPipelineFromProject(deriver, project),
      (error: unknown) => {
        assert.ok(error instanceof StrategySelectionRequiredError);
        assert.deepEqual(error.directions, ['CONNECTION', 'COMPETITION', 'TRUST']);
        return true;
      },
    );

    // It got as far as generating the options, and no further.
    assert.deepEqual(deriver.calls.map((call) => call.section), [
      'discovery',
      'positioning',
      'strategyOptions',
    ]);
  });

  it('derives every section in order and produces a valid state', async () => {
    const deriver = new StubDeriver();
    const result = await runWithSelection(deriver, createInitialState(project));

    assert.deepEqual(
      result.steps.map((step) => step.section),
      [...SECTION_ORDER],
    );
    assert.ok(isComplete(result.state));
    assert.deepEqual(validateState(result.state), { valid: true });
  });

  it('never asks the model to choose a strategy', async () => {
    const deriver = new StubDeriver();
    await runWithSelection(deriver, createInitialState(project));

    assert.equal(
      deriver.calls.some((call) => call.section === 'selectedStrategy'),
      false,
    );
  });

  it('accumulates usage across steps', async () => {
    const result = await runWithSelection(new StubDeriver(), createInitialState(project));

    // Every section except selectedStrategy costs one model call.
    const modelSteps = SECTION_ORDER.length - 1;
    assert.equal(result.usage.inputTokens, 100 * modelSteps);
    assert.equal(result.usage.cacheReadTokens, 80 * modelSteps);
  });

  it('keeps a snapshot from before each step', async () => {
    const result = await runWithSelection(new StubDeriver(), createInitialState(project));

    // The snapshot taken before a step must not contain that step's output.
    for (const snapshot of result.snapshots) {
      assert.equal(isSectionPopulated(snapshot.state, snapshot.section), false);
    }
  });

  it('stops after the section named by until', async () => {
    const result = await runPipelineFromProject(new StubDeriver(), project, { until: 'positioning' });

    assert.deepEqual(populatedSections(result.state), ['discovery', 'positioning']);
    assert.equal(isComplete(result.state), false);
  });

  it('skips already-derived sections when resuming', async () => {
    const deriver = new StubDeriver();
    const partial = applyDelta(createInitialState(project), 'discovery', sectionFixtures.discovery);
    const result = await runPipeline(deriver, partial, { until: 'positioning' });

    assert.deepEqual(deriver.calls.map((call) => call.section), ['positioning']);
    assert.equal(result.steps.find((step) => step.section === 'discovery')?.skipped, true);
  });

  it('re-derives everything when resume is off', async () => {
    const deriver = new StubDeriver();
    const partial = applyDelta(createInitialState(project), 'discovery', sectionFixtures.discovery);
    await runPipeline(deriver, partial, { until: 'positioning', resume: false });

    assert.deepEqual(deriver.calls.map((call) => call.section), ['discovery', 'positioning']);
  });

  it('does not mutate the state it was given', async () => {
    const initial = createInitialState(project);
    await runPipeline(new StubDeriver(), initial, { until: 'discovery' });
    assert.equal(initial.discovery.problem, '');
  });

  it('reports progress through the event hooks', async () => {
    const started: string[] = [];
    const finished: string[] = [];
    await runPipelineFromProject(new StubDeriver(), project, {
      until: 'positioning',
      onStepStart: (section) => started.push(section),
      onStepFinish: (record) => finished.push(record.section),
    });

    assert.deepEqual(started, ['discovery', 'positioning']);
    assert.deepEqual(finished, ['discovery', 'positioning']);
  });

  it('propagates a step failure by default', async () => {
    const deriver = new StubDeriver();
    deriver.deriveSection = async () => {
      throw new Error('the model was unreachable');
    };

    await assert.rejects(
      () => runPipelineFromProject(deriver, project),
      /the model was unreachable/,
    );
  });

  it('continues past a failure when onStepError says to', async () => {
    const deriver = new StubDeriver();
    const original = deriver.deriveSection.bind(deriver);
    deriver.deriveSection = async (section, serialized, schema) => {
      if (section === 'discovery') throw new Error('transient failure');
      return original(section, serialized, schema);
    };

    const seen: string[] = [];
    const result = await runPipeline(deriver, createInitialState(project), {
      until: 'discovery',
      onStepError: (section) => {
        seen.push(section);
        return true;
      },
    });

    assert.deepEqual(seen, ['discovery']);
    assert.equal(isSectionPopulated(result.state, 'discovery'), false);
  });
});

describe('rollbackTo', () => {
  it('discards the named section and everything after it', () => {
    const rolled = rollbackTo(completeState(), 'visualDirection');

    assert.deepEqual(populatedSections(rolled), [
      'discovery',
      'positioning',
      'strategyOptions',
      'selectedStrategy',
      'shape',
    ]);
    assert.equal(rolled.finalBrand, undefined);
  });

  it('discards the selection when rolling back to it, so it is chosen again', () => {
    const rolled = rollbackTo(completeState(), 'selectedStrategy');

    assert.equal(rolled.selectedStrategy, undefined);
    // The options survive: they are what the next choice gets made from.
    assert.equal(rolled.strategyOptions.length, 3);
    assert.deepEqual(populatedSections(rolled), ['discovery', 'positioning', 'strategyOptions']);
  });

  it('leaves the earlier decisions untouched', () => {
    const before = completeState();
    const rolled = rollbackTo(before, 'visualDirection');

    assert.deepEqual(rolled.discovery, before.discovery);
    assert.deepEqual(rolled.positioning, before.positioning);
    assert.deepEqual(rolled.shape, before.shape);
    assert.deepEqual(rolled.project, before.project);
  });

  it('produces a state the pipeline will resume from the right point', async () => {
    const deriver = new StubDeriver();
    const rolled = rollbackTo(completeState(), 'visualDirection');

    // It stops at the finalization gate, because the stress test it just re-ran
    // reported a high-severity finding that nobody has dealt with yet.
    await assert.rejects(() => runPipeline(deriver, rolled), FinalizationBlockedError);

    assert.deepEqual(
      deriver.calls.map((call) => call.section),
      ['visualDirection', 'stressTests', 'consistency'],
    );
  });

  it('stops again at selection when the choice itself was rolled back', async () => {
    const rolled = rollbackTo(completeState(), 'selectedStrategy');

    await assert.rejects(
      () => runPipeline(new StubDeriver(), rolled),
      StrategySelectionRequiredError,
    );
  });

  it('rolling back to discovery empties everything derived', () => {
    const rolled = rollbackTo(completeState(), 'discovery');
    assert.deepEqual(populatedSections(rolled), []);
    assert.equal(rolled.project.idea, project.idea);
  });

  it('rejects an unknown section', () => {
    assert.throws(() => rollbackTo(completeState(), 'nope' as never), /Unknown section/);
  });

  it('does not mutate the state it was given', () => {
    const before = completeState();
    rollbackTo(before, 'discovery');
    assert.ok(isComplete(before));
  });
});
