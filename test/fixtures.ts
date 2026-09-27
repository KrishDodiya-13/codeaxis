/**
 * Test fixtures.
 *
 * `sectionFixtures` holds one schema-valid value per section, which doubles as
 * the stub deriver's canned responses — so the pipeline tests exercise the real
 * merge, dependency and validation logic without an API key or a network call.
 */
import type { DeriveOptions, SectionDeriver, Usage } from '../src/client.ts';
import type { DiscoverResult } from '../src/discover.ts';
import type { BrandOsDraft } from '../src/brandos.ts';
import { BRAND_OS_INSTRUCTIONS } from '../src/prompts.ts';
import { SCHEMA_VERSION } from '../src/schemas.ts';
import { toStrategyOption } from '../src/battle.ts';
import { TEST_TYPES } from '../src/types.ts';
import type { StrategyCandidate } from '../src/battle.ts';
import { hashDiscovery } from '../src/position.ts';
import type { PositionResult } from '../src/position.ts';
import type {
  BrandState,
  BrandStateSection,
  Consistency,
  Discovery,
  FinalBrand,
  Positioning,
  Project,
  SelectedStrategy,
  Personality,
  Naming,
  Voice,
  StrategyOption,
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

/**
 * The POSITION response, as the endpoint returns it.
 *
 * Built so `toPositioningSection` maps it onto `positioning` below, and with a
 * passing `categoryCheck` so the specificity retry loop is not triggered.
 */
export const positionResult: PositionResult = {
  category: 'Productisation tool for service agencies',
  audience: 'Owners of 5-to-20-person service agencies who have abandoned one attempt at packaging an offer',
  problem: 'Agency owners sell their own time and cannot step away without revenue stopping.',
  userNeed: 'To stop being the bottleneck in their own delivery.',
  positioning:
    'For owners of small service agencies who have already tried packaging an offer, Throughline is a productisation tool that builds the offer from their delivery record rather than from a blank template.',
  valueProposition:
    'Reads an agency delivery record, finds the work already repeated, and turns it into an offer someone other than the owner can run.',
  differentiator: 'Built from the delivery record rather than from a blank template.',
  competitiveAngle: 'Incumbents sell planning documents; the plan is not where agencies fail, delivery is.',
  rationale: [
    'Discovery put the failure at execution, not intent',
    'The audience has abandoned one attempt already',
    'Confidence is medium: the audience was stated, but the alternative people use today was inferred',
  ],
  assumptions: [
    'Owners currently improvise with documents and habit rather than a named competitor, which discovery implied but did not state',
  ],
  confidence: 'medium',
  categoryCheck: { unrelatedProducts: [], couldDescribeUnrelatedProducts: false },
};

const positioning: Positioning = {
  category: 'Productisation tool for service agencies',
  valueProposition: 'Turn the work you already repeat into an offer someone else can deliver.',
  differentiator: 'Built from the delivery record rather than from a blank template.',
  competitiveAngle: 'Incumbents sell planning documents; the plan is not where agencies fail, delivery is.',
  rationale: [
    'Discovery put the failure at execution, not intent',
    'The audience has abandoned one attempt already',
  ],
  assumptions: [
    'Owners currently improvise with documents and habit rather than a named competitor',
  ],
  confidence: 'medium',
  sourceDiscoveryHash: hashDiscovery(discovery),
};

const personality: Personality = {
  traits: ['Exacting', 'Plain-spoken', 'Steady'],
  antiTraits: ['Motivational', 'Hustle-coded', 'Deferential about craft'],
  values: [
    'Never ask for information the delivery record already contains',
    'Show the repeatable pattern before proposing the product',
  ],
  archetype: 'The Auditor — reads what is already there and says it plainly',
  rationale: [
    'Exacting and plain-spoken follow from the TRUST direction, which promises nothing is invented',
    'Steady replaces a warmer trait so the voice does not fight the reassurance the strategy rests on',
  ],
};

const naming: Naming = {
  territories: [
    'repetition (e.g. Cadence)',
    'handover (e.g. Relay)',
  ],
  candidates: [
    {
      name: 'Throughline',
      territory: 'repetition (e.g. Cadence)',
      pros: ['Names the pattern the tool finds', 'Reads as one word and spells itself'],
      cons: ['Heard aloud it can be taken for "throughput"'],
    },
    {
      name: 'Relay',
      territory: 'handover (e.g. Relay)',
      pros: ['Names the outcome: work leaving the owner'],
      cons: ['Crowded — several unrelated products already use it'],
    },
  ],
  selectedName: 'Throughline',
  tagline: {
    candidates: ['The work you already repeat.', 'Stop being the bottleneck.'],
    selected: 'The work you already repeat.',
  },
};

const voice: Voice = {
  toneAttributes: ['Direct', 'Technical where it earns trust', 'Calm under a deadline'],
  writingPrinciples: [
    'Name the work concretely',
    'Use the numbers already in the delivery record',
    'Short sentences',
  ],
  avoid: ['Scale your impact', 'Unlock your potential', 'Any sentence that would fit a hustle newsletter'],
  messagingHierarchy: {
    primaryMessage: 'Turn the work you already repeat into a product someone else can run.',
    supportingMessages: [
      'Built from your delivery record, not a blank template',
      'Nothing here is invented — every offer traces to work you shipped',
    ],
  },
};

const visualDirection: VisualDirection = {
  colors: ['Ink #12141A — primary text', 'Signal #2E5BFF — action'],
  typography: 'A grotesque for interface text, paired with a monospace for delivery data.',
  imagery: 'Interface detail and real delivery records, no stock photography of teams.',
  shapes: 'Tight grid, square corners, dense tables.',
  mood: 'The calm of a system that already knows the answer.',
  avoid: ['Hustle-culture warmth', 'Gradients standing in for depth'],
};

/**
 * Three strategy candidates, as BRAND BATTLE returns them internally.
 *
 * Deliberately built to pass the distinctness check: different claims, different
 * primary segments, different risks. `indistinctCandidates` below is the opposite,
 * for testing the check itself.
 */
export const strategyCandidates: StrategyCandidate[] = [
  {
    direction: 'CONNECTION',
    name: 'The Operator Network',
    coreIdea:
      'Owners stall on delegation because they have nobody to hand the work to, not because the process is unwritten.',
    tradeoffs: [
      'Gives up being useful on day one to a solo owner with nobody to delegate to yet',
    ],
    positioning:
      'The place agency owners find the operators who can run the work without them. Productising is a people problem before it is a process problem.',
    strengths: ['Addresses the reason past attempts were abandoned: nobody to hand the work to'],
    risks: ['Needs a supply of operators before it is useful to anyone, so it is thin at launch'],
    audienceFit:
      'Best fits owners who have already written the process and stalled on delegation. Less compelling to owners still working out what they repeat.',
    differentiation:
      'Unlike template libraries, this connects an owner to people who have run the same playbook elsewhere.',
    rationale: ['Discovery put the failure at execution, not intent'],
    uniqueClaim: 'we connect owners to operators who have run this playbook',
    primarySegment: 'owners stalled on delegation',
  },
  {
    direction: 'COMPETITION',
    name: 'Outgrow The Hour',
    coreIdea:
      'Owners move when they see a peer pulling ahead, not when they are told productising is sensible.',
    tradeoffs: [
      'Gives up the owner who chose small deliberately, which is a large share of the market',
    ],
    positioning:
      'Agencies that productise outgrow the ones that do not. Turn your delivery record into an offer that compounds while your competitors keep selling hours.',
    strengths: ['Appeals to owners benchmarking themselves against faster-growing peers'],
    risks: ['A status framing can alienate owners who see their craft as the point, narrowing the market'],
    audienceFit:
      'Best fits ambitious owners chasing growth. Less compelling to lifestyle-business owners who chose small deliberately.',
    differentiation: 'Frames productisation as competitive advantage rather than as internal tidiness.',
    rationale: ['Discovery goals named operational rigour as a signal worth sending'],
    uniqueClaim: 'productising is how you outgrow rival agencies',
    primarySegment: 'growth-chasing owners',
  },
  {
    direction: 'TRUST',
    name: 'Nothing Invented',
    coreIdea:
      'Owners who abandoned one attempt will only try again if the output is evidently theirs rather than a template.',
    tradeoffs: [
      'Gives up any claim to ambition or upside, which is what a growth-minded buyer wants to hear',
    ],
    positioning:
      'Your delivery record already contains the answer, so nothing here is invented. Every offer is built from work you have shipped and can stand behind.',
    strengths: ['Removes the leap of faith that made the abandoned first attempt feel risky'],
    risks: ['Reads as unambitious next to louder tools, which makes it harder to market'],
    audienceFit:
      'Best fits cautious owners burned by a previous attempt. Less compelling to early-stage agencies with a thin delivery record to draw on.',
    differentiation: 'Built only from evidence the agency already has, never from a blank template.',
    rationale: ['Discovery recorded that the audience abandoned one attempt already'],
    uniqueClaim: 'every offer is evidenced by work already delivered',
    primarySegment: 'cautious owners burned before',
  },
];

/** Two candidates that collide on every axis, for testing the distinctness check. */
export const indistinctCandidates: StrategyCandidate[] = [
  strategyCandidates[0]!,
  {
    ...strategyCandidates[1]!,
    direction: 'OUTCOMES',
    uniqueClaim: 'we connect owners to operators who have run this playbook',
    primarySegment: 'owners stalled on delegation',
    risks: [...strategyCandidates[0]!.risks],
  },
];

const strategyOptions: StrategyOption[] = strategyCandidates.map(toStrategyOption);

const selectedStrategy: SelectedStrategy = {
  direction: 'TRUST',
  chosenAt: '2026-09-27T10:00:00.000Z',
  reasonChosen: 'The audience has been burned once; reassurance beats ambition here.',
};

/**
 * Findings that pass the auditability checks: every evidence cites field paths, and
 * no impact merely restates its issue.
 */
const stressTests: StressTest[] = [
  {
    type: 'contradiction',
    severity: 'high',
    issue:
      'The personality is unsentimental and exacting, while the chosen TRUST strategy leans on reassurance, so the voice and the strategic bet pull in opposite directions.',
    evidence:
      'personality.traits (["Exacting", "Plain-spoken", "Steady"]) vs selectedStrategy.direction (TRUST) and strategyOptions[2].positioning',
    impact:
      'Onboarding copy written to reassure a cautious owner will read as cold next to marketing that promises nothing is invented, and readers will not know which brand they are dealing with.',
    recommendation:
      'Add a warmth trait to shape.personality that survives the exacting register, such as "steady", or revisit whether TRUST is the right direction given the voice already drafted.',
  },
  {
    type: 'differentiation',
    severity: 'medium',
    issue:
      'Building an offer from the delivery record is a real advantage over a blank template, but a competitor could import the same records and claim it within a quarter.',
    evidence:
      'positioning.differentiator ("Built from the delivery record rather than from a blank template")',
    impact:
      'An agency comparing two tools side by side next year may see no reason to choose this one, which erodes the competitive angle after launch rather than at launch.',
    recommendation:
      'Rewrite positioning.differentiator around the pattern the tool finds in the record, not the fact that it reads the record at all.',
  },
  {
    type: 'cliché',
    severity: 'low',
    issue:
      'The mood copy reaches for calm-system language that would fit almost any operations product.',
    evidence: 'visualDirection.mood ("The calm of a system that already knows the answer")',
    impact:
      'A designer reading only this line has nothing specific to reach for, so the visual work will drift toward generic enterprise minimalism.',
    recommendation:
      'Rewrite visualDirection.mood around what the agency owner feels on seeing their own repeated work named back to them.',
  },
];

const consistency: Consistency = {
  status: 'issues-found',
  lastCheckedAt: '2026-09-27T09:00:00.000Z',
  checkedAgainstVersion: SCHEMA_VERSION,
  notes: [
    'personality.traits and selectedStrategy.direction agree: exacting reads as the TRUST bet, not as warmth',
    'naming.selectedName carries a misreading risk already recorded in stressTests',
  ],
};

const finalBrand: FinalBrand = {
  name: 'Throughline',
  tagline: 'The work you already repeat.',
  positioningStatement:
    'Your delivery record already contains the answer, so nothing here is invented. Every offer is built from work you have shipped and can stand behind.',
  narrative:
    'Every agency already delivers the same work more than once. Throughline reads the delivery record, finds the pattern, and turns it into an offer someone other than the owner can run.',
  personality,
  voice,
  visualIdentity: visualDirection,
  applications: ['Landing page hero', 'First-run pattern report'],
  lockedAt: '2026-09-27T10:30:00.000Z',
};

/**
 * The material the BRAND OS compile step generates.
 *
 * Only what nothing earlier in the pipeline produced; everything else in the
 * deliverable is projected from the state.
 */
export const brandOsDraft: BrandOsDraft = {
  purpose:
    'So that an agency owner is not the only person who can deliver the work their business is built on.',
  mission:
    'Read the delivery record an agency already has, find the work it repeats, and turn it into an offer someone else can run.',
  vision:
    'Service businesses that can be handed over, sold or stepped away from without the work stopping.',
  coreSegments: [
    'Owners of 5-to-20-person agencies who abandoned one attempt at packaging an offer',
    'Operations leads inheriting delivery from a founder who still holds the process in their head',
  ],
  nameRationale:
    'Throughline comes from the repetition territory and names the thing the tool actually finds: the line running through work an agency has already delivered. It spells itself and reads as one word. It was chosen in spite of a real drawback — heard aloud it can be taken for "throughput" — which is why it always appears with the tagline on first use.',
  archetype: 'The Auditor — reads what is already there and says it plainly',
  logoDirection:
    'A single continuous line resolving into a mark, drawn at the same weight as the interface type so it sits in a table header rather than above it. It should read as a record being traced, not as a spark or an upward arrow. Avoid gradients, avoid anything suggesting acceleration.',
  sampleCopy: {
    headline: 'You have already delivered this work. Eleven times.',
    boilerplate:
      'Throughline reads an agency delivery record, finds the work that repeats, and turns it into an offer someone other than the owner can run. Every offer traces to work the agency has already shipped, so nothing in it is invented.',
  },
  launch: {
    goToMarketSummary:
      'Founder-to-founder, because that is the constraint discovery recorded: no sales team and no paid acquisition. Reach owners where they already discuss delivery problems, lead with a pattern report built from their own record, and let the artefact do the selling rather than a pitch.',
    keyChannels: [
      'Agency-owner communities and Slack groups, where the delivery bottleneck is already the topic',
      'Direct founder outreach with a pattern report attached, since the artefact is the argument',
    ],
    rolloutSequence: [
      {
        milestone: 'Ten owners have seen their own delivery record read back to them',
        timing: '6 weeks before launch',
        detail:
          'Run the pattern report by hand for ten agencies and record which patterns they did not know they had.',
      },
      {
        milestone: 'The pattern report runs without a human',
        timing: 'launch week',
        detail: 'Self-serve import and report, with the naming and voice applied end to end.',
      },
      {
        milestone: 'First offer built by someone other than the owner',
        timing: 'month 2',
        detail:
          'Track whether an operations lead can take a generated offer and run it unaided — the actual promise.',
      },
    ],
  },
};

/**
 * What the lock step actually asks the model for.
 *
 * Only the two new fields. Everything else in `finalBrand` is copied from the branch
 * that owns it, so the step must not be fed the whole snapshot.
 */
export const finalBrandDraft = {
  narrative: finalBrand.narrative,
  applications: [...finalBrand.applications],
};

/** One schema-valid value per section. */
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
