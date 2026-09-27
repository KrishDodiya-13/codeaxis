'use client'

import { useEffect, useState } from 'react'
import type { BrandState, ConsistencyFinding, Severity } from 'brandstate'
import { BRAND_DIMENSION_LABELS } from '@/lib/consistency'
import { FieldLabel, Panel } from '@/components/project/panel'
import HoverLetters from '@/components/hover-letters'
import { ErrorCard, SPRING, Stamp, btnPrimary, btnSecondary, linkButton } from '@/components/strategy/ui'
import { cn } from '@/lib/utils'

const SEVERITY: Record<Severity, { label: string; className: string; bar: string }> = {
  critical: { label: '✗ Critical', className: 'bg-[#e5484d] text-white border-[#c4282d]', bar: 'bg-[#e5484d]' },
  high: { label: '✗ High', className: 'bg-[#e5484d]/15 text-[#c4282d] border-[#e5484d]', bar: 'bg-[#e5484d]/70' },
  medium: { label: '⚠ Medium', className: 'bg-[#f2c94c] border-[#d4a72c]', bar: 'bg-[#f2c94c]' },
  low: { label: '● Low', className: 'bg-poster-green/25 border-poster-green', bar: 'bg-poster-green' },
}

const CATEGORY_LABEL: Record<ConsistencyFinding['category'], string> = {
  contradiction: 'Contradiction',
  weakAlignment: 'Weak alignment',
  unclearPositioning: 'Unclear positioning',
  toneMismatch: 'Tone mismatch',
  visualStrategicConflict: 'Visual vs strategy',
  messagingInconsistency: 'Messaging',
}

const isOpen = (f: ConsistencyFinding) => (f.status ?? 'open') === 'open'
export const findingId = (f: ConsistencyFinding) => `${f.category}::${f.conflictingElements.join('+')}::${f.explanation.slice(0, 60)}`

function Evidence({ text }: { text: string }) {
  const parts = text.split(/(\b[a-zA-Z_]+(?:\[\d+\])?\.[A-Za-z][A-Za-z0-9_.[\]]*)/g)
  return (
    <p className="text-sm font-semibold leading-relaxed">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded-md border border-poster-ink/20 bg-poster-ink/5 px-1.5 py-0.5 font-mono text-[12px] font-bold">
            {p}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  )
}

function Elapsed() {
  const [s, setS] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const id = window.setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="tabular-nums">{s}s</span>
}

export default function BrandCheck({
  state,
  running,
  error,
  onRun,
  onDismissError,
  onDecide,
}: {
  state: BrandState
  running: boolean
  error: { message: string; detail?: string; retry: () => void } | null
  onRun: () => void
  onDismissError: () => void
  onDecide: (finding: ConsistencyFinding, status: 'resolved' | 'acknowledged' | 'open') => void
}) {
  const c = state.consistency
  const checked = c.status !== 'not-yet-checked'
  const findings = c.findings
  const open = findings.filter(isOpen)

  return (
    <Panel index="!" label="Brand self-check" className="flex-1" busy={running}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="font-display text-[clamp(1.6rem,2.6vw,2.2rem)] uppercase leading-[0.95] tracking-[-0.035em]">
              <HoverLetters text="Does your brand" />
              <br />
              <HoverLetters text="agree with itself?" />
            </h2>
            <p className="mt-3 text-sm font-semibold text-poster-ink/60">
              Different from the stress test: this doesn&apos;t ask whether each decision is good, only whether they&apos;re compatible —
              positioning, personality, voice, visual and messaging, compared against each other.
            </p>
          </div>
          <button type="button" onClick={onRun} disabled={running} className={cn(btnPrimary, 'h-12 px-6 text-base')}>
            {running ? (
              <>
                Checking… <Elapsed />
              </>
            ) : checked ? (
              '↻ Run the self-check again'
            ) : (
              'Run the self-check →'
            )}
          </button>
        </div>

        {error && <ErrorCard message={error.message} detail={error.detail} onRetry={error.retry} onDismiss={onDismissError} />}

        {checked && (
          <>
            <div className="flex flex-wrap items-center gap-3 animate-in fade-in-0 zoom-in-95 duration-500">
              <Stamp key={`${c.status}${open.length}`} tone={open.length === 0 ? 'green' : 'red'} className="px-5 py-2 text-base">
                {open.length === 0 ? '✓ Consistent' : `✗ ${open.length} conflict${open.length === 1 ? '' : 's'} open`}
              </Stamp>
              {c.lastCheckedAt && (
                <span className="text-xs font-bold text-poster-ink/45">
                  Checked {new Date(c.lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {/* One tile per part of the brand: what the engine could compare, and what it found. */}
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {c.dimensionsChecked.map((d, i) => {
                const hits = open.filter((f) => f.conflictingElements.includes(d.dimension)).length
                return (
                  <li
                    key={d.dimension}
                    title={d.note}
                    style={{ animationDelay: `${i * 50}ms` }}
                    className={cn(
                      'rounded-2xl border-2 bg-white px-3 py-2.5 animate-in fade-in-0 slide-in-from-top-2 fill-mode-backwards duration-500',
                      'transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#111] motion-reduce:hover:translate-y-0',
                      SPRING,
                      hits > 0 ? 'border-[#e5484d]' : d.status === 'not-testable' ? 'border-dashed border-poster-ink/25' : 'border-poster-ink/25',
                    )}
                  >
                    <p className="text-xs font-extrabold uppercase tracking-wide">{BRAND_DIMENSION_LABELS[d.dimension]}</p>
                    <p className={cn('mt-1 text-[11px] font-bold', hits > 0 ? 'text-[#c4282d]' : 'text-poster-ink/50')}>
                      {d.status === 'not-testable' ? '○ Not checked yet' : hits > 0 ? `✗ ${hits} conflict${hits === 1 ? '' : 's'}` : d.status === 'partial' ? '~ Partly checked' : '✓ Agrees'}
                    </p>
                  </li>
                )
              })}
            </ul>

            {findings.length === 0 ? (
              <p className="rounded-2xl border-2 border-poster-ink bg-poster-green/15 px-5 py-4 font-semibold animate-in fade-in-0 duration-500">
                Every part that could be compared agrees with the rest. {c.notes?.[0]}
              </p>
            ) : (
              <ul className="space-y-4">
                {findings.map((f, i) => {
                  const handled = !isOpen(f)
                  const sev = SEVERITY[f.severity]
                  return (
                    <li
                      key={findingId(f)}
                      style={{ animationDelay: `${i * 90}ms` }}
                      className={cn(
                        'group/f relative overflow-hidden rounded-2xl border-2 border-poster-ink bg-white py-4 pl-5 pr-4',
                        'animate-in fade-in-0 slide-in-from-top-3 fill-mode-backwards duration-500',
                        'transition-[transform,box-shadow,opacity] duration-300 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_#111] motion-reduce:hover:translate-y-0',
                        SPRING,
                        handled && 'opacity-75 hover:opacity-100',
                      )}
                    >
                      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-2 transition-[width] duration-300 group-hover/f:w-3', sev.bar)} />
                      <div className="flex flex-wrap items-center gap-2">
                        {/* The two (or more) parts in tension, drawn as a pull between them. */}
                        <span className="inline-flex flex-wrap items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide">
                          {f.conflictingElements.map((d, j) => (
                            <span key={d} className="inline-flex items-center gap-1.5">
                              {j > 0 && (
                                <span aria-hidden="true" className="text-[#e5484d] transition-transform duration-300 group-hover/f:scale-125">
                                  ⇄
                                </span>
                              )}
                              <span className="rounded-full border-2 border-poster-ink px-2 py-0.5">{BRAND_DIMENSION_LABELS[d]}</span>
                            </span>
                          ))}
                        </span>
                        <span className="rounded-full bg-poster-ink/5 px-2 py-0.5 text-[11px] font-bold">{CATEGORY_LABEL[f.category]}</span>
                        <span className={cn('rounded-full border-2 px-2.5 py-0.5 text-[11px] font-extrabold uppercase', sev.className)}>{sev.label}</span>
                        {handled && (
                          <Stamp key={f.status} tone={f.status === 'resolved' ? 'green' : 'white'} className="ml-auto">
                            {f.status === 'resolved' ? '✓ Correction accepted' : '↩ Kept as is'}
                          </Stamp>
                        )}
                      </div>
                      <p className="mt-3 text-lg font-semibold leading-snug">{f.explanation}</p>
                      <div className="mt-3">
                        <FieldLabel>Evidence</FieldLabel>
                        <div className="mt-1">
                          <Evidence text={f.evidence} />
                        </div>
                      </div>
                      <div className="mt-3 rounded-xl border-2 border-poster-green bg-poster-green/10 px-3 py-2.5">
                        <FieldLabel className="text-poster-ink">Recommended correction</FieldLabel>
                        <p className="mt-1 text-sm font-semibold leading-snug">{f.recommendedCorrection}</p>
                      </div>
                      {!handled ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" disabled={running} onClick={() => onDecide(f, 'resolved')} className={cn(btnPrimary, 'h-9')}>
                            ✓ Accept correction
                          </button>
                          <button type="button" disabled={running} onClick={() => onDecide(f, 'acknowledged')} className={cn(btnSecondary, 'h-9')}>
                            ↩ Keep as is
                          </button>
                          <span className="ml-auto self-center text-xs font-semibold text-poster-ink/50">Accepting flags the parts involved for update in Strategy</span>
                        </div>
                      ) : (
                        <button type="button" onClick={() => onDecide(f, 'open')} disabled={running} className={cn(linkButton, 'mt-3')}>
                          Undo decision
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </Panel>
  )
}
