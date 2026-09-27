/**
 * The pipeline steps.
 *
 * Every step does the same three things: check its inputs are present, ask the
 * model for one section, write it back. The only things that vary are the
 * section, its schema, and what it depends on — so the steps are a table rather
 * than eight copies of one function.
 */
import type { SectionDeriver, Usage } from './client.ts';
import {
  ConsistencySchema,
  FinalBrandSchema,
  SelectedStrategySchema,
  ShapeSchema,
  StressTestsResultSchema,
  VisualDirectionSchema,
} from './schemas.ts';
import { discover, toDiscoverySection } from './discover.ts';
import { position, toPositioningSection } from './position.ts';
import { applyDelta, isSectionPopulated, serializeForPrompt } from './state.ts';
import type { BrandState, BrandStateSection, SectionValue } from './types.ts';

/** Thrown when a step is run before the sections it reads from have been derived. */
export class MissingDependencyError extends Error {
  readonly section: BrandStateSection;
  readonly missing: BrandStateSection[];

  constructor(section: BrandStateSection, missing: BrandStateSection[]) {
    super(
      `Cannot derive ${section}: ${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} not been derived yet.`,
    );
    this.name = 'MissingDependencyError';
    this.section = section;
    this.missing = missing;
  }
}

type StepDefinition<S extends BrandStateSection> = {
  section: S;
  /** Human-readable label, used in progress output. */
  label: string;
  /** Sections that must be populated before this step can run. */
  dependsOn: readonly BrandStateSection[];
  /** Asks the model for this section and returns the value plus its usage. */
  derive(deriver: SectionDeriver, state: BrandState): Promise<{ value: SectionValue<S>; usage: Usage }>;
};

/**
 * `discovery` depends on nothing derived — `project` is always present — so the
 * dependency lists below start empty and grow down the pipeline. Declaring them
 * explicitly rather than assuming "everything before me" lets a single step be
 * re-run against a partial state.
 */
export const STEPS: { [S in BrandStateSection]: StepDefinition<S> } = {
  discovery: {
    section: 'discovery',
    label: 'Discovery',
    dependsOn: [],
    async derive(deriver, state) {
      // Runs through DISCOVER rather than asking for the BrandState section
      // directly, so the pipeline and the /api/discover endpoint share one
      // implementation and cannot drift apart. The pipeline takes the first pass
      // only; answering the follow-up questions is a conversation the endpoint
      // drives, and whatever is left unresolved arrives here as openQuestions.
      const result = await discover(deriver, { idea: state.project.idea });
      return { value: toDiscoverySection(result.value), usage: result.usage };
    },
  },

  positioning: {
    section: 'positioning',
    label: 'Positioning',
    dependsOn: ['discovery'],
    async derive(deriver, state) {
      // Runs through POSITION, so the pipeline and /api/position share one
      // prompt and one schema.
      //
      // forceProceed is set because an end-to-end run has no one to answer
      // discovery's open questions — DISCOVER almost always leaves some, and the
      // guard would otherwise halt every run. The discipline is kept rather than
      // dropped: each assumed answer comes back named in assumptionsUsed and as a
      // note in rationale, so a pipeline run says what it assumed instead of
      // hiding it. Callers who want the guard enforced use the endpoint.
      const result = await position(deriver, {
        discovery: state.discovery,
        forceProceed: true,
      });
      return { value: toPositioningSection(result.value, state.discovery), usage: result.usage };
    },
  },

  shape: {
    section: 'shape',
    label: 'Shape (personality, naming, messaging)',
    dependsOn: ['discovery', 'positioning'],
    async derive(deriver, state) {
      return deriver.deriveSection('shape', serializeForPrompt(state), ShapeSchema);
    },
  },

  visualDirection: {
    section: 'visualDirection',
    label: 'Visual direction',
    dependsOn: ['discovery', 'positioning', 'shape'],
    async derive(deriver, state) {
      return deriver.deriveSection('visualDirection', serializeForPrompt(state), VisualDirectionSchema);
    },
  },

  selectedStrategy: {
    section: 'selectedStrategy',
    label: 'Selected strategy',
    dependsOn: ['positioning', 'shape'],
    async derive(deriver, state) {
      return deriver.deriveSection('selectedStrategy', serializeForPrompt(state), SelectedStrategySchema);
    },
  },

  stressTests: {
    section: 'stressTests',
    label: 'Stress tests',
    dependsOn: ['selectedStrategy'],
    async derive(deriver, state) {
      // The schema wraps the array because a structured-output format needs an
      // object at its root; the section itself is the bare array.
      const result = await deriver.deriveSection(
        'stressTests',
        serializeForPrompt(state),
        StressTestsResultSchema,
      );
      return { value: result.value.stressTests, usage: result.usage };
    },
  },

  consistency: {
    section: 'consistency',
    label: 'Consistency check',
    dependsOn: ['discovery', 'positioning', 'shape', 'visualDirection', 'selectedStrategy'],
    async derive(deriver, state) {
      return deriver.deriveSection('consistency', serializeForPrompt(state), ConsistencySchema);
    },
  },

  finalBrand: {
    section: 'finalBrand',
    label: 'Final brand',
    dependsOn: ['selectedStrategy', 'visualDirection', 'consistency'],
    async derive(deriver, state) {
      return deriver.deriveSection('finalBrand', serializeForPrompt(state), FinalBrandSchema);
    },
  },
};

/** The dependencies of `section` that are not yet populated in `state`. */
export function missingDependencies(state: BrandState, section: BrandStateSection): BrandStateSection[] {
  return STEPS[section].dependsOn.filter((dep) => !isSectionPopulated(state, dep));
}

/**
 * Runs one step and returns the updated state.
 *
 * The input state is not mutated: the caller gets a new state back and can keep
 * the old one as a snapshot.
 */
export async function runStep(
  deriver: SectionDeriver,
  state: BrandState,
  section: BrandStateSection,
): Promise<{ state: BrandState; usage: Usage }> {
  const missing = missingDependencies(state, section);
  if (missing.length > 0) throw new MissingDependencyError(section, missing);

  const step = STEPS[section];
  const { value, usage } = await step.derive(deriver, state);
  return { state: applyDelta(state, section, value as SectionValue<typeof section>), usage };
}
