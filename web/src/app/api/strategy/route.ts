import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  BrandClient,
  BrandStateFileSchema,
  applyDelta,
  buildBrandDna,
  createInitialState,
  hasDanglingSelection,
  runStep,
  toDiscoverySection,
  type BrandState,
} from 'brandstate'
import { DiscoverResultSchema } from '@/lib/discovery'
import { credentialProblem } from '@/lib/api/credentials'
import { errorResponse, modelErrorResponse } from '@/lib/api/model-errors'
import { STAGES, STAGE_LABELS } from '@/lib/strategy'

/*
 * POST /api/strategy — run one strategy stage, or recompute the Brand DNA.
 *
 * Stateless, like /api/discover: the page holds the BrandState in this browser and sends
 * it with each request, and the route returns the next state. One stage per call, so the
 * page can show real progress and a failure never costs more than the stage that failed.
 *
 *   { action: 'run', stage, state }        run one stage against an existing state
 *   { action: 'run', stage, seed }         first call: build the state from discovery
 *   { action: 'dna', state }               no model call — DNA after a user edit
 *
 * The engine enforces each stage's dependencies (runStep), so the order rules live in
 * one place and this route cannot run a stage early.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

/** Everything the first stage needs to build a state: the idea and the discovery result. */
const SeedSchema = z
  .object({
    idea: z.string().trim().min(1).max(5000),
    productType: z.string().max(200).optional(),
    discovery: DiscoverResultSchema,
  })
  .strict()

const RequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('run'),
      stage: z.enum(STAGES),
      state: z.unknown().optional(),
      seed: SeedSchema.optional(),
    })
    .strict(),
  z.object({ action: z.literal('dna'), state: z.unknown() }).strict(),
])

function issues(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }))
}

/** Validates a state sent by the browser. It is user-controlled input, never trusted. */
function parseState(value: unknown): { state: BrandState } | { response: NextResponse } {
  const parsed = BrandStateFileSchema.safeParse(value)
  if (!parsed.success) {
    return { response: errorResponse(400, 'The saved strategy is not a valid brand state.', issues(parsed.error)) }
  }
  const state = parsed.data as BrandState
  if (hasDanglingSelection(state)) {
    return { response: errorResponse(400, 'The chosen direction is not one of the generated options.') }
  }
  return { state }
}

function seedState(seed: z.infer<typeof SeedSchema>): BrandState {
  const initial = createInitialState({
    idea: seed.idea,
    ...(seed.productType ? { productType: seed.productType } : {}),
  })
  return applyDelta(initial, 'discovery', toDiscoverySection(seed.discovery))
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

  if (input.data.action === 'dna') {
    const result = parseState(input.data.state)
    if ('response' in result) return result.response
    return NextResponse.json({ state: result.state, dna: buildBrandDna(result.state) })
  }

  const { stage, seed } = input.data
  let state: BrandState
  if (input.data.state !== undefined) {
    const result = parseState(input.data.state)
    if ('response' in result) return result.response
    state = result.state
  } else if (seed !== undefined) {
    state = seedState(seed)
  } else {
    return errorResponse(400, 'Send either the current state or a discovery seed.')
  }

  // Checked before the call so the message names the cause rather than an SDK error.
  const credentialIssue = credentialProblem()
  if (credentialIssue !== null) return errorResponse(503, credentialIssue)

  try {
    const result = await runStep(new BrandClient(), state, stage)
    return NextResponse.json({ state: result.state, dna: buildBrandDna(result.state) })
  } catch (e) {
    return modelErrorResponse(e, STAGE_LABELS[stage])
  }
}
