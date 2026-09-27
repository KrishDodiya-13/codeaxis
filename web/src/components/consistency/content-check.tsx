'use client'

import { useEffect, useState } from 'react'
import type { BrandState } from 'brandstate'
import {
  CONTENT_DIMENSION_META,
  type ContentCheck,
  type ContentCheckResult,
  type DimensionVerdict,
  type Overall,
} from '@/lib/consistency'
import { FieldLabel, Panel } from '@/components/project/panel'
import HoverLetters from '@/components/hover-letters'
import { Arrow, EmptyState, ErrorCard, SPRING, Stamp, btnPrimary, btnSecondary, linkButton } from '@/components/strategy/ui'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------------------------ */

export const OVERALL_STYLE: Record<Overall, { stamp: string; tone: 'green' | 'white' | 'red'; chip: string }> = {
  pass: { stamp: '✓ On brand', tone: 'green', chip: 'border-poster-ink bg-poster-green' },
  warning: { stamp: '⚠ Drifting', tone: 'white', chip: 'border-[#d4a72c] bg-[#f2c94c]' },
  fail: { stamp: '✗ Off brand', tone: 'red', chip: 'border-[#c4282d] bg-[#e5484d] text-white' },
}

const STATUS_BADGE: Record<DimensionVerdict['status'], { label: string; className: string; bar: string }> = {
  pass: { label: '✓ Pass', className: 'bg-poster-green border-poster-ink', bar: 'bg-poster-green' },
  warning: { label: '⚠ Warning', className: 'bg-[#f2c94c] border-[#d4a72c]', bar: 'bg-[#f2c94c]' },
  fail: { label: '✗ Fail', className: 'bg-[#e5484d] text-white border-[#c4282d]', bar: 'bg-[#e5484d]' },
  'not-applicable': { label: '○ N/A', className: 'bg-white text-poster-ink/50 border-poster-ink/25', bar: 'bg-poster-ink/15' },
}

/** Starter content to try, built from the brand's own words so the check has something real to judge. */
function examples(state: BrandState) {
  const name = state.naming.selectedName ?? 'our app'
  const audience = state.discovery.targetAudience.split(/[,(.]/)[0]?.trim().toLowerCase() || 'you'
  const primary = state.voice.messagingHierarchy.primaryMessage
  const value = state.positioning.valueProposition
  return [
    { label: 'A social media post', text: `Big news! ${name} is finally here — the really innovative way for ${audience} to get sorted. Try it today!` },
    { label: 'Your homepage headline', text: primary || `${name}: built for ${audience}.` },
    { label: 'An email subject line', text: `Don't miss out — ${name} just got smarter` },
    { label: 'A product description', text: value ? `${name}. ${value}` : `${name} helps ${audience} do more.` },
  ]
}

/* ------------------------------------------------------------------------------------ */
/* Left: the input                                                                      */

export function ContentInput({
  state,
  draft,
  setDraft,
  checking,
  onCheck,
  history,
  onOpen,
}: {
  state: BrandState
  draft: string
  setDraft: (t: string) => void
  checking: boolean
  onCheck: () => void
  history: ContentCheck[]
  onOpen: (c: ContentCheck) => void
}) {
  const [mode, setMode] = useState<'text' | 'image'>('text')
  const limit = 4000
  const traits = state.personality.traits.slice(0, 4)
  const tones = state.voice.toneAttributes.slice(0, 3).map((t) => t.split(/,\s*not\s+/i)[0])

  return (
    <Panel index="01" label="Your content" className="flex-1" delay={0}>
      <div className="space-y-5">
        <h2 className="font-display text-[clamp(1.6rem,2.6vw,2.2rem)] uppercase leading-[0.95] tracking-[-0.035em]">
          <HoverLetters text="Check content" />
          <br />
          <HoverLetters text="against your brand" className="text-poster-ink/80" />
        </h2>

        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Content type">
          {(['text', 'image'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              disabled={m === 'image'}
              title={m === 'image' ? 'Image checks are coming soon' : undefined}
              onClick={() => setMode(m)}
              className={cn(
                'rounded-full border-2 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide transition-[transform,background-color] duration-300',
                SPRING,
                mode === m ? 'border-poster-ink bg-poster-ink text-poster-paper' : 'border-poster-ink/30 bg-white',
                m === 'image' && 'cursor-not-allowed text-poster-ink/40',
              )}
            >
              {m === 'text' ? 'Text' : 'Image · soon'}
            </button>
          ))}
        </div>

        {/* The /new idea box: lifts onto a hard green shadow while you type. */}
        <div
          className={cn(
            'rounded-3xl border-2 border-poster-ink bg-white transition-[box-shadow,transform] duration-200',
            'focus-within:-translate-x-1 focus-within:-translate-y-1 focus-within:shadow-[8px_8px_0_#5fb57a]',
            'motion-reduce:transition-none motion-reduce:focus-within:translate-x-0 motion-reduce:focus-within:translate-y-0',
          )}
        >
          <label htmlFor="consistency-content" className="sr-only">
            Content to check
          </label>
          <textarea
            id="consistency-content"
            rows={7}
            value={draft}
            maxLength={limit}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && draft.trim() && !checking) onCheck()
            }}
            placeholder="Paste your copy, tagline, post, headline, or any brand content…"
            className="block w-full resize-y rounded-3xl bg-transparent px-5 pt-4 text-base font-semibold placeholder:font-medium placeholder:text-poster-ink/35 focus:outline-none"
          />
          <div className="flex items-center gap-3 px-5 pb-3 pt-1">
            {draft && (
              <button type="button" onClick={() => setDraft('')} className={linkButton}>
                Clear
              </button>
            )}
            <span className={cn('ml-auto text-xs font-bold tabular-nums', draft.length > limit * 0.9 ? 'text-[#b7791f]' : 'text-poster-ink/40')}>
              {draft.length} / {limit}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onCheck} disabled={!draft.trim() || checking} className={cn(btnPrimary, 'h-12 px-6 text-base')}>
            {checking ? 'Checking…' : 'Check consistency'} {!checking && <Arrow />}
          </button>
          <span className="text-xs font-bold text-poster-ink/45">Ctrl+Enter</span>
        </div>

        <div>
          <FieldLabel>Try</FieldLabel>
          <ul className="mt-2 flex flex-wrap gap-2">
            {examples(state).map((ex, i) => (
              <li key={ex.label} style={{ animationDelay: `${i * 60}ms` }} className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300">
                <button
                  type="button"
                  onClick={() => setDraft(ex.text)}
                  className={cn(
                    'rounded-full border-2 border-poster-ink bg-white px-3 py-1 text-sm font-bold transition-[transform,background-color] duration-300 hover:-rotate-2 hover:bg-poster-green',
                    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40',
                    SPRING,
                  )}
                >
                  {ex.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* What it will be judged against: the approved decisions, at a glance. */}
        <div className="rounded-2xl border-2 border-dashed border-poster-ink/25 px-4 py-3">
          <FieldLabel>Checked against your Brand DNA</FieldLabel>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {state.naming.selectedName && (
              <span className="rounded-full bg-poster-ink px-2.5 py-0.5 text-xs font-extrabold text-poster-paper">{state.naming.selectedName}</span>
            )}
            {tones.map((t) => (
              <span key={t} className="rounded-full border-2 border-poster-green bg-poster-green/15 px-2.5 py-0.5 text-xs font-bold transition-colors hover:bg-poster-green">
                ❝ {t}
              </span>
            ))}
            {traits.map((t) => (
              <span key={t} className="rounded-full border-2 border-poster-ink/20 px-2.5 py-0.5 text-xs font-bold transition-colors hover:border-poster-ink">
                ✺ {t}
              </span>
            ))}
          </div>
        </div>

        {history.length > 0 && (
          <div>
            <FieldLabel>Recent checks</FieldLabel>
            <ul className="mt-2 space-y-1.5">
              {history.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(c)}
                    className={cn(
                      'group/h flex w-full items-center gap-3 rounded-xl border-2 border-poster-ink/10 bg-white px-3 py-2 text-left',
                      'transition-[transform,border-color] duration-300 hover:translate-x-1 hover:border-poster-ink',
                      SPRING,
                    )}
                  >
                    <span className={cn('shrink-0 rounded-full border-2 px-2 py-0.5 text-[10px] font-extrabold uppercase', OVERALL_STYLE[c.result.overall].chip)}>
                      {c.result.overall}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.repaired ?? c.content}</span>
                    {c.repair === 'applied' && <span className="shrink-0 text-[10px] font-extrabold uppercase text-poster-green">repaired</span>}
                    <span aria-hidden="true" className="text-poster-ink/30 transition-transform duration-300 group-hover/h:translate-x-1">→</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------------------------ */
/* Right: the results                                                                   */

function Elapsed() {
  const [s, setS] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const id = window.setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="tabular-nums">{s}s</span>
}

/** The checked copy, with the words the repair targets marked. */
function QuotedContent({ content, mark }: { content: string; mark?: string }) {
  const i = mark ? content.indexOf(mark) : -1
  return (
    <blockquote className="relative rounded-2xl border-2 border-poster-ink/15 bg-white px-5 py-4 text-lg font-semibold leading-snug">
      <span aria-hidden="true" className="absolute -left-1 -top-4 font-display text-5xl text-poster-green">“</span>
      {i < 0 ? (
        content
      ) : (
        <>
          {content.slice(0, i)}
          <mark className="rounded-md bg-[#f2c94c]/60 px-0.5 underline decoration-[#e5484d] decoration-wavy decoration-2 underline-offset-4">
            {mark}
          </mark>
          {content.slice(i + mark!.length)}
        </>
      )}
    </blockquote>
  )
}

function Repair({
  check,
  onUse,
  onKeep,
  onEdit,
  onRecheck,
}: {
  check: ContentCheck
  onUse: () => void
  onKeep: () => void
  onEdit: (text: string) => void
  onRecheck: () => void
}) {
  const repair = check.result.repair!
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(repair.suggestion)

  return (
    <section
      aria-label="Suggested repair"
      className="relative rounded-3xl border-2 border-poster-ink bg-white p-5 shadow-[6px_6px_0_0_#5fb57a] animate-in fade-in-0 slide-in-from-bottom-3 fill-mode-backwards duration-500 [animation-delay:500ms]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg uppercase tracking-[-0.02em]">
          <HoverLetters text="Suggested repair" />
        </h3>
        {check.repair && (
          <Stamp key={check.repair} tone={check.repair === 'kept' ? 'white' : 'green'} className="ml-auto">
            {check.repair === 'applied' ? '✓ Repair applied' : check.repair === 'edited' ? '✎ Your version applied' : '↩ Kept original'}
          </Stamp>
        )}
      </div>

      <div className="mt-4 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-2xl border-2 border-[#e5484d]/40 bg-[#e5484d]/5 px-4 py-3">
          <FieldLabel className="text-[#c4282d]">Original</FieldLabel>
          <p className="mt-1 font-semibold leading-snug text-poster-ink/70 line-through decoration-[#e5484d]/60 decoration-2">{repair.original}</p>
        </div>
        <span aria-hidden="true" className="grid place-items-center font-display text-2xl text-poster-ink/40">
          →
        </span>
        <div className="rounded-2xl border-2 border-poster-green bg-poster-green/10 px-4 py-3">
          <FieldLabel className="text-poster-ink">Suggested fix</FieldLabel>
          <p className="mt-1 font-semibold leading-snug">{repair.suggestion}</p>
        </div>
      </div>
      <p className="mt-3 text-sm font-semibold text-poster-ink/65">
        <span className="font-extrabold uppercase tracking-wide text-poster-ink">Why · </span>
        {repair.rationale}
      </p>

      {editing ? (
        <div className="mt-4 animate-in fade-in-0 duration-200">
          <label htmlFor="repair-edit" className="sr-only">
            Your version of the fix
          </label>
          <textarea
            id="repair-edit"
            rows={2}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false)
            }}
            className="block w-full resize-y rounded-2xl border-2 border-poster-ink bg-white px-4 py-3 text-sm font-semibold transition-shadow duration-200 focus-visible:shadow-[6px_6px_0_#5fb57a] focus-visible:outline-none"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!draft.trim()}
              onClick={() => {
                onEdit(draft.trim())
                setEditing(false)
              }}
              className={cn(btnPrimary, 'h-9')}
            >
              Apply my version
            </button>
            <button type="button" onClick={() => setEditing(false)} className={cn(btnSecondary, 'h-9')}>
              Cancel
            </button>
          </div>
        </div>
      ) : !check.repair ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={onUse} className={cn(btnPrimary, 'h-9')}>
            ✓ Use this
          </button>
          <button type="button" onClick={onKeep} className={cn(btnSecondary, 'h-9')}>
            ↩ Keep original
          </button>
          <button type="button" onClick={() => setEditing(true)} className={cn(btnSecondary, 'h-9')}>
            ✎ Edit
          </button>
        </div>
      ) : (
        check.repair !== 'kept' && (
          <div className="mt-4 flex flex-wrap items-center gap-3 animate-in fade-in-0 duration-300">
            <p className="text-sm font-bold">Your copy on the left is updated.</p>
            <button type="button" onClick={onRecheck} className={cn(btnSecondary, 'h-9')}>
              ↻ Check the repaired copy
            </button>
          </div>
        )
      )}
    </section>
  )
}

export function ContentResults({
  check,
  checking,
  error,
  onRetry,
  onDismiss,
  onUse,
  onKeep,
  onEdit,
  onRecheck,
}: {
  check: ContentCheck | null
  checking: boolean
  error: { message: string; detail?: string } | null
  onRetry: () => void
  onDismiss: () => void
  onUse: () => void
  onKeep: () => void
  onEdit: (text: string) => void
  onRecheck: () => void
}) {
  return (
    <Panel index="02" label="Consistency results" className="flex-1" busy={checking} delay={90}>
      <div className="space-y-5">
        {error && <ErrorCard message={error.message} detail={error.detail} onRetry={onRetry} onDismiss={onDismiss} savedNote="Nothing is lost — your copy is still in the box." />}

        {checking ? (
          <div className="relative overflow-hidden rounded-2xl border-2 border-poster-ink bg-white px-5 py-5 shadow-[4px_4px_0_0_#5fb57a] animate-in fade-in-0 duration-300">
            <div className="flex items-center justify-between gap-3">
              <p className="font-extrabold">Comparing your content to the Brand DNA…</p>
              <span className="rounded-full bg-poster-ink px-3 py-1 text-xs font-extrabold text-poster-paper">
                <Elapsed />
              </span>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">
              {Object.entries(CONTENT_DIMENSION_META).map(([k, m], i) => (
                <li
                  key={k}
                  style={{ animationDelay: `${i * 150}ms` }}
                  className="inline-flex animate-pulse items-center gap-1.5 rounded-full border-2 border-poster-ink/20 px-3 py-1 text-xs font-extrabold uppercase motion-reduce:animate-none"
                >
                  {m.glyph} {m.label}
                </li>
              ))}
            </ul>
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-poster-green/15">
              <span className="block h-full w-1/3 animate-sweep rounded-full bg-poster-green motion-reduce:animate-none" />
            </span>
          </div>
        ) : !check ? (
          !error && (
            <EmptyState title="Run a check" stamp="5 lenses">
              Paste any piece of copy on the left. It&apos;s judged on voice, positioning, audience, personality and visual language —
              each verdict quotes your words and names the decision it was judged against.
            </EmptyState>
          )
        ) : (
          <div key={check.id} className="space-y-5">
            <div className="flex flex-wrap items-center gap-4 animate-in fade-in-0 zoom-in-95 duration-500">
              <Stamp tone={OVERALL_STYLE[check.result.overall].tone} className="px-5 py-2 text-base">
                {OVERALL_STYLE[check.result.overall].stamp}
              </Stamp>
              <p className="min-w-0 flex-1 font-semibold leading-snug">{check.result.summary}</p>
            </div>

            <QuotedContent content={check.repaired ?? check.content} mark={check.repair ? undefined : check.result.repair?.original} />

            <ol className="space-y-2.5">
              {check.result.dimensions.map((d, i) => {
                const meta = CONTENT_DIMENSION_META[d.dimension]
                const badge = STATUS_BADGE[d.status]
                return (
                  <li
                    key={d.dimension}
                    style={{ animationDelay: `${150 + i * 90}ms` }}
                    className={cn(
                      'group/d relative overflow-hidden rounded-2xl border-2 border-poster-ink/15 bg-white py-3 pl-5 pr-4',
                      'animate-in fade-in-0 slide-in-from-top-2 fill-mode-backwards duration-500',
                      'transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-poster-ink hover:shadow-[4px_4px_0_0_#111] motion-reduce:hover:translate-y-0',
                      SPRING,
                      d.status === 'not-applicable' && 'opacity-70',
                    )}
                  >
                    <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1.5 transition-[width] duration-300 group-hover/d:w-2.5', badge.bar)} />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-poster-ink text-sm text-poster-paper group-hover/d:animate-wiggle motion-reduce:group-hover/d:animate-none">
                        {meta.glyph}
                      </span>
                      <span className="text-sm font-extrabold uppercase tracking-wide">{meta.label}</span>
                      <span className={cn('ml-auto rounded-full border-2 px-2.5 py-0.5 text-[11px] font-extrabold uppercase', badge.className)}>{badge.label}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-snug">{d.finding}</p>
                    <p className="mt-1.5 text-xs font-semibold text-poster-ink/50">
                      Judged against{' '}
                      <code className="rounded-md border border-poster-ink/15 bg-poster-ink/5 px-1.5 py-0.5 font-mono text-[11px] font-bold text-poster-ink/70">{d.evidence}</code>
                    </p>
                    {d.recommendation && (
                      <p className="mt-2 rounded-xl bg-poster-green/10 px-3 py-2 text-sm font-semibold">
                        <span className="font-extrabold uppercase tracking-wide">Recommendation · </span>
                        {d.recommendation}
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>

            {check.result.repair && <Repair check={check} onUse={onUse} onKeep={onKeep} onEdit={onEdit} onRecheck={onRecheck} />}
          </div>
        )}
      </div>
    </Panel>
  )
}

export type { ContentCheckResult }
