/**
 * POST /api/projects/:id/identity — derive the identity layer.
 *
 * Personality, then naming, then voice, in that order because each depends on the one
 * before: the character is decided first, the names are drawn from it, and the voice is
 * that character translated into writing rules. `runStep` enforces the dependencies, so
 * the ordering rule lives in the engine rather than being restated here.
 *
 * Three stages in one request rather than three endpoints, because they are never useful
 * apart — a personality with no voice is not a state anyone wants to stop at. Each is
 * persisted as it completes, so a failure in `voice` does not discard the personality
 * that was already paid for.
 *
 * Naming returns candidates only. Choosing the name and tagline is a human decision and
 * has its own endpoint, for the same reason choosing a strategy does.
 */
import { runStep } from 'brandstate';
import { RunIdentityBody } from '@/lib/api/contracts';
import type { RunIdentityResponse } from '@/lib/api/contracts';
import { BadRequestError, handle, ok, parseBody, requireModelCredentials } from '@/lib/api/respond';
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
  return handle<RunIdentityResponse>(async () => {
    const { id } = await context.params;
    const body = await parseBody(request, RunIdentityBody);

    requireModelCredentials();

    let state = await loadBrandState(id);

    // Replacing an existing identity would orphan the name the user chose from the old
    // candidates, so it has to be deliberate rather than a side effect of a re-request.
    if (state.personality.traits.length > 0 && body.regenerate !== true) {
      throw new BadRequestError(
        'An identity already exists. Re-deriving would replace the personality, the name ' +
          'candidates and the voice, discarding any name already chosen. Send ' +
          'regenerate: true to do it deliberately.',
      );
    }

    // A regenerate asks for different candidates, so it must not be served the previous
    // ones from the cache.
    const deriver = deriverFor(state, { cache: body.regenerate !== true });

    for (const section of ['personality', 'naming', 'voice'] as const) {
      const result = await runStep(deriver, state, section);
      // Saved per stage: a later failure keeps what already succeeded.
      state = await saveBrandState(id, result.state);
    }

    const project = await advanceStatus(id, 'STRATEGY');

    return ok({
      personality: state.personality,
      naming: state.naming,
      voice: state.voice,
      project: toProjectSummary(project),
    });
  });
}
