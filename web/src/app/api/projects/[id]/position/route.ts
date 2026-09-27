/**
 * POST /api/projects/:id/position — derive positioning from discovery.
 *
 * Refuses while discovery still has open questions, unless the caller explicitly sends
 * `forceProceed` — in which case every question it had to assume an answer to comes back
 * named in `assumptionsUsed`. Proceeding is allowed; proceeding silently is not.
 */
import { applyDelta, position, toPositioningSection } from 'brandstate';
import { RunPositionBody } from '@/lib/api/contracts';
import type { RunPositionResponse } from '@/lib/api/contracts';
import { handle, ok, parseBody, requireModelCredentials } from '@/lib/api/respond';
import { requireUser } from '@/lib/auth/session';
import { deriverFor } from '@/lib/ai/deriver';
import {
  advanceStatus,
  loadBrandState,
  saveBrandState,
  toProjectSummary,
} from '@/lib/db/projects';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle<RunPositionResponse>(async () => {
    const { id } = await context.params;
    const user = await requireUser();
    const body = await parseBody(request, RunPositionBody);

    requireModelCredentials();

    const state = await loadBrandState(id, user.id);

    // Throws DiscoveryIncompleteError when discovery is unfinished and forceProceed was
    // not set; the handler turns that into a 422 carrying the unresolved questions.
    const result = await position(deriverFor(state), {
      discovery: state.discovery,
      ...(body.knownCompetitors === undefined ? {} : { knownCompetitors: body.knownCompetitors }),
      ...(body.forceProceed === undefined ? {} : { forceProceed: body.forceProceed }),
      ...(body.includeAlternatives === undefined
        ? {}
        : { includeAlternatives: body.includeAlternatives }),
    });

    // The echoed audience, problem and userNeed stay in the response only — discovery
    // remains the single source of truth for all three, and a second copy would drift.
    const section = toPositioningSection(result.value, state.discovery);
    await saveBrandState(id, user.id, applyDelta(state, 'positioning', section));

    const project = await advanceStatus(id, user.id, 'STRATEGY');

    return ok({ positioning: result.value, project: toProjectSummary(project) });
  });
}
