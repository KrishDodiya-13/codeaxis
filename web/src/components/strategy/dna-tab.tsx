'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Confidence } from 'brandstate'
import { selectedOption, type StrategyWorkspace, type TabKey } from '@/lib/strategy'
import { FieldLabel } from '@/components/project/panel'
import { cn } from '@/lib/utils'
import { ConfidenceTag, DotList, EmptyState, btnPrimary, btnSecondary } from './ui'
import { SHAPE_KEYS } from './shape-tab'
import { VISUAL_KEYS } from './visual-tab'

type NodeKey = 'audience' | 'problem' | 'positioning' | 'value' | 'personality' | 'voice' | 'visual' | 'launch'
type NodeStatus = 'empty' | 'assumption' | 'confirmed' | 'stale'

interface DnaNode {
  key: NodeKey
  label: string
  x: number
  y: number
  status: NodeStatus
  statusText: string
  decision: string | null
  source: string
  rationale: string[]
  confidence?: Confidence
  alternatives: string[]
  /** Where the user changes this decision. */
  tab: TabKey | 'discover' | null
}

/** Layout in percent of the canvas. Top to bottom follows the order decisions are made. */
const POSITIONS: Record<NodeKey, { x: number; y: number }> = {
  audience: { x: 20, y: 12 },
  problem: { x: 50, y: 12 },
  positioning: { x: 50, y: 38 },
  value: { x: 80, y: 38 },
  personality: { x: 20, y: 64 },
  voice: { x: 50, y: 64 },
  visual: { x: 80, y: 64 },
  launch: { x: 50, y: 89 },
}

const EDGES: [NodeKey, NodeKey][] = [
  ['audience', 'problem'],
  ['audience', 'positioning'],
  ['problem', 'positioning'],
  ['positioning', 'value'],
  ['positioning', 'personality'],
  ['positioning', 'voice'],
  ['positioning', 'visual'],
  ['personality', 'voice'],
  ['voice', 'launch'],
  ['visual', 'launch'],
]

/** What a change to each node flows into — the dependency-update rule, as the user sees it. */
const AFFECTS: Record<NodeKey, NodeKey[]> = {
  audience: ['positioning', 'personality', 'voice', 'visual'],
  problem: ['positioning', 'value'],
  positioning: ['value', 'personality', 'voice', 'visual'],
  value: ['voice', 'launch'],
  personality: ['voice', 'visual'],
  voice: ['launch'],
  visual: ['launch'],
  launch: [],
}

const LABELS: Record<NodeKey, string> = {
  audience: 'Audience',
  problem: 'Problem',
  positioning: 'Positioning',
  value: 'Value',
  personality: 'Personality',
  voice: 'Voice',
  visual: 'Visual',
  launch: 'Launch',
}

const STATUS_TEXT: Record<NodeStatus, string> = {
  empty: '○ Not decided yet',
  assumption: '~ Proposed by AI — not yet approved',
  confirmed: '● Approved',
  stale: '⚠ May need update',
}

/** Confirmed when every decision in the group was accepted or edited by the user. */
function approval(decisions: StrategyWorkspace['decisions'], keys: string[]): NodeStatus {
  return keys.every((k) => decisions[k] === 'accepted' || decisions[k] === 'edited') ? 'confirmed' : 'assumption'
}

/** Builds the graph from the engine's canonical DNA plus the user's decisions. Nothing here is invented. */
function buildNodes(ws: StrategyWorkspace): DnaNode[] {
  const { state, dna, decisions, stale } = ws
  const option = selectedOption(state)
  const node = (key: NodeKey, rest: Omit<DnaNode, 'key' | 'label' | 'x' | 'y' | 'statusText'>): DnaNode => ({
    key,
    label: LABELS[key],
    ...POSITIONS[key],
    statusText: STATUS_TEXT[rest.status],
    ...rest,
  })
  const undecided = (reason: string) => ({ decision: null, source: reason, rationale: [], alternatives: [] })

  const audience = dna?.audience
  const problem = dna?.problem
  const positioning = dna?.positioning
  const value = dna?.valueProposition
  const personality = dna?.personality
  const voice = dna?.voice
  const visual = dna?.visualDirection
  const staleOr = (stage: (typeof stale)[number], s: NodeStatus): NodeStatus => (stale.includes(stage) ? 'stale' : s)

  return [
    node('audience', {
      status: audience?.decided ? 'confirmed' : 'empty',
      tab: 'discover',
      ...(audience?.decided
        ? { decision: audience.value, source: `Discovery → ${audience.source}`, rationale: ['Taken from your discovery answers.'], alternatives: [] }
        : undecided('Discovery has not run yet.')),
    }),
    node('problem', {
      status: problem?.decided ? 'confirmed' : 'empty',
      tab: 'discover',
      ...(problem?.decided
        ? { decision: problem.value, source: `Discovery → ${problem.source}`, rationale: ['Taken from your discovery answers.'], alternatives: [] }
        : undecided('Discovery has not run yet.')),
    }),
    node('positioning', {
      status: positioning?.decided ? 'confirmed' : state.positioning.category ? 'assumption' : 'empty',
      tab: 'battle',
      ...(dna?.provenance.confidence ? { confidence: dna.provenance.confidence } : {}),
      ...(positioning?.decided
        ? {
            decision: positioning.value,
            source: positioning.source,
            rationale: option?.rationale ?? [],
            alternatives: state.strategyOptions
              .filter((o) => o.direction !== option?.direction)
              .map((o) => `${o.name} — ${o.coreIdea}`),
          }
        : state.positioning.category
          ? {
              decision: state.positioning.category,
              source: 'positioning.category — no direction chosen yet',
              rationale: state.positioning.rationale,
              alternatives: state.strategyOptions.map((o) => `${o.name} — ${o.coreIdea}`),
            }
          : undecided('Positioning has not run yet.')),
    }),
    node('value', {
      status: value?.decided ? approval(decisions, ['positioning.valueProposition']) : 'empty',
      tab: 'position',
      ...(dna?.provenance.confidence ? { confidence: dna.provenance.confidence } : {}),
      ...(value?.decided
        ? { decision: value.value, source: value.source, rationale: state.positioning.rationale, alternatives: [] }
        : undecided('Positioning has not run yet.')),
    }),
    node('personality', {
      status: personality?.decided ? staleOr('personality', approval(decisions, SHAPE_KEYS.filter((k) => k.startsWith('personality.')))) : 'empty',
      tab: 'shape',
      ...(personality?.decided
        ? {
            decision: personality.value.traits.join(' · '),
            source: personality.source,
            rationale: personality.value.rationale,
            alternatives: personality.value.archetype ? [`Archetype: ${personality.value.archetype}`] : [],
          }
        : undecided('Shape has not run yet.')),
    }),
    node('voice', {
      status: voice?.decided ? staleOr('voice', approval(decisions, SHAPE_KEYS.filter((k) => k.startsWith('voice.')))) : 'empty',
      tab: 'shape',
      ...(voice?.decided
        ? {
            decision: `${voice.value.toneAttributes.join(' · ')} — “${voice.value.messagingHierarchy.primaryMessage}”`,
            source: voice.source,
            rationale: voice.value.writingPrinciples,
            alternatives: [],
          }
        : undecided('Shape has not run yet.')),
    }),
    node('visual', {
      status: visual?.decided ? staleOr('visualDirection', approval(decisions, VISUAL_KEYS)) : 'empty',
      tab: 'visual',
      ...(visual?.decided
        ? { decision: visual.value.mood, source: visual.source, rationale: visual.value.rationale, alternatives: [] }
        : undecided('Visual direction has not run yet.')),
    }),
    node('launch', {
      status: 'empty',
      tab: null,
      ...undecided('Launch comes together in Brand OS, after Stress Test and Consistency.'),
    }),
  ]
}

const NODE_STYLE: Record<NodeStatus, string> = {
  empty: 'border-dashed border-poster-ink/25 bg-white/70 text-poster-ink/45',
  assumption: 'border-dashed border-[#d4a72c] bg-[#f2c94c]/25',
  confirmed: 'border-poster-ink bg-poster-green',
  stale: 'border-[#d4a72c] bg-[#f2c94c] animate-pulse motion-reduce:animate-none',
}

const TAB_NAMES: Record<TabKey, string> = {
  position: 'Position',
  battle: 'Brand Battle',
  shape: 'Shape',
  visual: 'Visual',
  dna: 'Brand DNA',
}

export default function DnaTab({
  ws,
  projectId,
  onGo,
}: {
  ws: StrategyWorkspace | null
  projectId: string
  onGo: (tab: TabKey) => void
}) {
  const [selected, setSelected] = useState<NodeKey | null>(null)

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  if (!ws) {
    return (
      <EmptyState title="Nothing approved yet">
        Accept your first positioning decision to start building your Brand DNA.
      </EmptyState>
    )
  }

  const nodes = buildNodes(ws)
  const byKey = Object.fromEntries(nodes.map((n) => [n.key, n])) as Record<NodeKey, DnaNode>
  const active = selected ? byKey[selected] : null
  const confirmed = nodes.filter((n) => n.status === 'confirmed').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold">
          {confirmed} of {nodes.length} decisions approved · click a node to see why
        </p>
        <ul className="flex flex-wrap gap-3 text-[11px] font-extrabold uppercase tracking-wide" aria-label="Legend">
          {(['confirmed', 'assumption', 'stale', 'empty'] as NodeStatus[]).map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn('h-3 w-5 rounded-md border-2', NODE_STYLE[s], 'animate-none')} />
              {s === 'confirmed' ? 'Approved' : s === 'assumption' ? 'Proposed' : s === 'stale' ? 'Needs update' : 'Empty'}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative aspect-[16/11] min-h-[380px] w-full overflow-hidden rounded-3xl border-2 border-poster-ink/15 bg-white/60">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {EDGES.map(([a, b]) => {
              const from = byKey[a]
              const to = byKey[b]
              const lit = selected === a || selected === b
              const staleEdge = to.status === 'stale'
              return (
                <line
                  key={`${a}-${b}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  vectorEffect="non-scaling-stroke"
                  className={cn(
                    'transition-[stroke,stroke-width] duration-200',
                    lit ? 'stroke-poster-ink' : staleEdge ? 'stroke-[#d4a72c]' : 'stroke-poster-ink/20',
                  )}
                  strokeWidth={lit ? 2.5 : 1.5}
                  strokeDasharray={to.status === 'empty' || staleEdge ? '5 5' : undefined}
                />
              )
            })}
          </svg>

          {nodes.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => setSelected(selected === n.key ? null : n.key)}
              aria-pressed={selected === n.key}
              aria-label={`${n.label}: ${n.statusText}`}
              style={{ left: `${n.x}%`, top: `${n.y}%` }}
              className={cn(
                'absolute w-[min(26%,170px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 px-3 py-2 text-left transition-transform duration-200 hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/50',
                NODE_STYLE[n.status],
                selected === n.key && 'scale-[1.06] shadow-[4px_4px_0_0_#111]',
              )}
            >
              <span className="block text-[11px] font-extrabold uppercase tracking-wide">{n.label}</span>
              <span className="mt-0.5 line-clamp-2 block text-xs font-semibold leading-tight">
                {n.decision ?? n.statusText}
              </span>
            </button>
          ))}
        </div>

        {active ? (
          <aside
            aria-label={`${active.label} details`}
            className="space-y-4 rounded-3xl border-2 border-poster-ink bg-white p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-2xl uppercase leading-none tracking-[-0.03em]">{active.label}</h3>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close details" className={cn(btnSecondary, 'h-8 px-3 text-xs')}>
                ✕
              </button>
            </div>
            <div>
              <FieldLabel>Decision</FieldLabel>
              <p className="mt-1 font-semibold leading-snug">{active.decision ?? '—'}</p>
            </div>
            {active.rationale.length > 0 && (
              <div>
                <FieldLabel>Rationale</FieldLabel>
                <div className="mt-2">
                  <DotList items={active.rationale.slice(0, 4)} />
                </div>
              </div>
            )}
            <div>
              <FieldLabel>Source</FieldLabel>
              <p className="mt-1 break-words font-mono text-xs font-semibold text-poster-ink/70">{active.source}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <FieldLabel>Confidence</FieldLabel>
              {active.confidence ? (
                <ConfidenceTag value={active.confidence} />
              ) : (
                <span className="text-xs font-semibold text-poster-ink/50">Not self-assessed by this stage</span>
              )}
            </div>
            <div>
              <FieldLabel>Status</FieldLabel>
              <p className="mt-1 text-sm font-bold">{active.statusText}</p>
            </div>
            {AFFECTS[active.key].length > 0 && (
              <div>
                <FieldLabel>Affects</FieldLabel>
                <p className="mt-1 text-sm font-semibold">→ {AFFECTS[active.key].map((k) => LABELS[k]).join(' → ')}</p>
              </div>
            )}
            {active.alternatives.length > 0 && (
              <div>
                <FieldLabel>Alternatives</FieldLabel>
                <div className="mt-2">
                  <DotList items={active.alternatives} tone="amber" />
                </div>
              </div>
            )}
            {active.tab === 'discover' ? (
              <Link href={`/project/${projectId}/discover`} className={btnPrimary}>
                Change in Discovery →
              </Link>
            ) : active.tab ? (
              <button type="button" onClick={() => onGo(active.tab as TabKey)} className={btnPrimary}>
                Change on {TAB_NAMES[active.tab as TabKey]} →
              </button>
            ) : null}
          </aside>
        ) : (
          <p className="self-start rounded-3xl border-2 border-dashed border-poster-ink/25 p-5 text-sm font-semibold text-poster-ink/55">
            Select a node to see its decision, rationale, source, confidence and what it affects.
          </p>
        )}
      </div>
    </div>
  )
}
