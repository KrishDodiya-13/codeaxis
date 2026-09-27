import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SECTION_ORDER,
  applyDelta,
  createInitialState,
  diffStates,
  isSectionPopulated,
  nextSection,
  populatedSections,
  serializeForPrompt,
  stableStringify,
  validateState,
} from '../src/state.ts';
import { completeState, project, sectionFixtures } from './fixtures.ts';

describe('createInitialState', () => {
  it('seeds project and leaves every derived section empty', () => {
    const state = createInitialState(project);
    assert.equal(state.project.idea, project.idea);
    assert.deepEqual(populatedSections(state), []);
    assert.equal(nextSection(state), 'discovery');
  });

  it('copies the project rather than holding a reference to it', () => {
    const seed = { ...project };
    const state = createInitialState(seed);
    seed.idea = 'mutated';
    assert.notEqual(state.project.idea, 'mutated');
  });
});

describe('applyDelta', () => {
  it('writes one section and leaves the rest alone', () => {
    const before = createInitialState(project);
    const after = applyDelta(before, 'discovery', sectionFixtures.discovery);

    assert.equal(after.discovery.problem, sectionFixtures.discovery.problem);
    assert.deepEqual(after.positioning, before.positioning);
  });

  it('does not mutate the input state', () => {
    const before = createInitialState(project);
    applyDelta(before, 'discovery', sectionFixtures.discovery);
    assert.equal(before.discovery.problem, '');
  });

  it('deep-copies the value, so later mutation cannot reach into the state', () => {
    const value = structuredClone(sectionFixtures.discovery);
    const after = applyDelta(createInitialState(project), 'discovery', value);
    value.goals.push('added afterwards');
    assert.equal(after.discovery.goals.length, sectionFixtures.discovery.goals.length);
  });
});

describe('isSectionPopulated', () => {
  it('reads an empty default as not yet derived', () => {
    const state = createInitialState(project);
    for (const section of SECTION_ORDER) {
      assert.equal(isSectionPopulated(state, section), false, section);
    }
  });

  it('reads every section of a complete state as derived', () => {
    const state = completeState();
    for (const section of SECTION_ORDER) {
      assert.equal(isSectionPopulated(state, section), true, section);
    }
  });

  it('treats a completed consistency check as derived, even with no notes', () => {
    const state = applyDelta(createInitialState(project), 'consistency', { status: 'consistent' });
    assert.equal(isSectionPopulated(state, 'consistency'), true);
  });

  it('treats the initial not-yet-checked consistency as not derived', () => {
    assert.equal(isSectionPopulated(createInitialState(project), 'consistency'), false);
  });
});

describe('nextSection', () => {
  it('walks the pipeline in order', () => {
    let state = createInitialState(project);
    const visited: string[] = [];

    for (const section of SECTION_ORDER) {
      visited.push(nextSection(state)!);
      state = applyDelta(state, section, sectionFixtures[section] as never);
    }

    assert.deepEqual(visited, [...SECTION_ORDER]);
    assert.equal(nextSection(state), undefined);
  });
});

describe('validateState', () => {
  it('accepts a complete state', () => {
    assert.deepEqual(validateState(completeState()), { valid: true });
  });

  it('accepts a partial state, skipping sections not yet derived', () => {
    const state = applyDelta(createInitialState(project), 'discovery', sectionFixtures.discovery);
    assert.deepEqual(validateState(state), { valid: true });
  });

  it('reports the offending section and field', () => {
    const state = completeState();
    state.positioning.rationale = [];

    const result = validateState(state);
    assert.ok(result.valid === false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0]!.section, 'positioning');
    assert.match(result.errors[0]!.message, /rationale/);
  });

  it('skips a section that was emptied, rather than reporting it as invalid', () => {
    // Emptying the field isSectionPopulated keys on makes the section read as
    // not yet derived, so it is out of scope for validation.
    const state = completeState();
    state.positioning.category = '';

    assert.deepEqual(validateState(state), { valid: true });
  });
});

describe('diffStates', () => {
  it('marks a newly derived section as added and the rest unchanged', () => {
    const before = createInitialState(project);
    const after = applyDelta(before, 'discovery', sectionFixtures.discovery);
    const diff = new Map(diffStates(before, after).map((d) => [d.section, d.status]));

    assert.equal(diff.get('discovery'), 'added');
    assert.equal(diff.get('positioning'), 'unchanged');
    assert.equal(diff.get('project'), 'unchanged');
  });

  it('marks an edited section as changed', () => {
    const before = completeState();
    const after = structuredClone(before);
    after.positioning.category = 'Something else entirely';

    const diff = new Map(diffStates(before, after).map((d) => [d.section, d.status]));
    assert.equal(diff.get('positioning'), 'changed');
    assert.equal(diff.get('discovery'), 'unchanged');
  });

  it('marks a discarded section as removed', () => {
    const before = completeState();
    const after = structuredClone(before);
    delete after.finalBrand;

    const diff = new Map(diffStates(before, after).map((d) => [d.section, d.status]));
    assert.equal(diff.get('finalBrand'), 'removed');
  });

  it('reports no change between a state and its own copy', () => {
    const state = completeState();
    const statuses = diffStates(state, structuredClone(state)).map((d) => d.status);
    assert.deepEqual(new Set(statuses), new Set(['unchanged']));
  });
});

describe('stableStringify', () => {
  it('serializes key-shuffled objects identically', () => {
    assert.equal(stableStringify({ a: 1, b: 2 }), stableStringify({ b: 2, a: 1 }));
  });

  it('sorts nested keys too, so prompt caching is not broken by key order', () => {
    const one = { outer: { z: [{ b: 1, a: 2 }] } };
    const two = { outer: { z: [{ a: 2, b: 1 }] } };
    assert.equal(stableStringify(one), stableStringify(two));
  });

  it('drops undefined values rather than emitting them', () => {
    assert.equal(stableStringify({ a: 1, b: undefined }), '{"a":1}');
  });
});

describe('serializeForPrompt', () => {
  it('omits sections not yet derived', () => {
    const state = applyDelta(createInitialState(project), 'discovery', sectionFixtures.discovery);
    const parsed = JSON.parse(serializeForPrompt(state)) as Record<string, unknown>;

    assert.deepEqual(Object.keys(parsed).sort(), ['discovery', 'project']);
  });

  it('includes every section of a complete state, with the selection resolved', () => {
    const parsed = JSON.parse(serializeForPrompt(completeState())) as Record<string, unknown>;

    // strategyOptions is replaced by the resolved selection once a direction has
    // been chosen, so a later step cannot develop one that was not picked.
    const expected = [...SECTION_ORDER].filter((section) => section !== 'strategyOptions');
    assert.deepEqual(Object.keys(parsed).sort(), ['project', ...expected].sort());
  });

  it('sends the candidates while no direction has been chosen', () => {
    const state = completeState();
    delete state.selectedStrategy;

    const parsed = JSON.parse(serializeForPrompt(state)) as Record<string, unknown>;
    assert.ok(Array.isArray(parsed.strategyOptions));
    assert.equal(parsed.selectedStrategy, undefined);
  });

  it('resolves the chosen strategy in full and hides the rejected ones', () => {
    const parsed = JSON.parse(serializeForPrompt(completeState())) as {
      selectedStrategy: { direction: string; strategy: { direction: string } };
      strategyOptions?: unknown;
    };

    assert.equal(parsed.strategyOptions, undefined);
    assert.equal(parsed.selectedStrategy.direction, 'TRUST');
    assert.equal(parsed.selectedStrategy.strategy.direction, 'TRUST');
  });

  it('is byte-stable across calls', () => {
    const state = completeState();
    assert.equal(serializeForPrompt(state), serializeForPrompt(structuredClone(state)));
  });
});
