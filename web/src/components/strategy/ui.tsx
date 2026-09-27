'use client'

import { useState } from 'react'
import type { Confidence } from 'brandstate'
import type { DecisionStatus } from '@/lib/strategy'
import { FieldLabel } from '@/components/project/panel'
import { cn } from '@/lib/utils'

/* Shared pieces for the strategy tabs, in the discovery page's poster style. */

const focus = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40'

export const btnPrimary = cn(
  'inline-flex h-10 items-center rounded-full border-2 border-poster-ink bg-poster-green px-5 text-sm font-extrabold hover:bg-poster-ink hover:text-poster-paper disabled:cursor-not-allowed disabled:border-poster-ink/20 disabled:bg-poster-ink/10 disabled:text-poster-ink/40',
  focus,
)

export const btnSecondary = cn(
  'inline-flex h-10 items-center rounded-full border-2 border-poster-ink bg-white px-4 text-sm font-extrabold hover:text-poster-green disabled:cursor-not-allowed disabled:border-poster-ink/20 disabled:text-poster-ink/40',
  focus,
)

const btnSmall = cn(
  'inline-flex h-8 items-center gap-1 rounded-full border-2 px-3 text-xs font-extrabold disabled:cursor-not-allowed disabled:opacity-40',
  focus,
)

export const linkButton = cn(
  'text-xs font-extrabold uppercase tracking-wide underline decoration-poster-green decoration-2 underline-offset-4 hover:text-poster-green disabled:cursor-not-allowed disabled:text-poster-ink/35 disabled:no-underline',
)

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

/** The AI progress list: ✓ done, ◌ running, ○ queued, ✗ failed. One row per real call. */
export function ProgressSteps({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className="space-y-2" aria-live="polite">
      {steps.map((s) => (
        <li
          key={s.label}
          className={cn(
            'flex items-center justify-between gap-4 rounded-2xl border-2 px-4 py-3 text-sm font-bold',
            s.state === 'active' && 'border-poster-ink bg-white',
            s.state === 'done' && 'border-poster-ink/20 bg-white/60',
            s.state === 'queued' && 'border-dashed border-poster-ink/20 text-poster-ink/40',
            s.state === 'failed' && 'border-[#e5484d] bg-white',
          )}
        >
          <span>{s.label}</span>
          <span
            aria-label={s.state}
            className={cn(
              'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs',
              s.state === 'done' && 'bg-poster-green ring-2 ring-poster-ink',
              s.state === 'active' && 'animate-spin border-2 border-poster-ink border-t-transparent motion-reduce:animate-none',
              s.state === 'queued' && 'border-2 border-poster-ink/25',
              s.state === 'failed' && 'bg-[#e5484d] text-white',
            )}
          >
            {s.state === 'done' ? '✓' : s.state === 'failed' ? '✗' : ''}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Same failure card as the discovery conversation: what failed, that nothing is lost, retry. */
export function ErrorCard({ message, onRetry, onDismiss }: { message: string; onRetry?: () => void; onDismiss?: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-[#e5484d] bg-white px-4 py-3" role="alert">
      <p className="text-sm font-extrabold text-[#c4282d]">That didn&apos;t go through.</p>
      <p className="mt-1 break-words text-sm font-semibold">{message}</p>
      <p className="mt-1 text-xs font-semibold text-poster-ink/55">Nothing is lost — every decision so far is saved.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry && (
          <button type="button" onClick={onRetry} className={cn(btnSecondary, 'h-9')}>
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

/** Centered empty/locked state inside a tab. */
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="grid min-h-[240px] place-items-center rounded-3xl border-2 border-dashed border-poster-ink/25 px-6 py-10 text-center">
      <div className="max-w-md">
        <p className="font-display text-2xl uppercase leading-none tracking-[-0.03em]">{title}</p>
        {children && <div className="mt-3 text-sm font-semibold text-poster-ink/60">{children}</div>}
        {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
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
        <li key={`${i}-${item}`} className="flex gap-3 text-sm font-semibold leading-snug">
          <span aria-hidden="true" className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full ring-1 ring-poster-ink', dot)} />
          {item}
        </li>
      ))}
    </ul>
  )
}

export function Chips({ items, tone = 'plain' }: { items: string[]; tone?: 'plain' | 'avoid' }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <li
          key={`${i}-${item}`}
          className={cn(
            'rounded-full border-2 px-3 py-1 text-sm font-bold',
            tone === 'plain' ? 'border-poster-ink bg-white' : 'border-[#e5484d]/60 bg-[#e5484d]/10 line-through decoration-[#e5484d]/60',
          )}
        >
          {item}
        </li>
      ))}
    </ul>
  )
}

const STATUS_LABEL: Record<Exclude<DecisionStatus, 'proposed'>, string> = {
  accepted: '✓ Accepted',
  edited: '✎ Edited by you',
  rejected: '✗ Rejected',
}

/**
 * One AI recommendation with Accept / Reject / Edit.
 *
 * Editing works on text: a single value, or a list as one item per line. The parent owns
 * the data; this only reports what the user decided.
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
        'rounded-2xl border-2 px-4 py-4 transition-colors',
        status === 'accepted' || status === 'edited'
          ? 'border-poster-ink bg-poster-green/10'
          : status === 'rejected'
            ? 'border-[#e5484d]/60 bg-white'
            : 'border-poster-ink/15 bg-white',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel>{label}</FieldLabel>
        {status !== 'proposed' && (
          <span
            className={cn(
              'text-[11px] font-extrabold uppercase tracking-wide',
              status === 'rejected' ? 'text-[#c4282d]' : 'text-poster-ink',
            )}
          >
            {STATUS_LABEL[status]}
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-3">
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
            }}
            autoFocus
            className={cn(
              'block w-full resize-y rounded-2xl border-2 border-poster-ink bg-white px-4 py-3 text-sm font-semibold',
              focus,
            )}
          />
          {multiline && <p className="mt-1 text-xs font-semibold text-poster-ink/50">One item per line.</p>}
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
              className={cn(btnSmall, 'border-poster-ink bg-poster-green hover:bg-poster-ink hover:text-poster-paper')}
            >
              ✓ Accept
            </button>
            <button
              type="button"
              disabled={disabled || status === 'rejected'}
              onClick={() => onDecide('rejected')}
              className={cn(btnSmall, 'border-poster-ink bg-white hover:text-[#c4282d]')}
            >
              ✗ Reject
            </button>
            {editValue !== undefined && onEdit && (
              <button
                type="button"
                disabled={disabled}
                onClick={startEdit}
                className={cn(btnSmall, 'border-poster-ink bg-white hover:text-poster-green')}
              >
                ✎ Edit
              </button>
            )}
          </div>
          {status === 'rejected' && (
            <p className="mt-2 text-xs font-semibold text-[#c4282d]">
              Rejected. Edit it to your own wording, or regenerate this section.
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** Section heading inside a tab. */
export function SectionHeading({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-poster-ink/10 pb-2">
      <h3 className="font-display text-lg uppercase leading-none tracking-[-0.02em]">{children}</h3>
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
