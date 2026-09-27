'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrandState, StressTest, TestReport, TestType } from 'brandstate'
import { loadProject, type Project } from '@/lib/projects'
import { postJson as post } from '@/lib/api/client'
import { STAGE_LABELS, loadWorkspace, logEntry, saveWorkspace, selectedOption, type Stage, type StrategyWorkspace } from '@/lib/strategy'
import {
  SEVERITY_ORDER,
  TEST_META,
  TEST_ORDER,
  findingKey,
  flagForUpdate,
  loadStressRun,
  saveStressRun,
  type Outcome,
  type StressRun,
} from '@/lib/stress'
import { PosterRoom } from '@/components/landing/poster-section'
import WorkflowNav from '@/components/project/workflow-nav'
import { FieldLabel, Panel } from '@/components/project/panel'
import HoverLetters from '@/components/hover-letters'
import { Arrow, EmptyState, ErrorCard, SPRING, Stamp, Swash, btnPrimary, btnSecondary, linkButton } from '@/components/strategy/ui'
import { cn } from '@/lib/utils'
import FindingCard, { SEVERITY_STYLE } from './finding-card'

/* ------------------------------------------------------------------------------------ */
/* Data                                                                                 */

interface ApiError {
  message: string
  detail?: string
}

/** Same error contract as the strategy page: `{ error, detail? }`, detail in development only. */

interface StressResponse {
  state: BrandState
  dna: StrategyWorkspace['dna']
  reports: TestReport[]
}

const isOpen = (f: StressTest) => (f.status ?? 'open') === 'open'
const isBlocking = (f: StressTest) => isOpen(f) && (f.severity === 'critical' || f.severity === 'high')

const REPORT_BADGE: Record<TestReport['outcome'], { label: string; className: string }> = {
  pass: { label: '✓ Pass', className: 'bg-poster-green border-poster-ink' },
  'issues-found': { label: '✗ Issues', className: 'bg-[#e5484d] text-white border-[#c4282d]' },
  partial: { label: '~ Partial', className: 'bg-[#f2c94c] border-[#d4a72c]' },
  'not-testable': { label: '○ N/A', className: 'bg-white text-poster-ink/50 border-poster-ink/25' },
}

/* ------------------------------------------------------------------------------------ */
/* Pieces                                                                               */

function Elapsed() {
  const [s, setS] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const id = window.setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="tabular-nums">{s}s</span>
}

/** Phase 1: the weighty call to action, with the brand under test and what will attack it. */
function Hero({ state, onRun, disabled }: { state: BrandState; onRun: () => void; disabled: boolean }) {
  const option = selectedOption(state)
  const missing = [
    state.personality.traits.length === 0 && 'Personality',
    state.naming.candidates.length === 0 && 'Naming',
    state.voice.toneAttributes.length === 0 && 'Voice',
    state.visualDirection.mood === '' && 'Visual direction',
  ].filter(Boolean) as string[]

  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-dashed border-poster-ink/25 px-6 py-12 text-center animate-in fade-in-0 zoom-in-95 duration-500">
      {/* Poster decor: a slow dashed target and a drifting red dot. Purely decorative. */}
      <span aria-hidden="true" className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 animate-spin-slower rounded-full border-2 border-dashed border-poster-ink/15 motion-reduce:animate-none" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-10 -right-6 h-32 w-32 animate-bob rounded-full border-2 border-poster-ink bg-[#e5484d]/90 motion-reduce:animate-none" />
      <Stamp tone="white" className="absolute right-6 top-6">5 attacks</Stamp>

      <div className="relative mx-auto max-w-3xl">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-poster-ink/55">Your brand is ready.</p>
        <h2 className="mt-3 font-display text-[clamp(2.4rem,5.5vw,4.4rem)] uppercase leading-[0.92] tracking-[-0.045em]">
          <HoverLetters text="Will it survive" />{' '}
          <span className="relative inline-block">
            <HoverLetters text="scrutiny" />
            <Swash className="top-[0.7em] h-[0.5em]" />
          </span>
          <HoverLetters text="?" className="text-[#e5484d]" />
        </h2>

        {option && (
          <p className="mx-auto mt-5 inline-flex flex-wrap items-center justify-center gap-2 rounded-full border-2 border-poster-ink bg-white px-4 py-1.5 text-sm font-bold">
            <span className="text-poster-ink/50">Under test:</span>
            {state.naming.selectedName ?? 'Your brand'}
            {state.naming.tagline.selected && <span className="text-poster-ink/60">— “{state.naming.tagline.selected}”</span>}
            <span className="rounded-full bg-poster-ink/5 px-2 text-xs text-poster-ink/60">{option.name}</span>
          </p>
        )}

        {/* The weighty button: ink slab on a red hard shadow; lifts on hover, presses flat on click. */}
        <div className="mt-10">
          <button
            type="button"
            onClick={onRun}
            disabled={disabled}
            className={cn(
              'group relative inline-flex items-center gap-4 rounded-full border-2 border-poster-ink bg-poster-ink px-8 py-5 font-display text-[clamp(1.1rem,2.4vw,1.75rem)] uppercase tracking-[-0.02em] text-poster-paper',
              'shadow-[8px_8px_0_0_#e5484d] transition-[transform,box-shadow] duration-300',
              'hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[12px_12px_0_0_#e5484d]',
              'active:translate-x-2 active:translate-y-2 active:shadow-none',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e5484d]/40',
              'disabled:cursor-not-allowed disabled:opacity-60',
              'motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0',
              SPRING,
            )}
          >
            <span
              aria-hidden="true"
              className="grid h-11 w-11 place-items-center rounded-full border-2 border-poster-paper bg-[#e5484d] text-xl group-hover:animate-wiggle motion-reduce:group-hover:animate-none"
            >
              ✕
            </span>
            Try to break this brand
          </button>
        </div>

        <p className="mx-auto mt-8 max-w-lg text-sm font-semibold text-poster-ink/60">
          BRANDOS attacks your strategy across five dimensions. Every finding has to cite the exact decision it rests on — so
          you can check it, not just trust it.
        </p>

        <ul className="mt-5 flex flex-wrap justify-center gap-2">
          {TEST_ORDER.map((t, i) => (
            <li
              key={t}
              style={{ animationDelay: `${300 + i * 70}ms` }}
              className={cn(
                'group/t inline-flex items-center gap-2 rounded-full border-2 border-poster-ink bg-white py-1 pl-1 pr-3 text-xs font-extrabold uppercase tracking-wide',
                'animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-backwards duration-500',
                'transition-[transform,background-color] duration-300 hover:-rotate-2 hover:bg-poster-green',
                SPRING,
              )}
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-poster-ink text-poster-paper group-hover/t:animate-wiggle motion-reduce:group-hover/t:animate-none">
                {TEST_META[t].glyph}
              </span>
              {TEST_META[t].label}
            </li>
          ))}
        </ul>

        {missing.length > 0 && (
          <p className="mx-auto mt-6 max-w-lg rounded-2xl border-2 border-[#f2c94c] bg-[#f2c94c]/20 px-4 py-3 text-xs font-semibold">
            {missing.join(', ')} {missing.length === 1 ? "isn't" : "aren't"} done yet, so some tests will only be partial. You
            can still run it now.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Phase 2: the attack board. The engine runs every test in one model call, so while it
 * runs they all show as under attack together — no invented step-by-step. When the real
 * results land, each test's verdict is revealed in turn.
 */
function AttackBoard({ types, reports, revealed }: { types: TestType[]; reports: TestReport[] | null; revealed: number }) {
  return (
    <div className="animate-in fade-in-0 duration-300">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl uppercase leading-none tracking-[-0.03em]">
          <HoverLetters text={reports ? 'Reading the verdicts' : 'Stress testing your brand'} />
          {!reports && <span className="animate-pulse">…</span>}
        </h2>
        {!reports && (
          <span className="rounded-full bg-poster-ink px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-poster-paper">
            <Elapsed />
          </span>
        )}
      </div>
      <p className="mt-2 text-sm font-semibold text-poster-ink/55">
        All {types.length} run in one pass against your approved decisions{reports ? ' — revealing what each found.' : '.'}
      </p>

      <ol className="mt-6 space-y-2.5">
        {types.map((t, i) => {
          const report = reports?.find((r) => r.type === t)
          const shown = !!reports && i < revealed
          const badge = report ? REPORT_BADGE[report.outcome] : null
          return (
            <li
              key={t}
              style={{ animationDelay: `${i * 70}ms` }}
              className={cn(
                'relative flex items-center gap-4 overflow-hidden rounded-2xl border-2 px-4 py-3',
                'animate-in fade-in-0 slide-in-from-left-3 fill-mode-backwards duration-500 transition-[border-color,box-shadow] duration-300',
                shown ? 'border-poster-ink bg-white shadow-[4px_4px_0_0_#111]' : 'border-poster-ink/30 bg-white/70',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-poster-ink text-lg',
                  shown ? 'bg-poster-ink text-poster-paper' : 'animate-pulse bg-[#e5484d]/15 motion-reduce:animate-none',
                )}
              >
                {TEST_META[t].glyph}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold uppercase tracking-wide">{TEST_META[t].label}</p>
                <p className="text-sm font-semibold text-poster-ink/60">
                  {shown && report?.note ? report.note : TEST_META[t].attack}
                  {shown && report && report.findings > 0 && ` · ${report.findings} finding${report.findings === 1 ? '' : 's'}`}
                </p>
              </div>
              {shown && badge ? (
                <span className={cn('shrink-0 rounded-full border-2 px-3 py-1 text-xs font-extrabold uppercase animate-in zoom-in-50 duration-300', badge.className)}>
                  {badge.label}
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-[#c4282d]">
                  {reports ? 'Reading…' : 'Under attack'}
                  <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[#e5484d] border-t-transparent motion-reduce:animate-none" />
                </span>
              )}
              {!shown && (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-[#e5484d]/10">
                  <span style={{ animationDelay: `${i * 180}ms` }} className="block h-full w-1/3 animate-sweep rounded-full bg-[#e5484d] motion-reduce:animate-none" />
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** The side verdict: the gate, the severity spread, progress, and what's flagged in Strategy. */
function VerdictPanel({
  projectId,
  findings,
  ws,
  ranAt,
  busy,
  onRetestFixed,
  onRunAll,
  fixedTypes,
}: {
  projectId: string
  findings: StressTest[]
  ws: StrategyWorkspace
  ranAt: string
  busy: boolean
  onRetestFixed: () => void
  onRunAll: () => void
  fixedTypes: TestType[]
}) {
  const blocking = findings.filter(isBlocking).length
  const handled = findings.filter((f) => !isOpen(f)).length
  const max = Math.max(1, ...SEVERITY_ORDER.map((s) => findings.filter((f) => f.severity === s).length))
  const verdict =
    blocking > 0
      ? { stamp: 'Blocked', tone: 'red' as const, text: `${blocking} critical or high finding${blocking === 1 ? '' : 's'} still open. Fix or accept them to move on.` }
      : findings.length === 0
        ? { stamp: 'Survived', tone: 'green' as const, text: 'Every test came back clean.' }
        : { stamp: 'Clear to go', tone: 'green' as const, text: 'Nothing blocking. Remaining findings are yours to weigh.' }

  return (
    <Panel index="!" label="Verdict" className="flex-1 lg:min-h-0 lg:min-w-[300px]">
      <div className="space-y-5">
        <div className="text-center">
          <Stamp key={verdict.stamp} tone={verdict.tone} className="px-6 py-2 text-base">
            {verdict.stamp}
          </Stamp>
          <p className="mt-3 text-sm font-semibold text-poster-ink/65">{verdict.text}</p>
        </div>

        <div className="border-t-2 border-poster-ink/10 pt-4">
          <FieldLabel>By severity</FieldLabel>
          <ul className="mt-3 space-y-2">
            {SEVERITY_ORDER.map((s, i) => {
              const n = findings.filter((f) => f.severity === s).length
              return (
                <li key={s} className="group/sev flex items-center gap-3 text-xs font-extrabold uppercase tracking-wide">
                  <span className="w-16">{s}</span>
                  <span className="relative h-3 flex-1 overflow-hidden rounded-full border-2 border-poster-ink/15 bg-white">
                    <span
                      style={{ width: `${(n / max) * 100}%`, animationDelay: `${i * 90}ms` }}
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-full animate-in slide-in-from-left-full fill-mode-backwards duration-700 transition-[width] group-hover/sev:brightness-95',
                        SEVERITY_STYLE[s].bar,
                      )}
                    />
                  </span>
                  <span className="w-5 text-right tabular-nums">{n}</span>
                </li>
              )
            })}
          </ul>
        </div>

        {findings.length > 0 && (
          <div className="border-t-2 border-poster-ink/10 pt-4">
            <div className="flex items-baseline justify-between">
              <FieldLabel>Handled</FieldLabel>
              <span className="text-xs font-extrabold tabular-nums">
                {handled}/{findings.length}
              </span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full border-2 border-poster-ink bg-white">
              <div
                className="h-full rounded-full bg-poster-green transition-[width] duration-700"
                style={{ width: `${(handled / findings.length) * 100}%`, transitionTimingFunction: 'cubic-bezier(.3,1.6,.5,1)' }}
              />
            </div>
          </div>
        )}

        {ws.stale.length > 0 && (
          <div className="border-t-2 border-poster-ink/10 pt-4">
            <FieldLabel>Flagged in Strategy</FieldLabel>
            <ul className="mt-2 flex flex-wrap gap-2">
              {ws.stale.map((s) => (
                <li key={s} className="rounded-full border-2 border-[#d4a72c] bg-[#f2c94c]/40 px-2.5 py-0.5 text-xs font-extrabold animate-in zoom-in-75 duration-300">
                  ⚠ {STAGE_LABELS[s]}
                </li>
              ))}
            </ul>
            <Link href={`/project/${projectId}/strategy`} className={cn(linkButton, 'mt-3 inline-block')}>
              Update them in Strategy →
            </Link>
          </div>
        )}

        <div className="space-y-2 border-t-2 border-poster-ink/10 pt-4">
          {fixedTypes.length > 0 && (
            <button type="button" onClick={onRetestFixed} disabled={busy} className={cn(btnPrimary, 'w-full justify-center')}>
              ↻ Re-test {fixedTypes.length === 1 ? TEST_META[fixedTypes[0]].label : `${fixedTypes.length} fixed areas`}
            </button>
          )}
          <button type="button" onClick={onRunAll} disabled={busy} className={cn(btnSecondary, 'w-full justify-center')}>
            ↻ Run all five again
          </button>
          <p className="text-center text-[11px] font-semibold text-poster-ink/45">
            Last run {new Date(ranAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------------------------ */
/* Workspace                                                                            */

export default function StressWorkspace({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null>(null)
  const [ws, setWs] = useState<StrategyWorkspace | null>(null)
  const [run, setRun] = useState<StressRun | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [running, setRunning] = useState<TestType[] | null>(null)
  const [reveal, setReveal] = useState<{ types: TestType[]; reports: TestReport[]; count: number } | null>(null)
  const [error, setError] = useState<(ApiError & { retry: () => void }) | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'handled'>('all')
  const [typeFilter, setTypeFilter] = useState<TestType | null>(null)

  // Async work reads the latest values from here, not from a stale closure.
  const wsRef = useRef<StrategyWorkspace | null>(null)
  const runRef = useRef<StressRun | null>(null)

  const commitWs = useCallback((next: StrategyWorkspace) => {
    const saved = saveWorkspace(next)
    wsRef.current = saved
    setWs(saved)
    return saved
  }, [])

  const commitRun = useCallback((next: StressRun) => {
    const saved = saveStressRun(next)
    runRef.current = saved
    setRun(saved)
    return saved
  }, [])

  useEffect(() => {
    const w = loadWorkspace(id)
    const r = loadStressRun(id)
    wsRef.current = w
    runRef.current = r
    setProject(loadProject(id))
    setWs(w)
    setRun(r)
    setLoaded(true)
  }, [id])

  // Reveal each test's verdict in turn once real results are in, then hand over to results.
  useEffect(() => {
    if (!reveal) return
    const done = reveal.count >= reveal.types.length
    const id = window.setTimeout(() => setReveal(done ? null : { ...reveal, count: reveal.count + 1 }), done ? 700 : 320)
    return () => window.clearTimeout(id)
  }, [reveal])

  /** Recomputes Brand DNA after a decision. No model call; on failure the last DNA stays. */
  const refreshDna = useCallback(
    async (state: BrandState) => {
      try {
        const res = await post<{ dna: StrategyWorkspace['dna'] }>('/api/strategy', { action: 'dna', state })
        const current = wsRef.current
        if (current && current.state === state) commitWs({ ...current, dna: res.dna })
      } catch (e) {
        console.warn('[brandos] could not refresh Brand DNA', e)
      }
    },
    [commitWs],
  )

  const runTests = useCallback(
    async (scope?: TestType[]) => {
      const w = wsRef.current
      if (!w) return
      const types = scope ?? TEST_ORDER
      setError(null)
      setRunning(types)
      setTypeFilter(null)
      try {
        const res = await post<StressResponse>('/api/stress-test', { state: w.state, ...(scope ? { scope } : {}) })
        const found = res.state.stressTests.filter((f) => types.includes(f.type)).length
        commitWs({
          ...w,
          state: res.state,
          dna: res.dna,
          history: [...w.history, logEntry(`Stress test${scope ? ` (${types.length} re-tested)` : ''}: ${found} finding${found === 1 ? '' : 's'}`)],
        })
        // Decisions on the types that just re-ran no longer describe any finding.
        const prev = runRef.current
        const keep = <T,>(record: Record<string, T> | undefined) =>
          Object.fromEntries(Object.entries(record ?? {}).filter(([k]) => !types.includes(k.split('::')[0] as TestType)))
        commitRun({
          projectId: id,
          reports: [...(prev?.reports ?? []).filter((r) => !types.includes(r.type)), ...res.reports],
          ranAt: new Date().toISOString(),
          outcomes: keep(prev?.outcomes),
          notes: keep(prev?.notes),
        })
        setRunning(null)
        setReveal({ types, reports: res.reports, count: 0 })
      } catch (e) {
        setRunning(null)
        setError({
          message: e instanceof Error ? e.message : 'The stress test failed.',
          detail: (e as { detail?: string }).detail,
          retry: () => void runTests(scope),
        })
      }
    },
    [commitRun, commitWs, id],
  )

  /** Records a decision on one finding and follows it through: status, Strategy flags, DNA. */
  const decide = useCallback(
    async (finding: StressTest, outcome: Outcome | null, note?: string): Promise<Stage[]> => {
      const w = wsRef.current
      const r = runRef.current
      if (!w || !r) return []
      const key = findingKey(finding)
      const status = outcome === null ? 'open' : outcome === 'kept' ? 'acknowledged' : 'resolved'
      const label = outcome === null ? 'reopened' : outcome === 'kept' ? 'original kept' : outcome === 'edited' ? 'own fix written' : 'fix accepted'
      const state = {
        ...w.state,
        updatedAt: new Date().toISOString(),
        stressTests: w.state.stressTests.map((f) => (findingKey(f) === key ? { ...f, status } : f)),
      } satisfies BrandState
      let next: StrategyWorkspace = { ...w, state, history: [...w.history, logEntry(`${TEST_META[finding.type].label}: ${label}`)] }
      let flagged: Stage[] = []
      if (outcome === 'accepted' || outcome === 'edited') {
        const result = flagForUpdate(next, finding.affectedDecision, `Stress-test fix (${TEST_META[finding.type].label})`)
        next = result.ws
        flagged = result.flagged
      }
      commitWs(next)

      const outcomes = { ...r.outcomes }
      const notes = { ...r.notes }
      if (outcome === null) {
        delete outcomes[key]
        delete notes[key]
      } else {
        outcomes[key] = outcome
        if (note) notes[key] = note
      }
      commitRun({ ...r, outcomes, notes })

      await refreshDna(next.state)
      return flagged
    },
    [commitRun, commitWs, refreshDna],
  )

  /** "Accept all fixes": one state change for every open finding, then one DNA refresh. */
  const acceptAll = useCallback(async () => {
    const w = wsRef.current
    const r = runRef.current
    if (!w || !r) return
    const open = w.state.stressTests.filter(isOpen)
    let next: StrategyWorkspace = {
      ...w,
      state: {
        ...w.state,
        updatedAt: new Date().toISOString(),
        stressTests: w.state.stressTests.map((f) => (isOpen(f) ? { ...f, status: 'resolved' as const } : f)),
      },
      history: [...w.history, logEntry(`Stress test: all ${open.length} fixes accepted`)],
    }
    for (const f of open) next = flagForUpdate(next, f.affectedDecision, 'Stress-test fixes').ws
    commitWs(next)
    commitRun({ ...r, outcomes: { ...r.outcomes, ...Object.fromEntries(open.map((f) => [findingKey(f), 'accepted' as const])) } })
    await refreshDna(next.state)
  }, [commitRun, commitWs, refreshDna])

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
          <p className="mt-3 font-semibold text-poster-ink/60">
            Projects are saved in the browser they were created in. This one isn&apos;t in this browser.
          </p>
          <Link href="/new" className={cn(btnPrimary, 'mt-6 h-12 px-6 text-base')}>
            Start a new project <Arrow />
          </Link>
        </div>
      </main>
    )
  }

  const state = ws?.state ?? null
  const unlocked = !!state?.selectedStrategy
  const findings = (state?.stressTests ?? []).slice().sort(
    // Stable by severity, then test: a card stays put when handled, so its stamp and
    // follow-through play where the user clicked instead of jumping to the bottom.
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      TEST_ORDER.indexOf(a.type) - TEST_ORDER.indexOf(b.type),
  )
  const hasRun = !!run
  const showResults = hasRun && !running && !reveal
  const openCount = findings.filter(isOpen).length
  const blocking = findings.filter(isBlocking).length
  const fixedTypes = TEST_ORDER.filter((t) => findings.some((f) => f.type === t && f.status === 'resolved'))
  const visible = findings.filter(
    (f) =>
      (typeFilter === null || f.type === typeFilter) &&
      (statusFilter === 'all' || (statusFilter === 'open' ? isOpen(f) : !isOpen(f))),
  )
  const outcomeCount = (o: Outcome) => findings.filter((f) => run?.outcomes[findingKey(f)] === o).length
  const canContinue = showResults && blocking === 0

  return (
    <main className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-poster-paper text-poster-ink antialiased lg:h-[100svh]">
      <PosterRoom />
      <WorkflowNav projectId={id} current="stress-test" />

      <div className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 pt-5">
        <h1 className="font-display text-[1.9rem] uppercase leading-none tracking-[-0.04em]">
          <span className="relative inline-block">
            <HoverLetters text="Stress test" />
            <Swash className="top-[0.78em] h-[0.45em]" />
          </span>
          <HoverLetters text="." className="text-poster-green" />
        </h1>
        {showResults && (
          <span
            className={cn(
              'rounded-full border-2 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide animate-in fade-in-0 slide-in-from-left-2 duration-500',
              blocking > 0 ? 'border-[#c4282d] bg-[#e5484d] text-white' : 'border-poster-ink bg-poster-green',
            )}
          >
            {blocking > 0 ? `✗ ${blocking} blocking` : findings.length === 0 ? '✓ Survived' : '✓ No blockers'}
            {findings.length > 0 && ` · ${openCount} open of ${findings.length}`}
          </span>
        )}
      </div>

      <div className="relative z-10 flex flex-1 flex-col gap-5 p-5 lg:min-h-0 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Panel index="03" label="Try to break it" className="flex-1" busy={!!running}>
            {!unlocked ? (
              <EmptyState
                title="Strategy comes first"
                stamp="Locked"
                action={
                  <Link href={`/project/${id}/strategy`} className={btnPrimary}>
                    Go to Strategy <Arrow />
                  </Link>
                }
              >
                Complete Strategy to unlock Stress Test — it attacks the direction you chose, so there has to be one.
              </EmptyState>
            ) : (
              <div className="space-y-6">
                {error && (
                  <ErrorCard message={error.message} detail={error.detail} onRetry={error.retry} onDismiss={() => setError(null)} />
                )}

                {!hasRun && !running && <Hero state={state!} onRun={() => void runTests()} disabled={!!running} />}

                {(running || reveal) && (
                  <AttackBoard types={running ?? reveal!.types} reports={reveal?.reports ?? null} revealed={reveal?.count ?? 0} />
                )}

                {showResults && (
                  <div className="space-y-6">
                    {/* Result tiles: one per test, doubling as filters. */}
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                      {TEST_ORDER.map((t, i) => {
                        const report = run!.reports.find((r) => r.type === t)
                        const count = findings.filter((f) => f.type === t).length
                        const active = typeFilter === t
                        return (
                          <li key={t} style={{ animationDelay: `${i * 60}ms` }} className="animate-in fade-in-0 slide-in-from-top-2 fill-mode-backwards duration-500">
                            <button
                              type="button"
                              onClick={() => setTypeFilter(active ? null : t)}
                              aria-pressed={active}
                              title={report?.note}
                              className={cn(
                                'group/tile flex h-full w-full flex-col items-start gap-2 rounded-2xl border-2 bg-white px-3 py-3 text-left',
                                'transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#111] motion-reduce:hover:translate-y-0',
                                'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40',
                                SPRING,
                                active ? 'border-poster-ink shadow-[4px_4px_0_0_#5fb57a]' : 'border-poster-ink/20',
                              )}
                            >
                              <span className="flex w-full items-center justify-between gap-2">
                                <span className="grid h-7 w-7 place-items-center rounded-lg bg-poster-ink text-poster-paper group-hover/tile:animate-wiggle motion-reduce:group-hover/tile:animate-none">
                                  {TEST_META[t].glyph}
                                </span>
                                {report && (
                                  <span className={cn('rounded-full border-2 px-2 py-0.5 text-[10px] font-extrabold uppercase', REPORT_BADGE[report.outcome].className)}>
                                    {REPORT_BADGE[report.outcome].label}
                                  </span>
                                )}
                              </span>
                              <span className="text-xs font-extrabold uppercase tracking-wide">{TEST_META[t].label}</span>
                              <span className="text-[11px] font-semibold text-poster-ink/50">
                                {count === 0 ? 'No findings' : `${count} finding${count === 1 ? '' : 's'}`}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>

                    {findings.length === 0 ? (
                      <div className="relative overflow-hidden rounded-3xl border-2 border-poster-ink bg-poster-ink px-6 py-10 text-center text-poster-paper shadow-[6px_6px_0_0_#5fb57a] animate-in fade-in-0 zoom-in-95 duration-500">
                        <Stamp className="text-lg">✓ Survived all five</Stamp>
                        <p className="mt-4 font-semibold text-poster-paper/75">No test found anything to report. That&apos;s rare — nice work.</p>
                      </div>
                    ) : (
                      <>
                        {openCount === 0 && (
                          // Phase 4: everything handled.
                          <div className="rounded-3xl border-2 border-poster-ink bg-poster-green/15 px-5 py-5 shadow-[6px_6px_0_0_#111] animate-in fade-in-0 slide-in-from-top-2 duration-500">
                            <div className="flex flex-wrap items-center gap-3">
                              <Stamp>✓ All handled</Stamp>
                              <span className="text-sm font-extrabold">
                                {outcomeCount('accepted')} fix{outcomeCount('accepted') === 1 ? '' : 'es'} accepted · {outcomeCount('edited')} your own ·{' '}
                                {outcomeCount('kept')} kept original
                              </span>
                            </div>
                            <p className="mt-3 text-sm font-semibold text-poster-ink/70">
                              Brand DNA has been updated.
                              {ws!.stale.length > 0 && (
                                <>
                                  {' '}
                                  {ws!.stale.map((s) => STAGE_LABELS[s]).join(', ')} {ws!.stale.length === 1 ? 'is' : 'are'} flagged for an
                                  update in Strategy — then re-test to confirm the fixes hold.
                                </>
                              )}
                            </p>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          {(['all', 'open', 'handled'] as const).map((s) => {
                            const n = s === 'all' ? findings.length : s === 'open' ? openCount : findings.length - openCount
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setStatusFilter(s)}
                                aria-pressed={statusFilter === s}
                                className={cn(
                                  'rounded-full border-2 px-3 py-1 text-xs font-extrabold uppercase tracking-wide transition-[transform,background-color] duration-300 hover:-translate-y-0.5',
                                  SPRING,
                                  statusFilter === s ? 'border-poster-ink bg-poster-ink text-poster-paper' : 'border-poster-ink/30 bg-white hover:border-poster-ink',
                                )}
                              >
                                {s} <span className="tabular-nums opacity-70">{n}</span>
                              </button>
                            )
                          })}
                          {typeFilter && (
                            <button type="button" onClick={() => setTypeFilter(null)} className={cn(linkButton, 'ml-1')}>
                              ✕ {TEST_META[typeFilter].label} only
                            </button>
                          )}
                          {openCount > 0 && (
                            <button type="button" onClick={() => void acceptAll()} className={cn(btnPrimary, 'ml-auto h-9')}>
                              ✓ Accept all {openCount} fix{openCount === 1 ? '' : 'es'}
                            </button>
                          )}
                        </div>

                        <div className="space-y-4">
                          {visible.length === 0 ? (
                            <p className="rounded-2xl border-2 border-dashed border-poster-ink/20 px-4 py-6 text-center text-sm font-semibold text-poster-ink/45">
                              Nothing matches this filter.
                            </p>
                          ) : (
                            visible.map((f, i) => (
                              <FindingCard
                                key={findingKey(f)}
                                finding={f}
                                index={i}
                                outcome={run!.outcomes[findingKey(f)]}
                                note={run!.notes[findingKey(f)]}
                                busy={!!running}
                                onAccept={() => decide(f, 'accepted')}
                                onKeep={() => decide(f, 'kept')}
                                onEdit={(text) => decide(f, 'edited', text)}
                                onUndo={() => void decide(f, null)}
                              />
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>

        {showResults && ws && run && (
          // Bounces in from the right once there's a verdict, like Strategy's AI reasoning.
          <div className="flex min-h-0 flex-col animate-in fade-in-0 duration-500 motion-reduce:animate-none lg:w-[29.5%] lg:min-w-[300px] lg:shrink-0 lg:animate-reasoning-in lg:overflow-hidden lg:motion-reduce:animate-none">
            <VerdictPanel
              projectId={id}
              findings={findings}
              ws={ws}
              ranAt={run.ranAt}
              busy={!!running}
              fixedTypes={fixedTypes}
              onRetestFixed={() => void runTests(fixedTypes)}
              onRunAll={() => void runTests()}
            />
          </div>
        )}
      </div>

      <footer className="relative z-10 flex flex-wrap items-center gap-4 border-t-2 border-poster-ink bg-poster-paper px-6 py-4">
        <ol className="flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-wide" aria-label="Test results">
          {TEST_ORDER.map((t) => {
            const report = run?.reports.find((r) => r.type === t)
            return (
              <li
                key={t}
                title={TEST_META[t].label}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 transition-colors duration-500',
                  report ? REPORT_BADGE[report.outcome].className : 'border-dashed border-poster-ink/30 text-poster-ink/45',
                )}
              >
                <span aria-hidden="true">{TEST_META[t].glyph}</span>
                <span className="hidden sm:inline">{TEST_META[t].label}</span>
              </li>
            )
          })}
        </ol>
        {canContinue ? (
          <Link href={`/project/${id}/consistency`} className={cn(btnPrimary, 'ml-auto h-11 px-6 text-base animate-in fade-in-0 slide-in-from-right-2 duration-300')}>
            Continue to Consistency <Arrow />
          </Link>
        ) : (
          <span className={cn(btnSecondary, 'ml-auto cursor-default border-poster-ink/20 text-poster-ink/45 hover:translate-y-0 hover:text-poster-ink/45 hover:shadow-none')}>
            {!hasRun ? 'Run the stress test to continue' : 'Resolve critical & high findings to continue'}
          </span>
        )}
      </footer>
    </main>
  )
}
