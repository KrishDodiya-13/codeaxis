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
};

export type NamingTerritory = {
  /** Short label for the territory, e.g. "Craft & Provenance". */
  name: string;
  /** The idea the territory is built on. */
  rationale: string;
  /** Example names that live inside this territory. */
  examples: string[];
};

export type TaglineDirection = {
  tagline: string;
  /** Why this line follows from the positioning. */
  rationale: string;
  /** Which personality traits the line leans on. */
  personalityFit: string[];
};

export type MessagingLayer = {
  /** Where this layer is used, e.g. "hero", "subhead", "proof point". */
  level: string;
  message: string;
  /** Who this layer is speaking to. */
  audience: string;
};

/** The brand's personality and voice — naming, tagline, messaging exploration. */
export type Shape = {
  personality: string[];
  principles: string[];
  namingTerritories: NamingTerritory[];
  taglineDirections: TaglineDirection[];
  messagingHierarchy: MessagingLayer[];
};

/** The look and feel: color, type, imagery, shape language, mood, and what to avoid. */
export type VisualDirection = {
  colors: string[];
  typography: string;
  imagery: string;
  shapes: string;
  mood: string;
  avoid: string[];
};

/** The chosen direction once options have been narrowed down. */
export type SelectedStrategy = {
  name: string;
  tagline: string;
  /** Which naming territory the name came from. */
  namingTerritory: string;
  /** The positioning statement in one sentence. */
  positioningStatement: string;
  /** Why this option beat the alternatives. */
  rationale: string[];
  /** Directions considered and set aside, so the choice stays auditable. */
  rejectedAlternatives: string[];
};

export type StressTest = {
  /** What was tested, e.g. "misreading", "competitor collision", "scale". */
  dimension: string;
  /** The specific scenario the strategy was put under. */
  scenario: string;
  /** What happened when the strategy met the scenario. */
  finding: string;
  severity: 'low' | 'medium' | 'high';
  /** How to resolve or absorb the finding. */
  recommendation: string;
  passed: boolean;
};

export type ConsistencyIssue = {
  /** The `BrandState` sections that disagree, e.g. `["shape", "visualDirection"]`. */
  sections: string[];
  conflict: string;
  severity: 'low' | 'medium' | 'high';
  resolution: string;
};

/** Cross-check results ensuring the sections don't contradict each other. */
export type Consistency = {
  coherent: boolean;
  issues: ConsistencyIssue[];
  /** What holds together well, kept so later revisions don't break it. */
  strengths: string[];
};

/** The finished, locked brand package. */
export type FinalBrand = {
  name: string;
  tagline: string;
  positioningStatement: string;
  /** The elevator pitch, one paragraph. */
  narrative: string;
  personality: string[];
  principles: string[];
  voice: {
    tone: string;
    /** Words and constructions the brand uses. */
    does: string[];
    /** Words and constructions the brand avoids. */
    donts: string[];
  };
  messaging: MessagingLayer[];
  visualIdentity: VisualDirection;
  /** Where and how the brand shows up, e.g. "landing page hero", "app empty state". */
  applications: string[];
};

export type BrandState = {
  project: Project;
  discovery: Discovery;
  positioning: Positioning;
  shape: Shape;
  visualDirection: VisualDirection;
  selectedStrategy?: SelectedStrategy;
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
  | 'shape'
  | 'visualDirection'
  | 'selectedStrategy'
  | 'stressTests'
  | 'consistency'
  | 'finalBrand';

/** The section values, keyed by section name. */
export type SectionValue<S extends BrandStateSection> = NonNullable<BrandState[S]>;
