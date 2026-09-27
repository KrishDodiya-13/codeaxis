/**
 * Foundation guarantees.
 *
 * These are not feature tests. They assert the properties every AI stage depends on:
 * that model output is validated strictly rather than quietly trimmed, that a stored
 * state cannot lose fields on a round trip, that the section registry stays in step
 * with the pipeline, and that cross-section inconsistency is caught. Each one existed
 * as an unchecked assumption before, and each is cheap to break by accident.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BrandStateFileSchema,
  BrandStateSchema,
  DiscoverResultSchema,
  PositionResultSchema,
  SCHEMA_VERSION,
  parseBrandState,
  sectionSchemas,
} from '../src/schemas.ts';
import { SECTION_ORDER, createInitialState, stableStringify, validateState } from '../src/state.ts';
import { STEPS } from '../src/steps.ts';
import { TEST_TYPES } from '../src/types.ts';
import { completeState, discoverResult, positionResult, project } from './fixtures.ts';

describe('model output is validated strictly', () => {
  it('rejects a field the model was not asked for', () => {
    // A field we did not request is either a hallucination or contract drift. Dropping
    // it silently means never finding out.
    const result = DiscoverResultSchema.safeParse({ ...discoverResult, confidence: 'high' });
    assert.equal(result.success, false);
  });

  it('names the unexpected field, so the cause is visible', () => {
    const result = DiscoverResultSchema.safeParse({ ...discoverResult, confidence: 'high' });
    assert.ok(!result.success);
    assert.match(JSON.stringify(result.error.issues), /confidence/);
  });

  it('rejects unknown keys nested inside an object', () => {
    // Zod strictness is not recursive, so nested objects are wrapped individually.
    // This is the case that would otherwise slip through.
    const bad = {
      ...positionResult,
      categoryCheck: { ...positionResult.categoryCheck, madeUp: true },
    };
    assert.equal(PositionResultSchema.safeParse(bad).success, false);
  });

  it('applies to every section schema', () => {
    for (const section of SECTION_ORDER) {
      const schema = sectionSchemas[section];
      const value = completeState()[section];
      if (value === undefined || Array.isArray(value) || typeof value !== 'object') continue;

      const polluted = { ...(value as Record<string, unknown>), unexpectedKey: 1 };
      assert.equal(
        schema.safeParse(polluted).success,
        false,
        `${section} accepted an unknown key`,
      );
    }
  });
});

describe('a stored state survives a round trip without losing data', () => {
  it('rejects an unrecognised field instead of silently dropping it', () => {
    // Silently dropping means the next save destroys it. A loud error is what calls
    // for a schemaVersion bump and a migration.
    const polluted = { ...completeState(), experimentalBranch: { a: 1 } };
    assert.throws(() => parseBrandState(polluted));
  });

  it('round-trips a complete state byte-identically', () => {
    const state = completeState();
    assert.equal(stableStringify(parseBrandState(state)), stableStringify(state));
  });

  it('round-trips a freshly created state byte-identically', () => {
    const state = createInitialState(project);
    assert.equal(stableStringify(parseBrandState(state)), stableStringify(state));
  });

  it('requires the metadata the contract added', () => {
    for (const field of ['id', 'schemaVersion', 'createdAt', 'updatedAt'] as const) {
      const state = completeState() as Record<string, unknown>;
      delete state[field];
      assert.throws(() => parseBrandState(state), `${field} was not required`);
    }
  });

  it('stamps the current schema version on a new state', () => {
    assert.equal(createInitialState(project).schemaVersion, SCHEMA_VERSION);
  });
});

describe('the section registry stays in step with the pipeline', () => {
  it('has a schema for every section, and no extras', () => {
    assert.deepEqual(Object.keys(sectionSchemas).sort(), [...SECTION_ORDER].sort());
  });

  it('has a step for every section, and no extras', () => {
    assert.deepEqual(Object.keys(STEPS).sort(), [...SECTION_ORDER].sort());
  });

  it('gives every step a label and a section that matches its key', () => {
    for (const section of SECTION_ORDER) {
      assert.equal(STEPS[section].section, section);
      assert.ok(STEPS[section].label.length > 0, section);
    }
  });

  it('only lets a step depend on sections that come before it', () => {
    // A forward dependency would deadlock the pipeline: the step could never run.
    for (const [index, section] of SECTION_ORDER.entries()) {
      for (const dependency of STEPS[section].dependsOn) {
        assert.ok(
          SECTION_ORDER.indexOf(dependency) < index,
          `${section} depends on ${dependency}, which is not earlier in the order`,
        );
      }
    }
  });

  it('keeps the strict and structural state schemas on the same fields', () => {
    assert.deepEqual(
      Object.keys(BrandStateSchema.shape).sort(),
      Object.keys(BrandStateFileSchema.shape).sort(),
    );
  });

  it('exposes the five stress-test types the contract names', () => {
    assert.deepEqual([...TEST_TYPES], [
      'cliché',
      'audienceMismatch',
      'differentiation',
      'contradiction',
      'messaging',
    ]);
  });
});

describe('validateState catches cross-section inconsistency', () => {
  it('accepts a coherent complete state', () => {
    assert.deepEqual(validateState(completeState()), { valid: true });
  });

  it('catches a selection pointing at a direction that is not on offer', () => {
    // Both sections are individually schema-valid, so a per-section check cannot see
    // this — and every downstream step reads the resolved strategy.
    const state = completeState();
    state.strategyOptions = state.strategyOptions.filter((o) => o.direction !== 'TRUST');

    const result = validateState(state);
    assert.ok(result.valid === false);
    assert.equal(result.errors[0]!.section, 'selectedStrategy');
    assert.match(result.errors[0]!.message, /cannot be resolved/);
  });

  it('does not complain when nothing has been selected', () => {
    const state = completeState();
    delete state.selectedStrategy;
    assert.deepEqual(validateState(state), { valid: true });
  });
});
