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
  QuotaExceededError,
  isQuotaExhausted,
  isTruncatedError,
  reduceCap,
  resolveModel,
} from '../src/client.ts';
import { DiscoverResultSchema } from '../src/schemas.ts';

/** Mirrors the client's attempt budget, for the bounded-retry assertions. */
const TRANSIENT_ATTEMPTS = 6;
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

  it('retries a per-minute rate limit, because that really is a "later"', async () => {
    const { run, state } = await derive([
      withStatus('Rate limit reached: tokens per minute (TPM) exceeded', 429),
      reply(discoverResult),
    ]);

    await run();

    assert.equal(state.attempts, 2);
  });

  it('does not retry a spent allowance, because waiting will not refill it', async () => {
    const { run, state } = await derive([
      withStatus('Rate limit reached on tokens per day (TPD): Limit 200000, Used 199990', 429),
      reply(discoverResult),
    ]);

    await assert.rejects(run, QuotaExceededError);
    // One attempt only: retrying a daily quota just adds load and delays the real answer.
    assert.equal(state.attempts, 1);
  });

  it('tells a quota apart from a rate limit by the wording the provider uses', () => {
    assert.equal(isQuotaExhausted('tokens per minute (TPM): Limit 8000'), false);
    assert.equal(isQuotaExhausted('requests per minute exceeded'), false);
    assert.equal(isQuotaExhausted('tokens per day (TPD): Limit 200000'), true);
    assert.equal(isQuotaExhausted('quota exceeded, check your billing details'), true);
    assert.equal(isQuotaExhausted('insufficient_quota'), true);
    assert.equal(isQuotaExhausted('the model is overloaded'), false);
  });

  it('carries the reset hint through, so a caller can say when to come back', async () => {
    const { run } = await derive([
      withStatus('quota exceeded. Please try again in 20m4.4s', 429),
    ]);

    await assert.rejects(run, (error: unknown) => {
      assert.ok(error instanceof QuotaExceededError);
      assert.equal(error.retryAfter, '20m4.4s');
      return true;
    });
  });

  it('gives up after a bounded number of attempts and reports the last status', async () => {
    // One more overload than the attempt budget allows, so the reply is never reached.
    const overloads = Array.from({ length: TRANSIENT_ATTEMPTS }, () =>
      withStatus('overloaded', 503),
    );
    const { run, state } = await derive([...overloads, reply(discoverResult)]);

    await assert.rejects(run, (error: unknown) => {
      assert.ok(error instanceof ModelRequestError);
      assert.equal(error.status, 503);
      return true;
    });
    // Bounded: it stops rather than reaching the reply that would have succeeded.
    assert.equal(state.attempts, TRANSIENT_ATTEMPTS);
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

describe('the output cap adapts when a request is refused for size', () => {
  it('subtracts the overshoot the provider reported, rather than halving blindly', () => {
    // Groq's wording. 8400 asked, 8000 allowed -> 400 over, minus the margin.
    const reduced = reduceCap(4000, 'tokens per minute (TPM): Limit 8000, Requested 8400');
    assert.equal(reduced, 4000 - 400 - 250);
  });

  it('falls back to halving when the message carries no numbers', () => {
    assert.equal(reduceCap(4000, 'request entity too large'), 2000);
  });

  it('never drops below the floor, where nothing could complete', () => {
    assert.equal(reduceCap(1300, 'Limit 8000, Requested 90000'), 1200);
    assert.equal(reduceCap(1200, 'no numbers here'), 1200);
  });

  it('retries with the smaller cap and succeeds, instead of failing the stage', async () => {
    const caps: number[] = [];
    const client = {
      chat: {
        completions: {
          create: async (params: Record<string, any>) => {
            caps.push(params.max_completion_tokens);
            if (caps.length === 1) {
              throw Object.assign(
                new Error('Request too large: Limit 8000, Requested 8400'),
                { status: 413 },
              );
            }
            return reply(discoverResult);
          },
        },
      },
    } as unknown as Groq;

    const brandClient = new BrandClient({ client });
    await brandClient.deriveSection('discovery', '{}', DiscoverResultSchema);

    assert.equal(caps.length, 2, 'should retry once with a smaller cap');
    assert.ok(caps[1]! < caps[0]!, 'the second attempt must ask for less');
    assert.equal(caps[1], caps[0]! - 400 - 250);
  });

  it('does not retry forever when reducing changes nothing', async () => {
    let calls = 0;
    const client = {
      chat: {
        completions: {
          create: async () => {
            calls++;
            throw Object.assign(new Error('Request too large'), { status: 413 });
          },
        },
      },
    } as unknown as Groq;

    await assert.rejects(
      () => new BrandClient({ client }).deriveSection('discovery', '{}', DiscoverResultSchema),
      ModelRequestError,
    );
    // Bounded: halving down to the floor, then it gives up rather than spinning.
    assert.ok(calls <= TRANSIENT_ATTEMPTS + 3, `made ${calls} calls`);
  });
});

describe('the cap is raised when the answer did not fit', () => {
  /** Serves `failures` in order, then a valid reply. Records every cap requested. */
  function capTracker(failures: unknown[]) {
    const caps: number[] = [];
    let served = 0;
    const client = {
      chat: {
        completions: {
          create: async (params: Record<string, any>) => {
            caps.push(params.max_completion_tokens);
            if (served < failures.length) throw failures[served++];
            return reply(discoverResult);
          },
        },
      },
    } as unknown as Groq;
    return { client, caps };
  }

  const truncated = Object.assign(
    new Error(
      'Failed to generate JSON: max completion tokens reached before generating a valid document',
    ),
    { status: 400 },
  );

  it('recognises a truncation reported as a schema failure', () => {
    assert.equal(isTruncatedError(truncated), true);
    assert.equal(isTruncatedError(new Error('the response was not valid JSON')), false);
  });

  it('treats an empty generation as needing more room, not as malformed output', () => {
    const empty = new Error(
      '400 {"error":{"code":"json_validate_failed","failed_generation":""}}',
    );
    assert.equal(isTruncatedError(empty), true);
  });

  it('does not treat a non-empty malformed generation as truncation', () => {
    // More room will not fix output that is the wrong shape rather than cut short.
    const malformed = new Error(
      '400 {"error":{"code":"json_validate_failed","failed_generation":"{\"wrong\":1}"}}',
    );
    assert.equal(isTruncatedError(malformed), false);
  });

  it('raises the cap and retries rather than failing the stage', async () => {
    const { client, caps } = capTracker([truncated]);
    await new BrandClient({ client, maxTokens: 4000 }).deriveSection(
      'discovery',
      '{}',
      DiscoverResultSchema,
    );

    assert.equal(caps.length, 2);
    assert.equal(caps[0], 4000);
    assert.equal(caps[1], 8000, 'should double');
  });

  it('never raises to a cap the provider already refused, so it cannot oscillate', async () => {
    // First too large at 4000 -> reduced; then truncated -> must not climb back to 4000.
    const tooLarge = Object.assign(new Error('Request too large: Limit 8000, Requested 8400'), {
      status: 413,
    });
    const { client, caps } = capTracker([tooLarge, truncated]);

    await new BrandClient({ client, maxTokens: 4000 }).deriveSection(
      'discovery',
      '{}',
      DiscoverResultSchema,
    );

    assert.equal(caps[0], 4000);
    assert.equal(caps[1], 3350, '4000 - 400 overshoot - 250 margin');
    assert.ok(caps[2]! < 4000, `raised to ${caps[2]}, which was already refused`);
  });

  it('gives up after a bounded number of adjustments', async () => {
    const { client, caps } = capTracker([
      truncated,
      truncated,
      truncated,
      truncated,
      truncated,
      truncated,
    ]);

    await assert.rejects(() =>
      new BrandClient({ client, maxTokens: 4000 }).deriveSection(
        'discovery',
        '{}',
        DiscoverResultSchema,
      ),
    );
    assert.ok(caps.length <= 5, `made ${caps.length} attempts`);
  });
});
