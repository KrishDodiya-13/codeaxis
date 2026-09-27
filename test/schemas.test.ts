import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import {
  BrandStateFileSchema,
  BrandStateSchema,
  StressTestResultSchema,
  parseBrandState,
  parseCompleteBrandState,
  sectionSchemas,
} from '../src/schemas.ts';
import { SECTION_ORDER, createInitialState } from '../src/state.ts';
import { TEST_TYPES } from '../src/types.ts';
import { completeState, project, sectionFixtures } from './fixtures.ts';

/** The field names of an object schema, recursively, as sorted dotted paths. */
function shapePaths(schema: z.ZodType, prefix = ''): string[] {
  const unwrapped = unwrap(schema);
  if (!(unwrapped instanceof z.ZodObject)) return prefix === '' ? [] : [prefix];

  const shape = unwrapped.shape as Record<string, z.ZodType>;
  return Object.keys(shape)
    .flatMap((key) => shapePaths(shape[key]!, prefix === '' ? key : `${prefix}.${key}`))
    .sort();
}

/** Strips optional/array wrappers so the underlying object shape is reachable. */
function unwrap(schema: z.ZodType): z.ZodType {
  let current: z.ZodType = schema;
  for (let i = 0; i < 10; i++) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap() as z.ZodType;
    } else if (current instanceof z.ZodArray) {
      current = current.element as z.ZodType;
    } else {
      break;
    }
  }
  return current;
}

describe('the strict and structural state schemas', () => {
  it('describe the same fields, so they cannot drift apart', () => {
    assert.deepEqual(shapePaths(BrandStateFileSchema), shapePaths(BrandStateSchema));
  });
});

describe('parseBrandState', () => {
  it('accepts a run that has only just started', () => {
    const initial = createInitialState(project);
    assert.deepEqual(parseBrandState(structuredClone(initial)), initial);
  });

  it('accepts a complete run', () => {
    const state = completeState();
    assert.deepEqual(parseBrandState(structuredClone(state)), state);
  });

  it('rejects a missing required section', () => {
    const state = completeState() as Record<string, unknown>;
    delete state.positioning;
    assert.throws(() => parseBrandState(state), z.ZodError);
  });

  it('rejects a field of the wrong type', () => {
    const state = completeState() as unknown as Record<string, Record<string, unknown>>;
    state.discovery!.goals = 'not an array';
    assert.throws(() => parseBrandState(state), z.ZodError);
  });
});

describe('parseCompleteBrandState', () => {
  it('accepts a complete run', () => {
    assert.ok(parseCompleteBrandState(completeState()));
  });

  it('rejects a run still in progress', () => {
    assert.throws(() => parseCompleteBrandState(createInitialState(project)), z.ZodError);
  });
});

describe('section schemas', () => {
  it('accept the fixture for every section', () => {
    for (const section of SECTION_ORDER) {
      const result = sectionSchemas[section].safeParse(sectionFixtures[section]);
      assert.ok(result.success, `${section}: ${result.success ? '' : result.error.message}`);
    }
  });

  it('cover every section in the pipeline', () => {
    assert.deepEqual(Object.keys(sectionSchemas).sort(), [...SECTION_ORDER].sort());
  });

  it('reject an empty string where content is required', () => {
    assert.equal(
      sectionSchemas.positioning.safeParse({ ...sectionFixtures.positioning, category: '' }).success,
      false,
    );
  });
});

describe('StressTestResultSchema', () => {
  const evaluatedTypes = TEST_TYPES.map((type) => ({ type, status: 'evaluated' as const }));

  it('carries the findings and the per-type evaluations', () => {
    const result = StressTestResultSchema.safeParse({
      tests: sectionFixtures.stressTests,
      evaluatedTypes,
    });
    assert.ok(result.success, result.success ? '' : result.error.message);
  });

  it('accepts an empty findings list, which is a good result and not a failure', () => {
    assert.ok(StressTestResultSchema.safeParse({ tests: [], evaluatedTypes }).success);
  });

  it('does not carry a summary, which is computed from the findings instead', () => {
    assert.equal('summary' in StressTestResultSchema.shape, false);
  });

  it('rejects a finding of an unknown type', () => {
    const bad = [{ ...sectionFixtures.stressTests[0]!, type: 'vibes' }];
    assert.equal(StressTestResultSchema.safeParse({ tests: bad, evaluatedTypes }).success, false);
  });

  it('accepts critical as a severity', () => {
    const critical = [{ ...sectionFixtures.stressTests[0]!, severity: 'critical' as const }];
    assert.ok(StressTestResultSchema.safeParse({ tests: critical, evaluatedTypes }).success);
  });

  it('requires evidence and impact to say something', () => {
    for (const field of ['evidence', 'impact', 'issue', 'recommendation'] as const) {
      const bad = [{ ...sectionFixtures.stressTests[0]!, [field]: '' }];
      assert.equal(
        StressTestResultSchema.safeParse({ tests: bad, evaluatedTypes }).success,
        false,
        field,
      );
    }
  });
});
