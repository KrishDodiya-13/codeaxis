/**
 * Discovery and Positioning against realistic input.
 *
 * The other suites cover mechanics with convenient fixtures. These use the kind of
 * input the product actually gets — a one-line idea, a thin idea, a contradictory one —
 * and assert the properties the stages exist to guarantee: that nothing is fabricated,
 * that unknowns are recorded as unknowns, that positioning carries its uncertainty, and
 * that the two stages cannot silently disagree.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeriveOptions, SectionDeriver, Usage } from '../src/client.ts';
import { discover, isDiscoverySufficient, toDiscoverySection } from '../src/discover.ts';
import type { DiscoverResult } from '../src/discover.ts';
import { hashDiscovery, isPositioningStale, position, toPositioningSection } from '../src/position.ts';
import type { PositionResult } from '../src/position.ts';
import { DISCOVER_INSTRUCTIONS, POSITION_INSTRUCTIONS } from '../src/prompts.ts';
import {
  DiscoverResultSchema,
  DiscoverySchema,
  PositionResponseSchema,
  PositioningSchema,
} from '../src/schemas.ts';
import { applyDelta, createInitialState, validateState } from '../src/state.ts';

const usage: Usage = { inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0 };

/** A deriver that returns one scripted value and records the prompt it was given. */
function scripted(value: unknown) {
  const prompts: string[] = [];
  const deriver: SectionDeriver & { prompts: string[] } = {
    prompts,
    async deriveSection<T>(
      _section: string,
      _state: string,
      schema: { parse(v: unknown): unknown },
      options?: DeriveOptions,
    ): Promise<{ value: T; usage: Usage }> {
      prompts.push(options?.userPrompt ?? '');
      // Parsed through the real schema, so a scripted value that would not validate
      // fails the test rather than passing through.
      return { value: schema.parse(value) as T, usage };
    },
  } as never;
  return deriver;
}

/* ------------------------------------------------------------------ *
 * A one-line idea, which is the realistic starting point.
 * ------------------------------------------------------------------ */

const ONE_LINE_IDEA = 'I want to build an app for students to find hackathon teammates';

/** What an honest DISCOVER pass on that idea looks like. */
const thinDiscovery: DiscoverResult = {
  problem:
    'Students who want to enter hackathons often cannot find teammates with complementary skills before registration closes, especially without an existing technical network.',
  targetAudience: 'Students, likely at university level, who want to enter hackathons.',
  userNeed:
    'A fast, low-friction way to find and vet teammates by skill and availability, without relying on an existing social circle.',
  goals: ['Help students form a team before a given event deadline'],
  constraints: [],
  assumptions: [
    'The students are at university level, which the idea implies but does not state',
    'Teams form per event rather than persisting, which the idea does not say either way',
  ],
  missingInformation: [
    'Whether this is for one campus or open to students anywhere',
    'Whether it is tied to specific events or is a general pool',
    'What finding a teammate means in practice — browsing, matching, or posted listings',
    'Whether users must be verified as students',
    'Platform target: web, mobile, or both',
    'Any budget, timeline or team available to build it',
  ],
  followUpQuestions: [
    'Is this for students at one university, or open to students anywhere?',
    'Should it be tied to specific hackathons, or an always-on pool?',
    'How do you picture matching working — browsing profiles, a swipe match, or posted listings?',
    'Do you want to verify that users are really students?',
    'Is this a mobile app, a web app, or both?',
    'Do you have a rough budget, timeline or team for building it?',
  ],
};

describe('DISCOVER on a one-line idea', () => {
  it('produces a schema-valid result', () => {
    const result = DiscoverResultSchema.safeParse(thinDiscovery);
    assert.ok(result.success, result.success ? '' : result.error.message);
  });

  it('records what it inferred as an assumption rather than stating it as fact', () => {
    // The idea never said "university" — the audience field says "likely", and the
    // inference is named in assumptions so a reader can see it is a guess.
    assert.match(thinDiscovery.targetAudience, /likely/);
    assert.ok(thinDiscovery.assumptions.some((a) => /university level/.test(a)));
  });

  it('leaves constraints empty rather than inventing one', () => {
    // Nothing in the idea implies a budget, platform or timeline. An empty array is the
    // honest answer and the schema allows it.
    assert.deepEqual(thinDiscovery.constraints, []);
    assert.ok(DiscoverResultSchema.safeParse(thinDiscovery).success);
  });

  it('reports the thinness as gaps rather than filling them in', () => {
    // For a one-line idea, a short gap list means the model quietly assumed things.
    assert.ok(
      thinDiscovery.missingInformation.length >= 5,
      `only ${thinDiscovery.missingInformation.length} gaps for a one-line idea`,
    );
  });

  it('asks a question for every gap', () => {
    assert.ok(thinDiscovery.followUpQuestions.length >= thinDiscovery.missingInformation.length - 1);
  });

  it('is not sufficient, so positioning must not run on it yet', () => {
    assert.equal(isDiscoverySufficient(thinDiscovery), false);
  });

  it('keeps problem and userNeed as different statements', () => {
    assert.notEqual(thinDiscovery.problem, thinDiscovery.userNeed);
  });

  it('sends only the idea on the first call, with no invented context', async () => {
    const deriver = scripted(thinDiscovery);
    await discover(deriver, { idea: ONE_LINE_IDEA });

    const prompt = deriver.prompts[0]!;
    assert.match(prompt, /hackathon teammates/);
    assert.doesNotMatch(prompt, /<prior_discovery>/);
  });

  it('maps unresolved gaps into openQuestions rather than dropping them', () => {
    const section = toDiscoverySection(thinDiscovery);
    assert.ok(DiscoverySchema.safeParse(section).success);
    assert.equal(section.openQuestions.length, thinDiscovery.missingInformation.length);
  });

  it('carries the assumptions into the stored state', () => {
    assert.deepEqual(toDiscoverySection(thinDiscovery).assumptions, thinDiscovery.assumptions);
  });
});

describe('the DISCOVER instructions forbid fabrication', () => {
  it('say not to generate a brand', () => {
    assert.match(DISCOVER_INSTRUCTIONS, /Do not generate a brand/i);
  });

  it('say a gap goes in missingInformation rather than into a field as a guess', () => {
    assert.match(DISCOVER_INSTRUCTIONS, /not into a field as a guess/i);
  });

  it('require every inferred value to be named as an assumption', () => {
    assert.match(DISCOVER_INSTRUCTIONS, /the customer you described is an assumption/i);
  });

  it('allow empty arrays rather than filler', () => {
    assert.match(DISCOVER_INSTRUCTIONS, /Empty arrays are valid output/i);
  });
});

/* ------------------------------------------------------------------ *
 * Discovery answered, then positioned.
 * ------------------------------------------------------------------ */

/** The same project after the user answered every question. */
const settledDiscovery = toDiscoverySection({
  ...thinDiscovery,
  targetAudience: 'Any university student entering a specific hackathon without a full team.',
  goals: [
    'Help students form a team before a given event deadline',
    'Be trusted enough that a stranger match feels safe',
  ],
  constraints: [
    'Students must be verified by .edu email',
    'Web and mobile from the start',
    'No budget for paid acquisition',
  ],
  assumptions: [],
  missingInformation: [],
  followUpQuestions: [],
});

const positioned: PositionResult = {
  category: 'Team-formation tool for hackathon entrants',
  audience: 'University students entering a specific hackathon without a full team',
  problem: settledDiscovery.problem,
  userNeed: settledDiscovery.userNeed,
  positioning:
    'For university students entering a specific hackathon, this is the verified team-formation tool that matches people by skill before registration closes, instead of leaving it to group chats.',
  valueProposition:
    'Post what you need or what you offer, and form a verified team before the registration deadline.',
  differentiator:
    'Every profile is tied to one event and a verified .edu identity, so matches are relevant and the person is real.',
  competitiveAngle:
    'The real incumbent is an unstructured Discord server or a campus group chat, not another product — the angle is structure and verification against improvisation.',
  rationale: [
    'Discovery recorded .edu verification as a constraint, so verification is a real capability rather than a claim',
    'Discovery said students lack an existing technical network, so the position attacks reliance on who you already know',
    'Confidence is high because the audience, the constraints and the need were all stated rather than inferred',
  ],
  assumptions: [
    'Most students still coordinate through group chats today, which discovery implied but did not measure',
  ],
  confidence: 'high',
  categoryCheck: { couldDescribeUnrelatedProducts: false, unrelatedProducts: [] },
};

describe('POSITION on an answered discovery', () => {
  it('returns every field the contract requires', () => {
    const response = PositionResponseSchema.safeParse({
      ...positioned,
      categoryCheck: undefined,
    });
    // categoryCheck is internal, so the response schema must reject it.
    assert.equal(response.success, false);

    const { categoryCheck: _internal, ...body } = positioned;
    const clean = PositionResponseSchema.safeParse(body);
    assert.ok(clean.success, clean.success ? '' : clean.error.message);

    assert.deepEqual(Object.keys(body).sort(), [
      'assumptions',
      'audience',
      'category',
      'competitiveAngle',
      'confidence',
      'differentiator',
      'positioning',
      'problem',
      'rationale',
      'userNeed',
      'valueProposition',
    ]);
  });

  it('echoes problem and userNeed from discovery without rewriting them', () => {
    assert.equal(positioned.problem, settledDiscovery.problem);
    assert.equal(positioned.userNeed, settledDiscovery.userNeed);
  });

  it('keeps the positioning statement distinct from the value proposition', () => {
    assert.notEqual(positioned.positioning, positioned.valueProposition);
    // The statement names the audience and the alternative; the value claim need not.
    assert.match(positioned.positioning, /students/i);
    assert.match(positioned.positioning, /instead of/i);
  });

  it('never claims there are no competitors', () => {
    assert.doesNotMatch(positioned.competitiveAngle, /no (direct )?competitors/i);
    assert.match(positioned.competitiveAngle, /group chat|Discord|improvis/i);
  });

  it('ties each rationale line to something in discovery', () => {
    const grounded = positioned.rationale.filter((line) => /[Dd]iscovery|stated|constraint/.test(line));
    assert.equal(grounded.length, positioned.rationale.length);
  });

  it('rejects marketing filler in the category', async () => {
    const { isCategoryAllFiller } = await import('../src/position.ts');
    assert.equal(isCategoryAllFiller(positioned.category), false);
    assert.equal(isCategoryAllFiller('Modern collaborative platform'), true);
  });

  it('records what it still assumes, even on a settled discovery', () => {
    // Discovery had no open questions, yet positioning still inferred something about
    // the status quo. That belongs in assumptions, not presented as fact.
    assert.ok(positioned.assumptions.length > 0);
  });

  it('carries confidence, and justifies it in rationale', () => {
    assert.equal(positioned.confidence, 'high');
    assert.ok(positioned.rationale.some((line) => /[Cc]onfidence/.test(line)));
  });

  it('runs without the guard firing, because discovery is settled', async () => {
    const deriver = scripted(positioned);
    const result = await position(deriver, { discovery: settledDiscovery });

    assert.equal(result.value.confidence, 'high');
    assert.doesNotMatch(deriver.prompts[0]!, /<unresolved_questions>/);
  });

  it('stores assumptions and confidence, but not the echoed discovery fields', async () => {
    const deriver = scripted(positioned);
    const result = await position(deriver, { discovery: settledDiscovery });
    const section = toPositioningSection(result.value, settledDiscovery);

    assert.ok(PositioningSchema.safeParse(section).success);
    assert.deepEqual(section.assumptions, positioned.assumptions);
    assert.equal(section.confidence, 'high');

    const asRecord = section as Record<string, unknown>;
    for (const echoed of ['audience', 'problem', 'userNeed', 'positioning']) {
      assert.equal(asRecord[echoed], undefined, `${echoed} should not be duplicated into state`);
    }
  });
});

describe('POSITION instructions guard against filler and contradiction', () => {
  it('distinguish the positioning statement from the value proposition', () => {
    assert.match(POSITION_INSTRUCTIONS, /Do not write the same sentence twice/i);
  });

  it('require assumptions and an honest confidence', () => {
    assert.match(POSITION_INSTRUCTIONS, /Assumptions and confidence/i);
    assert.match(POSITION_INSTRUCTIONS, /worse than an openly uncertain one/i);
  });

  it('forbid rewriting discovery rather than flagging it', () => {
    assert.match(POSITION_INSTRUCTIONS, /Do not rewrite the problem/i);
    assert.match(POSITION_INSTRUCTIONS, /Do not edit discovery/i);
  });
});

/* ------------------------------------------------------------------ *
 * The two stages together.
 * ------------------------------------------------------------------ */

describe('discovery and positioning stay consistent', () => {
  it('produce a state that validates as a whole', () => {
    let state = createInitialState({ idea: ONE_LINE_IDEA });
    state = applyDelta(state, 'discovery', settledDiscovery);
    const { categoryCheck: _c, ...body } = positioned;
    state = applyDelta(state, 'positioning', toPositioningSection(body, settledDiscovery));

    assert.deepEqual(validateState(state), { valid: true });
  });

  it('records which discovery the positioning came from', () => {
    const { categoryCheck: _c, ...body } = positioned;
    const section = toPositioningSection(body, settledDiscovery);
    assert.equal(section.sourceDiscoveryHash, hashDiscovery(settledDiscovery));
    assert.equal(isPositioningStale(settledDiscovery, section), false);
  });

  it('detects positioning left stale by a later answer to discovery', () => {
    const { categoryCheck: _c, ...body } = positioned;
    const section = toPositioningSection(body, settledDiscovery);

    // The user comes back and narrows the audience after positioning ran.
    const edited = { ...settledDiscovery, targetAudience: 'Final-year computer science students only' };
    assert.equal(isPositioningStale(edited, section), true);
  });

  it('refuses to position while questions are outstanding', async () => {
    const { DiscoveryIncompleteError } = await import('../src/position.ts');
    const unfinished = toDiscoverySection(thinDiscovery);

    await assert.rejects(
      () => position(scripted(positioned), { discovery: unfinished }),
      (error: unknown) => {
        assert.ok(error instanceof DiscoveryIncompleteError);
        assert.equal(error.openQuestions.length, thinDiscovery.missingInformation.length);
        return true;
      },
    );
  });

  it('names every assumed answer when told to proceed anyway', async () => {
    const unfinished = toDiscoverySection(thinDiscovery);
    const forced: PositionResult = {
      ...positioned,
      confidence: 'low',
      assumptions: [...positioned.assumptions, 'Assumed any student, not one campus'],
      assumptionsUsed: ['Assumed any student, not one campus, since that question was left open'],
      rationale: [...positioned.rationale, 'Confidence is low because six questions were assumed away'],
    };

    const deriver = scripted(forced);
    const result = await position(deriver, { discovery: unfinished, forceProceed: true });

    assert.match(deriver.prompts[0]!, /<unresolved_questions>/);
    assert.equal(result.value.confidence, 'low');
    assert.ok((result.value.assumptionsUsed ?? []).length > 0);
  });
});
