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
import { performance } from 'node:perf_hooks';
import Groq from 'groq-sdk';
import { z } from 'zod';
import { recordTiming } from './instrument.ts';
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

/**
 * Thrown when the account's allowance is spent, rather than momentarily saturated.
 *
 * Kept apart from `ModelRequestError` because the remedy is completely different: a
 * per-minute rate limit clears by waiting seconds, so retrying is right; a daily or
 * monthly quota does not, so retrying only burns time and adds load. Callers can tell
 * the two apart and say something useful instead of "try again".
 */
export class QuotaExceededError extends Error {
  readonly section: BrandStateSection;
  /** When the provider says the allowance resets, if it said.  */
  readonly retryAfter: string | undefined;

  constructor(section: BrandStateSection, detail: string, retryAfter?: string) {
    super(
      `The ${section} call was refused: the model API allowance is exhausted. ${detail}` +
        (retryAfter === undefined ? '' : ` Resets in ${retryAfter}.`),
    );
    this.name = 'QuotaExceededError';
    this.section = section;
    this.retryAfter = retryAfter;
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

/**
 * Whether the message describes an exhausted allowance rather than a momentary limit.
 *
 * Per-minute limits are excluded deliberately: those are the ones worth retrying, and
 * treating them as fatal would make the pipeline give up on a wait of a few seconds.
 */
export function isQuotaExhausted(message: string): boolean {
  if (/tokens per minute|requests per minute|TPM|RPM/i.test(message)) return false;
  return /quota exceeded|tokens per day|requests per day|TPD|RPD|insufficient_quota|billing/i.test(
    message,
  );
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

  // A spent allowance, as opposed to a momentary rate limit. Matched on the provider's
  // own wording — a per-day or per-month budget, or an explicit "quota exceeded" — so it
  // is never retried the way a per-minute limit is.
  if (isQuotaExhausted(message)) {
    const retryAfter = /try again in ([0-9hms.]+)/i.exec(message)?.[1];
    return new QuotaExceededError(section, message, retryAfter);
  }

  return new ModelRequestError(section, message, status);
}

/**
 * Default per-call output cap.
 *
 * Sized for one section, not for the largest conceivable response. Providers count the
 * *requested* completion cap against a per-minute token budget, so an inflated cap makes
 * a request that would have fit be refused as too large before the model writes a word.
 * A section that genuinely needs more can raise it per call.
 */
export const DEFAULT_MAX_TOKENS = 4000;

/** The smallest cap worth retrying at; below this a section cannot complete. */
const MIN_MAX_TOKENS = 1200;

/** Headroom left under a provider's stated limit, for estimate drift. */
const BUDGET_MARGIN_TOKENS = 250;

/**
 * A smaller output cap that should fit, given what the provider said.
 *
 * Providers that refuse a request for size usually say by how much — "Limit 8000,
 * Requested 10978". Subtracting the actual overshoot lands on a cap that fits on the
 * next attempt, where halving blindly tends to overshoot downward and truncate the
 * response instead. Halving is the fallback when the numbers are not in the message.
 */
export function reduceCap(cap: number, message: string): number {
  const limit = /Limit (\d+)/i.exec(message);
  const requested = /Requested (\d+)/i.exec(message);

  if (limit !== null && requested !== null) {
    const overshoot = Number(requested[1]) - Number(limit[1]);
    if (overshoot > 0) {
      return Math.max(MIN_MAX_TOKENS, cap - overshoot - BUDGET_MARGIN_TOKENS);
    }
  }

  return Math.max(MIN_MAX_TOKENS, Math.floor(cap / 2));
}

/**
 * Whether a failure means "this request is too big", as opposed to "it is wrong".
 *
 * Providers express it differently — a 413, or a 429 whose body talks about token size
 * rather than request count — so both are matched.
 */
export function isRequestTooLargeError(error: unknown): boolean {
  if (!(error instanceof ModelRequestError)) return false;
  if (error.status === 413) return true;
  return (
    error.status === 429 &&
    /token|too large|context length|reduce your message/i.test(error.message)
  );
}

/** The largest cap worth trying, so a runaway section cannot spend without bound. */
const MAX_MAX_TOKENS = 12000;

/**
 * Whether a failure means "the answer did not fit in the cap".
 *
 * The provider reports this as a schema failure rather than a size one, because what it
 * actually sees is truncated JSON. Telling it apart from a genuinely malformed response
 * matters: this one is fixed by asking for more room, that one is not.
 */
export function isTruncatedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (/max completion tokens reached|hit the \d+-token cap|was cut off/i.test(error.message)) {
    return true;
  }
  // A schema failure with nothing in `failed_generation` means the model produced no
  // usable text at all, which is the same remedy — more room — rather than a malformed
  // answer that more room would not fix. A non-empty failed_generation is excluded,
  // because that is a genuine schema mismatch.
  return /json_validate_failed/i.test(error.message) && /"failed_generation":\s*""/.test(error.message);
}

/** Statuses that mean "the model is busy", not "the request is wrong". */
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

/** Total attempts per call, including the first. */
const TRANSIENT_ATTEMPTS = 6;

/** How many times the output cap may be adjusted within one call. */
const MAX_CAP_ADJUSTMENTS = 3;

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
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
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
    // Timing is taken here rather than around the call, because validation happens
    // inside this method and the contract asks for it separately.
    const requestStart = new Date();
    const t0 = performance.now();
    let modelMs = 0;
    let validationMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    const emit = (ok: boolean, errorKind?: string) => {
      recordTiming({
        section,
        mode: 'live',
        requestStart: requestStart.toISOString(),
        responseComplete: new Date().toISOString(),
        modelMs: +modelMs.toFixed(1),
        validationMs: +validationMs.toFixed(3),
        totalMs: +(performance.now() - t0).toFixed(1),
        inputTokens,
        outputTokens,
        ok,
        // The class name only. A message can quote the prompt, which must not be logged.
        ...(errorKind === undefined ? {} : { errorKind }),
      });
    };

    try {
      return await this.deriveSectionInner(section, serializedState, schema, options, {
        setModelMs: (ms) => {
          modelMs = ms;
        },
        setValidationMs: (ms) => {
          validationMs = ms;
        },
        setTokens: (input, output) => {
          inputTokens = input;
          outputTokens = output;
        },
        done: () => emit(true),
      });
    } catch (error) {
      emit(false, error instanceof Error ? error.name : 'Unknown');
      throw error;
    }
  }

  /** The call itself. Split out so the public method owns only the measurement. */
  private async deriveSectionInner<T>(
    section: BrandStateSection,
    serializedState: string,
    schema: z.ZodType<T>,
    options: DeriveOptions,
    probe: {
      setModelMs: (ms: number) => void;
      setValidationMs: (ms: number) => void;
      setTokens: (input: number, output: number) => void;
      done: () => void;
    },
  ): Promise<DeriveResult<T>> {
    const modelStart = performance.now();
    const completion = await (async () => {
      // Overload and rate-limit responses say "try again", not "this call is wrong", so
      // they are retried with backoff rather than surfaced. Everything else — a bad key,
      // an unknown model, a refusal — fails on the first attempt, because retrying it
      // would only delay the same error.
      let lastError: unknown;
      // Lowered when the provider refuses the request for size. The requested cap counts
      // against a per-minute budget, so asking for less can make an otherwise identical
      // request fit — which beats failing the stage outright.
      let cap = this.maxTokens;
      // The lowest cap the provider has already refused as too large. Raising is never
      // allowed to reach it, which is what stops a raise/reduce oscillation.
      let refusedAt = Number.POSITIVE_INFINITY;
      let adjustments = 0;
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
              max_completion_tokens: cap,
              reasoning_effort: REASONING_EFFORT[this.effort],
            },
            { signal: AbortSignal.timeout(this.timeoutMs) },
          );
        } catch (error) {
          lastError = classify(section, error, this.timeoutMs);

          // Too large: shrink the requested cap and try again immediately. No backoff —
          // nothing is busy, the ask was simply bigger than the budget allows.
          // Two opposite adjustments, both bounded, so the cap converges on a value
          // that fits the budget and still holds a whole section.
          if (adjustments < MAX_CAP_ADJUSTMENTS) {
            if (isRequestTooLargeError(lastError) && cap > MIN_MAX_TOKENS) {
              const reduced = reduceCap(cap, (lastError as Error).message);
              if (reduced < cap) {
                refusedAt = Math.min(refusedAt, cap);
                cap = reduced;
                adjustments++;
                continue;
              }
            }

            if (isTruncatedError(lastError)) {
              // Doubling, but never up to a cap already known to be refused.
              const ceiling = Math.min(MAX_MAX_TOKENS, refusedAt - BUDGET_MARGIN_TOKENS);
              const raised = Math.min(ceiling, cap * 2);
              if (raised > cap) {
                cap = raised;
                adjustments++;
                continue;
              }
            }
          }

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

    probe.setModelMs(performance.now() - modelStart);

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
    const validationStart = performance.now();
    const result = schema.safeParse(parsed);
    probe.setValidationMs(performance.now() - validationStart);
    if (!result.success) throw new SchemaValidationError(section, result.error);

    const usage = completion.usage;
    probe.setTokens(usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0);
    probe.done();

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
