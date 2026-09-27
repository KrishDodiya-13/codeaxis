'use client'

import type { BrandState } from 'brandstate'
import type { DecisionStatus, Stage } from '@/lib/strategy'
import { FieldLabel } from '@/components/project/panel'
import { Chips, DecisionField, EmptyState, SectionHeading, btnPrimary, btnSecondary } from './ui'

export const VISUAL_TEXT_FIELDS = [
  { key: 'typography', label: 'Typography direction' },
  { key: 'shapes', label: 'Shape language' },
  { key: 'imagery', label: 'Imagery direction' },
  { key: 'composition', label: 'Composition' },
  { key: 'mood', label: 'Visual mood' },
] as const

export const VISUAL_KEYS = ['visualDirection.colors', ...VISUAL_TEXT_FIELDS.map((f) => `visualDirection.${f.key}`)]

const HEX = /#(?:[0-9a-f]{3}){1,2}\b/i

/** A color line such as "Deep Teal #0F4C5C — primary — carries trust", with a swatch when it has a hex. */
function ColorRow({ line }: { line: string }) {
  const hex = line.match(HEX)?.[0]
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="h-10 w-10 shrink-0 rounded-xl border-2 border-poster-ink"
        style={hex ? { backgroundColor: hex } : undefined}
      />
      <span className="text-sm font-semibold leading-snug">{line}</span>
    </li>
  )
}

export default function VisualTab({
  state,
  decisions,
  stale,
  busy,
  onGenerate,
  onDecide,
  onEdit,
  onContinue,
}: {
  state: BrandState | null
  decisions: Record<string, DecisionStatus>
  stale: Stage[]
  busy: boolean
  onGenerate: () => void
  onDecide: (key: string, label: string, status: 'accepted' | 'rejected') => void
  onEdit: (key: string, label: string, text: string) => void
  onContinue: () => void
}) {
  if (!state || state.personality.traits.length === 0) {
    return (
      <EmptyState title="Shape first">
        Every visual choice has to trace back to a personality trait, so the visual direction is built after Shape.
      </EmptyState>
    )
  }

  const v = state.visualDirection
  if (v.mood === '') {
    return (
      <EmptyState
        title="Visual direction"
        action={
          <button type="button" onClick={onGenerate} disabled={busy} className={btnPrimary}>
            Generate visual direction →
          </button>
        }
      >
        A strategic visual brief — color, type, shape, imagery and mood — where each choice is tied to your personality
        and positioning, not picked at random.
      </EmptyState>
    )
  }

  const status = (key: string) => decisions[key] ?? 'proposed'

  return (
    <div className="space-y-6">
      <SectionHeading
        aside={
          <button type="button" onClick={onGenerate} disabled={busy} className={`${btnSecondary} h-8 text-xs`}>
            ↻ Regenerate
          </button>
        }
      >
        Visual direction {stale.includes('visualDirection') && <span className="text-[#b7791f]">· ⚠ may need update</span>}
      </SectionHeading>

      <div className="rounded-2xl border-2 border-poster-ink bg-poster-ink px-5 py-4 text-poster-paper">
        <FieldLabel className="text-poster-paper/60">How it encodes the personality</FieldLabel>
        <p className="mt-2 font-semibold leading-snug">{v.visualPersonality}</p>
      </div>

      <DecisionField
        label="Color direction"
        status={status('visualDirection.colors')}
        editValue={v.colors.join('\n')}
        multiline
        disabled={busy}
        onDecide={(s) => onDecide('visualDirection.colors', 'Color direction', s)}
        onEdit={(t) => onEdit('visualDirection.colors', 'Color direction', t)}
      >
        <ul className="space-y-3">
          {v.colors.map((c, i) => (
            <ColorRow key={`${i}-${c}`} line={c} />
          ))}
        </ul>
      </DecisionField>

      <div className="grid gap-3 xl:grid-cols-2">
        {VISUAL_TEXT_FIELDS.map((f) => (
          <DecisionField
            key={f.key}
            label={f.label}
            status={status(`visualDirection.${f.key}`)}
            editValue={v[f.key]}
            disabled={busy}
            onDecide={(s) => onDecide(`visualDirection.${f.key}`, f.label, s)}
            onEdit={(t) => onEdit(`visualDirection.${f.key}`, f.label, t)}
          >
            <p className="text-sm font-semibold leading-snug">{v[f.key]}</p>
          </DecisionField>
        ))}
      </div>

      {v.avoid.length > 0 && (
        <div className="rounded-2xl border-2 border-poster-ink/15 bg-white px-4 py-4">
          <FieldLabel>Avoid</FieldLabel>
          <div className="mt-3">
            <Chips items={v.avoid} tone="avoid" />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t-2 border-poster-ink/10 pt-4">
        <p className="text-sm font-bold text-poster-ink/60">See how every decision connects.</p>
        <button type="button" onClick={onContinue} className={`ml-auto ${btnPrimary}`}>
          View Brand DNA →
        </button>
      </div>
    </div>
  )
}
