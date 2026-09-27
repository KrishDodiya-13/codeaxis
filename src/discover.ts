/**
 * The DISCOVER step: `POST /api/discover`.
 *
 * Takes a raw, often one-line idea and turns it into a structured problem
 * statement — without jumping ahead to positioning, naming or visual direction.
 * The rule this phase exists to enforce is that the model should not immediately
 * generate a brand; it should identify what it still needs to know.
 *
 * Called more than once per project in practice: the first call returns gaps and
 * questions, the user answers some, and a later call merges the answers in and
 * shrinks the gap list. `discovery` is only considered complete when nothing is
 * missing, or when the user chooses to proceed anyway.
 */
import type { DeriveOptions, SectionDeriver, Usage } from './client.ts';
import { buildDiscoverPrompt, buildRediscoverPrompt } from './prompts.ts';
import { DiscoverResultSchema } from './schemas.ts';
import { stableStringify } from './state.ts';
import type { Discovery } from './types.ts';
import type { z } from 'zod';

export type DiscoverResult = z.infer<typeof DiscoverResultSchema>;

/**
 * Answers to the previous call's `followUpQuestions`.
 *
 * Three forms are accepted because three are natural: free text, a list
 * positionally matching the questions asked, or an explicit question-to-answer
 * map. The map is the least ambiguous and the best choice for a UI layer.
 */
export type DiscoverAnswers = string | string[] | Record<string, string>;

export type DiscoverRequest = {
  /** The raw idea. Free text — a sentence, a paragraph, or a rough brain dump. */
  idea: string;
  /**
   * The discovery object from a previous call. Supplying it makes this a
   * refinement of that object rather than a fresh start.
   */
  priorDiscovery?: DiscoverResult;
  /** What the user said in reply to the previous call's questions. */
  answers?: DiscoverAnswers;
};

/** Thrown when a request is not a usable DISCOVER request. */
export class DiscoverInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscoverInputError';
  }
}

/**
 * Renders answers as text for the prompt.
 *
 * A positional list is paired back up with the questions that produced it, so
 * the model sees which answer belongs to which question instead of an unlabelled
 * list it has to guess the order of.
 */
export function formatAnswers(answers: DiscoverAnswers, priorQuestions: string[] = []): string {
  if (typeof answers === 'string') return answers.trim();

  if (Array.isArray(answers)) {
    return answers
      .map((answer, index) => {
        const question = priorQuestions[index];
        return question === undefined ? `- ${answer}` : `- Q: ${question}\n  A: ${answer}`;
      })
      .join('\n');
  }

  return Object.entries(answers)
    .map(([question, answer]) => `- Q: ${question}\n  A: ${answer}`)
    .join('\n');
}

/** Whether any answer content was actually supplied. */
function hasAnswers(answers: DiscoverAnswers | undefined): boolean {
  if (answers === undefined) return false;
  if (typeof answers === 'string') return answers.trim() !== '';
  if (Array.isArray(answers)) return answers.some((answer) => answer.trim() !== '');
  return Object.values(answers).some((answer) => answer.trim() !== '');
}

/** Validates a request, throwing `DiscoverInputError` with a usable message. */
export function validateDiscoverRequest(value: unknown): DiscoverRequest {
  if (value === null || typeof value !== 'object') {
    throw new DiscoverInputError('The request body must be a JSON object.');
  }

  const body = value as Record<string, unknown>;
  if (typeof body.idea !== 'string' || body.idea.trim() === '') {
    throw new DiscoverInputError('"idea" is required and must be a non-empty string.');
  }

  const request: DiscoverRequest = { idea: body.idea.trim() };

  // Accept the prior object under either name: `discovery` is what the spec's
  // re-invocation section calls it, `priorDiscovery` is what this module calls it.
  const prior = body.priorDiscovery ?? body.discovery;
  if (prior !== undefined) {
    const parsed = DiscoverResultSchema.safeParse(prior);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      throw new DiscoverInputError(`"discovery" is not a valid discovery object: ${detail}`);
    }
    request.priorDiscovery = parsed.data;
  }

  if (body.answers !== undefined) {
    if (!isAnswers(body.answers)) {
      throw new DiscoverInputError(
        '"answers" must be a string, an array of strings, or an object mapping questions to answers.',
      );
    }
    request.answers = body.answers;
  }

  if (request.answers !== undefined && request.priorDiscovery === undefined) {
    throw new DiscoverInputError(
      '"answers" only makes sense alongside the "discovery" object they answer. Send both, or neither.',
    );
  }

  return request;
}

function isAnswers(value: unknown): value is DiscoverAnswers {
  if (typeof value === 'string') return true;
  if (Array.isArray(value)) return value.every((entry) => typeof entry === 'string');
  if (value !== null && typeof value === 'object') {
    return Object.values(value).every((entry) => typeof entry === 'string');
  }
  return false;
}

/**
 * Runs DISCOVER.
 *
 * Takes the same `SectionDeriver` the pipeline steps take, so a test can drive
 * it without an API key.
 */
export async function discover(
  deriver: SectionDeriver,
  request: DiscoverRequest,
): Promise<{ value: DiscoverResult; usage: Usage }> {
  const { idea, priorDiscovery, answers } = request;

  // A prior object with no new answers is a re-run, not a refinement — there is
  // nothing to merge, so it starts from the idea again.
  const isRefinement = priorDiscovery !== undefined && hasAnswers(answers);

  const userPrompt = isRefinement
    ? buildRediscoverPrompt(
        idea,
        stableStringify(priorDiscovery, 2),
        formatAnswers(answers!, priorDiscovery.followUpQuestions),
      )
    : buildDiscoverPrompt(idea);

  const options: DeriveOptions = { userPrompt };
  return deriver.deriveSection('discovery', '', DiscoverResultSchema, options);
}

/**
 * Whether discovery has nothing left outstanding.
 *
 * The pipeline should only hand `discovery` to positioning when this is true, or
 * when the user has explicitly chosen to proceed with what they have.
 */
export function isDiscoverySufficient(result: DiscoverResult): boolean {
  return result.missingInformation.length === 0;
}

/**
 * Maps a DISCOVER result onto `BrandState.discovery`.
 *
 * `missingInformation` and `followUpQuestions` are working fields for the
 * discovery conversation, not part of `BrandState`. Whatever is still unresolved
 * when the user moves on lands in `openQuestions`, so a later phase — or a human
 * reviewer — can see what went unanswered instead of it being silently dropped.
 */
export function toDiscoverySection(result: DiscoverResult): Discovery {
  return {
    problem: result.problem,
    targetAudience: result.targetAudience,
    userNeed: result.userNeed,
    goals: [...result.goals],
    constraints: [...result.constraints],
    assumptions: [...result.assumptions],
    openQuestions: mergeOpenQuestions(result),
  };
}

/**
 * The unresolved gaps, as questions where a question exists for them.
 *
 * The two lists are parallel by convention rather than by guarantee — the spec
 * pairs them "roughly" — so this prefers the question at the matching index and
 * falls back to the gap itself, then adds any question with no gap beside it.
 * Nothing outstanding is lost either way.
 */
function mergeOpenQuestions(result: DiscoverResult): string[] {
  const { missingInformation, followUpQuestions } = result;

  const questions = missingInformation.map(
    (gap, index) => followUpQuestions[index] ?? gap,
  );

  const extras = followUpQuestions.slice(missingInformation.length);
  return [...questions, ...extras];
}
