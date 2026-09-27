/**
 * Reading and writing a run to disk.
 *
 * A run is one JSON file holding the state. It is written with sorted keys so
 * that re-saving an unchanged state produces an identical file, which keeps
 * `git diff` on a saved run honest.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ZodError } from 'zod';
import { parseBrandState } from './schemas.ts';
import { stableStringify } from './state.ts';
import type { BrandState } from './types.ts';

/** Thrown when a run file exists but does not hold a valid `BrandState`. */
export class InvalidRunFileError extends Error {
  constructor(path: string, detail: string) {
    super(`${path} is not a valid BrandState: ${detail}`);
    this.name = 'InvalidRunFileError';
  }
}

export async function saveState(path: string, state: BrandState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${stableStringify(state, 2)}\n`, 'utf8');
}

/**
 * Loads and validates a run. A hand-edited file is a normal thing to have, so
 * validation failures name the offending field rather than throwing raw JSON.
 */
export async function loadState(path: string): Promise<BrandState> {
  const raw = await readFile(path, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new InvalidRunFileError(path, `it is not valid JSON (${(error as Error).message}).`);
  }

  try {
    return parseBrandState(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      const detail = error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      throw new InvalidRunFileError(path, detail);
    }
    throw error;
  }
}
