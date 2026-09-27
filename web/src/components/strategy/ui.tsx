'use client'

import { useEffect, useState } from 'react'
import type { Confidence } from 'brandstate'
import type { DecisionStatus } from '@/lib/strategy'
import { FieldLabel } from '@/components/project/panel'
import HoverLetters from '@/components/hover-letters'
import { cn } from '@/lib/utils'

/*
 * Shared pieces for the strategy tabs, in the same poster language as /new and the
 * landing page: springy lifts, ringed stamps, hard offset shadows, a hand-drawn swash
 * and letters that lift on hover. Every motion stops under prefers-reduced-motion
 * (globals.css zeroes durations; transforms are also disabled here where they'd stick).
 */

/** The hero's springy ease. */
export const SPRING = '[transition-timing-function:cubic-bezier(.3,1.6,.5,1)]'

const focus = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40'
const lift = cn(
  'transition-[background-color,color,border-color,transform,box-shadow] duration-300',
  SPRING,
  'hover:-translate-y-0.5 active:translate-y-0 active:shadow-none',
  'disabled:translate-y-0 disabled:shadow-none',
  'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
)

export const btnPrimary = cn(
  'group inline-flex h-10 items-center gap-1.5 rounded-full border-2 border-poster-ink bg-poster-green px-5 text-sm font-extrabold hover:bg-poster-ink hover:text-poster-paper hover:shadow-[3px_3px_0_0_#5fb57a] disabled:cursor-not-allowed disabled:border-poster-ink/20 disabled:bg-poster-ink/10 disabled:text-poster-ink/40',
  lift,
  focus,
)

export const btnSecondary = cn(
  'group inline-flex h-10 items-center gap-1.5 rounded-full border-2 border-poster-ink bg-white px-4 text-sm font-extrabold hover:text-poster-green hover:shadow-[3px_3px_0_0_#111] disabled:cursor-not-allowed disabled:border-poster-ink/20 disabled:text-poster-ink/40',
  lift,
  focus,
)

const btnSmall = cn(
  'inline-flex h-8 items-center gap-1 rounded-full border-2 px-3 text-xs font-extrabold disabled:cursor-not-allowed disabled:opacity-40',
  lift,
  focus,
)

export const linkButton = cn(
  'text-xs font-extrabold uppercase tracking-wide underline decoration-poster-green decoration-2 underline-offset-4 transition-[text-underline-offset] duration-200 hover:text-poster-green hover:underline-offset-[6px] disabled:cursor-not-allowed disabled:text-poster-ink/35 disabled:no-underline',
)

/** The → that slides forward when its button (a `group`) is hovered. */
export function Arrow() {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none', SPRING)}
    >
      →
    </span>
  )
}

/** The /new page's hand-drawn swash, drawn once on mount under a heading. */
export function Swash({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 255 72"
      preserveAspectRatio="none"
      className={cn('pointer-events-none absolute -left-[4%] top-[0.55em] h-[0.7em] w-[108%] overflow-visible', className)}
    >
      <path
        pathLength={1}
        d="M6 44 C40 18 150 4 222 14 C262 20 258 48 214 58 C150 72 60 70 30 60 C10 53 20 40 60 34"
        className="animate-draw fill-none stroke-poster-green [stroke-dasharray:1] [stroke-linecap:round] [stroke-width:3px] [vector-effect:non-scaling-stroke] motion-reduce:animate-none"
      />
    </svg>
  )
}

/** A ringed, tilted stamp like "Rough is fine" on /new. Straightens and grows on hover. */
export function Stamp({ children, tone = 'green', className }: { children: React.ReactNode; tone?: 'green' | 'white' | 'red'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block cursor-default select-none rounded-[50%] border-2 px-3.5 py-1 text-[11px] font-extrabold uppercase tracking-wide',
        'rotate-[-7deg] transition-transform duration-300 hover:rotate-[4deg] hover:scale-[1.08]',
        'animate-in fade-in-0 zoom-in-50 spin-in-12 duration-300',
        SPRING,
        'motion-reduce:transition-none',
        tone === 'green' && 'border-poster-ink bg-poster-green',
        tone === 'white' && 'border-poster-ink bg-white',
        tone === 'red' && 'border-[#c4282d] bg-white text-[#c4282d]',
        className,
      )}
    >
      {children}
    </span>
  )
}

const CONFIDENCE_DOT: Record<Confidence, string> = {
  high: 'bg-poster-green',
  medium: 'bg-[#f2c94c]',
  low: 'bg-[#e5484d]',
}

/** `● HIGH` pill. Only rendered where the engine actually assessed confidence. */
export function ConfidenceTag({ value }: { value: Confidence }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-poster-ink bg-white px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide">
      <span aria-hidden="true" className={cn('h-2 w-2 rounded-full ring-1 ring-poster-ink', CONFIDENCE_DOT[value])} />
      {value} confidence
    </span>
  )
}

export type StepState = 'done' | 'active' | 'queued' | 'failed'

/** Seconds since this step started. Real time, so a long call reads as working, not stuck. */
function Elapsed() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const id = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="tabular-nums text-xs font-bold text-poster-ink/45">{seconds}s</span>
}

/** The AI progress list: ✓ done, ◌ running, ○ queued, ✗ failed. One row per real call. */
export function ProgressSteps({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className="space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-300" aria-live="polite">
      {steps.map((s) => (
        <li
          key={s.label}
          className={cn(
            'relative flex items-center justify-between gap-4 overflow-hidden rounded-2xl border-2 px-4 py-3 text-sm font-bold transition-colors duration-300',
            s.state === 'active' && 'border-poster-ink bg-white shadow-[4px_4px_0_0_#5fb57a]',
            s.state === 'done' && 'border-poster-ink/20 bg-white/60',
            s.state === 'queued' && 'border-dashed border-poster-ink/20 text-poster-ink/40',
            s.state === 'failed' && 'border-[#e5484d] bg-white',
          )}
        >
          <span>{s.label}</span>
          <span className="flex items-center gap-3">
            {s.state === 'active' && <Elapsed />}
            <span
              aria-label={s.state}
              className={cn(
                'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs',
                s.state === 'done' && 'animate-in zoom-in-50 bg-poster-green ring-2 ring-poster-ink duration-300',
                s.state === 'active' && 'animate-spin border-2 border-poster-ink border-t-transparent motion-reduce:animate-none',
                s.state === 'queued' && 'border-2 border-poster-ink/25',
                s.state === 'failed' && 'animate-in zoom-in-50 bg-[#e5484d] text-white duration-300',
              )}
            >
              {s.state === 'done' ? '✓' : s.state === 'failed' ? '✗' : ''}
            </span>
          </span>
          {s.state === 'active' && (
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-poster-green/15">
              <span className="block h-full w-1/3 animate-sweep rounded-full bg-poster-green motion-reduce:animate-none" />
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

/**
 * The failure card, as on the discovery conversation: what failed, that nothing is lost,
 * and a retry. The technical detail (development only) sits behind a disclosure, so a raw
 * provider error never dominates the page.
 */
export function ErrorCard({
  message,
  detail,
  savedNote = 'Nothing is lost — every decision so far is saved.',
  onRetry,
  onDismiss,
}: {
  message: string
  detail?: string
  /** What the user can count on after the failure. */
  savedNote?: string
  onRetry?: () => void
  onDismiss?: () => void
}) {
  const headline = message

  return (
    <div
      className="rounded-2xl border-2 border-[#e5484d] bg-white px-4 py-3 shadow-[4px_4px_0_0_#e5484d] animate-in fade-in-0 slide-in-from-top-1 duration-300"
      role="alert"
    >
      <p className="text-sm font-extrabold text-[#c4282d]">That didn&apos;t go through.</p>
      <p className="mt-1 break-words font-semibold leading-snug">{headline}</p>
      <p className="mt-1 text-xs font-semibold text-poster-ink/55">{savedNote}</p>
      {detail && (
        <details className="group/details mt-2">
          <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wide text-poster-ink/50 hover:text-poster-ink">
            Technical details
          </summary>
          <p className="mt-2 max-h-40 overflow-auto break-words rounded-xl bg-poster-ink/5 px-3 py-2 font-mono text-[11px] leading-relaxed text-poster-ink/70">
            {detail}
          </p>
        </details>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {onRetry && (
          <button type="button" onClick={onRetry} className={cn(btnSecondary, 'h-9')}>
            <span aria-hidden="true" className={cn('inline-block transition-transform duration-500 group-hover:-rotate-180', SPRING)}>
              ↻
            </span>
            Try again
          </button>
        )}
        {onDismiss && (
          <button type="button" onClick={onDismiss} className={linkButton}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}

/** Centered empty/locked state inside a tab: poster heading with a drawn swash, optional stamp. */
export function EmptyState({
  title,
  stamp,
  children,
  action,
}: {
  title: string
  /** A short tilted note in the corner, e.g. "Step 01". */
  stamp?: string
  children?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="relative grid min-h-[260px] place-items-center rounded-3xl border-2 border-dashed border-poster-ink/25 px-6 py-12 text-center animate-in fade-in-0 zoom-in-95 duration-300">
      {stamp && <Stamp className="absolute right-5 top-5" tone="white">{stamp}</Stamp>}
      <div className="max-w-md">
        <p className="font-display text-3xl uppercase leading-none tracking-[-0.03em]">
          <span className="relative inline-block">
            <HoverLetters text={title} />
            <Swash className="top-[0.62em]" />
          </span>
        </p>
        {children && <div className="mt-5 text-sm font-semibold text-poster-ink/60">{children}</div>}
        {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
      </div>
    </div>
  )
}

/** A green dot list, as on the discovery page. */
export function DotList({ items, tone = 'green' }: { items: string[]; tone?: 'green' | 'red' | 'amber' }) {
  const dot = tone === 'green' ? 'bg-poster-green' : tone === 'red' ? 'bg-[#e5484d]' : 'bg-[#f2c94c]'
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={`${i}-${item}`} className="group/dot flex gap-3 text-sm font-semibold leading-snug">
          <span
            aria-hidden="true"
            className={cn(
              'mt-1.5 h-2 w-2 shrink-0 rounded-full ring-1 ring-poster-ink transition-transform duration-300 group-hover/dot:scale-150',
              SPRING,
              dot,
            )}
          />
          {item}
        </li>
      ))}
    </ul>
  )
}

/** Pill chips. Plain ones tilt and turn green on hover, like the /new example chips. */
export function Chips({ items, tone = 'plain' }: { items: string[]; tone?: 'plain' | 'avoid' }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <li
          key={`${i}-${item}`}
          className={cn(
            'rounded-full border-2 px-3 py-1 text-sm font-bold',
            tone === 'plain'
              ? cn('border-poster-ink bg-white transition-[transform,background-color] duration-300 hover:-rotate-2 hover:bg-poster-green', SPRING)
              : 'border-[#e5484d]/60 bg-[#e5484d]/10 line-through decoration-[#e5484d]/60',
          )}
        >
          {item}
        </li>
      ))}
    </ul>
  )
}

const STAMPS: Record<Exclude<DecisionStatus, 'proposed'>, { text: string; tone: 'green' | 'white' | 'red' }> = {
  accepted: { text: '✓ Accepted', tone: 'green' },
  edited: { text: '✎ Yours', tone: 'white' },
  rejected: { text: '✗ Rejected', tone: 'red' },
}

/**
 * One AI recommendation with Accept / Reject / Edit.
 *
 * Editing works on text: a single value, or a list as one item per line. The parent owns
 * the data; this only reports what the user decided. A decision lands as a stamp.
 */
export function DecisionField({
  label,
  status,
  editValue,
  multiline = false,
  hint,
  disabled,
  onDecide,
  onEdit,
  children,
}: {
  label: string
  status: DecisionStatus
  /** The current value as editable text. Omit to hide Edit. */
  editValue?: string
  /** Lists edit one item per line. */
  multiline?: boolean
  hint?: string
  disabled?: boolean
  onDecide: (status: 'accepted' | 'rejected') => void
  onEdit?: (text: string) => void
  children: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const id = `edit-${label.replace(/\W+/g, '-').toLowerCase()}`
  const settled = status === 'accepted' || status === 'edited'

  const startEdit = () => {
    setDraft(editValue ?? '')
    setEditing(true)
  }

  const save = () => {
    const text = draft.trim()
    if (!text || !onEdit) return
    onEdit(text)
    setEditing(false)
  }

  return (
    <div
      className={cn(
        'relative rounded-2xl border-2 px-4 py-4 transition-[border-color,background-color,box-shadow,transform] duration-300',
        // Editing lifts the card onto the hard green shadow, like the idea box on /new.
        'focus-within:-translate-x-1 focus-within:-translate-y-1 focus-within:shadow-[8px_8px_0_#5fb57a] motion-reduce:focus-within:translate-x-0 motion-reduce:focus-within:translate-y-0',
        settled
          ? 'border-poster-ink bg-poster-green/10'
          : status === 'rejected'
            ? 'border-[#e5484d]/60 bg-white'
            : 'border-poster-ink/15 bg-white hover:border-poster-ink/40',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel>{label}</FieldLabel>
        {status !== 'proposed' && (
          <Stamp key={status} tone={STAMPS[status].tone}>
            {STAMPS[status].text}
          </Stamp>
        )}
      </div>

      {editing ? (
        <div className="mt-3 animate-in fade-in-0 duration-200">
          <label htmlFor={id} className="sr-only">
            Edit {label}
          </label>
          <textarea
            id={id}
            rows={multiline ? 5 : 3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false)
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
            }}
            autoFocus
            className="block w-full resize-y rounded-2xl border-2 border-poster-ink bg-white px-4 py-3 text-sm font-semibold focus-visible:outline-none"
          />
          <p className="mt-1 text-xs font-semibold text-poster-ink/50">
            {multiline ? 'One item per line · ' : ''}Ctrl+Enter to save · Esc to cancel
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={save} disabled={!draft.trim()} className={cn(btnPrimary, 'h-9')}>
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className={cn(btnSecondary, 'h-9')}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-2">{children}</div>
          {hint && <p className="mt-2 text-xs font-semibold text-poster-ink/50">{hint}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || status === 'accepted'}
              onClick={() => onDecide('accepted')}
              className={cn(btnSmall, 'border-poster-ink bg-poster-green hover:bg-poster-ink hover:text-poster-paper hover:shadow-[2px_2px_0_0_#5fb57a]')}
            >
              ✓ Accept
            </button>
            <button
              type="button"
              disabled={disabled || status === 'rejected'}
              onClick={() => onDecide('rejected')}
              className={cn(btnSmall, 'border-poster-ink bg-white hover:text-[#c4282d] hover:shadow-[2px_2px_0_0_#e5484d]')}
            >
              ✗ Reject
            </button>
            {editValue !== undefined && onEdit && (
              <button
                type="button"
                disabled={disabled}
                onClick={startEdit}
                className={cn(btnSmall, 'border-poster-ink bg-white hover:text-poster-green hover:shadow-[2px_2px_0_0_#111]')}
              >
                ✎ Edit
              </button>
            )}
          </div>
          {status === 'rejected' && (
            <p className="mt-2 text-xs font-semibold text-[#c4282d] animate-in fade-in-0 duration-300">
              Rejected. Edit it to your own wording, or regenerate this section.
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** Section heading inside a tab. Plain-text headings get the hover-letter treatment. */
export function SectionHeading({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-poster-ink/10 pb-2">
      <h3 className="font-display text-lg uppercase leading-none tracking-[-0.02em]">
        {typeof children === 'string' ? <HoverLetters text={children} /> : children}
      </h3>
      {aside}
    </div>
  )
}

/** Splits edited list text into items, dropping blanks. */
export function toLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
}
