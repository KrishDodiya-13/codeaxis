import type { Direction } from './archetypes.ts';

/**
 * The central brand object.
 *
 * `BrandState` is the single source of truth for the AI's understanding of the
 * brand. Every pipeline step reads the whole object and writes back exactly one
 * section, so decisions made early (positioning, tone, visual direction) persist
 * and inform every later step instead of being re-derived or forgotten.
 *
 * The published schema types the exploratory sections as `unknown`. Concrete
 * shapes are given here because the structured-output schemas in `schemas.ts`
 * need something to validate against; every one of them is assignable to
 * `unknown`, so this is a refinement of the spec rather than a departure from it.
 */

/** The raw seed — what the user is building and their stated goal. */
export type Project = {
  idea: string;
  productType?: string;
  goal?: string;
};

/** Problem space: audience, need, goals, constraints, assumptions, questions. */
export type Discovery = {
  problem: string;
  targetAudience: string;
  userNeed: string;
  goals: string[];
  constraints: string[];
  assumptions: string[];
  openQuestions: string[];
};

/** Where the brand sits in the market, and why. */
export type Positioning = {
  category: string;
  valueProposition: string;
  differentiator: string;
  competitiveAngle: string;
  rationale: string[];
  /** What this positioning rests on that the user did not state. */
  assumptions: string[];
  /**
   * How much to trust this positioning.
   *
   * Optional because a state written before schema 1.1.0 never recorded one, and
   * defaulting it would invent a confidence nobody assessed.
   */
  confidence?: Confidence;
  /**
   * The discovery object this was derived from, as a hash.
   *
   * Lets a consistency check tell current positioning from positioning left
   * stale by an edit to discovery. Optional: a hand-written state has none.
   */
  sourceDiscoveryHash?: string;
};

/**
 * Who the brand is.
 *
 * Internal-facing: used to judge whether a decision — a partnership, a feature, a
 * strategy — fits the brand. Distinct from `Voice`, which is how it talks. A brand
 * can be ambitious here and write in short calm sentences there; collapsing the two
 * loses the ability to give a copywriter concrete guidance separate from internal
 * brand-strategy language.
 */
export type Personality = {
  /** Three to five specific, non-generic adjectives. */
  traits: string[];
  /** What the brand explicitly is not, which makes the exclusions auditable. */
  antiTraits: string[];
  /** The principles driving decisions. */
  values: string[];
  /** An optional narrative archetype, e.g. "The Mentor", "The Underdog". */
  archetype?: string;
  rationale: string[];
};

export type NameCandidate = {
  name: string;
  /** Which territory this came from. */
  territory: string;
  pros: string[];
  cons: string[];
};

/**
 * What the brand is called.
 *
 * Its own branch rather than part of a catch-all because naming carries its own
 * review cycle — trademark, domain, legal — that nothing else in the state shares.
 */
export type Naming = {
  /** Approaches explored, e.g. "descriptive", "evocative", "coined". */
  territories: string[];
  candidates: NameCandidate[];
  selectedName?: string;
  tagline: {
    candidates: string[];
    selected?: string;
  };
};

/** The one thing to say, and what backs it up. */
export type MessagingHierarchy = {
  primaryMessage: string;
  supportingMessages: string[];
};

/**
 * How the brand talks.
 *
 * Outward-facing, and written to be used directly by a copywriter.
 */
export type Voice = {
  /** How it sounds — distinct from the traits in `Personality`, which are who it is. */
  toneAttributes: string[];
  /** The do's, e.g. "short sentences", "address the reader directly". */
  writingPrinciples: string[];
  /** The don'ts. Ties directly to the cliché stress test. */
  avoid: string[];
  messagingHierarchy: MessagingHierarchy;
};

/** The look and feel: color, type, imagery, shape language, mood, and what to avoid. */
export type VisualDirection = {
  /** Named colors with a hex value, a role, and the trait each carries. */
  colors: string[];
  typography: string;
  imagery: string;
  /** Geometry, corner treatment, density, grid behaviour. */
  shapes: string;
  /** How the page is arranged: weight, whitespace, density, reading order. */
  composition: string;
  /**
   * How the visual system encodes the personality traits, by name.
   *
   * The field that makes the direction auditable against the brand rather than
   * a set of aesthetic preferences.
   */
  visualPersonality: string;
  /** The feeling the system produces on first sight. */
  mood: string;
  avoid: string[];
  /** Why this follows from the approved strategy and personality. */
  rationale: string[];
};

/**
 * One candidate strategy from BRAND BATTLE.
 *
 * Several of these are generated against deliberately different archetypes so a
 * human can compare trade-offs and choose, rather than rubber-stamping whatever
 * the model produced first.
 */
export type StrategyOption = {
  /** The archetype this strategy is built around, e.g. `CONNECTION`. */
  direction: Direction;
  /**
   * A short title for the direction, e.g. "The Verified Insider".
   *
   * Names the strategy, not the product — brand naming is a later stage and a
   * separate decision.
   */
  name: string;
  /** The strategic bet in one sentence: what this direction believes that the others do not. */
  coreIdea: string;
  /** This strategy's positioning statement, two or three sentences. */
  positioning: string;
  strengths: string[];
  /** Never empty: a direction with no stated risk has not been thought through. */
  risks: string[];
  /**
   * What choosing this gives up even when it works.
   *
   * Distinct from `risks`, which is what might go wrong.
   */
  tradeoffs: string[];
  /** Who this resonates with most, and who it resonates with less. */
  audienceFit: string;
  /** How this stands apart, seen through this direction specifically. */
  differentiation: string;
  rationale: string[];
};

/**
 * The chosen direction — a pointer into `strategyOptions`, not a copy of it.
 *
 * Referencing rather than duplicating means there is exactly one copy of the
 * chosen strategy's detail, so the two cannot drift apart. Use
 * `resolveSelectedStrategy` to get the full strategy back.
 */
export type SelectedStrategy = {
  direction: Direction;
  /** ISO 8601 timestamp of when the choice was made. */
  chosenAt: string;
  /** Why this one was picked over the others, when a reason was given. */
  reasonChosen?: string;
};

/**
 * The five stress-test categories.
 *
 * Kept as a runtime constant because the schemas, the prompts and the `scope`
 * parameter all need the same list, and a second copy would drift.
 */
export const TEST_TYPES = [
  'cliché',
  'audienceMismatch',
  'differentiation',
  'contradiction',
  'messaging',
] as const;

export type TestType = (typeof TEST_TYPES)[number];

/**
 * The decisions a stress-test finding can bear on.
 *
 * Deliberately the same names as the Brand DNA fields, so a finding points at a node the
 * UI can highlight and the dependency-update rule can follow. A free-text field here
 * would be unusable for either.
 */
export const DECISION_NAMES = [
  'audience',
  'problem',
  'positioning',
  'valueProposition',
  'differentiator',
  'personality',
  'principles',
  'namingDirection',
  'voice',
  'visualDirection',
  'selectedStrategy',
] as const;

export type DecisionName = (typeof DECISION_NAMES)[number];

/** How much to trust a generated decision. */
export type Confidence = 'low' | 'medium' | 'high';

/** How serious a finding is. `critical` means unusable as-is. */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

/**
 * What a team decided to do about a finding.
 *
 * `acknowledged` is the important one: not every finding has to be fixed, and a
 * team that knowingly accepts a trade-off needs somewhere to record that — so the
 * finding neither blocks forever nor silently disappears on the next run.
 */
export type FindingStatus = 'open' | 'acknowledged' | 'resolved';

/** One problem found in the brand as it stands. */
export type StressTest = {
  type: TestType;
  severity: Severity;
  /** A named problem, not "this could be stronger". */
  issue: string;
  /** The exact `BrandState` field paths that triggered the flag. */
  evidence: string;
  /** What actually goes wrong downstream if this is not fixed. */
  impact: string;
  /** A concrete fix a human could carry out. */
  recommendation: string;
  /**
   * A different option, where the recommendation is not the only way out.
   *
   * Optional on a stored finding because findings recorded before this field existed do
   * not have one; the engine requires it of every new finding.
   */
  alternative?: string;
  /** Which decision the finding bears on, as a Brand DNA node name. */
  affectedDecision?: DecisionName;
  /** Absent means `open`. */
  status?: FindingStatus;
};

/**
 * What one test concluded.
 *
 * `outcome` is the explicit answer to "did this test find anything", which an empty
 * findings list only implies. A reader must be able to tell a genuine pass from a test
 * that could not run.
 */
export type TestReport = {
  type: TestType;
  outcome: 'pass' | 'issues-found' | 'partial' | 'not-testable';
  /** How many findings this test produced. */
  findings: number;
  /** Why, when the outcome is not a plain pass. */
  note?: string;
};

/** Whether a test type could actually be run against the state it was given. */
export type EvaluationStatus = 'evaluated' | 'partial' | 'not-testable';

/**
 * What happened for one test type.
 *
 * This exists so a caller can tell "passed" from "had nothing to check yet" — a
 * distinction that matters when `shape` and `visualDirection` are still empty and
 * the contradiction tests have little to work with.
 */
export type TypeEvaluation = {
  type: TestType;
  status: EvaluationStatus;
  /** Why, when the status is not a plain `evaluated`. */
  note?: string;
};

/**
 * Whether the sections agree with each other.
 *
 * `not-yet-checked` is the initial state and is distinct from `consistent` — an
 * unchecked brand is not a consistent one, and conflating them would let an
 * unexamined state pass for a verified one.
 */
export type Consistency = {
  status: 'not-yet-checked' | 'consistent' | 'issues-found';
  lastCheckedAt?: string;
  /** The `schemaVersion` the check ran against. */
  checkedAgainstVersion?: string;
  notes?: string[];
};

/**
 * The locked, shippable output.
 *
 * A snapshot, not a rewrite: the name, tagline, personality, voice and visual
 * identity are copied from the branches that own them, so locking cannot quietly
 * change a decision. Only `narrative` and `applications` are written here, because
 * only they are new.
 */
export type FinalBrand = {
  name: string;
  tagline: string;
  positioningStatement: string;
  /** The elevator pitch, one paragraph. */
  narrative: string;
  personality: Personality;
  voice: Voice;
  visualIdentity: VisualDirection;
  /** Where and how the brand shows up, e.g. "landing page hero", "app empty state". */
  applications: string[];
  /** When the brand was locked. */
  lockedAt: string;
};

export type BrandState = {
  /** Stable identifier for this brand project. */
  id: string;
  /** The contract version this object was built against. */
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;

  project: Project;
  discovery: Discovery;
  positioning: Positioning;
  /** Every candidate considered, including the ones not picked. */
  strategyOptions: StrategyOption[];
  selectedStrategy?: SelectedStrategy;
  personality: Personality;
  naming: Naming;
  visualDirection: VisualDirection;
  voice: Voice;
  stressTests: StressTest[];
  consistency: Consistency;
  finalBrand?: FinalBrand;
};

/**
 * The sections a step may write. `project` is absent on purpose: it is the seed
 * the user supplies, never something a step derives.
 */
export type BrandStateSection =
  | 'discovery'
  | 'positioning'
  | 'strategyOptions'
  | 'selectedStrategy'
  | 'personality'
  | 'naming'
  | 'visualDirection'
  | 'voice'
  | 'stressTests'
  | 'consistency'
  | 'finalBrand';

/** The section values, keyed by section name. */
export type SectionValue<S extends BrandStateSection> = NonNullable<BrandState[S]>;
