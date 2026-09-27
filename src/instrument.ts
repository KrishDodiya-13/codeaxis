/**
 * Stage timing, recorded server-side.
 *
 * Exists so latency can be understood without benchmarking — every real stage a user
 * runs is a free measurement, so there is never a reason to spend quota generating
 * numbers that ordinary use already produces.
 *
 * ## What is deliberately not recorded
 *
 * No API key, no prompt, no model output. A timing record carries the stage name,
 * durations, token counts and the mode — enough to find a slow stage, and nothing that
 * would put a user's idea or a credential into a log. Token counts are included because
 * they are the cost signal; the text that produced them is not.
 *
 * Mode is recorded on every entry because a mock timing is not an AI latency. Mixing the
 * two would make the pipeline look fast for the wrong reason, so `liveTimings()` exists
 * to ask only for the real ones.
 */
import type { BrandStateSection } from './types.ts';

export type TimingMode = 'live' | 'mock';

export type StageTiming = {
  section: BrandStateSection;
  /** Which deriver produced it. A mock timing is not a measure of AI latency. */
  mode: TimingMode;
  /** ISO 8601, when the request left. */
  requestStart: string;
  /** ISO 8601, when the response was complete. */
  responseComplete: string;
  /** Provider round trip: request sent to response received. */
  modelMs: number;
  /** Zod validation of the response, measured separately. */
  validationMs: number;
  /** Everything the stage cost, including validation and any internal retries. */
  totalMs: number;
  inputTokens: number;
  outputTokens: number;
  /** False when the stage threw. Durations still apply, up to the failure. */
  ok: boolean;
  /** The error's class name only — never its message, which can quote the prompt. */
  errorKind?: string;
};

export type TimingSummary = {
  section: BrandStateSection;
  samples: number;
  minMs: number;
  avgMs: number;
  maxMs: number;
  avgValidationMs: number;
};

/** How many records to keep. Oldest are dropped; this is a window, not a log. */
const MAX_RECORDS = 500;

const records: StageTiming[] = [];

/** Optional extra sink, e.g. to forward into a real observability system. */
let sink: ((timing: StageTiming) => void) | undefined;

/** Registers a sink. Passing undefined removes it. */
export function onTiming(handler: ((timing: StageTiming) => void) | undefined): void {
  sink = handler;
}

/** Records one stage. Never throws: instrumentation must not break a stage. */
export function recordTiming(timing: StageTiming): void {
  records.push(timing);
  while (records.length > MAX_RECORDS) records.shift();

  try {
    sink?.(timing);
  } catch {
    // A failing sink is a reporting problem, not a pipeline problem.
  }
}

/** Every record held, newest last. */
export function timings(): readonly StageTiming[] {
  return records;
}

/** Only the live ones — the only records that measure actual AI latency. */
export function liveTimings(): StageTiming[] {
  return records.filter((timing) => timing.mode === 'live');
}

export function clearTimings(): void {
  records.length = 0;
}

/**
 * Min, average and max per stage.
 *
 * Live-only by default, because a summary that averaged mock and live together would
 * describe neither.
 */
export function summarizeTimings(mode: TimingMode | 'all' = 'live'): TimingSummary[] {
  const scoped = mode === 'all' ? records : records.filter((timing) => timing.mode === mode);

  const bySection = new Map<BrandStateSection, StageTiming[]>();
  for (const timing of scoped) {
    const list = bySection.get(timing.section) ?? [];
    list.push(timing);
    bySection.set(timing.section, list);
  }

  return [...bySection.entries()].map(([section, list]) => {
    const totals = list.map((timing) => timing.totalMs);
    return {
      section,
      samples: list.length,
      minMs: Math.min(...totals),
      maxMs: Math.max(...totals),
      avgMs: +(totals.reduce((sum, ms) => sum + ms, 0) / totals.length).toFixed(1),
      avgValidationMs: +(
        list.reduce((sum, timing) => sum + timing.validationMs, 0) / list.length
      ).toFixed(3),
    };
  });
}
