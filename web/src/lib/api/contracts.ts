/**
 * The HTTP contracts for the BRANDOS API.
 *
 * This is the file the frontend imports. Request bodies are validated with these
 * schemas at the route boundary, and the response types are what a page can rely on —
 * so a change here is a change both developers see in their type checker rather than
 * at runtime in a demo.
 *
 * The AI output schemas are not redefined here. They live in the engine
 * (`brandstate`), and these types reference them, so there is exactly one definition
 * of what a DiscoveryState or a PositioningState is.
 */
import { z } from 'zod';
import type {
  BrandDna,
  BrandState,
  Direction,
  Discovery,
  DiscoverResult,
  PositionResponse,
  SelectedStrategy,
  StrategyOption,
  StressSummary,
  StressTest,
  TestReport,
  TestType,
  VisualDirection,
} from 'brandstate';

/** Every stage a project can be at. Mirrors the Prisma `ProjectStatus` enum. */
export const PROJECT_STATUSES = [
  'DISCOVERY',
  'POSITIONING',
  'STRATEGY',
  'STRESS_TEST',
  'COMPLETE',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** A project as the API returns it. */
export type ProjectSummary = {
  id: string;
  name: string;
  originalIdea: string;
  productType?: string;
  goal?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------ *
 * POST /api/projects
 * ------------------------------------------------------------------ */

export const CreateProjectBody = z
  .object({
    idea: z
      .string()
      .trim()
      .min(10, 'An idea needs at least a sentence — a few words cannot be branded.')
      .max(5000, 'That is longer than an idea; paste the essentials instead.'),
    name: z.string().trim().min(1).max(120).optional(),
    productType: z.string().trim().max(200).optional(),
    goal: z.string().trim().max(1000).optional(),
  })
  .strict();

export type CreateProjectRequest = z.infer<typeof CreateProjectBody>;

export type CreateProjectResponse = {
  project: ProjectSummary;
  brandState: BrandState;
};

/* ------------------------------------------------------------------ *
 * GET /api/projects/:id
 * ------------------------------------------------------------------ */

export type GetProjectResponse = {
  project: ProjectSummary;
  brandState: BrandState;
};

/* ------------------------------------------------------------------ *
 * POST /api/projects/:id/discovery
 * ------------------------------------------------------------------ */

/**
 * Answers to the previous call's questions.
 *
 * Three shapes are accepted because three are natural for a UI: free text, a list
 * matching the questions in order, or an explicit question-to-answer map. The map is
 * the least ambiguous and the best choice for a form.
 */
export const DiscoveryAnswers = z.union([
  z.string(),
  z.array(z.string()),
  z.record(z.string(), z.string()),
]);

export const RunDiscoveryBody = z
  .object({
    /** Omitted on the first call; the project's stored idea is used. */
    idea: z.string().trim().min(1).optional(),
    answers: DiscoveryAnswers.optional(),
  })
  .strict();

export type RunDiscoveryRequest = z.infer<typeof RunDiscoveryBody>;

export type RunDiscoveryResponse = {
  /** The working object, with the gaps and the questions still on it. */
  discovery: DiscoverResult;
  /** True when nothing is outstanding and positioning may run. */
  sufficient: boolean;
  /** `discovery` mapped onto the shape the state stores. */
  discoveryState: Discovery;
  project: ProjectSummary;
};

/* ------------------------------------------------------------------ *
 * POST /api/projects/:id/position
 * ------------------------------------------------------------------ */

export const RunPositionBody = z
  .object({
    knownCompetitors: z.array(z.string().trim().min(1)).max(20).optional(),
    /** Position anyway despite unresolved discovery questions. */
    forceProceed: z.boolean().optional(),
    /** Also return the angles considered and passed over. */
    includeAlternatives: z.boolean().optional(),
  })
  .strict();

export type RunPositionRequest = z.infer<typeof RunPositionBody>;

export type RunPositionResponse = {
  positioning: PositionResponse;
  project: ProjectSummary;
};

/* ------------------------------------------------------------------ *
 * POST /api/projects/:id/battle
 * ------------------------------------------------------------------ */

export const RunBattleBody = z
  .object({
    /**
     * Regenerate over an existing battle.
     *
     * Required once a direction has been selected: replacing the options would orphan
     * that choice, so it has to be an explicit act rather than a side effect. The
     * selection is cleared and reported back in `clearedSelection`.
     */
    regenerate: z.boolean().optional(),
    /** Force the archetypes instead of letting them be chosen for maximum spread. */
    directions: z.array(z.string().trim().min(1)).length(3).optional(),
  })
  .strict();

export type RunBattleRequest = z.infer<typeof RunBattleBody>;

export type RunBattleResponse = {
  /** Exactly three, in the order the archetypes were assigned. Nothing is ranked. */
  directions: StrategyOption[];
  /** Set when a regenerate discarded a previous selection. */
  clearedSelection?: SelectedStrategy;
  project: ProjectSummary;
};

/* ------------------------------------------------------------------ *
 * POST /api/projects/:id/strategy
 * ------------------------------------------------------------------ */

export const SelectStrategyBody = z
  .object({
    /** One of the `direction` values from the battle. Case-insensitive. */
    direction: z.string().trim().min(1),
    /** Why this one, if the user gave a reason. Shown in the Brand OS. */
    reasonChosen: z.string().trim().max(2000).optional(),
  })
  .strict();

export type SelectStrategyRequest = z.infer<typeof SelectStrategyBody>;

export type SelectStrategyResponse = {
  /** The pointer that was stored. */
  selectedStrategy: SelectedStrategy;
  /** The chosen direction in full, resolved from `strategyOptions`. */
  strategy: StrategyOption;
  project: ProjectSummary;
};

/** Re-exported so the frontend can type a direction without importing the engine. */
export type { Direction, StrategyOption, SelectedStrategy };

/* ------------------------------------------------------------------ *
 * POST /api/projects/:id/visualize
 * ------------------------------------------------------------------ */

export const RunVisualizeBody = z
  .object({
    /** Re-run over an existing visual direction. Required once one exists. */
    regenerate: z.boolean().optional(),
  })
  .strict();

export type RunVisualizeRequest = z.infer<typeof RunVisualizeBody>;

export type RunVisualizeResponse = {
  visualDirection: VisualDirection;
  project: ProjectSummary;
};

/* ------------------------------------------------------------------ *
 * POST /api/projects/:id/stress-test
 * ------------------------------------------------------------------ */

/** The five tests. Mirrors the engine's `TEST_TYPES`. */
export const TEST_TYPE_NAMES = [
  'cliché',
  'audienceMismatch',
  'differentiation',
  'contradiction',
  'messaging',
] as const;

/**
 * A test-type name, accepted in either Unicode normalisation.
 *
 * `cliché` is the one name with a non-ASCII character, and it has two valid encodings:
 * precomposed `é` (U+00E9) and decomposed `e` + combining acute. A client on macOS can
 * easily send the second, and without this the rejection reads "expected one of cliché…"
 * against an input that looks identical — which is impossible to debug from the message.
 */
const TestTypeName = z
  .string()
  .transform((value) => value.normalize('NFC'))
  .pipe(z.enum(TEST_TYPE_NAMES));

export const RunStressTestBody = z
  .object({
    /**
     * Restrict to specific tests, for a cheap re-check after one edit.
     *
     * A scoped run replaces only the findings for the types it covered, so decisions
     * already recorded against the other types survive.
     */
    scope: z.array(TestTypeName).min(1).optional(),
  })
  .strict();

export type RunStressTestRequest = z.infer<typeof RunStressTestBody>;

export type RunStressTestResponse = {
  /** Every finding, each with all seven fields. Empty is a good result. */
  tests: StressTest[];
  /** Counts by severity and by status, plus the finalization gate. */
  summary: StressSummary;
  /** One entry per test run, stating explicitly whether it found anything. */
  reports: TestReport[];
  /** The findings still open at critical or high, which block finalization. */
  blocking: StressTest[];
  project: ProjectSummary;
};

/* ------------------------------------------------------------------ *
 * GET /api/projects/:id/dna
 * ------------------------------------------------------------------ */

export type GetBrandDnaResponse = {
  /** Derived from the state on every read, never stored, so it cannot go stale. */
  dna: BrandDna;
  /** The still-open fields, with why, for the "what is left" panel. */
  gaps: Array<{ field: string; reason: string }>;
  complete: boolean;
  project: ProjectSummary;
};

/** Re-exported so the frontend types these without importing the engine. */
export type { BrandDna, VisualDirection, StressTest, StressSummary, TestReport, TestType };

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/**
 * Every failure uses this shape, so the frontend has one thing to render.
 *
 * `code` is for branching, `error` is for showing, and `details` carries whatever the
 * specific failure can offer — the unresolved questions for a premature position, the
 * field paths for a validation failure.
 */
export type ApiErrorBody = {
  error: string;
  code: ApiErrorCode;
  details?: unknown;
  /** True when retrying the same request could plausibly succeed. */
  retryable?: boolean;
};

export const API_ERROR_CODES = [
  'invalid_request',
  'not_found',
  'method_not_allowed',
  'discovery_incomplete',
  'positioning_not_ready',
  'battle_not_run',
  'stress_test_not_ready',
  'findings_unauditable',
  'strategy_not_selected',
  'visual_would_be_orphaned',
  'selection_would_be_orphaned',
  'directions_not_distinct',
  'model_refused',
  'model_output_invalid',
  'model_schema_invalid',
  'model_key_invalid',
  'model_timeout',
  'model_unavailable',
  'upstream_unavailable',
  'database_unavailable',
  'database_not_migrated',
  'internal_error',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
