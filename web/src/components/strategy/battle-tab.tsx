'use client'

import { useState } from 'react'
import type { BrandState, Direction, StrategyOption } from 'brandstate'
import { directionLabel } from '@/lib/strategy'
import { FieldLabel } from '@/components/project/panel'
import { cn } from '@/lib/utils'
import { humanize } from '@/lib/humanize'
import { Arrow, DotList, EmptyState, SectionHeading, Stamp, btnPrimary, btnSecondary, linkButton, SPRING } from './ui'

const LETTERS = ['A', 'B', 'C', 'D', 'E']

function DirectionCard({
  option,
  letter,
  index,
  chosen,
  dimmed,
  busy,
  onChoose,
  onEdit,
}: {
  option: StrategyOption
  letter: string
  /** Position in the row, for the staggered entrance. */
  index: number
  chosen: boolean
  dimmed: boolean
  busy: boolean
  onChoose: () => void
  onEdit: (positioning: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  return (
    <article
      aria-label={`Direction ${letter}: ${option.name}`}
      style={{ animationDelay: `${index * 90}ms` }}
      className={cn(
        'group/card relative flex flex-col rounded-3xl border-2 bg-white p-5',
        'animate-in fade-in-0 slide-in-from-bottom-4 fill-mode-backwards duration-500',
        // Lifts and tilts a touch on hover, like the stickers on /new.
        'transition-[opacity,box-shadow,transform,border-color] duration-300 hover:-translate-y-1 hover:rotate-[-0.6deg]',
        SPRING,
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:rotate-0',
        chosen
          ? 'border-poster-ink bg-[linear-gradient(180deg,rgba(95,181,122,0.14),#fff_45%)] shadow-[6px_6px_0_0_#111]'
          : 'border-poster-ink/25 hover:border-poster-ink hover:shadow-[6px_6px_0_0_#5fb57a]',
        dimmed && 'opacity-55 hover:opacity-100 focus-within:opacity-100',
      )}
    >
      {chosen && (
        <Stamp className="absolute -top-3 right-4 z-10 px-4 py-1.5 text-xs shadow-[3px_3px_0_0_#111]">✓ Chosen</Stamp>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border-2 border-poster-ink p-[3px] pr-3 text-[11px] font-extrabold uppercase tracking-wide">
          <b
            className={cn(
              'rounded-full px-2 py-0.5 group-hover/card:animate-wiggle motion-reduce:group-hover/card:animate-none',
              chosen ? 'bg-poster-green' : 'bg-poster-ink/10',
            )}
          >
            {letter}
          </b>
          {directionLabel(option.direction)}
        </span>
      </div>

      <h3 className="mt-4 font-display text-xl uppercase leading-[0.95] tracking-[-0.03em] transition-colors duration-300 group-hover/card:text-poster-green">
        {option.name}
      </h3>
      <p className="mt-3 font-semibold leading-snug">{humanize(option.coreIdea)}</p>

      <div className="mt-4 space-y-4 text-sm">
        <div>
          <FieldLabel>Positioning</FieldLabel>
          {editing ? (
            <div className="mt-2">
              <label className="sr-only" htmlFor={`pos-${option.direction}`}>
                Edit positioning for {option.name}
              </label>
              <textarea
                id={`pos-${option.direction}`}
                rows={5}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                className="block w-full resize-y rounded-2xl border-2 border-poster-ink bg-white px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={!draft.trim()}
                  onClick={() => {
                    onEdit(draft.trim())
                    setEditing(false)
                  }}
                  className={cn(btnPrimary, 'h-8 text-xs')}
                >
                  Save
                </button>
                <button type="button" onClick={() => setEditing(false)} className={cn(btnSecondary, 'h-8 text-xs')}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 font-semibold leading-snug text-poster-ink/75">{humanize(option.positioning)}</p>
          )}
        </div>
        <div>
          <FieldLabel>Strengths</FieldLabel>
          <div className="mt-2">
            <DotList items={option.strengths} />
          </div>
        </div>
        <div>
          <FieldLabel>Risks</FieldLabel>
          <div className="mt-2">
            <DotList items={option.risks} tone="red" />
          </div>
        </div>
        <div>
          <FieldLabel>Trade-offs</FieldLabel>
          <div className="mt-2">
            <DotList items={option.tradeoffs} tone="amber" />
          </div>
        </div>
        <div>
          <FieldLabel>Audience fit</FieldLabel>
          <p className="mt-1 font-semibold leading-snug">{humanize(option.audienceFit)}</p>
        </div>
        <div>
          <FieldLabel>Differentiation</FieldLabel>
          <p className="mt-1 font-semibold leading-snug">{humanize(option.differentiation)}</p>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
        <button
          type="button"
          onClick={onChoose}
          disabled={busy || chosen}
          aria-pressed={chosen}
          className={chosen ? cn(btnPrimary, 'disabled:border-poster-ink disabled:bg-poster-green disabled:text-poster-ink') : btnSecondary}
        >
          {chosen ? '✓ Chosen' : (
            <>
              Choose this <Arrow />
            </>
          )}
        </button>
        {chosen && !editing && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(option.positioning)
              setEditing(true)
            }}
            className={linkButton}
          >
            ✎ Edit positioning
          </button>
        )}
      </div>
    </article>
  )
}

export default function BattleTab({
  state,
  busy,
  onGenerate,
  onChoose,
  onEditDirection,
  onContinue,
}: {
  state: BrandState | null
  busy: boolean
  onGenerate: () => void
  onChoose: (direction: Direction) => void
  onEditDirection: (direction: Direction, positioning: string) => void
  onContinue: () => void
}) {
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)

  if (!state || state.positioning.category === '') {
    return (
      <EmptyState title="Positioning first" stamp="Locked">
        Brand Battle builds three directions as variants of one positioning. Generate it on the Position tab.
      </EmptyState>
    )
  }

  const options = state.strategyOptions
  const chosen = state.selectedStrategy?.direction
  const chosenOption = options.find((o) => o.direction === chosen)

  if (options.length === 0) {
    return (
      <EmptyState
        title="Brand Battle"
        stamp="Step 02"
        action={
          <button type="button" onClick={onGenerate} disabled={busy} className={btnPrimary}>
            Generate 3 directions <Arrow />
          </button>
        }
      >
        Three strategic directions, built on deliberately different archetypes so the trade-offs are real. BRANDOS
        doesn&apos;t rank them — comparing and choosing is your call.
      </EmptyState>
    )
  }

  const regenerate = () => {
    if (chosen && !confirmRegenerate) {
      setConfirmRegenerate(true)
      return
    }
    setConfirmRegenerate(false)
    onGenerate()
  }

  return (
    <div className="space-y-5">
      <SectionHeading
        aside={
          <button type="button" onClick={regenerate} disabled={busy} className={`${btnSecondary} h-8 text-xs`}>
            ↻ Regenerate directions
          </button>
        }
      >
        Brand Battle
      </SectionHeading>

      {confirmRegenerate && (
        <div className="rounded-2xl border-2 border-[#f2c94c] bg-[#f2c94c]/15 px-4 py-3 animate-in fade-in-0 slide-in-from-top-1 duration-300" role="alert">
          <p className="text-sm font-extrabold">Regenerating discards your chosen direction.</p>
          <p className="mt-1 text-sm font-semibold">
            Shape and Visual were built on it and will be marked as needing an update.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={regenerate} className={cn(btnPrimary, 'h-9')}>
              Regenerate anyway
            </button>
            <button type="button" onClick={() => setConfirmRegenerate(false)} className={cn(btnSecondary, 'h-9')}>
              Keep my choice
            </button>
          </div>
        </div>
      )}

      <p className="text-sm font-semibold text-poster-ink/60">
        {options.length} directions, not ranked. Compare the risks and trade-offs, then choose one to develop.
      </p>

      <div className="grid gap-4 pt-3 xl:grid-cols-3">
        {options.map((o, i) => (
          <DirectionCard
            key={o.direction}
            option={o}
            letter={LETTERS[i] ?? String(i + 1)}
            index={i}
            chosen={o.direction === chosen}
            dimmed={!!chosen && o.direction !== chosen}
            busy={busy}
            onChoose={() => onChoose(o.direction)}
            onEdit={(text) => onEditDirection(o.direction, text)}
          />
        ))}
      </div>

      {chosenOption && (
        <div key={chosenOption.direction} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-poster-ink bg-poster-green/15 px-4 py-3 shadow-[4px_4px_0_0_#111] animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <p className="text-sm font-extrabold">
            ✓ Direction {LETTERS[options.indexOf(chosenOption)]} selected — &ldquo;{chosenOption.name}&rdquo;
          </p>
          <button type="button" onClick={onContinue} className={`ml-auto ${btnPrimary}`}>
            Continue to Shape <Arrow />
          </button>
        </div>
      )}
    </div>
  )
}
