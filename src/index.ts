/** Public entry point. */
export type {
  BrandState,
  BrandStateSection,
  Consistency,
  ConsistencyIssue,
  Discovery,
  FinalBrand,
  MessagingLayer,
  NamingTerritory,
  Positioning,
  Project,
  SectionValue,
  SelectedStrategy,
  Shape,
  StressTest,
  TaglineDirection,
  VisualDirection,
} from './types.ts';

export {
  BrandStateFileSchema,
  BrandStateSchema,
  ConsistencySchema,
  DiscoverySchema,
  FinalBrandSchema,
  PositioningSchema,
  SelectedStrategySchema,
  ShapeSchema,
  StressTestSchema,
  VisualDirectionSchema,
  parseBrandState,
  parseCompleteBrandState,
  sectionSchemas,
} from './schemas.ts';

export {
  SECTION_ORDER,
  applyDelta,
  cloneState,
  createInitialState,
  diffStates,
  isSectionPopulated,
  nextSection,
  populatedSections,
  serializeForPrompt,
  stableStringify,
  validateState,
} from './state.ts';
export type { SectionDiff, ValidationResult } from './state.ts';

export {
  BrandClient,
  DEFAULT_MODEL,
  RefusalError,
  SectionParseError,
  addUsage,
} from './client.ts';
export type { BrandClientOptions, Effort, SectionDeriver, Usage } from './client.ts';

export { MissingDependencyError, STEPS, missingDependencies, runStep } from './steps.ts';

export {
  brandFromIdea,
  isComplete,
  rollbackTo,
  runPipeline,
  runPipelineFromProject,
} from './pipeline.ts';
export type {
  PipelineEvents,
  PipelineResult,
  RunOptions,
  Snapshot,
  StepRecord,
} from './pipeline.ts';

export { InvalidRunFileError, loadState, saveState } from './store.ts';
export { renderMarkdown } from './report.ts';
