/**
 * Integration tests for the endpoint.
 *
 * These start a real server on an ephemeral port and call it over HTTP with a
 * stub deriver, so routing, body handling and status codes are exercised end to
 * end without an API key.
 */
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { RefusalError, SectionParseError } from '../src/client.ts';
import type { SectionDeriver } from '../src/client.ts';
import { createDiscoverServer, listen } from '../src/server.ts';
import {
  StubDeriver,
  completeState,
  discoverResult,
  indistinctCandidates,
  positionResult,
} from './fixtures.ts';
import { toPositionResponse } from '../src/position.ts';

let server: Server;
let baseUrl: string;
const logs: string[] = [];

/** Swapped per test, so one server can stand in for different backends. */
let deriver: SectionDeriver = new StubDeriver();

before(async () => {
  server = createDiscoverServer({
    deriver: {
      deriveSection: (...args) => deriver.deriveSection(...args),
    },
    log: (message) => logs.push(message),
  });
  const port = await listen(server, 0);
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

async function postTo(
  path: string,
  body: unknown,
  raw?: string,
): Promise<{ status: number; json: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: text === '' ? null : JSON.parse(text) };
}

const post = (body: unknown, raw?: string) => postTo('/api/discover', body, raw);
const postPosition = (body: unknown, raw?: string) => postTo('/api/position', body, raw);
const postBattle = (body: unknown, raw?: string) => postTo('/api/battle', body, raw);
const postStress = (body: unknown, raw?: string) => postTo('/api/stress-test', body, raw);

/** A settled discovery, so the POSITION guard lets it through. */
function settledDiscovery() {
  return { ...completeState().discovery, openQuestions: [] };
}

describe('POST /api/discover', () => {
  it('returns the discovery object for a bare idea', async () => {
    deriver = new StubDeriver();
    const { status, json } = await post({
      idea: 'I want to build an app for students to find hackathon teammates',
    });

    assert.equal(status, 200);
    assert.deepEqual(json, discoverResult);
  });

  it('returns exactly the discovery object, with no envelope around it', async () => {
    deriver = new StubDeriver();
    const { json } = await post({ idea: 'an idea' });

    assert.deepEqual(Object.keys(json).sort(), [
      'assumptions',
      'constraints',
      'followUpQuestions',
      'goals',
      'missingInformation',
      'problem',
      'targetAudience',
      'userNeed',
    ]);
  });

  it('accepts a re-invocation with the prior object and answers', async () => {
    const stub = new StubDeriver();
    deriver = stub;

    const { status } = await post({
      idea: 'an idea',
      discovery: discoverResult,
      answers: { 'Is the buyer the owner or an operations lead?': 'the owner' },
    });

    assert.equal(status, 200);
    assert.match(stub.calls[0]!.userPrompt!, /<prior_discovery>/);
    assert.match(stub.calls[0]!.userPrompt!, /A: the owner/);
  });

  it('rejects a missing idea with a 400 that says what is wrong', async () => {
    deriver = new StubDeriver();
    const { status, json } = await post({});

    assert.equal(status, 400);
    assert.match(json.error, /"idea" is required/);
  });

  it('rejects an unparseable body with a 400', async () => {
    deriver = new StubDeriver();
    const { status, json } = await post(undefined, '{ not json');

    assert.equal(status, 400);
    assert.match(json.error, /not valid JSON/);
  });

  it('rejects an empty body with a 400', async () => {
    deriver = new StubDeriver();
    const { status, json } = await post(undefined, '');

    assert.equal(status, 400);
    assert.match(json.error, /must be a JSON object|"idea" is required/);
  });

  it('rejects answers sent without the object they answer', async () => {
    deriver = new StubDeriver();
    const { status, json } = await post({ idea: 'an idea', answers: 'the owner' });

    assert.equal(status, 400);
    assert.match(json.error, /only makes sense alongside/);
  });

  it('reports a model refusal as a 502, not a client error', async () => {
    deriver = {
      deriveSection: async () => {
        throw new RefusalError('discovery', 'cyber', 'declined');
      },
    };

    const { status, json } = await post({ idea: 'an idea' });
    assert.equal(status, 502);
    assert.match(json.error, /declined/);
  });

  it('reports an unusable model response as a 502', async () => {
    deriver = {
      deriveSection: async () => {
        throw new SectionParseError('discovery', 'the response did not match the schema.');
      },
    };

    const { status, json } = await post({ idea: 'an idea' });
    assert.equal(status, 502);
    assert.match(json.error, /did not match the schema/);
  });

  it('returns a 500 for an unexpected failure, without leaking internals', async () => {
    deriver = {
      deriveSection: async () => {
        throw new Error('a secret internal detail');
      },
    };

    const { status, json } = await post({ idea: 'an idea' });
    assert.equal(status, 500);
    assert.equal(json.error, 'Internal server error.');
    assert.doesNotMatch(JSON.stringify(json), /secret internal detail/);
  });

  it('logs each request with its outcome', async () => {
    deriver = new StubDeriver();
    logs.length = 0;
    await post({ idea: 'an idea' });

    assert.equal(logs.length, 1);
    assert.match(logs[0]!, /POST \/api\/discover 200/);
    assert.match(logs[0]!, /gaps=1/);
  });
});

describe('POST /api/position', () => {
  it('returns the positioning object for a settled discovery', async () => {
    deriver = new StubDeriver();
    const { status, json } = await postPosition({ discovery: settledDiscovery() });

    assert.equal(status, 200);
    assert.deepEqual(json, toPositionResponse(positionResult));
  });

  it('accepts a bare discovery object, which is what Phase 2 returns', async () => {
    deriver = new StubDeriver();
    const { status } = await postPosition(settledDiscovery());
    assert.equal(status, 200);
  });

  it('never returns the internal category self-check', async () => {
    deriver = new StubDeriver();
    const { json } = await postPosition({ discovery: settledDiscovery() });

    assert.equal(json.categoryCheck, undefined);
    assert.deepEqual(Object.keys(json).sort(), [
      'audience',
      'category',
      'competitiveAngle',
      'differentiator',
      'problem',
      'rationale',
      'valueProposition',
    ]);
  });

  it('returns a 422 with the unresolved questions when discovery is unfinished', async () => {
    deriver = new StubDeriver();
    const openQuestions = ['Is the buyer the owner or an operations lead?'];
    const { status, json } = await postPosition({
      discovery: { ...settledDiscovery(), openQuestions },
    });

    assert.equal(status, 422);
    assert.deepEqual(json.openQuestions, openQuestions);
    assert.match(json.error, /forceProceed/);
  });

  it('proceeds past open questions when forceProceed is set', async () => {
    deriver = new StubDeriver();
    const { status } = await postPosition({
      discovery: { ...settledDiscovery(), openQuestions: ['Which platform first?'] },
      forceProceed: true,
    });

    assert.equal(status, 200);
  });

  it('rejects an invalid discovery object with a 400', async () => {
    deriver = new StubDeriver();
    const { status, json } = await postPosition({ discovery: { problem: 'only this' } });

    assert.equal(status, 400);
    assert.match(json.error, /targetAudience/);
  });

  it('rejects a bad flag with a 400', async () => {
    deriver = new StubDeriver();
    const { status, json } = await postPosition({
      discovery: settledDiscovery(),
      forceProceed: 'yes',
    });

    assert.equal(status, 400);
    assert.match(json.error, /"forceProceed" must be a boolean/);
  });

  it('reports a category that stayed vague as a 502, with what it could describe', async () => {
    const vague = {
      ...positionResult,
      category: 'Collaborative discovery platform',
      categoryCheck: { couldDescribeUnrelatedProducts: true, unrelatedProducts: ['Notion', 'Figma'] },
    };
    deriver = { deriveSection: async () => ({ value: vague, usage: { inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0 } }) } as never;

    const { status, json } = await postPosition({ discovery: settledDiscovery() });

    assert.equal(status, 502);
    assert.equal(json.category, 'Collaborative discovery platform');
    assert.deepEqual(json.couldAlsoDescribe, ['Notion', 'Figma']);
  });

  it('logs the category and whether the audience was narrowed', async () => {
    deriver = new StubDeriver();
    logs.length = 0;
    await postPosition({ discovery: settledDiscovery() });

    assert.equal(logs.length, 1);
    assert.match(logs[0]!, /POST \/api\/position 200/);
    assert.match(logs[0]!, /category="Productisation tool for service agencies"/);
    assert.match(logs[0]!, /narrowed=true/);
  });
});

describe('POST /api/battle', () => {
  it('returns a bare array of strategies, one per direction', async () => {
    deriver = new StubDeriver();
    const { status, json } = await postBattle({ discovery: settledDiscovery() });

    assert.equal(status, 200);
    assert.ok(Array.isArray(json));
    assert.equal(json.length, 3);
    assert.deepEqual(
      json.map((option: { direction: string }) => option.direction),
      ['CONNECTION', 'COMPETITION', 'TRUST'],
    );
  });

  it('returns only the documented fields, with no internal comparison fields', async () => {
    deriver = new StubDeriver();
    const { json } = await postBattle({ discovery: settledDiscovery() });

    assert.deepEqual(Object.keys(json[0]).sort(), [
      'audienceFit',
      'differentiation',
      'direction',
      'positioning',
      'rationale',
      'risks',
      'strengths',
    ]);
  });

  it('ranks nothing and recommends nothing', async () => {
    deriver = new StubDeriver();
    const { json } = await postBattle({ discovery: settledDiscovery() });

    for (const option of json) {
      for (const field of ['score', 'rank', 'recommended', 'isBest', 'winner']) {
        assert.equal(option[field], undefined, `strategy carried a ${field}`);
      }
    }
  });

  it('gives every strategy at least one risk', async () => {
    deriver = new StubDeriver();
    const { json } = await postBattle({ discovery: settledDiscovery() });

    for (const option of json) {
      assert.ok(option.risks.length > 0, `${option.direction} had no risk`);
    }
  });

  it('accepts forced directions', async () => {
    deriver = new StubDeriver();
    const { status } = await postBattle({
      discovery: settledDiscovery(),
      directions: ['CONNECTION', 'COMPETITION', 'TRUST'],
    });
    assert.equal(status, 200);
  });

  it('rejects an unknown direction with a 400 listing the real ones', async () => {
    deriver = new StubDeriver();
    const { status, json } = await postBattle({
      discovery: settledDiscovery(),
      directions: ['VIBES'],
    });

    assert.equal(status, 400);
    assert.match(json.error, /CONNECTION/);
  });

  it('rejects a missing discovery with a 400', async () => {
    deriver = new StubDeriver();
    const { status, json } = await postBattle({});

    assert.equal(status, 400);
    assert.match(json.error, /"discovery" is required/);
  });

  it('rejects a count that cannot be compared', async () => {
    deriver = new StubDeriver();
    const { status, json } = await postBattle({ discovery: settledDiscovery(), count: 1 });

    assert.equal(status, 400);
    assert.match(json.error, /between 2/);
  });

  it('reports strategies that stayed indistinct as a 502, with the collisions', async () => {
    deriver = {
      deriveSection: async (_section: string, _state: string, _schema: unknown, options?: { userPrompt?: string }) => ({
        value: options?.userPrompt?.includes('<other_strategies>')
          ? { strategy: indistinctCandidates[1] }
          : { strategies: indistinctCandidates },
        usage: { inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0 },
      }),
    } as never;

    const { status, json } = await postBattle({
      discovery: settledDiscovery(),
      directions: ['CONNECTION', 'OUTCOMES'],
    });

    assert.equal(status, 502);
    assert.match(json.error, /not meaningfully different/);
    assert.equal(json.collisions[0].direction, 'OUTCOMES');
  });

  it('logs the directions it produced', async () => {
    deriver = new StubDeriver();
    logs.length = 0;
    await postBattle({ discovery: settledDiscovery() });

    assert.match(logs[0]!, /POST \/api\/battle 200/);
    assert.match(logs[0]!, /directions=CONNECTION\/COMPETITION\/TRUST/);
  });
});

describe('POST /api/stress-test', () => {
  it('returns findings, a summary and the evaluated types', async () => {
    deriver = new StubDeriver();
    const { status, json } = await postStress({ brandState: completeState() });

    assert.equal(status, 200);
    assert.ok(Array.isArray(json.tests));
    assert.deepEqual(Object.keys(json).sort(), ['evaluatedTypes', 'summary', 'tests']);
  });

  it('computes the summary and the gate from the findings', async () => {
    deriver = new StubDeriver();
    const { json } = await postStress({ brandState: completeState() });

    assert.deepEqual(Object.keys(json.summary).sort(), [
      'blocksFinalization',
      'critical',
      'high',
      'low',
      'medium',
    ]);
    // The fixture carries one high finding, so the gate is closed.
    assert.equal(json.summary.high, 1);
    assert.equal(json.summary.blocksFinalization, true);
  });

  it('reports evaluatedTypes as flat strings, one per test', async () => {
    deriver = new StubDeriver();
    const { json } = await postStress({ brandState: completeState() });

    assert.equal(Object.keys(json.evaluatedTypes).length, 5);
    for (const value of Object.values(json.evaluatedTypes)) {
      assert.equal(typeof value, 'string');
    }
  });

  it('does not return the structured evaluations, which are library-only', async () => {
    deriver = new StubDeriver();
    const { json } = await postStress({ brandState: completeState() });
    assert.equal(json.evaluations, undefined);
  });

  it('honours a narrowed scope', async () => {
    deriver = new StubDeriver();
    const { status, json } = await postStress({
      brandState: completeState(),
      scope: ['cliché'],
    });

    assert.equal(status, 200);
    assert.deepEqual(Object.keys(json.evaluatedTypes), ['cliché']);
  });

  it('rejects an unknown test type with a 400', async () => {
    deriver = new StubDeriver();
    const { status, json } = await postStress({ brandState: completeState(), scope: ['vibes'] });

    assert.equal(status, 400);
    assert.match(json.error, /Unknown test type/);
  });

  it('rejects a missing brandState with a 400', async () => {
    deriver = new StubDeriver();
    const { status, json } = await postStress({});

    assert.equal(status, 400);
    assert.match(json.error, /"brandState" is required/);
  });

  it('rejects a state with no chosen direction with a 400', async () => {
    deriver = new StubDeriver();
    const state = completeState();
    delete state.selectedStrategy;

    const { status, json } = await postStress({ brandState: state });
    assert.equal(status, 400);
    assert.match(json.error, /Choose a direction first/);
  });

  it('reports findings that cannot be audited as a 502', async () => {
    const unusable = {
      tests: [
        {
          type: 'cliché',
          severity: 'low',
          issue: 'the copy is generic',
          evidence: 'the tone feels off',
          impact: 'it reads as generic',
          recommendation: 'rewrite it',
        },
      ],
      evaluatedTypes: [{ type: 'cliché', status: 'evaluated' }],
    };
    deriver = {
      deriveSection: async () => ({
        value: unusable,
        usage: { inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0 },
      }),
    } as never;

    const { status, json } = await postStress({ brandState: completeState(), scope: ['cliché'] });

    assert.equal(status, 502);
    assert.match(json.error, /cannot be audited/);
    assert.match(json.problems[0], /cites no BrandState field path/);
  });

  it('logs the finding counts and whether the gate is closed', async () => {
    deriver = new StubDeriver();
    logs.length = 0;
    await postStress({ brandState: completeState() });

    assert.match(logs[0]!, /POST \/api\/stress-test 200/);
    assert.match(logs[0]!, /findings=3/);
    assert.match(logs[0]!, /blocks=true/);
  });
});

describe('routing', () => {
  it('rejects a GET on the endpoint with a 405 and an Allow header', async () => {
    const response = await fetch(`${baseUrl}/api/discover`);
    assert.equal(response.status, 405);
    assert.match(response.headers.get('allow') ?? '', /POST/);
  });

  it('returns a 404 for an unknown path, naming the real endpoints', async () => {
    const response = await fetch(`${baseUrl}/api/nope`, { method: 'POST' });
    const json = (await response.json()) as { error: string };

    assert.equal(response.status, 404);
    assert.match(json.error, /POST \/api\/discover/);
    assert.match(json.error, /POST \/api\/position/);
    assert.match(json.error, /POST \/api\/battle/);
    assert.match(json.error, /POST \/api\/stress-test/);
  });

  it('rejects a GET on the position endpoint with a 405', async () => {
    const response = await fetch(`${baseUrl}/api/position`);
    assert.equal(response.status, 405);
    assert.match(response.headers.get('allow') ?? '', /POST/);
  });

  it('answers a health check', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });

  it('answers a CORS preflight, so a separate UI can call it', async () => {
    const response = await fetch(`${baseUrl}/api/discover`, { method: 'OPTIONS' });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/);
  });

  it('rejects a body over the size limit rather than buffering it', async () => {
    deriver = new StubDeriver();
    const { status, json } = await post(undefined, JSON.stringify({ idea: 'x'.repeat(1_100_000) }));

    assert.equal(status, 413);
    assert.match(json.error, /exceeds the/);
  });
});
