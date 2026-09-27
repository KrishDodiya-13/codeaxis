'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { BrandState, Direction } from 'brandstate'
import { ideaForEngine, loadProject, type Project } from '@/lib/projects'
import {
  DEPENDENTS,
  STAGES,
  STAGE_LABELS,
  STAGE_PROGRESS,
  clearDecisions,
  isStageDone,
  loadWorkspace,
  logEntry,
  saveWorkspace,
  selectedOption,
  type DecisionStatus,
  type Stage,
  type StrategyResponse,
  type StrategyWorkspace as Workspace,
  type TabKey,
} from '@/lib/strategy'
import { PosterRoom } from '@/components/landing/poster-section'
import WorkflowNav from '@/components/project/workflow-nav'
import { Panel } from '@/components/project/panel'
import { cn } from '@/lib/utils'
import HoverLetters from '@/components/hover-letters'
import { Arrow, ErrorCard, ProgressSteps, SPRING, Swash, btnPrimary, btnSecondary, linkButton, toLines } from './ui'
import PositionTab from './position-tab'
import BattleTab from './battle-tab'
import ShapeTab, { SHAPE_STAGES } from './shape-tab'
import VisualTab from './visual-tab'
import DnaTab from './dna-tab'
import ReasoningPanel from './reasoning-panel'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'position', label: 'Position' },
  { key: 'battle', label: 'Brand Battle' },
  { key: 'shape', label: 'Shape' },
  { key: 'visual', label: 'Visual' },
  { key: 'dna', label: 'Brand DNA' },
]

type Changed = keyof typeof DEPENDENTS

interface Run {
  stages: Stage[]
  index: number
  failed: boolean
}

/** Why a tab is still locked, or null when it can be opened. The engine's order, not a UI preference. */
function lockReason(tab: TabKey, state: BrandState | null): string | null {
  switch (tab) {
    case 'position':
    case 'dna':
      return null
    case 'battle':
      return isStageDone(state, 'positioning') ? null : 'Generate positioning first'
    case 'shape':
      return state?.selectedStrategy ? null : 'Choose a direction in Brand Battle first'
    case 'visual':
      return isStageDone(state, 'personality') ? null : 'Generate the brand shape first'
  }
}

function tabDone(tab: TabKey, state: BrandState | null): boolean {
  switch (tab) {
    case 'position':
      return isStageDone(state, 'positioning')
    case 'battle':
      return !!state?.selectedStrategy
    case 'shape':
      return SHAPE_STAGES.every((s) => isStageDone(state, s))
    case 'visual':
      return isStageDone(state, 'visualDirection')
    case 'dna':
      return false
  }
}

/** Opens on the first unfinished step, so a returning user lands where they left off. */
function initialTab(ws: Workspace | null): TabKey {
  const state = ws?.state ?? null
  return (['position', 'battle', 'shape', 'visual'] as TabKey[]).find((t) => !tabDone(t, state)) ?? 'dna'
}

/** Adds the stages that depend on `changed` (and have already run) to the stale set. */
function withStale(ws: Workspace, changed: Changed, cause: string, exclude: Stage[] = []): Workspace {
  const affected = DEPENDENTS[changed].filter((s) => isStageDone(ws.state, s) && !exclude.includes(s))
  if (affected.length === 0) return ws
  const stale = STAGES.filter((s) => ws.stale.includes(s) || affected.includes(s))
  return { ...ws, stale, staleCause: cause }
}

/** Writes a user edit into the state. Lists are edited one item per line. */
function applyEdit(state: BrandState, key: string, text: string): BrandState {
  const [section, field] = key.split('.')
  const lines = toLines(text)
  const next = structuredClone(state)
  switch (section) {
    case 'positioning':
      ;(next.positioning as unknown as Record<string, string>)[field] = text
      break
    case 'personality':
      ;(next.personality as unknown as Record<string, string[]>)[field] = lines
      break
    case 'naming':
      next.naming.territories = lines
      break
    case 'voice':
      if (field === 'messagingHierarchy') {
        const [primaryMessage = '', ...supportingMessages] = lines
        next.voice.messagingHierarchy = { primaryMessage, supportingMessages }
      } else {
        ;(next.voice as unknown as Record<string, string[]>)[field] = lines
      }
      break
    case 'visualDirection':
      if (field === 'colors' || field === 'avoid') next.visualDirection[field] = lines
      else (next.visualDirection as unknown as Record<string, string>)[field] = text
      break
  }
  return next
}

/** A failed request: the message to show, and the technical detail when the server sent one. */
class StrategyRequestError extends Error {
  readonly detail?: string

  constructor(message: string, detail?: string) {
    super(message)
    this.name = 'StrategyRequestError'
    this.detail = detail
  }
}

async function post(body: unknown): Promise<StrategyResponse> {
  const res = await fetch('/api/strategy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const message = typeof record.error === 'string' ? record.error : 'The strategy request failed.'
    // In development the route appends ` — <detail>` to the message and also sends the
    // detail on its own; strip the suffix so the card leads with the plain message.
    const detail =
      record.detail === undefined ? undefined : typeof record.detail === 'string' ? record.detail : JSON.stringify(record.detail)
    const headline = detail && message.endsWith(` — ${detail}`) ? message.slice(0, -(detail.length + 3)) : message
    throw new StrategyRequestError(headline, detail)
  }
  if (!data || typeof data !== 'object' || !('state' in data) || !('dna' in data)) {
    throw new Error('The response was not a valid brand state.')
  }
  return data as StrategyResponse
}

export default function StrategyWorkspace({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null>(null)
  const [ws, setWs] = useState<Workspace | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<TabKey>('position')
  const [run, setRun] = useState<Run | null>(null)
  const [error, setError] = useState<{ message: string; detail?: string; retry?: () => void } | null>(null)

  // Async calls read the latest workspace from here, not from a stale closure.
  const wsRef = useRef<Workspace | null>(null)
  const projectRef = useRef<Project | null>(null)
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({})

  const commit = useCallback((next: Workspace) => {
    const saved = saveWorkspace(next)
    wsRef.current = saved
    setWs(saved)
    return saved
  }, [])

  useEffect(() => {
    const p = loadProject(id)
    const w = loadWorkspace(id)
    projectRef.current = p
    wsRef.current = w
    setProject(p)
    setWs(w)
    setTab(initialTab(w))
    setLoaded(true)
  }, [id])

  /** Recomputes the Brand DNA after a user edit. No model call; a failure keeps the last DNA. */
  const refreshDna = useCallback(
    async (state: BrandState) => {
      try {
        const res = await post({ action: 'dna', state })
        const current = wsRef.current
        if (current && current.state === state) commit({ ...current, dna: res.dna })
      } catch (e) {
        console.warn('[brandos] could not refresh Brand DNA', e)
      }
    },
    [commit],
  )

  /** Runs stages one at a time — one real model call each — and saves after every success. */
  const runStages = useCallback(
    async (stages: Stage[]) => {
      const p = projectRef.current
      setError(null)
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i]
        setRun({ stages, index: i, failed: false })
        const base = wsRef.current
        const body = base
          ? { action: 'run', stage, state: base.state }
          : {
              action: 'run',
              stage,
              seed: {
                idea: ideaForEngine(p!),
                ...(p!.productType ? { productType: p!.productType } : {}),
                discovery: p!.discovery,
              },
            }
        try {
          const res = await post(body)
          const prev = wsRef.current
          const stale = (prev?.stale ?? []).filter((s) => s !== stage)
          let next: Workspace = {
            projectId: id,
            state: res.state,
            dna: res.dna,
            decisions: clearDecisions(prev?.decisions ?? {}, stage),
            stale,
            staleCause: stale.length ? (prev?.staleCause ?? null) : null,
            history: [...(prev?.history ?? []), logEntry(`${STAGE_LABELS[stage]} ${isStageDone(prev?.state ?? null, stage) ? 'regenerated' : 'generated'}`)],
          }
          // Regenerating an upstream decision leaves what was built on it out of date —
          // except stages later in this same run, which are about to be rebuilt anyway.
          if (isStageDone(prev?.state ?? null, stage) && (stage === 'positioning' || stage === 'personality')) {
            next = withStale(next, stage, `${STAGE_LABELS[stage]} regenerated`, stages.slice(i + 1))
          }
          commit(next)
        } catch (e) {
          setRun({ stages, index: i, failed: true })
          setError({
            message: e instanceof Error ? e.message : 'The strategy request failed.',
            detail: e instanceof StrategyRequestError ? e.detail : undefined,
            retry: () => void runStages(stages.slice(i)),
          })
          return
        }
      }
      setRun(null)
    },
    [commit, id],
  )

  /** A user change to the state: logged, saved, downstream marked stale, DNA recomputed. */
  const updateState = useCallback(
    (mutate: (s: BrandState) => BrandState, opts: { log: string; decision?: [string, DecisionStatus]; changed?: Changed; cause?: string }) => {
      const w = wsRef.current
      if (!w) return
      const state = { ...mutate(w.state), updatedAt: new Date().toISOString() }
      let next: Workspace = {
        ...w,
        state,
        decisions: opts.decision ? { ...w.decisions, [opts.decision[0]]: opts.decision[1] } : w.decisions,
        history: [...w.history, logEntry(opts.log)],
      }
      if (opts.changed) next = withStale(next, opts.changed, opts.cause ?? opts.log)
      commit(next)
      void refreshDna(state)
    },
    [commit, refreshDna],
  )

  const onDecide = (key: string, label: string, status: 'accepted' | 'rejected') => {
    const w = wsRef.current
    if (!w) return
    commit({
      ...w,
      decisions: { ...w.decisions, [key]: status },
      history: [...w.history, logEntry(`${label} ${status}`)],
    })
  }

  const onEdit = (key: string, label: string, text: string) => {
    const changed: Changed | undefined = key.startsWith('positioning.')
      ? 'positioning'
      : key.startsWith('personality.')
        ? 'personality'
        : undefined
    updateState((s) => applyEdit(s, key, text), {
      log: `${label} edited`,
      decision: [key, 'edited'],
      changed,
      cause: `${label} changed`,
    })
  }

  const onChoose = (direction: Direction) => {
    const w = wsRef.current
    if (!w) return
    const previous = w.state.selectedStrategy?.direction
    if (previous === direction) return
    const name = w.state.strategyOptions.find((o) => o.direction === direction)?.name ?? direction
    updateState((s) => ({ ...s, selectedStrategy: { direction, chosenAt: new Date().toISOString() } }), {
      log: `Battle: “${name}” selected`,
      decision: ['selectedStrategy.direction', 'accepted'],
      changed: previous ? 'selectedStrategy' : undefined,
      cause: 'Chosen direction changed',
    })
  }

  const onEditDirection = (direction: Direction, positioning: string) => {
    const w = wsRef.current
    if (!w) return
    const name = w.state.strategyOptions.find((o) => o.direction === direction)?.name ?? direction
    updateState(
      (s) => ({ ...s, strategyOptions: s.strategyOptions.map((o) => (o.direction === direction ? { ...o, positioning } : o)) }),
      {
        log: `“${name}” positioning edited`,
        decision: ['selectedStrategy.positioning', 'edited'],
        changed: w.state.selectedStrategy?.direction === direction ? 'selectedStrategy' : undefined,
        cause: 'Chosen direction edited',
      },
    )
  }

  /** Regenerating the directions drops the choice in the same step, so it never points at nothing. */
  const onGenerateBattle = () => {
    const w = wsRef.current
    if (w?.state.selectedStrategy) {
      const state = { ...w.state }
      delete state.selectedStrategy
      commit(
        withStale(
          { ...w, state, history: [...w.history, logEntry('Chosen direction cleared to regenerate directions')] },
          'selectedStrategy',
          'Directions regenerated',
        ),
      )
    }
    void runStages(['strategyOptions'])
  }

  const onUpdateAffected = () => {
    const w = wsRef.current
    if (!w) return
    void runStages(STAGES.filter((s) => w.stale.includes(s)))
  }

  const onKeepAsIs = () => {
    const w = wsRef.current
    if (!w) return
    commit({
      ...w,
      stale: [],
      staleCause: null,
      history: [...w.history, logEntry(`Kept ${w.stale.map((s) => STAGE_LABELS[s]).join(', ')} as they are`)],
    })
  }

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const open = TABS.filter((t) => !lockReason(t.key, wsRef.current?.state ?? null))
    const i = open.findIndex((t) => t.key === tab)
    const next = open[(i + (e.key === 'ArrowRight' ? 1 : -1) + open.length) % open.length]
    if (!next) return
    e.preventDefault()
    setTab(next.key)
    tabRefs.current[next.key]?.focus()
  }

  if (!loaded) {
    return <main className="min-h-[100svh] bg-poster-paper" />
  }

  if (!project) {
    return (
      <main className="relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden bg-poster-paper p-6 text-poster-ink">
        <PosterRoom />
        <div className="relative z-10 max-w-md rounded-3xl border-2 border-poster-ink bg-white p-8 text-center">
          <h1 className="font-display text-3xl uppercase tracking-[-0.03em]">Project not found</h1>
          <p className="mt-3 font-semibold text-poster-ink/60">
            Projects are saved in the browser they were created in. This one isn&apos;t in this browser.
          </p>
          <Link
            href="/new"
            className="mt-6 inline-flex h-12 items-center rounded-full border-2 border-poster-ink bg-poster-green px-6 font-extrabold hover:bg-poster-ink hover:text-poster-paper"
          >
            Start a new project →
          </Link>
        </div>
      </main>
    )
  }

  const state = ws?.state ?? null
  const busy = !!run && !run.failed
  const option = state ? selectedOption(state) : undefined
  const ready = !!option && SHAPE_STAGES.every((s) => isStageDone(state, s)) && isStageDone(state, 'visualDirection')
  const activeIndex = TABS.findIndex((t) => t.key === tab)
  const staleLabels = (ws?.stale ?? []).map((s) => STAGE_LABELS[s])
  const needsDirection = (ws?.stale ?? []).length > 0 && !state?.selectedStrategy
  // While a first generation runs or has just failed, the progress list and error card
  // are the whole story; the tab's empty state would only repeat its own Generate button.
  const hasOutput: Record<TabKey, boolean> = {
    position: isStageDone(state, 'positioning'),
    battle: (state?.strategyOptions.length ?? 0) > 0,
    shape: SHAPE_STAGES.some((s) => isStageDone(state, s)),
    visual: isStageDone(state, 'visualDirection'),
    dna: true,
  }
  const hideContent = (!!run || !!error) && !hasOutput[tab]
  const milestones = [
    { label: 'Positioning', done: isStageDone(state, 'positioning') },
    { label: option ? `Direction · ${option.name}` : 'Direction', done: !!option },
    { label: 'Shape', done: SHAPE_STAGES.every((s) => isStageDone(state, s)) },
    { label: 'Visual', done: isStageDone(state, 'visualDirection') },
  ]

  const content = (() => {
    switch (tab) {
      case 'position':
        return (
          <PositionTab
            projectId={id}
            hasDiscovery={!!project.discovery}
            openQuestions={project.discovery?.missingInformation.length ?? 0}
            state={state}
            decisions={ws?.decisions ?? {}}
            busy={busy}
            onGenerate={() => void runStages(['positioning'])}
            onDecide={onDecide}
            onEdit={(field, label, value) => onEdit(`positioning.${field}`, label, value)}
            onContinue={() => setTab('battle')}
          />
        )
      case 'battle':
        return (
          <BattleTab
            state={state}
            busy={busy}
            onGenerate={onGenerateBattle}
            onChoose={onChoose}
            onEditDirection={onEditDirection}
            onContinue={() => setTab('shape')}
          />
        )
      case 'shape':
        return (
          <ShapeTab
            state={state}
            decisions={ws?.decisions ?? {}}
            stale={ws?.stale ?? []}
            busy={busy}
            onGenerate={(stages) => void runStages(stages)}
            onDecide={onDecide}
            onEdit={onEdit}
            onSelectName={(name) =>
              updateState((s) => ({ ...s, naming: { ...s.naming, selectedName: name } }), { log: `Name “${name}” selected` })
            }
            onSelectTagline={(t) =>
              updateState((s) => ({ ...s, naming: { ...s.naming, tagline: { ...s.naming.tagline, selected: t } } }), {
                log: `Tagline “${t}” selected`,
              })
            }
            onContinue={() => setTab('visual')}
          />
        )
      case 'visual':
        return (
          <VisualTab
            state={state}
            decisions={ws?.decisions ?? {}}
            stale={ws?.stale ?? []}
            busy={busy}
            onGenerate={() => void runStages(['visualDirection'])}
            onDecide={onDecide}
            onEdit={onEdit}
            onContinue={() => setTab('dna')}
          />
        )
      case 'dna':
        return <DnaTab ws={ws} projectId={id} onGo={setTab} />
    }
  })()

  return (
    <main className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-poster-paper text-poster-ink antialiased lg:h-[100svh]">
      <PosterRoom />
      <WorkflowNav projectId={id} current="strategy" />

      <div className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 pt-5">
        {/* Same headline treatment as /new: letters lift on hover, a swash draws in once. */}
        <h1 className="font-display text-[1.9rem] uppercase leading-none tracking-[-0.04em]">
          <span className="relative inline-block">
            <HoverLetters text="Strategy" />
            <Swash className="top-[0.78em] h-[0.45em]" />
          </span>
          <HoverLetters text="." className="text-poster-green" />
        </h1>
        <div role="tablist" aria-label="Strategy stages" onKeyDown={onTabKey} className="flex flex-wrap items-center gap-2">
          {TABS.map((t, i) => {
            const locked = lockReason(t.key, state)
            const selected = t.key === tab
            const done = tabDone(t.key, state)
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[t.key] = el
                }}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={selected}
                aria-controls="strategy-tabpanel"
                tabIndex={selected ? 0 : -1}
                disabled={!!locked}
                title={locked ?? undefined}
                onClick={() => setTab(t.key)}
                className={cn(
                  'group inline-flex items-center gap-2 whitespace-nowrap rounded-full border-2 py-1 pl-1 pr-4 text-xs font-extrabold uppercase tracking-wide focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40',
                  'transition-[transform,box-shadow,border-color,color,background-color] duration-300 motion-reduce:transition-none',
                  SPRING,
                  selected && '-translate-y-0.5 border-poster-ink bg-white shadow-[3px_3px_0_0_#111]',
                  !selected &&
                    !locked &&
                    'border-poster-ink/40 bg-poster-paper hover:-translate-y-0.5 hover:border-poster-ink hover:bg-white hover:text-poster-green hover:shadow-[3px_3px_0_0_#5fb57a] motion-reduce:hover:translate-y-0',
                  locked && 'cursor-not-allowed border-poster-ink/15 text-poster-ink/35',
                )}
              >
                {/* The number tag wiggles on hover, like the landing's tags. */}
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 transition-colors duration-300',
                    !locked && 'group-hover:animate-wiggle motion-reduce:group-hover:animate-none',
                    selected || done ? 'bg-poster-green' : 'bg-poster-ink/10',
                  )}
                >
                  {done ? '✓' : String(i + 1).padStart(2, '0')}
                </span>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {ws && ws.stale.length > 0 && (
        <div
          role="status"
          className="relative z-10 mx-5 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-poster-ink bg-[#f2c94c] px-4 py-3 shadow-[4px_4px_0_0_#111] animate-in fade-in-0 slide-in-from-top-2 duration-300"
        >
          <p className="text-sm font-extrabold">
            ⚠ {ws.staleCause ?? 'A decision changed'} → {staleLabels.join(', ')} may need update.
            {needsDirection && <span className="font-semibold"> Choose a direction in Brand Battle to update them.</span>}
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <button type="button" onClick={onUpdateAffected} disabled={busy || needsDirection} className={cn(btnPrimary, 'h-9')}>
              Update affected only
            </button>
            <button type="button" onClick={onKeepAsIs} disabled={busy} className={linkButton}>
              Keep as is
            </button>
          </div>
        </div>
      )}

      <div className="relative z-10 grid flex-1 gap-5 p-5 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.42fr)]">
        <div role="tabpanel" id="strategy-tabpanel" aria-labelledby={`tab-${tab}`} className="flex min-h-0 flex-col">
          <Panel index={String(activeIndex + 1).padStart(2, '0')} label={TABS[activeIndex].label} className="flex-1" busy={busy}>
            {run && (
              <div className="mb-5">
                <ProgressSteps
                  steps={run.stages.map((s, j) => ({
                    label: STAGE_PROGRESS[s],
                    state: j < run.index ? 'done' : j === run.index ? (run.failed ? 'failed' : 'active') : 'queued',
                  }))}
                />
              </div>
            )}
            {error && (
              <div className="mb-5">
                <ErrorCard
                  message={error.message}
                  detail={error.detail}
                  onRetry={error.retry}
                  onDismiss={() => {
                    setError(null)
                    setRun(null)
                  }}
                />
              </div>
            )}
            {!hideContent && (
              // Keyed by tab so each switch replays a short rise-in.
              <div key={tab} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                {content}
              </div>
            )}
          </Panel>
        </div>
        <ReasoningPanel tab={tab} ws={ws} />
      </div>

      <footer className="relative z-10 flex flex-wrap items-center gap-4 border-t-2 border-poster-ink bg-poster-paper px-6 py-4">
        {/* Milestones fill green as they complete, like the workflow nav's done steps. */}
        <ol className="flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-wide" aria-label="Strategy progress">
          {milestones.map((m, i) => (
            <li key={i} className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 transition-colors duration-500',
                  m.done ? 'border-poster-ink bg-poster-green' : 'border-dashed border-poster-ink/30 text-poster-ink/45',
                )}
              >
                <span aria-hidden="true">{m.done ? '✓' : '○'}</span>
                <span className="max-w-[16rem] truncate">{m.label}</span>
                <span className="sr-only">{m.done ? '(done)' : '(to do)'}</span>
              </span>
              {i < milestones.length - 1 && (
                <span aria-hidden="true" className={cn('h-0.5 w-4 rounded-full', m.done ? 'bg-poster-ink' : 'bg-poster-ink/20')} />
              )}
            </li>
          ))}
        </ol>
        {ready ? (
          <Link
            href={`/project/${id}/stress-test`}
            className={cn(btnPrimary, 'ml-auto h-11 px-6 text-base')}
          >
            Proceed to Stress Test <Arrow />
          </Link>
        ) : (
          <span className={cn(btnSecondary, 'ml-auto cursor-default border-poster-ink/20 text-poster-ink/45 hover:text-poster-ink/45')}>
            Finish Shape and Visual to unlock Stress Test
          </span>
        )}
      </footer>
    </main>
  )
}
