/*
 * Plain words for the engine's internal names.
 *
 * The engine makes the model cite the exact BrandState field a finding rests on
 * (`personality.traits`, `strategyOptions[2].positioning`) — that is what makes a
 * finding checkable, and it stays in the data. People reading the page shouldn't have to
 * decode it, so everything the model wrote is passed through `humanize` before it's shown:
 * "Add a warmth trait to personality.traits" → "Add a warmth trait to the personality traits".
 */

/** Longest match wins, so `voice.messagingHierarchy.primaryMessage` beats `voice`. */
const LABELS: Record<string, string> = {
  project: 'the project',
  'project.idea': 'your idea',
  discovery: 'discovery',
  'discovery.problem': 'the problem',
  'discovery.targetAudience': 'the target audience',
  'discovery.userNeed': 'the user need',
  'discovery.goals': 'the goals',
  'discovery.constraints': 'the constraints',
  'discovery.assumptions': 'the discovery assumptions',
  'discovery.openQuestions': 'the open questions',
  positioning: 'the positioning',
  'positioning.category': 'the category',
  'positioning.valueProposition': 'the value proposition',
  'positioning.differentiator': 'the differentiator',
  'positioning.competitiveAngle': 'the competitive angle',
  'positioning.rationale': 'the positioning rationale',
  'positioning.assumptions': 'the positioning assumptions',
  strategyOptions: 'the strategy directions',
  'strategyOptions.positioning': "a direction's positioning",
  'strategyOptions.coreIdea': "a direction's core idea",
  selectedStrategy: 'the chosen direction',
  'selectedStrategy.direction': 'the chosen direction',
  'selectedStrategy.positioning': "the chosen direction's positioning",
  'selectedStrategy.coreIdea': "the chosen direction's core idea",
  personality: 'the personality',
  'personality.traits': 'the personality traits',
  'personality.antiTraits': 'the anti-traits',
  'personality.values': 'the brand principles',
  'personality.archetype': 'the archetype',
  naming: 'the naming',
  'naming.selectedName': 'the chosen name',
  'naming.candidates': 'the name candidates',
  'naming.territories': 'the naming territories',
  'naming.tagline': 'the tagline',
  'naming.tagline.selected': 'the chosen tagline',
  'naming.tagline.candidates': 'the tagline options',
  voice: 'the voice',
  'voice.tone': 'the voice tone',
  'voice.toneAttributes': 'the voice tone',
  'voice.writingPrinciples': 'the writing principles',
  'voice.avoid': "the voice's avoid list",
  'voice.messagingHierarchy': 'the message hierarchy',
  'voice.messagingHierarchy.primaryMessage': 'the primary message',
  'voice.messagingHierarchy.supportingMessages': 'the supporting messages',
  'voice.primaryMessage': 'the primary message',
  visualDirection: 'the visual direction',
  'visualDirection.colors': 'the colour palette',
  'visualDirection.typography': 'the typography',
  'visualDirection.imagery': 'the imagery',
  'visualDirection.shapes': 'the shape language',
  'visualDirection.composition': 'the composition',
  'visualDirection.mood': 'the visual mood',
  'visualDirection.visualPersonality': 'how the visuals express the personality',
  'visualDirection.avoid': "the visual avoid list",
  stressTests: 'the stress test findings',
  consistency: 'the consistency check',
  finalBrand: 'the locked brand',
}

const SECTIONS = [
  'project',
  'discovery',
  'positioning',
  'strategyOptions',
  'selectedStrategy',
  'selected_strategy',
  'personality',
  'naming',
  'visualDirection',
  'visual_direction',
  'voice',
  'stressTests',
  'stress_tests',
  'consistency',
  'finalBrand',
  'final_brand',
]

// A section name, an optional [index], then one or more .fields — the engine's citation shape.
const PATH = new RegExp(`\\b(?:${SECTIONS.join('|')})(?:\\[\\d*\\])?(?:\\.[A-Za-z][A-Za-z0-9_]*(?:\\[\\d*\\])?)+`, 'g')
// Bare section names the model sometimes cites on their own, e.g. "finalBrand has not…".
const BARE = /\b(finalBrand|stressTests|strategyOptions|selectedStrategy|visualDirection)\b/g
// The engine's archetype keys, which it writes in capitals ("the chosen TRUST strategy").
const DIRECTIONS = /\b(CONNECTION|OUTCOMES|COMPETITION|TRUST|ACCESSIBILITY|CRAFT|REBELLION)\b/g

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
const words = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase()

function label(path: string): string {
  const parts = path.replace(/\[\d*\]/g, '').split('.').map(camel)
  for (let n = parts.length; n > 0; n--) {
    const hit = LABELS[parts.slice(0, n).join('.')]
    if (!hit) continue
    const rest = parts.slice(n)
    return rest.length === 0 ? hit : `${hit} ${rest.map(words).join(' ')}`
  }
  return `the ${parts.map(words).join(' ')}`
}

/** Capitalise when the replacement opens a sentence. */
function fit(replacement: string, text: string, offset: number) {
  const before = text.slice(0, offset).trimEnd()
  const opensSentence = before === '' || /[.!?:]$/.test(before)
  return opensSentence ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement
}

/** For mid-sentence use: "Judged against the voice tone", never "…against The voice tone". */
export function humanizeInline(text: string | undefined | null): string {
  const out = humanize(text)
  return out.charAt(0).toLowerCase() + out.slice(1)
}

export function humanize(text: string | undefined | null): string {
  if (!text) return ''
  return text
    .replace(PATH, (m, offset: number, whole: string) => fit(label(m), whole, offset))
    .replace(BARE, (m, _g, offset: number, whole: string) => fit(label(m), whole, offset))
    .replace(DIRECTIONS, (m) => m.charAt(0) + m.slice(1).toLowerCase())
    .replace(/\bthe the\b/gi, 'the')
}
