'use client'

import type { BrandState } from 'brandstate'
import { isStageDone, type DecisionStatus, type Stage } from '@/lib/strategy'
import { FieldLabel } from '@/components/project/panel'
import { cn } from '@/lib/utils'
import { Chips, DecisionField, DotList, EmptyState, SectionHeading, btnPrimary, btnSecondary } from './ui'

export const SHAPE_STAGES: Stage[] = ['personality', 'naming', 'voice']

export const SHAPE_KEYS = [
  'personality.traits',
  'personality.antiTraits',
  'personality.values',
  'naming.territories',
  'voice.toneAttributes',
  'voice.messagingHierarchy',
]

type Decide = (key: string, label: string, status: 'accepted' | 'rejected') => void
type Edit = (key: string, label: string, text: string) => void

function Choice({
  name,
  checked,
  disabled,
  onChange,
  children,
}: {
  name: string
  checked: boolean
  disabled: boolean
  onChange: () => void
  children: React.ReactNode
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded-2xl border-2 px-4 py-3 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-poster-green/40',
        checked ? 'border-poster-ink bg-poster-green/10' : 'border-poster-ink/15 bg-white hover:border-poster-ink/40',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-poster-ink',
          checked && 'bg-poster-green',
        )}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-poster-ink" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

export default function ShapeTab({
  state,
  decisions,
  stale,
  busy,
  onGenerate,
  onDecide,
  onEdit,
  onSelectName,
  onSelectTagline,
  onContinue,
}: {
  state: BrandState | null
  decisions: Record<string, DecisionStatus>
  stale: Stage[]
  busy: boolean
  onGenerate: (stages: Stage[]) => void
  onDecide: Decide
  onEdit: Edit
  onSelectName: (name: string) => void
  onSelectTagline: (tagline: string) => void
  onContinue: () => void
}) {
  if (!state?.selectedStrategy) {
    return (
      <EmptyState title="Choose a direction first">
        Shape develops the direction you pick in Brand Battle — personality, naming and voice all follow from that choice.
      </EmptyState>
    )
  }

  const missing = SHAPE_STAGES.filter((s) => !isStageDone(state, s))
  const status = (key: string) => decisions[key] ?? 'proposed'

  if (missing.length === SHAPE_STAGES.length) {
    return (
      <EmptyState
        title="Brand shape"
        action={
          <button type="button" onClick={() => onGenerate(SHAPE_STAGES)} disabled={busy} className={btnPrimary}>
            Generate brand shape →
          </button>
        }
      >
        Personality and principles first, then naming territories, taglines and the voice — each built on your chosen
        direction.
      </EmptyState>
    )
  }

  const { personality, naming, voice } = state
  const shapeStale = stale.filter((s) => SHAPE_STAGES.includes(s))

  return (
    <div className="space-y-8">
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-poster-ink/30 px-4 py-3">
          <p className="text-sm font-bold">Still to generate: {missing.join(', ')}.</p>
          <button type="button" onClick={() => onGenerate(missing)} disabled={busy} className={`ml-auto ${btnPrimary} h-9`}>
            Continue generating →
          </button>
        </div>
      )}

      {/* Personality */}
      {isStageDone(state, 'personality') && (
        <section className="space-y-3" aria-label="Personality">
          <SectionHeading
            aside={
              <button
                type="button"
                onClick={() => onGenerate(SHAPE_STAGES)}
                disabled={busy}
                className={`${btnSecondary} h-8 text-xs`}
              >
                ↻ Regenerate shape
              </button>
            }
          >
            Personality {shapeStale.includes('personality') && <span className="text-[#b7791f]">· ⚠ may need update</span>}
          </SectionHeading>
          {personality.archetype && (
            <p className="text-sm font-bold">
              Archetype: <span className="rounded-full bg-poster-ink px-2.5 py-0.5 text-poster-paper">{personality.archetype}</span>
            </p>
          )}
          <DecisionField
            label="Personality traits"
            status={status('personality.traits')}
            editValue={personality.traits.join('\n')}
            multiline
            disabled={busy}
            onDecide={(s) => onDecide('personality.traits', 'Personality traits', s)}
            onEdit={(t) => onEdit('personality.traits', 'Personality traits', t)}
          >
            <Chips items={personality.traits} />
          </DecisionField>
          <DecisionField
            label="Avoid (anti-personality)"
            status={status('personality.antiTraits')}
            editValue={personality.antiTraits.join('\n')}
            multiline
            disabled={busy}
            onDecide={(s) => onDecide('personality.antiTraits', 'Anti-personality', s)}
            onEdit={(t) => onEdit('personality.antiTraits', 'Anti-personality', t)}
          >
            <DotList items={personality.antiTraits} tone="red" />
          </DecisionField>
          <DecisionField
            label="Brand principles"
            status={status('personality.values')}
            editValue={personality.values.join('\n')}
            multiline
            disabled={busy}
            onDecide={(s) => onDecide('personality.values', 'Brand principles', s)}
            onEdit={(t) => onEdit('personality.values', 'Brand principles', t)}
          >
            <ol className="list-decimal space-y-1.5 pl-5 text-sm font-semibold leading-snug">
              {personality.values.map((v, i) => (
                <li key={`${i}-${v}`}>{v}</li>
              ))}
            </ol>
          </DecisionField>
        </section>
      )}

      {/* Naming */}
      {isStageDone(state, 'naming') && (
        <section className="space-y-3" aria-label="Naming">
          <SectionHeading>
            Naming {shapeStale.includes('naming') && <span className="text-[#b7791f]">· ⚠ may need update</span>}
          </SectionHeading>
          <DecisionField
            label="Naming territories"
            status={status('naming.territories')}
            editValue={naming.territories.join('\n')}
            multiline
            disabled={busy}
            onDecide={(s) => onDecide('naming.territories', 'Naming territories', s)}
            onEdit={(t) => onEdit('naming.territories', 'Naming territories', t)}
          >
            <DotList items={naming.territories} />
          </DecisionField>

          {naming.candidates.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-2">
                <FieldLabel>Name candidates · pick one</FieldLabel>
              </legend>
              <div className="grid gap-2 lg:grid-cols-2">
                {naming.candidates.map((c) => (
                  <Choice
                    key={c.name}
                    name="brand-name"
                    checked={naming.selectedName === c.name}
                    disabled={busy}
                    onChange={() => onSelectName(c.name)}
                  >
                    <span className="block font-display text-lg uppercase leading-none tracking-[-0.02em]">{c.name}</span>
                    <span className="mt-1 block text-xs font-bold text-poster-ink/50">{c.territory}</span>
                    <span className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                      <span>
                        <span className="font-extrabold uppercase tracking-wide text-poster-ink/60">Pros</span>
                        {c.pros.map((p) => (
                          <span key={p} className="mt-1 block font-semibold">+ {p}</span>
                        ))}
                      </span>
                      <span>
                        <span className="font-extrabold uppercase tracking-wide text-poster-ink/60">Cons</span>
                        {c.cons.map((p) => (
                          <span key={p} className="mt-1 block font-semibold">− {p}</span>
                        ))}
                      </span>
                    </span>
                  </Choice>
                ))}
              </div>
            </fieldset>
          )}

          {naming.tagline.candidates.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-2">
                <FieldLabel>Tagline directions · pick one</FieldLabel>
              </legend>
              {naming.tagline.candidates.map((t) => (
                <Choice
                  key={t}
                  name="tagline"
                  checked={naming.tagline.selected === t}
                  disabled={busy}
                  onChange={() => onSelectTagline(t)}
                >
                  <span className="font-semibold">&ldquo;{t}&rdquo;</span>
                </Choice>
              ))}
            </fieldset>
          )}
        </section>
      )}

      {/* Voice */}
      {isStageDone(state, 'voice') && (
        <section className="space-y-3" aria-label="Voice">
          <SectionHeading>
            Voice {shapeStale.includes('voice') && <span className="text-[#b7791f]">· ⚠ may need update</span>}
          </SectionHeading>
          <DecisionField
            label="Tone"
            status={status('voice.toneAttributes')}
            editValue={voice.toneAttributes.join('\n')}
            multiline
            disabled={busy}
            onDecide={(s) => onDecide('voice.toneAttributes', 'Tone', s)}
            onEdit={(t) => onEdit('voice.toneAttributes', 'Tone', t)}
          >
            <Chips items={voice.toneAttributes} />
          </DecisionField>
          <DecisionField
            label="Message hierarchy"
            status={status('voice.messagingHierarchy')}
            editValue={[voice.messagingHierarchy.primaryMessage, ...voice.messagingHierarchy.supportingMessages].join('\n')}
            multiline
            hint="When editing, the first line is the primary message."
            disabled={busy}
            onDecide={(s) => onDecide('voice.messagingHierarchy', 'Message hierarchy', s)}
            onEdit={(t) => onEdit('voice.messagingHierarchy', 'Message hierarchy', t)}
          >
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs font-extrabold uppercase tracking-wide text-poster-ink/60">Primary</dt>
                <dd className="text-lg font-semibold leading-snug">{voice.messagingHierarchy.primaryMessage}</dd>
              </div>
              {voice.messagingHierarchy.supportingMessages.length > 0 && (
                <div>
                  <dt className="text-xs font-extrabold uppercase tracking-wide text-poster-ink/60">Supporting</dt>
                  <dd className="mt-1">
                    <DotList items={voice.messagingHierarchy.supportingMessages} />
                  </dd>
                </div>
              )}
            </dl>
          </DecisionField>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border-2 border-poster-ink/15 bg-white px-4 py-4">
              <FieldLabel>Writing principles</FieldLabel>
              <div className="mt-2">
                <DotList items={voice.writingPrinciples} />
              </div>
            </div>
            <div className="rounded-2xl border-2 border-poster-ink/15 bg-white px-4 py-4">
              <FieldLabel>Never write</FieldLabel>
              <div className="mt-2">
                <DotList items={voice.avoid} tone="red" />
              </div>
            </div>
          </div>
        </section>
      )}

      {missing.length === 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t-2 border-poster-ink/10 pt-4">
          <p className="text-sm font-bold text-poster-ink/60">
            {naming.selectedName && naming.tagline.selected
              ? `✓ ${naming.selectedName} — “${naming.tagline.selected}”`
              : 'Pick a name and a tagline — Brand OS uses them.'}
          </p>
          <button type="button" onClick={onContinue} className={`ml-auto ${btnPrimary}`}>
            Continue to Visual →
          </button>
        </div>
      )}
    </div>
  )
}
