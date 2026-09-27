/**
 * GET /api/projects/:id/dna — the canonical Brand DNA.
 *
 * Derived from the stored state on every read. Nothing is generated and nothing is
 * stored, so the DNA cannot drift from the decisions it represents — which is what lets
 * the graph in the UI be the application state rather than a snapshot that once
 * resembled it.
 *
 * It works at any stage: an unfinished brand returns DNA with its gaps named, rather
 * than empty strings that would render as answers.
 */
import { buildBrandDna, describeGaps, isBrandDnaComplete } from 'brandstate';
import type { GetBrandDnaResponse } from '@/lib/api/contracts';
import { handle, ok } from '@/lib/api/respond';
import { requireUser } from '@/lib/auth/session';
import { getProject, loadBrandState, toProjectSummary } from '@/lib/db/projects';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handle<GetBrandDnaResponse>(async () => {
    const { id } = await context.params;
    const user = await requireUser();

    const [project, state] = await Promise.all([getProject(id, user.id), loadBrandState(id, user.id)]);
    const dna = buildBrandDna(state);

    return ok({
      dna,
      gaps: describeGaps(dna),
      complete: isBrandDnaComplete(dna),
      project: toProjectSummary(project),
    });
  });
}
