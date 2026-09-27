/**
 * POST /api/projects/:id/stress-test — try to break the brand.
 *
 * Runs the five tests against the approved state and persists the findings. Every
 * finding cites the BrandState fields that triggered it, so a reader can check it; the
 * engine rejects findings that cite nothing rather than passing them on.
 *
 * A scoped run replaces only the findings for the types it covered, so a decision already
 * recorded against another type — an accepted trade-off in particular — survives a
 * re-check of one test.
 */
import { BrandClient, blockingFindings, stressTest } from 'brandstate';
import { applyDelta, resolveSelectedStrategy } from 'brandstate';
import { RunStressTestBody, TEST_TYPE_NAMES } from '@/lib/api/contracts';
import type { RunStressTestResponse } from '@/lib/api/contracts';
import { BadRequestError, handle, ok, parseBody, requireModelCredentials } from '@/lib/api/respond';
import {
  advanceStatus,
  loadBrandState,
  saveBrandState,
  toProjectSummary,
} from '@/lib/db/projects';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle<RunStressTestResponse>(async () => {
    const { id } = await context.params;
    const body = await parseBody(request, RunStressTestBody);

    requireModelCredentials();

    const state = await loadBrandState(id);

    const selectedStrategy = resolveSelectedStrategy(state);
    if (selectedStrategy === undefined) {
      throw new BadRequestError(
        'No strategy direction has been selected, so there is nothing to stress-test. Run ' +
          'POST /api/projects/:id/battle and then /strategy first.',
      );
    }

    const result = await stressTest(new BrandClient(), {
      selectedStrategy,
      brandState: state,
      ...(body.scope === undefined ? {} : { scope: body.scope }),
    });

    // Replace only the types this run covered. Anything else — including a finding a
    // human already accepted — is kept, because a narrow re-check must not quietly
    // discard a decision it was not asked about.
    const covered = new Set(body.scope ?? TEST_TYPE_NAMES);
    const kept = state.stressTests.filter((finding) => !covered.has(finding.type));
    const saved = await saveBrandState(
      id,
      applyDelta(state, 'stressTests', [...kept, ...result.value.tests]),
    );

    const project = await advanceStatus(id, 'STRESS_TEST');

    return ok({
      tests: saved.stressTests,
      // Recomputed from the merged findings rather than reused from the run, so the
      // summary describes the whole state and not just this pass.
      summary: { ...result.value.summary, ...recount(saved.stressTests) },
      reports: result.value.reports,
      blocking: blockingFindings(saved.stressTests),
      project: toProjectSummary(project),
    });
  });
}

/** Severity counts and the gate, over every stored finding. */
function recount(tests: RunStressTestResponse['tests']) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of tests) counts[finding.severity]++;
  return { ...counts, blocksFinalization: blockingFindings(tests).length > 0 };
}
