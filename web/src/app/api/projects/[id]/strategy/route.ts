/**
 * POST /api/projects/:id/strategy — approve one direction.
 *
 * This is the human decision the battle exists to serve, so it is its own route and it
 * takes no model call. What it stores is a pointer into `strategyOptions`, not a copy:
 * there is exactly one record of the chosen strategy, and it cannot drift from the
 * option it names.
 *
 * Re-selecting is allowed — a user may change their mind while comparing — and the
 * previous choice comes back in the response so the UI can say what changed.
 */
import { resolveSelectedStrategy, selectStrategy } from 'brandstate';
import { SelectStrategyBody } from '@/lib/api/contracts';
import type { SelectStrategyResponse } from '@/lib/api/contracts';
import { BadRequestError, handle, ok, parseBody } from '@/lib/api/respond';
import { requireUser } from '@/lib/auth/session';
import {
  advanceStatus,
  loadBrandState,
  saveBrandState,
  toProjectSummary,
} from '@/lib/db/projects';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle<SelectStrategyResponse>(async () => {
    const { id } = await context.params;
    const user = await requireUser();
    const body = await parseBody(request, SelectStrategyBody);

    const state = await loadBrandState(id, user.id);

    if (state.strategyOptions.length === 0) {
      throw new BadRequestError(
        'There are no directions to choose from yet. Run POST /api/projects/:id/battle first.',
      );
    }

    // Throws BattleInputError, which the handler maps to a 400 listing what is available,
    // if the direction is not one of the generated options.
    const selection = selectStrategy(
      state.strategyOptions,
      body.direction,
      body.reasonChosen,
    );

    const next = { ...state, selectedStrategy: selection };
    const saved = await saveBrandState(id, user.id, next);

    // Resolved from the saved state rather than from the request, so what comes back is
    // what was actually stored.
    const strategy = resolveSelectedStrategy(saved);
    if (strategy === undefined) {
      // Unreachable: selectStrategy only returns a direction it found in the options.
      throw new Error('The stored selection does not resolve to one of the strategy options.');
    }

    const project = await advanceStatus(id, user.id, 'STRATEGY');

    return ok({
      selectedStrategy: selection,
      strategy,
      project: toProjectSummary(project),
    });
  });
}
