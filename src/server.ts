/**
 * The HTTP surface: `POST /api/discover`.
 *
 * Built on `node:http` so the service pulls in no framework. The handler is
 * exported separately from the server so tests can drive it directly, and the
 * deriver is injected so it can be driven without an API key.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { BrandClient, RefusalError, SectionParseError } from './client.ts';
import type { BrandClientOptions, SectionDeriver } from './client.ts';
import { DiscoverInputError, discover, validateDiscoverRequest } from './discover.ts';
import {
  DiscoveryIncompleteError,
  PositionInputError,
  VagueCategoryError,
  detectsAudienceNarrowing,
  position,
  validatePositionRequest,
} from './position.ts';
import type { PositionOptions } from './position.ts';

/** Requests larger than this are rejected rather than buffered. */
const MAX_BODY_BYTES = 1_000_000;

export type ServerOptions = {
  /** Defaults to a `BrandClient` built from the model options. */
  deriver?: SectionDeriver;
  /** Log lines for each request. Defaults to writing to stderr. */
  log?: (message: string) => void;
  /**
   * Options for POSITION, including the optional competitor lookup. Omitted
   * entirely, POSITION does no external lookups — which is the supported default.
   */
  position?: PositionOptions;
} & BrandClientOptions;

export function createDiscoverServer(options: ServerOptions = {}): Server {
  const { deriver: injected, log, position: positionOptions = {}, model, effort, maxTokens, client } = options;
  const deriver = injected ?? new BrandClient({ model, effort, maxTokens, client });
  const write = log ?? ((message: string) => process.stderr.write(`${message}\n`));

  return createServer((request, response) => {
    handle(request, response, deriver, write, positionOptions).catch((error: unknown) => {
      // The handler deals with expected failures itself; reaching here means a
      // bug, so log it and return a generic 500 rather than leaking internals.
      write(`unhandled error: ${String(error)}`);
      if (!response.headersSent) sendJson(response, 500, { error: 'Internal server error.' });
      else response.end();
    });
  });
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  deriver: SectionDeriver,
  log: (message: string) => void,
  positionOptions: PositionOptions,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const route = `${request.method} ${url.pathname}`;

  // Permissive CORS, so a separate UI dev server can call this without a proxy.
  // The endpoint holds no session and no credentials of the caller's, so there
  // is nothing here for a cross-origin caller to escalate. Narrow it before
  // exposing the service anywhere but localhost.
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }

  if (url.pathname === '/health') {
    sendJson(response, request.method === 'GET' ? 200 : 405, { status: 'ok' });
    return;
  }

  if (url.pathname !== '/api/discover' && url.pathname !== '/api/position') {
    sendJson(response, 404, {
      error: `No route for ${url.pathname}. The endpoints are POST /api/discover and POST /api/position.`,
    });
    return;
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST, OPTIONS');
    sendJson(response, 405, { error: `POST ${url.pathname}. Other methods are not supported.` });
    return;
  }

  let body: string;
  try {
    const read = await readBody(request);
    if (read.overflowed) {
      log(`${route} 413 body over ${MAX_BODY_BYTES} bytes`);
      sendJson(response, 413, {
        error: `The request body exceeds the ${MAX_BODY_BYTES}-byte limit.`,
      });
      return;
    }
    body = read.body;
  } catch (error) {
    sendJson(response, 400, { error: `Could not read the request body: ${(error as Error).message}` });
    return;
  }

  let parsed: unknown;
  try {
    parsed = body.trim() === '' ? undefined : JSON.parse(body);
  } catch (error) {
    sendJson(response, 400, { error: `The request body is not valid JSON: ${(error as Error).message}` });
    return;
  }

  const startedAt = Date.now();
  try {
    if (url.pathname === '/api/discover') {
      const result = await discover(deriver, validateDiscoverRequest(parsed));

      log(
        `${route} 200 ${Date.now() - startedAt}ms ` +
          `gaps=${result.value.missingInformation.length} ` +
          `tokens=${result.usage.inputTokens}/${result.usage.outputTokens}`,
      );

      // The body is exactly the discovery object, as the spec defines it. A
      // caller decides sufficiency with `missingInformation.length === 0`.
      sendJson(response, 200, result.value);
      return;
    }

    const positionRequest = validatePositionRequest(parsed);
    const result = await position(deriver, positionRequest, positionOptions);

    const narrowed = detectsAudienceNarrowing(
      positionRequest.discovery.targetAudience,
      result.value.audience,
    );

    log(
      `${route} 200 ${Date.now() - startedAt}ms ` +
        `category="${result.value.category}" ` +
        `narrowed=${narrowed} ` +
        `assumed=${result.value.assumptionsUsed?.length ?? 0} ` +
        `tokens=${result.usage.inputTokens}/${result.usage.outputTokens}`,
    );

    sendJson(response, 200, result.value);
  } catch (error) {
    if (error instanceof DiscoverInputError || error instanceof PositionInputError) {
      log(`${route} 400 ${error.message}`);
      sendJson(response, 400, { error: error.message });
      return;
    }
    if (error instanceof DiscoveryIncompleteError) {
      // Not a malformed request — a request made too early. The unresolved
      // questions go back so the caller can put them to the user.
      log(`${route} 422 ${error.openQuestions.length} open questions`);
      sendJson(response, 422, {
        error: error.message,
        openQuestions: error.openQuestions,
      });
      return;
    }
    if (error instanceof VagueCategoryError) {
      log(`${route} 502 vague category "${error.category}"`);
      sendJson(response, 502, {
        error: error.message,
        category: error.category,
        couldAlsoDescribe: error.unrelatedProducts,
      });
      return;
    }
    if (error instanceof RefusalError || error instanceof SectionParseError) {
      // The request was well-formed; the upstream model call did not produce a
      // usable answer, which is a bad gateway rather than a client error.
      log(`${route} 502 ${error.message}`);
      sendJson(response, 502, { error: error.message });
      return;
    }
    throw error;
  }
}

/**
 * Buffers the request body, up to a limit.
 *
 * Past the limit it stops buffering but keeps draining, so the 413 can be
 * written and read normally. Destroying the socket the moment the limit is hit
 * loses the response — the client sees a connection reset instead of the status
 * code. Draining is itself capped, so a client that will not stop is cut off.
 */
function readBody(request: IncomingMessage): Promise<{ body: string; overflowed: boolean }> {
  const DRAIN_LIMIT = MAX_BODY_BYTES * 10;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let overflowed = false;

    request.on('data', (chunk: Buffer) => {
      size += chunk.length;

      if (size > MAX_BODY_BYTES) {
        overflowed = true;
        chunks.length = 0;
        if (size > DRAIN_LIMIT) {
          resolve({ body: '', overflowed: true });
          request.destroy();
        }
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8'), overflowed }));
    request.on('error', reject);
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

/** Starts the server and resolves with the port it bound to. */
export function listen(server: Server, port: number, host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve(typeof address === 'object' && address !== null ? address.port : port);
    });
  });
}
