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
import { StubDeriver, completeState, discoverResult, positionResult } from './fixtures.ts';
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
