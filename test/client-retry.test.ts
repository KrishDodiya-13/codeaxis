/**
 * Retry and model-selection behaviour for `BrandClient`.
 *
 * Kept apart from `client.test.ts` because these tests need a fake that changes its
 * answer between attempts, rather than one canned reply. Nothing here touches the
 * network: the point is which failures are retried and which are surfaced at once.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type Groq from 'groq-sdk';
import {
  BrandClient,
  DEFAULT_MODEL,
  InvalidCredentialError,
  MODEL_ENV_VAR,
  ModelRequestError,
  resolveModel,
} from '../src/client.ts';
import { DiscoverResultSchema } from '../src/schemas.ts';
import { discoverResult } from './fixtures.ts';

/** A reply carrying `value` as its JSON content. */
function reply(value: unknown) {
  return {
    choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 10 },
  };
}

/**
 * A fake SDK that works through `outcomes`, one per attempt: an Error is thrown, and
 * anything else is returned. Records how many attempts were made.
 */
function scriptedClient(outcomes: unknown[]) {
  const state = { attempts: 0 };
  const client = {
    chat: {
      completions: {
        create: async () => {
          const outcome = outcomes[state.attempts];
          state.attempts++;
          if (outcome instanceof Error) throw outcome;
          return outcome;
        },
      },
    },
  } as unknown as Groq;
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
      withStatus('invalid_api_key: the key is not valid', 401),
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
    process.env[MODEL_ENV_VAR] = 'llama-3.3-70b-versatile';
    try {
      const { model } = await derive([reply(discoverResult)]);
      assert.equal(model, 'llama-3.3-70b-versatile');
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
    process.env[MODEL_ENV_VAR] = 'llama-3.3-70b-versatile';
    try {
      const { model } = await derive([reply(discoverResult)], { model: 'openai/gpt-oss-20b' });
      assert.equal(model, 'openai/gpt-oss-20b');
    } finally {
      if (previous === undefined) delete process.env[MODEL_ENV_VAR];
      else process.env[MODEL_ENV_VAR] = previous;
    }
  });
});

describe('the model is resolved in exactly one place', () => {
  /**
   * `resolveModel` is the only resolution point, so the model a caller ends up with and
   * the model the constructor sends are the same value by construction. This pins that,
   * so a future caller that reads DEFAULT_MODEL directly — and so silently ignores
   * GROQ_MODEL — fails here rather than in production.
   */
  it('gives BrandClient exactly what resolveModel returns', async () => {
    const previous = process.env[MODEL_ENV_VAR];
    process.env[MODEL_ENV_VAR] = 'llama-3.3-70b-versatile';
    try {
      const { model, run, state } = await derive([reply(discoverResult)]);
      await run();
      assert.equal(state.attempts, 1);
      assert.equal(model, resolveModel());
      assert.equal(model, 'llama-3.3-70b-versatile');
      assert.notEqual(model, DEFAULT_MODEL);
    } finally {
      if (previous === undefined) delete process.env[MODEL_ENV_VAR];
      else process.env[MODEL_ENV_VAR] = previous;
    }
  });

  it('sends the resolved model on the actual request', async () => {
    const previous = process.env[MODEL_ENV_VAR];
    process.env[MODEL_ENV_VAR] = 'openai/gpt-oss-20b';
    try {
      const captured: Array<Record<string, any>> = [];
      const fake = {
        chat: {
          completions: {
            create: async (params: Record<string, any>) => {
              captured.push(params);
              return reply(discoverResult);
            },
          },
        },
      } as unknown as Groq;

      const client = new BrandClient({ client: fake });
      await client.deriveSection('discovery', '{}', DiscoverResultSchema);

      assert.equal(captured[0]!.model, 'openai/gpt-oss-20b');
      assert.equal(captured[0]!.model, resolveModel());
    } finally {
      if (previous === undefined) delete process.env[MODEL_ENV_VAR];
      else process.env[MODEL_ENV_VAR] = previous;
    }
  });
});
