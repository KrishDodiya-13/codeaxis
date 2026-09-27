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
import type { GoogleGenAI } from '@google/genai';
import {
  BrandClient,
  DEFAULT_MODEL,
  InvalidCredentialError,
  ModelRequestError,
  ModelTimeoutError,
  RefusalError,
  SchemaValidationError,
  SectionParseError,
  toGeminiSchema,
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
): GoogleGenAI {
  return {
    models: {
      generateContent: async (params: Captured) => {
        captured.push(params);
        if (typeof reply === 'function') reply();
        return reply;
      },
    },
  } as unknown as GoogleGenAI;
}

/** A well-formed Gemini reply carrying `value` as its JSON text. */
function geminiReply(value: unknown, overrides: Record<string, unknown> = {}) {
  return {
    text: JSON.stringify(value),
    candidates: [{ finishReason: 'STOP' }],
    usageMetadata: {
      promptTokenCount: 1200,
      candidatesTokenCount: 300,
      thoughtsTokenCount: 40,
      cachedContentTokenCount: 900,
    },
    ...overrides,
  };
}

async function derive(
  reply: Record<string, unknown> | (() => never),
  options: { effort?: 'low' | 'high'; maxTokens?: number } = {},
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
  it('uses the current fast Gemini model by default', async () => {
    const { request } = await derive(geminiReply(discoverResult));

    assert.equal(DEFAULT_MODEL, 'gemini-3.8-flash');
    assert.equal(request.model, 'gemini-3.8-flash');
  });

  it('puts the methodology ahead of the step instructions in the system instruction', async () => {
    const { request } = await derive(geminiReply(discoverResult));
    const system = request.config.systemInstruction as string;

    assert.ok(system.startsWith(METHODOLOGY));
    assert.ok(system.includes(STEP_INSTRUCTIONS.discovery));
    assert.match(system, /This step: discovery/);
  });

  it('sends the same methodology prefix for every section', async () => {
    const captured: Captured[] = [];
    const client = new BrandClient({
      client: fakeClient(geminiReply(discoverResult), captured),
    });

    await client.deriveSection('discovery', '{"a":1}', DiscoverResultSchema);
    await client.deriveSection('positioning', '{"a":1}', DiscoverResultSchema);

    const prefixOf = (s: string) => s.slice(0, METHODOLOGY.length);
    assert.equal(
      prefixOf(captured[0]!.config.systemInstruction),
      prefixOf(captured[1]!.config.systemInstruction),
    );
    assert.notEqual(captured[0]!.config.systemInstruction, captured[1]!.config.systemInstruction);
  });

  it('carries the state in the user turn, not the system instruction', async () => {
    const { request } = await derive(geminiReply(discoverResult));

    assert.match(request.contents as string, /<brand_state>/);
    assert.match(request.contents as string, /Derive the `discovery` section/);
    assert.doesNotMatch(request.config.systemInstruction as string, /<brand_state>/);
  });

  it('requests JSON constrained by the section schema', async () => {
    const { request } = await derive(geminiReply(discoverResult));

    assert.equal(request.config.responseMimeType, 'application/json');
    const schema = request.config.responseJsonSchema as Record<string, any>;
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
    const { request } = await derive(geminiReply(discoverResult), {
      effort: 'low',
      maxTokens: 4000,
    });

    assert.equal(request.config.maxOutputTokens, 4000);
    // `low` disables thinking outright.
    assert.equal(request.config.thinkingConfig.thinkingBudget, 0);
  });

  it('raises the thinking budget with effort', async () => {
    const low = await derive(geminiReply(discoverResult), { effort: 'low' });
    const high = await derive(geminiReply(discoverResult), { effort: 'high' });

    assert.ok(
      high.request.config.thinkingConfig.thinkingBudget >
        low.request.config.thinkingConfig.thinkingBudget,
    );
  });

  it('sends a timeout signal, so a hung call cannot wait forever', async () => {
    const { request } = await derive(geminiReply(discoverResult));
    assert.ok(request.config.abortSignal instanceof AbortSignal);
  });
});

describe('the schema Gemini is given', () => {
  it('drops keywords Gemini does not support', () => {
    const schema = JSON.stringify(toGeminiSchema(DiscoverResultSchema));

    // `$schema` and `minLength` are not in Gemini's supported set; sending them either
    // does nothing or rejects the request.
    assert.ok(!schema.includes('$schema'));
    assert.ok(!schema.includes('minLength'));
  });

  it('keeps the keywords Gemini does support, so the constraints reach the model', () => {
    const schema = JSON.stringify(toGeminiSchema(sectionSchemas.personality));

    assert.ok(schema.includes('minItems'), 'array minimums should survive');
    assert.ok(schema.includes('required'), 'required fields should survive');
    assert.ok(schema.includes('description'), 'field guidance should survive');
  });

  it('inlines reused sub-schemas, so no field loses its description to a $ref', () => {
    const schema = JSON.stringify(toGeminiSchema(sectionSchemas.finalBrand));

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
      const properties = (toGeminiSchema(schema) as Record<string, any>).properties as Record<
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
    const { result } = await derive(geminiReply(discoverResult));

    assert.equal(result.value.problem, discoverResult.problem);
    assert.deepEqual(result.usage, {
      inputTokens: 1200,
      // Thinking tokens are billed as output, so they are counted there.
      outputTokens: 340,
      cacheCreationTokens: 0,
      cacheReadTokens: 900,
    });
  });

  it('reports a blocked prompt as a refusal', async () => {
    await assert.rejects(
      () =>
        derive({
          promptFeedback: { blockReason: 'SAFETY', blockReasonMessage: 'blocked' },
        }),
      (error: unknown) => {
        assert.ok(error instanceof RefusalError);
        assert.equal(error.category, 'SAFETY');
        return true;
      },
    );
  });

  it('reports a response stopped by a safety filter as a refusal', async () => {
    await assert.rejects(
      () => derive({ text: '', candidates: [{ finishReason: 'SAFETY' }] }),
      RefusalError,
    );
  });

  it('reports a truncated response instead of parsing half a section', async () => {
    await assert.rejects(
      () =>
        derive({
          text: '{"problem":',
          candidates: [{ finishReason: 'MAX_TOKENS' }],
        }),
      (error: unknown) => {
        assert.ok(error instanceof SectionParseError);
        assert.match(error.message, /cut off/);
        return true;
      },
    );
  });

  it('reports text that is not JSON as a parse failure', async () => {
    await assert.rejects(
      () => derive({ text: 'Here is your brand!', candidates: [{ finishReason: 'STOP' }] }),
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
      () => derive(geminiReply({ problem: '', targetAudience: 'a' })),
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
      () => derive({ text: '', candidates: [{ finishReason: 'STOP' }] }),
      /was empty/,
    );
  });

  it('reports a missing candidate as an API failure', async () => {
    await assert.rejects(() => derive({ text: '{}', candidates: [] }), ModelRequestError);
  });
});

describe('how BrandClient reports transport failures', () => {
  it('reports a rejected key distinctly from other failures', async () => {
    const fail = () => {
      throw Object.assign(new Error('API key not valid. Please pass a valid API key.'), {
        status: 400,
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
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      assert.throws(() => new BrandClient(), /GEMINI_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
    }
  });

  it('constructs with an injected client even when no key is set', () => {
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      assert.ok(new BrandClient({ client: fakeClient(geminiReply({}), []) }));
    } finally {
      if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
    }
  });
});
