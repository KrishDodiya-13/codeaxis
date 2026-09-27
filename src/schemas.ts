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
import { DECISION_NAMES, TEST_TYPES } from './types.ts';

/**
 * The contract version.
 *
 * Bumped on any field rename, type change or removal — those are breaking, and a
 * stored object built against an older version needs `migrateState` before it can be
 * read. See the changelog in docs/brand-dna-contract.md.
 */
export const SCHEMA_VERSION = '1.2.0';
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
/**
 * An object schema that rejects unknown keys.
 *
 * Used for every schema in this file, because both jobs here need it. For model
 * output, a field we did not ask for is either a hallucination or a contract drift,
 * and silently dropping it means never finding out. For a stored state, silently
 * dropping an unrecognised key destroys it on the next save — so an unexpected field
 * is a loud error that calls for a `schemaVersion` bump and a migration, which is
 * what the Phase 6 change-control rule requires.
 *
 * Zod does not apply strictness recursively, so nested objects are wrapped too.
 */
const strictObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

const text = (description?: string) => {
  const base = z.string().min(1);
  return description === undefined ? base : base.describe(description);
};

const severity = () =>
  z.enum(['low', 'medium', 'high']).describe('How much this matters: low, medium, or high.');

export const ProjectSchema = strictObject({
  idea: text('What the user is building, in their own words.'),
  productType: z.string().optional().describe('e.g. "mobile app", "B2B SaaS", "physical product".'),
  goal: z.string().optional().describe('The stated goal for the brand.'),
});

export const DiscoverySchema = strictObject({
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
export const DiscoverResultSchema = strictObject({
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

export const PositioningSchema = strictObject({
  category: text('The category the brand competes in, or the one it creates.'),
  valueProposition: text('The value delivered, in one sentence, without jargon.'),
  differentiator: text('The one thing true of this brand and not of its competitors.'),
  competitiveAngle: text('How the brand attacks the position held by incumbents.'),
  rationale: z.array(text()).min(1).describe('Why this positioning follows from the discovery work.'),
  assumptions: z
    .array(text())
    .describe('What this positioning rests on that the user did not state.'),
  /**
   * How much to trust this positioning.
   *
   * Optional because a state written before schema 1.1.0 never recorded one, and
   * defaulting it would be inventing a confidence nobody assessed.
   */
  confidence: z
    .enum(['low', 'medium', 'high'])
    .describe('Set from the POSITION response, not by the model writing this section.')
    .optional(),
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

const AlternativePositionSchema = strictObject({
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
export const PositionResponseSchema = strictObject({
  category: text(
    'The market category, stated the way a user would categorize it, not as a marketing euphemism. "student team-formation tool", not "collaborative discovery platform".',
  ),
  audience: text(
    'The audience from discovery, sharpened. If you narrow it, that narrowing is a strategic decision and must appear in rationale.',
  ),
  problem: text(
    'The problem from discovery, echoed so this object is self-contained. Do not rewrite it. If positioning reveals the problem needs restating, say so in rationale — that is a signal to loop back to discovery, not to redefine it here.',
  ),
  userNeed: text(
    'The underlying need from discovery, echoed. The problem is the situational pain; this is why anyone cares. Carry it across rather than restating the problem in other words.',
  ),
  positioning: text(
    'The positioning statement in one sentence someone could repeat from memory: for whom, in what category, what value, versus what alternative. Distinct from valueProposition, which is only the value claim.',
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
  assumptions: z
    .array(text())
    .describe(
      'Everything this positioning rests on that the user did not actually state. Each entry names the assumption plainly, so a reader can see which parts would move if it turned out wrong. An empty array is valid only if nothing was inferred, which is rare.',
    ),
  confidence: z
    .enum(['low', 'medium', 'high'])
    .describe(
      'How much to trust this positioning. high = it follows from stated facts with little inference. medium = it rests on reasonable inference. low = discovery was thin, or it rests on assumptions that could easily be wrong. Rate it honestly: a confident-looking position built on guesses is worse than an openly uncertain one. The reason belongs in rationale.',
    ),
  assumptionsUsed: z
    .array(text())
    .describe(
      'The narrower list: only when discovery had unresolved questions and you were told to proceed anyway, one entry per question you had to assume an answer to. These also belong in assumptions.',
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
  categoryCheck:strictObject({
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

export const PersonalitySchema = strictObject({
  traits: z
    .array(text())
    .min(3)
    .max(5)
    .describe(
      'Three to five specific adjectives. Who the brand is, not how it writes. "Innovative", "modern" and "friendly" are filler — a trait that would fit any product in the category is not a trait.',
    ),
  antiTraits: z
    .array(text())
    .min(2)
    .describe(
      'What this brand explicitly is not. Each one should be something a reasonable person might otherwise have assumed, so the exclusion does real work.',
    ),
  values: z
    .array(text())
    .min(2)
    .describe('The principles driving decisions. Each must be able to rule something out.'),
  archetype: text(
    'An optional narrative archetype with a clause saying how it is read here, e.g. "The Coach — pushes you to be better, does not just cheerlead".',
  ).optional(),
  rationale: z
    .array(text())
    .min(1)
    .describe('Why these follow from the chosen strategy and the positioning, citing both.'),
});

export const NameCandidateSchema = strictObject({
  name: text('The candidate name.'),
  territory: text('Which territory it came from. Must be one of the territories listed.'),
  pros: z.array(text()).min(1).describe('What this name does well, specific to this brand.'),
  cons: z
    .array(text())
    .min(1)
    .describe('The real drawback. A candidate with no downside has not been examined.'),
});

export const NamingSchema = strictObject({
  territories: z
    .array(text())
    .min(2)
    .describe(
      'The naming approaches explored, e.g. "descriptive", "evocative", "coined", with a short parenthetical example. Genuinely different approaches, not variations on one.',
    ),
  candidates: z
    .array(NameCandidateSchema)
    .min(2)
    .describe('Candidate names, each tied to one of the territories above.'),
  selectedName: text('The chosen name, which must be one of the candidates.').optional(),
  tagline:strictObject({
      candidates: z.array(text()).min(2).describe('Tagline candidates that carry the positioning.'),
      selected: text('The chosen tagline, which must be one of the candidates.').optional(),
    })
    .describe('The tagline exploration, and the line chosen from it.'),
});

export const MessagingHierarchySchema = strictObject({
  primaryMessage: text('The one thing to say, in one sentence.'),
  supportingMessages: z
    .array(text())
    .min(1)
    .describe('What backs the primary message up, ordered most to least important.'),
});

export const VoiceSchema = strictObject({
  toneAttributes: z
    .array(text())
    .min(2)
    .describe(
      'How the brand sounds. Distinct from personality traits, which are who it is — a brand can be ambitious and still write calmly. Qualified attributes beat bare adjectives: "confident, not arrogant".',
    ),
  writingPrinciples: z
    .array(text())
    .min(2)
    .describe(
      'The rules to follow, at a level a writer can act on: "short sentences", "speak to the deadline, not abstractly".',
    ),
  avoid: z
    .array(text())
    .min(2)
    .describe(
      'What never to write. Name the specific words and constructions this brand must not use, including the clichés it would otherwise reach for.',
    ),
  messagingHierarchy: MessagingHierarchySchema.describe(
    'What the brand says first, and what backs it up.',
  ),
});

export const VisualDirectionSchema = strictObject({
  colors: z
    .array(text())
    .min(2)
    .describe(
      'Named colors with a hex value, a role, and the trait each one carries, e.g. "Ink #12141A — primary text, carries the exacting trait". A palette with no stated reason is decoration.',
    ),
  typography: text(
    'Type direction with concrete typeface suggestions, and what about the chosen voice or personality each one serves. Naming a typeface without saying why is not a direction.',
  ),
  imagery: text(
    'What the imagery shows and how it is treated. "Photography" is not a direction; "unstyled workshop photography, available light, hands in frame" is. Say which trait the treatment expresses.',
  ),
  shapes: text('Shape language: geometry, corner treatment, density, grid behaviour.'),
  composition: text(
    'How the page is arranged: where weight sits, how much whitespace, how dense, what the eye meets first and second. A layout instruction a designer could start from, not an adjective.',
  ),
  visualPersonality: text(
    'How this visual system encodes the personality traits by name. Map them: which decision carries "exacting", which carries "plain-spoken". This is the field that makes the whole direction auditable against the brand, so it must name real traits from the personality section rather than inventing new ones.',
  ),
  mood: text('The feeling the system produces when someone lands on it for the first time.'),
  avoid: z
    .array(text())
    .min(1)
    .describe(
      'The visual choices that would misrepresent this brand specifically. Name the tempting mistake — what a designer would reach for by default here and get wrong — not generic warnings.',
    ),
  rationale: z
    .array(text())
    .min(2)
    .describe(
      'Why this visual direction follows from the approved strategy and personality. Each line must cite what it comes from — a personality trait, the chosen direction, the positioning, an audience fact from discovery. A line that could precede any palette is not a rationale.',
    ),
});

/**
 * One candidate strategy from BRAND BATTLE.
 *
 * The `min(1)` on `risks` is load-bearing rather than cosmetic: a direction with no
 * stated risk is a generation failure, because every strategic bet costs something.
 */
export const StrategyOptionSchema = strictObject({
  direction: z
    .enum(DIRECTIONS)
    .describe('The archetype this strategy is built around. Use the one you were assigned.'),
  name: text(
    'A short title for this direction, three to five words, e.g. "The Verified Insider" or "Ship Before The Deadline". This names the STRATEGY, not the product — do not propose a brand name here, that is a later stage and a different decision.',
  ),
  coreIdea: text(
    'The strategic bet in one sentence: what this direction believes about the customer that the other directions do not. Not a summary of the positioning, and not a benefit statement — the belief the whole direction rests on.',
  ),
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
  tradeoffs: z
    .array(text())
    .min(1)
    .describe(
      'What choosing this direction gives up. Distinct from risks: a risk is what might go wrong, a tradeoff is what you are knowingly sacrificing even when it goes right — an audience you will not reach, a claim you cannot make, a speed you forgo. Every real strategic choice costs something certain.',
    ),
  rationale: z
    .array(text())
    .min(1)
    .describe(
      'Why this direction is a credible fit for this input. Each line must reference something specific in discovery or positioning. Do not cite a market fact, a competitor or a statistic that is not already in the input.',
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

export const BattleResultSchema = strictObject({
  strategies: z
    .array(StrategyCandidateSchema)
    .min(1)
    .describe('One strategy per assigned direction, in the order the directions were given.'),
});

/** A single regenerated strategy, for when one collided with another. */
export const StrategyRegenerationSchema = strictObject({
  strategy: StrategyCandidateSchema,
});

/**
 * The chosen direction — a pointer, not a copy.
 *
 * It references a `strategyOptions` entry by direction rather than duplicating its
 * content, so there is exactly one copy of the chosen strategy detail and no way
 * for the two to drift. `resolveSelectedStrategy` does the lookup.
 */
export const SelectedStrategySchema = strictObject({
  direction: z.enum(DIRECTIONS).describe('Which strategyOptions entry was chosen.'),
  chosenAt: text('When the choice was made, as an ISO 8601 timestamp.'),
  reasonChosen: text('Why this one was picked over the others, if a reason was given.').optional(),
});

/**
 * One stress-test finding.
 *
 * Every field here is doing work that makes the finding auditable rather than a
 * vibe-check: `evidence` names the fields that triggered it, `impact` says what
 * actually breaks, and `recommendation` is something a person can carry out.
 */
export const StressTestSchema = strictObject({
  type: z.enum(TEST_TYPES).describe('Which of the five categories this finding belongs to.'),
  severity: z
    .enum(['low', 'medium', 'high', 'critical'])
    .describe(
      'critical = the brand is unusable as-is. high = serious risk to effectiveness or honesty, fix before finalizing. medium = a real weakness, not launch-blocking alone. low = minor polish. Rate against these, not by how important you want the finding to sound.',
    ),
  issue: text(
    'A specific, named problem. "This could be stronger" is not a finding — say what is wrong.',
  ),
  evidence: text(
    'The exact BrandState field paths that triggered this, e.g. "discovery.targetAudience vs selectedStrategy.audienceFit". Quote the values where it helps. A finding that does not cite fields cannot be checked or fixed, so this is required.',
  ),
  impact: text(
    'What actually goes wrong downstream if this is not fixed. A real consequence, not a restatement of the issue: "first-time users will feel unqualified and churn before posting a profile", not "this is a problem".',
  ),
  recommendation: text(
    'A concrete fix, naming which field to change and roughly how. Not "make the differentiator stronger".',
  ),
  /*
   * Optional on a stored finding, required of a new one.
   *
   * Findings recorded before these fields existed do not have them, and rejecting a whole
   * stored state over that would be worse than reading it. `StressTestFindingSchema`
   * below is what the engine asks the model for, and it requires both.
   */
  alternative: text(
    'A genuinely different way out, not a restatement of the recommendation. If the fix is to soften a claim, the alternative might be to keep the claim and change who it is aimed at. Where there is honestly only one sensible route, say what accepting the finding as-is would cost instead.',
  ).optional(),
  affectedDecision: z
    .enum(DECISION_NAMES)
    .describe(
      'Which single decision this finding bears on, as a Brand DNA node name. Pick the one that would have to change — not everything the issue touches.',
    )
    .optional(),
  status: z
    .enum(['open', 'acknowledged', 'resolved'])
    .describe('Set by a human after the fact, not by you. Leave it out.')
    .optional(),
});

/**
 * What the engine asks the model for: a finding with nothing left out.
 *
 * Every field the contract promises is required here, so a finding that arrives without
 * an alternative or without naming the decision it affects fails validation rather than
 * reaching the caller half-formed.
 */
export const StressTestFindingSchema = StressTestSchema.extend({
  alternative: text(
    'A genuinely different way out, not a restatement of the recommendation. If the fix is to soften a claim, the alternative might be to keep the claim and change who it is aimed at. Where there is honestly only one sensible route, say what accepting the finding as-is would cost instead.',
  ),
  affectedDecision: z
    .enum(DECISION_NAMES)
    .describe(
      'Which single decision this finding bears on, as a Brand DNA node name. Pick the one that would have to change — not everything the issue touches.',
    ),
});

export const TypeEvaluationSchema = strictObject({
  type: z.enum(TEST_TYPES),
  status: z
    .enum(['evaluated', 'partial', 'not-testable'])
    .describe(
      'evaluated = you could run this test properly. partial = you could only run it against some of what it needs. not-testable = the state it depends on is not there yet. Be honest: reporting "evaluated" for a test you could not run gives a false sense of safety.',
    ),
  note: text('Why, when the status is not a plain evaluated. Say what was missing.').optional(),
});

/**
 * What the model returns.
 *
 * The summary is deliberately absent: counts and the finalization gate are computed
 * from the findings in code, so they cannot disagree with the findings they
 * describe.
 */
export const StressTestResultSchema = strictObject({
  tests: z
    .array(StressTestFindingSchema)
    .describe(
      'The findings. An empty array is a valid and good result — it means nothing failed. Do not pad this with manufactured nitpicks to look thorough.',
    ),
  evaluatedTypes: z
    .array(TypeEvaluationSchema)
    .describe('One entry per test type you were asked to run, saying whether you could run it.'),
});

export const ConsistencySchema = strictObject({
  status: z
    .enum(['not-yet-checked', 'consistent', 'issues-found'])
    .describe(
      'consistent only when the sections genuinely agree. issues-found when they do not. Never not-yet-checked: that is the value before a check has run, so returning it would be a contradiction.',
    ),
  lastCheckedAt: text('When the check ran, as an ISO 8601 timestamp. Set by the pipeline; leave it out.').optional(),
  checkedAgainstVersion: text('Set by the pipeline; leave it out.').optional(),
  notes: z
    .array(text())
    .describe(
      'What you found, one entry per observation, each naming the BrandState fields involved. Record what holds together as well as what does not, so a later revision does not break something that was working.',
    )
    .optional(),
});

/**
 * What the lock step asks the model for.
 *
 * Only the two fields that are genuinely new. The name, tagline, personality, voice
 * and visual identity are copied from the branches that own them, so locking cannot
 * quietly rewrite a decision that was already made and stress-tested.
 */
export const FinalBrandDraftSchema = strictObject({
  narrative: text(
    'The elevator pitch in one paragraph: the brand explaining itself to a stranger who has thirty seconds.',
  ),
  applications: z
    .array(text())
    .min(2)
    .describe(
      'Where and how the brand shows up — specific surfaces, with what appears on them, e.g. "landing page hero: primary message plus the tagline".',
    ),
});

/** The locked snapshot as it is stored. Assembled in code, not by the model. */
export const FinalBrandSchema = strictObject({
  name: text(),
  tagline: text(),
  positioningStatement: text(),
  narrative: text(),
  personality: PersonalitySchema,
  voice: VoiceSchema,
  visualIdentity: VisualDirectionSchema,
  applications: z.array(text()).min(2),
  lockedAt: text(),
});

/**
 * A fully derived state, with every content minimum enforced.
 *
 * Use this to check a *finished* run. A run still in progress legitimately has
 * empty scaffolding in the sections it has not reached, so it will not satisfy
 * this — load such a state with `BrandStateFileSchema` and check its content
 * with `validateState`, which only inspects the sections actually derived.
 */
const MetadataSchema = {
  id: text('Stable identifier for this brand project.'),
  schemaVersion: text('The contract version this object was built against.'),
  createdAt: text('ISO 8601.'),
  updatedAt: text('ISO 8601. Bumped on every write.'),
};

export const BrandStateSchema = strictObject({
  ...MetadataSchema,
  project: ProjectSchema,
  discovery: DiscoverySchema,
  positioning: PositioningSchema,
  strategyOptions: z.array(StrategyOptionSchema),
  selectedStrategy: SelectedStrategySchema.optional(),
  personality: PersonalitySchema,
  naming: NamingSchema,
  visualDirection: VisualDirectionSchema,
  voice: VoiceSchema,
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

const LooseMessagingLayerSchema = strictObject({
  level: looseText,
  message: looseText,
  audience: looseText,
});

const LooseVisualDirectionSchema = strictObject({
  colors: looseList,
  typography: looseText,
  imagery: looseText,
  shapes: looseText,
  composition: looseText,
  visualPersonality: looseText,
  mood: looseText,
  avoid: looseList,
  rationale: looseList,
});

export const BrandStateFileSchema = strictObject({
  id: looseText,
  schemaVersion: looseText,
  createdAt: looseText,
  updatedAt: looseText,
  project: strictObject({
    idea: looseText,
    productType: looseText.optional(),
    goal: looseText.optional(),
  }),
  discovery: strictObject({
    problem: looseText,
    targetAudience: looseText,
    userNeed: looseText,
    goals: looseList,
    constraints: looseList,
    assumptions: looseList,
    openQuestions: looseList,
  }),
  positioning: strictObject({
    category: looseText,
    valueProposition: looseText,
    differentiator: looseText,
    competitiveAngle: looseText,
    rationale: looseList,
    assumptions: looseList,
    confidence: looseText.optional(),
    sourceDiscoveryHash: looseText.optional(),
  }),
  strategyOptions: z.array(
    strictObject({
      direction: looseText,
      name: looseText,
      coreIdea: looseText,
      positioning: looseText,
      strengths: looseList,
      risks: looseList,
      tradeoffs: looseList,
      audienceFit: looseText,
      differentiation: looseText,
      rationale: looseList,
    }),
  ),
  selectedStrategy:strictObject({
      direction: looseText,
      chosenAt: looseText,
      reasonChosen: looseText.optional(),
    })
    .optional(),
  personality: strictObject({
    traits: looseList,
    antiTraits: looseList,
    values: looseList,
    archetype: looseText.optional(),
    rationale: looseList,
  }),
  naming: strictObject({
    territories: looseList,
    candidates: z.array(
      strictObject({
        name: looseText,
        territory: looseText,
        pros: looseList,
        cons: looseList,
      }),
    ),
    selectedName: looseText.optional(),
    tagline: strictObject({
      candidates: looseList,
      selected: looseText.optional(),
    }),
  }),
  visualDirection: LooseVisualDirectionSchema,
  voice: strictObject({
    toneAttributes: looseList,
    writingPrinciples: looseList,
    avoid: looseList,
    messagingHierarchy: strictObject({
      primaryMessage: looseText,
      supportingMessages: looseList,
    }),
  }),
  stressTests: z.array(
    strictObject({
      type: looseText,
      severity: looseText,
      issue: looseText,
      evidence: looseText,
      impact: looseText,
      recommendation: looseText,
      alternative: looseText.optional(),
      affectedDecision: looseText.optional(),
      status: looseText.optional(),
    }),
  ),
  consistency: strictObject({
    status: looseText,
    lastCheckedAt: looseText.optional(),
    checkedAgainstVersion: looseText.optional(),
    notes: looseList.optional(),
  }),
  finalBrand:strictObject({
      name: looseText,
      tagline: looseText,
      positioningStatement: looseText,
      narrative: looseText,
      personality: strictObject({
        traits: looseList,
        antiTraits: looseList,
        values: looseList,
        archetype: looseText.optional(),
        rationale: looseList,
      }),
      voice: strictObject({
        toneAttributes: looseList,
        writingPrinciples: looseList,
        avoid: looseList,
        messagingHierarchy: strictObject({
          primaryMessage: looseText,
          supportingMessages: looseList,
        }),
      }),
      visualIdentity: LooseVisualDirectionSchema,
      applications: looseList,
      lockedAt: looseText,
    })
    .optional(),
});


/*
 * The Brand OS — the compiled deliverable.
 *
 * Most of it is a projection of decisions already made and already stress-tested, so
 * those fields are compiled in code rather than asked for again. Only what is
 * genuinely new is generated, which is what `BrandOsDraftSchema` covers: the
 * purpose/mission/vision layer, a logo direction, sample copy, and the launch plan —
 * nothing earlier in the pipeline produced any of those.
 */

export const RolloutMilestoneSchema = strictObject({
  milestone: text('What happens, named as an outcome rather than an activity.'),
  timing: text('When, relative to launch, e.g. "4 weeks before launch", "launch week", "month 2".'),
  detail: text('What it involves, concretely enough to plan against.'),
});

export const BrandOsDraftSchema = strictObject({
  purpose: text(
    'Why the brand exists beyond making money, in one sentence. Must follow from the problem in discovery — not a generic mission-statement sentiment that would fit any company.',
  ),
  mission: text('What the brand is doing about that purpose now, in one sentence. Concrete and current.'),
  vision: text(
    'What the world looks like if the brand succeeds, in one sentence. Specific to this category, not "a better future for everyone".',
  ),
  coreSegments: z
    .array(text())
    .min(2)
    .describe(
      'The distinct slices of the audience this serves, drawn from discovery and the chosen strategy. Each must be specific enough to exclude someone, and they should differ from each other in what they need.',
    ),
  nameRationale: text(
    'Why the selected name works, in two or three sentences: the territory it came from, what it carries, and the drawback it was chosen in spite of. Use the pros and cons already recorded against it.',
  ),
  archetype: text(
    'The narrative archetype, with the clause that says how it is read here. Only supply this if the personality branch has none; otherwise repeat the existing one verbatim.',
  ),
  logoDirection: text(
    'The logo concept a designer could act on: what form it takes, what it should evoke, and what to avoid. Not a description of a finished logo — a direction. Must follow from the visual direction and the personality already decided.',
  ),
  sampleCopy:strictObject({
      headline: text(
        'A hero headline written in the brand voice, obeying its writing principles and its avoid list.',
      ),
      boilerplate: text(
        'The standard one-paragraph description of the company, as it would appear at the foot of a press release.',
      ),
    })
    .describe('Copy written in the brand voice, as a worked example for whoever writes the rest.'),
  launch:strictObject({
      goToMarketSummary: text(
        'How this brand reaches its first users, in a short paragraph. Must respect the constraints recorded in discovery — do not propose a paid campaign for a brand whose constraints say it is sold founder-to-founder.',
      ),
      keyChannels: z
        .array(text())
        .min(2)
        .describe(
          'Where the brand shows up to acquire users, each with a clause on why it fits this audience. Not a list of every channel that exists.',
        ),
      rolloutSequence: z
        .array(RolloutMilestoneSchema)
        .min(3)
        .describe('Ordered milestones, earliest first.'),
    })
    .describe('The go-to-market plan. Nothing earlier in the pipeline produced this.'),
});

export const ReadinessCheckSchema = strictObject({
  item: text(),
  passed: z.boolean(),
  detail: text(),
});

export const BrandOsSchema = strictObject({
  strategy: strictObject({
    purpose: text(),
    mission: text(),
    vision: text(),
    targetAudience: text(),
    coreSegments: z.array(text()).min(1),
    positioningStatement: text(),
    competitiveDifferentiation: text(),
  }),
  identity: strictObject({
    name: text(),
    nameRationale: text(),
    coreValues: z.array(text()).min(1),
    personalityTraits: z.array(text()).min(1),
    archetype: text(),
  }),
  visual: strictObject({
    logoDirection: text(),
    colorPalette: z.array(text()).min(1),
    typographySystem: text(),
    imageryStyle: text(),
  }),
  voice: strictObject({
    toneGuidelines: z.array(text()).min(1),
    messagingPillars: z.array(text()).min(1),
    taglines: z.array(text()).min(1),
    sampleCopy: strictObject({ headline: text(), boilerplate: text() }),
  }),
  launch: strictObject({
    goToMarketSummary: text(),
    keyChannels: z.array(text()).min(1),
    rolloutSequence: z.array(RolloutMilestoneSchema).min(1),
  }),
  validation: strictObject({
    stressTestSummary: strictObject({
      critical: z.number(),
      high: z.number(),
      medium: z.number(),
      low: z.number(),
      open: z.number(),
      acknowledged: z.number(),
      resolved: z.number(),
    }),
    risks: z.array(text()),
    openFlags: z.array(text()),
    readiness: strictObject({
      score: z.number(),
      label: z.enum(['ready', 'ready-with-caveats', 'not-ready']),
      checklist: z.array(ReadinessCheckSchema).min(1),
    }),
  }),
});

/** The schema each section validates against, for state-level validation. */
export const sectionSchemas = {
  discovery: DiscoverySchema,
  positioning: PositioningSchema,
  strategyOptions: z.array(StrategyOptionSchema),
  selectedStrategy: SelectedStrategySchema,
  personality: PersonalitySchema,
  naming: NamingSchema,
  visualDirection: VisualDirectionSchema,
  voice: VoiceSchema,
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
