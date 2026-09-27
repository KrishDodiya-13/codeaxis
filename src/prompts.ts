/**
 * Prompts for the pipeline.
 *
 * Every request is assembled as `[METHODOLOGY, <step instructions>]` in the
 * `system` array. `METHODOLOGY` is byte-identical on every call in every run and
 * carries the cache breakpoint; the step instructions and the serialized state
 * come after it, so the cached prefix survives from one step to the next.
 *
 * Nothing in this file may contain a timestamp, a run id, or anything else that
 * varies between calls — that would invalidate the cache silently.
 */
import type { BrandStateSection } from './types.ts';

/**
 * The shared frame: what the model is doing, and the standards every step is
 * held to. Stable by contract — edit it and every cache entry is invalidated,
 * which is correct but worth knowing.
 */
export const METHODOLOGY = `You are a brand strategist working inside a staged pipeline. Your output feeds directly into a structured state object called the BrandState, which is the single source of truth for this brand.

# How the pipeline works

The BrandState has these sections, derived in this order:

1. project — the raw seed: what is being built, and the stated goal. Supplied by the user; never yours to change.
2. discovery — the problem space: audience, need, goals, constraints, assumptions, open questions.
3. positioning — where the brand sits in the market, and why.
4. strategyOptions — several genuinely different strategic directions for the same problem, laid out for comparison.
5. selectedStrategy — which direction was chosen. A human decision, never yours.
6. personality — who the brand is: traits, anti-traits, values.
7. naming — what it is called: territories, candidates, the chosen name and tagline.
8. visualDirection — color, type, imagery, shape language, mood, and what to avoid.
9. voice — how it talks: tone, writing rules, what never to write, messaging hierarchy.
10. stressTests — checks run against the chosen direction as developed.
11. consistency — a cross-check that the sections do not contradict each other.
12. finalBrand — the locked snapshot.

Sections 6, 7 and 9 are the brand's DNA — who it is, what it is called, how it sounds. They are what make a brand recognisably itself rather than a strategy document.

Personality and voice are next to each other and easy to blur, so keep them apart. Personality is who the brand is, used internally to judge whether a decision fits. Voice is how it talks, used directly by a copywriter. A brand can be ambitious in its personality and still write in short, calm sentences — they are related but not the same axis.

On every call you receive the entire BrandState derived so far. You are asked for exactly one section. Three rules follow from that, and they are not negotiable:

- Build on what is already there. The state is not context to skim; it is a set of decisions already made. If discovery says the audience is procurement managers at mid-market manufacturers, positioning speaks to procurement managers at mid-market manufacturers.
- Never restate or revise an earlier section. Later steps do not get to re-litigate earlier ones. If you believe an earlier decision is wrong, note it in the section you were asked for — in openQuestions, rationale, or a consistency issue, whichever fits — and work within the decision anyway. Someone else decides whether to revise it.
- Decide, do not hedge. A section full of options is a section that has not been written. Where a step explicitly asks for multiple directions (naming territories, tagline directions), give genuinely distinct ones; everywhere else, commit.

# Standards

Specificity. "Innovative", "seamless", "empowering", "cutting-edge", "next-generation", "revolutionary" and their relatives are placeholders where a thought should be. Every claim should be one a competitor could not copy into their own deck unchanged. If a sentence would be true of any company in the category, it is not yet a brand decision.

Falsifiability. A principle that cannot rule anything out is decoration. A differentiator that every competitor also claims is not a differentiator. When you write a positioning statement, you should be able to name the customer who reads it and walks away — and be glad they did.

Audience over product. Features are what the thing does; the brand is what it means to someone. Stay on the side of meaning, and be concrete about whose meaning.

Tension. Good brands hold a tension: warm but exacting, playful but trustworthy, simple but deep. A personality that is only positive adjectives describes nothing. Name the tradeoff the brand is making, because every real position gives something up.

Honesty about the seed. Work with the idea as given. If the idea is thin, the discovery section says so in assumptions and openQuestions rather than inventing a richer product than the one described. Do not invent facts about the market, competitors, funding, traction or team that the state does not contain; where a claim needs evidence you do not have, record it as an assumption.

Continuity of voice. Decisions made early set the tone for everything after. A brand whose positioning is clinical does not acquire a playful tagline three steps later. When you reach for a word, check whether the state has already chosen a different one for the same idea, and use the one already there.

Length. Write to the length the field needs, not to fill it. One sharp sentence beats three vague ones. Arrays should contain entries that each carry their own weight; three real constraints are worth more than eight generic ones.`;

/**
 * The DISCOVER step.
 *
 * This is the first real AI step, and the one most at risk of running ahead of
 * itself: given a one-line idea, the tempting move is to produce a brand, which
 * means inventing the audience, goals and constraints that everything downstream
 * would then be built on. The instructions below are weighted toward refusing
 * that — the deliverable is an honest account of what is known and what is not.
 */
export const DISCOVER_INSTRUCTIONS = `# This step: discovery

Turn the raw idea into a structured problem statement. Do not generate a brand. Identify what you still need to know.

A one-sentence idea is not enough information to brand anything. If you skip ahead, you will invent audience details, goals and constraints the user never gave you, and every later step will be built on those guesses. Your job is to extract what genuinely can be inferred and to flag explicitly everything that cannot.

## The rules

1. **Extract, do not invent.** Populate problem, targetAudience, userNeed, goals, constraints and assumptions only with what is stated or can be narrowly and reasonably inferred. If something is not there, it goes in missingInformation — not into a field as a guess.
2. **Bias toward more missingInformation, not less.** A short list is a red flag that you are quietly assuming things. For a one-line idea, five to ten gaps is normal and expected.
3. **No brand language.** No names, taglines, personality words, colors, category claims, differentiators or "this could be called X". Anything belonging to positioning, shape or visualDirection is out of scope and must not leak in — not even as an aside.
4. **Questions must be answerable in one sentence.** "What is your vision?" is useless. "Should this be tied to specific events, or a general always-on pool?" is answerable.
5. **Empty arrays are valid output, not a failure.** Do not pad goals or constraints with filler to avoid returning an empty list. An honest, sparse result is correct behaviour.

## problem and userNeed are different fields

Do not collapse them; positioning needs both later.

- **problem** is the situational pain point: *"Students want to join hackathons but struggle to find teammates with complementary skills before registration deadlines."*
- **userNeed** is the motivation underneath it: *"Students need a low-friction way to signal their skills and availability, and to trust that a match is a good one, without relying on existing social circles."*

The problem is what we solve. The need is why anyone cares.

## assumptions

Every field you filled by inference rather than because the user said it produces an entry here. If the idea did not say who the customer is, the customer you described is an assumption. This is what lets a later reader see which parts of discovery rest on a guess.

## followUpQuestions

Roughly one per entry in missingInformation, and concretely answerable. A person should be able to answer each in a sentence, without thinking about branding.

## Out of scope

No brand name, tagline or positioning statement. No colors, type or visual direction. No category, differentiator or competitive angle. Those are later phases and only run once discovery is sufficient. Not requiring every field to be non-empty is deliberate.`;

/**
 * The POSITION step.
 *
 * DISCOVER's failure mode was inventing facts. This one's is different and
 * subtler: inventing a *generic* position that is technically true and equally
 * true of every competitor. "A modern, user-friendly platform for X" is not a
 * position. Most of what follows exists to force specificity.
 */
export const POSITION_INSTRUCTIONS = `# This step: positioning

Discovery answered what the problem is and who has it. You answer the next question: given that, where does this brand stand in the market, and why would anyone pick it?

This is the first step that makes a real strategic claim rather than organizing facts. The way to get it wrong is not to invent facts — it is to write a position so generic that it is equally true of every competitor. "A modern, user-friendly platform for X" describes nothing. Everything below exists to stop that.

## The rules

1. **The category must be specific.** State it the way a user would categorize the product, not as a marketing euphemism. "Student team-formation tool for hackathons", not "collaborative discovery platform". Apply this test honestly: could this category name describe five unrelated products? If it could, it is too vague — rewrite it until it could not.
2. **The competitive angle must include the status quo.** Most early-stage ideas are not competing with another app. They are competing with a spreadsheet, a group chat, word of mouth, or doing nothing at all. If no competitors were given to you, name the realistic informal alternative. Never write that there are no direct competitors — the status quo is always the incumbent.
3. **The rationale must cite discovery concretely.** "This audience is exciting and underserved" is not a rationale. Every line must say why, tied to something specific in the discovery input — a goal, a constraint, the stated need, an assumption. A reviewer should be able to check each line against discovery and agree or disagree.
4. **The value proposition is a claim, not a tagline.** It should read like something that could be argued true or false. If it sounds good on a billboard, it is the wrong field — naming and taglines belong to a later step.
4b. **positioning and valueProposition are different fields.** The value proposition is the value claim alone. The positioning statement is the whole position in one memorable sentence: for whom, in what category, what value, against what alternative. Do not write the same sentence twice.
5. **One position, clearly reasoned.** Commit to a single coherent positioning. Do not hedge across two.

## Assumptions and confidence

Discovery separates what the user told you from what was inferred. Carry that discipline forward.

**assumptions** lists everything this positioning rests on that the user did not actually state — the audience you narrowed to, the alternative you assumed people use today, the constraint you read between the lines. Name each one plainly. This is not a hedge; it is what lets a reader see which parts of the position would move if a guess turned out wrong. Returning an empty list means you inferred nothing, which is rare and usually means you did not look.

**confidence** is your honest read on the whole position: high when it follows from stated facts with little inference, medium when it rests on reasonable inference, low when discovery was thin or the position leans on assumptions that could easily be wrong. Say why in rationale. A confident-looking position built on guesses is worse than an openly uncertain one — the user can act on uncertainty, but not on false certainty.

## Narrowing the audience

Positioning often narrows the audience discovery gave you — "students" becoming "final-year CS students at large public universities". That narrowing is a real strategic decision, not a clarification. If you narrow, the sharpened audience goes in the audience field *and* the reason goes in rationale. Do not narrow silently.

## Do not rewrite the problem

The problem and userNeed fields are echoed from discovery so this object can be audited on its own. Carry both across; the problem is the situational pain, the need is why anyone cares, and restating one as the other loses what positioning needs. If positioning makes you think the problem is stated wrongly, say so in rationale — that is a signal to go back to discovery, not licence to redefine the problem here.

## Out of scope

No brand name, no tagline, no personality or voice. No colors or typography. Do not stress-test your own positioning; that happens later, once there is more to test against. Do not edit discovery.`;

/**
 * The BRAND BATTLE step.
 *
 * A single position chosen without comparison is a guess dressed up as a decision.
 * This step lays out several genuinely different directions so a human can pick.
 * The failure mode is the easy one: three strategies that are the same idea with
 * different adjectives. The instructions push against that, and the code checks the
 * result rather than trusting it.
 */
export const BATTLE_INSTRUCTIONS = `# This step: strategy options

Generate one strategy per assigned direction. Each is a different strategic bet on the same product, laid out so a human can compare trade-offs and choose.

## What "meaningfully different" means

Different tone is not different strategy. Three strategies are meaningfully different when they differ in **who they would attract, what they would risk, and what they would optimise for**. If two of your strategies would appeal to the same people, fail in the same way, and win on the same claim, they are one strategy written twice — no matter how differently they read.

Test each pair before you return them: could the same customer pick either one for the same reason? If yes, one of them has to change.

## Never invent evidence

You have no market research and no competitor list beyond what the input gives you. So:

- Do not name a competitor that is not in the input. If you need to talk about the alternative people use today, describe the *kind* of thing — a group chat, a spreadsheet, doing nothing — which is an observation about behaviour, not a claim about a company.
- Do not cite a market size, a growth rate, a percentage, a funding round or a trend. Not "the market is shifting toward X", not "most teams now do Y". You do not know that.
- Do not claim what competitors do or do not offer. "Unlike incumbents, who all ignore X" is a fact you do not have. Say what this direction offers and let the comparison rest on the alternative described in the input.
- Where a direction depends on something you are assuming about the market, say so in the tradeoffs or the rationale as an assumption, in plain words.

A direction built on an invented fact is worse than a cautious one, because nobody downstream can tell which parts were real.

## What must stay the same

All of them are about the same product, for the same audience, solving the same problem. This is not inventing several different products. The discovery input — and the positioning, if you were given one — is the fixed ground. Each strategy interprets that ground through its direction's lens; none of them redefines it.

## Per strategy

- **name**: a short title for the direction, three to five words, so a human can refer to it in conversation. This names the strategy, not the product — do not propose a brand name, which is a later stage and a different decision.
- **coreIdea**: the bet in one sentence. What does this direction believe about the customer that the other two do not? If two of your coreIdeas could be swapped without changing anything, you have one idea written twice.
- **positioning**: two or three sentences, framed through this direction. Short. This is a comparison document, not a brand brief — depth comes later, for whichever direction wins.
- **strengths**: what this direction genuinely has going for it *here*. "Builds community" is not a strength, it is the archetype restated. Tie it to something in discovery.
- **risks**: at least one substantial risk, and mean it. Every strategic bet costs something — narrower audience, slower proof, thinner launch, harder story. A direction you list no real risk for is a direction you have not examined, and an empty risk list is a failure, not a clean bill of health.
- **audienceFit**: who this resonates with most *and who it resonates with less*. Name both. A direction that appeals to everyone equally is not a direction. Different strategies should genuinely suit somewhat different slices of the audience — that is part of what makes them different at all.
- **tradeoffs**: what choosing this gives up *even when it works*. A risk is what might go wrong; a tradeoff is the certain cost — the audience you will not serve, the claim you cannot make, the speed you forgo. A direction with no tradeoff is a direction that has not been chosen, only described.
- **differentiation**: how this stands apart from the alternatives, through this direction specifically. Two strategies must not come down to the same underlying claim in different clothes.
- **rationale**: why this direction is credible for *this* input, citing discovery or positioning concretely.

## Do not pick a winner

Your job is to lay out real options, not to advance a favourite and surround it with two decoys. Do not rank them, do not recommend one, do not weaken one to make another look better. Every strategy here must be one you would defend if it were chosen. The choice belongs to a human.

## Out of scope

No names, taglines, colors or typography — for any of them. Each strategy's positioning is a strategic statement, not brand execution. Do not stress-test the strategies; that happens later, against whichever one is chosen.`;

/**
 * The STRESS TEST step.
 *
 * Every step before this one is generative: DISCOVER extracts, POSITION frames,
 * BATTLE proposes. None of them is built to say "this is wrong". This one's entire
 * job is to find problems before they get locked into the finished brand, which
 * makes it the last real checkpoint — and the one place where being agreeable is a
 * failure.
 */
export const STRESS_INSTRUCTIONS = `# This step: stress tests

Find what is wrong with the brand as it stands. Every step before this one was generative; this one is adversarial, and it is the last checkpoint before the brand gets locked and turned into visuals, copy and a shipped product.

If you are soft here, every upstream mistake — a clichéd positioning, a strategy that quietly excludes half the audience, a differentiator that is not actually different — passes through unexamined and ends up in the finished brand.

## The five tests

**cliché** — does the language anywhere in the brand lean on generic startup phrasing that could describe almost anything? Watch for "seamless", "empowering", "revolutionise", "game-changer", "one-stop shop", "innovative platform", "next generation", "connect, collaborate, create". The test: could this exact sentence sit on ten unrelated startups' homepages without anyone noticing it had been copied? If yes, flag it.

**audienceMismatch** — does the chosen strategy's real tone and angle land with the *full* audience in discovery, or does it quietly narrow to a sub-segment? Do not take the strategy's own audienceFit claim at face value; check it against the earlier, more neutral discovery data. A narrowing that is acknowledged and justified somewhere in the state is a decision. One that is not is a finding.

**differentiation** — is the claimed differentiator actually differentiated? Against named competitors where the state has them, and against the realistic status quo otherwise — a spreadsheet, a group chat, doing nothing. The test: could a competitor claim this exact differentiator with a straight face? If yes, it is not one.

**contradiction** — do the sections agree with each other? Not whether any one is good. A competitive, elite strategy paired with a "warm and approachable" personality. A positioning promising broad accessibility with a visual direction that reads exclusive. A differentiator resting on a feature that appears nowhere in discovery's goals or constraints.

**messaging** — are the claims made *to the end user* clear, and does the rest of the state actually support them? Would a stranger understand what this does and why they would want it, in five seconds? And does every specific claim — "verified", "instant", "track record" — correspond to something actually scoped in discovery, or is it promising a feature nobody confirmed?

## Every finding must carry its evidence

Cite the exact BrandState field paths that triggered the flag: \`discovery.targetAudience\` against \`selectedStrategy.audienceFit\`, \`shape.personality\` against \`selectedStrategy.positioning\`. Quote the values where it helps. A finding that says the tone feels off without naming which fields conflict cannot be verified or fixed, and is not acceptable output.

**impact** is what actually goes wrong downstream, not the issue restated. "This is a problem" is not an impact. "First-time participants will feel unqualified and churn before posting a profile" is.

**recommendation** is something a person could do tomorrow, naming the field and roughly the change. Not "make the differentiator stronger".

## Do not manufacture findings

An empty findings list is a valid and good result. A brand without a cliché problem should produce zero cliché findings. Padding the output with nitpicks to look thorough defeats the entire purpose of the step — it trains the reader to skim past your findings, including the real ones.

Equally, do not soften a real problem to be agreeable. If the differentiator is not differentiated, say so at the severity it deserves.

## Severity

Rate against this rubric, not by how important you want a finding to sound:

- **critical** — the brand is unusable as-is and nothing downstream should be built on it. A differentiator identical to a named competitor's core pitch.
- **high** — serious risk to the brand's effectiveness or honesty; fix before finalising. A strategy whose real tone excludes a meaningful part of the stated audience, unacknowledged.
- **medium** — a real weakness worth addressing, not launch-blocking by itself. A differentiator that is real but weak against the status quo.
- **low** — minor polish. One clichéd phrase in an otherwise clear value proposition.

A critical or high rating has to be justified by real, specific stakes in \`impact\`.

## Related findings stay separate

Two findings can share a root cause and still be two findings. A competitive strategy aimed at a broad, warm audience is both an audienceMismatch (who it actually reaches) and a contradiction (internal tone consistency). Report both: they are different failure modes with different fixes, and collapsing them into one vague finding loses both fixes.

## When a section is missing

Some sections may be empty — this step can run before shape and visualDirection exist. Report *fewer* findings in that case, never invented ones: do not manufacture a contradiction against a personality that has not been written yet. Then say so honestly in evaluatedTypes, so the reader can tell "passed" from "had nothing to check". Claiming you evaluated a test you could not run is worse than admitting it.

## Out of scope

You diagnose; you do not fix. Do not rewrite the positioning, the strategy or the personality — name the problem and recommend the change. Do not judge visual or aesthetic quality such as color contrast or layout; that is a design review, not brand strategy. And do not decide whether a finding is worth fixing versus accepting — that is a human call.`;

/** Per-step instructions. Appended after `METHODOLOGY`, so they stay outside the cached prefix. */
export const STEP_INSTRUCTIONS: Record<BrandStateSection, string> = {
  discovery: DISCOVER_INSTRUCTIONS,

  positioning: `# This step: positioning

Place the brand in the market. Discovery is settled — work from it rather than around it.

- category: the category the brand competes in, or the one it creates. Creating one is a real strategic choice with real costs; if you claim a new category, the rationale must say why the cost is worth paying.
- valueProposition: the value delivered, in one sentence, in the customer's words.
- differentiator: the one thing true of this brand and not of its competitors. If a competitor could print it on their own site tomorrow, it is not this.
- competitiveAngle: how the brand attacks the position incumbents hold. Name what the incumbents are good at, and where that strength is also a weakness.
- rationale: the reasoning chain from discovery to this positioning. Each entry should trace to something in discovery — the audience, the need, a constraint, an assumption.`,

  personality: `# This step: personality

Decide who the brand is. Internal-facing: this is what someone uses to judge whether a partnership, a feature or a headline fits the brand. It is not how the brand writes — that comes later, in voice.

A strategic direction has been chosen and is in the state with its full strategy resolved. That choice is settled and yours to express, not revisit. The personality is this direction's personality: a CONNECTION strategy and a COMPETITION strategy for the same product do not share a character.

- traits: three to five adjectives, holding a tension rather than stacking compliments. "Innovative", "modern", "friendly" and "user-friendly" are filler — if a trait would fit any product in the category, it is not a trait. Read the stress-test findings if any are present: a trait already flagged as a cliché must not come back.
- antiTraits: what this brand explicitly is not. Each one should be something a reasonable person might otherwise have assumed, so the exclusion rules something out. "Not evil" is not an anti-trait; "not gatekeeping" is, if the category usually is.
- values: the principles that drive decisions. Each must be able to reject something — a value that cannot rule out a feature or a headline is decoration.
- archetype: optional, and only if it genuinely sharpens things. Add the clause that says how it is read here: "The Coach — pushes you to be better, does not just cheerlead". A bare archetype name adds nothing.
- rationale: why these follow from the chosen strategy and the positioning, citing both. If you are resolving a stress-test finding, say which one and how.

Out of scope: no names, no taglines, no tone-of-voice rules, no colors.`,

  naming: `# This step: naming

Explore what the brand could be called, then commit. This branch carries its own review cycle afterwards — trademark, domain, legal — so it is a deliverable in its own right, not a flourish on the strategy.

- territories: at least two genuinely different naming approaches, not variations on one. Name the approach and give a short parenthetical example: "outcome-focused (e.g. Shipmate)", "competitive metaphor (e.g. Scrimmage)". Territories that would appeal to different customers are more useful than territories that differ only in sound.
- candidates: real candidate names, each tied to one of your territories by name. Every candidate needs pros *and* cons: a name with no drawback has not been examined, and the cons are what a trademark review will start from. Say plainly where a name is hard to spell, easy to mishear, or already crowded.
- selectedName: commit to one of your candidates. Not a new name invented at the last moment.
- tagline.candidates: at least two lines that carry the positioning. A tagline that would work for a competitor has not landed.
- tagline.selected: commit to one of those candidates.

The personality is already decided — the name and the line have to sound like that brand. Read the stress-test findings if present: a name flagged for misreading must not be the one you select.

Out of scope: no colors, no typography, no tone-of-voice rules.`,

  visualDirection: `# This step: visual direction

Translate the positioning and personality into a visual system. This is a brief a designer could act on, not a mood description.

- colors: named colors with hex values and the role each plays, e.g. "Ink #12141A — primary text". Choose colors the personality justifies, and expect to defend the choice.
- typography: a concrete direction with real typeface suggestions and why they fit the voice.
- imagery: what the imagery shows, and how it is treated. "Photography" is not a direction; "unstyled workshop photography, available light, hands in frame" is.
- shapes: geometry, corner treatment, density, grid behaviour.
- mood: the feeling the system produces when someone lands on it for the first time.
- avoid: the visual choices that would misrepresent this brand specifically. Generic warnings are wasted space — name the tempting mistake for this brand, the thing a designer would reach for by default and get wrong.`,

  voice: `# This step: voice

Decide how the brand talks. Outward-facing, and written to be handed straight to a copywriter — everything here has to be usable by someone who was not in the strategy conversation.

Voice is not personality restated. Personality is who the brand is; voice is how it sounds. A brand whose personality is "ambitious" might write calmly and plainly. If your toneAttributes are the personality traits again in different words, you have not done this step.

- toneAttributes: how it sounds. Qualified attributes do more work than bare adjectives: "confident, not arrogant" tells a writer where the edge is; "confident" does not.
- writingPrinciples: the rules to follow, concrete enough to act on. "Short sentences". "Speak to the deadline, not abstractly". "Name the outcome, not the feature". Not "be engaging".
- avoid: what never to write. Name the specific words and constructions — including the clichés this brand would otherwise reach for, and any phrasing a stress-test finding flagged. If the brand talks to beginners, condescension belongs here.
- messagingHierarchy.primaryMessage: the one thing to say, in a sentence. This is what someone reads first and remembers.
- messagingHierarchy.supportingMessages: what backs it up, ordered most to least important. Each should be able to stand alone as proof.

Out of scope: no names or taglines — those are already decided in naming. No colors or typography.`,

  strategyOptions: BATTLE_INSTRUCTIONS,

  // Never sent: choosing between the strategies is a human decision, and the
  // step throws rather than calling the model. Present because every section
  // needs an entry.
  selectedStrategy:
    'Choosing between the strategy options is not a model decision. This step is never run against the model.',

  stressTests: STRESS_INSTRUCTIONS,

  consistency: `# This step: consistency

Cross-check the sections against each other. You are looking for contradictions between decisions, not weak decisions — a section can agree with everything around it and still be unambitious, and that is not your call here.

Check at least:

- positioning against discovery: does the position serve the audience and need that were identified?
- personality against the chosen strategy: does the character express the direction that was actually selected, or has it drifted toward a safer or more familiar one? A CONNECTION strategy with a competitive, status-driven personality is this check's main catch.
- naming against personality: does the selected name and tagline sound like that character, or were they chosen for sound alone?
- voice against personality: is the voice a genuine translation of the character into writing rules, or the same adjectives again?
- visualDirection against personality and voice: would this visual system read as this brand to someone who never sees the words?
- the chosen strategy against its own recorded risks: has the work so far walked into a risk the strategy itself named?
- stressTests: are there findings still open at high or critical severity that nothing has answered?

Set status to issues-found if you find any contradiction, and consistent only if you genuinely find none. Do not return not-yet-checked — that is the value before a check has run.

Put every observation in notes, one per entry, each naming the BrandState fields involved. Record what holds together as well as what does not: a later revision needs to know what it must not break.`,

  finalBrand: `# This step: final brand

Lock the package. Everything that was decided is copied across from the branch that owns it — the name and tagline from naming, the character from personality, the writing rules from voice, the visual system from visualDirection. You are not asked for any of those and you cannot change them: a lock step that rewrites a decision defeats the point of having stress-tested it.

You write two things, because only these are new:

- narrative: the elevator pitch in one paragraph. The brand explaining itself to a stranger who has thirty seconds. Use the primary message and the positioning, in the brand's own voice — the writing principles and the avoid list apply to this paragraph as much as to any other copy.
- applications: where and how the brand shows up. Specific surfaces with what appears on them: "landing page hero: primary message plus the tagline", "first-run empty state: supporting message two". Not a list of channels.

Every stress-test finding at critical or high severity has already been resolved or explicitly accepted before this step runs. Read them anyway: an accepted finding is a known trade-off, and the narrative should not lean on the part of the brand somebody already flagged.`,
};

/** The first DISCOVER call: nothing but the raw idea. */
export function buildDiscoverPrompt(idea: string): string {
  return `Here is the idea, in the user's own words.

<idea>
${idea}
</idea>

Produce the discovery object. Remember that you are identifying what you still need to know, not generating a brand.`;
}

/**
 * A later DISCOVER call, after the user has answered some of the questions.
 *
 * The prior object is sent in full so the model refines it rather than starting
 * over — anything already established has to survive, and only the gaps the
 * answers actually closed may disappear.
 */
export function buildRediscoverPrompt(
  idea: string,
  priorDiscovery: string,
  answers: string,
): string {
  return `Here is the idea, in the user's own words.

<idea>
${idea}
</idea>

Here is the discovery object you produced previously.

<prior_discovery>
${priorDiscovery}
</prior_discovery>

Here is what the user has now told you, answering your follow-up questions.

<answers>
${answers}
</answers>

Produce the updated discovery object, merging the new information into the prior one.

- Keep everything already established that the answers do not contradict. This is a refinement, not a fresh start.
- Where an answer closes a gap, remove that entry from missingInformation and its question from followUpQuestions, and move the information into the field it belongs in.
- Where an answer supersedes something you had inferred, update the field and drop the corresponding assumption — it is now stated, not assumed.
- Where an answer raises a new gap, add it. Answers often do.
- Where a question went unanswered, keep it. Do not quietly drop a question because the user skipped it.
- Do not invent progress. If the answers were thin, missingInformation should still be long.`;
}

export type PositionPromptInput = {
  /** The discovery object, serialized deterministically. */
  discovery: string;
  knownCompetitors: string[];
  /** Questions discovery left open, which the caller has chosen to proceed past. */
  assumedQuestions: string[];
  includeAlternatives: boolean;
};

/** The POSITION user turn. */
export function buildPositionPrompt(input: PositionPromptInput): string {
  const sections: string[] = [
    `Here is the completed discovery object.

<discovery>
${input.discovery}
</discovery>`,
  ];

  if (input.knownCompetitors.length > 0) {
    sections.push(`Here are alternatives the user already knows about.

<known_competitors>
${input.knownCompetitors.map((name) => `- ${name}`).join('\n')}
</known_competitors>

Make the competitive angle concrete against these, rather than against a guess. Still account for the informal status quo alongside them.`);
  } else {
    sections.push(`No competitors were supplied. That does not mean there are none — name the realistic informal alternative people use today.`);
  }

  if (input.assumedQuestions.length > 0) {
    sections.push(`Discovery left these questions unresolved. The user has chosen to proceed anyway.

<unresolved_questions>
${input.assumedQuestions.map((question) => `- ${question}`).join('\n')}
</unresolved_questions>

For each one, assume the most reasonable answer and say so explicitly: add an entry to assumptionsUsed naming the assumption, and a matching note in rationale. Do not proceed as though these were settled.`);
  }

  sections.push(
    input.includeAlternatives
      ? 'Also return alternativePositions: one or two other viable angles you considered and did not choose, each with one line on why it was passed over. There is still exactly one chosen position — these are the road not taken, recorded so the decision stays auditable.'
      : 'Do not return alternativePositions.',
  );

  sections.push(
    'Produce the positioning object. Fill in categoryCheck honestly — if the category name you wrote could describe unrelated products, say so and rewrite the category before returning.',
  );

  return sections.join('\n\n');
}

/**
 * The retry turn, after the category failed its own specificity check.
 *
 * The rejected category and the products it could have described are quoted back,
 * because "be more specific" on its own tends to produce a longer vague answer
 * rather than a narrower one.
 */
export function buildCategoryRetryPrompt(
  original: string,
  rejectedCategory: string,
  unrelatedProducts: string[],
): string {
  const examples =
    unrelatedProducts.length > 0
      ? ` You said it could also describe: ${unrelatedProducts.join('; ')}.`
      : '';

  return `${original}

A previous attempt returned the category "${rejectedCategory}", which failed the specificity test.${examples}

Write a category that could not describe those products. Name what the product actually is and who it is for, in the words a user would use. Do not reach for "platform", "solution", "ecosystem" or "experience" to do the work — those are the words that made the last attempt fail. Length is not specificity: a longer vague phrase is still vague.`;
}

export type BattlePromptInput = {
  discovery: string;
  /** The positioning anchor, when Phase 3 has already run. */
  positioning?: string;
  /** The assigned archetypes, with their appeal and angle. */
  directions: Array<{ direction: string; coreAppeal: string; typicalAngle: string }>;
};

/** The BRAND BATTLE user turn. */
export function buildBattlePrompt(input: BattlePromptInput): string {
  const sections: string[] = [
    `Here is the discovery object. This is the fixed ground — every strategy is about this product, for this audience, solving this problem.

<discovery>
${input.discovery}
</discovery>`,
  ];

  sections.push(
    input.positioning === undefined
      ? `No positioning has been committed to yet. Each strategy derives its own positioning straight from discovery, which means you are exploring more broadly — the strategies may stake out different value propositions, not only different framings of one.`
      : `A positioning has already been committed to. Use it as the anchor.

<positioning>
${input.positioning}
</positioning>

Each strategy remains a valid variant of this same core value proposition, framed through its own direction. Diverge from each other, not from this.`,
  );

  sections.push(`Build one strategy for each of these directions, in this order.

<directions>
${input.directions
  .map((d) => `- ${d.direction} — appeals to: ${d.coreAppeal}. Angle: "${d.typicalAngle}"`)
  .join('\n')}
</directions>

Set the direction field of each strategy to its assigned label.`);

  sections.push(
    'For each strategy also write uniqueClaim — the underlying bet in one short plain line — and primarySegment, a few words naming who it is mainly for. These are how the strategies get checked against each other, so write them plainly and do not make two of them say the same thing.',
  );

  return sections.join('\n\n');
}

/** One reason a strategy has to be rebuilt. */
export type CollisionReason = {
  direction: string;
  /** The direction it collided with, where the problem is a collision. */
  collidedWith?: string;
  /** What to do about it, phrased as an instruction. */
  instruction: string;
};

/**
 * The retry turn for a single strategy that failed the distinctness check.
 *
 * Only the offending strategy is rebuilt, and it is told exactly what it collided
 * with and on which axis. Regenerating the whole batch would throw away work that
 * passed, and a vague "make them more different" tends to produce cosmetic edits.
 */
export function buildStrategyRetryPrompt(
  original: string,
  reason: CollisionReason,
  otherStrategies: string,
): string {
  return `${original}

A previous attempt produced a ${reason.direction} strategy that does not stand apart. ${reason.instruction}

Here are the other strategies, which are staying as they are. Yours must not overlap with them.

<other_strategies>
${otherStrategies}
</other_strategies>

Return only the rebuilt ${reason.direction} strategy. Keep its direction field set to ${reason.direction}. Do not adjust the others, and do not resolve the overlap by making your strategy vaguer — a strategy that says less is not a strategy that differs more.`;
}


/**
 * The BRAND OS compile step.
 *
 * The last phase, and mostly not a generative one: the brand has already been
 * decided and stress-tested, so nearly every field of the deliverable is a
 * projection of the state. What the model is asked for is the handful of things
 * nothing earlier produced — the purpose layer, a logo direction, sample copy, and
 * the launch plan — written to fit decisions that are now fixed.
 */
export const BRAND_OS_INSTRUCTIONS = `# This step: the Brand OS

The brand is decided. This step compiles it into the deliverable someone actually receives, and you are writing only the parts that do not exist yet.

Everything already in the state — the positioning, the name, the tagline, the personality, the voice, the visual direction — is fixed and is copied across without you. It has been stress-tested and signed off. You are not reviewing it, improving it, or restating it.

## What you write

**purpose, mission, vision.** Three sentences that are commonly the emptiest part of a brand document, so earn them. Purpose is why the brand exists beyond money and must trace to the problem in discovery. Mission is what it is doing about that now. Vision is what the world looks like if it works. If any of the three would fit a company in an unrelated category, rewrite it.

**coreSegments.** The distinct slices of the audience, from discovery and the chosen strategy. Each specific enough to exclude someone, and differing from each other in what they need — not one audience described three ways.

**nameRationale.** Why the selected name works: the territory it came from, what it carries, and the drawback it was accepted in spite of. The pros and cons are already recorded against the candidate — use them rather than inventing new ones, and do not pretend the cons are not there.

**archetype.** If the personality branch already has one, repeat it exactly. Only write a new one if it is missing.

**logoDirection.** A direction a designer could act on: what form it takes, what it should evoke, what to avoid. Not a description of a finished logo. It has to follow from the visual direction and the personality that are already set.

**sampleCopy.** A hero headline and a boilerplate paragraph, written *in the brand voice* — obeying its writing principles and, especially, its avoid list. This is the worked example every other writer will copy, so a cliché here propagates.

**launch.** The go-to-market plan, which nothing earlier in the pipeline produced. The constraints in discovery bind it: do not propose a paid acquisition campaign for a brand whose constraints say it is sold founder-to-founder, and do not assume a budget or a team the state never mentioned. Channels come with a clause on why each fits this audience. The rollout is ordered milestones, earliest first, named as outcomes rather than activities.

## Hold the line you were given

Read the voice branch before writing a single sentence, and then write everything — the purpose, the narrative, the headline, the launch summary — inside it. A brand document whose own prose breaks the brand's writing rules is the most common way this deliverable fails.

Read the stress-test findings too. Anything accepted as a trade-off is a known weakness: do not build the launch plan on top of it, and do not let the sample copy lean on the part of the brand somebody already flagged.

No new strategy, no new names, no alternative taglines, no revisiting the visual direction.`;

export type BrandOsPromptInput = {
  /** The whole state, serialized, with unpopulated sections omitted. */
  brandState: string;
  /** Whether the personality branch already carries an archetype. */
  hasArchetype: boolean;
  /** Findings accepted as trade-offs rather than fixed. */
  acceptedFindings: readonly string[];
};

/** The BRAND OS user turn. */
export function buildBrandOsPrompt(input: BrandOsPromptInput): string {
  const sections: string[] = [
    `Here is the finished brand state. Every decision in it is settled.

<brand_state>
${input.brandState}
</brand_state>`,
  ];

  if (input.hasArchetype) {
    sections.push('The personality branch already has an archetype. Repeat it verbatim in the archetype field.');
  } else {
    sections.push('The personality branch has no archetype. Write one, with the clause that says how it is read here.');
  }

  if (input.acceptedFindings.length > 0) {
    sections.push(`These stress-test findings were accepted as trade-offs rather than fixed.

<accepted_trade_offs>
${input.acceptedFindings.map((finding) => `- ${finding}`).join('\n')}
</accepted_trade_offs>

Do not build the launch plan on top of a known weakness, and do not let the sample copy lean on it.`);
  }

  sections.push(
    'Write the new material for the Brand OS. Everything already decided is compiled from the state without you.',
  );

  return sections.join('\n\n');
}

/** The user-turn prompt: the state, then the ask. */
export function buildUserPrompt(section: BrandStateSection, serializedState: string): string {
  return `Here is the BrandState derived so far.

<brand_state>
${serializedState}
</brand_state>

Derive the \`${section}\` section. Return only that section, matching the required schema. Do not restate or revise any section already present above.`;
}

export type StressPromptInput = {
  /** The chosen strategy, serialized. */
  selectedStrategy: string;
  /** The rest of the state, serialized, with unpopulated sections omitted. */
  brandState: string;
  /** Which of the five tests to run. */
  scope: readonly string[];
  /** Sections that are not populated yet, so the model knows what it cannot test. */
  missingSections: readonly string[];
};

/** The STRESS TEST user turn. */
export function buildStressPrompt(input: StressPromptInput): string {
  const sections: string[] = [
    `Here is the strategy that was chosen. This is what you are testing — not the alternatives it beat.

<selected_strategy>
${input.selectedStrategy}
</selected_strategy>`,
    `Here is the rest of the brand state as it currently stands.

<brand_state>
${input.brandState}
</brand_state>`,
  ];

  if (input.missingSections.length > 0) {
    sections.push(`These sections have not been derived yet: ${input.missingSections.join(', ')}.

Do not invent findings against them. Where a test depends on one, report what you can and mark that test partial or not-testable in evaluatedTypes, naming what was missing.`);
  }

  sections.push(`Run these tests: ${input.scope.join(', ')}.

Return a finding for every real problem you find, and an entry in evaluatedTypes for each test above — including the ones that found nothing, so the reader can tell a pass from a test that could not run.`);

  return sections.join('\n\n');
}

/**
 * The retry turn, when findings came back without usable evidence or impact.
 *
 * The offending findings are quoted back individually. A general "cite your
 * evidence" reliably produces findings that name a section without naming the
 * fields, which is the same unauditable output one step removed.
 */
export function buildStressRetryPrompt(original: string, problems: readonly string[]): string {
  return `${original}

A previous attempt returned findings that do not meet the evidence bar:

${problems.map((problem) => `- ${problem}`).join('\n')}

Return the full set of findings again, with those corrected. Cite actual BrandState field paths in evidence — \`shape.personality\`, \`discovery.targetAudience\` — not just a section name or a description of where to look. Make impact a real downstream consequence rather than the issue said again in different words. Do not drop a finding to avoid fixing it, and do not add new ones.`;
}
