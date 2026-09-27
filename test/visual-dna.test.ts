/**
 * Visual direction and Brand DNA.
 *
 * Two promises are under test. The visual system must be traceable to decisions already
 * approved rather than being a set of aesthetic preferences; and the Brand DNA must be a
 * projection of those decisions, so it cannot drift from them or quietly present an
 * undecided field as settled.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildBrandDna, describeGaps, isBrandDnaComplete } from '../src/dna.ts';
import { hashDiscovery } from '../src/position.ts';
import { STEP_INSTRUCTIONS } from '../src/prompts.ts';
import { SCHEMA_VERSION, VisualDirectionSchema } from '../src/schemas.ts';
import { acknowledgeFinding } from '../src/stress.ts';
import { applyDelta, createInitialState } from '../src/state.ts';
import { completeState, project, sectionFixtures } from './fixtures.ts';

const VISUAL = STEP_INSTRUCTIONS.visualDirection;

describe('the visual direction carries every required field', () => {
  it('has all eight', () => {
    assert.deepEqual(Object.keys(VisualDirectionSchema.shape).sort(), [
      'avoid',
      'colors',
      'composition',
      'imagery',
      'mood',
      'rationale',
      'shapes',
      'typography',
      'visualPersonality',
    ]);
  });

  it('validates the generated direction', () => {
    const result = VisualDirectionSchema.safeParse(sectionFixtures.visualDirection);
    assert.ok(result.success, result.success ? '' : result.error.message);
  });

  it('requires at least two lines of rationale', () => {
    const thin = { ...sectionFixtures.visualDirection, rationale: ['one line only'] };
    assert.equal(VisualDirectionSchema.safeParse(thin).success, false);
  });

  it('requires composition and visualPersonality to say something', () => {
    for (const field of ['composition', 'visualPersonality'] as const) {
      const blank = { ...sectionFixtures.visualDirection, [field]: '' };
      assert.equal(VisualDirectionSchema.safeParse(blank).success, false, field);
    }
  });

  it('maps real personality traits, not invented ones', () => {
    // visualPersonality is what makes the brief auditable, so it must name traits that
    // actually exist in the personality section.
    const traits = completeState().personality.traits;
    const mapping = sectionFixtures.visualDirection.visualPersonality.toLowerCase();

    const named = traits.filter((t) => mapping.includes(t.toLowerCase()));
    assert.ok(named.length >= 2, `only ${named.length} of ${traits.length} traits are mapped`);
  });

  it('ties each rationale line to something already decided', () => {
    const grounded = sectionFixtures.visualDirection.rationale.filter((line) =>
      /personality|audience|direction|positioning|TRUST|exacting|record/i.test(line),
    );
    assert.equal(grounded.length, sectionFixtures.visualDirection.rationale.length);
  });
});

describe('the visualize instructions forbid disconnected aesthetics', () => {
  it('state the traceability rule outright', () => {
    assert.match(VISUAL, /Every choice must trace to a decision already made/i);
    assert.match(VISUAL, /you cannot name what a choice comes from/i);
  });

  it('name the sources a choice may come from', () => {
    for (const source of ['personality trait', 'core idea', 'differentiator', 'discovery']) {
      assert.match(VISUAL, new RegExp(source, 'i'), source);
    }
  });

  it('forbid defaulting to the category look', () => {
    assert.match(VISUAL, /Do not default to the category/i);
    assert.match(VISUAL, /fintech blue|SaaS gradient/i);
  });

  it('treat anti-traits as hard constraints', () => {
    assert.match(VISUAL, /anti-traits as hard constraints/i);
  });

  it('require the trait-to-decision mapping', () => {
    assert.match(VISUAL, /mapping from personality traits to visual decisions/i);
  });

  it('rule out naming and copy', () => {
    assert.match(VISUAL, /no names, no taglines, no copy/i);
  });
});

describe('Brand DNA projects the approved decisions', () => {
  const dna = buildBrandDna(completeState());

  it('carries all eleven fields', () => {
    const fields = Object.keys(dna).filter((k) => k !== 'provenance');
    assert.deepEqual(fields.sort(), [
      'audience',
      'differentiator',
      'namingDirection',
      'personality',
      'positioning',
      'principles',
      'problem',
      'selectedStrategy',
      'valueProposition',
      'visualDirection',
      'voice',
    ]);
  });

  it('is complete for a finished brand', () => {
    assert.ok(isBrandDnaComplete(dna));
    assert.deepEqual(dna.provenance.undecided, []);
  });

  it('takes audience and problem from discovery, which owns them', () => {
    const state = completeState();
    assert.ok(dna.audience.decided && dna.problem.decided);
    assert.equal(dna.audience.value, state.discovery.targetAudience);
    assert.equal(dna.audience.source, 'discovery.targetAudience');
    assert.equal(dna.problem.value, state.discovery.problem);
  });

  it('takes principles from personality.values, so there is one definition', () => {
    const state = completeState();
    assert.ok(dna.principles.decided);
    assert.deepEqual(dna.principles.value, state.personality.values);
    assert.equal(dna.principles.source, 'personality.values');
  });

  it('resolves the selected strategy in full', () => {
    assert.ok(dna.selectedStrategy.decided);
    assert.equal(dna.selectedStrategy.value.direction, 'TRUST');
    assert.equal(dna.selectedStrategy.value.name, 'Nothing Invented');
  });

  it('prefers the locked positioning statement once the brand is locked', () => {
    const state = completeState();
    assert.ok(dna.positioning.decided);
    assert.equal(dna.positioning.value, state.finalBrand!.positioningStatement);
    assert.equal(dna.positioning.source, 'finalBrand.positioningStatement');
  });

  it('falls back to the chosen strategy before the brand is locked', () => {
    const state = completeState();
    delete state.finalBrand;

    const unlocked = buildBrandDna(state);
    assert.ok(unlocked.positioning.decided);
    assert.match(unlocked.positioning.source, /selectedStrategy/);
  });

  it('reports provenance rather than asserting confidence', () => {
    const state = completeState();
    assert.equal(dna.provenance.schemaVersion, SCHEMA_VERSION);
    assert.equal(dna.provenance.updatedAt, state.updatedAt);
    assert.equal(dna.provenance.confidence, state.positioning.confidence);
    assert.equal(dna.provenance.locked, true);
  });

  it('flags a blocking stress-test finding', () => {
    // completeState carries one open high finding.
    assert.equal(dna.provenance.blockedByFindings, true);

    const cleared = completeState();
    cleared.stressTests = acknowledgeFinding(cleared.stressTests, { type: 'contradiction' });
    assert.equal(buildBrandDna(cleared).provenance.blockedByFindings, false);
  });

  it('flags positioning left stale by an edit to discovery', () => {
    assert.equal(dna.provenance.positioningStale, false);

    const edited = completeState();
    edited.discovery = { ...edited.discovery, targetAudience: 'a different audience entirely' };
    assert.notEqual(
      edited.positioning.sourceDiscoveryHash,
      hashDiscovery(edited.discovery),
    );
    assert.equal(buildBrandDna(edited).provenance.positioningStale, true);
  });
});

describe('Brand DNA reports gaps instead of pretending', () => {
  it('marks every field undecided on a fresh project', () => {
    const dna = buildBrandDna(createInitialState(project));

    assert.equal(isBrandDnaComplete(dna), false);
    assert.equal(dna.provenance.undecided.length, 11);
    assert.equal(dna.audience.decided, false);
  });

  it('gives a reason for each gap rather than an empty value', () => {
    const dna = buildBrandDna(createInitialState(project));

    for (const gap of describeGaps(dna)) {
      assert.ok(gap.reason.length > 0, gap.field);
      // Every reason names a stage that has not run, or a choice not yet made.
      assert.match(gap.reason, /has not run yet|has not been|has been selected yet|generated but none/);
    }
  });

  it('distinguishes "no directions yet" from "none chosen yet"', () => {
    const noBattle = createInitialState(project);
    assert.match(
      (buildBrandDna(noBattle).selectedStrategy as { reason: string }).reason,
      /Brand Battle has not run/,
    );

    const generated = applyDelta(noBattle, 'strategyOptions', completeState().strategyOptions);
    assert.match(
      (buildBrandDna(generated).selectedStrategy as { reason: string }).reason,
      /none has been chosen/,
    );
  });

  it('fills in as the pipeline progresses, and never regresses', () => {
    let state = createInitialState(project);
    let remaining = buildBrandDna(state).provenance.undecided.length;

    for (const section of ['discovery', 'positioning', 'personality', 'naming', 'voice'] as const) {
      state = applyDelta(state, section, sectionFixtures[section]);
      const next = buildBrandDna(state).provenance.undecided.length;
      assert.ok(next <= remaining, `${section} increased the gap count`);
      remaining = next;
    }

    assert.ok(remaining < 11);
  });

  it('does not mutate the state it projects from', () => {
    const state = completeState();
    const before = JSON.stringify(state);
    buildBrandDna(state);
    assert.equal(JSON.stringify(state), before);
  });

  it('is derived, so two builds from the same state are identical', () => {
    const state = completeState();
    assert.deepEqual(buildBrandDna(state), buildBrandDna(state));
  });
});
