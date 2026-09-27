/**
 * The Claude call behind every pipeline step.
 *
 * One function does all the model work: it assembles the cached methodology
 * prefix plus step instructions, sends the serialized state, and returns a value
 * already validated against the step's Zod schema. Steps therefore contain
 * strategy, not plumbing.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { METHODOLOGY, STEP_INSTRUCTIONS, buildUserPrompt } from './prompts.ts';
import type { BrandStateSection } from './types.ts';

export const DEFAULT_MODEL = 'claude-opus-5';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type BrandClientOptions = {
  /** Defaults to `claude-opus-5`. */
  model?: string;
  /** Thinking depth and token spend. Defaults to `high`. */
  effort?: Effort;
  maxTokens?: number;
  /** Pass an existing SDK client to share it, or to inject one in tests. */
  client?: Anthropic;
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
   * DISCOVER uses this: its first call has no state to send, only the raw idea,
   * and a re-invocation sends the prior discovery object plus the user's
   * answers. The cached system prefix is unaffected either way.
   */
  userPrompt?: string;
};

/** Thrown when the model returns something the step's schema rejects. */
export class SectionParseError extends Error {
  readonly section: BrandStateSection;

  constructor(section: BrandStateSection, message: string) {
    super(`Could not parse the ${section} section: ${message}`);
    this.name = 'SectionParseError';
    this.section = section;
  }
}

/** Thrown when a safety classifier declines the request. */
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
        (category ? ` (category: ${category})` : '') +
        (explanation ? `: ${explanation}` : '.'),
    );
    this.name = 'RefusalError';
    this.section = section;
    this.category = category;
    this.explanation = explanation;
  }
}

export class BrandClient {
  private readonly client: Anthropic;
  readonly model: string;
  readonly effort: Effort;
  readonly maxTokens: number;

  constructor(options: BrandClientOptions = {}) {
    // The zero-argument constructor resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN,
    // or an `ant auth login` profile — so it works without an env var being set.
    this.client = options.client ?? new Anthropic();
    this.model = options.model ?? DEFAULT_MODEL;
    this.effort = options.effort ?? 'high';
    this.maxTokens = options.maxTokens ?? 16000;
  }

  /**
   * Asks the model for one section, validated against `schema`.
   *
   * `system` is ordered so the cacheable prefix comes first: the methodology
   * block is identical on every call and carries the breakpoint, and the
   * step-specific instructions follow it. Whether the prefix actually caches
   * depends on the model's minimum cacheable length — check
   * `usage.cacheReadTokens` across a run rather than assuming.
   */
  async deriveSection<T>(
    section: BrandStateSection,
    serializedState: string,
    schema: z.ZodType<T>,
    options: DeriveOptions = {},
  ): Promise<DeriveResult<T>> {
    const request = {
      model: this.model,
      max_tokens: this.maxTokens,
      system: [
        { type: 'text' as const, text: METHODOLOGY, cache_control: { type: 'ephemeral' as const } },
        { type: 'text' as const, text: STEP_INSTRUCTIONS[section] },
      ],
      messages: [
        {
          role: 'user' as const,
          content: options.userPrompt ?? buildUserPrompt(section, serializedState),
        },
      ],
      thinking: { type: 'adaptive' as const },
      output_config: {
        effort: this.effort,
        format: zodOutputFormat(schema),
      },
    };

    let response: Awaited<ReturnType<typeof this.client.messages.parse<typeof request>>>;
    try {
      response = await this.client.messages.parse(request);
    } catch (error) {
      // The SDK raises a bare AnthropicError when the response body is not
      // valid JSON or fails the schema. APIError also extends AnthropicError,
      // so transport and status failures are excluded and left to propagate.
      if (error instanceof Anthropic.AnthropicError && !(error instanceof Anthropic.APIError)) {
        throw new SectionParseError(section, error.message);
      }
      throw error;
    }

    if (response.stop_reason === 'refusal') {
      throw new RefusalError(
        section,
        response.stop_details?.category,
        response.stop_details?.explanation,
      );
    }

    if (response.stop_reason === 'max_tokens') {
      throw new SectionParseError(
        section,
        `the response hit the ${this.maxTokens}-token cap and was cut off. Raise maxTokens or lower effort.`,
      );
    }

    // parsed_output is null when the response could not be parsed into the schema.
    if (response.parsed_output === null || response.parsed_output === undefined) {
      throw new SectionParseError(section, 'the response did not match the schema.');
    }

    return {
      value: response.parsed_output,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}

/**
 * The interface the steps depend on, so a test can substitute a stub without an
 * API key or a network call.
 */
export type SectionDeriver = Pick<BrandClient, 'deriveSection'>;
