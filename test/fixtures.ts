/**
 * Test fixtures.
 *
 * `sectionFixtures` holds one schema-valid value per section, which doubles as
 * the stub deriver's canned responses — so the pipeline tests exercise the real
 * merge, dependency and validation logic without an API key or a network call.
 */
import type { DeriveOptions, SectionDeriver, Usage } from '../src/client.ts';
import type { DiscoverResult } from '../src/discover.ts';
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

/**
 * The DISCOVER response, as the endpoint returns it.
 *
 * Built so `toDiscoverySection` maps it exactly onto `discovery` below, which
 * keeps the mapping honest: if the two drift, a test fails.
 */
export const discoverResult: DiscoverResult = {
  problem: 'Agency owners sell their own time and cannot step away without revenue stopping.',
  targetAudience: 'Owners of 5-to-20-person service agencies who have tried packaging an offer once and abandoned it.',
  userNeed: 'To stop being the bottleneck in their own delivery.',
  goals: ['Be understood in one sentence by a non-technical owner', 'Signal operational rigour, not hustle'],
  constraints: ['Sold founder-to-founder, not through a sales team', 'Competes with spreadsheets and habit'],
  assumptions: ['Owners already believe productising is the answer and are stuck on execution'],
  missingInformation: ['Whether the buyer is the owner or an operations lead'],
  followUpQuestions: ['Is the buyer the owner or an operations lead?'],
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

/**
 * The worked example from the Phase 2 spec, verbatim.
 *
 * Kept so the schema is checked against the contract as written, not only
 * against fixtures shaped to fit it.
 */
export const specWorkedExample: DiscoverResult = {
  problem:
    "Students who want to participate in hackathons often can't find teammates with complementary skills before registration closes, especially if they don't already have a network of technical peers.",
  targetAudience: 'Students (likely college/university level) who want to participate in hackathons.',
  userNeed:
    'A fast, low-friction way to find and vet potential teammates based on skills, interests, and availability — without relying on pre-existing social or campus networks.',
  goals: ["Help students form hackathon teams before a given event's deadline"],
  constraints: [],
  // Not in the spec's example, which predates tracking this distinction; these
  // are the inferences its own output visibly rests on.
  assumptions: [
    'The students are at college or university level, which the idea implies but does not state',
  ],
  missingInformation: [
    'Whether this targets a specific school/campus or is open to any student, anywhere',
    'Whether it is tied to specific hackathons/events or is a general teammate-matching pool',
    "What 'finding' a teammate means in practice — a swipe/match model, a searchable directory, a posted-listing model, or something else",
    'Team size constraints or team formation rules the app should respect',
    'Whether users need to verify they are students (e.g. .edu email)',
    'Platform target (web, mobile, both)',
    'Monetization or business model, if any',
    'Timeline, budget, or team size available to build this',
  ],
  followUpQuestions: [
    'Is this for students at a specific school/university, or open to students anywhere?',
    'Should this be tied to specific hackathon events, or a general always-on pool of students looking for teammates?',
    "How do you picture the matching working — profiles people browse, a swipe-style match, or posted 'looking for X skill' listings?",
    'Are there any team size limits or rules (e.g. max 4 people, must include a designer) the app should account for?',
    'Do you want to verify users are actual students, e.g. requiring a .edu email?',
    'Is this a mobile app, a web app, or both?',
    'Do you have a rough budget, timeline, or team size for building this?',
  ],
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

    // Two sections are not requested in their BrandState shape: stressTests is
    // wrapped in an object because a format needs an object root, and discovery
    // is requested as a DISCOVER result and mapped afterwards.
    const raw =
      section === 'stressTests'
        ? { stressTests: sectionFixtures.stressTests }
        : section === 'discovery'
          ? discoverResult
          : sectionFixtures[section];

    // Parsing through the real schema keeps the fixtures honest: a fixture that
    // drifts out of schema fails the test rather than silently passing.
    return { value: schema.parse(structuredClone(raw)) as T, usage: stubUsage };
  }
}
