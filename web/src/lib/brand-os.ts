import type { BrandOs, BrandState } from 'brandstate'

/*
 * Brand OS — client-safe definitions.
 *
 * The document itself is compiled by the engine (`compileBrandOs`) from the approved
 * BrandState; this file only knows what the page needs around it: whether the brand is
 * ready to compile, where the compiled document is kept, and how to export it.
 * Only `import type` from the engine; it must never be bundled for the browser.
 */

export interface ReadinessItem {
  label: string
  done: boolean
  /** Which page fixes it. */
  href: 'discover' | 'strategy' | 'stress-test' | 'consistency'
  hint: string
}

/**
 * The engine's compile preconditions (findMissingForCompile), as a checklist the user can
 * act on. Mirrors its rules exactly — including that an empty stress test counts as not
 * run — so the button is never enabled for a compile the engine would refuse.
 */
export function readiness(state: BrandState): ReadinessItem[] {
  const hasDirection = !!state.selectedStrategy && state.strategyOptions.some((o) => o.direction === state.selectedStrategy?.direction)
  return [
    { label: 'Discovery', done: state.discovery.problem !== '', href: 'discover', hint: 'Answer the discovery questions' },
    { label: 'Positioning', done: state.positioning.category !== '', href: 'strategy', hint: 'Generate positioning' },
    { label: 'Chosen direction', done: hasDirection, href: 'strategy', hint: 'Pick a direction in Brand Battle' },
    { label: 'Personality', done: state.personality.traits.length > 0, href: 'strategy', hint: 'Generate the brand shape' },
    { label: 'Naming', done: state.naming.candidates.length > 0, href: 'strategy', hint: 'Generate the brand shape' },
    { label: 'Name picked', done: state.naming.selectedName !== undefined, href: 'strategy', hint: 'Pick a name on the Shape tab' },
    { label: 'Tagline picked', done: state.naming.tagline.selected !== undefined, href: 'strategy', hint: 'Pick a tagline on the Shape tab' },
    { label: 'Voice', done: state.voice.toneAttributes.length > 0, href: 'strategy', hint: 'Generate the brand shape' },
    { label: 'Visual direction', done: state.visualDirection.mood !== '', href: 'strategy', hint: 'Generate the visual direction' },
    { label: 'Stress test', done: state.stressTests.length > 0, href: 'stress-test', hint: 'Run the stress test' },
    { label: 'Self-check', done: state.consistency.status !== 'not-yet-checked', href: 'consistency', hint: 'Run the brand self-check' },
  ]
}

/** Open critical or high stress findings: the engine won't compile a ready document past these. */
export function blockingCount(state: BrandState): number {
  return state.stressTests.filter((f) => (f.status ?? 'open') === 'open' && (f.severity === 'critical' || f.severity === 'high')).length
}

export interface CompiledBrandOs {
  projectId: string
  brandOS: BrandOs
  compiledAt: string
  /** The BrandState's updatedAt at compile time, to spot a document gone stale. */
  stateUpdatedAt: string
  draft: boolean
}

const KEY = (id: string) => `brandos:brand-os:${id}`

export function loadBrandOs(id: string): CompiledBrandOs | null {
  try {
    const raw = window.localStorage.getItem(KEY(id))
    return raw ? (JSON.parse(raw) as CompiledBrandOs) : null
  } catch {
    return null
  }
}

export function saveBrandOs(doc: CompiledBrandOs): CompiledBrandOs {
  try {
    window.localStorage.setItem(KEY(doc.projectId), JSON.stringify(doc))
  } catch {
    // Storage full or blocked: the in-memory document still works for this session.
  }
  return doc
}

export const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'identity', label: 'Identity' },
  { id: 'visual', label: 'Visual' },
  { id: 'voice', label: 'Voice' },
  { id: 'launch', label: 'Launch Kit' },
  { id: 'validation', label: 'Validation' },
] as const

/** The whole document as Markdown, for pasting into a doc or sending to a designer. */
export function toMarkdown(os: BrandOs, compiledAt: string): string {
  const s = os.strategy
  const id = os.identity
  const v = os.visual
  const vo = os.voice
  const l = os.launch
  const val = os.validation
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n')
  return [
    `# ${id.name} — Brand OS`,
    `Prepared by BRANDOS · ${new Date(compiledAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`,
    `> ${s.positioningStatement}`,
    `## Strategy`,
    `**Problem** — ${s.problem}`,
    `**Target audience** — ${s.targetAudience}`,
    `**Category** — ${s.category}`,
    `**Positioning** — ${s.positioning}`,
    `**Value proposition** — ${s.valueProposition}`,
    `**Differentiator** — ${s.differentiator}`,
    `**Purpose** — ${s.purpose}\n\n**Mission** — ${s.mission}\n\n**Vision** — ${s.vision}`,
    `## Identity`,
    `**Name** — ${id.name}. ${id.nameRationale}`,
    `**Tagline** — “${id.taglineDirection.selected}”`,
    `**Personality** — ${id.personality.join(' · ')}${id.archetype ? ` (${id.archetype})` : ''}`,
    `**Principles**\n${list(id.principles)}`,
    `## Visual direction`,
    `_A strategic brief — final execution belongs to a designer._`,
    `**Colour**\n${list(v.colorDirection)}`,
    `**Typography** — ${v.typography}`,
    `**Imagery** — ${v.imagery}`,
    `**Shape language** — ${v.shapeLanguage}`,
    `**Composition** — ${v.composition}`,
    `**Logo direction** — ${v.logoDirection}`,
    `**Avoid** — ${v.avoid.join(' · ')}`,
    `## Voice`,
    `**Tone** — ${vo.tone.join(' · ')}`,
    `**Primary message** — ${vo.messagingHierarchy.primaryMessage}`,
    `**Supporting**\n${list(vo.messagingHierarchy.supportingMessages)}`,
    `**Sample headline** — ${vo.sampleCopy.headline}\n\n**Boilerplate** — ${vo.sampleCopy.boilerplate}`,
    `## Launch kit`,
    `**Landing headline** — ${l.landingHeadline}`,
    `**One-line pitch** — ${l.onelinePitch}`,
    `**Launch message**\n\n${l.launchMessage}`,
    `**Go-to-market** — ${l.goToMarketSummary}`,
    `**Channels** — ${l.keyChannels.join(' · ')}`,
    `**Rollout**\n${l.rolloutSequence.map((m) => `- **${m.milestone}** (${m.timing}) — ${m.detail}`).join('\n')}`,
    `## Validation`,
    `**Readiness** — ${val.readiness.label} (${val.readiness.score}/100)`,
    `**Remaining risks**\n${val.remainingRisks.length ? list(val.remainingRisks) : '- None'}`,
    `**Recommendations**\n${val.recommendations.length ? list(val.recommendations) : '- None'}`,
  ].join('\n\n')
}
