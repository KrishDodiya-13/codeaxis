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
import { StubDeriver, discoverResult } from './fixtures.ts';

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

async function post(body: unknown, raw?: string): Promise<{ status: number; json: any }> {
  const response = await fetch(`${baseUrl}/api/discover`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: text === '' ? null : JSON.parse(text) };
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

describe('routing', () => {
  it('rejects a GET on the endpoint with a 405 and an Allow header', async () => {
    const response = await fetch(`${baseUrl}/api/discover`);
    assert.equal(response.status, 405);
    assert.match(response.headers.get('allow') ?? '', /POST/);
  });

  it('returns a 404 for an unknown path, naming the real endpoint', async () => {
    const response = await fetch(`${baseUrl}/api/nope`, { method: 'POST' });
    const json = (await response.json()) as { error: string };

    assert.equal(response.status, 404);
    assert.match(json.error, /POST \/api\/discover/);
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
