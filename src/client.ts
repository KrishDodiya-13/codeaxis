/**
 * The Groq call behind every pipeline step.
 *
 * One function does all the model work: it assembles the shared methodology prefix plus
 * the step instructions as a system message, sends the serialized state, and returns a
 * value already validated against the step's Zod schema. Steps therefore contain
 * strategy, not plumbing.
 *
 * Provider note: this integration has been Anthropic and then Gemini. Only this file
 * ever knew that, because every stage goes through `SectionDeriver` — so swapping the
 * provider touches no prompt, schema, route, or frontend. The public surface here
 * (`BrandClient`, `deriveSection`, `DeriveOptions`, `Usage`, `SectionParseError`,
 * `RefusalError`, `Effort`) is unchanged for the same reason.
 */
import Groq from 'groq-sdk';
import { z } from 'zod';
import { METHODOLOGY, STEP_INSTRUCTIONS, buildUserPrompt } from './prompts.ts';
import type { BrandStateSection } from './types.ts';

/**
 * The fallback model, used only when {@link MODEL_ENV_VAR} is not set.
 *
 * `openai/gpt-oss-120b` is a Groq production model that supports both native structured
 * output (`response_format: json_schema`) and a configurable `reasoning_effort`, which
 * is what this pipeline needs — every call wants a schema-valid object, and the harder
 * stages want reasoning depth. Its 131k context comfortably holds the serialized state,
 * and its 65k completion cap is far above anything a section needs.
 *
 * Model availability changes, so this is deliberately only a default: set `GROQ_MODEL`
 * to move off it without touching code.
 */
export const DEFAULT_MODEL = 'openai/gpt-oss-120b';

/** The environment variable holding the key. Server-side only, never `NEXT_PUBLIC_`. */
export const CREDENTIAL_ENV_VAR = 'GROQ_API_KEY';

/** Optional override for {@link DEFAULT_MODEL}. Server-side only. */
export const MODEL_ENV_VAR = 'GROQ_MODEL';

/**
 * The model to call: an explicit argument, then `GROQ_MODEL`, then the default.
 *
 * Every caller resolves through this, so configuring the model in one place configures
 * all of them. A blank or whitespace-only env value is treated as unset rather than
 * passed on as an empty model name.
 */
export function resolveModel(explicit?: string): string {
  if (explicit !== undefined && explicit.trim() !== '') return explicit;
  const fromEnv = (process.env[MODEL_ENV_VAR] ?? '').trim();
  return fromEnv === '' ? DEFAULT_MODEL : fromEnv;
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Effort as a Groq `reasoning_effort`.
 *
 * The pipeline's five-level `Effort` vocabulary is kept so no caller had to change, but
 * gpt-oss models accept only `low | medium | high`, so the top three levels all map to
 * `high`. That is a ceiling, not a silent downgrade: `high` is the most reasoning the
 * model offers, and the stages that ask for `xhigh` or `max` still get it.
 */
const REASONING_EFFORT: Record<Effort, 'low' | 'medium' | 'high'> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'high',
  max: 'high',
};

export type BrandClientOptions = {
  /** Overrides `GROQ_MODEL` and the default. See {@link resolveModel}. */
  model?: string;
  /** Reasoning depth and token spend. Defaults to `high`. */
  effort?: Effort;
  maxTokens?: number;
  /** How long to wait for one call. Defaults to three minutes. */
  timeoutMs?: number;
  /** Pass an existing SDK client to share it, or to inject one in tests. */
  client?: Groq;
};

/** What a call cost, accumulated per run so a pipeline can report its spend. */
export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
};

export const EMPTY_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
};

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  };
}

export type DeriveResult<T> = {
  value: T;
  usage: Usage;
};

export type DeriveOptions = {
  /**
   * Replaces the default "here is the state, derive this section" user turn.
   *
   * DISCOVER uses this: its first call has no state to send, only the raw idea, and a
   * re-invocation sends the prior discovery object plus the user's answers.
   */
  userPrompt?: string;
  /**
   * Replaces the per-section instruction block in the system message.
   *
   * The BRAND OS compile step uses this: it is not a section step, so the instructions
   * for the section it writes to are the wrong ones.
   */
  instructions?: string;
};

/* ------------------------------------------------------------------ *
 * Errors — one per distinguishable failure
 * ------------------------------------------------------------------ */

/** Thrown when the model returns text that is not JSON at all. */
export class SectionParseError extends Error {
  readonly section: BrandStateSection;

  constructor(section: BrandStateSection, message: string) {
    super(`Could not parse the ${section} section: ${message}`);
    this.name = 'SectionParseError';
    this.section = section;
  }
}

/**
 * Thrown when the model returned JSON that the section's schema rejects.
 *
 * Extends `SectionParseError` deliberately: callers that only care "the output was
 * unusable" keep working unchanged, while callers that want to tell a schema failure
 * from unparseable text can check this subtype and read `issues`.
 */
export class SchemaValidationError extends SectionParseError {
  readonly issues: Array<{ path: string; message: string }>;

  constructor(section: BrandStateSection, error: z.ZodError) {
    const issues = error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    super(section, `it did not match the schema (${issues.map((i) => `${i.path}: ${i.message}`).join('; ')})`);
    this.name = 'SchemaValidationError';
    this.issues = issues;
  }
}

/** Thrown when a safety filter blocked the request or the response. */
export class RefusalError extends Error {
  readonly section: BrandStateSection;
  readonly category: string | null | undefined;
  readonly explanation: string | null | undefined;

  constructor(
    section: BrandStateSection,
    category: string | null | undefined,
    explanation: string | null | undefined,
  ) {
    super(
      `The model declined to derive the ${section} section` +
        (category ? ` (reason: ${category})` : '') +
        (explanation ? `: ${explanation}` : '.'),
    );
    this.name = 'RefusalError';
    this.section = section;
    this.category = category;
    this.explanation = explanation;
  }
}

/** Thrown when no credential is configured at all. */
export class MissingCredentialError extends Error {
  constructor() {
    super(
      `No model API key is configured. Set ${CREDENTIAL_ENV_VAR} on the server. ` +
        'It must never be exposed to the browser.',
    );
    this.name = 'MissingCredentialError';
  }
}

/** Thrown when Groq rejected the credential. */
export class InvalidCredentialError extends Error {
  constructor(detail: string) {
    super(`Groq rejected the API key: ${detail}`);
    this.name = 'InvalidCredentialError';
  }
}

/** Thrown when the call did not finish in time. */
export class ModelTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(section: BrandStateSection, timeoutMs: number) {
    super(`The ${section} call did not finish within ${timeoutMs}ms.`);
    this.name = 'ModelTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** Thrown for any other API failure — rate limit, server error, network. */
export class ModelRequestError extends Error {
  readonly status: number | undefined;

  constructor(section: BrandStateSection, detail: string, status?: number) {
    super(`The ${section} call failed${status === undefined ? '' : ` (${status})`}: ${detail}`);
    this.name = 'ModelRequestError';
    this.status = status;
  }
}

/* ------------------------------------------------------------------ *
 * Schema conversion
 * ------------------------------------------------------------------ */

/**
 * JSON Schema keywords Groq's structured outputs accept.
 *
 * Groq documents a subset: primitives, `object`, `array`, `enum`, and `anyOf` unions.
 * Anything outside it is dropped rather than sent, because an unsupported keyword is at
 * best ignored and at worst rejects the whole request. Note what survives — `required`
 * and `additionalProperties` carry through, so the shape reaches the model rather than
 * only being checked afterwards.
 */
const SUPPORTED_KEYWORDS = new Set([
  '$id',
  '$defs',
  '$ref',
  '$anchor',
  'type',
  'title',
  'description',
  'enum',
  'items',
  'anyOf',
  'properties',
  'additionalProperties',
  'required',
]);

/** Recursively drops keywords Groq does not support, e.g. `$schema` and `minLength`. */
function pruneUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(pruneUnsupported);
  if (node === null || typeof node !== 'object') return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (!SUPPORTED_KEYWORDS.has(key)) continue;
    // `properties` is a map of names to schemas, so its keys are field names rather
    // than keywords and must not be filtered.
    out[key] =
      key === 'properties' && value !== null && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([field, sub]) => [
              field,
              pruneUnsupported(sub),
            ]),
          )
        : pruneUnsupported(value);
  }
  return out;
}

/**
 * A Zod schema as a JSON Schema Groq will accept.
 *
 * `reused: 'inline'` keeps repeated sub-schemas expanded in place rather than collapsed
 * into a `$ref`, because a `$ref` sub-schema may carry no sibling keywords — which would
 * silently drop the field descriptions that carry the per-field instructions.
 */
export function toGroqSchema(schema: z.ZodType): unknown {
  return pruneUnsupported(z.toJSONSchema(schema, { io: 'output', reused: 'inline' }));
}

/* ------------------------------------------------------------------ *
 * The client
 * ------------------------------------------------------------------ */

/** True when a credential is present in the environment. */
export function hasCredentialEnv(): boolean {
  return (process.env[CREDENTIAL_ENV_VAR] ?? '').trim() !== '';
}

/** An error's message, followed by its `cause` chain when there is one. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const parts = [error.message];
  let cause: unknown = error.cause;
  // Bounded: a cause chain should be short, and a cycle must not hang the handler.
  for (let depth = 0; cause instanceof Error && depth < 4; depth++) {
    const code = (cause as { code?: unknown }).code;
    parts.push(`${typeof code === 'string' ? `${code}: ` : ''}${cause.message}`);
    cause = cause.cause;
  }
  return parts.join(' <- ');
}

/** Classifies an SDK error into one of the distinguishable failures. */
function classify(section: BrandStateSection, error: unknown, timeoutMs: number): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ModelTimeoutError(section, timeoutMs);
  }
  if (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      error.name === 'APIConnectionTimeoutError')
  ) {
    return new ModelTimeoutError(section, timeoutMs);
  }

  // A transport failure arrives as a bare "Connection error" or "fetch failed", with the
  // real reason — DNS, TLS, a reset connection — only on `cause`. Unwrapping it here is
  // the difference between a diagnosable log line and a useless one.
  const message = describe(error);
  // The SDK surfaces the HTTP status as a field on APIError, and otherwise in the text.
  const status =
    typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : /\b(4\d\d|5\d\d)\b/.exec(message) === null
        ? undefined
        : Number(/\b(4\d\d|5\d\d)\b/.exec(message)![1]);

  if (
    status === 401 ||
    status === 403 ||
    /invalid[_ ]api[_ ]key|API key not valid|invalid authorization/i.test(message)
  ) {
    return new InvalidCredentialError(message);
  }

  return new ModelRequestError(section, message, status);
}

/** Statuses that mean "the model is busy", not "the request is wrong". */
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

/** Total attempts per call, including the first. */
const TRANSIENT_ATTEMPTS = 4;

/** First backoff; doubles per attempt (1s, 2s, 4s). */
const TRANSIENT_BACKOFF_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class BrandClient {
  private readonly client: Groq;
  readonly model: string;
  readonly effort: Effort;
  readonly maxTokens: number;
  readonly timeoutMs: number;

  constructor(options: BrandClientOptions = {}) {
    if (options.client === undefined && !hasCredentialEnv()) {
      // Fails at construction rather than deep inside the first call, so the message
      // names the cause instead of surfacing an SDK error several layers down.
      throw new MissingCredentialError();
    }

    this.client =
      options.client ?? new Groq({ apiKey: (process.env[CREDENTIAL_ENV_VAR] ?? '').trim() });
    this.model = resolveModel(options.model);
    this.effort = options.effort ?? 'high';
    this.maxTokens = options.maxTokens ?? 16000;
    this.timeoutMs = options.timeoutMs ?? 180_000;
  }

  /**
   * Asks the model for one section, validated against `schema`.
   *
   * The system message is the shared methodology block plus the step's own instructions.
   * The structured output is requested natively, so the model is constrained as it
   * generates rather than only checked afterwards — and the result is still validated
   * with the original Zod schema, which enforces the constraints the JSON Schema subset
   * does not (string minimums in particular).
   */
  async deriveSection<T>(
    section: BrandStateSection,
    serializedState: string,
    schema: z.ZodType<T>,
    options: DeriveOptions = {},
  ): Promise<DeriveResult<T>> {
    const completion = await (async () => {
      // Overload and rate-limit responses say "try again", not "this call is wrong", so
      // they are retried with backoff rather than surfaced. Everything else — a bad key,
      // an unknown model, a refusal — fails on the first attempt, because retrying it
      // would only delay the same error.
      let lastError: unknown;
      for (let attempt = 0; attempt < TRANSIENT_ATTEMPTS; attempt++) {
        try {
          return await this.client.chat.completions.create(
            {
              model: this.model,
              messages: [
                {
                  role: 'system',
                  content: `${METHODOLOGY}\n\n${options.instructions ?? STEP_INSTRUCTIONS[section]}`,
                },
                {
                  role: 'user',
                  content: options.userPrompt ?? buildUserPrompt(section, serializedState),
                },
              ],
              response_format: {
                type: 'json_schema',
                json_schema: {
                  name: section,
                  // Best-effort rather than strict: strict mode requires every property
                  // to be listed in `required`, and several sections have genuinely
                  // optional fields (a human-set status, an optional confidence). Zod
                  // stays the authority either way, so a miss is caught and reported
                  // rather than rendered.
                  strict: false,
                  schema: toGroqSchema(schema) as Record<string, unknown>,
                },
              },
              max_completion_tokens: this.maxTokens,
              reasoning_effort: REASONING_EFFORT[this.effort],
            },
            { signal: AbortSignal.timeout(this.timeoutMs) },
          );
        } catch (error) {
          lastError = classify(section, error, this.timeoutMs);
          const retryable =
            lastError instanceof ModelRequestError &&
            lastError.status !== undefined &&
            TRANSIENT_STATUSES.has(lastError.status);
          if (!retryable || attempt === TRANSIENT_ATTEMPTS - 1) throw lastError;
          await sleep(TRANSIENT_BACKOFF_MS * 2 ** attempt);
        }
      }
      throw lastError;
    })();

    const choice = completion.choices?.[0];
    if (choice === undefined) {
      throw new ModelRequestError(section, 'the response contained no choices.');
    }

    // A safety filter can stop the response. The SDK's union does not list
    // `content_filter`, but the OpenAI-compatible API can still return it, so this is
    // widened rather than trusted. `length` is its own diagnosis: the fix is a bigger
    // budget, not a retry.
    const finish: string | undefined = choice.finish_reason;
    if (finish === 'content_filter') {
      throw new RefusalError(section, 'content_filter', undefined);
    }
    if (finish === 'length') {
      throw new SectionParseError(
        section,
        `the response hit the ${this.maxTokens}-token cap and was cut off. Raise maxTokens or lower effort.`,
      );
    }

    const text = choice.message?.content;
    if (text === undefined || text === null || text.trim() === '') {
      throw new SectionParseError(section, 'the response was empty.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new SectionParseError(
        section,
        `the response was not valid JSON (${(error as Error).message}).`,
      );
    }

    // The original Zod schema is still the authority. The model is constrained by the
    // converted schema, but the converted one loses the string minimums, so this is
    // where "not empty" is actually enforced.
    const result = schema.safeParse(parsed);
    if (!result.success) throw new SchemaValidationError(section, result.error);

    const usage = completion.usage;
    return {
      value: result.data,
      usage: {
        inputTokens: usage?.prompt_tokens ?? 0,
        // Reasoning tokens are billed as completion tokens and are already counted here.
        outputTokens: usage?.completion_tokens ?? 0,
        // Groq does not report prompt caching on the completions API.
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
    };
  }
}

/**
 * The interface the steps depend on, so a test can substitute a stub without a key or a
 * network call.
 */
export type SectionDeriver = Pick<BrandClient, 'deriveSection'>;
