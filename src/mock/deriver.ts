/**
 * The mock deriver: every stage, no provider.
 *
 * Implements the same `SectionDeriver` interface as `BrandClient`, so nothing downstream
 * knows the difference — the steps, the routes and the frontend all see the shapes they
 * always saw. It exists so the product can be built and demonstrated when a provider
 * quota is spent, not as a fallback the live path can slip into: choosing mock is an
 * explicit act, made once, by configuration.
 *
 * Two properties make it trustworthy rather than merely convenient:
 *
 *   - **It validates its own output against the caller's schema.** If a schema changes
 *     and a fixture is no longer valid, mock mode fails loudly here instead of quietly
 *     serving a shape the real provider would never return.
 *   - **It picks by schema, not by section name.** Two stages ask for the same section
 *     with different schemas (`strategyOptions` batch vs. single, `finalBrand` compile vs.
 *     lock), so the candidate that actually parses is the one returned.
 */
import { performance } from 'node:perf_hooks';
import type { z } from 'zod';
import type { DeriveOptions, DeriveResult, SectionDeriver, Usage } from '../client.ts';
import { recordTiming } from '../instrument.ts';
import type { BrandStateSection } from '../types.ts';
import {
  brandOsDraft,
  consistency,
  discoverResult,
  discoverResultRefined,
  finalBrandDraft,
  naming,
  personality,
  positionResult,
  strategyCandidates,
  stressTests,
  visualDirection,
  voice,
} from './fixtures.ts';
import { TEST_TYPES } from '../types.ts';
import { CONSISTENCY_DIMENSIONS } from '../types.ts';

/** Thrown when no fixture satisfies the schema a stage asked for. */
export class MockFixtureError extends Error {
  readonly section: BrandStateSection;
  readonly issues: string[];

  constructor(section: BrandStateSection, issues: string[]) {
    super(
      `No mock fixture matches the schema for the ${section} section. ` +
        'A schema has changed and src/mock/fixtures.ts needs updating. Tried: ' +
        issues.join(' | '),
    );
    this.name = 'MockFixtureError';
    this.section = section;
    this.issues = issues;
  }
}

/**
 * Plausible token counts, so a caller that reports spend has something to report.
 *
 * Deliberately not zero: a UI that renders usage should be exercised with real-looking
 * numbers, and a zero would read as "this did not happen".
 */
const MOCK_USAGE: Usage = {
  inputTokens: 1800,
  outputTokens: 950,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
};

/** Every test type reported as evaluated, which is what a full stress run returns. */
const evaluatedTypes = TEST_TYPES.map((type) => ({ type, status: 'evaluated' as const }));

/** Every dimension reported as compared. */
const dimensionsChecked = CONSISTENCY_DIMENSIONS.map((dimension) => ({
  dimension,
  status: 'evaluated' as const,
}));

/**
 * Whether this discovery call is folding in answers rather than starting from the idea.
 *
 * Keyed on the `<answers>` block that only `buildRediscoverPrompt` emits. Deliberately
 * derived from the request rather than counted per instance: the mock has to be
 * deterministic, and a call counter would give different answers to the same request
 * depending on what happened before it.
 */
function isRefinement(userPrompt: string | undefined): boolean {
  return userPrompt !== undefined && userPrompt.includes('<answers>');
}

/**
 * The candidates for each section, in the order they are tried.
 *
 * A section with more than one entry is one that different stages ask for differently;
 * the first that validates wins.
 */
function candidatesFor(section: BrandStateSection, userPrompt: string | undefined): unknown[] {
  switch (section) {
    case 'discovery':
      // Discovery is the one stage that is called twice with different meaning: once for
      // the idea, then again to fold in the user's answers. Returning the same object
      // both times left the same question open forever, so the flow could never
      // converge. The refinement prompt is the only one carrying an <answers> block, so
      // that is what distinguishes them.
      return [isRefinement(userPrompt) ? discoverResultRefined : discoverResult];
    case 'positioning':
      return [positionResult];
    case 'strategyOptions':
      // The batch shape first, then the single-strategy shape the per-direction
      // fallback and the distinctness rebuild both use.
      return [
        { strategies: strategyCandidates },
        { strategy: strategyCandidates[0] },
      ];
    case 'personality':
      return [personality];
    case 'naming':
      return [naming];
    case 'visualDirection':
      return [visualDirection];
    case 'voice':
      return [voice];
    case 'stressTests':
      return [{ tests: stressTests, evaluatedTypes }];
    case 'consistency':
      return [{ ...consistency, dimensionsChecked }];
    case 'finalBrand':
      // The Brand OS compile draft, then the narrower lock-step draft.
      return [brandOsDraft, finalBrandDraft];
    case 'selectedStrategy':
      // Choosing is a human act; nothing is ever asked of the model.
      return [];
    default:
      return [];
  }
}

export type MockDeriverOptions = {
  /**
   * Artificial delay per call, in milliseconds.
   *
   * Zero by default. A small value is useful when developing loading states, which are
   * otherwise impossible to see against an instant response.
   */
  latencyMs?: number;
};

export class MockDeriver implements SectionDeriver {
  readonly latencyMs: number;

  /** Every call made, in order. Useful in tests and when debugging a stage. */
  readonly calls: Array<{ section: BrandStateSection; userPrompt: string | undefined }> = [];

  constructor(options: MockDeriverOptions = {}) {
    this.latencyMs = options.latencyMs ?? 0;
  }

  async deriveSection<T>(
    section: BrandStateSection,
    _serializedState: string,
    schema: z.ZodType<T>,
    options: DeriveOptions = {},
  ): Promise<DeriveResult<T>> {
    this.calls.push({ section, userPrompt: options.userPrompt });

    // Recorded like a live stage, but tagged `mock`. A mock timing measures fixture
    // lookup and validation, never AI latency, and the tag is what keeps the two from
    // being averaged together into a number that describes neither.
    const requestStart = new Date();
    const t0 = performance.now();

    const emit = (validationMs: number, ok: boolean, errorKind?: string) => {
      recordTiming({
        section,
        mode: 'mock',
        requestStart: requestStart.toISOString(),
        responseComplete: new Date().toISOString(),
        modelMs: 0,
        validationMs: +validationMs.toFixed(3),
        totalMs: +(performance.now() - t0).toFixed(1),
        inputTokens: ok ? MOCK_USAGE.inputTokens : 0,
        outputTokens: ok ? MOCK_USAGE.outputTokens : 0,
        ok,
        ...(errorKind === undefined ? {} : { errorKind }),
      });
    };

    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    const issues: string[] = [];
    let validationMs = 0;
    for (const candidate of candidatesFor(section, options.userPrompt)) {
      // The caller's own schema is the judge, exactly as in live mode. A fixture that no
      // longer fits is a failure here rather than a surprise three stages later.
      const validationStart = performance.now();
      const parsed = schema.safeParse(candidate);
      validationMs += performance.now() - validationStart;

      if (parsed.success) {
        emit(validationMs, true);
        return { value: parsed.data, usage: MOCK_USAGE };
      }

      issues.push(parsed.error.issues.map((issue) => issue.path.join('.') || '(root)').join(','));
    }

    emit(validationMs, false, 'MockFixtureError');
    throw new MockFixtureError(section, issues.length > 0 ? issues : ['no candidate defined']);
  }
}
