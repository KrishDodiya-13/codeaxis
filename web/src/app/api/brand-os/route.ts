import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  BrandOsInputError,
  BrandStateFileSchema,
  FinalizationBlockedError,
  IncompleteBrandOsError,
  IncompleteBrandStateError,
  compileBrandOs,
  hasDanglingSelection,
  migrateState,
  needsMigration,
  resolveAiMode,
  type BrandState,
} from 'brandstate'
import { credentialProblem } from '@/lib/api/credentials'
import { errorResponse, modelErrorResponse } from '@/lib/api/model-errors'
import { deriverFor } from '@/lib/ai/deriver'

/*
 * POST /api/brand-os — compile the final deliverable. Stateless, like /api/strategy.
 *
 * Everything in the document is copied from the approved BrandState or derived from it;
 * the model only writes what nothing earlier produced (purpose, mission, vision, the
 * launch copy and plan). The engine refuses a brand with open critical or high stress
 * findings unless `allowUnvalidated` is sent — and then marks the result not-ready, so a
 * draft can never pass for a signed-off document.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

const RequestSchema = z.object({ state: z.unknown(), allowUnvalidated: z.boolean().optional() }).strict()

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

  // The browser's state is user input: bring an old one forward, then validate it.
  const raw = needsMigration(input.data.state) ? migrateState(input.data.state).state : input.data.state
  const parsed = BrandStateFileSchema.safeParse(raw)
  if (!parsed.success) return errorResponse(400, 'The saved brand is not a valid brand state.', issues(parsed.error))
  const state = parsed.data as BrandState
  if (hasDanglingSelection(state)) return errorResponse(400, 'The chosen direction is not one of the generated options.')

  const credentialIssue = resolveAiMode() === 'mock' ? null : credentialProblem()
  if (credentialIssue !== null) return errorResponse(503, credentialIssue)

  try {
    const result = await compileBrandOs(deriverFor(state), {
      brandId: state.id,
      brandState: state,
      ...(input.data.allowUnvalidated ? { allowUnvalidated: true } : {}),
    })
    return NextResponse.json({ brandOS: result.value.brandOS })
  } catch (e) {
    if (e instanceof IncompleteBrandStateError) {
      return errorResponse(400, 'The brand isn’t finished yet, so there’s nothing complete to compile.', e.missing)
    }
    if (e instanceof FinalizationBlockedError) {
      return errorResponse(409, 'Open critical or high stress-test findings block a finished Brand OS. Fix or accept them, or compile a draft.')
    }
    if (e instanceof IncompleteBrandOsError) {
      return errorResponse(502, 'The compiled document came back with empty sections. Compile it again.', e.empty)
    }
    if (e instanceof BrandOsInputError) return errorResponse(400, e.message)
    return modelErrorResponse(e, 'Brand OS')
  }
}
