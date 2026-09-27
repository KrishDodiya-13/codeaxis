import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARCHETYPES,
  DIRECTIONS,
  InvalidDirectionsError,
  archetypeDistance,
  chooseDirections,
  listOverlapRatio,
  minimumSpread,
  normalizeDirections,
  overlapRatio,
} from '../src/archetypes.ts';
import {
  BattleInputError,
  DEFAULT_THRESHOLDS,
  IndistinctStrategiesError,
  battle,
  countSentences,
  findDistinctnessIssues,
  resolveDirections,
  selectStrategy,
  toStrategyOption,
  validateBattleRequest,
} from '../src/battle.ts';
import type { StrategyCandidate } from '../src/battle.ts';
import type { DeriveOptions, SectionDeriver, Usage } from '../src/client.ts';
import { BATTLE_INSTRUCTIONS } from '../src/prompts.ts';
import { StrategyOptionSchema } from '../src/schemas.ts';
import { resolveSelectedStrategy } from '../src/state.ts';
import {
  StubDeriver,
  completeState,
  indistinctCandidates,
  strategyCandidates,
} from './fixtures.ts';

const usage: Usage = { inputTokens: 10, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 0 };

function settledDiscovery() {
  return { ...completeState().discovery, openQuestions: [] };
}

/**
 * A deriver returning scripted batches, then scripted single rebuilds.
 * Records every prompt so the retry instructions can be inspected.
 */
function scriptedDeriver(batch: StrategyCandidate[], rebuilds: StrategyCandidate[] = []) {
  const prompts: string[] = [];
  let rebuildIndex = 0;

  const deriver: SectionDeriver & { prompts: string[]; rebuildCount: () => number } = {
    prompts,
    rebuildCount: () => rebuildIndex,
    async deriveSection<T>(
      _section: string,
      _state: string,
      _schema: unknown,
      options?: DeriveOptions,
    ): Promise<{ value: T; usage: Usage }> {
      prompts.push(options?.userPrompt ?? '');

      if (prompts.length === 1) return { value: { strategies: batch } as T, usage };

      const rebuilt = rebuilds[Math.min(rebuildIndex, rebuilds.length - 1)];
      rebuildIndex++;
      return { value: { strategy: rebuilt ?? batch[0] } as T, usage };
    },
  } as never;

  return deriver;
}

describe('the archetype vocabulary', () => {
  it('holds the seven directions from the spec', () => {
    assert.deepEqual([...DIRECTIONS], [
      'CONNECTION',
      'OUTCOMES',
      'COMPETITION',
      'TRUST',
      'ACCESSIBILITY',
      'CRAFT',
      'REBELLION',
    ]);
  });

  it('gives every direction an appeal and an angle', () => {
    for (const direction of DIRECTIONS) {
      const archetype = ARCHETYPES[direction];
      assert.equal(archetype.direction, direction);
      assert.ok(archetype.coreAppeal.length > 0, direction);
      assert.ok(archetype.typicalAngle.length > 0, direction);
    }
  });

  it('places every direction on all four axes, in range', () => {
    for (const direction of DIRECTIONS) {
      for (const [axis, value] of Object.entries(ARCHETYPES[direction].axes)) {
        assert.ok(value >= 0 && value <= 1, `${direction}.${axis} = ${value}`);
      }
    }
  });

  it('gives no two directions the same position', () => {
    for (const a of DIRECTIONS) {
      for (const b of DIRECTIONS) {
        if (a === b) continue;
        assert.ok(archetypeDistance(a, b) > 0, `${a} and ${b} sit on the same point`);
      }
    }
  });
});

describe('chooseDirections', () => {
  it('defaults to three', () => {
    assert.equal(chooseDirections().length, 3);
  });

  it('picks a genuinely wider spread than the first three in the list', () => {
    const chosen = chooseDirections(3);
    const firstThree = [DIRECTIONS[0]!, DIRECTIONS[1]!, DIRECTIONS[2]!];

    assert.ok(
      minimumSpread(chosen) > minimumSpread(firstThree),
      `chosen spread ${minimumSpread(chosen)} should beat ${minimumSpread(firstThree)}`,
    );
  });

  it('maximises the minimum pairwise distance, verified exhaustively', () => {
    // Every other combination of the same size must be no wider than the choice.
    const chosen = chooseDirections(3);
    const best = minimumSpread(chosen);

    for (let i = 0; i < DIRECTIONS.length; i++) {
      for (let j = i + 1; j < DIRECTIONS.length; j++) {
        for (let k = j + 1; k < DIRECTIONS.length; k++) {
          const candidate = [DIRECTIONS[i]!, DIRECTIONS[j]!, DIRECTIONS[k]!];
          assert.ok(minimumSpread(candidate) <= best + 1e-9, candidate.join('/'));
        }
      }
    }
  });

  it('is deterministic', () => {
    assert.deepEqual(chooseDirections(3), chooseDirections(3));
    assert.deepEqual(chooseDirections(4), chooseDirections(4));
  });

  it('returns distinct directions at every size', () => {
    for (let count = 1; count <= DIRECTIONS.length; count++) {
      const chosen = chooseDirections(count);
      assert.equal(chosen.length, count);
      assert.equal(new Set(chosen).size, count);
    }
  });

  it('rejects a count outside the vocabulary', () => {
    assert.throws(() => chooseDirections(0), RangeError);
    assert.throws(() => chooseDirections(DIRECTIONS.length + 1), RangeError);
  });
});

describe('normalizeDirections', () => {
  it('accepts the vocabulary in any case', () => {
    assert.deepEqual(normalizeDirections(['connection', ' Outcomes ']), ['CONNECTION', 'OUTCOMES']);
  });

  it('rejects an unknown direction, listing the real ones', () => {
    assert.throws(() => normalizeDirections(['VIBES']), (error: unknown) => {
      assert.ok(error instanceof InvalidDirectionsError);
      assert.match(error.message, /CONNECTION/);
      return true;
    });
  });

  it('rejects a duplicate rather than silently dropping it', () => {
    assert.throws(
      () => normalizeDirections(['TRUST', 'trust']),
      /appears twice/,
    );
  });

  it('rejects an empty list', () => {
    assert.throws(() => normalizeDirections([]), InvalidDirectionsError);
  });
});

describe('overlapRatio', () => {
  it('is 1 for the same text and 0 for unrelated text', () => {
    assert.equal(overlapRatio('verified student identity', 'verified student identity'), 1);
    assert.equal(overlapRatio('verified student identity', 'weekly payroll runs'), 0);
  });

  it('ignores stopwords, case and inflection, so rewording does not hide a shared claim', () => {
    assert.equal(overlapRatio('We verify that members are students', 'verifying the members as students'), 1);
  });

  it('still separates genuinely different short words', () => {
    // The stemmer is shallow on purpose: it must not collapse these into one.
    assert.equal(overlapRatio('trust', 'trés'), 0);
    assert.ok(overlapRatio('speed of delivery', 'safety of delivery') < 0.5);
  });

  it('is symmetric', () => {
    assert.equal(overlapRatio('a shared claim here', 'claim shared'), overlapRatio('claim shared', 'a shared claim here'));
  });

  it('treats an empty text as no overlap rather than a division by zero', () => {
    assert.equal(overlapRatio('', 'anything'), 0);
    assert.equal(overlapRatio('   ', ''), 0);
  });

  it('compares lists as one bag of words', () => {
    assert.equal(listOverlapRatio(['thin at launch'], ['thin at launch']), 1);
    assert.ok(listOverlapRatio(['thin at launch'], ['alienates careful buyers']) < 0.2);
  });
});

describe('the BATTLE instructions', () => {
  it('define meaningfully different in terms of attraction, risk and optimisation', () => {
    assert.match(BATTLE_INSTRUCTIONS, /who they would attract, what they would risk, and what they would optimise for/i);
  });

  it('say that different tone is not different strategy', () => {
    assert.match(BATTLE_INSTRUCTIONS, /Different tone is not different strategy/i);
  });

  it('keep all strategies on the same product', () => {
    assert.match(BATTLE_INSTRUCTIONS, /not inventing several different products/i);
  });

  it('require a real risk per strategy', () => {
    assert.match(BATTLE_INSTRUCTIONS, /empty risk list is a failure/i);
  });

  it('require audienceFit to name who it suits less', () => {
    assert.match(BATTLE_INSTRUCTIONS, /who it resonates with less/i);
  });

  it('forbid picking a winner or planting decoys', () => {
    assert.match(BATTLE_INSTRUCTIONS, /Do not pick a winner/i);
    assert.match(BATTLE_INSTRUCTIONS, /decoys/i);
  });

  it('keep positioning to two or three sentences', () => {
    assert.match(BATTLE_INSTRUCTIONS, /two or three sentences/i);
  });

  it('rule out names, taglines and visuals', () => {
    assert.match(BATTLE_INSTRUCTIONS, /No names, taglines, colors or typography/i);
  });
});

describe('validateBattleRequest', () => {
  it('accepts a bare discovery object', () => {
    const request = validateBattleRequest({ discovery: settledDiscovery() });
    assert.deepEqual(request.discovery, settledDiscovery());
    assert.equal(request.positioning, undefined);
  });

  it('requires discovery', () => {
    assert.throws(() => validateBattleRequest({}), (error: unknown) => {
      assert.ok(error instanceof BattleInputError);
      assert.match(error.message, /"discovery" is required/);
      return true;
    });
  });

  it('rejects a body that is not an object', () => {
    for (const body of [null, 'text', 42]) {
      assert.throws(() => validateBattleRequest(body), BattleInputError);
    }
  });

  it('accepts an optional positioning anchor', () => {
    const request = validateBattleRequest({
      discovery: settledDiscovery(),
      positioning: completeState().positioning,
    });
    assert.ok(request.positioning);
  });

  it('rejects an invalid positioning, naming the field', () => {
    assert.throws(
      () => validateBattleRequest({ discovery: settledDiscovery(), positioning: { category: 'x' } }),
      /valueProposition/,
    );
  });

  it('accepts forced directions', () => {
    const request = validateBattleRequest({
      discovery: settledDiscovery(),
      directions: ['CONNECTION', 'OUTCOMES', 'COMPETITION'],
    });
    assert.deepEqual(request.directions, ['CONNECTION', 'OUTCOMES', 'COMPETITION']);
  });

  it('rejects a count below two, since there is nothing to compare', () => {
    assert.throws(() => validateBattleRequest({ discovery: settledDiscovery(), count: 1 }), /between 2/);
  });

  it('rejects a count beyond the vocabulary', () => {
    assert.throws(
      () => validateBattleRequest({ discovery: settledDiscovery(), count: DIRECTIONS.length + 1 }),
      /between 2/,
    );
  });

  it('rejects a non-integer count', () => {
    assert.throws(() => validateBattleRequest({ discovery: settledDiscovery(), count: 2.5 }), /integer/);
  });

  it('rejects a count that disagrees with the directions given', () => {
    assert.throws(
      () =>
        validateBattleRequest({
          discovery: settledDiscovery(),
          directions: ['TRUST', 'CRAFT'],
          count: 3,
        }),
      /make them agree/,
    );
  });

  it('accepts a count that agrees with the directions given', () => {
    const request = validateBattleRequest({
      discovery: settledDiscovery(),
      directions: ['TRUST', 'CRAFT'],
      count: 2,
    });
    assert.equal(request.directions?.length, 2);
  });
});

describe('resolveDirections', () => {
  it('honours forced directions exactly', () => {
    const forced = ['CONNECTION', 'OUTCOMES', 'COMPETITION'] as const;
    assert.deepEqual(resolveDirections({ discovery: settledDiscovery(), directions: [...forced] }), [...forced]);
  });

  it('chooses a spread when none are forced', () => {
    assert.deepEqual(resolveDirections({ discovery: settledDiscovery() }), chooseDirections(3));
  });

  it('respects count when choosing', () => {
    assert.equal(resolveDirections({ discovery: settledDiscovery(), count: 4 }).length, 4);
  });
});

describe('the distinctness check', () => {
  it('passes a genuinely varied batch', () => {
    assert.deepEqual(findDistinctnessIssues(strategyCandidates), []);
  });

  it('catches a shared underlying claim, naming what it collided with', () => {
    const issues = findDistinctnessIssues(indistinctCandidates);
    const claim = issues.find((issue) => /functionally identical/.test(issue.instruction));

    assert.ok(claim, 'expected a shared-claim collision');
    assert.equal(claim.direction, 'OUTCOMES');
    assert.equal(claim.collidedWith, 'CONNECTION');
  });

  it('blames only the later strategy, so the whole batch is not rebuilt', () => {
    const issues = findDistinctnessIssues(indistinctCandidates);
    assert.deepEqual(issues.map((issue) => issue.direction), ['OUTCOMES']);
  });

  it('catches two strategies aimed at the same slice of the audience', () => {
    const candidates = [
      strategyCandidates[0]!,
      { ...strategyCandidates[1]!, primarySegment: strategyCandidates[0]!.primarySegment },
    ];
    const issues = findDistinctnessIssues(candidates);
    assert.ok(issues.some((issue) => /same slice of the audience/.test(issue.instruction)));
  });

  it('catches two strategies that fail in the same way', () => {
    const candidates = [
      strategyCandidates[0]!,
      { ...strategyCandidates[1]!, risks: [...strategyCandidates[0]!.risks] },
    ];
    const issues = findDistinctnessIssues(candidates);
    assert.ok(issues.some((issue) => /fail in different ways/.test(issue.instruction)));
  });

  it('catches a duplicated direction', () => {
    const candidates = [strategyCandidates[0]!, { ...strategyCandidates[1]!, direction: 'CONNECTION' as const }];
    const issues = findDistinctnessIssues(candidates);
    assert.ok(issues.some((issue) => /Two strategies were returned/.test(issue.instruction)));
  });

  it('catches a risk list that is present but empty of content', () => {
    const candidates = [{ ...strategyCandidates[0]!, risks: ['   '] }];
    const issues = findDistinctnessIssues(candidates);
    assert.ok(issues.some((issue) => /listed no real risk/.test(issue.instruction)));
  });

  it('catches a positioning that ran long', () => {
    const candidates = [
      {
        ...strategyCandidates[0]!,
        positioning: 'One. Two. Three. Four. Five.',
      },
    ];
    const issues = findDistinctnessIssues(candidates);
    assert.ok(issues.some((issue) => /comparison document/.test(issue.instruction)));
  });

  it('reports at most one reason per strategy, so a rebuild is not asked twice', () => {
    const issues = findDistinctnessIssues(indistinctCandidates);
    assert.equal(new Set(issues.map((issue) => issue.direction)).size, issues.length);
  });

  it('honours custom thresholds', () => {
    // Two claims that share some wording but not enough for the default threshold.
    const candidates = [
      { ...strategyCandidates[0]!, uniqueClaim: 'we connect owners to proven operators' },
      { ...strategyCandidates[1]!, uniqueClaim: 'we connect owners to growth' },
    ];

    assert.deepEqual(findDistinctnessIssues(candidates), []);
    assert.ok(
      findDistinctnessIssues(candidates, { ...DEFAULT_THRESHOLDS, claim: 0.3 }).length > 0,
      'a stricter threshold should catch the partial overlap',
    );
  });
});

describe('countSentences', () => {
  it('counts sentences and ignores trailing punctuation', () => {
    assert.equal(countSentences('One. Two. Three.'), 3);
    assert.equal(countSentences('Just one'), 1);
    assert.equal(countSentences(''), 0);
    assert.equal(countSentences('Really?! Yes.'), 2);
  });
});

describe('battle', () => {
  it('returns one strategy per direction, in the order assigned', async () => {
    const result = await battle(scriptedDeriver(strategyCandidates), {
      discovery: settledDiscovery(),
      directions: ['CONNECTION', 'COMPETITION', 'TRUST'],
    });

    assert.deepEqual(result.value.map((option) => option.direction), [
      'CONNECTION',
      'COMPETITION',
      'TRUST',
    ]);
  });

  it('returns options that validate against the schema', async () => {
    const result = await battle(scriptedDeriver(strategyCandidates), { discovery: settledDiscovery() });
    for (const option of result.value) {
      assert.ok(StrategyOptionSchema.safeParse(option).success, option.direction);
    }
  });

  it('strips the internal comparison fields from what it returns', async () => {
    const result = await battle(scriptedDeriver(strategyCandidates), { discovery: settledDiscovery() });
    for (const option of result.value as Array<Record<string, unknown>>) {
      assert.equal(option.uniqueClaim, undefined);
      assert.equal(option.primarySegment, undefined);
    }
  });

  it('tells the model the assigned directions with their appeal and angle', async () => {
    const deriver = scriptedDeriver(strategyCandidates);
    await battle(deriver, { discovery: settledDiscovery(), directions: ['CONNECTION', 'TRUST', 'CRAFT'] });

    const prompt = deriver.prompts[0]!;
    assert.match(prompt, /<directions>/);
    assert.match(prompt, /CONNECTION — appeals to: Belonging, community, relationships/);
    assert.match(prompt, /You can count on this/);
  });

  it('sends the positioning as an anchor when it has one', async () => {
    const deriver = scriptedDeriver(strategyCandidates);
    await battle(deriver, { discovery: settledDiscovery(), positioning: completeState().positioning });

    assert.match(deriver.prompts[0]!, /<positioning>/);
    assert.match(deriver.prompts[0]!, /variant of this same core value proposition/);
  });

  it('explores more broadly when given no positioning', async () => {
    const deriver = scriptedDeriver(strategyCandidates);
    await battle(deriver, { discovery: settledDiscovery() });

    assert.doesNotMatch(deriver.prompts[0]!, /<positioning>/);
    assert.match(deriver.prompts[0]!, /No positioning has been committed to yet/);
  });

  it('generates the batch in one call when nothing collides', async () => {
    const deriver = scriptedDeriver(strategyCandidates);
    await battle(deriver, { discovery: settledDiscovery() });

    assert.equal(deriver.prompts.length, 1);
  });

  it('rebuilds only the offending strategy, telling it what it collided with', async () => {
    const fixed: StrategyCandidate = {
      ...indistinctCandidates[1]!,
      uniqueClaim: 'we cut the time from idea to a shipped offer',
      primarySegment: 'owners short on delivery time',
      risks: ['Speed framing can attract owners who will not do the underlying work'],
    };

    const deriver = scriptedDeriver(indistinctCandidates, [fixed]);
    const result = await battle(deriver, {
      discovery: settledDiscovery(),
      directions: ['CONNECTION', 'OUTCOMES'],
    });

    assert.equal(deriver.rebuildCount(), 1);
    const retry = deriver.prompts[1]!;
    assert.match(retry, /OUTCOMES strategy that does not stand apart/);
    assert.match(retry, /functionally identical to CONNECTION/);
    assert.match(retry, /<other_strategies>/);
    // The untouched strategy survives, and the rebuilt one takes its place in order.
    assert.deepEqual(result.value.map((option) => option.direction), ['CONNECTION', 'OUTCOMES']);
  });

  it('tells the rebuild not to resolve the overlap by going vaguer', async () => {
    const fixed: StrategyCandidate = {
      ...indistinctCandidates[1]!,
      uniqueClaim: 'we cut the time from idea to a shipped offer',
      primarySegment: 'owners short on delivery time',
      risks: ['Speed framing attracts the wrong buyer'],
    };
    const deriver = scriptedDeriver(indistinctCandidates, [fixed]);
    await battle(deriver, { discovery: settledDiscovery(), directions: ['CONNECTION', 'OUTCOMES'] });

    assert.match(deriver.prompts[1]!, /not a strategy that differs more/);
  });

  it('fails loudly rather than returning the same idea twice', async () => {
    // The rebuild returns the same colliding strategy, so nothing improves.
    const deriver = scriptedDeriver(indistinctCandidates, [indistinctCandidates[1]!]);

    await assert.rejects(
      () => battle(deriver, { discovery: settledDiscovery(), directions: ['CONNECTION', 'OUTCOMES'] }),
      (error: unknown) => {
        assert.ok(error instanceof IndistinctStrategiesError);
        assert.equal(error.reasons[0]?.direction, 'OUTCOMES');
        return true;
      },
    );
  });

  it('honours a rebuild budget of zero by failing immediately', async () => {
    const deriver = scriptedDeriver(indistinctCandidates);
    await assert.rejects(
      () =>
        battle(
          deriver,
          { discovery: settledDiscovery(), directions: ['CONNECTION', 'OUTCOMES'] },
          { maxRebuildsPerStrategy: 0 },
        ),
      IndistinctStrategiesError,
    );
    assert.equal(deriver.prompts.length, 1);
  });

  it('accumulates usage across the batch and its rebuilds', async () => {
    const fixed: StrategyCandidate = {
      ...indistinctCandidates[1]!,
      uniqueClaim: 'we cut the time from idea to a shipped offer',
      primarySegment: 'owners short on delivery time',
      risks: ['Speed framing attracts the wrong buyer'],
    };
    const deriver = scriptedDeriver(indistinctCandidates, [fixed]);
    const result = await battle(deriver, {
      discovery: settledDiscovery(),
      directions: ['CONNECTION', 'OUTCOMES'],
    });

    assert.equal(result.usage.inputTokens, 20);
  });
});

describe('toStrategyOption', () => {
  it('copies the arrays, so mutating the candidate cannot reach the option', () => {
    const candidate = structuredClone(strategyCandidates[0]!);
    const option = toStrategyOption(candidate);
    candidate.risks.push('added afterwards');

    assert.equal(option.risks.length, strategyCandidates[0]!.risks.length);
  });
});

describe('selectStrategy', () => {
  const options = strategyCandidates.map(toStrategyOption);

  it('records the chosen direction with a timestamp', () => {
    const selection = selectStrategy(options, 'TRUST');
    assert.equal(selection.direction, 'TRUST');
    assert.ok(!Number.isNaN(Date.parse(selection.chosenAt)));
  });

  it('accepts the direction in any case', () => {
    assert.equal(selectStrategy(options, ' trust ').direction, 'TRUST');
  });

  it('records a reason when one is given, and omits it when not', () => {
    assert.equal(selectStrategy(options, 'TRUST', 'burned once already').reasonChosen, 'burned once already');
    assert.equal(selectStrategy(options, 'TRUST').reasonChosen, undefined);
    assert.equal(selectStrategy(options, 'TRUST', '   ').reasonChosen, undefined);
  });

  it('refuses a direction that is not on the table, listing what is', () => {
    assert.throws(() => selectStrategy(options, 'REBELLION'), (error: unknown) => {
      assert.ok(error instanceof BattleInputError);
      assert.match(error.message, /Available: CONNECTION, COMPETITION, TRUST/);
      return true;
    });
  });

  it('is a pointer, carrying no copy of the strategy detail', () => {
    const selection = selectStrategy(options, 'TRUST') as Record<string, unknown>;
    assert.deepEqual(Object.keys(selection).sort(), ['chosenAt', 'direction']);
  });
});

describe('resolveSelectedStrategy', () => {
  it('returns the chosen option in full', () => {
    const resolved = resolveSelectedStrategy(completeState());
    assert.equal(resolved?.direction, 'TRUST');
    assert.ok(resolved?.positioning.length);
  });

  it('returns nothing when no choice has been made, rather than the first option', () => {
    const state = completeState();
    delete state.selectedStrategy;

    assert.equal(resolveSelectedStrategy(state), undefined);
  });

  it('returns nothing for a pointer to a direction that is not there', () => {
    const state = completeState();
    state.strategyOptions = state.strategyOptions.filter((option) => option.direction !== 'TRUST');

    assert.equal(resolveSelectedStrategy(state), undefined);
  });
});

describe('the pipeline strategyOptions step', () => {
  it('generates options and stores them', async () => {
    const { runStep } = await import('../src/steps.ts');
    const state = completeState();
    state.strategyOptions = [];

    const result = await runStep(new StubDeriver(), state, 'strategyOptions');

    assert.equal(result.state.strategyOptions.length, 3);
    for (const option of result.state.strategyOptions) {
      assert.ok(StrategyOptionSchema.safeParse(option).success);
    }
  });

  it('passes the positioning as an anchor when the pipeline has one', async () => {
    const { runStep } = await import('../src/steps.ts');
    const state = completeState();
    state.strategyOptions = [];

    const deriver = new StubDeriver();
    await runStep(deriver, state, 'strategyOptions');

    assert.match(deriver.calls[0]!.userPrompt!, /<positioning>/);
  });
});
