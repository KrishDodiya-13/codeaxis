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
      return fail(502, 'model_refused', error.message, { retryable: true });
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
  const configured =
    (process.env.ANTHROPIC_API_KEY ?? '') !== '' || (process.env.ANTHROPIC_AUTH_TOKEN ?? '') !== '';

  if (!configured) {
    // Fails before the stage runs, so the message names the cause instead of surfacing
    // an SDK error from three layers down.
    throw new UpstreamUnavailableError(
      'No model credential is configured on the server. Set ANTHROPIC_API_KEY.',
    );
  }
}

/** Thrown when a dependency the server needs is not configured or reachable. */
export class UpstreamUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamUnavailableError';
  }
}
