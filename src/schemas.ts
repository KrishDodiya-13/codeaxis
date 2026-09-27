/**
 * Zod schemas mirroring `types.ts`.
 *
 * These serve two jobs: they are handed to the API as structured-output formats
 * so a step's response is schema-valid before it ever reaches the state, and
 * they validate any `BrandState` loaded from disk.
 *
 * `.describe()` calls are not decoration — they are carried into the JSON Schema
 * sent to the model, so they are the field-level instructions for each step.
 */
import { z } from 'zod';
import { DIRECTIONS } from './archetypes.ts';
import type { BrandState, BrandStateSection } from './types.ts';

/**
 * A required non-empty string, optionally described.
 *
 * This is a factory rather than a shared constant on purpose. Zod's JSON Schema
 * emitter deduplicates identical schema *instances* into a single `$defs` entry
 * and collapses the per-field descriptions into one — so reusing a single
 * `z.string().min(1)` across fields silently threw away the field guidance
 * before it reached the model. A fresh instance per field keeps it.
 */
const text = (description?: string) => {
  const base = z.string().min(1);
  return description === undefined ? base : base.describe(description);
};

const severity = () =>
  z.enum(['low', 'medium', 'high']).describe('How much this matters: low, medium, or high.');

export const ProjectSchema = z.object({
  idea: text('What the user is building, in their own words.'),
  productType: z.string().optional().describe('e.g. "mobile app", "B2B SaaS", "physical product".'),
  goal: z.string().optional().describe('The stated goal for the brand.'),
});

export const DiscoverySchema = z.object({
  problem: text('The problem the product solves, stated from the user side.'),
  targetAudience: text('Who this is for, specifically enough to exclude someone.'),
  userNeed: text('The underlying need, not the feature that serves it.'),
  // No minimum on any array here: DISCOVER may legitimately return none of
  // these when the idea did not imply them, and padding them with filler is
  // exactly the invention this phase exists to prevent.
  goals: z.array(text()).describe('What success looks like, where stated or narrowly inferable.'),
  constraints: z.array(text()).describe('Real limits: budget, market, regulation, channel, technical.'),
  assumptions: z.array(text()).describe('What was inferred rather than stated, and would change the work if wrong.'),
  openQuestions: z.array(text()).describe('Questions that were never resolved, carried forward rather than dropped.'),
});

/**
 * The DISCOVER endpoint's response.
 *
 * This is the wire contract for `POST /api/discover`, and it is deliberately a
 * different shape from `DiscoverySchema`: `missingInformation` and
 * `followUpQuestions` are working fields for the discovery conversation itself,
 * not part of `BrandState`. `toDiscoverySection` maps one to the other.
 *
 * `assumptions` is an addition to the seven fields in the base spec. The spec
 * leaves tracking the inferred-versus-stated distinction to the implementer, and
 * `BrandState.discovery.assumptions` needs it, so the model is asked for it
 * directly rather than having it guessed at mapping time. It is additive — the
 * seven documented fields are unchanged — so a consumer reading only those is
 * unaffected.
 */
export const DiscoverResultSchema = z.object({
  problem: text(
    'The core problem being solved, restated clearly and specifically — not a paraphrase of the idea. The situational pain point, not the motivation under it.',
  ),
  targetAudience: text(
    'Who this is for, based only on what is stated or directly implied. Say what is uncertain rather than narrowing it on a guess.',
  ),
  userNeed: text(
    'The underlying need or job to be done behind the idea. Distinct from the problem: the problem is the situational pain, this is why anyone cares. Do not collapse the two.',
  ),
  goals: z
    .array(text())
    .describe('What success looks like, if stated or inferable. Return an empty array rather than padding it.'),
  constraints: z
    .array(text())
    .describe(
      'Known limits: platform, budget, timeline, team size, technical, legal. Return an empty array rather than inventing one.',
    ),
  assumptions: z
    .array(text())
    .describe(
      'Anything populated above by inference rather than because the user said it. Each entry names the inference, so a reader can see what rests on a guess.',
    ),
  missingInformation: z
    .array(text())
    .describe(
      'The specific gaps in your understanding. Bias toward more of these, not fewer: a short list here means you are quietly assuming things. For a one-line idea, five to ten gaps is normal.',
    ),
  followUpQuestions: z
    .array(text())
    .describe(
      'One concrete question per gap, roughly, each answerable in a single sentence. Never open-ended prompts like "What is your vision?".',
    ),
});

export const PositioningSchema = z.object({
  category: text('The category the brand competes in, or the one it creates.'),
  valueProposition: text('The value delivered, in one sentence, without jargon.'),
  differentiator: text('The one thing true of this brand and not of its competitors.'),
  competitiveAngle: text('How the brand attacks the position held by incumbents.'),
  rationale: z.array(text()).min(1).describe('Why this positioning follows from the discovery work.'),
  /**
   * The discovery object this positioning was derived from, as a hash.
   *
   * Additive, and the one field of `positioning` that is not strategy: it is
   * what lets a later consistency check tell "generated from the current
   * discovery" from "stale, because discovery was edited underneath it".
   * Optional so a hand-written state stays valid.
   */
  sourceDiscoveryHash: z
    .string()
    .describe('Set by the pipeline, not the model. Leave it out.')
    .optional(),
});

const AlternativePositionSchema = z.object({
  category: text('The category this alternative would have competed in.'),
  whyNotChosen: text('One line on why this angle was passed over, in terms of the discovery input.'),
});

/**
 * The POSITION endpoint's response.
 *
 * Wider than `PositioningSchema` in two ways. `audience` and `problem` are echoed
 * from discovery so a reviewer can audit the positioning object on its own, and
 * are deliberately *not* persisted into `BrandState` — `discovery` stays the
 * single source of truth for both. `alternativePositions` and `assumptionsUsed`
 * are conditional, and documented in `position.ts`.
 */
export const PositionResponseSchema = z.object({
  category: text(
    'The market category, stated the way a user would categorize it, not as a marketing euphemism. "student team-formation tool", not "collaborative discovery platform".',
  ),
  audience: text(
    'The audience from discovery, sharpened. If you narrow it, that narrowing is a strategic decision and must appear in rationale.',
  ),
  problem: text(
    'The problem from discovery, echoed so this object is self-contained. Do not rewrite it. If positioning reveals the problem needs restating, say so in rationale — that is a signal to loop back to discovery, not to redefine it here.',
  ),
  valueProposition: text(
    'One sentence: what this delivers, and to whom. A plain, testable claim that could be argued true or false — not a tagline or a slogan.',
  ),
  differentiator: text(
    'What makes this meaningfully different from the alternatives, including doing nothing, not just from named competitors.',
  ),
  competitiveAngle: text(
    'The strategic angle relative to how people solve this problem today, including improvised alternatives — spreadsheets, group chats, word of mouth. Never claim there are no competitors.',
  ),
  rationale: z
    .array(text())
    .min(1)
    .describe(
      'Why this positioning follows from the discovery input. Each line must tie to something concrete in discovery — a goal, a constraint, the stated need. Reasoning a reviewer can audit, not marketing copy.',
    ),
  // .describe() must come before .optional(): reversed, the description is lost
  // to the same schema deduplication that the text() factory works around.
  alternativePositions: z
    .array(AlternativePositionSchema)
    .describe('Other viable angles considered and passed over. Only when asked for.')
    .optional(),
  assumptionsUsed: z
    .array(text())
    .describe(
      'Only when discovery had unresolved questions and you were told to proceed anyway: one entry per question you had to assume an answer to, naming the assumption.',
    )
    .optional(),
});

/**
 * What the model is actually asked for: the response plus a self-check.
 *
 * The specificity test — "could this category name describe five unrelated
 * products?" — is a semantic judgement, so the model makes it and the code acts
 * on the answer. `categoryCheck` is stripped before the response goes out; it is
 * a working field, like DISCOVER's `missingInformation`.
 */
export const PositionResultSchema = PositionResponseSchema.extend({
  categoryCheck: z
    .object({
      unrelatedProducts: z
        .array(text())
        .describe(
          'Real, unrelated products that the category name you wrote could also plausibly describe. If you can name several, the category is too vague. Be honest here rather than defending your wording.',
        ),
      couldDescribeUnrelatedProducts: z
        .boolean()
        .describe('True if the category name is vague enough to cover unrelated products.'),
    })
    .describe('A check on your own category name. Apply it strictly.'),
});

export const NamingTerritorySchema = z.object({
  name: text('Short label for the territory, e.g. "Craft & Provenance".'),
  rationale: text('The idea the territory is built on.'),
  examples: z.array(text()).min(2).describe('Example names that live inside this territory.'),
});

export const TaglineDirectionSchema = z.object({
  tagline: text(),
  rationale: text('Why this line follows from the positioning.'),
  personalityFit: z.array(text()).describe('Which personality traits the line leans on.'),
});

export const MessagingLayerSchema = z.object({
  level: text('Where this layer is used, e.g. "hero", "subhead", "proof point".'),
  message: text(),
  audience: text('Who this layer is speaking to.'),
});

export const ShapeSchema = z.object({
  personality: z.array(text()).min(3).describe('Traits, as adjectives. Specific beats flattering.'),
  principles: z.array(text()).min(2).describe('Rules the brand holds to, each one able to rule something out.'),
  namingTerritories: z
    .array(NamingTerritorySchema)
    .min(2)
    .describe('Distinct naming directions, not variations on one.'),
  taglineDirections: z.array(TaglineDirectionSchema).min(2),
  messagingHierarchy: z
    .array(MessagingLayerSchema)
    .min(2)
    .describe('Ordered from broadest to most specific.'),
});

export const VisualDirectionSchema = z.object({
  colors: z
    .array(text())
    .min(2)
    .describe('Named colors with hex values and a role, e.g. "Ink #12141A — primary text".'),
  typography: text('Type direction with concrete typeface suggestions.'),
  imagery: text('What imagery shows and how it is treated.'),
  shapes: text('Shape language: geometry, corners, density, grid.'),
  mood: text('The feeling the visual system should produce.'),
  avoid: z.array(text()).min(1).describe('Visual choices that would misrepresent the brand.'),
});

/**
 * One candidate strategy from BRAND BATTLE.
 *
 * The `min(1)` on `risks` is load-bearing rather than cosmetic: a direction with no
 * stated risk is a generation failure, because every strategic bet costs something.
 */
export const StrategyOptionSchema = z.object({
  direction: z
    .enum(DIRECTIONS)
    .describe('The archetype this strategy is built around. Use the one you were assigned.'),
  positioning: text(
    'This strategy version of the positioning statement, in two or three sentences. Same problem and audience, framed through this direction. Do not reuse another strategy wording.',
  ),
  strengths: z
    .array(text())
    .min(1)
    .describe(
      'What this direction genuinely has going for it, tied to the discovery input. Not generic praise: "builds community" is not a strength, it is a restatement of the archetype.',
    ),
  risks: z
    .array(text())
    .min(1)
    .describe(
      'Honest downsides and failure modes of this direction. At least one substantial risk is required — every strategic bet costs something, and a direction with nothing to lose has not been thought through.',
    ),
  audienceFit: text(
    'Which slice of the target audience this resonates with most, and who it resonates with less. Name both. A direction that appeals to everyone equally is not differentiated.',
  ),
  differentiation: text(
    'How this strategy stands apart from competitors and alternatives, seen through this direction specifically.',
  ),
  rationale: z
    .array(text())
    .min(1)
    .describe(
      'Why this direction is a credible fit for this input. Each line must reference something specific in discovery or positioning.',
    ),
});

/**
 * A strategy plus the short canonical fields the distinctness check compares.
 *
 * The prose fields are too long and too varied to compare lexically — two
 * strategies making the same bet in different words would slip through. Asking for
 * the underlying claim and the primary segment as short labels gives the check
 * something it can actually measure. Both are stripped before the response goes out.
 */
export const StrategyCandidateSchema = StrategyOptionSchema.extend({
  uniqueClaim: text(
    'The underlying claim of your differentiation, reduced to one short line of plain words. Not a slogan — the bet itself, e.g. "we verify that members are real students". If another strategy could write the same line, your differentiation is not distinct.',
  ),
  primarySegment: text(
    'The slice of the audience this strategy is primarily for, as a short label of a few words, e.g. "first-time hackathon entrants".',
  ),
});

export const BattleResultSchema = z.object({
  strategies: z
    .array(StrategyCandidateSchema)
    .min(1)
    .describe('One strategy per assigned direction, in the order the directions were given.'),
});

/** A single regenerated strategy, for when one collided with another. */
export const StrategyRegenerationSchema = z.object({
  strategy: StrategyCandidateSchema,
});

/**
 * The chosen direction — a pointer, not a copy.
 *
 * It references a `strategyOptions` entry by direction rather than duplicating its
 * content, so there is exactly one copy of the chosen strategy detail and no way
 * for the two to drift. `resolveSelectedStrategy` does the lookup.
 */
export const SelectedStrategySchema = z.object({
  direction: z.enum(DIRECTIONS).describe('Which strategyOptions entry was chosen.'),
  chosenAt: text('When the choice was made, as an ISO 8601 timestamp.'),
  reasonChosen: text('Why this one was picked over the others, if a reason was given.').optional(),
});

export const StressTestSchema = z.object({
  dimension: text('What was tested, e.g. "misreading", "competitor collision", "scale".'),
  scenario: text('The specific scenario the strategy was put under.'),
  finding: text('What happened when the strategy met the scenario.'),
  severity: severity(),
  recommendation: text('How to resolve or absorb the finding.'),
  passed: z.boolean().describe('Whether the strategy survived this scenario intact.'),
});

export const ConsistencyIssueSchema = z.object({
  sections: z
    .array(text())
    .min(1)
    .describe('The BrandState sections that disagree, e.g. ["shape", "visualDirection"].'),
  conflict: text('The contradiction, stated concretely.'),
  severity: severity(),
  resolution: text('How to reconcile the sections.'),
});

export const ConsistencySchema = z.object({
  coherent: z.boolean().describe('True only if no high-severity issue was found.'),
  issues: z.array(ConsistencyIssueSchema).describe('Empty if the sections agree.'),
  strengths: z.array(text()).describe('What holds together well, so later revisions do not break it.'),
});

export const FinalBrandSchema = z.object({
  name: text(),
  tagline: text(),
  positioningStatement: text(),
  narrative: text('The elevator pitch, one paragraph.'),
  personality: z.array(text()).min(3),
  principles: z.array(text()).min(2),
  voice: z
    .object({
      tone: text('How the brand sounds, in a sentence a writer could act on.'),
      does: z.array(text()).min(2).describe('Words and constructions the brand uses.'),
      donts: z.array(text()).min(2).describe('Words and constructions the brand avoids.'),
    })
    .describe('Concrete writing guidance, at the level of words rather than adjectives.'),
  messaging: z.array(MessagingLayerSchema).min(2).describe('The messaging hierarchy as final copy.'),
  visualIdentity: VisualDirectionSchema.describe(
    'The visual direction as a finished spec, in the same shape as the visualDirection section.',
  ),
  applications: z
    .array(text())
    .min(2)
    .describe('Where and how the brand shows up, e.g. "landing page hero".'),
});

/**
 * Array sections are wrapped in an object: a structured-output format needs an
 * object at its root, so a bare array cannot be requested directly.
 */
export const StressTestsResultSchema = z.object({
  stressTests: z.array(StressTestSchema).min(3).describe('One entry per dimension tested.'),
});

/**
 * A fully derived state, with every content minimum enforced.
 *
 * Use this to check a *finished* run. A run still in progress legitimately has
 * empty scaffolding in the sections it has not reached, so it will not satisfy
 * this — load such a state with `BrandStateFileSchema` and check its content
 * with `validateState`, which only inspects the sections actually derived.
 */
export const BrandStateSchema = z.object({
  project: ProjectSchema,
  discovery: DiscoverySchema,
  positioning: PositioningSchema,
  shape: ShapeSchema,
  visualDirection: VisualDirectionSchema,
  strategyOptions: z.array(StrategyOptionSchema),
  selectedStrategy: SelectedStrategySchema.optional(),
  stressTests: z.array(StressTestSchema),
  consistency: ConsistencySchema,
  finalBrand: FinalBrandSchema.optional(),
});

/*
 * Structural schemas, for reading a run off disk.
 *
 * These carry the same field names and types as the schemas above with the
 * content minimums dropped, because a partially derived run has empty strings
 * and arrays in the sections it has not reached yet. They answer "is this file
 * shaped like a BrandState", not "is this brand any good".
 *
 * Keeping both means they can drift apart, so a test asserts their key sets
 * match for every section.
 */
const looseText = z.string();
const looseList = z.array(z.string());

const LooseMessagingLayerSchema = z.object({
  level: looseText,
  message: looseText,
  audience: looseText,
});

const LooseVisualDirectionSchema = z.object({
  colors: looseList,
  typography: looseText,
  imagery: looseText,
  shapes: looseText,
  mood: looseText,
  avoid: looseList,
});

export const BrandStateFileSchema = z.object({
  project: z.object({
    idea: looseText,
    productType: looseText.optional(),
    goal: looseText.optional(),
  }),
  discovery: z.object({
    problem: looseText,
    targetAudience: looseText,
    userNeed: looseText,
    goals: looseList,
    constraints: looseList,
    assumptions: looseList,
    openQuestions: looseList,
  }),
  positioning: z.object({
    category: looseText,
    valueProposition: looseText,
    differentiator: looseText,
    competitiveAngle: looseText,
    rationale: looseList,
    sourceDiscoveryHash: looseText.optional(),
  }),
  shape: z.object({
    personality: looseList,
    principles: looseList,
    namingTerritories: z.array(
      z.object({ name: looseText, rationale: looseText, examples: looseList }),
    ),
    taglineDirections: z.array(
      z.object({ tagline: looseText, rationale: looseText, personalityFit: looseList }),
    ),
    messagingHierarchy: z.array(LooseMessagingLayerSchema),
  }),
  visualDirection: LooseVisualDirectionSchema,
  strategyOptions: z.array(
    z.object({
      direction: looseText,
      positioning: looseText,
      strengths: looseList,
      risks: looseList,
      audienceFit: looseText,
      differentiation: looseText,
      rationale: looseList,
    }),
  ),
  selectedStrategy: z
    .object({
      direction: looseText,
      chosenAt: looseText,
      reasonChosen: looseText.optional(),
    })
    .optional(),
  stressTests: z.array(
    z.object({
      dimension: looseText,
      scenario: looseText,
      finding: looseText,
      severity: severity(),
      recommendation: looseText,
      passed: z.boolean(),
    }),
  ),
  consistency: z.object({
    coherent: z.boolean(),
    issues: z.array(
      z.object({
        sections: looseList,
        conflict: looseText,
        severity: severity(),
        resolution: looseText,
      }),
    ),
    strengths: looseList,
  }),
  finalBrand: z
    .object({
      name: looseText,
      tagline: looseText,
      positioningStatement: looseText,
      narrative: looseText,
      personality: looseList,
      principles: looseList,
      voice: z.object({ tone: looseText, does: looseList, donts: looseList }),
      messaging: z.array(LooseMessagingLayerSchema),
      visualIdentity: LooseVisualDirectionSchema,
      applications: looseList,
    })
    .optional(),
});

/** The schema each section validates against, for state-level validation. */
export const sectionSchemas = {
  discovery: DiscoverySchema,
  positioning: PositioningSchema,
  shape: ShapeSchema,
  visualDirection: VisualDirectionSchema,
  strategyOptions: z.array(StrategyOptionSchema),
  selectedStrategy: SelectedStrategySchema,
  stressTests: z.array(StressTestSchema),
  consistency: ConsistencySchema,
  finalBrand: FinalBrandSchema,
} as const satisfies Record<BrandStateSection, z.ZodType>;

/**
 * Parses an unknown value as a `BrandState`, throwing a `ZodError` if it is not
 * shaped like one. Used when loading a run from disk, where the file may be
 * hand-edited, so it checks structure and leaves content to `validateState`.
 */
export function parseBrandState(value: unknown): BrandState {
  return BrandStateFileSchema.parse(value) as BrandState;
}

/**
 * Parses an unknown value as a *complete* `BrandState`, enforcing every content
 * minimum. Throws on a run that is still in progress.
 */
export function parseCompleteBrandState(value: unknown): BrandState {
  return BrandStateSchema.parse(value) as BrandState;
}
