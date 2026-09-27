/**
 * The Gemini call behind every pipeline step.
 *
 * One function does all the model work: it assembles the shared methodology prefix plus
 * the step instructions as a system instruction, sends the serialized state, and returns
 * a value already validated against the step's Zod schema. Steps therefore contain
 * strategy, not plumbing.
 *
 * Provider note: this was an Anthropic integration. Only this file and `competitors.ts`
 * knew that, because every stage goes through `SectionDeriver` — so swapping the provider
 * did not touch a prompt, a schema, a route or the frontend. The public surface here
 * (`BrandClient`, `deriveSection`, `DeriveOptions`, `Usage`, `SectionParseError`,
 * `RefusalError`) is unchanged for the same reason.
 */
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { METHODOLOGY, STEP_INSTRUCTIONS, buildUserPrompt } from './prompts.ts';
import type { BrandStateSection } from './types.ts';

/**
 * The model.
 *
 * Gemini 2.5 Flash: the current fast model that supports both native structured output
 * (`responseJsonSchema`) and a configurable thinking budget, which is what this pipeline
 * needs — every call wants a schema-valid object, and the harder stages want reasoning
 * depth. Flash rather than Pro because the stages are many and each one is a single
 * bounded judgement, so latency and cost matter more than the last increment of quality.
 */
export const DEFAULT_MODEL = 'gemini-3.8-flash';

/** The environment variable holding the key. Server-side only, never `NEXT_PUBLIC_`. */
export const CREDENTIAL_ENV_VAR = 'GEMINI_API_KEY';

/** Optional override for {@link DEFAULT_MODEL}. Server-side only. */
export const MODEL_ENV_VAR = 'GEMINI_MODEL';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Effort as a Gemini thinking budget, in tokens.
 *
 * The pipeline's `Effort` vocabulary is kept so no caller had to change. `low` disables
 * thinking outright, which is right for the mechanical stages; the upper levels buy
 * reasoning for the stages that are actually judgement calls.
 */
const THINKING_BUDGET: Record<Effort, number> = {
  low: 0,
  medium: 2048,
  high: 8192,
  xhigh: 16384,
  max: 24576,
};

export type BrandClientOptions = {
  /** Defaults to `gemini-3.8-flash`. */
  model?: string;
  /** Thinking depth and token spend. Defaults to `high`. */
  effort?: Effort;
  maxTokens?: number;
  /** How long to wait for one call. Defaults to three minutes. */
  timeoutMs?: number;
  /** Pass an existing SDK client to share it, or to inject one in tests. */
  client?: GoogleGenAI;
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
   * Replaces the per-section instruction block in the system instruction.
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

/** Thrown when Gemini rejected the credential. */
export class InvalidCredentialError extends Error {
  constructor(detail: string) {
    super(`Gemini rejected the API key: ${detail}`);
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
 * JSON Schema keywords Gemini's `responseJsonSchema` accepts.
 *
 * Anything else is dropped rather than sent: an unsupported keyword is at best ignored
 * and at worst rejects the whole request. Note what survives — `minItems`, `maxItems`,
 * `required` and `additionalProperties` all carry through, so most of the Zod
 * constraints reach the model rather than only being checked afterwards.
 */
const SUPPORTED_KEYWORDS = new Set([
  '$id',
  '$defs',
  '$ref',
  '$anchor',
  'type',
  'format',
  'title',
  'description',
  'enum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'anyOf',
  'oneOf',
  'properties',
  'additionalProperties',
  'required',
  'propertyOrdering',
]);

/** Recursively drops keywords Gemini does not support, e.g. `$schema` and `minLength`. */
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
 * A Zod schema as a JSON Schema Gemini will accept.
 *
 * `reused: 'inline'` keeps repeated sub-schemas expanded in place. Gemini does support
 * `$ref`, but a `$ref` sub-schema may carry no sibling keywords — which would silently
 * drop the field descriptions that carry the per-field instructions.
 */
export function toGeminiSchema(schema: z.ZodType): unknown {
  return pruneUnsupported(z.toJSONSchema(schema, { io: 'output', reused: 'inline' }));
}

/* ------------------------------------------------------------------ *
 * The client
 * ------------------------------------------------------------------ */

/** Whether a server-side credential is configured. */
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
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new ModelTimeoutError(section, timeoutMs);
  }

  // A transport failure arrives as the bare string "fetch failed", with the real reason
  // — DNS, TLS, a reset connection — only on `cause`. Unwrapping it here is the
  // difference between a diagnosable log line and a useless one.
  const message = describe(error);
  // The SDK surfaces the HTTP status in the message and, on ApiError, as a field.
  const status =
    typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : /\b(4\d\d|5\d\d)\b/.exec(message) === null
        ? undefined
        : Number(/\b(4\d\d|5\d\d)\b/.exec(message)![1]);

  if (status === 401 || status === 403 || /API[_ ]?key not valid|API key expired|invalid api key/i.test(message)) {
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
  private readonly client: GoogleGenAI;
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
      options.client ??
      new GoogleGenAI({ apiKey: (process.env[CREDENTIAL_ENV_VAR] ?? '').trim() });
    // An explicit option wins; then the env override, which exists so a model can be
    // swapped — for a quota limit or a deprecation — without editing code; then the
    // default.
    const fromEnv = (process.env[MODEL_ENV_VAR] ?? '').trim();
    this.model = options.model ?? (fromEnv === '' ? DEFAULT_MODEL : fromEnv);
    this.effort = options.effort ?? 'high';
    this.maxTokens = options.maxTokens ?? 16000;
    this.timeoutMs = options.timeoutMs ?? 180_000;
  }

  /**
   * Asks the model for one section, validated against `schema`.
   *
   * The system instruction is the shared methodology block plus the step's own
   * instructions. The structured output is requested natively, so the model is
   * constrained as it generates rather than only checked afterwards — and the result is
   * still validated with the original Zod schema, which enforces the constraints Gemini
   * does not (string minimums in particular).
   */
  async deriveSection<T>(
    section: BrandStateSection,
    serializedState: string,
    schema: z.ZodType<T>,
    options: DeriveOptions = {},
  ): Promise<DeriveResult<T>> {
    const response = await (async () => {
      // Overload and rate-limit responses say "try again", not "this call is wrong", so
      // they are retried with backoff rather than surfaced. Everything else — a bad key,
      // an unknown model, a refusal — fails on the first attempt, because retrying it
      // would only delay the same error.
      let lastError: unknown;
      for (let attempt = 0; attempt < TRANSIENT_ATTEMPTS; attempt++) {
        try {
          return await this.client.models.generateContent({
            model: this.model,
            contents: options.userPrompt ?? buildUserPrompt(section, serializedState),
            config: {
              systemInstruction: `${METHODOLOGY}\n\n${options.instructions ?? STEP_INSTRUCTIONS[section]}`,
              responseMimeType: 'application/json',
              responseJsonSchema: toGeminiSchema(schema),
              maxOutputTokens: this.maxTokens,
              thinkingConfig: { thinkingBudget: THINKING_BUDGET[this.effort] },
              abortSignal: AbortSignal.timeout(this.timeoutMs),
            },
          });
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

    // A safety filter can block the prompt outright, in which case there are no
    // candidates at all.
    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason !== undefined) {
      throw new RefusalError(section, blockReason, response.promptFeedback?.blockReasonMessage);
    }

    const candidate = response.candidates?.[0];
    if (candidate === undefined) {
      throw new ModelRequestError(section, 'the response contained no candidates.');
    }

    // Or stop the response part-way. MAX_TOKENS is its own diagnosis: the fix is a
    // bigger budget, not a retry.
    if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'PROHIBITED_CONTENT') {
      throw new RefusalError(section, candidate.finishReason, undefined);
    }
    if (candidate.finishReason === 'MAX_TOKENS') {
      throw new SectionParseError(
        section,
        `the response hit the ${this.maxTokens}-token cap and was cut off. Raise maxTokens or lower effort.`,
      );
    }

    const text = response.text;
    if (text === undefined || text.trim() === '') {
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

    // The original Zod schema is still the authority. Gemini is constrained by the
    // converted schema, but the converted one loses the string minimums, so this is
    // where "not empty" is actually enforced.
    const result = schema.safeParse(parsed);
    if (!result.success) throw new SchemaValidationError(section, result.error);

    const usage = response.usageMetadata;
    return {
      value: result.data,
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        // Thinking tokens are billed as output, so they belong in the output count.
        outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
        cacheCreationTokens: 0,
        cacheReadTokens: usage?.cachedContentTokenCount ?? 0,
      },
    };
  }
}

/**
 * The interface the steps depend on, so a test can substitute a stub without a key or a
 * network call.
 */
export type SectionDeriver = Pick<BrandClient, 'deriveSection'>;
