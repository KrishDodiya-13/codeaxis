/**
 * Mock mode, the mode resolver, and the request cache.
 *
 * The important properties are not "it returns something" but: mock output clears the
 * same Zod bar as live output, mock never reaches a provider, mode is never guessed, and
 * the cache cannot serve one project's result to another.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AI_MODE_ENV_VAR,
  CachingDeriver,
  DeriverCache,
  InvalidAiModeError,
  MockDeriver,
  MockFixtureError,
  SCHEMA_VERSION,
  acknowledgeFinding,
  applyDelta,
  blockingFindings,
  buildBrandDna,
  compileBrandOs,
  createDeriver,
  selectStrategy,
  resolveAiMode,
} from '../src/index.ts';
import { runPipeline } from '../src/pipeline.ts';
import { BrandOsDraftSchema, DiscoverResultSchema, sectionSchemas } from '../src/schemas.ts';
import { BattleResultSchema, StrategyRegenerationSchema } from '../src/schemas.ts';
import { StressTestResultSchema, ConsistencySchema, PositionResultSchema } from '../src/schemas.ts';
import { createInitialState } from '../src/state.ts';
import { z } from 'zod';
import { project } from './fixtures.ts';

/** Runs `body` with `AI_MODE` set to `value`, restoring it afterwards. */
async function withMode(value: string | undefined, body: () => void | Promise<void>) {
  const previous = process.env[AI_MODE_ENV_VAR];
  if (value === undefined) delete process.env[AI_MODE_ENV_VAR];
  else process.env[AI_MODE_ENV_VAR] = value;
  try {
    await body();
  } finally {
    if (previous === undefined) delete process.env[AI_MODE_ENV_VAR];
    else process.env[AI_MODE_ENV_VAR] = previous;
  }
}

describe('the mode is configured, never guessed', () => {
  it('defaults to live when nothing is set, so nothing drifts into serving fixtures', async () => {
    await withMode(undefined, () => assert.equal(resolveAiMode(), 'live'));
  });

  it('reads mock and live', async () => {
    await withMode('mock', () => assert.equal(resolveAiMode(), 'mock'));
    await withMode('live', () => assert.equal(resolveAiMode(), 'live'));
    await withMode('  MOCK  ', () => assert.equal(resolveAiMode(), 'mock'));
  });

  it('throws on a typo rather than silently running live and spending quota', async () => {
    await withMode('moc', () => assert.throws(() => resolveAiMode(), InvalidAiModeError));
    await withMode('off', () => assert.throws(() => resolveAiMode(), InvalidAiModeError));
  });

  it('builds a MockDeriver in mock mode, with no credential present', async () => {
    const key = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      await withMode('mock', () => {
        // Live would throw MissingCredentialError here; mock must not need a key at all.
        assert.ok(createDeriver() instanceof MockDeriver);
      });
    } finally {
      if (key !== undefined) process.env.GROQ_API_KEY = key;
    }
  });

  it('announces the mode once, for a server log', async () => {
    await withMode('mock', () => {
      const lines: string[] = [];
      createDeriver({ onMode: (m) => lines.push(m) });
      assert.equal(lines.length, 1);
      assert.match(lines[0]!, /AI_MODE=mock/);
      assert.match(lines[0]!, /no provider/i);
    });
  });
});

describe('mock output satisfies the real schemas', () => {
  const cases: Array<[string, z.ZodType]> = [
    ['discovery', DiscoverResultSchema],
    ['positioning', PositionResultSchema],
    ['strategyOptions', BattleResultSchema],
    ['personality', sectionSchemas.personality],
    ['naming', sectionSchemas.naming],
    ['visualDirection', sectionSchemas.visualDirection],
    ['voice', sectionSchemas.voice],
    ['stressTests', StressTestResultSchema],
    ['consistency', ConsistencySchema],
    ['finalBrand', BrandOsDraftSchema],
  ];

  for (const [section, schema] of cases) {
    it(`serves a schema-valid ${section}`, async () => {
      const mock = new MockDeriver();
      const result = await mock.deriveSection(section as never, '{}', schema);
      // Parsed by the caller's own schema inside the deriver, so reaching here is the
      // assertion; this re-checks it from outside for good measure.
      assert.doesNotThrow(() => schema.parse(result.value));
    });
  }

  it('serves the single-strategy shape the per-direction fallback asks for', async () => {
    const mock = new MockDeriver();
    const result = await mock.deriveSection(
      'strategyOptions',
      '{}',
      StrategyRegenerationSchema,
    );
    assert.ok('strategy' in (result.value as object));
  });

  it('is deterministic: the same request twice gives the same answer', async () => {
    const mock = new MockDeriver();
    const a = await mock.deriveSection('discovery', '{}', DiscoverResultSchema);
    const b = await mock.deriveSection('discovery', '{}', DiscoverResultSchema);
    assert.deepEqual(a.value, b.value);
  });

  it('reports plausible usage, so a spend display has something to render', async () => {
    const mock = new MockDeriver();
    const { usage } = await mock.deriveSection('discovery', '{}', DiscoverResultSchema);
    assert.ok(usage.inputTokens > 0);
    assert.ok(usage.outputTokens > 0);
  });

  it('fails loudly when a fixture no longer fits its schema', async () => {
    const mock = new MockDeriver();
    // A schema nothing could satisfy stands in for a fixture that has drifted.
    const impossible = z.object({ neverPresent: z.string() }).strict();
    await assert.rejects(
      () => mock.deriveSection('discovery', '{}', impossible),
      MockFixtureError,
    );
  });

  it('never asks the model to choose a strategy, even in mock', async () => {
    const mock = new MockDeriver();
    await assert.rejects(
      () => mock.deriveSection('selectedStrategy', '{}', z.object({}).strict()),
      MockFixtureError,
    );
  });
});

/**
 * Runs mock mode through the whole workflow, including both human checkpoints:
 * choosing a direction, and accepting the blocking stress findings. Returns the
 * finished state.
 */
async function runWholeWorkflow(mock: MockDeriver) {
  const upToBattle = await runPipeline(mock, createInitialState(project), {
    until: 'strategyOptions',
  });

  const chosen = applyDelta(
    upToBattle.state,
    'selectedStrategy',
    selectStrategy(
      upToBattle.state.strategyOptions,
      upToBattle.state.strategyOptions[0]!.direction,
    ),
  );

  // The gate before finalization is real in mock mode too, so the findings have to be
  // accepted as trade-offs the way a user would accept them.
  const checked = await runPipeline(mock, chosen, { until: 'consistency' });
  let tests = checked.state.stressTests;
  for (const finding of blockingFindings(tests)) {
    tests = acknowledgeFinding(tests, { type: finding.type, issue: finding.issue });
  }

  return runPipeline(mock, applyDelta(checked.state, 'stressTests', tests));
}

describe('the whole pipeline runs in mock mode', () => {
  it('derives every section without a provider or a credential', async () => {
    const mock = new MockDeriver();
    const result = await runWholeWorkflow(mock);

    assert.ok(result.state.discovery.problem.length > 0);
    assert.ok(result.state.positioning.category.length > 0);
    assert.equal(result.state.strategyOptions.length, 3);
    assert.ok(result.state.personality.traits.length > 0);
    assert.ok(result.state.naming.candidates.length > 0);
    assert.ok(result.state.visualDirection.colors.length > 0);
    assert.ok(result.state.voice.toneAttributes.length > 0);
    assert.ok(result.state.stressTests.length > 0);
    assert.notEqual(result.state.consistency.status, 'not-yet-checked');
    assert.notEqual(result.state.finalBrand, undefined);
    assert.ok(mock.calls.length > 0, 'the deriver was actually exercised');
  });

  it('compiles a Final Brand OS with all six sections in mock mode', async () => {
    const mock = new MockDeriver();
    const finished = await runWholeWorkflow(mock);

    const compiled = await compileBrandOs(mock, {
      brandId: finished.state.id,
      brandState: finished.state,
    });

    for (const section of ['strategy', 'identity', 'visual', 'voice', 'launch', 'validation']) {
      assert.ok(section in compiled.value.brandOS, `missing ${section}`);
    }
    assert.ok(compiled.value.brandOS.launch.onelinePitch.length > 0);
    assert.ok(compiled.value.brandOS.strategy.problem.length > 0);
    assert.ok(compiled.value.brandOS.identity.principles.length > 0);
  });

  it('produces a Brand DNA from the mock-derived state', async () => {
    const mock = new MockDeriver();
    const finished = await runWholeWorkflow(mock);
    const dna = buildBrandDna(finished.state);

    const undecided = Object.entries(dna).filter(
      ([, node]) => typeof node === 'object' && node !== null && 'decided' in node && !node.decided,
    );
    assert.deepEqual(undecided, [], 'every node should be decided after a full run');
  });
});

describe('the cache is scoped to a project and re-validated', () => {
  const scopeA = { projectId: 'project-a', schemaVersion: SCHEMA_VERSION };
  const scopeB = { projectId: 'project-b', schemaVersion: SCHEMA_VERSION };

  /** Counts calls, so a hit can be told from a miss. */
  function counting() {
    let calls = 0;
    const inner = {
      deriveSection: async (_s: unknown, _st: unknown, schema: z.ZodType) => {
        calls++;
        return {
          value: schema.parse((await new MockDeriver().deriveSection('discovery', '{}', schema)).value),
          usage: { inputTokens: 5, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 0 },
        };
      },
    };
    return { inner: inner as never, count: () => calls };
  }

  it('serves an identical repeat request from memory', async () => {
    const cache = new DeriverCache();
    const { inner, count } = counting();
    const deriver = new CachingDeriver(inner, scopeA, cache);

    await deriver.deriveSection('discovery', '{"a":1}', DiscoverResultSchema);
    await deriver.deriveSection('discovery', '{"a":1}', DiscoverResultSchema);

    assert.equal(count(), 1, 'the second call should be a hit');
    assert.equal(cache.stats().hits, 1);
  });

  it('treats cosmetically different whitespace as the same request', async () => {
    const cache = new DeriverCache();
    const { inner, count } = counting();
    const deriver = new CachingDeriver(inner, scopeA, cache);

    await deriver.deriveSection('discovery', '{"a": 1}', DiscoverResultSchema);
    await deriver.deriveSection('discovery', '{"a":   1}', DiscoverResultSchema);

    assert.equal(count(), 1);
  });

  it('does not serve one project a result derived for another', async () => {
    const cache = new DeriverCache();
    const { inner, count } = counting();

    await new CachingDeriver(inner, scopeA, cache).deriveSection(
      'discovery',
      '{"a":1}',
      DiscoverResultSchema,
    );
    await new CachingDeriver(inner, scopeB, cache).deriveSection(
      'discovery',
      '{"a":1}',
      DiscoverResultSchema,
    );

    // Same stage, same input, different project: it must be derived again.
    assert.equal(count(), 2);
  });

  it('separates users, so a shared project id still cannot leak across them', async () => {
    const cache = new DeriverCache();
    const { inner, count } = counting();
    const one = { ...scopeA, userId: 'user-1' };
    const two = { ...scopeA, userId: 'user-2' };

    await new CachingDeriver(inner, one, cache).deriveSection('discovery', '{}', DiscoverResultSchema);
    await new CachingDeriver(inner, two, cache).deriveSection('discovery', '{}', DiscoverResultSchema);

    assert.equal(count(), 2);
  });

  it('misses when the state changed, so a stale answer cannot outlive a decision', async () => {
    const cache = new DeriverCache();
    const { inner, count } = counting();
    const deriver = new CachingDeriver(inner, scopeA, cache);

    await deriver.deriveSection('discovery', '{"audience":"students"}', DiscoverResultSchema);
    await deriver.deriveSection('discovery', '{"audience":"teachers"}', DiscoverResultSchema);

    assert.equal(count(), 2);
  });

  it('misses when the schema version changed', async () => {
    const cache = new DeriverCache();
    const { inner, count } = counting();

    await new CachingDeriver(inner, scopeA, cache).deriveSection('discovery', '{}', DiscoverResultSchema);
    await new CachingDeriver(
      inner,
      { ...scopeA, schemaVersion: '9.9.9' },
      cache,
    ).deriveSection('discovery', '{}', DiscoverResultSchema);

    assert.equal(count(), 2);
  });

  it('does not cache a failure, so a transient problem cannot become sticky', async () => {
    const cache = new DeriverCache();
    let calls = 0;
    const flaky = {
      deriveSection: async (_s: unknown, _st: unknown, schema: z.ZodType) => {
        calls++;
        if (calls === 1) throw new Error('transient');
        return {
          value: (await new MockDeriver().deriveSection('discovery', '{}', schema)).value,
          usage: { inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0 },
        };
      },
    };
    const deriver = new CachingDeriver(flaky as never, scopeA, cache);

    await assert.rejects(() => deriver.deriveSection('discovery', '{}', DiscoverResultSchema));
    // The retry must reach the deriver rather than a cached failure.
    await deriver.deriveSection('discovery', '{}', DiscoverResultSchema);
    assert.equal(calls, 2);
  });

  it('reports no usage for a hit, so a run does not double-count what it spent', async () => {
    const cache = new DeriverCache();
    const { inner } = counting();
    const deriver = new CachingDeriver(inner, scopeA, cache);

    const first = await deriver.deriveSection('discovery', '{}', DiscoverResultSchema);
    const second = await deriver.deriveSection('discovery', '{}', DiscoverResultSchema);

    assert.ok(first.usage.inputTokens > 0);
    assert.equal(second.usage.inputTokens, 0);
  });

  it('evicts the least recently used entry when full', async () => {
    const cache = new DeriverCache({ maxEntries: 2 });
    const { inner, count } = counting();
    const deriver = new CachingDeriver(inner, scopeA, cache);

    await deriver.deriveSection('discovery', '{"n":1}', DiscoverResultSchema);
    await deriver.deriveSection('discovery', '{"n":2}', DiscoverResultSchema);
    await deriver.deriveSection('discovery', '{"n":1}', DiscoverResultSchema); // refresh 1
    await deriver.deriveSection('discovery', '{"n":3}', DiscoverResultSchema); // evicts 2
    assert.equal(cache.stats().entries, 2);

    const before = count();
    await deriver.deriveSection('discovery', '{"n":1}', DiscoverResultSchema);
    assert.equal(count(), before, 'the refreshed entry should have survived');
  });

  it('drops one project without touching another', async () => {
    const cache = new DeriverCache();
    const { inner, count } = counting();

    await new CachingDeriver(inner, scopeA, cache).deriveSection('discovery', '{}', DiscoverResultSchema);
    await new CachingDeriver(inner, scopeB, cache).deriveSection('discovery', '{}', DiscoverResultSchema);
    cache.clearProject('project-a');

    const before = count();
    await new CachingDeriver(inner, scopeB, cache).deriveSection('discovery', '{}', DiscoverResultSchema);
    assert.equal(count(), before, 'project-b should still be cached');
  });
});
