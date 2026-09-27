/**
 * Brand Battle: three directions that genuinely differ, and a selection that sticks.
 *
 * The other battle suite covers the archetype machinery. This one asserts the two
 * promises the product makes: that the directions differ in strategic *logic* rather
 * than in wording, and that once a human picks one, nothing downstream quietly
 * replaces it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_THRESHOLDS,
  findDistinctnessIssues,
  selectStrategy,
  toStrategyOption,
} from '../src/battle.ts';
import type { StrategyCandidate } from '../src/battle.ts';
import { overlapRatio } from '../src/archetypes.ts';
import { BATTLE_INSTRUCTIONS } from '../src/prompts.ts';
import { StrategyOptionSchema } from '../src/schemas.ts';
import {
  applyDelta,
  resolveSelectedStrategy,
  serializeForPrompt,
  validateState,
} from '../src/state.ts';
import { completeState, strategyCandidates } from './fixtures.ts';

const options = strategyCandidates.map(toStrategyOption);

describe('a direction carries every field the contract requires', () => {
  it('has all nine', () => {
    assert.deepEqual(Object.keys(StrategyOptionSchema.shape).sort(), [
      'audienceFit',
      'coreIdea',
      'differentiation',
      'direction',
      'name',
      'positioning',
      'rationale',
      'risks',
      'strengths',
      'tradeoffs',
    ]);
  });

  it('validates each generated direction', () => {
    for (const option of options) {
      const result = StrategyOptionSchema.safeParse(option);
      assert.ok(result.success, `${option.direction}: ${result.success ? '' : result.error.message}`);
    }
  });

  it('names the strategy, not a product', () => {
    // Battle must not propose brand names — that is a later stage and a separate
    // decision, so the name field is a title for the direction.
    for (const option of options) {
      assert.ok(option.name.length > 0);
      assert.ok(option.name.split(/\s+/).length <= 6, `${option.name} reads like a brand name`);
    }
  });

  it('requires a non-empty tradeoff on every direction', () => {
    for (const option of options) {
      assert.ok(option.tradeoffs.length > 0, option.direction);
      assert.ok(option.tradeoffs.every((t) => t.trim() !== ''));
    }
    // And the schema enforces it, not just the fixture.
    const noTradeoff = { ...options[0]!, tradeoffs: [] };
    assert.equal(StrategyOptionSchema.safeParse(noTradeoff).success, false);
  });

  it('keeps risks and tradeoffs as different things', () => {
    // A risk is what might go wrong; a tradeoff is the certain cost. If they were the
    // same text the distinction would be decorative.
    for (const option of options) {
      assert.ok(
        overlapRatio(option.risks.join(' '), option.tradeoffs.join(' ')) < 0.6,
        `${option.direction}: risks and tradeoffs say the same thing`,
      );
    }
  });
});

describe('the three directions differ in strategic logic', () => {
  it('passes the distinctness check as generated', () => {
    assert.deepEqual(findDistinctnessIssues(strategyCandidates), []);
  });

  it('states a different core bet in each', () => {
    for (let i = 0; i < strategyCandidates.length; i++) {
      for (let j = i + 1; j < strategyCandidates.length; j++) {
        const a = strategyCandidates[i]!;
        const b = strategyCandidates[j]!;
        assert.ok(
          overlapRatio(a.coreIdea, b.coreIdea) <= DEFAULT_THRESHOLDS.coreIdea,
          `${a.direction} and ${b.direction} share a core idea`,
        );
      }
    }
  });

  it('targets a different slice of the audience in each', () => {
    const segments = strategyCandidates.map((c) => c.primarySegment);
    assert.equal(new Set(segments).size, segments.length);
  });

  it('fails in a different way in each', () => {
    for (let i = 0; i < strategyCandidates.length; i++) {
      for (let j = i + 1; j < strategyCandidates.length; j++) {
        assert.ok(
          overlapRatio(
            strategyCandidates[i]!.risks.join(' '),
            strategyCandidates[j]!.risks.join(' '),
          ) <= DEFAULT_THRESHOLDS.risks,
          'two directions share their failure mode',
        );
      }
    }
  });

  it('catches two directions with the same core idea, naming the collision', () => {
    // The case the requirement is really about: different wording, same logic.
    const reworded: StrategyCandidate[] = [
      strategyCandidates[0]!,
      {
        ...strategyCandidates[1]!,
        coreIdea: strategyCandidates[0]!.coreIdea,
      },
    ];

    const issues = findDistinctnessIssues(reworded);
    const collision = issues.find((issue) => /same bet as/.test(issue.instruction));
    assert.ok(collision, 'a shared core idea was not caught');
    assert.equal(collision.direction, 'COMPETITION');
    assert.equal(collision.collidedWith, 'CONNECTION');
    assert.match(collision.instruction, /one direction written twice/);
  });

  it('catches a paraphrased core idea, not only an identical one', () => {
    const paraphrased: StrategyCandidate[] = [
      { ...strategyCandidates[0]!, coreIdea: 'Owners stall on delegation because nobody can take the work' },
      { ...strategyCandidates[1]!, coreIdea: 'Owners stalled on delegation have nobody to take the work' },
    ];

    assert.ok(findDistinctnessIssues(paraphrased).length > 0);
  });

  it('catches a direction with no tradeoff', () => {
    const lazy = [{ ...strategyCandidates[0]!, tradeoffs: ['   '] }];
    const issues = findDistinctnessIssues(lazy);
    assert.ok(issues.some((issue) => /listed no tradeoff/.test(issue.instruction)));
  });
});

describe('the battle instructions forbid inventing evidence', () => {
  it('forbid naming a competitor that is not in the input', () => {
    assert.match(BATTLE_INSTRUCTIONS, /Do not name a competitor that is not in the input/i);
  });

  it('forbid market sizes, growth rates and trend claims', () => {
    assert.match(BATTLE_INSTRUCTIONS, /market size, a growth rate, a percentage/i);
  });

  it('forbid claiming what competitors do or do not offer', () => {
    assert.match(BATTLE_INSTRUCTIONS, /a fact you do not have/i);
  });

  it('say an invented fact is worse than a cautious direction', () => {
    assert.match(BATTLE_INSTRUCTIONS, /worse than a cautious one/i);
  });

  it('distinguish the direction name from a brand name', () => {
    assert.match(BATTLE_INSTRUCTIONS, /not the product/i);
  });

  it('distinguish a tradeoff from a risk', () => {
    assert.match(BATTLE_INSTRUCTIONS, /even when it works/i);
  });
});

describe('selection becomes an approved part of the state', () => {
  it('records the chosen direction with a timestamp', () => {
    const selection = selectStrategy(options, 'TRUST', 'Burned once already');

    assert.equal(selection.direction, 'TRUST');
    assert.equal(selection.reasonChosen, 'Burned once already');
    assert.ok(!Number.isNaN(Date.parse(selection.chosenAt)));
  });

  it('is a pointer, so the chosen strategy exists in exactly one place', () => {
    const selection = selectStrategy(options, 'TRUST');
    assert.deepEqual(Object.keys(selection).sort(), ['chosenAt', 'direction']);
  });

  it('resolves back to the full direction', () => {
    const state = completeState();
    const resolved = resolveSelectedStrategy(state);

    assert.equal(resolved?.direction, 'TRUST');
    assert.equal(resolved?.name, 'Nothing Invented');
    assert.ok(resolved?.tradeoffs.length);
  });

  it('refuses a direction that is not among the options', () => {
    assert.throws(() => selectStrategy(options, 'REBELLION'), /not one of the strategy options/);
  });

  it('survives a round trip through state validation', () => {
    let state = completeState();
    state = applyDelta(state, 'strategyOptions', options);
    state = { ...state, selectedStrategy: selectStrategy(options, 'COMPETITION') };

    assert.deepEqual(validateState(state), { valid: true });
    assert.equal(resolveSelectedStrategy(state)?.name, 'Outgrow The Hour');
  });
});

describe('later stages cannot silently replace the selection', () => {
  it('sends the chosen direction and hides the rejected ones', () => {
    const prompt = serializeForPrompt(completeState());
    const parsed = JSON.parse(prompt) as {
      selectedStrategy: { direction: string; strategy: { name: string } };
      strategyOptions?: unknown;
    };

    // A later step never sees the alternatives, so it cannot develop one nobody chose.
    assert.equal(parsed.strategyOptions, undefined);
    assert.equal(parsed.selectedStrategy.direction, 'TRUST');
    assert.equal(parsed.selectedStrategy.strategy.name, 'Nothing Invented');
  });

  it('does not leak a rejected direction into the prompt', () => {
    const state = completeState();
    const prompt = serializeForPrompt(state);

    for (const rejected of state.strategyOptions.filter((o) => o.direction !== 'TRUST')) {
      assert.ok(!prompt.includes(rejected.coreIdea), `${rejected.direction} core idea leaked`);
      assert.ok(!prompt.includes(rejected.positioning), `${rejected.direction} positioning leaked`);
    }
  });

  it('reports a selection orphaned by regenerated options instead of ignoring it', () => {
    // If options are regenerated and the chosen direction is no longer among them, the
    // pointer dangles. Validation must catch that rather than resolving to nothing.
    const state = completeState();
    state.strategyOptions = state.strategyOptions.filter((o) => o.direction !== 'TRUST');

    const result = validateState(state);
    assert.ok(result.valid === false);
    assert.equal(result.errors[0]!.section, 'selectedStrategy');
    assert.equal(resolveSelectedStrategy(state), undefined);
  });
});
