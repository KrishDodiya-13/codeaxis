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
  FinalBrandDraftSchema,
  NamingSchema,
  PersonalitySchema,
  VoiceSchema,
  VisualDirectionSchema,
} from './schemas.ts';
import { battle } from './battle.ts';
import { FinalizationBlockedError, blockingFindings, stressTest } from './stress.ts';
import { discover, toDiscoverySection } from './discover.ts';
import { position, toPositioningSection } from './position.ts';
import { applyDelta, isSectionPopulated, resolveSelectedStrategy, serializeForPrompt } from './state.ts';
import type { BrandState, BrandStateSection, SectionValue } from './types.ts';

/**
 * Thrown when the pipeline reaches strategy selection with nothing chosen.
 *
 * Not a failure — a checkpoint. BRAND BATTLE produces options for a human to
 * compare, and having the pipeline pick one would be exactly the silent AI
 * judgement the phase exists to prevent.
 */
export class StrategySelectionRequiredError extends Error {
  readonly directions: string[];

  constructor(directions: string[]) {
    super(
      `A strategy direction has to be chosen before the pipeline can continue. ` +
        `Options: ${directions.join(', ')}. Choosing is a human decision, not the model's.`,
    );
    this.name = 'StrategySelectionRequiredError';
    this.directions = directions;
  }
}

/**
 * Thrown when locking requires a choice that has not been made.
 *
 * `naming` owns the name and the tagline, so the lock step reads them rather than
 * inventing them — and says which one is missing.
 */
export class MissingSelectionError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(
      `Cannot lock the brand: ${field} has not been chosen. Re-run the naming step, or set it directly.`,
    );
    this.name = 'MissingSelectionError';
    this.field = field;
  }
}

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

  personality: {
    section: 'personality',
    label: 'Personality',
    dependsOn: ['discovery', 'positioning', 'selectedStrategy'],
    async derive(deriver, state) {
      return deriver.deriveSection('personality', serializeForPrompt(state), PersonalitySchema);
    },
  },

  naming: {
    section: 'naming',
    label: 'Naming',
    dependsOn: ['positioning', 'selectedStrategy', 'personality'],
    async derive(deriver, state) {
      return deriver.deriveSection('naming', serializeForPrompt(state), NamingSchema);
    },
  },

  visualDirection: {
    section: 'visualDirection',
    label: 'Visual direction',
    dependsOn: ['discovery', 'positioning', 'selectedStrategy', 'personality'],
    async derive(deriver, state) {
      return deriver.deriveSection('visualDirection', serializeForPrompt(state), VisualDirectionSchema);
    },
  },

  voice: {
    section: 'voice',
    label: 'Voice',
    dependsOn: ['positioning', 'selectedStrategy', 'personality'],
    async derive(deriver, state) {
      return deriver.deriveSection('voice', serializeForPrompt(state), VoiceSchema);
    },
  },

  strategyOptions: {
    section: 'strategyOptions',
    label: 'Strategy options (brand battle)',
    dependsOn: ['discovery'],
    async derive(deriver, state) {
      // positioning is optional for BATTLE by design: run without it to explore
      // broadly before committing, or with it so every strategy is a variant of one
      // value proposition. In the pipeline it has always run, so it is passed.
      const result = await battle(deriver, {
        discovery: state.discovery,
        ...(isSectionPopulated(state, 'positioning') ? { positioning: state.positioning } : {}),
      });
      return { value: result.value, usage: result.usage };
    },
  },

  selectedStrategy: {
    section: 'selectedStrategy',
    label: 'Strategy selection',
    dependsOn: ['strategyOptions'],
    async derive(_deriver, state) {
      // Choosing between the strategies is a human decision, never silent AI
      // judgement — so this step has no model call to make. It stops the pipeline
      // and hands back the options instead.
      throw new StrategySelectionRequiredError(
        state.strategyOptions.map((option) => option.direction),
      );
    },
  },

  stressTests: {
    section: 'stressTests',
    label: 'Stress tests',
    dependsOn: ['selectedStrategy', 'personality', 'naming', 'visualDirection', 'voice'],
    async derive(deriver, state) {
      // Runs through the STRESS TEST flow, so the pipeline and /api/stress-test
      // share one prompt and one schema. The section stores the findings; the
      // summary and the evaluation notes are derived, so they are recomputed from
      // the findings rather than persisted where they could go stale.
      const selectedStrategy = resolveSelectedStrategy(state);
      if (selectedStrategy === undefined) {
        throw new MissingDependencyError('stressTests', ['selectedStrategy']);
      }

      const result = await stressTest(deriver, { selectedStrategy, brandState: state });
      return { value: result.value.tests, usage: result.usage };
    },
  },

  consistency: {
    section: 'consistency',
    label: 'Consistency check',
    dependsOn: ['discovery', 'positioning', 'selectedStrategy', 'personality', 'naming', 'visualDirection', 'voice'],
    async derive(deriver, state) {
      const result = await deriver.deriveSection(
        'consistency',
        serializeForPrompt(state),
        ConsistencySchema,
      );

      // The timestamp and the version are the pipeline's to stamp, not the model's:
      // they record when the check ran and what it ran against.
      return {
        value: {
          ...result.value,
          lastCheckedAt: new Date().toISOString(),
          checkedAgainstVersion: state.schemaVersion,
        },
        usage: result.usage,
      };
    },
  },

  finalBrand: {
    section: 'finalBrand',
    label: 'Final brand',
    dependsOn: [
      'selectedStrategy',
      'personality',
      'naming',
      'visualDirection',
      'voice',
      'stressTests',
      'consistency',
    ],
    async derive(deriver, state) {
      // The stress test gates finalization. Locking a brand with an unresolved
      // critical or high finding is exactly what Phase 5 exists to prevent, so this
      // refuses rather than warns — the finding has to be fixed and re-tested, or
      // explicitly accepted as a trade-off.
      const blocking = blockingFindings(state.stressTests);
      if (blocking.length > 0) throw new FinalizationBlockedError(blocking);

      // The name and tagline are owned by naming, so locking requires them to have
      // been chosen there rather than inventing them here.
      const name = state.naming.selectedName;
      const tagline = state.naming.tagline.selected;
      if (name === undefined || tagline === undefined) {
        throw new MissingSelectionError(
          name === undefined ? 'naming.selectedName' : 'naming.tagline.selected',
        );
      }

      const strategy = resolveSelectedStrategy(state);
      if (strategy === undefined) {
        throw new MissingDependencyError('finalBrand', ['selectedStrategy']);
      }

      // Only the narrative and the applications are asked for. Everything else is
      // copied from the branch that owns it, so the lock cannot rewrite a decision
      // that has already been stress-tested.
      const draft = await deriver.deriveSection(
        'finalBrand',
        serializeForPrompt(state),
        FinalBrandDraftSchema,
      );

      return {
        value: {
          name,
          tagline,
          positioningStatement: strategy.positioning,
          narrative: draft.value.narrative,
          personality: structuredClone(state.personality),
          voice: structuredClone(state.voice),
          visualIdentity: structuredClone(state.visualDirection),
          applications: draft.value.applications,
          lockedAt: new Date().toISOString(),
        },
        usage: draft.usage,
      };
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
