import type { BrandDna, BrandState, Direction } from 'brandstate'

/*
 * Strategy workspace — client-safe.
 *
 * Like discovery, the strategy lives in this browser until projects move to Postgres.
 * It is kept under its own key rather than inside the discovery project, so the
 * discovery page's store is untouched. Only `import type` from the engine here: the
 * engine uses `node:crypto` and must never be bundled for the browser.
 */

/** The engine stages this page runs, in the order the engine allows them. */
export const STAGES = ['positioning', 'strategyOptions', 'personality', 'naming', 'voice', 'visualDirection'] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_LABELS: Record<Stage, string> = {
  positioning: 'Positioning',
  strategyOptions: 'Brand Battle',
  personality: 'Personality',
  naming: 'Naming',
  voice: 'Voice',
  visualDirection: 'Visual direction',
}

/** What a stage says while it runs. One line per real model call — never a fake step. */
export const STAGE_PROGRESS: Record<Stage, string> = {
  positioning: 'Finding positioning opportunities…',
  strategyOptions: 'Building three distinct directions…',
  personality: 'Defining personality and principles…',
  naming: 'Exploring naming territories and taglines…',
  voice: 'Writing voice and message hierarchy…',
  visualDirection: 'Translating strategy into a visual brief…',
}

/**
 * Which stages go stale when a decision changes.
 *
 * Mirrors the engine's declared dependencies (steps.ts), limited to what this page can
 * regenerate. Brand Battle is deliberately absent downstream of positioning: regenerating
 * the directions would orphan the one the user chose, so that stays a manual act.
 */
export const DEPENDENTS: Record<'positioning' | 'selectedStrategy' | 'personality', Stage[]> = {
  positioning: ['personality', 'naming', 'voice', 'visualDirection'],
  selectedStrategy: ['personality', 'naming', 'voice', 'visualDirection'],
  personality: ['naming', 'voice', 'visualDirection'],
}

/** The workspace tabs, in the order the engine lets them be completed. */
export type TabKey = 'position' | 'battle' | 'shape' | 'visual' | 'dna'

export type DecisionStatus = 'proposed' | 'accepted' | 'rejected' | 'edited'

export interface HistoryEntry {
  at: string
  text: string
}

export interface StrategyWorkspace {
  projectId: string
  state: BrandState
  dna: BrandDna | null
  /** Per-field user decisions, keyed like `positioning.category`. Absent means proposed. */
  decisions: Record<string, DecisionStatus>
  /** Stages whose inputs changed after they ran. */
  stale: Stage[]
  /** What triggered the current stale set, for the banner. */
  staleCause: string | null
  history: HistoryEntry[]
}

export interface StrategyResponse {
  state: BrandState
  dna: BrandDna
}

const KEY = (id: string) => `brandos:strategy:${id}`

export function loadWorkspace(id: string): StrategyWorkspace | null {
  try {
    const raw = window.localStorage.getItem(KEY(id))
    return raw ? (JSON.parse(raw) as StrategyWorkspace) : null
  } catch {
    return null
  }
}

export function saveWorkspace(ws: StrategyWorkspace): StrategyWorkspace {
  try {
    window.localStorage.setItem(KEY(ws.projectId), JSON.stringify(ws))
  } catch {
    // Storage full or blocked: the in-memory workspace still works for this session.
  }
  return ws
}

export function logEntry(text: string): HistoryEntry {
  return { at: new Date().toISOString(), text }
}

/** Whether a stage has produced output, by the same tests the engine uses. */
export function isStageDone(state: BrandState | null, stage: Stage): boolean {
  if (!state) return false
  switch (stage) {
    case 'positioning':
      return state.positioning.category !== ''
    case 'strategyOptions':
      return state.strategyOptions.length > 0
    case 'personality':
      return state.personality.traits.length > 0
    case 'naming':
      return state.naming.candidates.length > 0 || state.naming.territories.length > 0
    case 'voice':
      return state.voice.toneAttributes.length > 0
    case 'visualDirection':
      return state.visualDirection.mood !== ''
  }
}

/** The chosen direction's full option, or undefined. */
export function selectedOption(state: BrandState) {
  const d = state.selectedStrategy?.direction
  return d ? state.strategyOptions.find((o) => o.direction === d) : undefined
}

/** Turns an archetype key like `COMPETITION` into `Competition`. */
export function directionLabel(d: Direction | string) {
  return d.charAt(0) + d.slice(1).toLowerCase()
}

/** Decision keys belonging to a stage, so re-running it resets them to proposed. */
export function clearDecisions(decisions: Record<string, DecisionStatus>, stage: Stage) {
  const prefix = stage === 'strategyOptions' ? 'selectedStrategy' : stage
  return Object.fromEntries(Object.entries(decisions).filter(([k]) => !k.startsWith(`${prefix}.`)))
}
