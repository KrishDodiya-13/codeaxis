/**
 * Test fixtures.
 *
 * `sectionFixtures` holds one schema-valid value per section, which doubles as
 * the stub deriver's canned responses — so the pipeline tests exercise the real
 * merge, dependency and validation logic without an API key or a network call.
 */
import type { SectionDeriver, Usage } from '../src/client.ts';
import type {
  BrandState,
  BrandStateSection,
  Consistency,
  Discovery,
  FinalBrand,
  Positioning,
  Project,
  SelectedStrategy,
  Shape,
  StressTest,
  VisualDirection,
} from '../src/types.ts';

export const project: Project = {
  idea: 'A tool that turns a service business into a repeatable, sellable product.',
  productType: 'B2B SaaS',
  goal: 'Be the obvious choice for agencies productising their first offer.',
};

const discovery: Discovery = {
  problem: 'Agency owners sell their own time and cannot step away without revenue stopping.',
  targetAudience: 'Owners of 5-to-20-person service agencies who have tried packaging an offer once and abandoned it.',
  userNeed: 'To stop being the bottleneck in their own delivery.',
  goals: ['Be understood in one sentence by a non-technical owner', 'Signal operational rigour, not hustle'],
  constraints: ['Sold founder-to-founder, not through a sales team', 'Competes with spreadsheets and habit'],
  assumptions: ['Owners already believe productising is the answer and are stuck on execution'],
  openQuestions: ['Is the buyer the owner or an operations lead?'],
};

const positioning: Positioning = {
  category: 'Productisation infrastructure for service businesses',
  valueProposition: 'Turn the work you already repeat into an offer someone else can deliver.',
  differentiator: 'Built from the delivery record rather than from a blank template.',
  competitiveAngle: 'Incumbents sell planning documents; the plan is not where agencies fail, delivery is.',
  rationale: ['Discovery put the failure at execution, not intent', 'The audience has abandoned one attempt already'],
};

const shape: Shape = {
  personality: ['Exacting', 'Plain-spoken', 'Unsentimental about craft'],
  principles: [
    'Never ask for information the delivery record already contains',
    'Show the repeatable pattern before proposing the product',
  ],
  namingTerritories: [
    { name: 'Repetition', rationale: 'Names the pattern the tool finds.', examples: ['Cadence', 'Throughline'] },
    { name: 'Handover', rationale: 'Names the outcome: work leaving the owner.', examples: ['Handoff', 'Relay'] },
  ],
  taglineDirections: [
    { tagline: 'The work you already repeat.', rationale: 'Points at the asset they own.', personalityFit: ['Plain-spoken'] },
    { tagline: 'Stop being the bottleneck.', rationale: 'Names the need directly.', personalityFit: ['Exacting'] },
  ],
  messagingHierarchy: [
    { level: 'hero', message: 'Turn repeated work into a product.', audience: 'Agency owners' },
    { level: 'proof point', message: 'Built from your delivery record.', audience: 'Operations leads' },
  ],
};

const visualDirection: VisualDirection = {
  colors: ['Ink #12141A — primary text', 'Signal #2E5BFF — action'],
  typography: 'A grotesque for interface text, paired with a monospace for delivery data.',
  imagery: 'Interface detail and real delivery records, no stock photography of teams.',
  shapes: 'Tight grid, square corners, dense tables.',
  mood: 'The calm of a system that already knows the answer.',
  avoid: ['Hustle-culture warmth', 'Gradients standing in for depth'],
};

const selectedStrategy: SelectedStrategy = {
  name: 'Throughline',
  tagline: 'The work you already repeat.',
  namingTerritory: 'Repetition',
  positioningStatement: 'Throughline turns the work an agency already repeats into an offer someone else can deliver.',
  rationale: ['Carries the differentiator without explaining it'],
  rejectedAlternatives: ['Handoff — reads as offboarding'],
};

const stressTests: StressTest[] = [
  {
    dimension: 'misreading',
    scenario: 'Heard aloud in a noisy room.',
    finding: 'Mistaken for "throughput" by listeners in operations roles.',
    severity: 'medium',
    recommendation: 'Always pair the name with the tagline on first use.',
    passed: true,
  },
  {
    dimension: 'competitor collision',
    scenario: 'An incumbent adds a delivery-record import next quarter.',
    finding: 'The differentiator narrows to depth of the record rather than its existence.',
    severity: 'high',
    recommendation: 'Move proof toward the pattern found, not the import.',
    passed: false,
  },
  {
    dimension: 'scale',
    scenario: 'Expanding beyond agencies to in-house teams.',
    finding: 'The name survives; the tagline assumes client work.',
    severity: 'low',
    recommendation: 'Keep the tagline scoped to the agency segment.',
    passed: true,
  },
];

const consistency: Consistency = {
  coherent: false,
  issues: [
    {
      sections: ['stressTests', 'positioning'],
      conflict: 'The differentiator rests on a capability an incumbent can copy.',
      severity: 'high',
      resolution: 'Restate the differentiator around the pattern found rather than the data ingested.',
    },
  ],
  strengths: ['Visual direction and personality both read as exacting rather than warm'],
};

const finalBrand: FinalBrand = {
  name: 'Throughline',
  tagline: 'The work you already repeat.',
  positioningStatement: 'Throughline turns the work an agency already repeats into an offer someone else can deliver.',
  narrative:
    'Every agency already delivers the same work more than once. Throughline reads the delivery record, finds the pattern, and turns it into an offer someone other than the owner can run.',
  personality: ['Exacting', 'Plain-spoken', 'Unsentimental about craft'],
  principles: [
    'Never ask for information the delivery record already contains',
    'Show the repeatable pattern before proposing the product',
  ],
  voice: {
    tone: 'Direct, technical where it earns trust, never motivational.',
    does: ['Name the work concretely', 'Use the numbers already in the record'],
    donts: ['Scale your impact', 'Unlock your potential'],
  },
  messaging: [
    { level: 'hero', message: 'The work you already repeat, as a product.', audience: 'Agency owners' },
    { level: 'proof point', message: 'Read from your delivery record, not a blank template.', audience: 'Operations leads' },
  ],
  visualIdentity: visualDirection,
  applications: ['Landing page hero', 'First-run pattern report'],
};

/** One schema-valid value per section. */
export const sectionFixtures = {
  discovery,
  positioning,
  shape,
  visualDirection,
  selectedStrategy,
  stressTests,
  consistency,
  finalBrand,
} as const;

/** A fully derived state, for report and validation tests. */
export function completeState(): BrandState {
  return structuredClone({ project, ...sectionFixtures }) as BrandState;
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
  readonly calls: Array<{ section: BrandStateSection; serializedState: string }> = [];

  async deriveSection<T>(
    section: BrandStateSection,
    serializedState: string,
    schema: { parse(value: unknown): unknown },
  ): Promise<{ value: T; usage: Usage }> {
    this.calls.push({ section, serializedState });

    // stressTests is requested wrapped in an object, matching the real schema.
    const raw =
      section === 'stressTests'
        ? { stressTests: sectionFixtures.stressTests }
        : sectionFixtures[section];

    // Parsing through the real schema keeps the fixtures honest: a fixture that
    // drifts out of schema fails the test rather than silently passing.
    return { value: schema.parse(structuredClone(raw)) as T, usage: stubUsage };
  }
}
