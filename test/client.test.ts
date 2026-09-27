/**
 * Request-shape tests for `BrandClient`.
 *
 * These run against an injected fake SDK client rather than the network, so they need no
 * credentials. What they verify is the part a stub deriver cannot: that the request
 * actually sent matches what the structured-output design intends, and that each
 * distinguishable failure is reported as its own error.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import type Groq from 'groq-sdk';
import type { Effort } from '../src/client.ts';
import {
  BrandClient,
  DEFAULT_MODEL,
  InvalidCredentialError,
  ModelRequestError,
  ModelTimeoutError,
  RefusalError,
  SchemaValidationError,
  SectionParseError,
  toGroqSchema,
} from '../src/client.ts';
import { METHODOLOGY, STEP_INSTRUCTIONS } from '../src/prompts.ts';
import {
  BattleResultSchema,
  DiscoverResultSchema,
  FinalBrandDraftSchema,
  PositionResultSchema,
  StressTestResultSchema,
  sectionSchemas,
} from '../src/schemas.ts';
import { SECTION_ORDER } from '../src/state.ts';
import { discoverResult, sectionFixtures } from './fixtures.ts';

type Captured = Record<string, any>;

/** A minimal stand-in for the SDK, recording the request and replaying a canned reply. */
function fakeClient(
  reply: Record<string, unknown> | (() => never),
  captured: Captured[],
): Groq {
  return {
    chat: {
      completions: {
        create: async (params: Captured, requestOptions?: Captured) => {
          captured.push({ ...params, requestOptions });
          if (typeof reply === 'function') reply();
          return reply;
        },
      },
    },
  } as unknown as Groq;
}

/** A well-formed Groq reply carrying `value` as its JSON content. */
function groqReply(value: unknown, overrides: Record<string, unknown> = {}) {
  return {
    choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }],
    // Groq bills reasoning tokens inside completion_tokens, so there is one output number.
    usage: { prompt_tokens: 1200, completion_tokens: 340 },
    ...overrides,
  };
}

/** A reply whose single choice stopped for `reason`, carrying `content`. */
function stopped(reason: string, content = '') {
  return { choices: [{ message: { content }, finish_reason: reason }], usage: {} };
}

async function derive(
  reply: Record<string, unknown> | (() => never),
  options: { effort?: Effort; maxTokens?: number } = {},
) {
  const captured: Captured[] = [];
  const client = new BrandClient({ client: fakeClient(reply, captured), ...options });
  const result = await client.deriveSection(
    'discovery',
    '{"project":{"idea":"x"}}',
    DiscoverResultSchema,
  );
  return { request: captured[0]!, result };
}

describe('the request BrandClient builds', () => {
  it('uses a Groq production model with structured output by default', async () => {
    const { request } = await derive(groqReply(discoverResult));

    assert.equal(DEFAULT_MODEL, 'openai/gpt-oss-120b');
    assert.equal(request.model, 'openai/gpt-oss-120b');
  });

  it('puts the methodology ahead of the step instructions in the system message', async () => {
    const { request } = await derive(groqReply(discoverResult));
    const system = request.messages[0].content as string;

    assert.ok(system.startsWith(METHODOLOGY));
    assert.ok(system.includes(STEP_INSTRUCTIONS.discovery));
    assert.match(system, /This step: discovery/);
  });

  it('sends the same methodology prefix for every section', async () => {
    const captured: Captured[] = [];
    const client = new BrandClient({
      client: fakeClient(groqReply(discoverResult), captured),
    });

    await client.deriveSection('discovery', '{"a":1}', DiscoverResultSchema);
    await client.deriveSection('positioning', '{"a":1}', DiscoverResultSchema);

    const systemOf = (c: Captured) => c.messages[0].content as string;
    const prefixOf = (s: string) => s.slice(0, METHODOLOGY.length);
    assert.equal(prefixOf(systemOf(captured[0]!)), prefixOf(systemOf(captured[1]!)));
    assert.notEqual(systemOf(captured[0]!), systemOf(captured[1]!));
  });

  it('carries the state in the user turn, not the system message', async () => {
    const { request } = await derive(groqReply(discoverResult));

    assert.equal(request.messages[0].role, 'system');
    assert.equal(request.messages[1].role, 'user');
    assert.match(request.messages[1].content as string, /<brand_state>/);
    assert.match(request.messages[1].content as string, /Derive the `discovery` section/);
    assert.doesNotMatch(request.messages[0].content as string, /<brand_state>/);
  });

  it('requests JSON constrained by the section schema', async () => {
    const { request } = await derive(groqReply(discoverResult));

    assert.equal(request.response_format.type, 'json_schema');
    assert.equal(request.response_format.json_schema.name, 'discovery');
    const schema = request.response_format.json_schema.schema as Record<string, any>;
    assert.deepEqual(Object.keys(schema.properties).sort(), [
      'assumptions',
      'constraints',
      'followUpQuestions',
      'goals',
      'missingInformation',
      'problem',
      'targetAudience',
      'userNeed',
    ]);
    // The per-field guidance must survive the conversion — it is how each field is
    // actually instructed.
    assert.match(schema.properties.targetAudience.description, /stated or directly implied/);
    assert.match(schema.properties.missingInformation.description, /five to ten gaps/);
  });

  it('honours an explicit effort and token cap', async () => {
    const { request } = await derive(groqReply(discoverResult), {
      effort: 'low',
      maxTokens: 4000,
    });

    assert.equal(request.max_completion_tokens, 4000);
    assert.equal(request.reasoning_effort, 'low');
  });

  it('maps effort onto the reasoning levels the model accepts', async () => {
    const low = await derive(groqReply(discoverResult), { effort: 'low' });
    const high = await derive(groqReply(discoverResult), { effort: 'high' });

    assert.equal(low.request.reasoning_effort, 'low');
    assert.equal(high.request.reasoning_effort, 'high');
  });

  it('caps the levels above high at high, which is all the model offers', async () => {
    for (const effort of ['high', 'xhigh', 'max'] as const) {
      const { request } = await derive(groqReply(discoverResult), { effort });
      assert.equal(request.reasoning_effort, 'high', effort);
    }
  });

  it('sends a timeout signal, so a hung call cannot wait forever', async () => {
    const { request } = await derive(groqReply(discoverResult));
    assert.ok(request.requestOptions.signal instanceof AbortSignal);
  });
});

describe('the schema Groq is given', () => {
  it('drops keywords Groq does not support', () => {
    const schema = JSON.stringify(toGroqSchema(DiscoverResultSchema));

    // `$schema` and `minLength` are outside Groq's documented subset; sending them
    // either does nothing or rejects the request.
    assert.ok(!schema.includes('$schema'));
    assert.ok(!schema.includes('minLength'));
  });

  it('keeps the keywords Groq does support, so the shape reaches the model', () => {
    const schema = JSON.stringify(toGroqSchema(sectionSchemas.personality));

    assert.ok(schema.includes('required'), 'required fields should survive');
    assert.ok(schema.includes('description'), 'field guidance should survive');
    assert.ok(schema.includes('additionalProperties'), 'closed objects should survive');
  });

  it('drops array minimums, which Zod still enforces after the fact', () => {
    // Groq's subset does not document `minItems`, so it is pruned rather than sent. The
    // constraint is not lost — `deriveSection` validates with the original Zod schema,
    // which is where a short array is actually rejected.
    const schema = JSON.stringify(toGroqSchema(sectionSchemas.personality));
    assert.ok(!schema.includes('minItems'));
  });

  it('inlines reused sub-schemas, so no field loses its description to a $ref', () => {
    const schema = JSON.stringify(toGroqSchema(sectionSchemas.finalBrand));

    // A $ref sub-schema may carry no sibling keywords, which would silently drop the
    // per-field instructions that the descriptions hold.
    assert.ok(!schema.includes('$ref'));
    assert.ok(!schema.includes('$defs'));
  });

  it('describes every field of every model-facing schema', () => {
    const modelFacing: Record<string, z.ZodType> = {
      discovery: DiscoverResultSchema,
      positioning: PositionResultSchema,
      strategyOptions: BattleResultSchema,
      stressTests: StressTestResultSchema,
      personality: sectionSchemas.personality,
      naming: sectionSchemas.naming,
      visualDirection: sectionSchemas.visualDirection,
      voice: sectionSchemas.voice,
      consistency: sectionSchemas.consistency,
      finalBrand: FinalBrandDraftSchema,
    };

    // selectedStrategy has no model-facing schema: choosing a direction is a human
    // decision, so nothing is ever asked of the model.
    assert.deepEqual(
      [...Object.keys(modelFacing), 'selectedStrategy'].sort(),
      [...SECTION_ORDER].sort(),
    );

    for (const [section, schema] of Object.entries(modelFacing)) {
      const properties = (toGroqSchema(schema) as Record<string, any>).properties as Record<
        string,
        any
      >;
      const undescribed = Object.entries(properties)
        .filter(([, p]) => typeof p.description !== 'string' || p.description === '')
        .map(([name]) => name);

      assert.deepEqual(undescribed, [], `${section}: undescribed fields: ${undescribed.join(', ')}`);
    }
  });
});

describe('how BrandClient reads the response', () => {
  it('returns the parsed section and the usage', async () => {
    const { result } = await derive(groqReply(discoverResult));

    assert.equal(result.value.problem, discoverResult.problem);
    assert.deepEqual(result.usage, {
      inputTokens: 1200,
      // Reasoning tokens are billed inside completion_tokens, so they are already here.
      outputTokens: 340,
      // Groq does not report prompt caching on the completions API.
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
  });

  it('reports a response stopped by a content filter as a refusal', async () => {
    await assert.rejects(
      () => derive(stopped('content_filter')),
      (error: unknown) => {
        assert.ok(error instanceof RefusalError);
        assert.equal(error.category, 'content_filter');
        return true;
      },
    );
  });

  it('reports a truncated response instead of parsing half a section', async () => {
    await assert.rejects(
      () =>
        derive(stopped('length', '{"problem":')),
      (error: unknown) => {
        assert.ok(error instanceof SectionParseError);
        assert.match(error.message, /cut off/);
        return true;
      },
    );
  });

  it('reports text that is not JSON as a parse failure', async () => {
    await assert.rejects(
      () => derive(stopped('stop', 'Here is your brand!')),
      (error: unknown) => {
        assert.ok(error instanceof SectionParseError);
        assert.ok(!(error instanceof SchemaValidationError));
        assert.match(error.message, /not valid JSON/);
        return true;
      },
    );
  });

  it('distinguishes a schema failure from unparseable text, and names the fields', async () => {
    await assert.rejects(
      () => derive(groqReply({ problem: '', targetAudience: 'a' })),
      (error: unknown) => {
        assert.ok(error instanceof SchemaValidationError);
        // Still a SectionParseError, so existing callers keep working.
        assert.ok(error instanceof SectionParseError);
        assert.ok(error.issues.length > 0);
        assert.ok(error.issues.some((i) => i.path === 'problem'));
        return true;
      },
    );
  });

  it('reports an empty response rather than crashing on undefined text', async () => {
    await assert.rejects(
      () => derive(stopped('stop', '')),
      /was empty/,
    );
  });

  it('reports a missing choice as an API failure', async () => {
    await assert.rejects(() => derive({ choices: [], usage: {} }), ModelRequestError);
  });

  it('reports null content rather than crashing', async () => {
    await assert.rejects(
      () => derive({ choices: [{ message: { content: null }, finish_reason: 'stop' }], usage: {} }),
      /was empty/,
    );
  });
});

describe('how BrandClient reports transport failures', () => {
  it('reports a rejected key distinctly from other failures', async () => {
    const fail = () => {
      throw Object.assign(new Error('invalid_api_key: the key is not valid'), {
        status: 401,
      });
    };

    await assert.rejects(() => derive(fail), InvalidCredentialError);
  });

  it('reports a 403 as a credential problem', async () => {
    const fail = () => {
      throw Object.assign(new Error('permission denied'), { status: 403 });
    };
    await assert.rejects(() => derive(fail), InvalidCredentialError);
  });

  it('reports a rate limit as an API failure, with the status', async () => {
    const fail = () => {
      throw Object.assign(new Error('rate limit exceeded'), { status: 429 });
    };

    await assert.rejects(() => derive(fail), (error: unknown) => {
      assert.ok(error instanceof ModelRequestError);
      assert.equal(error.status, 429);
      return true;
    });
  });

  it('reports an abort as a timeout', async () => {
    const fail = () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    };

    await assert.rejects(() => derive(fail), ModelTimeoutError);
  });
});

describe('credential handling', () => {
  it('refuses to construct without a key and without an injected client', () => {
    const saved = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      assert.throws(() => new BrandClient(), /GROQ_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.GROQ_API_KEY = saved;
    }
  });

  it('constructs with an injected client even when no key is set', () => {
    const saved = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      assert.ok(new BrandClient({ client: fakeClient(groqReply({}), []) }));
    } finally {
      if (saved !== undefined) process.env.GROQ_API_KEY = saved;
    }
  });
});
