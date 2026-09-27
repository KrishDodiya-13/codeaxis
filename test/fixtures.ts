/**
 * Test fixtures.
 *
 * The data itself lives in `src/mock/fixtures.ts`, because mock mode serves the same
 * values — one copy means a fixture cannot drift into passing the tests while breaking
 * mock mode. This file re-exports it and adds the test-only pieces: the assembled
 * `sectionFixtures`, a complete state, and the stub deriver.
 */
import type { DeriveOptions, SectionDeriver, Usage } from '../src/client.ts';
import { BRAND_OS_INSTRUCTIONS } from '../src/prompts.ts';
import { SCHEMA_VERSION } from '../src/schemas.ts';
import { TEST_TYPES } from '../src/types.ts';
import type { BrandState, BrandStateSection } from '../src/types.ts';
import {
  brandOsDraft,
  consistency,
  discoverResult,
  positionResult,
  strategyCandidates,
  discovery,
  finalBrand,
  finalBrandDraft,
  naming,
  personality,
  positioning,
  project,
  selectedStrategy,
  strategyOptions,
  stressTests,
  visualDirection,
  voice,
} from '../src/mock/fixtures.ts';

export {
  brandOsDraft,
  discoverResult,
  finalBrandDraft,
  indistinctCandidates,
  positionResult,
  project,
  specWorkedExample,
  strategyCandidates,
} from '../src/mock/fixtures.ts';

export const sectionFixtures = {
  discovery,
  positioning,
  strategyOptions,
  selectedStrategy,
  personality,
  naming,
  visualDirection,
  voice,
  stressTests,
  consistency,
  finalBrand,
} as const;

/** A fully derived state, for report and validation tests. */
export function completeState(): BrandState {
  return structuredClone({
    id: '11111111-2222-3333-4444-555555555555',
    schemaVersion: SCHEMA_VERSION,
    createdAt: '2026-09-27T08:00:00.000Z',
    updatedAt: '2026-09-27T10:30:00.000Z',
    project,
    ...sectionFixtures,
  }) as BrandState;
}

const stubUsage: Usage = {
  inputTokens: 100,
  outputTokens: 50,
  cacheCreationTokens: 0,
  cacheReadTokens: 80,
};

/**
 * A deriver that returns the fixture for whichever section is asked for, and
 * records the prompts it was given so tests can assert on what the model would
 * have seen.
 */
export class StubDeriver implements SectionDeriver {
  readonly calls: Array<{
    section: BrandStateSection;
    serializedState: string;
    userPrompt: string | undefined;
  }> = [];

  async deriveSection<T>(
    section: BrandStateSection,
    serializedState: string,
    schema: { parse(value: unknown): unknown },
    options?: DeriveOptions,
  ): Promise<{ value: T; usage: Usage }> {
    this.calls.push({ section, serializedState, userPrompt: options?.userPrompt });

    // The BRAND OS compile step writes to finalBrand but is not the finalBrand step,
    // and it says so by overriding the instructions.
    if (options?.instructions === BRAND_OS_INSTRUCTIONS) {
      return { value: schema.parse(structuredClone(brandOsDraft)) as T, usage: stubUsage };
    }

    // Several sections are not requested in their BrandState shape: each endpoint
    // step asks for its own result shape and maps it afterwards.
    const raw =
      section === 'stressTests'
        ? {
            tests: sectionFixtures.stressTests,
            evaluatedTypes: TEST_TYPES.map((type) => ({ type, status: 'evaluated' as const })),
          }
        : section === 'discovery'
          ? discoverResult
          : section === 'positioning'
            ? positionResult
            : section === 'strategyOptions'
              ? { strategies: strategyCandidates }
              : section === 'finalBrand'
                ? finalBrandDraft
                : sectionFixtures[section];

    // Parsing through the real schema keeps the fixtures honest: a fixture that
    // drifts out of schema fails the test rather than silently passing.
    return { value: schema.parse(structuredClone(raw)) as T, usage: stubUsage };
  }
}
