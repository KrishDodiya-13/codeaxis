import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import {
  DiscoverInputError,
  discover,
  formatAnswers,
  isDiscoverySufficient,
  toDiscoverySection,
  validateDiscoverRequest,
} from '../src/discover.ts';
import { DISCOVER_INSTRUCTIONS } from '../src/prompts.ts';
import { DiscoverResultSchema, DiscoverySchema } from '../src/schemas.ts';
import { StubDeriver, discoverResult, specWorkedExample } from './fixtures.ts';

describe('DiscoverResultSchema', () => {
  it('accepts the worked example from the spec', () => {
    assert.ok(DiscoverResultSchema.safeParse(specWorkedExample).success);
  });

  it('accepts empty goals and constraints, which are valid output and not a failure', () => {
    const sparse = { ...specWorkedExample, goals: [], constraints: [] };
    assert.ok(DiscoverResultSchema.safeParse(sparse).success);
  });

  it('accepts an empty missingInformation list, meaning discovery is done', () => {
    const complete = { ...discoverResult, missingInformation: [], followUpQuestions: [] };
    assert.ok(DiscoverResultSchema.safeParse(complete).success);
  });

  it('requires problem, targetAudience and userNeed to say something', () => {
    for (const field of ['problem', 'targetAudience', 'userNeed'] as const) {
      const result = DiscoverResultSchema.safeParse({ ...discoverResult, [field]: '' });
      assert.equal(result.success, false, `${field} should not accept an empty string`);
    }
  });

  it('carries the seven documented fields plus the assumptions extension', () => {
    assert.deepEqual(Object.keys(DiscoverResultSchema.shape).sort(), [
      'assumptions',
      'constraints',
      'followUpQuestions',
      'goals',
      'missingInformation',
      'problem',
      'targetAudience',
      'userNeed',
    ]);
  });

  it('keeps problem and userNeed as separate fields', () => {
    // Collapsing them would lose what positioning needs later: the problem is
    // what we solve, the need is why anyone cares.
    assert.ok('problem' in DiscoverResultSchema.shape);
    assert.ok('userNeed' in DiscoverResultSchema.shape);
    assert.notEqual(specWorkedExample.problem, specWorkedExample.userNeed);
  });
});

describe('the DISCOVER instructions', () => {
  it('tell the model not to generate a brand', () => {
    assert.match(DISCOVER_INSTRUCTIONS, /Do not generate a brand/);
    assert.match(DISCOVER_INSTRUCTIONS, /identify what you still need to know/i);
  });

  it('rule out the things that belong to later phases', () => {
    for (const forbidden of ['tagline', 'colors', 'differentiator', 'positioning']) {
      assert.match(DISCOVER_INSTRUCTIONS, new RegExp(forbidden, 'i'), `should mention ${forbidden}`);
    }
  });

  it('bias toward more missing information rather than less', () => {
    assert.match(DISCOVER_INSTRUCTIONS, /five to ten gaps is normal/i);
  });

  it('say that empty arrays are valid output', () => {
    assert.match(DISCOVER_INSTRUCTIONS, /Empty arrays are valid output/i);
  });
});

describe('validateDiscoverRequest', () => {
  it('accepts a bare idea', () => {
    assert.deepEqual(validateDiscoverRequest({ idea: 'an app for students' }), {
      idea: 'an app for students',
    });
  });

  it('trims the idea', () => {
    assert.equal(validateDiscoverRequest({ idea: '  an idea  ' }).idea, 'an idea');
  });

  it('rejects a missing or empty idea', () => {
    for (const body of [{}, { idea: '' }, { idea: '   ' }, { idea: 42 }]) {
      assert.throws(() => validateDiscoverRequest(body), DiscoverInputError);
    }
  });

  it('rejects a body that is not an object', () => {
    for (const body of [null, 'a string', 42, undefined]) {
      assert.throws(() => validateDiscoverRequest(body), DiscoverInputError);
    }
  });

  it('accepts the prior object under the name the spec uses', () => {
    const request = validateDiscoverRequest({
      idea: 'an idea',
      discovery: discoverResult,
      answers: 'the owner buys it',
    });
    assert.deepEqual(request.priorDiscovery, discoverResult);
  });

  it('accepts the prior object under priorDiscovery too', () => {
    const request = validateDiscoverRequest({
      idea: 'an idea',
      priorDiscovery: discoverResult,
      answers: ['the owner'],
    });
    assert.deepEqual(request.priorDiscovery, discoverResult);
  });

  it('rejects a prior object that is not a discovery object, naming the field', () => {
    assert.throws(
      () => validateDiscoverRequest({ idea: 'an idea', discovery: { problem: 'only this' } }),
      (error: unknown) => {
        assert.ok(error instanceof DiscoverInputError);
        assert.match(error.message, /targetAudience/);
        return true;
      },
    );
  });

  it('accepts all three answer shapes', () => {
    for (const answers of [
      'free text',
      ['first', 'second'],
      { 'Is the buyer the owner?': 'the owner' },
    ]) {
      const request = validateDiscoverRequest({ idea: 'x', discovery: discoverResult, answers });
      assert.deepEqual(request.answers, answers);
    }
  });

  it('rejects answers of the wrong shape', () => {
    for (const answers of [42, [1, 2], { a: 1 }, true]) {
      assert.throws(
        () => validateDiscoverRequest({ idea: 'x', discovery: discoverResult, answers }),
        DiscoverInputError,
      );
    }
  });

  it('rejects answers with no prior object to answer', () => {
    assert.throws(
      () => validateDiscoverRequest({ idea: 'x', answers: 'the owner' }),
      (error: unknown) => {
        assert.ok(error instanceof DiscoverInputError);
        assert.match(error.message, /only makes sense alongside/);
        return true;
      },
    );
  });
});

describe('formatAnswers', () => {
  it('passes free text through', () => {
    assert.equal(formatAnswers('  the owner buys it  '), 'the owner buys it');
  });

  it('pairs a positional list back up with the questions it answers', () => {
    const text = formatAnswers(['the owner'], discoverResult.followUpQuestions);
    assert.match(text, /Q: Is the buyer the owner or an operations lead\?/);
    assert.match(text, /A: the owner/);
  });

  it('lists an answer with no matching question rather than dropping it', () => {
    const text = formatAnswers(['first', 'second'], ['only one question']);
    assert.match(text, /second/);
  });

  it('labels a question-to-answer map', () => {
    const text = formatAnswers({ 'Which platform?': 'web only' });
    assert.equal(text, '- Q: Which platform?\n  A: web only');
  });
});

describe('discover', () => {
  it('sends only the idea on a first call', async () => {
    const deriver = new StubDeriver();
    await discover(deriver, { idea: 'an app for students to find hackathon teammates' });

    const prompt = deriver.calls[0]!.userPrompt!;
    assert.match(prompt, /<idea>/);
    assert.match(prompt, /hackathon teammates/);
    assert.doesNotMatch(prompt, /<prior_discovery>/);
  });

  it('returns a result that validates against the schema', async () => {
    const { value } = await discover(new StubDeriver(), { idea: 'an idea' });
    assert.ok(DiscoverResultSchema.safeParse(value).success);
  });

  it('sends the prior object and the answers on a re-invocation', async () => {
    const deriver = new StubDeriver();
    await discover(deriver, {
      idea: 'an idea',
      priorDiscovery: discoverResult,
      answers: { 'Is the buyer the owner or an operations lead?': 'the owner' },
    });

    const prompt = deriver.calls[0]!.userPrompt!;
    assert.match(prompt, /<prior_discovery>/);
    assert.match(prompt, /<answers>/);
    assert.match(prompt, /A: the owner/);
    // The prior object must go over in full, so the model refines it.
    assert.match(prompt, /Agency owners sell their own time/);
  });

  it('instructs the model to merge rather than start over', async () => {
    const deriver = new StubDeriver();
    await discover(deriver, { idea: 'an idea', priorDiscovery: discoverResult, answers: 'the owner' });

    const prompt = deriver.calls[0]!.userPrompt!;
    assert.match(prompt, /refinement, not a fresh start/);
    assert.match(prompt, /Where a question went unanswered, keep it/);
  });

  it('treats a prior object with no answers as a fresh call, since nothing can be merged', async () => {
    const deriver = new StubDeriver();
    await discover(deriver, { idea: 'an idea', priorDiscovery: discoverResult, answers: '   ' });

    assert.doesNotMatch(deriver.calls[0]!.userPrompt!, /<prior_discovery>/);
  });

  it('serializes the prior object deterministically, so the prompt is stable', async () => {
    const shuffled = Object.fromEntries(
      Object.entries(discoverResult).reverse(),
    ) as typeof discoverResult;

    const a = new StubDeriver();
    const b = new StubDeriver();
    await discover(a, { idea: 'x', priorDiscovery: discoverResult, answers: 'y' });
    await discover(b, { idea: 'x', priorDiscovery: shuffled, answers: 'y' });

    assert.equal(a.calls[0]!.userPrompt, b.calls[0]!.userPrompt);
  });
});

describe('isDiscoverySufficient', () => {
  it('is false while anything is missing', () => {
    assert.equal(isDiscoverySufficient(specWorkedExample), false);
  });

  it('is true once nothing is missing', () => {
    assert.equal(isDiscoverySufficient({ ...discoverResult, missingInformation: [] }), true);
  });
});

describe('toDiscoverySection', () => {
  it('produces a valid BrandState discovery section', () => {
    const section = toDiscoverySection(specWorkedExample);
    assert.ok(DiscoverySchema.safeParse(section).success);
  });

  it('carries the shared fields across unchanged', () => {
    const section = toDiscoverySection(specWorkedExample);
    assert.equal(section.problem, specWorkedExample.problem);
    assert.equal(section.targetAudience, specWorkedExample.targetAudience);
    assert.equal(section.userNeed, specWorkedExample.userNeed);
    assert.deepEqual(section.goals, specWorkedExample.goals);
    assert.deepEqual(section.constraints, specWorkedExample.constraints);
    assert.deepEqual(section.assumptions, specWorkedExample.assumptions);
  });

  it('drops the working fields, which are not part of BrandState', () => {
    const section = toDiscoverySection(specWorkedExample) as Record<string, unknown>;
    assert.equal(section.missingInformation, undefined);
    assert.equal(section.followUpQuestions, undefined);
  });

  it('carries unresolved gaps into openQuestions as their questions', () => {
    const section = toDiscoverySection(specWorkedExample);
    assert.equal(section.openQuestions.length, specWorkedExample.missingInformation.length);
    assert.equal(section.openQuestions[0], specWorkedExample.followUpQuestions[0]);
  });

  it('falls back to the gap itself when no question was written for it', () => {
    const lopsided = {
      ...discoverResult,
      missingInformation: ['first gap', 'second gap'],
      followUpQuestions: ['What about the first gap?'],
    };

    assert.deepEqual(toDiscoverySection(lopsided).openQuestions, [
      'What about the first gap?',
      'second gap',
    ]);
  });

  it('keeps a question that has no gap beside it, rather than dropping it', () => {
    const lopsided = {
      ...discoverResult,
      missingInformation: ['only gap'],
      followUpQuestions: ['What about the gap?', 'And this other thing?'],
    };

    assert.deepEqual(toDiscoverySection(lopsided).openQuestions, [
      'What about the gap?',
      'And this other thing?',
    ]);
  });

  it('leaves openQuestions empty when discovery is complete', () => {
    const complete = { ...discoverResult, missingInformation: [], followUpQuestions: [] };
    assert.deepEqual(toDiscoverySection(complete).openQuestions, []);
  });

  it('copies the arrays, so mutating the result cannot reach the section', () => {
    const source = structuredClone(discoverResult);
    const section = toDiscoverySection(source);
    source.goals.push('added afterwards');

    assert.equal(section.goals.length, discoverResult.goals.length);
  });
});

describe('the pipeline discovery step', () => {
  it('goes through DISCOVER and stores the mapped section', async () => {
    const { runStep } = await import('../src/steps.ts');
    const { createInitialState } = await import('../src/state.ts');
    const deriver = new StubDeriver();

    const { state } = await runStep(deriver, createInitialState({ idea: 'an idea' }), 'discovery');

    // It asked for a DISCOVER result, not the BrandState section.
    assert.ok(DiscoverResultSchema.safeParse(discoverResult).success);
    assert.match(deriver.calls[0]!.userPrompt!, /<idea>/);
    // And what landed in the state is the mapped section.
    assert.deepEqual(state.discovery, toDiscoverySection(discoverResult));
    assert.ok(DiscoverySchema.safeParse(state.discovery).success);
  });

  it('does not leave the working fields in the state', async () => {
    const { runStep } = await import('../src/steps.ts');
    const { createInitialState } = await import('../src/state.ts');

    const { state } = await runStep(
      new StubDeriver(),
      createInitialState({ idea: 'an idea' }),
      'discovery',
    );

    assert.deepEqual(Object.keys(state.discovery).sort(), [
      'assumptions',
      'constraints',
      'goals',
      'openQuestions',
      'problem',
      'targetAudience',
      'userNeed',
    ]);
  });
});

describe('DiscoverySchema after the sparse-output change', () => {
  it('accepts a section with no goals, since DISCOVER may find none', () => {
    const sparse = {
      problem: 'a problem',
      targetAudience: 'an audience',
      userNeed: 'a need',
      goals: [],
      constraints: [],
      assumptions: [],
      openQuestions: [],
    };
    assert.ok(DiscoverySchema.safeParse(sparse).success);
  });

  it('still rejects an empty string inside an array', () => {
    const padded = {
      problem: 'a problem',
      targetAudience: 'an audience',
      userNeed: 'a need',
      goals: [''],
      constraints: [],
      assumptions: [],
      openQuestions: [],
    };
    assert.equal(DiscoverySchema.safeParse(padded).success, false);
    assert.throws(() => DiscoverySchema.parse(padded), z.ZodError);
  });
});
