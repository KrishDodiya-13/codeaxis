/**
 * Operations on the `BrandState`.
 *
 * The rule that makes the whole pipeline work lives here: a step writes exactly
 * one section, and `applyDelta` is the only way a section changes. Earlier
 * sections are never regenerated as a side effect of a later step, so the state
 * can be inspected, diffed, or rolled back at any point in the pipeline.
 */
import { randomUUID } from 'node:crypto';
import { SCHEMA_VERSION, sectionSchemas } from './schemas.ts';
import type {
  BrandState,
  BrandStateSection,
  Project,
  SectionValue,
  StrategyOption,
} from './types.ts';

/** The order sections are derived in. Each step depends on the ones before it. */
/**
 * The order sections are derived in. Each step depends on the ones before it.
 *
 * Strategy selection sits ahead of `shape` and `visualDirection` on purpose: a
 * direction is chosen first, and only then developed. Phase 1's suggested flow put
 * selection last, after the creative work; Phase 4 reverses that, and reversing it
 * is the point — developing three directions in full and then picking one wastes
 * most of the work, and picking after the fact tends to rubber-stamp whatever was
 * already built.
 */
export const SECTION_ORDER: readonly BrandStateSection[] = [
  'discovery',
  'positioning',
  'strategyOptions',
  'selectedStrategy',
  'personality',
  'naming',
  'visualDirection',
  'voice',
  'stressTests',
  'consistency',
  'finalBrand',
] as const;

/**
 * A state with `project` seeded and every derived section empty.
 *
 * Empty sections are present rather than undefined so that a partial state has
 * one shape throughout the pipeline — `isSectionPopulated` distinguishes "not
 * derived yet" from "derived and empty".
 */
export function createInitialState(project: Project): BrandState {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,

    project: { ...project },
    discovery: {
      problem: '',
      targetAudience: '',
      userNeed: '',
      goals: [],
      constraints: [],
      assumptions: [],
      openQuestions: [],
    },
    positioning: {
      category: '',
      valueProposition: '',
      differentiator: '',
      competitiveAngle: '',
      rationale: [],
      assumptions: [],
    },
    strategyOptions: [],
    personality: { traits: [], antiTraits: [], values: [], rationale: [] },
    naming: { territories: [], candidates: [], tagline: { candidates: [] } },
    visualDirection: {
      colors: [],
      typography: '',
      imagery: '',
      shapes: '',
      mood: '',
      avoid: [],
    },
    voice: {
      toneAttributes: [],
      writingPrinciples: [],
      avoid: [],
      messagingHierarchy: { primaryMessage: '', supportingMessages: [] },
    },
    stressTests: [],
    // Distinct from `consistent`: an unchecked brand has not been verified, and
    // conflating the two would let an unexamined state pass for a checked one.
    consistency: { status: 'not-yet-checked' },
  };
}

/** A deep copy, so callers can hold a snapshot that later steps cannot mutate. */
export function cloneState(state: BrandState): BrandState {
  return structuredClone(state);
}

/**
 * Returns a new state with one section replaced. The input is never mutated —
 * every step returns a fresh state, which is what makes snapshots trustworthy.
 */
export function applyDelta<S extends BrandStateSection>(
  state: BrandState,
  section: S,
  value: SectionValue<S>,
): BrandState {
  return {
    ...cloneState(state),
    [section]: structuredClone(value),
    updatedAt: new Date().toISOString(),
  };
}

/** Whether a section has been derived yet, as opposed to sitting at its empty default. */
export function isSectionPopulated(state: BrandState, section: BrandStateSection): boolean {
  const value = state[section];
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;

  switch (section) {
    case 'discovery':
      return state.discovery.problem !== '';
    case 'positioning':
      return state.positioning.category !== '';
    case 'personality':
      return state.personality.traits.length > 0;
    case 'naming':
      return state.naming.candidates.length > 0;
    case 'visualDirection':
      return state.visualDirection.mood !== '';
    case 'voice':
      return state.voice.toneAttributes.length > 0;
    case 'consistency':
      // The initial value is its own status, so this needs no heuristic.
      return state.consistency.status !== 'not-yet-checked';
    default:
      return true;
  }
}

/**
 * The chosen strategy in full, looked up from `strategyOptions`.
 *
 * Returns `undefined` when nothing has been chosen — deliberately, rather than
 * falling back to the first option. Downstream steps must read the strategy that
 * was actually selected, and quietly defaulting to `strategyOptions[0]` would turn
 * "nobody has decided yet" into "the first candidate wins", which is the exact
 * rubber-stamping this phase exists to prevent.
 *
 * Also returns `undefined` when the pointer names a direction that is not in
 * `strategyOptions` — a state that has been edited inconsistently — so callers
 * handle a dangling pointer rather than reading past it.
 */
export function resolveSelectedStrategy(state: BrandState): StrategyOption | undefined {
  if (state.selectedStrategy === undefined) return undefined;
  return state.strategyOptions.find(
    (option) => option.direction === state.selectedStrategy!.direction,
  );
}

/** Whether `selectedStrategy` names a direction that no longer exists in the options. */
export function hasDanglingSelection(state: BrandState): boolean {
  return state.selectedStrategy !== undefined && resolveSelectedStrategy(state) === undefined;
}

/** The sections derived so far, in pipeline order. */
export function populatedSections(state: BrandState): BrandStateSection[] {
  return SECTION_ORDER.filter((section) => isSectionPopulated(state, section));
}

/** The first section not yet derived, or `undefined` when the pipeline is complete. */
export function nextSection(state: BrandState): BrandStateSection | undefined {
  return SECTION_ORDER.find((section) => !isSectionPopulated(state, section));
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: Array<{ section: BrandStateSection; message: string }> };

/**
 * Validates every populated section against its schema. Sections not yet derived
 * are skipped, so this is meaningful on a partially complete state.
 */
export function validateState(state: BrandState): ValidationResult {
  const errors: Array<{ section: BrandStateSection; message: string }> = [];

  for (const section of populatedSections(state)) {
    const result = sectionSchemas[section].safeParse(state[section]);
    if (!result.success) {
      errors.push({
        section,
        message: result.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; '),
      });
    }
  }

  // A pointer to a direction that is no longer in strategyOptions is schema-valid on
  // both sections and still wrong: every downstream step reads the resolved strategy,
  // and resolution silently yields nothing. Cross-section checks like this are why
  // validation cannot be per-section alone.
  if (hasDanglingSelection(state)) {
    errors.push({
      section: 'selectedStrategy',
      message:
        `direction "${state.selectedStrategy?.direction}" is not among strategyOptions ` +
        `(${state.strategyOptions.map((option) => option.direction).join(', ') || 'none'}), ` +
        'so it cannot be resolved',
    });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

export type SectionDiff = {
  section: BrandStateSection | 'project';
  status: 'added' | 'changed' | 'removed' | 'unchanged';
};

/**
 * Compares two states section by section. Deliberately coarse: the point is to
 * show which decisions a step touched, not to diff prose word by word.
 */
export function diffStates(before: BrandState, after: BrandState): SectionDiff[] {
  const sections: Array<BrandStateSection | 'project'> = ['project', ...SECTION_ORDER];

  return sections.map((section) => {
    const a = before[section];
    const b = after[section];
    const aPresent = a !== undefined && isPopulated(before, section);
    const bPresent = b !== undefined && isPopulated(after, section);

    if (!aPresent && bPresent) return { section, status: 'added' as const };
    if (aPresent && !bPresent) return { section, status: 'removed' as const };
    if (stableStringify(a) !== stableStringify(b)) return { section, status: 'changed' as const };
    return { section, status: 'unchanged' as const };
  });
}

function isPopulated(state: BrandState, section: BrandStateSection | 'project'): boolean {
  return section === 'project' ? state.project.idea !== '' : isSectionPopulated(state, section);
}

/**
 * Deterministic JSON, with object keys sorted.
 *
 * Used for diffing and for serializing state into prompts: key order has to be
 * stable or an unchanged state serializes differently between calls, which
 * silently breaks prompt caching.
 */
export function stableStringify(value: unknown, indent = 0): string {
  return JSON.stringify(sortKeys(value), null, indent);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (source[key] !== undefined) sorted[key] = sortKeys(source[key]);
  }
  return sorted;
}

/**
 * The state as the model sees it, with not-yet-derived sections omitted.
 *
 * Empty scaffolding is noise in a prompt and invites the model to fill in a
 * section it was not asked for, so only populated sections are sent.
 */
export function serializeForPrompt(state: BrandState): string {
  // Metadata is deliberately left out: an id and three timestamps are not brand
  // content, and sending them invites a step to reason about them.
  const view: Record<string, unknown> = { project: state.project };
  for (const section of populatedSections(state)) {
    view[section] = state[section];
  }

  // Once a direction is chosen, downstream steps see that strategy resolved in
  // full and the rejected candidates not at all. Sending all three would invite a
  // later step to develop whichever it liked best, which is the decision a human
  // already made. Before a choice, the candidates are the state and are sent as-is.
  const selected = resolveSelectedStrategy(state);
  if (selected !== undefined) {
    delete view.strategyOptions;
    view.selectedStrategy = { ...state.selectedStrategy, strategy: selected };
  }

  return stableStringify(view, 2);
}
