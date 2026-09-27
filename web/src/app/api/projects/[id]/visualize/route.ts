/**
 * POST /api/projects/:id/visualize — derive the visual direction.
 *
 * Runs against the approved strategy and the personality, not against the idea: a
 * visual system is a translation of decisions already made, so the stage refuses until
 * a direction has been selected and a personality written. Every recommendation it
 * returns has to trace back to one of those, which is what the prompt enforces and what
 * the `visualPersonality` and `rationale` fields record.
 */
import { runStep } from 'brandstate';
import { RunVisualizeBody } from '@/lib/api/contracts';
import type { RunVisualizeResponse } from '@/lib/api/contracts';
import {
  ApprovedDecisionConflictError,
  BadRequestError,
  handle,
  ok,
  parseBody,
  requireModelCredentials,
} from '@/lib/api/respond';
import { requireUser } from '@/lib/auth/session';
import { deriverFor } from '@/lib/ai/deriver';
import {
  advanceStatus,
  loadBrandState,
  saveBrandState,
  toProjectSummary,
} from '@/lib/db/projects';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle<RunVisualizeResponse>(async () => {
    const { id } = await context.params;
    const user = await requireUser();
    const body = await parseBody(request, RunVisualizeBody);

    requireModelCredentials();

    const state = await loadBrandState(id, user.id);

    if (state.selectedStrategy === undefined) {
      throw new BadRequestError(
        'No strategy direction has been selected. Run POST /api/projects/:id/battle and then ' +
          '/strategy first — the visual system expresses the chosen direction, so it cannot be ' +
          'derived before one exists.',
      );
    }

    if (state.personality.traits.length === 0) {
      throw new BadRequestError(
        'The personality has not been written yet. Every visual choice has to trace to a trait, ' +
          'so that stage runs first.',
      );
    }

    // Re-running discards a visual direction the team may already be working from, so
    // it is an explicit act rather than a side effect.
    if (state.visualDirection.mood !== '' && body.regenerate !== true) {
      throw new ApprovedDecisionConflictError(
        'A visual direction already exists. Regenerating would replace it. Send regenerate: true ' +
          'to do it deliberately.',
        'visual_would_be_orphaned',
        { visualDirection: state.visualDirection },
      );
    }

    // runStep enforces the declared dependencies and sends the chosen strategy resolved,
    // with the rejected directions omitted, so the brief cannot express one nobody picked.
    const result = await runStep(// A regenerate asks for a different answer, so it must not be served the previous one.
      deriverFor(state, { cache: body.regenerate !== true }), state, 'visualDirection');
    const saved = await saveBrandState(id, user.id, result.state);
    const project = await advanceStatus(id, user.id, 'STRATEGY');

    return ok({
      visualDirection: saved.visualDirection,
      project: toProjectSummary(project),
    });
  });
}
