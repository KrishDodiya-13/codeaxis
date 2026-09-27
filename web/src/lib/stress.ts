import type { DecisionName, Severity, StressTest, TestReport, TestType } from 'brandstate'
import { DEPENDENTS, STAGES, STAGE_LABELS, logEntry, type Stage, type StrategyWorkspace } from '@/lib/strategy'

/*
 * Stress test — client-safe definitions.
 *
 * The findings themselves live in the strategy workspace's BrandState (`stressTests`), so
 * Brand DNA and every later page see the same record. What is kept here is only what the
 * BrandState has no place for: the per-test reports of the last run and how the user
 * handled each finding. Only `import type` from the engine, which must never be bundled.
 */

/** The engine's five tests, in the order the page shows them. */
export const TEST_ORDER: TestType[] = ['cliché', 'audienceMismatch', 'differentiation', 'contradiction', 'messaging']

export const TEST_META: Record<TestType, { label: string; attack: string; glyph: string }> = {
  cliché: { label: 'Cliché', attack: 'Hunting for clichés and generic claims', glyph: '✺' },
  audienceMismatch: { label: 'Audience fit', attack: 'Testing whether it lands with the audience', glyph: '◎' },
  differentiation: { label: 'Differentiation', attack: 'Checking whether it truly stands apart', glyph: '◆' },
  contradiction: { label: 'Contradictions', attack: 'Finding decisions that disagree', glyph: '⇄' },
  messaging: { label: 'Message clarity', attack: 'Validating the message is clear', glyph: '❝' },
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low']

export const DECISION_LABELS: Record<DecisionName, string> = {
  audience: 'Audience',
  problem: 'Problem',
  positioning: 'Positioning',
  valueProposition: 'Value proposition',
  differentiator: 'Differentiator',
  personality: 'Personality',
  principles: 'Principles',
  namingDirection: 'Naming',
  voice: 'Voice',
  visualDirection: 'Visual direction',
  selectedStrategy: 'Chosen direction',
}

/**
 * Which Strategy stage owns a decision, so a fix can flag it for regeneration.
 * Null where the decision is owned elsewhere: discovery (audience, problem) or the
 * user's own Brand Battle choice, which no stage regenerates.
 */
export const DECISION_STAGE: Record<DecisionName, Stage | null> = {
  audience: null,
  problem: null,
  positioning: 'positioning',
  valueProposition: 'positioning',
  differentiator: 'positioning',
  personality: 'personality',
  principles: 'personality',
  namingDirection: 'naming',
  voice: 'voice',
  visualDirection: 'visualDirection',
  selectedStrategy: null,
}

export type Outcome = 'accepted' | 'kept' | 'edited'

export interface StressRun {
  projectId: string
  /** The last run's per-test verdicts: pass, issues found, partial, or not testable. */
  reports: TestReport[]
  ranAt: string
  /** How the user handled each finding, keyed by `findingKey`. */
  outcomes: Record<string, Outcome>
  /** The user's own fix, for findings handled with "Write my own fix". */
  notes: Record<string, string>
}

/** Matches the engine's own rule (type + issue), so a re-run can't reassign a decision. */
export const findingKey = (f: Pick<StressTest, 'type' | 'issue'>) => `${f.type}::${f.issue}`

const KEY = (id: string) => `brandos:stress:${id}`

export function loadStressRun(id: string): StressRun | null {
  try {
    const raw = window.localStorage.getItem(KEY(id))
    return raw ? (JSON.parse(raw) as StressRun) : null
  } catch {
    return null
  }
}

export function saveStressRun(run: StressRun): StressRun {
  try {
    window.localStorage.setItem(KEY(run.projectId), JSON.stringify(run))
  } catch {
    // Storage full or blocked: the in-memory run still works for this session.
  }
  return run
}

/**
 * Flags the Strategy stage that owns `decision` — and what depends on it — as needing an
 * update, the same dependency rule Strategy applies to a user edit. Returns the stages
 * flagged, so the page can say exactly what it did.
 */
export function flagForUpdate(ws: StrategyWorkspace, decision: DecisionName | undefined, cause: string) {
  const stage = decision ? DECISION_STAGE[decision] : null
  if (!stage) return { ws, flagged: [] as Stage[] }
  const downstream = stage === 'positioning' || stage === 'personality' ? DEPENDENTS[stage] : []
  const done = (s: Stage) =>
    s === stage || // the decision itself is always flagged
    (s === 'personality' && ws.state.personality.traits.length > 0) ||
    (s === 'naming' && ws.state.naming.candidates.length > 0) ||
    (s === 'voice' && ws.state.voice.toneAttributes.length > 0) ||
    (s === 'visualDirection' && ws.state.visualDirection.mood !== '')
  const flagged = [stage, ...downstream].filter(done)
  const stale = STAGES.filter((s) => ws.stale.includes(s) || flagged.includes(s))
  return {
    ws: {
      ...ws,
      stale,
      staleCause: cause,
      history: [...ws.history, logEntry(`${cause} → ${flagged.map((s) => STAGE_LABELS[s]).join(', ')} flagged`)],
    },
    flagged,
  }
}
