import { resolveSelectedStrategy, type BrandState, type SectionDeriver } from 'brandstate'
import {
  CONTENT_DIMENSIONS,

  type ContentCheckModel,
  type ContentCheckResult,
  type DimensionVerdict,
  type Overall,
} from '@/lib/consistency'
import { ContentCheckSchema } from '@/lib/ai/content-check-schema'

/*
 * The content check: one piece of real copy against the approved Brand DNA.
 *
 * The model sees only the approved decisions, compactly — not the whole state — which
 * keeps the request small and keeps rejected directions out of the judgement. Its
 * output then goes through the same discipline as every other stage: Zod first, then
 * business rules that a model can't be trusted to police itself on.
 */

const INSTRUCTIONS = `You check one piece of brand content against the brand's approved decisions (its Brand DNA).

Judge the content on exactly five dimensions, one entry each:
- voice: does it sound like voice.toneAttributes and follow voice.writingPrinciples, avoiding voice.avoid?
- positioning: is it consistent with the positioning, value proposition and differentiator?
- audience: would it land with discovery.targetAudience?
- personality: does it express personality.traits and steer clear of personality.antiTraits?
- visual: only if the content describes imagery, colour or layout; for plain copy use not-applicable.

Rules:
- Quote the exact words from the content that your verdict rests on. Never paraphrase them into something the content does not say.
- Cite the Brand DNA field you judged against as a path, e.g. voice.toneAttributes.
- Do not invent facts about competitors or the market. Judge only against the DNA provided.
- A recommendation is a concrete edit, only for warning or fail.
- repair is the single most valuable fix: original must be copied verbatim from the content, suggestion replaces it in the brand's voice. Use null when everything passes.
- Be concise. No essays.`

/** Only the approved decisions, in a compact form. */
function brandDnaForPrompt(state: BrandState) {
  const strategy = resolveSelectedStrategy(state)
  return {
    discovery: { targetAudience: state.discovery.targetAudience, problem: state.discovery.problem },
    positioning: {
      category: state.positioning.category,
      valueProposition: state.positioning.valueProposition,
      differentiator: state.positioning.differentiator,
    },
    ...(strategy ? { selectedStrategy: { name: strategy.name, positioning: strategy.positioning } } : {}),
    personality: { traits: state.personality.traits, antiTraits: state.personality.antiTraits, values: state.personality.values },
    voice: {
      toneAttributes: state.voice.toneAttributes,
      writingPrinciples: state.voice.writingPrinciples,
      avoid: state.voice.avoid,
      primaryMessage: state.voice.messagingHierarchy.primaryMessage,
    },
    naming: { selectedName: state.naming.selectedName, tagline: state.naming.tagline.selected },
    visualDirection: { mood: state.visualDirection.mood, avoid: state.visualDirection.avoid },
  }
}

function userPrompt(state: BrandState, content: string) {
  return `<brand_dna>\n${JSON.stringify(brandDnaForPrompt(state), null, 1)}\n</brand_dna>\n\n<content>\n${content}\n</content>`
}

/**
 * Business rules on top of the schema:
 *   - one verdict per dimension, in plan order; a missing one is reported, not invented
 *   - `overall` is computed from the verdicts, never asserted by the model
 *   - a repair whose `original` isn't actually in the content is dropped — offering to
 *     replace words that aren't there would be a fabricated fix
 */
export function finalizeContentCheck(model: ContentCheckModel, content: string): ContentCheckResult {
  const dimensions: DimensionVerdict[] = CONTENT_DIMENSIONS.map(
    (d) =>
      model.dimensions.find((v) => v.dimension === d) ?? {
        dimension: d,
        status: 'not-applicable',
        finding: 'The check did not report on this dimension.',
        evidence: '—',
      },
  )
  const overall: Overall = dimensions.some((d) => d.status === 'fail')
    ? 'fail'
    : dimensions.some((d) => d.status === 'warning')
      ? 'warning'
      : 'pass'
  const repair = model.repair && content.includes(model.repair.original) && overall !== 'pass' ? model.repair : null
  return { overall, summary: model.summary, dimensions, repair }
}

export async function runContentCheck(deriver: SectionDeriver, state: BrandState, content: string) {
  const result = await deriver.deriveSection('consistency', '', ContentCheckSchema, {
    instructions: INSTRUCTIONS,
    userPrompt: userPrompt(state, content),
  })
  return finalizeContentCheck(result.value, content)
}

/**
 * The mock-mode result (AI_MODE=mock). The engine's mock deriver picks fixtures by
 * schema and has none for this one, so the route answers here instead: deterministic,
 * built from the brand's own fields, and labelled as a mock in the summary so it can
 * never pass for a real judgement.
 */
export function mockContentCheck(state: BrandState, content: string): ContentCheckResult {
  const firstSentence = content.split(/(?<=[.!?])\s/)[0] ?? content
  const hedge = content.match(/\b(really|very|just|basically|simply|smarter|innovative|revolutionary)\b/i)?.[0]
  const tone = state.voice.toneAttributes[0] ?? 'the brand tone'
  const model: ContentCheckModel = {
    summary: `[Mock result — AI_MODE=mock] ${hedge ? `Mostly on-brand, but “${hedge}” drifts from the voice.` : 'Reads on-brand against the approved voice and positioning.'}`,
    dimensions: [
      {
        dimension: 'voice',
        status: hedge ? 'warning' : 'pass',
        finding: hedge ? `“${hedge}” softens the claim, against ${tone}.` : `“${firstSentence.slice(0, 60)}” matches ${tone}.`,
        evidence: 'voice.toneAttributes',
        ...(hedge ? { recommendation: `Cut “${hedge}” and state the claim directly.` } : {}),
      },
      { dimension: 'positioning', status: 'pass', finding: `Consistent with “${state.positioning.category || 'the positioning'}”.`, evidence: 'positioning.category' },
      { dimension: 'audience', status: 'pass', finding: 'Speaks to the target audience’s problem.', evidence: 'discovery.targetAudience' },
      { dimension: 'personality', status: 'pass', finding: `Carries “${state.personality.traits[0] ?? 'the core trait'}”.`, evidence: 'personality.traits' },
      { dimension: 'visual', status: 'not-applicable', finding: 'Plain copy — nothing visual to judge.', evidence: 'visualDirection.mood' },
    ],
    repair: hedgeSentence(content, hedge),
  }
  return finalizeContentCheck(model, content)

  /** The sentence holding the hedge word, and the same sentence without it. */
  function hedgeSentence(text: string, word: string | undefined): ContentCheckModel['repair'] {
    if (!word) return null
    const sentence = text.split(/(?<=[.!?])\s+/).find((s) => s.includes(word))
    if (!sentence) return null
    const fixed = sentence.replace(new RegExp(`\\s*\\b${word}\\b`, 'i'), '').replace(/\s{2,}/g, ' ').trim()
    return {
      original: sentence,
      suggestion: fixed.charAt(0).toUpperCase() + fixed.slice(1),
      rationale: `Without “${word}” the line states its claim outright, which is ${tone} (voice.toneAttributes).`,
    }
  }
}
