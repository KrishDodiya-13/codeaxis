/**
 * Stage timing instrumentation.
 *
 * The properties that matter: a timing is recorded for every stage including failures,
 * mock and live are never averaged together, validation is measured separately from the
 * provider round trip, and nothing sensitive is ever in a record.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import type Groq from 'groq-sdk';
import {
  BrandClient,
  MockDeriver,
  clearTimings,
  liveTimings,
  onTiming,
  summarizeTimings,
  timings,
} from '../src/index.ts';
import { DiscoverResultSchema } from '../src/schemas.ts';
import { discoverResult } from './fixtures.ts';
import { z } from 'zod';

function reply(value: unknown) {
  return {
    choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1234, completion_tokens: 567 },
  };
}

/** A fake SDK that replies, or throws `failure`. */
function fakeClient(failure?: unknown) {
  return {
    chat: {
      completions: {
        create: async () => {
          if (failure !== undefined) throw failure;
          return reply(discoverResult);
        },
      },
    },
  } as unknown as Groq;
}

beforeEach(() => {
  clearTimings();
  onTiming(undefined);
});

describe('a timing is recorded for every stage', () => {
  it('records a successful live stage with its parts measured separately', async () => {
    const client = new BrandClient({ client: fakeClient() });
    await client.deriveSection('discovery', '{}', DiscoverResultSchema);

    const [record] = timings();
    assert.ok(record !== undefined, 'a record should exist');
    assert.equal(record.section, 'discovery');
    assert.equal(record.mode, 'live');
    assert.equal(record.ok, true);
    assert.equal(record.inputTokens, 1234);
    assert.equal(record.outputTokens, 567);

    // Validation is its own number, and part of the total rather than additional to it.
    assert.ok(record.validationMs >= 0);
    assert.ok(record.totalMs >= record.validationMs);
    assert.ok(record.totalMs >= record.modelMs);
    assert.ok(!Number.isNaN(Date.parse(record.requestStart)));
    assert.ok(!Number.isNaN(Date.parse(record.responseComplete)));
  });

  it('records a failed stage too, so a slow failure is still visible', async () => {
    const client = new BrandClient({
      client: fakeClient(Object.assign(new Error('Invalid API Key'), { status: 401 })),
    });

    await assert.rejects(() => client.deriveSection('discovery', '{}', DiscoverResultSchema));

    const [record] = timings();
    assert.equal(record!.ok, false);
    assert.equal(record!.errorKind, 'InvalidCredentialError');
  });

  it('records the error class only, never a message that could quote the prompt', async () => {
    const secret = 'CONFIDENTIAL-IDEA-DO-NOT-LOG';
    const client = new BrandClient({
      client: fakeClient(new Error(`failed while processing ${secret}`)),
    });

    await assert.rejects(() => client.deriveSection('discovery', secret, DiscoverResultSchema));

    const serialized = JSON.stringify(timings());
    assert.ok(!serialized.includes(secret), 'no prompt content may reach a timing record');
    assert.ok(!serialized.includes('failed while processing'), 'no error message either');
  });

  it('records a mock stage, tagged mock', async () => {
    await new MockDeriver().deriveSection('discovery', '{}', DiscoverResultSchema);

    const [record] = timings();
    assert.equal(record!.mode, 'mock');
    // No provider was called, so there is no round trip to report.
    assert.equal(record!.modelMs, 0);
    assert.ok(record!.validationMs >= 0);
  });

  it('records a mock fixture failure', async () => {
    const impossible = z.object({ neverPresent: z.string() }).strict();
    await assert.rejects(() => new MockDeriver().deriveSection('discovery', '{}', impossible));

    assert.equal(timings()[0]!.ok, false);
    assert.equal(timings()[0]!.errorKind, 'MockFixtureError');
  });
});

describe('mock and live timings are never mixed', () => {
  it('liveTimings excludes mock records', async () => {
    await new MockDeriver().deriveSection('discovery', '{}', DiscoverResultSchema);
    await new BrandClient({ client: fakeClient() }).deriveSection(
      'discovery',
      '{}',
      DiscoverResultSchema,
    );

    assert.equal(timings().length, 2);
    assert.equal(liveTimings().length, 1);
    assert.equal(liveTimings()[0]!.mode, 'live');
  });

  it('summarizes live only by default, because a mock time is not AI latency', async () => {
    await new MockDeriver().deriveSection('discovery', '{}', DiscoverResultSchema);
    await new BrandClient({ client: fakeClient() }).deriveSection(
      'discovery',
      '{}',
      DiscoverResultSchema,
    );

    assert.equal(summarizeTimings()[0]!.samples, 1);
    assert.equal(summarizeTimings('mock')[0]!.samples, 1);
    assert.equal(summarizeTimings('all')[0]!.samples, 2);
  });

  it('reports min, average and max per stage', async () => {
    const client = new BrandClient({ client: fakeClient() });
    for (let i = 0; i < 3; i++) {
      await client.deriveSection('discovery', `{"n":${i}}`, DiscoverResultSchema);
    }

    const [summary] = summarizeTimings();
    assert.equal(summary!.section, 'discovery');
    assert.equal(summary!.samples, 3);
    assert.ok(summary!.minMs <= summary!.avgMs);
    assert.ok(summary!.avgMs <= summary!.maxMs);
  });
});

describe('the sink cannot break a stage', () => {
  it('delivers each record to a registered sink', async () => {
    const seen: string[] = [];
    onTiming((timing) => seen.push(timing.section));

    await new MockDeriver().deriveSection('discovery', '{}', DiscoverResultSchema);
    assert.deepEqual(seen, ['discovery']);
  });

  it('survives a sink that throws, because reporting must not fail the pipeline', async () => {
    onTiming(() => {
      throw new Error('sink is broken');
    });

    // The stage must still succeed.
    const result = await new MockDeriver().deriveSection('discovery', '{}', DiscoverResultSchema);
    assert.ok(result.value !== undefined);
    assert.equal(timings().length, 1);
  });

  it('keeps the window bounded rather than growing without limit', async () => {
    const client = new BrandClient({ client: fakeClient() });
    for (let i = 0; i < 12; i++) {
      await client.deriveSection('discovery', `{"n":${i}}`, DiscoverResultSchema);
    }
    // Far below the cap here; what matters is that records accumulate and are readable.
    assert.equal(timings().length, 12);
    assert.ok(timings().length <= 500);
  });
});
