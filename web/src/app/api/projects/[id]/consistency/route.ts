/**
 * POST /api/projects/:id/consistency — does the brand agree with itself?
 *
 * Compares the eight parts of the brand against each other and persists the result.
 * Every finding cites the BrandState fields that put two parts in tension, so a reader
 * can check it; the engine rejects findings that cite nothing rather than passing them on.
 *
 * This route writes **only** the `consistency` section. `recommendedCorrection` is a
 * proposal: nothing here edits positioning, personality, voice or any other approved
 * decision. Acting on a correction is a separate, explicit act by the user, which is
 * what keeps a consistency re-run from quietly undoing a decision they made.
 *
 * A scoped run replaces only the findings involving the parts it covered, so a decision
 * already recorded against another part survives a narrow re-check.
 */
import { checkConsistency } from 'brandstate';
import { applyDelta } from 'brandstate';
import { CONSISTENCY_DIMENSION_NAMES, RunConsistencyBody } from '@/lib/api/contracts';
import type { RunConsistencyResponse } from '@/lib/api/contracts';
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
  return handle<RunConsistencyResponse>(async () => {
    const { id } = await context.params;
    const body = await parseBody(request, RunConsistencyBody);

    requireModelCredentials();

    const state = await loadBrandState(id);

    // No precondition beyond a loadable project: the check reports what it could not
    // compare rather than refusing. An early run over a half-built brand is useful, and
    // `dimensionsChecked` says plainly which parts were not there yet.
    const result = await checkConsistency(deriverFor(state), {
      brandState: state,
      ...(body.scope === undefined ? {} : { scope: body.scope }),
    });

    // Keep findings for the parts this run did not cover. Anything else — including a
    // correction a human already accepted or rejected — is preserved, because a narrow
    // re-check must not discard a decision it was not asked about.
    const covered = new Set(body.scope ?? CONSISTENCY_DIMENSION_NAMES);
    const kept = state.consistency.findings.filter(
      (finding) => !finding.conflictingElements.some((element) => covered.has(element)),
    );
    const findings = [...kept, ...result.value.consistency.findings];

    const saved = await saveBrandState(
      id,
      applyDelta(state, 'consistency', {
        ...result.value.consistency,
        findings,
        // Recomputed over the merged set, so the status describes everything stored and
        // not just this pass.
        status: findings.some((finding) => (finding.status ?? 'open') === 'open')
          ? 'issues-found'
          : 'consistent',
      }),
    );

    const project = await advanceStatus(id, 'STRESS_TEST');

    return ok({
      consistency: saved.consistency,
      summary: { ...result.value.summary, ...recount(saved.consistency.findings) },
      findings: saved.consistency.findings,
      reports: result.value.reports,
      project: toProjectSummary(project),
    });
  });
}

/** Severity counts over every stored finding that is still open. */
function recount(findings: RunConsistencyResponse['findings']) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) {
    if ((finding.status ?? 'open') === 'open') counts[finding.severity]++;
  }
  return counts;
}
