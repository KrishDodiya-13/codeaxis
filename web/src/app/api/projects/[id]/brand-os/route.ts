/**
 * POST /api/projects/:id/brand-os — compile the final deliverable.
 *
 * The last stage. Everything in the six sections is either copied from the approved
 * BrandState or derived from it; the only things the model writes are the pieces nothing
 * earlier produced — purpose/mission/vision, the name rationale, the logo direction, the
 * sample copy and the launch plan. That is the point of compiling rather than
 * regenerating: a deliverable that re-reasoned the strategy would be a second opinion,
 * not a rendering of the decisions the user actually approved.
 *
 * The stress-test gate applies here as it does to locking: a brand with open critical or
 * high findings is refused unless `allowUnvalidated` is passed, and a draft compiled that
 * way comes back marked `not-ready` with the findings in `openFlags`.
 *
 * `lock: true` additionally writes `finalBrand`, snapshotting the decisions. Off by
 * default, because locking is a separate act from producing the document.
 */
import { compileBrandOs, runStep } from 'brandstate';
import { CompileBrandOsBody } from '@/lib/api/contracts';
import type { CompileBrandOsResponse } from '@/lib/api/contracts';
import { handle, ok, parseBody, requireModelCredentials } from '@/lib/api/respond';
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
  return handle<CompileBrandOsResponse>(async () => {
    const { id } = await context.params;
    const body = await parseBody(request, CompileBrandOsBody);

    requireModelCredentials();

    const state = await loadBrandState(id);
    const client = deriverFor(state);

    const result = await compileBrandOs(client, {
      brandId: state.id,
      brandState: state,
      ...(body.allowUnvalidated === undefined
        ? {}
        : { allowUnvalidated: body.allowUnvalidated }),
    });

    // Locking is opt-in and separate. It writes `finalBrand`, which is a snapshot of
    // decisions already made — it never rewrites one, so compiling cannot change the
    // strategy the user approved.
    let locked = false;
    if (body.lock === true) {
      const finalBrand = await runStep(client, state, 'finalBrand');
      await saveBrandState(id, finalBrand.state);
      locked = true;
    }

    const project = await advanceStatus(id, 'COMPLETE');

    return ok({
      brandId: result.value.brandId,
      brandOS: result.value.brandOS,
      locked,
      project: toProjectSummary(project),
    });
  });
}
