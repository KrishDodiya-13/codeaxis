'use client'

import type { BrandState, NameCandidate } from 'brandstate'
import { isStageDone, selectedOption, type DecisionStatus, type Stage } from '@/lib/strategy'
import { FieldLabel } from '@/components/project/panel'
import HoverLetters from '@/components/hover-letters'
import { cn } from '@/lib/utils'
import { Arrow, DecisionField, EmptyState, SPRING, SectionHeading, Stamp, btnPrimary, btnSecondary } from './ui'

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

/** Sticker tilts, cycled so a row of chips looks hand-placed rather than typeset. */
const TILTS = ['-rotate-2', 'rotate-1', '-rotate-1', 'rotate-2', 'rotate-[-1.5deg]']

const settled = (s: DecisionStatus | undefined) => s === 'accepted' || s === 'edited'

/** Entrance for a list item, staggered by its index. */
const rise = (i: number) => ({
  style: { animationDelay: `${Math.min(i, 8) * 60}ms` },
  className: 'animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-backwards duration-500',
})

function StaleNote({ show }: { show: boolean }) {
  if (!show) return null
  return <span className="text-[#b7791f]"> · ⚠ may need update</span>
}

/* ------------------------------------------------------------------------------------ */

/**
 * The live brand card: what's been picked so far, as a poster. It updates the moment a
 * name, tagline or trait changes, so the user sees the brand assemble rather than a form.
 */
function BrandCard({ state }: { state: BrandState }) {
  const option = selectedOption(state)
  const { personality, naming } = state
  const name = naming.selectedName
  const tagline = naming.tagline.selected

  return (
    <div
      className={cn(
        'group/card relative overflow-hidden rounded-3xl border-2 border-poster-ink bg-poster-ink p-6 text-poster-paper shadow-[6px_6px_0_0_#5fb57a]',
        'transition-transform duration-500 hover:-rotate-[0.5deg] motion-reduce:transition-none motion-reduce:hover:rotate-0',
        SPRING,
        'animate-in fade-in-0 zoom-in-95 duration-500',
      )}
    >
      {/* A green sun in the corner that drifts, like the landing stickers. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 animate-bob rounded-full border-2 border-poster-paper/20 bg-poster-green motion-reduce:animate-none"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 top-20 h-10 w-10 rounded-full border-2 border-poster-paper/40 transition-transform duration-700 group-hover/card:translate-x-3 group-hover/card:rotate-45"
      />

      <div className="relative">
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-poster-paper/55">
          Brand card · updates as you pick
        </p>
        <p
          key={`name:${name ?? ''}`}
          className={cn(
            'mt-3 font-display text-[clamp(2rem,4vw,3.25rem)] uppercase leading-[0.9] tracking-[-0.045em] animate-in fade-in-0 slide-in-from-bottom-2 duration-500',
            !name && 'text-poster-paper/30',
          )}
        >
          <HoverLetters text={name ?? 'Your name here'} />
        </p>
        <p
          key={`tagline:${tagline ?? ''}`}
          className={cn(
            'mt-3 max-w-xl text-lg font-semibold leading-snug animate-in fade-in-0 duration-500',
            tagline ? 'text-poster-paper' : 'text-poster-paper/35',
          )}
        >
          {tagline ? `“${tagline}”` : 'Pick a tagline below and it lands here.'}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {personality.archetype && (
            <Stamp tone="green" className="text-poster-ink">
              {personality.archetype}
            </Stamp>
          )}
          {personality.traits.map((t, i) => (
            <span
              key={t}
              {...rise(i)}
              className={cn(
                rise(i).className,
                'rounded-full border-2 border-poster-paper/40 px-3 py-0.5 text-xs font-extrabold uppercase tracking-wide',
                'transition-colors duration-300 hover:border-poster-green hover:bg-poster-green hover:text-poster-ink',
              )}
            >
              {t}
            </span>
          ))}
        </div>
        {option && (
          <p className="mt-4 text-xs font-bold text-poster-paper/50">
            Built on the “{option.name}” direction
          </p>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------ */

/** Sticky jump bar: one pill per section, with how many of its decisions are settled. */
function SectionNav({ items }: { items: { id: string; label: string; done: number; total: number; ready: boolean }[] }) {
  const jump = (id: string) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }
  return (
    <nav
      aria-label="Shape sections"
      className="sticky -top-5 z-20 -mx-5 flex flex-wrap items-center gap-2 border-b-2 border-poster-ink/10 bg-white/90 px-5 py-3 backdrop-blur"
    >
      {items.map((s) => {
        const complete = s.ready && s.done === s.total
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            disabled={!s.ready}
            className={cn(
              'group inline-flex items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 text-xs font-extrabold uppercase tracking-wide',
              'transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#111] motion-reduce:hover:translate-y-0',
              SPRING,
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40',
              'disabled:cursor-not-allowed disabled:border-poster-ink/15 disabled:text-poster-ink/35 disabled:hover:translate-y-0 disabled:hover:shadow-none',
              complete ? 'border-poster-ink bg-poster-green' : 'border-poster-ink bg-white',
            )}
          >
            <span
              className={cn(
                'rounded-full px-2 py-0.5 tabular-nums group-hover:animate-wiggle motion-reduce:group-hover:animate-none',
                complete ? 'bg-white' : 'bg-poster-ink/10',
              )}
            >
              {complete ? '✓' : `${s.done}/${s.total}`}
            </span>
            {s.label}
          </button>
        )
      })}
      <span className="ml-auto hidden text-xs font-bold text-poster-ink/45 sm:inline">Accept or edit to settle each decision</span>
    </nav>
  )
}

/* ------------------------------------------------------------------------------------ */

/** A radio card. The native radio stays for keyboard and screen readers; the card is the target. */
function Choice({
  name,
  checked,
  disabled,
  onChange,
  className,
  children,
}: {
  name: string
  checked: boolean
  disabled: boolean
  onChange: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <label
      className={cn(
        // `relative` keeps the sr-only radio inside this label; without it, focusing the
        // radio scrolls the page's overflow-hidden container and the layout jumps.
        'group/choice relative flex cursor-pointer gap-3 rounded-2xl border-2 px-4 py-3 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-poster-green/40',
        'transition-[transform,box-shadow,border-color,background-color] duration-300 motion-reduce:transition-none',
        SPRING,
        checked
          ? 'border-poster-ink bg-poster-green/15 shadow-[4px_4px_0_0_#111]'
          : 'border-poster-ink/15 bg-white hover:-translate-y-0.5 hover:rotate-[-0.4deg] hover:border-poster-ink hover:shadow-[4px_4px_0_0_#5fb57a] motion-reduce:hover:translate-y-0 motion-reduce:hover:rotate-0',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-poster-ink transition-colors duration-300',
          checked ? 'bg-poster-green' : 'bg-white group-hover/choice:bg-poster-green/30',
        )}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-poster-ink animate-in zoom-in-0 duration-300" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

function NameCard({ c, checked, busy, onPick }: { c: NameCandidate; checked: boolean; busy: boolean; onPick: () => void }) {
  return (
    <Choice name="brand-name" checked={checked} disabled={busy} onChange={onPick} className="h-full">
      {checked && <Stamp className="absolute -top-3 right-3 z-10">✓ Picked</Stamp>}
      <span className="block font-display text-2xl uppercase leading-none tracking-[-0.03em]">
        <HoverLetters text={c.name} />
      </span>
      <span className="mt-1.5 inline-block rounded-full bg-poster-ink/5 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-poster-ink/55">
        {c.territory}
      </span>
      <span className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <span>
          <span className="font-extrabold uppercase tracking-wide text-poster-green">Pros</span>
          {c.pros.map((p) => (
            <span key={p} className="mt-1 flex gap-1.5 font-semibold leading-snug">
              <span aria-hidden="true" className="font-extrabold text-poster-green">+</span>
              {p}
            </span>
          ))}
        </span>
        <span>
          <span className="font-extrabold uppercase tracking-wide text-[#c4282d]">Cons</span>
          {c.cons.map((p) => (
            <span key={p} className="mt-1 flex gap-1.5 font-semibold leading-snug">
              <span aria-hidden="true" className="font-extrabold text-[#c4282d]">−</span>
              {p}
            </span>
          ))}
        </span>
      </span>
    </Choice>
  )
}

/** "confident, not arrogant" → ["confident", "arrogant"]. Anything else stays whole. */
function splitTone(attr: string): [string, string | undefined] {
  const [is, not] = attr.split(/,?\s+not\s+/i)
  return [is.trim(), not?.trim()]
}

/* ------------------------------------------------------------------------------------ */

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
      <EmptyState title="Choose a direction first" stamp="Locked">
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
        stamp="Step 03"
        action={
          <button type="button" onClick={() => onGenerate(SHAPE_STAGES)} disabled={busy} className={btnPrimary}>
            Generate brand shape <Arrow />
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

  const nav = [
    {
      id: 'shape-personality',
      label: 'Personality',
      ready: isStageDone(state, 'personality'),
      total: 3,
      done: ['personality.traits', 'personality.antiTraits', 'personality.values'].filter((k) => settled(decisions[k])).length,
    },
    {
      id: 'shape-naming',
      label: 'Naming',
      ready: isStageDone(state, 'naming'),
      total: 3,
      done: [settled(decisions['naming.territories']), !!naming.selectedName, !!naming.tagline.selected].filter(Boolean).length,
    },
    {
      id: 'shape-voice',
      label: 'Voice',
      ready: isStageDone(state, 'voice'),
      total: 2,
      done: ['voice.toneAttributes', 'voice.messagingHierarchy'].filter((k) => settled(decisions[k])).length,
    },
  ]

  return (
    <div className="space-y-8">
      <SectionNav items={nav} />

      <BrandCard state={state} />

      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-poster-ink/30 px-4 py-3 animate-in fade-in-0 duration-300">
          <p className="text-sm font-bold">Still to generate: {missing.join(', ')}.</p>
          <button type="button" onClick={() => onGenerate(missing)} disabled={busy} className={cn(btnPrimary, 'ml-auto h-9')}>
            Continue generating <Arrow />
          </button>
        </div>
      )}

      {/* ---------------- Personality ---------------- */}
      {isStageDone(state, 'personality') && (
        <section id="shape-personality" className="scroll-mt-20 space-y-3" aria-label="Personality">
          <SectionHeading
            aside={
              <button type="button" onClick={() => onGenerate(SHAPE_STAGES)} disabled={busy} className={cn(btnSecondary, 'h-8 text-xs')}>
                ↻ Regenerate shape
              </button>
            }
          >
            Personality
            <StaleNote show={shapeStale.includes('personality')} />
          </SectionHeading>

          <DecisionField
            label="Personality traits"
            status={status('personality.traits')}
            editValue={personality.traits.join('\n')}
            multiline
            disabled={busy}
            onDecide={(s) => onDecide('personality.traits', 'Personality traits', s)}
            onEdit={(t) => onEdit('personality.traits', 'Personality traits', t)}
          >
            {/* Stickers: each trait sits at a slight tilt and straightens, lifts and greens on hover. */}
            <ul className="flex flex-wrap gap-3 py-1">
              {personality.traits.map((t, i) => (
                <li
                  key={t}
                  {...rise(i)}
                  className={cn(
                    rise(i).className,
                    'cursor-default rounded-2xl border-2 border-poster-ink bg-white px-4 py-2 font-display text-lg uppercase leading-none tracking-[-0.02em] shadow-[3px_3px_0_0_#111]',
                    'transition-[transform,background-color,box-shadow] duration-300 hover:-translate-y-1 hover:rotate-0 hover:bg-poster-green hover:shadow-[5px_5px_0_0_#111]',
                    'motion-reduce:transition-none',
                    SPRING,
                    TILTS[i % TILTS.length],
                  )}
                >
                  {t}
                </li>
              ))}
            </ul>
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
            <ul className="grid gap-2 sm:grid-cols-2">
              {personality.antiTraits.map((t, i) => (
                <li
                  key={t}
                  {...rise(i)}
                  className={cn(
                    rise(i).className,
                    'group/anti flex gap-2 rounded-xl border-2 border-[#e5484d]/40 bg-[#e5484d]/5 px-3 py-2 text-sm font-semibold leading-snug',
                    'transition-[border-color,background-color] duration-300 hover:border-[#e5484d] hover:bg-[#e5484d]/10',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#e5484d] text-[10px] font-extrabold text-white group-hover/anti:animate-wiggle motion-reduce:group-hover/anti:animate-none"
                  >
                    ✗
                  </span>
                  {t}
                </li>
              ))}
            </ul>
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
            {/* Numbered poster cards; the numeral turns green and the card lifts on hover. */}
            <ol className="grid gap-3 sm:grid-cols-2">
              {personality.values.map((v, i) => (
                <li
                  key={`${i}-${v}`}
                  {...rise(i)}
                  className={cn(
                    rise(i).className,
                    'group/p relative flex gap-3 rounded-2xl border-2 border-poster-ink/15 bg-white px-4 py-3',
                    'transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-poster-ink hover:shadow-[4px_4px_0_0_#5fb57a]',
                    'motion-reduce:hover:translate-y-0',
                    SPRING,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="font-display text-3xl leading-none text-poster-ink/20 transition-colors duration-300 group-hover/p:text-poster-green"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-sm font-semibold leading-snug">{v}</span>
                </li>
              ))}
            </ol>
          </DecisionField>
        </section>
      )}

      {/* ---------------- Naming ---------------- */}
      {isStageDone(state, 'naming') && (
        <section id="shape-naming" className="scroll-mt-20 space-y-4" aria-label="Naming">
          <SectionHeading>
            Naming
            <StaleNote show={shapeStale.includes('naming')} />
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
            <ul className="flex flex-wrap gap-2">
              {naming.territories.map((t, i) => (
                <li
                  key={t}
                  {...rise(i)}
                  className={cn(
                    rise(i).className,
                    'rounded-full border-2 border-dashed border-poster-ink/40 px-3 py-1 text-sm font-bold',
                    'transition-[border-color,background-color,transform] duration-300 hover:-rotate-2 hover:border-solid hover:border-poster-ink hover:bg-poster-green/20',
                    SPRING,
                  )}
                >
                  {t}
                </li>
              ))}
            </ul>
          </DecisionField>

          {naming.candidates.length > 0 && (
            <fieldset>
              <legend className="mb-3 flex w-full items-center justify-between gap-2">
                <FieldLabel>Name candidates · pick one</FieldLabel>
                {naming.selectedName && <span className="text-xs font-bold text-poster-ink/50">Picked: {naming.selectedName}</span>}
              </legend>
              <div className="grid gap-3 pt-2 lg:grid-cols-2">
                {naming.candidates.map((c, i) => (
                  <div key={c.name} {...rise(i)}>
                    <NameCard c={c} checked={naming.selectedName === c.name} busy={busy} onPick={() => onSelectName(c.name)} />
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          {naming.tagline.candidates.length > 0 && (
            <fieldset>
              <legend className="mb-3">
                <FieldLabel>Tagline directions · pick one</FieldLabel>
              </legend>
              {/* Speech bubbles, since a tagline is something the brand says out loud. */}
              <div className="space-y-2">
                {naming.tagline.candidates.map((t, i) => (
                  <div key={t} {...rise(i)}>
                    <Choice
                      name="tagline"
                      checked={naming.tagline.selected === t}
                      disabled={busy}
                      onChange={() => onSelectTagline(t)}
                      className="rounded-bl-md"
                    >
                      <span className="text-lg font-semibold leading-snug">&ldquo;{t}&rdquo;</span>
                    </Choice>
                  </div>
                ))}
              </div>
            </fieldset>
          )}
        </section>
      )}

      {/* ---------------- Voice ---------------- */}
      {isStageDone(state, 'voice') && (
        <section id="shape-voice" className="scroll-mt-20 space-y-3" aria-label="Voice">
          <SectionHeading>
            Voice
            <StaleNote show={shapeStale.includes('voice')} />
          </SectionHeading>

          <DecisionField
            label="Tone · this, not that"
            status={status('voice.toneAttributes')}
            editValue={voice.toneAttributes.join('\n')}
            multiline
            disabled={busy}
            onDecide={(s) => onDecide('voice.toneAttributes', 'Tone', s)}
            onEdit={(t) => onEdit('voice.toneAttributes', 'Tone', t)}
          >
            <ul className="grid gap-2 sm:grid-cols-2">
              {voice.toneAttributes.map((attr, i) => {
                const [is, not] = splitTone(attr)
                return (
                  <li
                    key={attr}
                    {...rise(i)}
                    className={cn(
                      rise(i).className,
                      'group/tone flex items-center gap-2 rounded-2xl border-2 border-poster-ink/15 bg-white px-3 py-2',
                      'transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-poster-ink motion-reduce:hover:translate-y-0',
                      SPRING,
                    )}
                  >
                    <span className="rounded-full bg-poster-green px-2.5 py-0.5 text-sm font-extrabold transition-transform duration-300 group-hover/tone:scale-105">
                      {is}
                    </span>
                    {not && (
                      <>
                        <span aria-hidden="true" className="text-xs font-extrabold uppercase text-poster-ink/40">
                          not
                        </span>
                        <span className="text-sm font-bold text-poster-ink/45 line-through decoration-[#e5484d] decoration-2">
                          {not}
                        </span>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
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
            {/* A pyramid: the one thing to say on top, what backs it up hanging beneath. */}
            <div className="space-y-2">
              <div className="rounded-2xl border-2 border-poster-ink bg-poster-ink px-4 py-3 text-poster-paper shadow-[4px_4px_0_0_#5fb57a] animate-in fade-in-0 zoom-in-95 duration-500">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-poster-green">Primary</p>
                <p className="mt-1 text-xl font-semibold leading-snug">{voice.messagingHierarchy.primaryMessage}</p>
              </div>
              {voice.messagingHierarchy.supportingMessages.map((m, i) => (
                <div
                  key={m}
                  {...rise(i + 1)}
                  className={cn(
                    rise(i + 1).className,
                    'relative ml-6 rounded-xl border-2 border-poster-ink/15 bg-white px-4 py-2 text-sm font-semibold',
                    'transition-[border-color,transform] duration-300 hover:translate-x-1 hover:border-poster-ink motion-reduce:hover:translate-x-0',
                    SPRING,
                  )}
                >
                  <span aria-hidden="true" className="absolute -left-5 top-1/2 h-0.5 w-4 bg-poster-ink/25" />
                  {m}
                </div>
              ))}
            </div>
          </DecisionField>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border-2 border-poster-ink bg-poster-green/10 px-4 py-4 transition-shadow duration-300 hover:shadow-[4px_4px_0_0_#5fb57a]">
              <p className="text-xs font-extrabold uppercase tracking-wide">✓ Write like this</p>
              <ul className="mt-3 space-y-2">
                {voice.writingPrinciples.map((w, i) => (
                  <li key={w} {...rise(i)} className={cn(rise(i).className, 'flex gap-2 text-sm font-semibold leading-snug')}>
                    <span aria-hidden="true" className="font-extrabold text-poster-green">→</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border-2 border-[#e5484d]/50 bg-[#e5484d]/5 px-4 py-4 transition-shadow duration-300 hover:shadow-[4px_4px_0_0_#e5484d]">
              <p className="text-xs font-extrabold uppercase tracking-wide text-[#c4282d]">✗ Never write</p>
              <ul className="mt-3 space-y-2">
                {voice.avoid.map((w, i) => (
                  <li key={w} {...rise(i)} className={cn(rise(i).className, 'flex gap-2 text-sm font-semibold leading-snug')}>
                    <span aria-hidden="true" className="font-extrabold text-[#c4282d]">✗</span>
                    {w}
                  </li>
                ))}
              </ul>
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
          <button type="button" onClick={onContinue} className={cn(btnPrimary, 'ml-auto')}>
            Continue to Visual <Arrow />
          </button>
        </div>
      )}
    </div>
  )
}
