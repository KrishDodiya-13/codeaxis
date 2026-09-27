/** Public entry point. */
export type {
  BrandState,
  BrandStateSection,
  Consistency,
  Discovery,
  FinalBrand,
  MessagingHierarchy,
  NameCandidate,
  Naming,
  Positioning,
  Project,
  SectionValue,
  SelectedStrategy,
  Personality,
  StrategyOption,
  StressTest,
  TestReport,
  TestType,
  TypeEvaluation,
  EvaluationStatus,
  DecisionName,
  Severity,
  FindingStatus,
  Confidence,
  Voice,
  VisualDirection,
} from './types.ts';

export { DECISION_NAMES, TEST_TYPES } from './types.ts';

export {
  BrandStateFileSchema,
  BrandStateSchema,
  ConsistencySchema,
  DiscoverResultSchema,
  DiscoverySchema,
  PositionResponseSchema,
  PositionResultSchema,
  FinalBrandSchema,
  PositioningSchema,
  SelectedStrategySchema,
  PersonalitySchema,
  NamingSchema,
  VoiceSchema,
  MessagingHierarchySchema,
  NameCandidateSchema,
  FinalBrandDraftSchema,
  BrandOsDraftSchema,
  BrandOsSchema,
  SCHEMA_VERSION,
  StrategyOptionSchema,
  BattleResultSchema,
  StressTestResultSchema,
  StressTestFindingSchema,
  StressTestSchema,
  TypeEvaluationSchema,
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
  hasDanglingSelection,
  isSectionPopulated,
  nextSection,
  resolveSelectedStrategy,
  populatedSections,
  serializeForPrompt,
  stableStringify,
  validateState,
} from './state.ts';
export type { SectionDiff, ValidationResult } from './state.ts';

export {
  BrandClient,
  CREDENTIAL_ENV_VAR,
  MODEL_ENV_VAR,
  resolveModel,
  DEFAULT_MODEL,
  InvalidCredentialError,
  MissingCredentialError,
  ModelRequestError,
  ModelTimeoutError,
  RefusalError,
  SchemaValidationError,
  SectionParseError,
  addUsage,
  hasCredentialEnv,
  toGroqSchema,
} from './client.ts';
export type { BrandClientOptions, DeriveOptions, Effort, SectionDeriver, Usage } from './client.ts';

export {
  MissingDependencyError,
  MissingSelectionError,
  STEPS,
  StrategySelectionRequiredError,
  missingDependencies,
  runStep,
} from './steps.ts';

export {
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

export {
  DiscoverInputError,
  discover,
  formatAnswers,
  isDiscoverySufficient,
  toDiscoverySection,
  validateDiscoverRequest,
} from './discover.ts';
export type { DiscoverAnswers, DiscoverRequest, DiscoverResult } from './discover.ts';

export {
  DiscoveryIncompleteError,
  PositionInputError,
  VagueCategoryError,
  detectsAudienceNarrowing,
  hashDiscovery,
  isCategoryAllFiller,
  isDiscoveryReadyToPosition,
  isPositioningStale,
  position,
  toPositionResponse,
  toPositioningSection,
  validatePositionRequest,
} from './position.ts';
export type {
  CompetitorLookup,
  PositionOptions,
  PositionRequest,
  PositionResponse,
  PositionResult,
} from './position.ts';

export { parseCompetitorList } from './competitors.ts';

export {
  ARCHETYPES,
  DIRECTIONS,
  InvalidDirectionsError,
  archetypeDistance,
  chooseDirections,
  contentWords,
  isDirection,
  listOverlapRatio,
  minimumSpread,
  normalizeDirections,
  overlapRatio,
} from './archetypes.ts';
export type { Archetype, Direction } from './archetypes.ts';

export {
  BattleInputError,
  DEFAULT_STRATEGY_COUNT,
  DEFAULT_THRESHOLDS,
  IndistinctStrategiesError,
  battle,
  countSentences,
  findDistinctnessIssues,
  resolveDirections,
  selectStrategy,
  toStrategyOption,
  validateBattleRequest,
} from './battle.ts';
export type {
  BattleOptions,
  BattleRequest,
  DistinctnessThresholds,
  StrategyCandidate,
} from './battle.ts';

export {
  BLOCKING_SEVERITIES,
  FinalizationBlockedError,
  StressTestInputError,
  UnauditableFindingsError,
  acknowledgeFinding,
  blockingFindings,
  buildReports,
  canFinalize,
  citesFieldPath,
  findUnauditableFindings,
  missingSections,
  openFindings,
  renderEvaluatedTypes,
  shouldRerunStressTests,
  stressTest,
  summarize,
  validateStressTestRequest,
} from './stress.ts';
export type {
  StressSummary,
  StressTestOptions,
  StressTestRequest,
  StressTestResponse,
} from './stress.ts';

export { createDiscoverServer, listen } from './server.ts';
export type { ServerOptions } from './server.ts';

export {
  BrandOsInputError,
  IncompleteBrandOsError,
  IncompleteBrandStateError,
  assembleBrandOs,
  assessReadiness,
  compileBrandOs,
  findEmptyFields,
  findMissingForCompile,
  summarizeFindings,
  validateBrandOsRequest,
} from './brandos.ts';
export type {
  BrandOs,
  BrandOsDraft,
  BrandOsOptions,
  BrandOsRequest,
  BrandOsResponse,
  ReadinessCheck,
  RolloutMilestone,
} from './brandos.ts';

export { buildBrandDna, describeGaps, isBrandDnaComplete } from './dna.ts';
export type { BrandDna, DnaField, Decided, Undecided } from './dna.ts';

export { migrateState, needsMigration } from './migrate.ts';
export type { MigrationResult } from './migrate.ts';

export {
  InvalidRunFileError,
  loadState,
  loadStateWithMigration,
  saveState,
} from './store.ts';
export { renderMarkdown } from './report.ts';
