import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeriveOptions, SectionDeriver, Usage } from '../src/client.ts';
import { parseCompetitorList } from '../src/competitors.ts';
import {
  DiscoveryIncompleteError,
  PositionInputError,
  VagueCategoryError,
  detectsAudienceNarrowing,
  hashDiscovery,
  isCategoryAllFiller,
  isDiscoveryReadyToPosition,
  isPositioningStale,
  position,
  toPositionResponse,
  toPositioningSection,
  validatePositionRequest,
} from '../src/position.ts';
import type { PositionResult } from '../src/position.ts';
import { POSITION_INSTRUCTIONS } from '../src/prompts.ts';
import { PositioningSchema } from '../src/schemas.ts';
import { StubDeriver, completeState, positionResult } from './fixtures.ts';
import type { Discovery } from '../src/types.ts';

/** A settled discovery: nothing left open, so the guard lets it through. */
function settledDiscovery(): Discovery {
  return { ...completeState().discovery, openQuestions: [] };
}

/** A discovery with unresolved questions. */
function openDiscovery(): Discovery {
  return {
    ...completeState().discovery,
    openQuestions: ['Is the buyer the owner or an operations lead?', 'Which platform first?'],
  };
}

const usage: Usage = {
  inputTokens: 10,
  outputTokens: 5,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
};

/** A deriver returning a scripted sequence of results, recording the prompts. */
function scriptedDeriver(results: PositionResult[]): SectionDeriver & {
  prompts: string[];
} {
  const prompts: string[] = [];
  let index = 0;

  return {
    prompts,
    async deriveSection<T>(
      _section: string,
      _state: string,
      _schema: unknown,
      options?: DeriveOptions,
    ): Promise<{ value: T; usage: Usage }> {
      prompts.push(options?.userPrompt ?? '');
      const result = results[Math.min(index, results.length - 1)]!;
      index++;
      return { value: result as T, usage };
    },
  } as SectionDeriver & { prompts: string[] };
}

describe('the POSITION instructions', () => {
  it('name the failure mode this phase actually has', () => {
    assert.match(POSITION_INSTRUCTIONS, /equally true of every competitor/i);
  });

  it('require the category to survive the five-unrelated-products test', () => {
    assert.match(POSITION_INSTRUCTIONS, /five unrelated products/i);
    assert.match(POSITION_INSTRUCTIONS, /marketing euphemism/i);
  });

  it('require the competitive angle to cover the status quo', () => {
    assert.match(POSITION_INSTRUCTIONS, /spreadsheet|group chat|word of mouth/i);
    assert.match(POSITION_INSTRUCTIONS, /Never write that there are no direct competitors/i);
  });

  it('require rationale to cite discovery concretely', () => {
    assert.match(POSITION_INSTRUCTIONS, /exciting and underserved/i);
  });

  it('keep the value proposition from becoming a tagline', () => {
    assert.match(POSITION_INSTRUCTIONS, /argued true or false/i);
  });

  it('forbid rewriting the problem or editing discovery', () => {
    assert.match(POSITION_INSTRUCTIONS, /Do not rewrite the problem/i);
    assert.match(POSITION_INSTRUCTIONS, /Do not edit discovery/i);
  });

  it('rule out the later phases', () => {
    assert.match(POSITION_INSTRUCTIONS, /No brand name, no tagline/i);
    assert.match(POSITION_INSTRUCTIONS, /No colors or typography/i);
  });
});

describe('the discovery guard', () => {
  it('lets a settled discovery through', () => {
    assert.equal(isDiscoveryReadyToPosition(settledDiscovery()), true);
  });

  it('blocks a discovery with open questions', () => {
    assert.equal(isDiscoveryReadyToPosition(openDiscovery()), false);
  });

  it('refuses to position on an unfinished discovery', async () => {
    await assert.rejects(
      () => position(new StubDeriver(), { discovery: openDiscovery() }),
      (error: unknown) => {
        assert.ok(error instanceof DiscoveryIncompleteError);
        assert.deepEqual(error.openQuestions, openDiscovery().openQuestions);
        assert.match(error.message, /forceProceed/);
        return true;
      },
    );
  });

  it('does not call the model at all when it blocks', async () => {
    const deriver = new StubDeriver();
    await assert.rejects(() => position(deriver, { discovery: openDiscovery() }));
    assert.equal(deriver.calls.length, 0);
  });

  it('proceeds when told to, and tells the model what to assume', async () => {
    const deriver = scriptedDeriver([positionResult]);
    await position(deriver, { discovery: openDiscovery(), forceProceed: true });

    const prompt = deriver.prompts[0]!;
    assert.match(prompt, /<unresolved_questions>/);
    assert.match(prompt, /Is the buyer the owner or an operations lead\?/);
    assert.match(prompt, /add an entry to assumptionsUsed/);
  });

  it('does not mention unresolved questions when there are none', async () => {
    const deriver = scriptedDeriver([positionResult]);
    await position(deriver, { discovery: settledDiscovery() });

    assert.doesNotMatch(deriver.prompts[0]!, /<unresolved_questions>/);
  });
});

describe('validatePositionRequest', () => {
  it('accepts a discovery object nested under "discovery"', () => {
    const request = validatePositionRequest({ discovery: settledDiscovery() });
    assert.deepEqual(request.discovery, settledDiscovery());
  });

  it('accepts a bare discovery object, which is what Phase 2 returns', () => {
    const request = validatePositionRequest(settledDiscovery());
    assert.deepEqual(request.discovery, settledDiscovery());
  });

  it('rejects a body that is not an object', () => {
    for (const body of [null, 'text', 42, undefined]) {
      assert.throws(() => validatePositionRequest(body), PositionInputError);
    }
  });

  it('rejects an invalid discovery object, naming the field', () => {
    assert.throws(
      () => validatePositionRequest({ discovery: { problem: 'only this' } }),
      (error: unknown) => {
        assert.ok(error instanceof PositionInputError);
        assert.match(error.message, /targetAudience/);
        return true;
      },
    );
  });

  it('accepts and cleans knownCompetitors', () => {
    const request = validatePositionRequest({
      discovery: settledDiscovery(),
      knownCompetitors: ['Devpost team-finder', '  ', 'Discord servers'],
    });
    assert.deepEqual(request.knownCompetitors, ['Devpost team-finder', 'Discord servers']);
  });

  it('rejects knownCompetitors of the wrong shape', () => {
    for (const value of ['a string', [1, 2], { a: 'b' }]) {
      assert.throws(
        () => validatePositionRequest({ discovery: settledDiscovery(), knownCompetitors: value }),
        PositionInputError,
      );
    }
  });

  it('accepts the boolean flags', () => {
    const request = validatePositionRequest({
      discovery: settledDiscovery(),
      forceProceed: true,
      includeAlternatives: true,
    });
    assert.equal(request.forceProceed, true);
    assert.equal(request.includeAlternatives, true);
  });

  it('rejects a non-boolean flag', () => {
    for (const flag of ['forceProceed', 'includeAlternatives']) {
      assert.throws(
        () => validatePositionRequest({ discovery: settledDiscovery(), [flag]: 'yes' }),
        PositionInputError,
      );
    }
  });
});

describe('the competitive angle input', () => {
  it('sends known competitors when supplied', async () => {
    const deriver = scriptedDeriver([positionResult]);
    await position(deriver, {
      discovery: settledDiscovery(),
      knownCompetitors: ['Devpost team-finder', 'Discord servers'],
    });

    const prompt = deriver.prompts[0]!;
    assert.match(prompt, /<known_competitors>/);
    assert.match(prompt, /Devpost team-finder/);
  });

  it('tells the model to name the informal alternative when none are supplied', async () => {
    const deriver = scriptedDeriver([positionResult]);
    await position(deriver, { discovery: settledDiscovery() });

    const prompt = deriver.prompts[0]!;
    assert.doesNotMatch(prompt, /<known_competitors>/);
    assert.match(prompt, /does not mean there are none/i);
  });

  it('uses the optional lookup only when no competitors were given', async () => {
    const calls: string[] = [];
    const lookup = async () => {
      calls.push('called');
      return ['Discord servers'];
    };

    const withKnown = scriptedDeriver([positionResult]);
    await position(
      withKnown,
      { discovery: settledDiscovery(), knownCompetitors: ['Devpost'] },
      { competitorLookup: lookup },
    );
    assert.deepEqual(calls, []);

    const without = scriptedDeriver([positionResult]);
    await position(without, { discovery: settledDiscovery() }, { competitorLookup: lookup });
    assert.deepEqual(calls, ['called']);
    assert.match(without.prompts[0]!, /Discord servers/);
  });

  it('survives a lookup that throws, since the lookup is an enhancement', async () => {
    const deriver = scriptedDeriver([positionResult]);
    const result = await position(
      deriver,
      { discovery: settledDiscovery() },
      {
        competitorLookup: async () => {
          throw new Error('the search backend is down');
        },
      },
    );

    assert.equal(result.value.category, positionResult.category);
    assert.match(deriver.prompts[0]!, /does not mean there are none/i);
  });

  it('works with no lookup configured at all', async () => {
    const result = await position(scriptedDeriver([positionResult]), {
      discovery: settledDiscovery(),
    });
    assert.ok(result.value.category.length > 0);
  });
});

describe('the category specificity check', () => {
  const vague: PositionResult = {
    ...positionResult,
    category: 'Collaborative discovery platform',
    categoryCheck: {
      couldDescribeUnrelatedProducts: true,
      unrelatedProducts: ['Notion', 'Figma', 'Slack', 'Miro', 'Airtable'],
    },
  };

  it('retries when the model reports its own category as too vague', async () => {
    const deriver = scriptedDeriver([vague, positionResult]);
    const result = await position(deriver, { discovery: settledDiscovery() });

    assert.equal(deriver.prompts.length, 2);
    assert.equal(result.value.category, positionResult.category);
  });

  it('quotes the rejected category and the products it could describe', async () => {
    const deriver = scriptedDeriver([vague, positionResult]);
    await position(deriver, { discovery: settledDiscovery() });

    const retry = deriver.prompts[1]!;
    assert.match(retry, /Collaborative discovery platform/);
    assert.match(retry, /Notion; Figma/);
    assert.match(retry, /Length is not specificity/);
  });

  it('fails loudly rather than persisting a category that failed twice', async () => {
    const deriver = scriptedDeriver([vague, vague]);
    await assert.rejects(
      () => position(deriver, { discovery: settledDiscovery() }),
      (error: unknown) => {
        assert.ok(error instanceof VagueCategoryError);
        assert.equal(error.category, 'Collaborative discovery platform');
        assert.deepEqual(error.unrelatedProducts, vague.categoryCheck.unrelatedProducts);
        return true;
      },
    );
    assert.equal(deriver.prompts.length, 2);
  });

  it('honours a configured attempt limit', async () => {
    const deriver = scriptedDeriver([vague, vague, vague, positionResult]);
    await assert.rejects(
      () => position(deriver, { discovery: settledDiscovery() }, { maxCategoryAttempts: 3 }),
      VagueCategoryError,
    );
    assert.equal(deriver.prompts.length, 3);
  });

  it('catches an all-filler category even when the model passes itself', async () => {
    // The self-report is the real check; this is the backstop for the case a
    // self-report is most likely to wave through.
    const selfApproved: PositionResult = {
      ...positionResult,
      category: 'Modern all-in-one collaborative platform',
      categoryCheck: { couldDescribeUnrelatedProducts: false, unrelatedProducts: [] },
    };

    const deriver = scriptedDeriver([selfApproved, positionResult]);
    const result = await position(deriver, { discovery: settledDiscovery() });

    assert.equal(deriver.prompts.length, 2);
    assert.equal(result.value.category, positionResult.category);
  });
});

describe('isCategoryAllFiller', () => {
  it('flags categories built entirely from marketing filler', () => {
    for (const category of [
      'Modern platform',
      'All-in-one solution',
      'Collaborative discovery platform'.replace('discovery ', ''),
      'AI-powered digital experience',
      '   ',
    ]) {
      assert.equal(isCategoryAllFiller(category), true, category);
    }
  });

  it('passes categories naming a real domain, including ones using generic nouns', () => {
    for (const category of [
      'Student team-formation tool for hackathons',
      'Productisation tool for service agencies',
      'Payroll software for restaurants',
      'Bookkeeping platform for solo therapists',
    ]) {
      assert.equal(isCategoryAllFiller(category), false, category);
    }
  });
});

describe('the alternatives flag', () => {
  it('asks for alternatives only when requested', async () => {
    const off = scriptedDeriver([positionResult]);
    await position(off, { discovery: settledDiscovery() });
    assert.match(off.prompts[0]!, /Do not return alternativePositions/);

    const on = scriptedDeriver([positionResult]);
    await position(on, { discovery: settledDiscovery(), includeAlternatives: true });
    assert.match(on.prompts[0]!, /one or two other viable angles/i);
    assert.match(on.prompts[0]!, /road not taken/);
  });
});

describe('toPositionResponse', () => {
  it('strips the internal self-check from the response', () => {
    const response = toPositionResponse(positionResult) as Record<string, unknown>;
    assert.equal(response.categoryCheck, undefined);
  });

  it('keeps the documented fields', () => {
    assert.deepEqual(Object.keys(toPositionResponse(positionResult)).sort(), [
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

  it('never returns the self-check through position()', async () => {
    const result = await position(scriptedDeriver([positionResult]), {
      discovery: settledDiscovery(),
    });
    assert.equal((result.value as Record<string, unknown>).categoryCheck, undefined);
  });
});

describe('toPositioningSection', () => {
  const discovery = settledDiscovery();
  const section = toPositioningSection(toPositionResponse(positionResult), discovery);

  it('produces a valid BrandState positioning section', () => {
    assert.ok(PositioningSchema.safeParse(section).success);
  });

  it('does not duplicate audience or problem, which discovery owns', () => {
    const asRecord = section as Record<string, unknown>;
    assert.equal(asRecord.audience, undefined);
    assert.equal(asRecord.problem, undefined);
    assert.equal(asRecord.userNeed, undefined);
  });

  it('does not carry the API-only fields into the state', () => {
    const asRecord = section as Record<string, unknown>;
    assert.equal(asRecord.assumptionsUsed, undefined);
    assert.equal(asRecord.alternativePositions, undefined);
  });

  it('carries the five strategy fields across', () => {
    assert.equal(section.category, positionResult.category);
    assert.equal(section.valueProposition, positionResult.valueProposition);
    assert.equal(section.differentiator, positionResult.differentiator);
    assert.equal(section.competitiveAngle, positionResult.competitiveAngle);
    assert.deepEqual(section.rationale, positionResult.rationale);
  });

  it('records which discovery it was derived from', () => {
    assert.equal(section.sourceDiscoveryHash, hashDiscovery(discovery));
  });

  it('copies the rationale, so mutating the response cannot reach the state', () => {
    const response = toPositionResponse(structuredClone(positionResult));
    const copy = toPositioningSection(response, discovery);
    response.rationale.push('added afterwards');

    assert.equal(copy.rationale.length, positionResult.rationale.length);
  });
});

describe('hashDiscovery', () => {
  it('is stable across re-serialization', () => {
    assert.equal(hashDiscovery(settledDiscovery()), hashDiscovery(settledDiscovery()));
  });

  it('ignores key order', () => {
    const shuffled = Object.fromEntries(
      Object.entries(settledDiscovery()).reverse(),
    ) as unknown as Discovery;
    assert.equal(hashDiscovery(settledDiscovery()), hashDiscovery(shuffled));
  });

  it('changes when the discovery content changes', () => {
    const edited = { ...settledDiscovery(), problem: 'something else entirely' };
    assert.notEqual(hashDiscovery(settledDiscovery()), hashDiscovery(edited));
  });
});

describe('isPositioningStale', () => {
  const discovery = settledDiscovery();
  const section = toPositioningSection(toPositionResponse(positionResult), discovery);

  it('is false against the discovery it was derived from', () => {
    assert.equal(isPositioningStale(discovery, section), false);
  });

  it('is true once discovery has been edited underneath it', () => {
    const edited = { ...discovery, targetAudience: 'a different audience entirely' };
    assert.equal(isPositioningStale(edited, section), true);
  });

  it('is false when no hash was recorded, since unknown is not evidence of stale', () => {
    const { sourceDiscoveryHash: _omitted, ...withoutHash } = section;
    assert.equal(isPositioningStale(discovery, withoutHash), false);
  });
});

describe('detectsAudienceNarrowing', () => {
  it('flags a sharpened audience', () => {
    assert.equal(detectsAudienceNarrowing('Students', 'Final-year CS students at large universities'), true);
  });

  it('does not flag an unchanged audience', () => {
    assert.equal(detectsAudienceNarrowing('Students', 'Students'), false);
  });

  it('ignores whitespace and case differences', () => {
    assert.equal(detectsAudienceNarrowing('Students ', '  students'), false);
    assert.equal(detectsAudienceNarrowing('a  b', 'a b'), false);
  });
});

describe('parseCompetitorList', () => {
  it('reads a bare JSON array', () => {
    assert.deepEqual(parseCompetitorList('["Devpost", "Discord servers"]'), ['Devpost', 'Discord servers']);
  });

  it('finds the array inside surrounding prose or a fenced block', () => {
    assert.deepEqual(parseCompetitorList('Here you go:\n```json\n["Devpost"]\n```'), ['Devpost']);
  });

  it('returns nothing for an empty result or unparseable text', () => {
    for (const text of ['[]', 'I could not find any', '[not json', '']) {
      assert.deepEqual(parseCompetitorList(text), []);
    }
  });

  it('drops non-strings and blanks, and de-duplicates case-insensitively', () => {
    assert.deepEqual(parseCompetitorList('["Devpost", 42, "  ", "devpost", "Discord"]'), [
      'Devpost',
      'Discord',
    ]);
  });

  it('respects the limit', () => {
    assert.equal(parseCompetitorList('["a","b","c","d"]', 2).length, 2);
  });
});

describe('the pipeline positioning step', () => {
  it('goes through POSITION and stores the mapped section', async () => {
    const { runStep } = await import('../src/steps.ts');
    const state = completeState();
    const deriver = new StubDeriver();

    const result = await runStep(deriver, state, 'positioning');

    assert.ok(PositioningSchema.safeParse(result.state.positioning).success);
    assert.equal(result.state.positioning.category, positionResult.category);
    assert.match(deriver.calls[0]!.userPrompt!, /<discovery>/);
  });

  it('records provenance, so a later edit to discovery is detectable', async () => {
    const { runStep } = await import('../src/steps.ts');
    const state = completeState();

    const result = await runStep(new StubDeriver(), state, 'positioning');
    assert.equal(
      result.state.positioning.sourceDiscoveryHash,
      hashDiscovery(state.discovery),
    );
    assert.equal(isPositioningStale(state.discovery, result.state.positioning), false);
  });

  it('proceeds past open questions rather than halting an end-to-end run', async () => {
    const { runStep } = await import('../src/steps.ts');
    const { applyDelta } = await import('../src/state.ts');

    // completeState's discovery has an open question, so this is the real case.
    const state = applyDelta(completeState(), 'discovery', openDiscovery());
    const deriver = new StubDeriver();

    const result = await runStep(deriver, state, 'positioning');

    assert.ok(PositioningSchema.safeParse(result.state.positioning).success);
    // And it says what it assumed, rather than hiding it.
    assert.match(deriver.calls[0]!.userPrompt!, /<unresolved_questions>/);
  });

  it('does not leave the echoed fields in the state', async () => {
    const { runStep } = await import('../src/steps.ts');
    const result = await runStep(new StubDeriver(), completeState(), 'positioning');

    assert.deepEqual(Object.keys(result.state.positioning).sort(), [
      'assumptions',
      'category',
      'competitiveAngle',
      'confidence',
      'differentiator',
      'rationale',
      'sourceDiscoveryHash',
      'valueProposition',
    ]);
  });
});
