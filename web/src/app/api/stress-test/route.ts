import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  BrandStateFileSchema,
  StressTestInputError,
  TEST_TYPES,
  UnauditableFindingsError,
  applyDelta,
  buildBrandDna,
  hasDanglingSelection,
  migrateState,
  needsMigration,
  resolveAiMode,
  resolveSelectedStrategy,
  stressTest,
  summarize,
  type BrandState,
} from 'brandstate'
import { credentialProblem } from '@/lib/api/credentials'
import { errorResponse, modelErrorResponse } from '@/lib/api/model-errors'
import { deriverFor } from '@/lib/ai/deriver'

/*
 * POST /api/stress-test — try to break the brand.
 *
 * Stateless, like /api/strategy: the page sends the BrandState it holds and gets the next
 * one back. The engine runs every requested test in one model call and rejects any
 * finding that doesn't cite the BrandState fields it rests on, so what comes back is
 * checkable rather than an opinion.
 *
 * A scoped run replaces only the findings for the types it covered — the same rule as
 * POST /api/projects/:id/stress-test — so re-checking one test after a fix never discards
 * a decision the user already recorded against another.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

const RequestSchema = z
  .object({
    state: z.unknown(),
    scope: z.array(z.enum(TEST_TYPES)).min(1).optional(),
  })
  .strict()

function issues(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }))
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, 'The request body must be JSON.')
  }

  const input = RequestSchema.safeParse(body)
  if (!input.success) return errorResponse(400, 'That request has a missing or malformed field.', issues(input.error))

  // The state is user-controlled input. Bring an older one forward, then validate it.
  const raw = needsMigration(input.data.state) ? migrateState(input.data.state).state : input.data.state
  const parsed = BrandStateFileSchema.safeParse(raw)
  if (!parsed.success) return errorResponse(400, 'The saved brand is not a valid brand state.', issues(parsed.error))
  const state = parsed.data as BrandState
  if (hasDanglingSelection(state)) return errorResponse(400, 'The chosen direction is not one of the generated options.')

  const selectedStrategy = resolveSelectedStrategy(state)
  if (selectedStrategy === undefined) {
    return errorResponse(400, 'Choose a direction in Brand Battle first — the stress test attacks the strategy you picked.')
  }

  const credentialIssue = resolveAiMode() === 'mock' ? null : credentialProblem()
  if (credentialIssue !== null) return errorResponse(503, credentialIssue)

  const scope = input.data.scope
  let result: Awaited<ReturnType<typeof stressTest>>
  try {
    result = await stressTest(deriverFor(state), {
      selectedStrategy,
      brandState: state,
      ...(scope === undefined ? {} : { scope }),
    })
  } catch (e) {
    // Findings that still cite nothing after the engine's own retry: worth another run.
    if (e instanceof UnauditableFindingsError) {
      return errorResponse(502, 'The findings came back without evidence the engine could check. Run it again.', e.problems)
    }
    if (e instanceof StressTestInputError) return errorResponse(400, e.message)
    return modelErrorResponse(e, 'Stress test')
  }

  // Replace only what this run covered; keep every other finding, decisions included.
  const covered = new Set<string>(scope ?? TEST_TYPES)
  const kept = state.stressTests.filter((f) => !covered.has(f.type))
  const next = applyDelta(state, 'stressTests', [...kept, ...result.value.tests])

  return NextResponse.json({
    state: next,
    dna: buildBrandDna(next),
    reports: result.value.reports,
    // Recounted over the merged findings, so it describes the whole brand, not one pass.
    summary: summarize(next.stressTests),
  })
}
