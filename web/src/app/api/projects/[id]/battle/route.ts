/**
 * POST /api/projects/:id/battle — generate three strategic directions.
 *
 * Exactly three, built against archetypes chosen to sit as far apart as possible, then
 * checked for distinctness and individually rebuilt if two collide. Nothing is ranked
 * or recommended: the point is to give a human real options, not to advance a favourite.
 *
 * Regenerating over an existing selection is refused unless the caller says
 * `regenerate: true`. Replacing the options would leave the chosen direction pointing
 * at something that no longer exists, and that has to be a deliberate act.
 */
import { applyDelta, battle, normalizeDirections } from 'brandstate';
import type { BrandState, SelectedStrategy } from 'brandstate';
import { RunBattleBody } from '@/lib/api/contracts';
import type { RunBattleResponse } from '@/lib/api/contracts';
import {
  ApprovedDecisionConflictError,
  BadRequestError,
  handle,
  ok,
  parseBody,
  requireModelCredentials,
} from '@/lib/api/respond';
import { deriverFor } from '@/lib/ai/deriver';
import {
  advanceStatus,
  loadBrandState,
  saveBrandState,
  toProjectSummary,
} from '@/lib/db/projects';

/** The product generates three. The engine supports more; the contract does not. */
const DIRECTION_COUNT = 3;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle<RunBattleResponse>(async () => {
    const { id } = await context.params;
    const body = await parseBody(request, RunBattleBody);

    requireModelCredentials();

    const state = await loadBrandState(id);

    if (state.positioning.category === '') {
      throw new BadRequestError(
        'Positioning has not been derived yet. Run POST /api/projects/:id/position first — the ' +
          'directions are variants of one positioning, not three separate ones.',
      );
    }

    // Guard the approved decision: replacing the options would orphan it.
    if (state.selectedStrategy !== undefined && body.regenerate !== true) {
      throw new ApprovedDecisionConflictError(
        `A direction (${state.selectedStrategy.direction}) has already been selected. Regenerating ` +
          'would discard that choice. Send regenerate: true to do it deliberately.',
        'selection_would_be_orphaned',
        { selectedStrategy: state.selectedStrategy },
      );
    }

    const directions =
      body.directions === undefined ? undefined : normalizeDirections(body.directions);

    const result = await battle(// A regenerate asks for a different answer, so it must not be served the previous one.
      deriverFor(state, { cache: body.regenerate !== true }), {
      discovery: state.discovery,
      positioning: state.positioning,
      count: DIRECTION_COUNT,
      ...(directions === undefined ? {} : { directions }),
    });

    // Write the options and drop any stale selection in the same update, so the state is
    // never persisted with a pointer to a direction that is no longer there.
    const cleared: SelectedStrategy | undefined = state.selectedStrategy;
    let next: BrandState = applyDelta(state, 'strategyOptions', result.value);
    if (cleared !== undefined) {
      next = { ...next };
      delete next.selectedStrategy;
    }

    await saveBrandState(id, next);
    const project = await advanceStatus(id, 'STRATEGY');

    return ok({
      directions: result.value,
      ...(cleared === undefined ? {} : { clearedSelection: cleared }),
      project: toProjectSummary(project),
    });
  });
}
