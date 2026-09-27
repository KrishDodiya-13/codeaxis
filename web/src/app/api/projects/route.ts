/**
 * POST /api/projects — start a brand project.
 *
 * Creates the project and its initial, empty `BrandState`. No model call: the idea is
 * the user's, and discovery is a separate, explicit step.
 */
import { CreateProjectBody } from '@/lib/api/contracts';
import type { CreateProjectResponse } from '@/lib/api/contracts';
import { handle, ok, parseBody } from '@/lib/api/respond';
import { createProject, toProjectSummary } from '@/lib/db/projects';

export async function POST(request: Request) {
  return handle<CreateProjectResponse>(async () => {
    const body = await parseBody(request, CreateProjectBody);
    const { project, brandState } = await createProject(body);

    return ok({ project: toProjectSummary(project), brandState }, 201);
  });
}
