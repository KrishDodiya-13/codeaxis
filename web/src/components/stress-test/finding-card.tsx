'use client'

import { useState } from 'react'
import type { Severity, StressTest } from 'brandstate'
import { STAGE_LABELS, type Stage } from '@/lib/strategy'
import { DECISION_LABELS, DECISION_STAGE, TEST_META, type Outcome } from '@/lib/stress'
import { FieldLabel } from '@/components/project/panel'
import { SPRING, Stamp, btnPrimary, btnSecondary, linkButton } from '@/components/strategy/ui'
import { cn } from '@/lib/utils'
import { humanize } from '@/lib/humanize'

/** Severity → colors. Critical/high read as a fail, medium a warning, low a note. */
export const SEVERITY_STYLE: Record<Severity, { bar: string; badge: string; label: string; hover: string }> = {
  critical: { bar: 'bg-[#e5484d]', badge: 'bg-[#e5484d] text-white border-[#c4282d]', label: '✗ Critical', hover: 'hover:shadow-[5px_5px_0_0_#e5484d]' },
  high: { bar: 'bg-[#e5484d]/70', badge: 'bg-[#e5484d]/15 text-[#c4282d] border-[#e5484d]', label: '✗ High', hover: 'hover:shadow-[5px_5px_0_0_#e5484d]' },
  medium: { bar: 'bg-[#f2c94c]', badge: 'bg-[#f2c94c] text-poster-ink border-[#d4a72c]', label: '⚠ Medium', hover: 'hover:shadow-[5px_5px_0_0_#f2c94c]' },
  low: { bar: 'bg-poster-green', badge: 'bg-poster-green/25 text-poster-ink border-poster-green', label: '● Low', hover: 'hover:shadow-[5px_5px_0_0_#5fb57a]' },
}

const OUTCOME_STAMP: Record<Outcome, { text: string; tone: 'green' | 'white' | 'red' }> = {
  accepted: { text: '✓ Fix accepted', tone: 'green' },
  edited: { text: '✎ Your fix', tone: 'white' },
  kept: { text: '↩ Kept original', tone: 'white' },
}

/** Evidence with every cited field path (`positioning.valueProposition`) set as a code chip. */
/** What the finding rests on, in plain words — the engine's field names are translated. */
function Evidence({ text }: { text: string }) {
  return <p className="text-sm font-semibold leading-relaxed">{humanize(text)}</p>
}

/** The real follow-through after a decision, ticked as each step actually completes. */
function FollowThrough({ stages, dnaDone }: { stages: Stage[]; dnaDone: boolean }) {
  const steps = [
    { label: 'Finding marked', done: true },
    ...(stages.length ? [{ label: `${stages.map((s) => STAGE_LABELS[s]).join(', ')} flagged for update in Strategy`, done: true }] : []),
    { label: 'Brand DNA updated', done: dnaDone },
  ]
  return (
    <ol className="mt-3 space-y-1" aria-live="polite">
      {steps.map((s, i) => (
        <li
          key={s.label}
          style={{ animationDelay: `${i * 160}ms` }}
          className="flex items-center gap-2 text-xs font-bold animate-in fade-in-0 slide-in-from-left-2 fill-mode-backwards duration-300"
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid h-4 w-4 place-items-center rounded-full text-[9px]',
              s.done
                ? 'bg-poster-green ring-1 ring-poster-ink animate-in zoom-in-50 duration-300'
                : 'animate-spin border-2 border-poster-ink border-t-transparent motion-reduce:animate-none',
            )}
          >
            {s.done ? '✓' : ''}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  )
}

export default function FindingCard({
  finding,
  outcome,
  note,
  index,
  busy,
  onAccept,
  onKeep,
  onEdit,
  onUndo,
}: {
  finding: StressTest
  outcome?: Outcome
  note?: string
  index: number
  busy: boolean
  /** Resolve once Brand DNA has been recomputed, with the stages actually flagged. */
  onAccept: () => Promise<Stage[]>
  onKeep: () => Promise<Stage[]>
  onEdit: (text: string) => Promise<Stage[]>
  onUndo: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [justHandled, setJustHandled] = useState<{ dnaDone: boolean; flagged: Stage[] } | null>(null)
  const sev = SEVERITY_STYLE[finding.severity]
  const meta = TEST_META[finding.type]
  const decision = finding.affectedDecision
  const stage = decision ? DECISION_STAGE[decision] : null
  const handled = (finding.status ?? 'open') !== 'open'

  const act = async (run: () => Promise<Stage[]>) => {
    setJustHandled({ dnaDone: false, flagged: [] })
    const flagged = await run()
    setJustHandled({ dnaDone: true, flagged })
  }

  return (
    <article
      aria-label={`${meta.label} finding: ${humanize(finding.issue)}`}
      style={{ animationDelay: `${Math.min(index, 8) * 90}ms` }}
      className={cn(
        'group/f relative overflow-hidden rounded-2xl border-2 border-poster-ink bg-white pl-3',
        // Results arrive from the top, one after another.
        'animate-in fade-in-0 slide-in-from-top-3 fill-mode-backwards duration-500',
        'transition-[transform,box-shadow,opacity] duration-300 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0',
        SPRING,
        sev.hover,
        handled && 'opacity-80 hover:opacity-100',
      )}
    >
      {/* Severity bar down the left edge; widens a touch on hover. */}
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-2 transition-[width] duration-300 group-hover/f:w-3', sev.bar)} />

      <div className="px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border-2 border-poster-ink p-[3px] pr-3 text-[11px] font-extrabold uppercase tracking-wide">
            <b className="grid h-5 w-5 place-items-center rounded-full bg-poster-ink text-[11px] text-poster-paper group-hover/f:animate-wiggle motion-reduce:group-hover/f:animate-none">
              {meta.glyph}
            </b>
            {meta.label}
          </span>
          <span className={cn('rounded-full border-2 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide', sev.badge)}>
            {sev.label}
          </span>
          {decision && (
            <span className="rounded-full border-2 border-dashed border-poster-ink/30 px-2.5 py-0.5 text-[11px] font-bold">
              Affects {DECISION_LABELS[decision]}
            </span>
          )}
          {outcome && (
            <Stamp key={outcome} tone={OUTCOME_STAMP[outcome].tone} className="ml-auto">
              {OUTCOME_STAMP[outcome].text}
            </Stamp>
          )}
        </div>

        <p className="mt-3 text-lg font-semibold leading-snug">{humanize(finding.issue)}</p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <FieldLabel>Evidence</FieldLabel>
            <div className="mt-1">
              <Evidence text={finding.evidence} />
            </div>
          </div>
          <div>
            <FieldLabel>Impact</FieldLabel>
            <p className="mt-1 text-sm font-semibold leading-relaxed">{humanize(finding.impact)}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border-2 border-poster-green bg-poster-green/10 px-3 py-2.5">
            <FieldLabel className="text-poster-ink">Recommendation</FieldLabel>
            <p className="mt-1 text-sm font-semibold leading-snug">{humanize(finding.recommendation)}</p>
          </div>
          {finding.alternative && (
            <div className="rounded-xl border-2 border-dashed border-poster-ink/30 px-3 py-2.5">
              <FieldLabel>Alternative</FieldLabel>
              <p className="mt-1 text-sm font-semibold leading-snug">{humanize(finding.alternative)}</p>
            </div>
          )}
        </div>

        {note && outcome === 'edited' && (
          <div className="mt-3 rounded-xl bg-poster-ink px-3 py-2.5 text-poster-paper animate-in fade-in-0 duration-300">
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-poster-green">Your fix</p>
            <p className="mt-1 text-sm font-semibold leading-snug">{note}</p>
          </div>
        )}

        {editing ? (
          <div className="mt-4 animate-in fade-in-0 duration-200">
            <label htmlFor={`fix-${index}`} className="text-xs font-extrabold uppercase tracking-wide text-poster-ink/60">
              Your fix
            </label>
            <textarea
              id={`fix-${index}`}
              rows={3}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false)
              }}
              placeholder="What will you change instead?"
              className="mt-1 block w-full resize-y rounded-2xl border-2 border-poster-ink bg-white px-4 py-3 text-sm font-semibold transition-shadow duration-200 focus-visible:shadow-[6px_6px_0_#5fb57a] focus-visible:outline-none"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={!draft.trim() || busy}
                onClick={() => {
                  const text = draft.trim()
                  setEditing(false)
                  void act(() => onEdit(text))
                }}
                className={cn(btnPrimary, 'h-9')}
              >
                Save my fix
              </button>
              <button type="button" onClick={() => setEditing(false)} className={cn(btnSecondary, 'h-9')}>
                Cancel
              </button>
            </div>
          </div>
        ) : !handled ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => void act(onAccept)} className={cn(btnPrimary, 'h-9')}>
              ✓ Accept fix
            </button>
            <button type="button" disabled={busy} onClick={() => void act(onKeep)} className={cn(btnSecondary, 'h-9')}>
              ↩ Keep original
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(finding.alternative ?? '')
                setEditing(true)
              }}
              className={cn(btnSecondary, 'h-9')}
            >
              ✎ Write my own fix
            </button>
            {stage && (
              <span className="ml-auto text-xs font-semibold text-poster-ink/50">
                A fix flags {STAGE_LABELS[stage]} for update in Strategy
              </span>
            )}
          </div>
        ) : (
          <div className="mt-3">
            {justHandled && (
              <FollowThrough stages={justHandled.flagged} dnaDone={justHandled.dnaDone} />
            )}
            <button type="button" onClick={onUndo} disabled={busy} className={cn(linkButton, 'mt-3')}>
              Undo decision
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
