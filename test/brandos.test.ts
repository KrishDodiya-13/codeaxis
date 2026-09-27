import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BrandOsInputError,
  IncompleteBrandOsError,
  IncompleteBrandStateError,
  assembleBrandOs,
  assessReadiness,
  compileBrandOs,
  findEmptyFields,
  findMissingForCompile,
  summarizeFindings,
  validateBrandOsRequest,
} from '../src/brandos.ts';
import type { BrandOs } from '../src/brandos.ts';
import { BRAND_OS_INSTRUCTIONS } from '../src/prompts.ts';
import { BrandOsSchema } from '../src/schemas.ts';
import { acknowledgeFinding } from '../src/stress.ts';
import { FinalizationBlockedError } from '../src/stress.ts';
import type { BrandState } from '../src/types.ts';
import { StubDeriver, brandOsDraft, completeState } from './fixtures.ts';

/** A state with nothing blocking, so it compiles. */
function readyState(): BrandState {
  const state = completeState();
  state.stressTests = acknowledgeFinding(state.stressTests, { type: 'contradiction' });
  return state;
}

describe('the BRAND OS instructions', () => {
  it('say the brand is already decided and not up for revision', () => {
    assert.match(BRAND_OS_INSTRUCTIONS, /is fixed and is copied across without you/i);
    assert.match(BRAND_OS_INSTRUCTIONS, /not reviewing it, improving it, or restating it/i);
  });

  it('demand the purpose layer be specific to this brand', () => {
    assert.match(BRAND_OS_INSTRUCTIONS, /would fit a company in an unrelated category, rewrite it/i);
  });

  it('require the name rationale to keep the recorded drawback', () => {
    assert.match(BRAND_OS_INSTRUCTIONS, /do not pretend the cons are not there/i);
  });

  it('bind the launch plan to the recorded constraints', () => {
    assert.match(BRAND_OS_INSTRUCTIONS, /sold founder-to-founder/i);
    assert.match(BRAND_OS_INSTRUCTIONS, /do not assume a budget or a team the state never mentioned/i);
  });

  it('require the deliverable to obey the brand voice it documents', () => {
    assert.match(BRAND_OS_INSTRUCTIONS, /breaks the brand's writing rules/i);
  });

  it('rule out new strategy, names, taglines or visuals', () => {
    assert.match(BRAND_OS_INSTRUCTIONS, /No new strategy, no new names/i);
  });
});

describe('validateBrandOsRequest', () => {
  it('accepts a brandId that matches the state', () => {
    const state = readyState();
    const request = validateBrandOsRequest({ brandId: state.id, brandState: state });
    assert.equal(request.brandId, state.id);
  });

  it('derives brandId from the state when it is omitted', () => {
    const state = readyState();
    assert.equal(validateBrandOsRequest({ brandState: state }).brandId, state.id);
  });

  it('rejects a brandId that disagrees with the state, rather than picking one', () => {
    assert.throws(
      () => validateBrandOsRequest({ brandId: 'other', brandState: readyState() }),
      (error: unknown) => {
        assert.ok(error instanceof BrandOsInputError);
        assert.match(error.message, /does not match brandState.id/);
        return true;
      },
    );
  });

  it('rejects a missing or invalid brandState', () => {
    for (const body of [{}, { brandState: 'text' }, { brandState: { project: {} } }]) {
      assert.throws(() => validateBrandOsRequest(body), BrandOsInputError);
    }
  });

  it('rejects a body that is not an object', () => {
    for (const body of [null, 'text', 42]) {
      assert.throws(() => validateBrandOsRequest(body), BrandOsInputError);
    }
  });

  it('rejects a non-boolean allowUnvalidated', () => {
    assert.throws(
      () => validateBrandOsRequest({ brandState: readyState(), allowUnvalidated: 'yes' }),
      /must be a boolean/,
    );
  });
});

describe('findMissingForCompile', () => {
  it('finds nothing missing in a finished state', () => {
    assert.deepEqual(findMissingForCompile(readyState()), []);
  });

  it('does not require finalBrand, since locking is a separate act', () => {
    const state = readyState();
    delete state.finalBrand;
    assert.deepEqual(findMissingForCompile(state), []);
  });

  it('reports an unchosen name and tagline', () => {
    const state = readyState();
    state.naming = { ...state.naming, selectedName: undefined, tagline: { ...state.naming.tagline, selected: undefined } };

    const missing = findMissingForCompile(state);
    assert.ok(missing.some((entry) => /naming.selectedName/.test(entry)));
    assert.ok(missing.some((entry) => /naming.tagline.selected/.test(entry)));
  });

  it('reports a section that has not been derived', () => {
    const state = readyState();
    state.voice = {
      toneAttributes: [],
      writingPrinciples: [],
      avoid: [],
      messagingHierarchy: { primaryMessage: '', supportingMessages: [] },
    };

    assert.ok(findMissingForCompile(state).some((entry) => /voice has not been derived/.test(entry)));
  });

  it('reports a dangling strategy pointer', () => {
    const state = readyState();
    state.strategyOptions = state.strategyOptions.filter((o) => o.direction !== 'TRUST');
    assert.ok(
      findMissingForCompile(state).some((entry) => /does not resolve to one of strategyOptions/.test(entry)),
    );
  });
});

describe('summarizeFindings', () => {
  it('counts by severity and by status together', () => {
    const summary = summarizeFindings(readyState().stressTests);

    assert.equal(summary.high, 1);
    assert.equal(summary.acknowledged, 1);
    assert.equal(summary.open, 2);
    assert.equal(summary.resolved, 0);
  });

  it('treats a finding with no status as open', () => {
    const summary = summarizeFindings([
      { type: 'cliché', severity: 'low', issue: 'i', evidence: 'voice.avoid', impact: 'x', recommendation: 'y' },
    ]);
    assert.equal(summary.open, 1);
  });
});

describe('assessReadiness', () => {
  it('is not-ready while a blocking finding is open, whatever else passes', () => {
    const readiness = assessReadiness(completeState());
    assert.equal(readiness.label, 'not-ready');
  });

  it('is ready-with-caveats when only minor findings remain', () => {
    const readiness = assessReadiness(readyState());
    assert.equal(readiness.label, 'ready-with-caveats');
  });

  it('is ready only when every check passes', () => {
    const state = readyState();
    state.stressTests = state.stressTests.map((f) => ({ ...f, status: 'resolved' as const }));
    state.consistency = { ...state.consistency, status: 'consistent' };

    const readiness = assessReadiness(state);
    assert.equal(readiness.label, 'ready');
    assert.equal(readiness.score, 100);
  });

  it('scores from the checklist rather than from an opinion', () => {
    const readiness = assessReadiness(readyState());
    const passed = readiness.checklist.filter((check) => check.passed).length;

    assert.equal(readiness.score, Math.round((passed / readiness.checklist.length) * 100));
  });

  it('explains every check, passing or failing', () => {
    for (const check of assessReadiness(readyState()).checklist) {
      assert.ok(check.item.length > 0);
      assert.ok(check.detail.length > 0, check.item);
    }
  });
});

describe('assembleBrandOs', () => {
  const state = readyState();
  const os = assembleBrandOs(state, brandOsDraft);

  it('produces all six sections', () => {
    assert.deepEqual(Object.keys(os), [
      'strategy',
      'identity',
      'visual',
      'voice',
      'launch',
      'validation',
    ]);
  });

  it('satisfies the response schema', () => {
    const result = BrandOsSchema.safeParse(os);
    assert.ok(result.success, result.success ? '' : result.error.message);
  });

  it('leaves no required field empty', () => {
    assert.deepEqual(findEmptyFields(os), []);
  });

  it('projects the name and tagline from naming rather than regenerating them', () => {
    assert.equal(os.identity.name, state.naming.selectedName);
    assert.equal(os.voice.taglines[0], state.naming.tagline.selected);
  });

  it('keeps the unchosen taglines, so the choice stays auditable', () => {
    assert.equal(os.voice.taglines.length, state.naming.tagline.candidates.length);
  });

  it('projects traits and values from personality', () => {
    assert.deepEqual(os.identity.personalityTraits, state.personality.traits);
    assert.deepEqual(os.identity.coreValues, state.personality.values);
  });

  it('keeps the archetype the state already had, ignoring the draft', () => {
    assert.equal(os.identity.archetype, state.personality.archetype);
    assert.notEqual(state.personality.archetype, undefined);
  });

  it('uses the draft archetype only when the state has none', () => {
    const without = readyState();
    delete without.personality.archetype;

    assert.equal(assembleBrandOs(without, brandOsDraft).identity.archetype, brandOsDraft.archetype);
  });

  it('projects the palette and typography from visualDirection', () => {
    assert.deepEqual(os.visual.colorPalette, state.visualDirection.colors);
    assert.equal(os.visual.typographySystem, state.visualDirection.typography);
  });

  it('builds messaging pillars from the primary message first', () => {
    assert.equal(os.voice.messagingPillars[0], state.voice.messagingHierarchy.primaryMessage);
  });

  it('prefers the locked positioning statement when the brand is locked', () => {
    assert.equal(os.strategy.positioningStatement, state.finalBrand!.positioningStatement);
  });

  it('falls back to the chosen strategy positioning when nothing is locked', () => {
    const unlocked = readyState();
    delete unlocked.finalBrand;

    const compiled = assembleBrandOs(unlocked, brandOsDraft);
    assert.equal(
      compiled.strategy.positioningStatement,
      unlocked.strategyOptions.find((o) => o.direction === 'TRUST')!.positioning,
    );
  });

  it('carries the generated material through unchanged', () => {
    assert.equal(os.strategy.purpose, brandOsDraft.purpose);
    assert.equal(os.visual.logoDirection, brandOsDraft.logoDirection);
    assert.deepEqual(os.voice.sampleCopy, brandOsDraft.sampleCopy);
    assert.equal(os.launch.goToMarketSummary, brandOsDraft.launch.goToMarketSummary);
    assert.equal(os.launch.rolloutSequence.length, brandOsDraft.launch.rolloutSequence.length);
  });

  it('lists open findings as risks', () => {
    assert.equal(os.validation.risks.length, 2);
    assert.ok(os.validation.risks.every((risk) => /^\[(low|medium|high|critical)\]/.test(risk)));
  });

  it('flags accepted trade-offs separately from open risks', () => {
    assert.ok(os.validation.openFlags.some((flag) => /accepted trade-off/.test(flag)));
  });

  it('flags a blocking finding explicitly when one survives', () => {
    const blocked = completeState();
    const compiled = assembleBrandOs(blocked, brandOsDraft);
    assert.ok(compiled.validation.openFlags.some((flag) => /^BLOCKING/.test(flag)));
  });

  it('flags a consistency check that reported issues', () => {
    assert.ok(os.validation.openFlags.some((flag) => /consistency reported issues/.test(flag)));
  });

  it('does not mutate the state it compiled from', () => {
    const before = readyState();
    const snapshot = JSON.stringify(before);
    assembleBrandOs(before, brandOsDraft);
    assert.equal(JSON.stringify(before), snapshot);
  });

  it('refuses a state that is not finished', () => {
    const partial = readyState();
    partial.naming = { ...partial.naming, selectedName: undefined };

    assert.throws(() => assembleBrandOs(partial, brandOsDraft), IncompleteBrandStateError);
  });

  it('refuses to return a deliverable with an empty required field', () => {
    const draft = { ...brandOsDraft, purpose: '   ' };
    assert.throws(() => assembleBrandOs(readyState(), draft), (error: unknown) => {
      assert.ok(error instanceof IncompleteBrandOsError);
      assert.ok(error.empty.includes('strategy.purpose'));
      return true;
    });
  });
});

describe('findEmptyFields', () => {
  it('allows risks and openFlags to be empty on a clean brand', () => {
    const os = assembleBrandOs(readyState(), brandOsDraft);
    os.validation.risks = [];
    os.validation.openFlags = [];

    assert.deepEqual(findEmptyFields(os), []);
  });

  it('reports an empty nested array by path', () => {
    const os = assembleBrandOs(readyState(), brandOsDraft);
    os.launch.keyChannels = [];

    assert.deepEqual(findEmptyFields(os), ['launch.keyChannels']);
  });

  it('reports a blank string inside an array by index', () => {
    const os = assembleBrandOs(readyState(), brandOsDraft) as BrandOs;
    os.identity.coreValues = ['fine', '  '];

    assert.deepEqual(findEmptyFields(os), ['identity.coreValues[1]']);
  });
});

describe('compileBrandOs', () => {
  it('returns the brandId alongside the deliverable', async () => {
    const state = readyState();
    const result = await compileBrandOs(new StubDeriver(), { brandId: state.id, brandState: state });

    assert.equal(result.value.brandId, state.id);
    assert.ok(BrandOsSchema.safeParse(result.value.brandOS).success);
  });

  it('refuses a state with an open blocking finding', async () => {
    const state = completeState();
    await assert.rejects(
      () => compileBrandOs(new StubDeriver(), { brandId: state.id, brandState: state }),
      FinalizationBlockedError,
    );
  });

  it('compiles a draft when explicitly allowed, and marks it not-ready', async () => {
    const state = completeState();
    const result = await compileBrandOs(new StubDeriver(), {
      brandId: state.id,
      brandState: state,
      allowUnvalidated: true,
    });

    assert.equal(result.value.brandOS.validation.readiness.label, 'not-ready');
  });

  it('fails before calling the model when the state is unfinished', async () => {
    const state = readyState();
    state.naming = { ...state.naming, selectedName: undefined };
    const deriver = new StubDeriver();

    await assert.rejects(
      () => compileBrandOs(deriver, { brandId: state.id, brandState: state }),
      IncompleteBrandStateError,
    );
    assert.equal(deriver.calls.length, 0);
  });

  it('uses the Brand OS instructions, not the finalBrand step instructions', async () => {
    const state = readyState();
    const deriver = new StubDeriver();
    await compileBrandOs(deriver, { brandId: state.id, brandState: state });

    assert.match(deriver.calls[0]!.userPrompt!, /<brand_state>/);
    assert.match(deriver.calls[0]!.userPrompt!, /Write the new material for the Brand OS/);
  });

  it('tells the model the archetype already exists', async () => {
    const state = readyState();
    const deriver = new StubDeriver();
    await compileBrandOs(deriver, { brandId: state.id, brandState: state });

    assert.match(deriver.calls[0]!.userPrompt!, /already has an archetype/);
  });

  it('asks for an archetype when the state has none', async () => {
    const state = readyState();
    delete state.personality.archetype;
    const deriver = new StubDeriver();
    await compileBrandOs(deriver, { brandId: state.id, brandState: state });

    assert.match(deriver.calls[0]!.userPrompt!, /has no archetype/);
  });

  it('passes the accepted trade-offs through to the prompt', async () => {
    const state = readyState();
    const deriver = new StubDeriver();
    await compileBrandOs(deriver, { brandId: state.id, brandState: state });

    assert.match(deriver.calls[0]!.userPrompt!, /<accepted_trade_offs>/);
    assert.match(deriver.calls[0]!.userPrompt!, /Do not build the launch plan on top of a known weakness/);
  });

  it('does not send the rejected strategy candidates', async () => {
    const state = readyState();
    const deriver = new StubDeriver();
    await compileBrandOs(deriver, { brandId: state.id, brandState: state });

    const prompt = deriver.calls[0]!.userPrompt!;
    // The chosen strategy is sent resolved; the ones nobody picked are not, so the
    // launch plan cannot hedge across directions that were rejected. Matching on the
    // rejected content rather than the field name, since a finding's evidence may
    // legitimately cite strategyOptions by path.
    const rejected = state.strategyOptions.filter((option) => option.direction !== 'TRUST');
    assert.equal(rejected.length, 2);
    for (const option of rejected) {
      assert.ok(!prompt.includes(option.positioning), `${option.direction} positioning was sent`);
    }
    assert.ok(prompt.includes('TRUST'));
  });
});

describe('the Brand OS carries every section the phase requires', () => {
  /**
   * The six sections and their required fields, exactly as the phase specifies them.
   * Pinned here so a future refactor cannot quietly drop one from the deliverable.
   */
  const REQUIRED: Record<string, readonly string[]> = {
    strategy: [
      'problem',
      'audience',
      'category',
      'positioning',
      'valueProposition',
      'differentiator',
    ],
    identity: ['personality', 'principles', 'namingDirection', 'taglineDirection'],
    visual: ['colorDirection', 'typography', 'imagery', 'shapeLanguage', 'composition', 'avoid'],
    voice: ['tone', 'messagingHierarchy', 'examples'],
    launch: ['onelinePitch', 'landingHeadline', 'launchMessage'],
    validation: [
      'stressTestFindings',
      'consistencyFindings',
      'remainingRisks',
      'recommendations',
    ],
  };

  it('has every required field on every required section', () => {
    const os = assembleBrandOs(completeState(), brandOsDraft);

    for (const [section, fields] of Object.entries(REQUIRED)) {
      const value = (os as Record<string, any>)[section];
      assert.ok(value !== undefined, `missing section: ${section}`);
      for (const field of fields) {
        assert.ok(field in value, `${section}.${field} is missing from the Brand OS`);
        assert.notEqual(value[field], undefined, `${section}.${field} is undefined`);
      }
    }
  });

  it('copies the approved decisions rather than restating them', () => {
    const state = completeState();
    const os = assembleBrandOs(state, brandOsDraft);

    // Each of these is a decision the user approved earlier. The deliverable must be
    // byte-identical to the state, or the Brand OS is a second opinion rather than a
    // rendering of the one that was signed off.
    assert.equal(os.strategy.problem, state.discovery.problem);
    assert.equal(os.strategy.audience, state.discovery.targetAudience);
    assert.equal(os.strategy.category, state.positioning.category);
    assert.equal(os.strategy.valueProposition, state.positioning.valueProposition);
    assert.equal(os.strategy.differentiator, state.positioning.differentiator);
    assert.deepEqual(os.identity.personality, state.personality.traits);
    assert.deepEqual(os.identity.principles, state.personality.values);
    assert.equal(os.identity.namingDirection.selectedName, state.naming.selectedName);
    assert.equal(os.identity.taglineDirection.selected, state.naming.tagline.selected);
    assert.deepEqual(os.visual.colorDirection, state.visualDirection.colors);
    assert.equal(os.visual.typography, state.visualDirection.typography);
    assert.equal(os.visual.shapeLanguage, state.visualDirection.shapes);
    assert.equal(os.visual.composition, state.visualDirection.composition);
    assert.deepEqual(os.visual.avoid, state.visualDirection.avoid);
    assert.deepEqual(os.voice.tone, state.voice.toneAttributes);
    assert.deepEqual(os.voice.messagingHierarchy, state.voice.messagingHierarchy);
  });

  it('reports both checks in validation, not just the stress test', () => {
    const state = completeState();
    const os = assembleBrandOs(state, brandOsDraft);

    assert.deepEqual(os.validation.stressTestFindings, state.stressTests);
    assert.deepEqual(os.validation.consistencyFindings, state.consistency.findings);
    // The fixture has an open consistency finding, so it must surface as a risk with a
    // recommendation rather than being counted and dropped.
    assert.ok(os.validation.remainingRisks.length > 0);
    assert.ok(os.validation.recommendations.length > 0);
  });

  it('compiles a brand whose checks came back clean, treating empty as good', () => {
    const state = completeState();
    // Every stress finding resolved, and consistency agreed. `stressTests` keeps its
    // entries because an empty array cannot be told apart from never having run.
    state.stressTests = state.stressTests.map((finding) => ({ ...finding, status: 'resolved' }));
    state.consistency = {
      status: 'consistent',
      findings: [],
      dimensionsChecked: [{ dimension: 'voice', status: 'evaluated' }],
    };

    const os = assembleBrandOs(state, brandOsDraft);

    assert.deepEqual(os.validation.consistencyFindings, []);
    assert.deepEqual(os.validation.remainingRisks, [], 'nothing open means no risks');
    assert.deepEqual(os.validation.recommendations, []);
    // The point: empty is not "missing", so compiling must not raise.
    assert.deepEqual(findEmptyFields(os), []);
  });

  it('blocks compiling when the stress test never ran, and says what to do', () => {
    const state = completeState();
    state.stressTests = [];

    assert.throws(
      () => assembleBrandOs(state, brandOsDraft),
      /stress-test/,
      'the error should name the endpoint to run',
    );
  });
});
