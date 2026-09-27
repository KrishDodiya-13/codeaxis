import { NextResponse } from 'next/server'
import {
  BrandClient,
  InvalidCredentialError,
  MissingCredentialError,
  ModelRequestError,
  ModelTimeoutError,
  RefusalError,
  SchemaValidationError,
  SectionParseError,
  discover,
} from 'brandstate'
import { DiscoverRequestSchema, DiscoverResultSchema } from '@/lib/discovery'
import { credentialProblem } from '@/lib/api/credentials'

/*
 * POST /api/discover — run the discovery stage.
 *
 * This used to proxy over HTTP to a separate `brandstate serve` process on port 8787.
 * That is why the page kept showing "the engine isn't reachable": the second process
 * has to be started by hand, on a non-default port, before the app works at all. It
 * also contradicted the architecture rule against separate AI servers.
 *
 * The engine is a library dependency, so this route now calls it in-process. One
 * server, nothing to start, and the model key still never leaves it. The request and
 * response shapes are unchanged, so the page needs no edit.
 */

// The engine uses node:crypto, so this must not run on the edge runtime.
export const runtime = 'nodejs'

// A model call at high effort can take a while; give up well before a user would.
export const maxDuration = 300

/** True in development, where showing the real backend error is worth more than hiding it. */
const isDev = process.env.NODE_ENV !== 'production'

function error(status: number, message: string, detail?: unknown) {
  if (!isDev || detail === undefined) return NextResponse.json({ error: message }, { status })

  // In development the real cause is folded into `error` as well as sent as `detail`.
  // The page renders `error` and nothing else, so putting it there is what actually
  // gets the actionable message in front of whoever is debugging.
  const summary = typeof detail === 'string' ? detail : JSON.stringify(detail)
  return NextResponse.json({ error: `${message} — ${summary}`, detail }, { status })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return error(400, 'The request body must be JSON.')
  }

  const input = DiscoverRequestSchema.safeParse(body)
  if (!input.success) {
    return error(
      400,
      'That request is missing the idea or has a malformed field.',
      input.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
    )
  }

  // Checked before the call so the message names the cause, rather than surfacing an
  // SDK auth error from three layers down. This is the next thing a fresh clone hits.
  const credentialIssue = credentialProblem()
  if (credentialIssue !== null) return error(503, credentialIssue)

  const { idea, discovery: priorDiscovery, answers } = input.data

  let result: Awaited<ReturnType<typeof discover>>
  try {
    result = await discover(new BrandClient(), {
      idea,
      ...(priorDiscovery === undefined ? {} : { priorDiscovery }),
      ...(answers === undefined ? {} : { answers }),
    })
  } catch (e) {
    // Each failure gets its own diagnosis, because each one has a different remedy.

    // A safety filter declined. Retrying the same request will not help.
    if (e instanceof RefusalError) {
      return error(502, 'The model declined this request.', e.message)
    }
    // The key is configured but Groq rejected it — distinct from no key at all.
    if (e instanceof InvalidCredentialError) {
      console.error('[brandos] groq rejected the key')
      return error(503, 'Groq rejected the API key. Check GROQ_API_KEY in web/.env.local.', e.message)
    }
    if (e instanceof MissingCredentialError) {
      return error(503, e.message)
    }
    // Took too long. The user's answers are kept, so retrying is safe.
    if (e instanceof ModelTimeoutError) {
      return error(504, 'The model took too long to answer. Your answers are kept — try again.', e.message)
    }
    // Valid JSON, wrong shape. Checked before SectionParseError, which it extends.
    if (e instanceof SchemaValidationError) {
      return error(502, 'The model returned JSON that does not match the discovery schema.', e.issues)
    }
    // Not JSON at all, or cut off.
    if (e instanceof SectionParseError) {
      return error(502, 'The model returned something unexpected. Try again.', e.message)
    }
    // A rate limit is its own diagnosis: the remedy is to wait or change model, not to
    // retry immediately, so it must not hide behind a generic "unavailable".
    if (e instanceof ModelRequestError && e.status === 429) {
      return error(429, 'Groq rate limit or quota reached. Wait, or set GROQ_MODEL to another model.', e.message)
    }
    // Server error or network. The provider's own message is carried in `detail`.
    if (e instanceof ModelRequestError) {
      return error(502, 'The Groq request failed.', e.message)
    }

    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    console.error('[brandos] discovery failed', e)
    return error(502, 'Discovery failed. Your answers are kept — try again.', detail)
  }

  // Validate again at this boundary. The engine already constrains the model, but this
  // route is what the browser trusts, and malformed data must never reach the page.
  const parsed = DiscoverResultSchema.safeParse(result.value)
  if (!parsed.success) {
    return error(
      502,
      'The engine returned something unexpected. Try again.',
      parsed.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
    )
  }

  return NextResponse.json(parsed.data)
}
