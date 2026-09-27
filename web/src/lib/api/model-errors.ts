import { NextResponse } from 'next/server'
import {
  BattleInputError,
  IndistinctStrategiesError,
  InvalidCredentialError,
  InvalidDirectionsError,
  MissingCredentialError,
  MissingDependencyError,
  ModelRequestError,
  ModelTimeoutError,
  PositionInputError,
  RefusalError,
  SchemaValidationError,
  SectionParseError,
  StrategySelectionRequiredError,
  VagueCategoryError,
} from 'brandstate'

/*
 * Maps an engine failure to a response the strategy page can show as-is.
 *
 * The body is `{ error }`, the same shape /api/discover returns, so the pages share one
 * error renderer. Each failure gets its own message because each has a different
 * remedy: fix the key, wait out a rate limit, retry a malformed answer, or finish an
 * earlier stage.
 */

/** True in development, where showing the real backend error is worth more than hiding it. */
const isDev = process.env.NODE_ENV !== 'production'

export function errorResponse(status: number, message: string, detail?: unknown) {
  if (!isDev || detail === undefined) return NextResponse.json({ error: message }, { status })
  const summary = typeof detail === 'string' ? detail : JSON.stringify(detail)
  return NextResponse.json({ error: `${message} — ${summary}`, detail }, { status })
}

export function modelErrorResponse(e: unknown, stageLabel: string) {
  // The caller's fault, or the stage is too early: retrying the same request won't help.
  if (e instanceof MissingDependencyError || e instanceof StrategySelectionRequiredError) {
    return errorResponse(400, e.message)
  }
  if (
    e instanceof BattleInputError ||
    e instanceof InvalidDirectionsError ||
    e instanceof PositionInputError
  ) {
    return errorResponse(400, e.message)
  }

  // The model answered, but not with something usable. Worth another try.
  if (e instanceof IndistinctStrategiesError) {
    return errorResponse(502, 'The directions came back too similar to compare. Try again.', e.reasons)
  }
  if (e instanceof VagueCategoryError) {
    return errorResponse(502, 'The category came back too vague to position against. Try again.', e.message)
  }
  if (e instanceof RefusalError) {
    return errorResponse(502, 'The model declined this request.', e.message)
  }
  if (e instanceof InvalidCredentialError) {
    console.error('[brandos] groq rejected the key')
    return errorResponse(503, 'Groq rejected the API key. Check GROQ_API_KEY in web/.env.local.', e.message)
  }
  if (e instanceof MissingCredentialError) {
    return errorResponse(503, e.message)
  }
  if (e instanceof ModelTimeoutError) {
    return errorResponse(504, 'The model took too long to answer. Nothing was changed — try again.', e.message)
  }
  // Valid JSON, wrong shape. Checked before SectionParseError, which it extends.
  if (e instanceof SchemaValidationError) {
    return errorResponse(502, `The model's ${stageLabel} did not match the expected structure. Try again.`, e.issues)
  }
  if (e instanceof SectionParseError) {
    return errorResponse(502, 'The model returned something unexpected. Try again.', e.message)
  }
  // Groq's per-minute token cap on the free tier. Brand Battle can exceed it when it has
  // to rebuild two directions that came out too alike, so a retry often gets through.
  if (e instanceof ModelRequestError && e.status === 413) {
    return errorResponse(
      429,
      `This ${stageLabel} request was larger than your Groq tier's per-minute token limit. Wait a minute and try again, or upgrade the Groq tier.`,
      e.message,
    )
  }
  if (e instanceof ModelRequestError && e.status === 429) {
    return errorResponse(429, 'Groq rate limit or quota reached. Wait, or set GROQ_MODEL to another model.', e.message)
  }
  if (e instanceof ModelRequestError) {
    return errorResponse(502, 'The Groq request failed.', e.message)
  }

  const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
  console.error(`[brandos] ${stageLabel} failed`, e)
  return errorResponse(502, `${stageLabel} failed. Nothing was changed — try again.`, detail)
}
