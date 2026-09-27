/**
 * The orchestrator.
 *
 * Threads one `BrandState` through the steps in order, keeping a snapshot before
 * each one so any point in the pipeline can be inspected, diffed or rolled back.
 */
import { BrandClient, EMPTY_USAGE, addUsage } from './client.ts';
import type { BrandClientOptions, SectionDeriver, Usage } from './client.ts';
import {
  SECTION_ORDER,
  cloneState,
  createInitialState,
  isSectionPopulated,
  nextSection,
} from './state.ts';
import { STEPS, runStep } from './steps.ts';
import type { BrandState, BrandStateSection, Project } from './types.ts';

/** The state as it stood before a given step ran. */
export type Snapshot = {
  /** The step that was about to run. */
  section: BrandStateSection;
  state: BrandState;
};

export type StepRecord = {
  section: BrandStateSection;
  label: string;
  usage: Usage;
  durationMs: number;
  /** Set when the step was skipped because the section was already populated. */
  skipped?: true;
};

export type PipelineResult = {
  state: BrandState;
  /** One entry per step, in the order they ran. */
  steps: StepRecord[];
  /** Snapshots taken before each step, oldest first. */
  snapshots: Snapshot[];
  usage: Usage;
};

export type PipelineEvents = {
  onStepStart?(section: BrandStateSection, label: string): void;
  onStepFinish?(record: StepRecord, state: BrandState): void;
  /** Called when a step throws. Return `true` to continue with the remaining steps. */
  onStepError?(section: BrandStateSection, error: unknown): boolean | void;
};

export type RunOptions = PipelineEvents & {
  /** Stop after this section, inclusive. Defaults to running to the end. */
  until?: BrandStateSection;
  /** Sections already populated are skipped rather than re-derived. Defaults to true. */
  resume?: boolean;
};

/**
 * Runs the pipeline over an existing state.
 *
 * With `resume` left on, a state loaded from disk picks up where it stopped —
 * populated sections are not paid for twice.
 */
export async function runPipeline(
  deriver: SectionDeriver,
  initial: BrandState,
  options: RunOptions = {},
): Promise<PipelineResult> {
  const { until, resume = true } = options;
  const sections = until
    ? SECTION_ORDER.slice(0, SECTION_ORDER.indexOf(until) + 1)
    : [...SECTION_ORDER];

  let state = cloneState(initial);
  const steps: StepRecord[] = [];
  const snapshots: Snapshot[] = [];
  let usage = EMPTY_USAGE;

  for (const section of sections) {
    const label = STEPS[section].label;

    if (resume && isSectionPopulated(state, section)) {
      steps.push({ section, label, usage: EMPTY_USAGE, durationMs: 0, skipped: true });
      continue;
    }

    snapshots.push({ section, state: cloneState(state) });
    options.onStepStart?.(section, label);

    const startedAt = Date.now();
    try {
      const result = await runStep(deriver, state, section);
      state = result.state;
      usage = addUsage(usage, result.usage);

      const record: StepRecord = {
        section,
        label,
        usage: result.usage,
        durationMs: Date.now() - startedAt,
      };
      steps.push(record);
      options.onStepFinish?.(record, state);
    } catch (error) {
      const shouldContinue = options.onStepError?.(section, error);
      if (shouldContinue !== true) throw error;
    }
  }

  return { state, steps, snapshots, usage };
}

/** Runs the pipeline from a bare project seed. */
export async function runPipelineFromProject(
  deriver: SectionDeriver,
  project: Project,
  options: RunOptions = {},
): Promise<PipelineResult> {
  return runPipeline(deriver, createInitialState(project), options);
}

/**
 * Convenience entry point: builds a client from `options` and runs to completion.
 * Use `runPipeline` directly when you want to supply your own deriver.
 */
export async function brandFromIdea(
  project: Project,
  options: BrandClientOptions & RunOptions = {},
): Promise<PipelineResult> {
  const { model, effort, maxTokens, client, ...runOptions } = options;
  const deriver = new BrandClient({ model, effort, maxTokens, client });
  return runPipelineFromProject(deriver, project, runOptions);
}

/**
 * Discards a section and everything derived after it, so the pipeline can be
 * re-run from that point. The earlier decisions are left exactly as they were.
 */
export function rollbackTo(state: BrandState, section: BrandStateSection): BrandState {
  const from = SECTION_ORDER.indexOf(section);
  if (from === -1) throw new Error(`Unknown section: ${section}`);

  const fresh = createInitialState(state.project);
  const rolled = cloneState(state);

  for (const later of SECTION_ORDER.slice(from)) {
    if (later === 'selectedStrategy' || later === 'finalBrand') {
      delete rolled[later];
    } else {
      // Reset to the empty default, so the section reads as "not derived yet".
      Object.assign(rolled, { [later]: fresh[later] });
    }
  }

  return rolled;
}

/** Whether every section has been derived. */
export function isComplete(state: BrandState): boolean {
  return nextSection(state) === undefined;
}
