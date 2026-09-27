/**
 * The per-direction fallback in BRAND BATTLE.
 *
 * Three full strategies in one response can exceed a provider's per-request token
 * budget. That is a size problem rather than a bad request, so the stage generates one
 * direction per call instead of failing. These run against a stub deriver: what matters
 * is which failures trigger the fallback and that the result is still three distinct
 * strategies.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ModelRequestError, SectionParseError, battle } from '../src/index.ts';
import { completeState, strategyCandidates } from './fixtures.ts';

const discovery = completeState().discovery;

const USAGE = { inputTokens: 10, outputTokens: 10, cacheCreationTokens: 0, cacheReadTokens: 0 };

/** Fails the batch call with `failure`, then serves one strategy per later call. */
function deriverThatRejectsBatch(failure: unknown) {
  const calls: string[] = [];
  let served = 0;

  const deriver = {
    deriveSection: async (_s: unknown, _st: unknown, _schema: unknown, options?: any) => {
      const prompt: string = options?.userPrompt ?? '';
      calls.push(prompt);

      // The batch call is the one that does not name a single direction to return.
      if (!/Return only the/.test(prompt)) throw failure;

      const candidate = strategyCandidates[served++]!;
      // Echo back the direction the prompt asked for, as the real model would.
      const asked = /Return only the ([A-Z]+) strategy/.exec(prompt)?.[1];
      return {
        value: { strategy: { ...candidate, direction: asked ?? candidate.direction } },
        usage: USAGE,
      };
    },
  };

  return { deriver: deriver as any, calls };
}

const tooLarge = new ModelRequestError(
  'strategyOptions',
  'Request too large for model: tokens per minute (TPM): Limit 8000, Requested 11681',
  413,
);

describe('battle falls back to one direction per call when the batch is too large', () => {
  it('still returns three strategies, one per requested direction', async () => {
    const { deriver, calls } = deriverThatRejectsBatch(tooLarge);

    const result = await battle(deriver, { discovery }, { maxRebuildsPerStrategy: 0 });

    assert.equal(result.value.length, 3);
    // One failed batch attempt, then one call per direction.
    assert.equal(calls.length, 4);
    assert.equal(new Set(result.value.map((s) => s.direction)).size, 3);
  });

  it('asks for exactly one direction per call, naming it', async () => {
    const { deriver, calls } = deriverThatRejectsBatch(tooLarge);
    await battle(deriver, { discovery }, { maxRebuildsPerStrategy: 0 });

    const singles = calls.filter((c) => /Return only the/.test(c));
    assert.equal(singles.length, 3);
    for (const prompt of singles) {
      assert.match(prompt, /Return only the [A-Z]+ strategy/);
    }
  });

  it('tells each later call what the earlier ones already said', async () => {
    const { deriver, calls } = deriverThatRejectsBatch(tooLarge);
    await battle(deriver, { discovery }, { maxRebuildsPerStrategy: 0 });

    const singles = calls.filter((c) => /Return only the/.test(c));
    // The first has nothing to differ from; the rest must be given the others.
    assert.ok(!singles[0]!.includes('<other_strategies>'));
    assert.match(singles[1]!, /<other_strategies>/);
    assert.match(singles[2]!, /<other_strategies>/);
  });

  it('also falls back on a 429 that is really about token size', async () => {
    const tpm = new ModelRequestError(
      'strategyOptions',
      'rate_limit_exceeded: please reduce your message size and try again',
      429,
    );
    const { deriver } = deriverThatRejectsBatch(tpm);

    const result = await battle(deriver, { discovery }, { maxRebuildsPerStrategy: 0 });
    assert.equal(result.value.length, 3);
  });

  it('does not fall back on an ordinary rate limit, which retrying in pieces will not fix', async () => {
    const plainLimit = new ModelRequestError('strategyOptions', 'too many requests', 429);
    const { deriver } = deriverThatRejectsBatch(plainLimit);

    await assert.rejects(
      () => battle(deriver, { discovery }, { maxRebuildsPerStrategy: 0 }),
      ModelRequestError,
    );
  });

  it('does not fall back on a malformed response, which is a different bug', async () => {
    const { deriver } = deriverThatRejectsBatch(
      new SectionParseError('strategyOptions', 'the response was not valid JSON'),
    );

    await assert.rejects(
      () => battle(deriver, { discovery }, { maxRebuildsPerStrategy: 0 }),
      SectionParseError,
    );
  });
});
