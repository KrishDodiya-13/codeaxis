'use client'

import Link from 'next/link'
import type { BrandState, Positioning } from 'brandstate'
import type { DecisionStatus } from '@/lib/strategy'
import { FieldLabel } from '@/components/project/panel'
import {
  ConfidenceTag,
  DecisionField,
  DotList,
  EmptyState,
  SectionHeading,
  btnPrimary,
  btnSecondary,
} from './ui'

export type PositionField = 'category' | 'valueProposition' | 'differentiator' | 'competitiveAngle'

const FIELDS: { key: PositionField; label: string }[] = [
  { key: 'category', label: 'Category' },
  { key: 'valueProposition', label: 'Value proposition' },
  { key: 'differentiator', label: 'Differentiator' },
  { key: 'competitiveAngle', label: 'Competitive angle' },
]

export const POSITION_KEYS = FIELDS.map((f) => `positioning.${f.key}`)

export default function PositionTab({
  projectId,
  hasDiscovery,
  openQuestions,
  state,
  decisions,
  busy,
  onGenerate,
  onDecide,
  onEdit,
  onContinue,
}: {
  projectId: string
  hasDiscovery: boolean
  /** Discovery's unanswered questions; positioning will name what it assumed for each. */
  openQuestions: number
  state: BrandState | null
  decisions: Record<string, DecisionStatus>
  busy: boolean
  onGenerate: () => void
  onDecide: (key: string, label: string, status: 'accepted' | 'rejected') => void
  onEdit: (field: PositionField, label: string, value: string) => void
  onContinue: () => void
}) {
  if (!hasDiscovery) {
    return (
      <EmptyState
        title="Discovery comes first"
        action={
          <Link href={`/project/${projectId}/discover`} className={btnPrimary}>
            ← Go to Discovery
          </Link>
        }
      >
        Complete Discovery first to unlock positioning.
      </EmptyState>
    )
  }

  const p: Positioning | undefined = state && state.positioning.category !== '' ? state.positioning : undefined

  if (!p) {
    return (
      <EmptyState
        title="Position the brand"
        action={
          <button type="button" onClick={onGenerate} disabled={busy} className={btnPrimary}>
            Generate positioning →
          </button>
        }
      >
        <p>BRANDOS reads your discovery state and proposes a category, value proposition, differentiator and competitive angle — each with its reasoning.</p>
        {openQuestions > 0 && (
          <p className="mt-3 rounded-2xl bg-[#f2c94c]/25 px-4 py-3 text-xs">
            Discovery still has {openQuestions} open question{openQuestions === 1 ? '' : 's'}. Positioning will proceed and
            name every assumption it had to make, so you can check them.
          </p>
        )}
      </EmptyState>
    )
  }

  const settled = POSITION_KEYS.every((k) => decisions[k] === 'accepted' || decisions[k] === 'edited')
  const d = state!.discovery

  return (
    <div className="space-y-6">
      <SectionHeading
        aside={
          <div className="flex flex-wrap items-center gap-2">
            {p.confidence && <ConfidenceTag value={p.confidence} />}
            <button type="button" onClick={onGenerate} disabled={busy} className={`${btnSecondary} h-8 text-xs`}>
              ↻ Regenerate
            </button>
          </div>
        }
      >
        Positioning
      </SectionHeading>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border-2 border-dashed border-poster-ink/30 px-4 py-3">
          <FieldLabel>Target audience · from Discovery</FieldLabel>
          <p className="mt-1 text-sm font-semibold">{d.targetAudience}</p>
        </div>
        <div className="rounded-2xl border-2 border-dashed border-poster-ink/30 px-4 py-3">
          <FieldLabel>Core problem · from Discovery</FieldLabel>
          <p className="mt-1 text-sm font-semibold">{d.problem}</p>
        </div>
      </div>

      <div className="space-y-3">
        {FIELDS.map((f) => (
          <DecisionField
            key={f.key}
            label={f.label}
            status={decisions[`positioning.${f.key}`] ?? 'proposed'}
            editValue={p[f.key]}
            disabled={busy}
            onDecide={(s) => onDecide(`positioning.${f.key}`, f.label, s)}
            onEdit={(text) => onEdit(f.key, f.label, text)}
          >
            <p className="text-lg font-semibold leading-snug">{p[f.key]}</p>
          </DecisionField>
        ))}
      </div>

      {p.assumptions.length > 0 && (
        <details className="rounded-2xl border-2 border-[#f2c94c] bg-[#f2c94c]/15 px-4 py-3">
          <summary className="cursor-pointer text-sm font-extrabold uppercase tracking-wide">
            ~ This positioning assumes {p.assumptions.length} thing{p.assumptions.length === 1 ? '' : 's'} you didn&apos;t say
          </summary>
          <div className="mt-3">
            <DotList items={p.assumptions} tone="amber" />
          </div>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t-2 border-poster-ink/10 pt-4">
        <p className="text-sm font-bold text-poster-ink/60">
          {settled ? '✓ Positioning settled.' : 'Accept or edit each decision to settle positioning.'}
        </p>
        <button type="button" onClick={onContinue} className={`ml-auto ${settled ? btnPrimary : btnSecondary}`}>
          Continue to Brand Battle →
        </button>
      </div>
    </div>
  )
}
