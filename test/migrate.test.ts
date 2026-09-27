import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { migrateState, needsMigration } from '../src/migrate.ts';
import { SCHEMA_VERSION, parseBrandState } from '../src/schemas.ts';
import { createInitialState } from '../src/state.ts';
import { completeState, project } from './fixtures.ts';

/** A state shaped the way Phase 4/5 code wrote it: `shape`, old consistency, no metadata. */
function preContractState(): Record<string, any> {
  return {
    project: { idea: 'A quiet CRM for solo therapists' },
    discovery: {
      problem: 'p',
      targetAudience: 'a',
      userNeed: 'n',
      goals: [],
      constraints: [],
      assumptions: [],
      openQuestions: [],
    },
    positioning: {
      category: 'c',
      valueProposition: 'v',
      differentiator: 'd',
      competitiveAngle: 'ca',
      rationale: ['r'],
    },
    shape: {
      personality: ['Exacting', 'Plain-spoken'],
      principles: ['Never ask twice'],
      namingTerritories: [
        { name: 'Repetition', rationale: 'names the pattern', examples: ['Cadence', 'Throughline'] },
      ],
      taglineDirections: [
        { tagline: 'The work you already repeat.', rationale: 'x', personalityFit: [] },
      ],
      messagingHierarchy: [
        { level: 'hero', message: 'Turn repeated work into a product.', audience: 'owners' },
      ],
    },
    visualDirection: {
      colors: ['Ink #12141A'],
      typography: 't',
      imagery: 'i',
      shapes: 's',
      mood: 'm',
      avoid: ['a'],
    },
    strategyOptions: [],
    stressTests: [],
    consistency: {
      coherent: false,
      issues: [
        { sections: ['shape', 'positioning'], conflict: 'tone', severity: 'high', resolution: 'fix it' },
      ],
      strengths: ['visuals agree'],
    },
  };
}

describe('needsMigration', () => {
  it('detects a state carrying the retired shape branch', () => {
    assert.equal(needsMigration(preContractState()), true);
  });

  it('detects a state with no schemaVersion', () => {
    assert.equal(needsMigration({ project: { idea: 'x' } }), true);
  });

  it('detects the old consistency shape', () => {
    assert.equal(
      needsMigration({ schemaVersion: '1.0.0', consistency: { coherent: true, issues: [], strengths: [] } }),
      true,
    );
  });

  it('leaves a current state alone', () => {
    assert.equal(needsMigration(completeState()), false);
    assert.equal(needsMigration(createInitialState(project)), false);
  });

  it('is false for a value that is not an object', () => {
    for (const value of [null, 'text', 42, undefined]) {
      assert.equal(needsMigration(value), false);
    }
  });
});

describe('migrateState', () => {
  it('produces a state that satisfies the current contract', () => {
    const { state } = migrateState(preContractState());
    assert.ok(parseBrandState(state));
    assert.equal(state.schemaVersion, SCHEMA_VERSION);
  });

  it('is idempotent — the result needs no further migration', () => {
    const { state } = migrateState(preContractState());
    assert.equal(needsMigration(state), false);
  });

  it('moves shape.personality and shape.principles into personality', () => {
    const { state } = migrateState(preContractState());
    assert.deepEqual(state.personality.traits, ['Exacting', 'Plain-spoken']);
    assert.deepEqual(state.personality.values, ['Never ask twice']);
  });

  it('moves the naming territories and their examples into naming', () => {
    const { state } = migrateState(preContractState());
    assert.deepEqual(state.naming.territories, ['Repetition (names the pattern)']);
    assert.deepEqual(state.naming.candidates.map((c) => c.name), ['Cadence', 'Throughline']);
    assert.equal(state.naming.candidates[0]!.territory, 'Repetition');
  });

  it('moves the tagline directions into naming.tagline.candidates', () => {
    const { state } = migrateState(preContractState());
    assert.deepEqual(state.naming.tagline.candidates, ['The work you already repeat.']);
  });

  it('folds the old messaging layers into voice.messagingHierarchy', () => {
    const { state } = migrateState(preContractState());
    assert.equal(
      state.voice.messagingHierarchy.primaryMessage,
      'Turn repeated work into a product.',
    );
    assert.deepEqual(state.voice.messagingHierarchy.supportingMessages, []);
  });

  it('leaves fields the old shape had no equivalent for empty, rather than inventing them', () => {
    const { state } = migrateState(preContractState());

    assert.deepEqual(state.personality.antiTraits, []);
    assert.deepEqual(state.personality.rationale, []);
    assert.deepEqual(state.voice.toneAttributes, []);
    assert.deepEqual(state.voice.writingPrinciples, []);
    assert.deepEqual(state.voice.avoid, []);
    // And the candidates carry no invented pros or cons.
    assert.deepEqual(state.naming.candidates[0]!.pros, []);
    assert.deepEqual(state.naming.candidates[0]!.cons, []);
  });

  it('reports everything it moved and everything it could not carry across', () => {
    const { notes } = migrateState(preContractState());

    assert.ok(notes.some((note) => /shape.personality/.test(note)));
    assert.ok(notes.some((note) => /had no equivalent in shape and are empty/.test(note)));
    assert.ok(notes.some((note) => /no pros or cons/.test(note)));
  });

  it('turns the old consistency into a status, keeping the issues as notes', () => {
    const { state } = migrateState(preContractState());

    assert.equal(state.consistency.status, 'issues-found');
    assert.ok(state.consistency.notes!.some((note) => /tone/.test(note)));
    // Strengths survive too, rather than being dropped on the way across.
    assert.ok(state.consistency.notes!.some((note) => /visuals agree/.test(note)));
  });

  it('reads an old consistency with nothing recorded as not-yet-checked', () => {
    const input = preContractState();
    input.consistency = { coherent: false, issues: [], strengths: [] };

    const { state } = migrateState(input);
    assert.equal(state.consistency.status, 'not-yet-checked');
  });

  it('reads a coherent old consistency as consistent', () => {
    const input = preContractState();
    input.consistency = { coherent: true, issues: [], strengths: ['all good'] };

    const { state } = migrateState(input);
    assert.equal(state.consistency.status, 'consistent');
  });

  it('generates an id and timestamps when the stored state had none', () => {
    const { state, notes } = migrateState(preContractState());

    assert.equal(typeof state.id, 'string');
    assert.ok(state.id.length > 0);
    assert.ok(!Number.isNaN(Date.parse(state.createdAt)));
    assert.ok(notes.some((note) => /an id was generated/.test(note)));
  });

  it('keeps an existing id and createdAt', () => {
    const input = preContractState();
    input.id = 'kept-id';
    input.createdAt = '2026-01-01T00:00:00.000Z';

    const { state } = migrateState(input);
    assert.equal(state.id, 'kept-id');
    assert.equal(state.createdAt, '2026-01-01T00:00:00.000Z');
  });

  it('reports the version it came from', () => {
    assert.equal(migrateState(preContractState()).from, 'pre-1.0.0');
  });

  it('survives a state with no shape branch at all', () => {
    const input = preContractState();
    delete input.shape;

    const { state } = migrateState(input);
    assert.deepEqual(state.personality.traits, []);
    assert.deepEqual(state.naming.candidates, []);
  });

  it('survives malformed old data rather than throwing', () => {
    const input = preContractState();
    input.shape = { personality: 'not an array', namingTerritories: [{ name: 42 }] };

    const { state } = migrateState(input);
    assert.deepEqual(state.personality.traits, []);
    assert.deepEqual(state.naming.territories, []);
  });

  it('does not clobber branches that are already on the new contract', () => {
    const input = preContractState();
    input.personality = {
      traits: ['a', 'b', 'c'],
      antiTraits: ['x'],
      values: ['y'],
      rationale: ['z'],
    };

    const { state } = migrateState(input);
    assert.deepEqual(state.personality.traits, ['a', 'b', 'c']);
  });

  it('refuses a value that is not an object', () => {
    assert.throws(() => migrateState('text'), TypeError);
    assert.throws(() => migrateState(null), TypeError);
  });
});
