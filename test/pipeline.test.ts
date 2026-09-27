import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isComplete, rollbackTo, runPipeline, runPipelineFromProject } from '../src/pipeline.ts';
import { SECTION_ORDER, applyDelta, createInitialState, isSectionPopulated, populatedSections, validateState } from '../src/state.ts';
import { MissingDependencyError, missingDependencies, runStep } from '../src/steps.ts';
import { StubDeriver, completeState, project, sectionFixtures } from './fixtures.ts';

describe('runStep', () => {
  it('writes the section it was asked for and nothing else', async () => {
    const deriver = new StubDeriver();
    const before = createInitialState(project);
    const { state } = await runStep(deriver, before, 'discovery');

    assert.equal(state.discovery.problem, sectionFixtures.discovery.problem);
    assert.deepEqual(populatedSections(state), ['discovery']);
  });

  it('unwraps the stressTests array from its schema wrapper', async () => {
    const deriver = new StubDeriver();
    let state = completeState();
    state.stressTests = [];

    const result = await runStep(deriver, state, 'stressTests');
    assert.ok(Array.isArray(result.state.stressTests));
    assert.equal(result.state.stressTests.length, sectionFixtures.stressTests.length);
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

    const positioningCall = deriver.calls[1]!;
    assert.match(positioningCall.serializedState, /discovery/);
    assert.match(positioningCall.serializedState, /project/);
    // Sections not yet derived are not sent, so the model cannot fill them in.
    assert.doesNotMatch(positioningCall.serializedState, /visualDirection/);
  });
});

describe('missingDependencies', () => {
  it('finds nothing missing for the first step', () => {
    assert.deepEqual(missingDependencies(createInitialState(project), 'discovery'), []);
  });

  it('lists every unmet dependency for a late step', () => {
    const missing = missingDependencies(createInitialState(project), 'finalBrand');
    assert.deepEqual(missing, ['selectedStrategy', 'visualDirection', 'consistency']);
  });
});

describe('runPipeline', () => {
  it('derives every section in order and produces a valid state', async () => {
    const deriver = new StubDeriver();
    const result = await runPipelineFromProject(deriver, project);

    assert.deepEqual(
      result.steps.map((step) => step.section),
      [...SECTION_ORDER],
    );
    assert.deepEqual(deriver.calls.map((call) => call.section), [...SECTION_ORDER]);
    assert.ok(isComplete(result.state));
    assert.deepEqual(validateState(result.state), { valid: true });
  });

  it('accumulates usage across steps', async () => {
    const result = await runPipelineFromProject(new StubDeriver(), project);
    assert.equal(result.usage.inputTokens, 100 * SECTION_ORDER.length);
    assert.equal(result.usage.cacheReadTokens, 80 * SECTION_ORDER.length);
  });

  it('keeps a snapshot from before each step', async () => {
    const result = await runPipelineFromProject(new StubDeriver(), project);

    assert.equal(result.snapshots.length, SECTION_ORDER.length);
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

    assert.deepEqual(populatedSections(rolled), ['discovery', 'positioning', 'shape']);
    assert.equal(rolled.selectedStrategy, undefined);
    assert.equal(rolled.finalBrand, undefined);
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
    const rolled = rollbackTo(completeState(), 'selectedStrategy');
    await runPipeline(deriver, rolled);

    assert.deepEqual(
      deriver.calls.map((call) => call.section),
      ['selectedStrategy', 'stressTests', 'consistency', 'finalBrand'],
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
