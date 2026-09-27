/**
 * Brand DNA — the canonical view of the approved brand.
 *
 * Every field is projected from the branch that owns it. Nothing here is generated and
 * nothing is stored: the DNA is derived on read, so it cannot drift from the decisions
 * it represents. That is the whole point — a stored copy would go stale the moment a
 * stage re-ran, and the graph in the UI is supposed to *be* the application state, not
 * a snapshot that once resembled it.
 *
 * It therefore adds no field to `BrandState` and needs no schema version bump.
 */
import { resolveSelectedStrategy } from './state.ts';
import { blockingFindings } from './stress.ts';
import { hashDiscovery } from './position.ts';
import type {
  BrandState,
  Confidence,
  Naming,
  Personality,
  StrategyOption,
  VisualDirection,
  Voice,
} from './types.ts';

/** A decision that has not been made yet, so the UI can render the gap honestly. */
export type Undecided = { decided: false; reason: string };

/** A decision that has been made, with where it came from. */
export type Decided<T> = { decided: true; value: T; source: string };

export type DnaField<T> = Decided<T> | Undecided;

/**
 * The canonical Brand DNA.
 *
 * Each field says whether it has been decided and, when it has, which part of the state
 * it came from. A frontend can render a node for every field without knowing the
 * pipeline, and an undecided field is a visible gap rather than an empty string that
 * looks like an answer.
 */
export type BrandDna = {
  audience: DnaField<string>;
  problem: DnaField<string>;
  positioning: DnaField<string>;
  valueProposition: DnaField<string>;
  differentiator: DnaField<string>;
  personality: DnaField<Personality>;
  /** The principles that drive decisions. Owned by `personality.values`. */
  principles: DnaField<string[]>;
  namingDirection: DnaField<Naming>;
  voice: DnaField<Voice>;
  visualDirection: DnaField<VisualDirection>;
  selectedStrategy: DnaField<StrategyOption>;

  /** How settled the DNA is as a whole. Derived, never asserted by a model. */
  provenance: {
    schemaVersion: string;
    /** When the underlying state was last written. */
    updatedAt: string;
    /** Positioning's own confidence, when it recorded one. */
    confidence?: Confidence;
    /** The fields still undecided, by name. Empty means the DNA is complete. */
    undecided: string[];
    /** True when a critical or high stress-test finding is still open. */
    blockedByFindings: boolean;
    /** True when positioning was derived from a discovery that has since changed. */
    positioningStale: boolean;
    /** True when the brand has been locked. */
    locked: boolean;
  };
};

const undecided = (reason: string): Undecided => ({ decided: false, reason });
const decided = <T>(value: T, source: string): Decided<T> => ({ decided: true, value, source });

/** Whether a string field has been filled in. */
function text(value: string, source: string, reason: string): DnaField<string> {
  return value.trim() === '' ? undecided(reason) : decided(value, source);
}

/**
 * Builds the Brand DNA from the current state.
 *
 * Pure and total: it works on a state at any stage of the pipeline, reporting whatever
 * has not been decided rather than throwing. A half-finished brand still has DNA — it
 * just has holes in it, and the UI is supposed to show them.
 */
export function buildBrandDna(state: BrandState): BrandDna {
  const strategy = resolveSelectedStrategy(state);
  const positioningDecided = state.positioning.category !== '';

  const dna: Omit<BrandDna, 'provenance'> = {
    // Audience and problem are owned by discovery, which is the single source of truth
    // for both; positioning echoes them but does not store them.
    audience: text(
      state.discovery.targetAudience,
      'discovery.targetAudience',
      'Discovery has not run yet.',
    ),
    problem: text(state.discovery.problem, 'discovery.problem', 'Discovery has not run yet.'),

    // The positioning statement lives on the chosen strategy once one is selected; the
    // locked brand supersedes it if the brand has been finalised.
    positioning:
      state.finalBrand !== undefined
        ? decided(state.finalBrand.positioningStatement, 'finalBrand.positioningStatement')
        : strategy !== undefined
          ? decided(strategy.positioning, 'selectedStrategy → strategyOptions[].positioning')
          : undecided('No strategy direction has been selected yet.'),

    valueProposition: text(
      state.positioning.valueProposition,
      'positioning.valueProposition',
      'Positioning has not run yet.',
    ),
    differentiator: text(
      state.positioning.differentiator,
      'positioning.differentiator',
      'Positioning has not run yet.',
    ),

    personality:
      state.personality.traits.length > 0
        ? decided(state.personality, 'personality')
        : undecided('The personality stage has not run yet.'),

    // Principles are owned by personality.values — one definition, surfaced here under
    // the name the DNA contract uses.
    principles:
      state.personality.values.length > 0
        ? decided([...state.personality.values], 'personality.values')
        : undecided('The personality stage has not run yet.'),

    namingDirection:
      state.naming.candidates.length > 0
        ? decided(state.naming, 'naming')
        : undecided('The naming stage has not run yet.'),

    voice:
      state.voice.toneAttributes.length > 0
        ? decided(state.voice, 'voice')
        : undecided('The voice stage has not run yet.'),

    visualDirection:
      state.visualDirection.mood !== ''
        ? decided(state.visualDirection, 'visualDirection')
        : undecided('The visual direction stage has not run yet.'),

    selectedStrategy:
      strategy !== undefined
        ? decided(strategy, `selectedStrategy (${state.selectedStrategy?.direction})`)
        : state.strategyOptions.length > 0
          ? undecided('Directions have been generated but none has been chosen.')
          : undecided('Brand Battle has not run yet.'),
  };

  const undecidedFields = (Object.keys(dna) as Array<keyof typeof dna>).filter(
    (key) => dna[key].decided === false,
  );

  return {
    ...dna,
    provenance: {
      schemaVersion: state.schemaVersion,
      updatedAt: state.updatedAt,
      ...(state.positioning.confidence === undefined
        ? {}
        : { confidence: state.positioning.confidence }),
      undecided: undecidedFields,
      blockedByFindings: blockingFindings(state.stressTests).length > 0,
      // A positioning derived from a discovery that has since been edited is still
      // shown, but flagged: silently serving a stale decision is worse than saying so.
      positioningStale:
        positioningDecided &&
        state.positioning.sourceDiscoveryHash !== undefined &&
        state.positioning.sourceDiscoveryHash !== hashDiscovery(state.discovery),
      locked: state.finalBrand !== undefined,
    },
  };
}

/** Whether every field of the DNA has been decided. */
export function isBrandDnaComplete(dna: BrandDna): boolean {
  return dna.provenance.undecided.length === 0;
}

/**
 * The fields of the DNA that are still open, as readable sentences.
 *
 * For the "what is left" panel, so the UI does not have to map field names to prose.
 */
export function describeGaps(dna: BrandDna): Array<{ field: string; reason: string }> {
  return dna.provenance.undecided.map((field) => {
    const entry = dna[field as keyof BrandDna] as DnaField<unknown>;
    return {
      field,
      reason: entry.decided === false ? entry.reason : 'decided',
    };
  });
}
