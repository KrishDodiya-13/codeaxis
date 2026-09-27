/**
 * Request-shape tests for `BrandClient`.
 *
 * These run against a fake transport rather than the API, so they need no
 * credentials. What they verify is the part a stub deriver cannot: that the
 * request body actually sent matches what the caching and structured-output
 * design intends, and that the response handling covers refusal and truncation.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { BrandClient, DEFAULT_MODEL, RefusalError, SectionParseError } from '../src/client.ts';
import { METHODOLOGY } from '../src/prompts.ts';
import {
  DiscoverResultSchema,
  DiscoverySchema,
  PositionResultSchema,
  StressTestsResultSchema,
  sectionSchemas,
} from '../src/schemas.ts';
import { SECTION_ORDER } from '../src/state.ts';
import { sectionFixtures } from './fixtures.ts';

type Captured = Record<string, any>;

/** A client whose transport records the request body and replays a canned response. */
function fakeClient(response: Record<string, unknown>, captured: Captured[]): Anthropic {
  return new Anthropic({
    apiKey: 'test-key-not-used',
    maxRetries: 0,
    fetch: async (_url, init) => {
      captured.push(JSON.parse(String((init as RequestInit).body)));
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
}

function messageResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: DEFAULT_MODEL,
    content: [{ type: 'text', text: JSON.stringify(sectionFixtures.discovery) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 1200,
      output_tokens: 340,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 900,
    },
    ...overrides,
  };
}

async function derive(
  response: Record<string, unknown>,
  options: { effort?: 'low' | 'high'; maxTokens?: number } = {},
) {
  const captured: Captured[] = [];
  const client = new BrandClient({ client: fakeClient(response, captured), ...options });
  const result = await client.deriveSection('discovery', '{"project":{"idea":"x"}}', DiscoverySchema);
  return { request: captured[0]!, result };
}

describe('the request BrandClient builds', () => {
  it('uses claude-opus-5 and adaptive thinking by default', async () => {
    const { request } = await derive(messageResponse());
    assert.equal(request.model, 'claude-opus-5');
    assert.deepEqual(request.thinking, { type: 'adaptive' });
    assert.equal(request.output_config.effort, 'high');
    assert.equal(request.max_tokens, 16000);
  });

  it('puts the cache breakpoint on the methodology block, ahead of the step instructions', async () => {
    const { request } = await derive(messageResponse());

    assert.equal(request.system.length, 2);
    assert.equal(request.system[0].text, METHODOLOGY);
    assert.deepEqual(request.system[0].cache_control, { type: 'ephemeral' });
    // The volatile half must sit after the breakpoint, or the prefix never hits.
    assert.equal(request.system[1].cache_control, undefined);
    assert.match(request.system[1].text, /This step: discovery/);
  });

  it('sends a byte-identical cached prefix for every section', async () => {
    const captured: Captured[] = [];
    const client = new BrandClient({ client: fakeClient(messageResponse(), captured) });

    await client.deriveSection('discovery', '{"a":1}', DiscoverySchema);
    await client.deriveSection('positioning', '{"a":1}', DiscoverySchema);

    assert.equal(captured[0]!.system[0].text, captured[1]!.system[0].text);
    assert.notEqual(captured[0]!.system[1].text, captured[1]!.system[1].text);
  });

  it('carries the state in the user turn, not the cached prefix', async () => {
    const { request } = await derive(messageResponse());
    const content = request.messages[0].content as string;

    assert.equal(request.messages.length, 1);
    assert.equal(request.messages[0].role, 'user');
    assert.match(content, /<brand_state>/);
    assert.match(content, /Derive the `discovery` section/);
  });

  it('requests the section as a JSON schema so the response is validated', async () => {
    const { request } = await derive(messageResponse());
    const format = request.output_config.format;

    assert.equal(format.type, 'json_schema');
    assert.deepEqual(Object.keys(format.schema.properties).sort(), [
      'assumptions',
      'constraints',
      'goals',
      'openQuestions',
      'problem',
      'targetAudience',
      'userNeed',
    ]);
    // The field guidance in schemas.ts must survive into the schema the model
    // sees. Reusing one string-schema instance across fields would collapse
    // these into a shared $ref and drop the descriptions.
    assert.match(format.schema.properties.targetAudience.description, /exclude someone/);
    assert.match(format.schema.properties.problem.description, /from the user side/);
    assert.match(format.schema.properties.userNeed.description, /underlying need/);
  });

  it('describes every field of every model-facing schema, with none lost to deduplication', () => {
    // Two steps do not ask for their BrandState section directly: discovery asks
    // for a DISCOVER result and positioning for a POSITION result, each mapped
    // afterwards. This checks what is actually sent, which is the only thing the
    // descriptions matter for.
    const modelFacing: Record<string, z.ZodType> = {
      discovery: DiscoverResultSchema,
      positioning: PositionResultSchema,
      stressTests: StressTestsResultSchema,
      shape: sectionSchemas.shape,
      visualDirection: sectionSchemas.visualDirection,
      selectedStrategy: sectionSchemas.selectedStrategy,
      consistency: sectionSchemas.consistency,
      finalBrand: sectionSchemas.finalBrand,
    };

    // Every section must be covered, so adding one cannot skip this check.
    assert.deepEqual(Object.keys(modelFacing).sort(), [...SECTION_ORDER].sort());

    for (const [section, schema] of Object.entries(modelFacing)) {
      const properties = (zodOutputFormat(schema).schema as Record<string, any>).properties as Record<
        string,
        any
      >;
      const undescribed = Object.entries(properties)
        .filter(([, property]) => typeof property.description !== 'string' || property.description === '')
        .map(([name]) => name);

      assert.deepEqual(undescribed, [], `${section}: fields with no description: ${undescribed.join(', ')}`);
    }
  });

  it('honours an explicit effort and token cap', async () => {
    const { request } = await derive(messageResponse(), { effort: 'low', maxTokens: 4000 });
    assert.equal(request.output_config.effort, 'low');
    assert.equal(request.max_tokens, 4000);
  });
});

describe('how BrandClient reads the response', () => {
  it('returns the parsed section and the usage', async () => {
    const { result } = await derive(messageResponse());

    assert.equal(result.value.problem, sectionFixtures.discovery.problem);
    assert.deepEqual(result.usage, {
      inputTokens: 1200,
      outputTokens: 340,
      cacheCreationTokens: 0,
      cacheReadTokens: 900,
    });
  });

  it('reports a refusal with its category rather than returning nothing', async () => {
    await assert.rejects(
      () =>
        derive(
          messageResponse({
            content: [],
            stop_reason: 'refusal',
            stop_details: { type: 'refusal', category: 'cyber', explanation: 'declined' },
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof RefusalError);
        assert.equal(error.category, 'cyber');
        return true;
      },
    );
  });

  it('reports a truncated response instead of parsing half a section', async () => {
    await assert.rejects(
      () => derive(messageResponse({ stop_reason: 'max_tokens' })),
      (error: unknown) => {
        assert.ok(error instanceof SectionParseError);
        assert.match(error.message, /cut off/);
        return true;
      },
    );
  });

  it('reports a response that does not match the schema', async () => {
    await assert.rejects(
      () => derive(messageResponse({ content: [{ type: 'text', text: '{"problem":' }] })),
      (error: unknown) => {
        assert.ok(error instanceof SectionParseError);
        assert.equal(error.section, 'discovery');
        return true;
      },
    );
  });
});
