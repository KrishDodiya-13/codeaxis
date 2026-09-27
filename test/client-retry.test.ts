/**
 * Retry and model-selection behaviour for `BrandClient`.
 *
 * Kept apart from `client.test.ts` because these tests need a fake that changes its
 * answer between attempts, rather than one canned reply. Nothing here touches the
 * network: the point is which failures are retried and which are surfaced at once.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GoogleGenAI } from '@google/genai';
import {
  BrandClient,
  DEFAULT_MODEL,
  InvalidCredentialError,
  MODEL_ENV_VAR,
  ModelRequestError,
} from '../src/client.ts';
import { DiscoverResultSchema } from '../src/schemas.ts';
import { discoverResult } from './fixtures.ts';

/** A reply carrying `value` as its JSON text. */
function reply(value: unknown) {
  return {
    text: JSON.stringify(value),
    candidates: [{ finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
  };
}

/**
 * A fake SDK that works through `outcomes`, one per attempt: an Error is thrown, and
 * anything else is returned. Records how many attempts were made.
 */
function scriptedClient(outcomes: unknown[]) {
  const state = { attempts: 0 };
  const client = {
    models: {
      generateContent: async () => {
        const outcome = outcomes[state.attempts];
        state.attempts++;
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    },
  } as unknown as GoogleGenAI;
  return { client, state };
}

function withStatus(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

async function derive(outcomes: unknown[], options: { model?: string } = {}) {
  const { client, state } = scriptedClient(outcomes);
  const brandClient = new BrandClient({ client, ...options });
  const run = () =>
    brandClient.deriveSection('discovery', '{"project":{"idea":"x"}}', DiscoverResultSchema);
  return { run, state, model: brandClient.model };
}

describe('BrandClient retries transient model failures', () => {
  it('retries a 503 and succeeds on a later attempt', async () => {
    const { run, state } = await derive([
      withStatus('overloaded', 503),
      withStatus('overloaded', 503),
      reply(discoverResult),
    ]);

    const result = await run();

    assert.equal(state.attempts, 3);
    assert.equal(result.value.problem, discoverResult.problem);
  });

  it('retries a 429, because a rate limit is a "later", not a "no"', async () => {
    const { run, state } = await derive([withStatus('quota exceeded', 429), reply(discoverResult)]);

    await run();

    assert.equal(state.attempts, 2);
  });

  it('gives up after a bounded number of attempts and reports the last status', async () => {
    const { run, state } = await derive([
      withStatus('overloaded', 503),
      withStatus('overloaded', 503),
      withStatus('overloaded', 503),
      withStatus('overloaded', 503),
      reply(discoverResult),
    ]);

    await assert.rejects(run, (error: unknown) => {
      assert.ok(error instanceof ModelRequestError);
      assert.equal(error.status, 503);
      return true;
    });
    // Bounded: it stops rather than reaching the reply that would have succeeded.
    assert.equal(state.attempts, 4);
  });

  it('does not retry a bad credential, which would fail identically every time', async () => {
    const { run, state } = await derive([
      withStatus('API key not valid. Please pass a valid API key.', 400),
      reply(discoverResult),
    ]);

    await assert.rejects(run, InvalidCredentialError);
    assert.equal(state.attempts, 1);
  });

  it('does not retry a 404, because an unknown model will not appear', async () => {
    const { run, state } = await derive([
      withStatus('model not found', 404),
      reply(discoverResult),
    ]);

    await assert.rejects(run, ModelRequestError);
    assert.equal(state.attempts, 1);
  });
});

describe('BrandClient error messages include the cause chain', () => {
  it('unwraps the cause behind a bare "fetch failed"', async () => {
    const transport = Object.assign(new Error('fetch failed'), {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
    });
    const { run } = await derive([transport, transport, transport, transport]);

    await assert.rejects(run, (error: unknown) => {
      assert.ok(error instanceof ModelRequestError);
      assert.match(error.message, /fetch failed/);
      assert.match(error.message, /ENOTFOUND/);
      return true;
    });
  });
});

describe('BrandClient model selection', () => {
  it('defaults to DEFAULT_MODEL when nothing overrides it', async () => {
    const previous = process.env[MODEL_ENV_VAR];
    delete process.env[MODEL_ENV_VAR];
    try {
      const { model } = await derive([reply(discoverResult)]);
      assert.equal(model, DEFAULT_MODEL);
    } finally {
      if (previous !== undefined) process.env[MODEL_ENV_VAR] = previous;
    }
  });

  it('takes the env override when one is set', async () => {
    const previous = process.env[MODEL_ENV_VAR];
    process.env[MODEL_ENV_VAR] = 'gemini-3-flash-preview';
    try {
      const { model } = await derive([reply(discoverResult)]);
      assert.equal(model, 'gemini-3-flash-preview');
    } finally {
      if (previous === undefined) delete process.env[MODEL_ENV_VAR];
      else process.env[MODEL_ENV_VAR] = previous;
    }
  });

  it('ignores a blank env override rather than asking for an empty model', async () => {
    const previous = process.env[MODEL_ENV_VAR];
    process.env[MODEL_ENV_VAR] = '   ';
    try {
      const { model } = await derive([reply(discoverResult)]);
      assert.equal(model, DEFAULT_MODEL);
    } finally {
      if (previous === undefined) delete process.env[MODEL_ENV_VAR];
      else process.env[MODEL_ENV_VAR] = previous;
    }
  });

  it('lets an explicit option win over the env override', async () => {
    const previous = process.env[MODEL_ENV_VAR];
    process.env[MODEL_ENV_VAR] = 'gemini-3-flash-preview';
    try {
      const { model } = await derive([reply(discoverResult)], { model: 'gemini-3.1-flash-lite' });
      assert.equal(model, 'gemini-3.1-flash-lite');
    } finally {
      if (previous === undefined) delete process.env[MODEL_ENV_VAR];
      else process.env[MODEL_ENV_VAR] = previous;
    }
  });
});
