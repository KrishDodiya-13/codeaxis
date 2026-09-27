/**
 * POST /api/projects/:id/discovery — run or refine discovery.
 *
 * Called more than once per project. The first call sends nothing and gets back gaps
 * and questions; later calls send the user's answers, and the gaps shrink. The stored
 * discovery is updated each time, so the UI can show understanding accumulating.
 *
 * The stage extracts what the idea actually supports and records the rest as an
 * assumption, a gap, or a question — it does not fill a field with a guess, and it
 * produces no brand language at all.
 */
import { discover, isDiscoverySufficient, toDiscoverySection } from 'brandstate';
import { applyDelta } from 'brandstate';
import type { DiscoverResult } from 'brandstate';
import { RunDiscoveryBody } from '@/lib/api/contracts';
import type { RunDiscoveryResponse } from '@/lib/api/contracts';
import { handle, ok, parseBody, requireModelCredentials } from '@/lib/api/respond';
import { deriverFor } from '@/lib/ai/deriver';
import {
  advanceStatus,
  getProject,
  loadBrandState,
  saveBrandState,
  toProjectSummary,
} from '@/lib/db/projects';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle<RunDiscoveryResponse>(async () => {
    const { id } = await context.params;
    const body = await parseBody(request, RunDiscoveryBody);

    requireModelCredentials();

    const project = await getProject(id);
    const state = await loadBrandState(id);

    // The stored idea is the source of truth; a caller may override it only to correct
    // a typo, not to change the project underneath its own discovery.
    const idea = body.idea ?? project.originalIdea;

    // Refining needs the previous working object. It lives in the response rather than
    // in BrandState — missingInformation and followUpQuestions are conversation fields,
    // not brand state — so the client sends its answers and we rebuild the prior object
    // from what the state kept.
    const priorDiscovery = body.answers === undefined ? undefined : priorFrom(state);

    const result = await discover(deriverFor(state), {
      idea,
      ...(priorDiscovery === undefined ? {} : { priorDiscovery }),
      ...(body.answers === undefined ? {} : { answers: body.answers }),
    });

    const discoveryState = toDiscoverySection(result.value);
    const saved = await saveBrandState(id, applyDelta(state, 'discovery', discoveryState));

    // Only move the project on once there is nothing left to ask.
    const sufficient = isDiscoverySufficient(result.value);
    const updated = await advanceStatus(id, sufficient ? 'POSITIONING' : 'DISCOVERY');

    return ok({
      discovery: result.value,
      sufficient,
      discoveryState: saved.discovery,
      project: toProjectSummary(updated),
    });
  });
}

/**
 * Rebuilds the previous discovery result from the stored section.
 *
 * `openQuestions` is what survived of the gaps, so it stands in for both lists. That
 * loses the distinction between a gap and its question, which is why the refinement
 * prompt is told to treat them as the same outstanding items rather than assuming a
 * strict pairing.
 */
function priorFrom(state: { discovery: ReturnType<typeof toDiscoverySection> }): DiscoverResult {
  const d = state.discovery;
  return {
    problem: d.problem,
    targetAudience: d.targetAudience,
    userNeed: d.userNeed,
    goals: [...d.goals],
    constraints: [...d.constraints],
    assumptions: [...d.assumptions],
    missingInformation: [...d.openQuestions],
    followUpQuestions: [...d.openQuestions],
  };
}
