/**
 * One place that turns a thrown error into an HTTP response.
 *
 * Every route funnels through `handle`, so the failure shape is identical across the
 * API and the frontend has one error renderer rather than five. Two rules it enforces:
 * a thrown error never destroys project state (the stages are pure — they return a new
 * state, and nothing is persisted unless the stage succeeded), and an unrecognised
 * error becomes a generic 500 with the detail logged rather than returned.
 */
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import {
  InvalidCredentialError,
  MissingCredentialError,
  ModelRequestError,
  ModelTimeoutError,
  SchemaValidationError,
  BattleInputError,
  DiscoveryIncompleteError,
  IndistinctStrategiesError,
  InvalidDirectionsError,
  PositionInputError,
  DiscoverInputError,
  RefusalError,
  SectionParseError,
  VagueCategoryError,
} from 'brandstate';
import type { ApiErrorBody, ApiErrorCode } from '@/lib/api/contracts';
import { credentialProblem } from '@/lib/api/credentials';
import { CorruptBrandStateError, ProjectNotFoundError } from '@/lib/db/projects';

export function ok<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status });
}

export function fail(
  status: number,
  code: ApiErrorCode,
  error: string,
  extra: { details?: unknown; retryable?: boolean } = {},
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error, code, ...extra }, { status });
}

/** True in development, where the real cause is worth more than hiding it. */
const isDev = process.env.NODE_ENV !== 'production';

/**
 * The line of a Prisma message that actually says what went wrong.
 *
 * Prisma leads with an "Invalid `prisma.x.y()` invocation:" header, which names the
 * call rather than the cause — surfacing that would point a reader at the wrong thing.
 * The real reason is the first line after it.
 */
function causeLine(message: string): string {
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/invocation:$/.test(line));

  return lines[0] ?? message;
}

/** Formats a Zod error as field paths, which is what a form needs to highlight. */
function zodDetails(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Parses a request body, throwing a `ZodError` that `handle` turns into a 400.
 *
 * A body that is not JSON at all is reported as such rather than as a schema failure,
 * because the fix is different.
 */
export async function parseBody<T>(
  request: Request,
  schema: { parse(value: unknown): T },
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new BadRequestError('The request body is not valid JSON.');
  }
  return schema.parse(raw);
}

/** Thrown for a malformed request that is not a schema failure. */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

/**
 * Thrown when a request would discard a decision the user already approved.
 *
 * A 409 rather than a 400: the request is well-formed, it just needs confirming. The
 * `details` carry what would be lost so the UI can say so before asking again.
 */
export class ApprovedDecisionConflictError extends Error {
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(message: string, code: ApiErrorCode, details: unknown) {
    super(message);
    this.name = 'ApprovedDecisionConflictError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Runs a route handler and maps anything it throws to a response.
 *
 * The mapping is deliberate about which failures are the caller's fault (4xx) and which
 * are the model's or ours (5xx), because the frontend shows a retry button for one and
 * a fix-your-input message for the other.
 */
export async function handle<T>(run: () => Promise<NextResponse<T>>): Promise<NextResponse> {
  try {
    return await run();
  } catch (error) {
    /* ---- the caller's fault ---- */

    if (error instanceof ZodError) {
      return fail(400, 'invalid_request', 'The request body is not valid.', {
        details: zodDetails(error),
      });
    }
    if (error instanceof BadRequestError) {
      return fail(400, 'invalid_request', error.message);
    }
    if (
      error instanceof DiscoverInputError ||
      error instanceof PositionInputError ||
      error instanceof BattleInputError ||
      error instanceof InvalidDirectionsError
    ) {
      return fail(400, 'invalid_request', error.message);
    }
    if (error instanceof ProjectNotFoundError) {
      return fail(404, 'not_found', error.message);
    }

    /* ---- the request is fine, but it would undo an approved decision ---- */

    if (error instanceof ApprovedDecisionConflictError) {
      return fail(409, error.code, error.message, { details: error.details });
    }

    /* ---- the request is fine, but it is too early ---- */

    if (error instanceof DiscoveryIncompleteError) {
      // 422 rather than 400: nothing is wrong with the request, the work just is not
      // finished. The questions come back so the UI can ask them.
      return fail(422, 'discovery_incomplete', error.message, {
        details: { openQuestions: error.openQuestions },
      });
    }

    /* ---- the model did not produce something usable ---- */

    if (error instanceof RefusalError) {
      // A safety filter declined. Hammering the same button will not help.
      return fail(502, 'model_refused', error.message, { retryable: false });
    }
    if (error instanceof MissingCredentialError) {
      return fail(503, 'upstream_unavailable', error.message, { retryable: false });
    }
    if (error instanceof InvalidCredentialError) {
      // Distinct from "no key": the key is present and Groq rejected it.
      console.error('[brandos] groq rejected the key');
      return fail(503, 'model_key_invalid', error.message, { retryable: false });
    }
    if (error instanceof ModelTimeoutError) {
      return fail(504, 'model_timeout', error.message, { retryable: true });
    }
    if (error instanceof SchemaValidationError) {
      // The model answered in JSON but not in the required shape. Checked before
      // SectionParseError, which it extends.
      return fail(502, 'model_schema_invalid', error.message, {
        details: { issues: error.issues },
        retryable: true,
      });
    }
    if (error instanceof VagueCategoryError) {
      return fail(502, 'model_output_invalid', error.message, {
        details: { category: error.category, couldAlsoDescribe: error.unrelatedProducts },
        retryable: true,
      });
    }
    if (error instanceof IndistinctStrategiesError) {
      // The directions came back too alike even after rebuilding the offenders.
      // Retrying is worth a shot; returning them would defeat the point of the battle.
      return fail(502, 'directions_not_distinct', error.message, {
        details: { collisions: error.reasons },
        retryable: true,
      });
    }
    if (error instanceof SectionParseError) {
      return fail(502, 'model_output_invalid', error.message, { retryable: true });
    }
    if (error instanceof ModelRequestError) {
      // Rate limit, server error, network. Worth retrying.
      return fail(502, 'model_unavailable', error.message, { retryable: true });
    }

    /* ---- the database ---- */

    // Prisma cannot reach or authenticate against the database. Without the real
    // message this arrives as a bare 500, which says nothing a developer can act on —
    // and bad credentials and a missing database look identical from the outside.
    if (error instanceof Prisma.PrismaClientInitializationError) {
      console.error('[brandos] database unavailable', error.message);
      return fail(
        503,
        'database_unavailable',
        isDev
          ? `The database is not reachable: ${causeLine(error.message)} Check DATABASE_URL in web/.env.local.`
          : 'The database is not reachable.',
        { retryable: false },
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2021: the table does not exist, i.e. the migration has never been run. This is
      // the next thing a correctly-configured clone hits, so it gets the command.
      if (error.code === 'P2021' || error.code === 'P2022') {
        console.error('[brandos] schema not migrated', error.message);
        return fail(
          503,
          'database_not_migrated',
          'The database has no BRANDOS tables yet. Run `npx prisma migrate dev` in web/, then retry.',
          { retryable: false },
        );
      }
      // P2025: an operation expected a row that is not there.
      if (error.code === 'P2025') {
        return fail(404, 'not_found', 'That project no longer exists.');
      }
      console.error('[brandos] database error', error.code, error.message);
      return fail(500, 'internal_error', isDev ? `Database error ${error.code}.` : 'Something went wrong.', {
        retryable: true,
      });
    }

    /* ---- ours ---- */

    if (error instanceof UpstreamUnavailableError) {
      // A configuration problem, not a transient one, so retrying will not help.
      console.error('[brandos] upstream unavailable', error.message);
      return fail(503, 'upstream_unavailable', error.message, { retryable: false });
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      // DATABASE_URL missing or the database unreachable. Named here so the response
      // says what is wrong instead of a generic 500; the detail stays in the log.
      console.error('[brandos] database unavailable', error.message);
      return fail(
        503,
        'upstream_unavailable',
        'The database is not configured or not reachable. Check DATABASE_URL.',
        { retryable: true },
      );
    }
    if (error instanceof CorruptBrandStateError) {
      console.error('[brandos] corrupt brand state', error);
      return fail(500, 'internal_error', error.message);
    }

    // Anything unrecognised: log the detail, return none of it. An upstream error can
    // carry a request id or a prompt fragment, and neither belongs in a client response.
    console.error('[brandos] unhandled route error', error);
    return fail(500, 'internal_error', 'Something went wrong. Your project has not been changed.', {
      retryable: true,
    });
  }
}

/** A guard for routes that need a configured model credential. */
export function requireModelCredentials(): void {
  // Fails before the stage runs, so the message names the cause instead of surfacing an
  // SDK error from three layers down. The check itself lives in one place, shared with
  // /api/discover, so the routes cannot disagree about what counts as configured.
  const problem = credentialProblem();
  if (problem !== null) throw new UpstreamUnavailableError(problem);
}

/** Thrown when a dependency the server needs is not configured or reachable. */
export class UpstreamUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamUnavailableError';
  }
}
