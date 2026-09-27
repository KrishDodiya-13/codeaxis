/**
 * GET /api/projects/:id — the project and its current brand state.
 *
 * The state is migrated on read if it predates the current contract, so a page never
 * has to know which schema version a stored project was written against.
 */
import type { GetProjectResponse } from '@/lib/api/contracts';
import { handle, ok } from '@/lib/api/respond';
import { requireUser } from '@/lib/auth/session';
import { getProject, loadBrandState, toProjectSummary } from '@/lib/db/projects';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handle<GetProjectResponse>(async () => {
    const { id } = await context.params;
    const user = await requireUser();

    const [project, brandState] = await Promise.all([getProject(id, user.id), loadBrandState(id, user.id)]);

    return ok({ project: toProjectSummary(project), brandState });
  });
}
