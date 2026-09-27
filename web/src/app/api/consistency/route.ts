import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  BrandStateFileSchema,
  CONSISTENCY_DIMENSIONS,
  ConsistencyInputError,
  UncheckableConsistencyError,
  applyDelta,
  buildBrandDna,
  checkConsistency,
  hasDanglingSelection,
  migrateState,
  needsMigration,
  resolveAiMode,
  type BrandState,
} from 'brandstate'
import { credentialProblem } from '@/lib/api/credentials'
import { guardAiRoute } from '@/lib/api/ai-guard'
import { errorResponse, modelErrorResponse } from '@/lib/api/model-errors'
import { deriverFor } from '@/lib/ai/deriver'
import { mockContentCheck, runContentCheck } from '@/lib/ai/content-check'
import { ContentCheckRequestSchema } from '@/lib/ai/content-check-schema'

/*
 * POST /api/consistency — the Consistency page's two checks. Stateless, like
 * /api/strategy: the page sends the BrandState it holds.
 *
 *   { action: 'content', state, content }  one piece of real copy against the Brand DNA
 *   { action: 'brand', state }             does the brand agree with itself? (engine)
 *
 * Neither check edits a decision. A content repair changes the user's copy, never the
 * brand; a self-check correction is a proposal the user acts on in Strategy.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

const RequestSchema = z.discriminatedUnion('action', [
  ContentCheckRequestSchema,
  z.object({ action: z.literal('brand'), state: z.unknown() }).strict(),
])

function issues(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }))
}

/** The browser's state is user input: bring an old one forward, then validate it. */
function parseState(value: unknown): BrandState | NextResponse {
  const raw = needsMigration(value) ? migrateState(value).state : value
  const parsed = BrandStateFileSchema.safeParse(raw)
  if (!parsed.success) return errorResponse(400, 'The saved brand is not a valid brand state.', issues(parsed.error))
  const state = parsed.data as BrandState
  if (hasDanglingSelection(state)) return errorResponse(400, 'The chosen direction is not one of the generated options.')
  return state
}

export async function POST(request: Request) {
  // Authentication and the per-user quota limit, before anything is parsed or spent.
  // Server-side: a frontend check would be advisory.
  const guard = await guardAiRoute('consistency')
  if (guard.response !== undefined) return guard.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, 'The request body must be JSON.')
  }

  const input = RequestSchema.safeParse(body)
  if (!input.success) {
    const first = input.error.issues[0]
    return errorResponse(400, first?.message && first.path.includes('content') ? first.message : 'That request has a missing or malformed field.', issues(input.error))
  }

  const state = parseState(input.data.state)
  if (state instanceof NextResponse) return state
  if (!state.selectedStrategy) {
    return errorResponse(400, 'Choose a direction in Strategy first — there is no Brand DNA to check against yet.')
  }

  const mock = resolveAiMode() === 'mock'
  const credentialIssue = mock ? null : credentialProblem()
  if (credentialIssue !== null) return errorResponse(503, credentialIssue)

  if (input.data.action === 'content') {
    const { content } = input.data
    try {
      const result = mock ? mockContentCheck(state, content) : await runContentCheck(deriverFor(state), state, content)
      return NextResponse.json({ result })
    } catch (e) {
      return modelErrorResponse(e, 'Content check')
    }
  }

  // The brand self-check, through the engine.
  try {
    const result = await checkConsistency(deriverFor(state), { brandState: state })
    // Keep findings for parts this run didn't cover — every part is covered here, so this
    // replaces them all while keeping the same rule as the database route.
    const covered = new Set<string>(CONSISTENCY_DIMENSIONS)
    const kept = state.consistency.findings.filter((f) => !f.conflictingElements.some((d) => covered.has(d)))
    const findings = [...kept, ...result.value.consistency.findings]
    const next = applyDelta(state, 'consistency', {
      ...result.value.consistency,
      findings,
      status: findings.some((f) => (f.status ?? 'open') === 'open') ? 'issues-found' : 'consistent',
    })
    return NextResponse.json({ state: next, dna: buildBrandDna(next), reports: result.value.reports, summary: result.value.summary })
  } catch (e) {
    if (e instanceof UncheckableConsistencyError) {
      return errorResponse(502, 'The check came back with findings the engine could not verify. Run it again.', e.problems)
    }
    if (e instanceof ConsistencyInputError) return errorResponse(400, e.message)
    return modelErrorResponse(e, 'Brand self-check')
  }
}
