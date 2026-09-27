/**
 * Which deriver the pipeline runs against.
 *
 * One decision, made from the environment, in one place. `live` calls the provider;
 * `mock` serves fixtures and makes no external request at all. The two are never mixed:
 * a live run that fails stays failed, because silently serving fixtures would make a
 * broken integration look like a working one — the most expensive kind of green.
 *
 * `live` is the default. Mock mode has to be asked for, so no deployment can drift into
 * serving fixtures because a variable went missing.
 */
import { BrandClient, CREDENTIAL_ENV_VAR, type BrandClientOptions } from './client.ts';
import type { SectionDeriver } from './client.ts';
import { MockDeriver, type MockDeriverOptions } from './mock/deriver.ts';

export type AiMode = 'live' | 'mock';

/** The environment variable selecting the mode. Server-side only. */
export const AI_MODE_ENV_VAR = 'AI_MODE';

/** Thrown when `AI_MODE` is set to something that is not a mode. */
export class InvalidAiModeError extends Error {
  constructor(value: string) {
    super(
      `${AI_MODE_ENV_VAR}="${value}" is not a mode. Use "live" or "mock". ` +
        'Leaving it unset means live.',
    );
    this.name = 'InvalidAiModeError';
  }
}

/**
 * The configured mode.
 *
 * An unrecognised value throws rather than falling back. A typo like `AI_MODE=moc`
 * silently running live — and spending quota — is exactly the surprise this avoids.
 */
export function resolveAiMode(): AiMode {
  const raw = (process.env[AI_MODE_ENV_VAR] ?? '').trim().toLowerCase();
  if (raw === '') return 'live';
  if (raw === 'live' || raw === 'mock') return raw;
  throw new InvalidAiModeError(raw);
}

export type CreateDeriverOptions = BrandClientOptions &
  MockDeriverOptions & {
    /** Overrides `AI_MODE`, for a caller that needs to be explicit. */
    mode?: AiMode;
    /** Called once with a one-line description of the mode, for a server log. */
    onMode?: (message: string) => void;
  };

/**
 * Builds the deriver for the configured mode.
 *
 * The mock branch never reads the credential, so mock mode works with no key present at
 * all — which is the point when a quota is spent.
 */
export function createDeriver(options: CreateDeriverOptions = {}): SectionDeriver {
  const mode = options.mode ?? resolveAiMode();

  if (mode === 'mock') {
    // Logged, not rendered: the operator needs to know, and the product must not look
    // like a demo to the person using it.
    options.onMode?.(
      `[brandos] ${AI_MODE_ENV_VAR}=mock — serving deterministic fixtures, no provider ` +
        'requests will be made. Set AI_MODE=live to call the provider.',
    );
    return new MockDeriver(options);
  }

  options.onMode?.(
    `[brandos] ${AI_MODE_ENV_VAR}=live — calling the provider, ` +
      `credential from ${CREDENTIAL_ENV_VAR}.`,
  );
  return new BrandClient(options);
}
