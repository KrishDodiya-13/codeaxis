'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrandState, ConsistencyFinding, DecisionName } from 'brandstate'
import { loadProject, newId, type Project } from '@/lib/projects'
import { loadWorkspace, logEntry, saveWorkspace, type Stage, type StrategyWorkspace } from '@/lib/strategy'
import { flagForUpdate } from '@/lib/stress'
import {
  loadConsistency,
  saveConsistency,
  type ConsistencyHistory,
  type ContentCheck,
  type ContentCheckResult,
} from '@/lib/consistency'
import { PosterRoom } from '@/components/landing/poster-section'
import WorkflowNav from '@/components/project/workflow-nav'
import HoverLetters from '@/components/hover-letters'
import { Arrow, EmptyState, SPRING, Swash, btnPrimary, btnSecondary } from '@/components/strategy/ui'
import { cn } from '@/lib/utils'
import { ContentInput, ContentResults, OVERALL_STYLE } from './content-check'
import BrandCheck, { findingId } from './brand-check'

type Mode = 'content' | 'brand'

interface ApiError {
  message: string
  detail?: string
}

/** Same error contract as the other pages: `{ error, detail? }`, detail in development only. */
async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const message = typeof record.error === 'string' ? record.error : 'The request failed.'
    const detail = record.detail === undefined ? undefined : typeof record.detail === 'string' ? record.detail : JSON.stringify(record.detail)
    const headline = detail && message.endsWith(` — ${detail}`) ? message.slice(0, -(detail.length + 3)) : message
    throw Object.assign(new Error(headline), { detail })
  }
  return data as T
}

const toError = (e: unknown): ApiError => ({
  message: e instanceof Error ? e.message : 'The check failed.',
  detail: (e as { detail?: string }).detail,
})

/** Self-check dimension → the Brand DNA decision it belongs to, for flagging Strategy. */
const DIMENSION_DECISION: Record<ConsistencyFinding['conflictingElements'][number], DecisionName> = {
  audience: 'audience',
  positioning: 'positioning',
  personality: 'personality',
  voice: 'voice',
  visualDirection: 'visualDirection',
  messaging: 'voice',
  valueProposition: 'valueProposition',
  differentiator: 'differentiator',
}

export default function ConsistencyWorkspace({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null>(null)
  const [ws, setWs] = useState<StrategyWorkspace | null>(null)
  const [history, setHistory] = useState<ConsistencyHistory>({ projectId: id, checks: [] })
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<Mode>('content')

  const [draft, setDraft] = useState('')
  const [current, setCurrent] = useState<ContentCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [contentError, setContentError] = useState<ApiError | null>(null)

  const [brandRunning, setBrandRunning] = useState(false)
  const [brandError, setBrandError] = useState<(ApiError & { retry: () => void }) | null>(null)

  const wsRef = useRef<StrategyWorkspace | null>(null)
  const historyRef = useRef<ConsistencyHistory>(history)

  const commitWs = useCallback((next: StrategyWorkspace) => {
    const saved = saveWorkspace(next)
    wsRef.current = saved
    setWs(saved)
    return saved
  }, [])

  const commitHistory = useCallback((next: ConsistencyHistory) => {
    const saved = saveConsistency(next)
    historyRef.current = saved
    setHistory(saved)
  }, [])

  useEffect(() => {
    const w = loadWorkspace(id)
    const h = loadConsistency(id)
    wsRef.current = w
    historyRef.current = h
    setProject(loadProject(id))
    setWs(w)
    setHistory(h)
    const last = h.checks[0] ?? null
    setCurrent(last)
    setDraft(last ? (last.repaired ?? last.content) : '')
    setLoaded(true)
  }, [id])

  /* ---------------- content check ---------------- */

  const runContentCheck = useCallback(
    async (text: string) => {
      const w = wsRef.current
      if (!w || !text.trim()) return
      setChecking(true)
      setContentError(null)
      try {
        const { result } = await post<{ result: ContentCheckResult }>('/api/consistency', { action: 'content', state: w.state, content: text.trim() })
        const check: ContentCheck = { id: newId(), at: new Date().toISOString(), content: text.trim(), result }
        setCurrent(check)
        commitHistory({ ...historyRef.current, checks: [check, ...historyRef.current.checks] })
      } catch (e) {
        setContentError(toError(e))
      } finally {
        setChecking(false)
      }
    },
    [commitHistory],
  )

  /** Records what the user did with the repair and, when applied, rewrites their copy. */
  const decideRepair = (decision: 'applied' | 'kept' | 'edited', replacement?: string) => {
    if (!current?.result.repair) return
    const { original, suggestion } = current.result.repair
    const repaired = decision === 'kept' ? undefined : current.content.replace(original, replacement ?? suggestion)
    const next: ContentCheck = { ...current, repair: decision, ...(repaired ? { repaired } : {}) }
    setCurrent(next)
    if (repaired) setDraft(repaired)
    commitHistory({ ...historyRef.current, checks: historyRef.current.checks.map((c) => (c.id === next.id ? next : c)) })
  }

  /* ---------------- brand self-check ---------------- */

  const refreshDna = useCallback(
    async (state: BrandState) => {
      try {
        const res = await post<{ dna: StrategyWorkspace['dna'] }>('/api/strategy', { action: 'dna', state })
        const w = wsRef.current
        if (w && w.state === state) commitWs({ ...w, dna: res.dna })
      } catch (e) {
        console.warn('[brandos] could not refresh Brand DNA', e)
      }
    },
    [commitWs],
  )

  const runBrandCheck = useCallback(async () => {
    const w = wsRef.current
    if (!w) return
    setBrandRunning(true)
    setBrandError(null)
    try {
      const res = await post<{ state: BrandState; dna: StrategyWorkspace['dna'] }>('/api/consistency', { action: 'brand', state: w.state })
      const n = res.state.consistency.findings.filter((f) => (f.status ?? 'open') === 'open').length
      commitWs({ ...w, state: res.state, dna: res.dna, history: [...w.history, logEntry(`Brand self-check: ${n} conflict${n === 1 ? '' : 's'}`)] })
    } catch (e) {
      setBrandError({ ...toError(e), retry: () => void runBrandCheck() })
    } finally {
      setBrandRunning(false)
    }
  }, [commitWs])

  /** Accept or keep a self-check correction; accepting flags the parts involved in Strategy. */
  const decideFinding = (finding: ConsistencyFinding, status: 'resolved' | 'acknowledged' | 'open') => {
    const w = wsRef.current
    if (!w) return
    const key = findingId(finding)
    const findings = w.state.consistency.findings.map((f) => (findingId(f) === key ? { ...f, status } : f))
    const state: BrandState = {
      ...w.state,
      updatedAt: new Date().toISOString(),
      consistency: { ...w.state.consistency, findings, status: findings.some((f) => (f.status ?? 'open') === 'open') ? 'issues-found' : 'consistent' },
    }
    let next: StrategyWorkspace = {
      ...w,
      state,
      history: [...w.history, logEntry(`Self-check: ${status === 'resolved' ? 'correction accepted' : status === 'acknowledged' ? 'kept as is' : 'reopened'}`)],
    }
    if (status === 'resolved') {
      const flagged = new Set<Stage>()
      for (const d of finding.conflictingElements) {
        const r = flagForUpdate(next, DIMENSION_DECISION[d], 'Consistency correction')
        next = r.ws
        r.flagged.forEach((s) => flagged.add(s))
      }
    }
    commitWs(next)
    void refreshDna(state)
  }

  /* ---------------- render ---------------- */

  if (!loaded) return <main className="min-h-[100svh] bg-poster-paper" />

  if (!project) {
    return (
      <main className="relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden bg-poster-paper p-6 text-poster-ink">
        <PosterRoom />
        <div className="relative z-10 max-w-md rounded-3xl border-2 border-poster-ink bg-white p-8 text-center">
          <h1 className="font-display text-3xl uppercase tracking-[-0.03em]">
            <HoverLetters text="Project not found" />
          </h1>
          <p className="mt-3 font-semibold text-poster-ink/60">Projects are saved in the browser they were created in. This one isn&apos;t in this browser.</p>
          <Link href="/new" className={cn(btnPrimary, 'mt-6 h-12 px-6 text-base')}>
            Start a new project <Arrow />
          </Link>
        </div>
      </main>
    )
  }

  const state = ws?.state ?? null
  const unlocked = !!state?.selectedStrategy
  const selfStatus = state?.consistency.status
  const selfOpen = state?.consistency.findings.filter((f) => (f.status ?? 'open') === 'open').length ?? 0

  return (
    <main className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-poster-paper text-poster-ink antialiased lg:h-[100svh]">
      <PosterRoom />
      <WorkflowNav projectId={id} current="consistency" />

      <div className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 pt-5">
        <h1 className="font-display text-[1.9rem] uppercase leading-none tracking-[-0.04em]">
          <span className="relative inline-block">
            <HoverLetters text="Consistency" />
            <Swash className="top-[0.78em] h-[0.45em]" />
          </span>
          <HoverLetters text="." className="text-poster-green" />
        </h1>

        {unlocked && (
          <div role="tablist" aria-label="Consistency checks" className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: 'content', label: 'Check content', badge: current ? current.result.overall : null },
                { key: 'brand', label: 'Brand self-check', badge: selfStatus && selfStatus !== 'not-yet-checked' ? (selfOpen ? `${selfOpen} open` : 'clean') : null },
              ] as const
            ).map((t, i) => {
              const selected = mode === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setMode(t.key)}
                  className={cn(
                    'group inline-flex items-center gap-2 whitespace-nowrap rounded-full border-2 py-1 pl-1 pr-4 text-xs font-extrabold uppercase tracking-wide',
                    'transition-[transform,box-shadow,border-color,background-color] duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40',
                    SPRING,
                    selected
                      ? '-translate-y-0.5 border-poster-ink bg-white shadow-[3px_3px_0_0_#111]'
                      : 'border-poster-ink/40 bg-poster-paper hover:-translate-y-0.5 hover:border-poster-ink hover:bg-white hover:shadow-[3px_3px_0_0_#5fb57a]',
                  )}
                >
                  <span className={cn('rounded-full px-2 py-0.5 group-hover:animate-wiggle motion-reduce:group-hover:animate-none', selected ? 'bg-poster-green' : 'bg-poster-ink/10')}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {t.label}
                  {t.badge && (
                    <span key={t.badge} className="rounded-full bg-poster-ink/5 px-2 text-[10px] animate-in zoom-in-50 duration-300">
                      {t.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Content: input 45% / results 55%, per the plan. Self-check: one full-width panel. */}
      <div className="relative z-10 flex flex-1 flex-col gap-5 p-5 lg:min-h-0 lg:flex-row">
        {!unlocked ? (
          <div className="flex min-h-0 flex-1 flex-col rounded-3xl border-2 border-poster-ink bg-white/80 p-5">
            <EmptyState
              title="Strategy comes first"
              stamp="Locked"
              action={
                <Link href={`/project/${id}/strategy`} className={btnPrimary}>
                  Go to Strategy <Arrow />
                </Link>
              }
            >
              There&apos;s no Brand DNA to check against until a direction is chosen in Strategy.
            </EmptyState>
          </div>
        ) : mode === 'content' ? (
          <>
            <div key="in" className="flex min-h-0 min-w-0 flex-col lg:w-[45%]">
              <ContentInput
                state={state!}
                draft={draft}
                setDraft={setDraft}
                checking={checking}
                onCheck={() => void runContentCheck(draft)}
                history={history.checks}
                onOpen={(c) => {
                  setCurrent(c)
                  setDraft(c.repaired ?? c.content)
                }}
              />
            </div>
            <div key="out" className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ContentResults
                check={current}
                checking={checking}
                error={contentError}
                onRetry={() => void runContentCheck(draft)}
                onDismiss={() => setContentError(null)}
                onUse={() => decideRepair('applied')}
                onKeep={() => decideRepair('kept')}
                onEdit={(text) => decideRepair('edited', text)}
                onRecheck={() => void runContentCheck(current?.repaired ?? draft)}
              />
            </div>
          </>
        ) : (
          <div key="brand" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <BrandCheck
              state={state!}
              running={brandRunning}
              error={brandError}
              onRun={() => void runBrandCheck()}
              onDismissError={() => setBrandError(null)}
              onDecide={decideFinding}
            />
          </div>
        )}
      </div>

      <footer className="relative z-10 flex flex-wrap items-center gap-4 border-t-2 border-poster-ink bg-poster-paper px-6 py-4">
        <Link href={`/project/${id}/stress-test`} className={cn(btnSecondary, 'h-11')}>
          <span aria-hidden="true" className={cn('inline-block transition-transform duration-300 group-hover:-translate-x-1', SPRING)}>
            ←
          </span>
          Back to Stress Test
        </Link>
        {current && (
          <span className={cn('hidden rounded-full border-2 px-3 py-1 text-xs font-extrabold uppercase sm:inline-flex', OVERALL_STYLE[current.result.overall].chip)}>
            Last check · {current.result.overall}
          </span>
        )}
        <Link href={`/project/${id}/brand-os`} className={cn(btnPrimary, 'ml-auto h-11 px-6 text-base')}>
          Continue to Brand OS <Arrow />
        </Link>
      </footer>
    </main>
  )
}
