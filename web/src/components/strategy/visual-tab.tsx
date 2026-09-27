'use client'

import { useEffect, useState } from 'react'
import type { BrandState } from 'brandstate'
import type { DecisionStatus, Stage } from '@/lib/strategy'
import HoverLetters from '@/components/hover-letters'
import { cn } from '@/lib/utils'
import ColorWheel from './color-wheel'
import { humanize } from '@/lib/humanize'
import { Arrow, Chips, DecisionField, EmptyState, SPRING, SectionHeading, Stamp, btnPrimary, btnSecondary } from './ui'

export const VISUAL_TEXT_FIELDS = [
  { key: 'typography', label: 'Typography direction' },
  { key: 'shapes', label: 'Shape language' },
  { key: 'imagery', label: 'Imagery direction' },
  { key: 'composition', label: 'Composition' },
  { key: 'mood', label: 'Visual mood' },
] as const

export const VISUAL_KEYS = ['visualDirection.colors', ...VISUAL_TEXT_FIELDS.map((f) => `visualDirection.${f.key}`)]

/** A small glyph per direction field, so the grid scans at a glance. */
const GLYPHS: Record<(typeof VISUAL_TEXT_FIELDS)[number]['key'], string> = {
  typography: 'Aa',
  shapes: '◆',
  imagery: '◐',
  composition: '▦',
  mood: '✺',
}

const HEX = /#(?:[0-9a-f]{3}){1,2}\b/i

interface Swatch {
  line: string
  hex?: string
  name: string
  note: string
}

/** "Deep Teal #0F4C5C — primary — carries trust" → name, hex, and the rest as a note. */
function parseColor(line: string): Swatch {
  const hex = line.match(HEX)?.[0]
  if (!hex) return { line, name: line, note: '' }
  const [before, ...after] = line.split(hex)
  const name = before.replace(/[\s—\-–:·,(]+$/, '').trim() || hex.toUpperCase()
  const note = after.join(hex).replace(/^[\s—\-–:·,)]+/, '').trim()
  return { line, hex: hex.toUpperCase(), name, note }
}

/** Relative luminance, to pick ink or paper text that stays readable on a swatch. */
function isDark(hex: string): boolean {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4
}

/** A palette tile: lifts and tilts on hover, copies its hex on click with a stamp to confirm. */
function SwatchTile({ swatch, index, disabled, onChange }: { swatch: Swatch; index: number; disabled: boolean; onChange: () => void }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 1400)
    return () => window.clearTimeout(id)
  }, [copied])

  const copy = async () => {
    if (!swatch.hex) return
    try {
      await navigator.clipboard.writeText(swatch.hex)
      setCopied(true)
    } catch {
      // Clipboard blocked (permissions, insecure context): the hex is on the tile anyway.
    }
  }

  const dark = swatch.hex ? isDark(swatch.hex) : false

  return (
    <li
      style={{ animationDelay: `${index * 80}ms` }}
      className="animate-in fade-in-0 slide-in-from-bottom-3 fill-mode-backwards duration-500"
    >
      <div className="flex h-full flex-col gap-2">
      <button
        type="button"
        onClick={copy}
        disabled={!swatch.hex}
        aria-label={swatch.hex ? `${swatch.name}, ${swatch.hex}. Copy hex` : swatch.line}
        className={cn(
          'group/sw relative flex h-full w-full flex-col overflow-hidden rounded-2xl border-2 border-poster-ink bg-white text-left',
          'transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:rotate-[-1deg] hover:shadow-[5px_5px_0_0_#111]',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40',
          'motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:rotate-0',
          'disabled:cursor-default',
          SPRING,
        )}
      >
        <span
          className="relative block h-24 border-b-2 border-poster-ink transition-[height] duration-300 group-hover/sw:h-28"
          style={swatch.hex ? { backgroundColor: swatch.hex } : undefined}
        >
          {!swatch.hex && (
            <span className="grid h-full place-items-center text-xs font-bold text-poster-ink/40">No hex given</span>
          )}
          {swatch.hex && (
            <span
              className={cn(
                'absolute bottom-2 left-3 font-mono text-xs font-bold opacity-0 transition-opacity duration-300 group-hover/sw:opacity-100 group-focus-visible/sw:opacity-100',
                dark ? 'text-white' : 'text-poster-ink',
              )}
            >
              Click to copy
            </span>
          )}
          {copied && <Stamp className="absolute right-2 top-2">✓ Copied</Stamp>}
        </span>
        <span className="block px-3 py-2.5">
          <span className="block break-words text-sm font-extrabold leading-tight">{swatch.name}</span>
          {swatch.hex && <span className="mt-0.5 block font-mono text-[11px] font-bold text-poster-ink/55">{swatch.hex}</span>}
          {swatch.note && <span className="mt-1 line-clamp-2 block text-xs font-semibold leading-snug text-poster-ink/60">{swatch.note}</span>}
        </span>
      </button>
      {/* Pick a new colour on a wheel — no hex code needed. */}
      <button
        type="button"
        onClick={onChange}
        disabled={disabled}
        className={cn(
          'group/pick inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-poster-ink bg-white px-3 py-1.5 text-xs font-extrabold',
          'transition-[transform,background-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:bg-poster-green hover:shadow-[3px_3px_0_0_#111]',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40 disabled:cursor-not-allowed disabled:opacity-40',
          SPRING,
        )}
      >
        <span
          aria-hidden="true"
          className={cn('h-3.5 w-3.5 rounded-full border border-poster-ink transition-transform duration-500 group-hover/pick:rotate-180', SPRING)}
          style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
        />
        Change colour
      </button>
      </div>
    </li>
  )
}

/**
 * The palette put to work on a tiny poster. Honest about what it is: the colors are
 * theirs, the type is BRANDOS's own display face, not their typography direction.
 */
function PalettePreview({ swatches, name, tagline }: { swatches: Swatch[]; name?: string; tagline?: string }) {
  const hexes = swatches.map((s) => s.hex).filter((h): h is string => !!h)
  if (hexes.length === 0) return null
  const bg = hexes[0]
  const accent = hexes[1] ?? '#5fb57a'
  const third = hexes[2] ?? accent
  const text = isDark(bg) ? '#ffffff' : '#111111'
  const accentText = isDark(accent) ? '#ffffff' : '#111111'

  return (
    <figure className="animate-in fade-in-0 zoom-in-95 duration-500">
      <div
        className={cn(
          'group/prev relative aspect-[4/3] overflow-hidden rounded-2xl border-2 border-poster-ink p-5 shadow-[5px_5px_0_0_#111]',
          'transition-transform duration-500 hover:-rotate-[0.8deg] motion-reduce:transition-none motion-reduce:hover:rotate-0',
          SPRING,
        )}
        style={{ backgroundColor: bg, color: text }}
      >
        <span
          aria-hidden="true"
          className="absolute -bottom-10 -right-10 h-36 w-36 rounded-full border-2 border-poster-ink transition-transform duration-700 group-hover/prev:scale-110"
          style={{ backgroundColor: accent }}
        />
        <span
          aria-hidden="true"
          className="absolute right-16 top-6 h-8 w-8 rotate-12 rounded-lg border-2 border-poster-ink transition-transform duration-700 group-hover/prev:rotate-45"
          style={{ backgroundColor: third }}
        />
        <p className="relative text-[10px] font-extrabold uppercase tracking-widest opacity-70">Palette preview</p>
        <p className="relative mt-4 max-w-[80%] font-display text-3xl uppercase leading-[0.9] tracking-[-0.04em]">{name ?? 'Your brand'}</p>
        {tagline && <p className="relative mt-2 max-w-[75%] text-sm font-semibold leading-snug opacity-85">{tagline}</p>}
        <span
          className="relative mt-4 inline-flex rounded-full border-2 border-poster-ink px-3 py-1 text-xs font-extrabold"
          style={{ backgroundColor: accent, color: accentText }}
        >
          Get started →
        </span>
      </div>
      <figcaption className="mt-2 text-[11px] font-semibold text-poster-ink/50">
        Your colors on a sample layout. The type here is BRANDOS&apos;s, not your typography direction.
      </figcaption>
    </figure>
  )
}

/** Wraps each personality trait that appears in the text in a green highlight. */
function HighlightTraits({ text, traits }: { text: string; traits: string[] }) {
  const words = traits.map((t) => t.trim()).filter((t) => t.length > 2)
  if (words.length === 0) return <>{text}</>
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const lower = words.map((w) => w.toLowerCase())
  return (
    <>
      {text.split(pattern).map((part, i) =>
        lower.includes(part.toLowerCase()) ? (
          <mark
            key={i}
            className="rounded-md bg-poster-green px-1 text-poster-ink transition-colors duration-200 hover:bg-poster-paper"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
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
  // Which swatch the colour wheel is open for. Declared before the early returns below.
  const [picking, setPicking] = useState<number | null>(null)

  if (!state || state.personality.traits.length === 0) {
    return (
      <EmptyState title="Shape first" stamp="Locked">
        Every visual choice has to trace back to a personality trait, so the visual direction is built after Shape.
      </EmptyState>
    )
  }

  const v = state.visualDirection
  if (v.mood === '') {
    return (
      <EmptyState
        title="Visual direction"
        stamp="Step 04"
        action={
          <button type="button" onClick={onGenerate} disabled={busy} className={btnPrimary}>
            Generate visual direction <Arrow />
          </button>
        }
      >
        A strategic visual brief — color, type, shape, imagery and mood — where each choice is tied to your personality
        and positioning, not picked at random.
      </EmptyState>
    )
  }

  const status = (key: string) => decisions[key] ?? 'proposed'
  const swatches = v.colors.map(parseColor)
  const picked = picking === null ? null : swatches[picking]

  /** Swap the chosen swatch's colour in its line, keeping its name and role. */
  const applyColour = (index: number, hex: string) => {
    const lines = v.colors.map((line, i) => (i !== index ? line : HEX.test(line) ? line.replace(HEX, hex) : `${line} ${hex}`))
    onEdit('visualDirection.colors', 'Color direction', lines.join('\n'))
    setPicking(null)
  }
  const settledCount = VISUAL_KEYS.filter((k) => decisions[k] === 'accepted' || decisions[k] === 'edited').length

  return (
    <div className="space-y-6">
      {picked?.hex && picking !== null && (
        <ColorWheel
          name={picked.name}
          initial={picked.hex}
          palette={swatches.map((s) => s.hex).filter((h): h is string => !!h && h !== picked.hex)}
          onApply={(hex) => applyColour(picking, hex)}
          onClose={() => setPicking(null)}
        />
      )}
      <SectionHeading
        aside={
          <div className="flex items-center gap-3">
            <span className="text-xs font-extrabold uppercase tracking-wide text-poster-ink/50 tabular-nums">
              {settledCount}/{VISUAL_KEYS.length} settled
            </span>
            <button type="button" onClick={onGenerate} disabled={busy} className={cn(btnSecondary, 'h-8 text-xs')}>
              ↻ Regenerate
            </button>
          </div>
        }
      >
        Visual direction
        {stale.includes('visualDirection') && <span className="text-[#b7791f]"> · ⚠ may need update</span>}
      </SectionHeading>

      {/* The mood as a headline, with the personality encoding beneath and the traits lit up. */}
      <div
        className={cn(
          'group/mood relative overflow-hidden rounded-3xl border-2 border-poster-ink bg-poster-ink p-6 text-poster-paper shadow-[6px_6px_0_0_#5fb57a]',
          'animate-in fade-in-0 zoom-in-95 duration-500',
        )}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 animate-spin-slow rounded-[38%] border-2 border-poster-paper/20 motion-reduce:animate-none"
        />
        <p className="relative text-[11px] font-extrabold uppercase tracking-widest text-poster-paper/55">Visual mood</p>
        <p
          className={cn(
            'relative mt-2 font-display uppercase leading-[0.95] tracking-[-0.04em]',
            // A mood can be a word or a sentence; size it so a long one doesn't flood the card.
            v.mood.length > 70 ? 'text-xl' : v.mood.length > 35 ? 'text-2xl' : 'text-[clamp(1.5rem,3vw,2.4rem)]',
          )}
        >
          <HoverLetters text={v.mood} />
        </p>
        <p className="relative mt-4 text-[11px] font-extrabold uppercase tracking-widest text-poster-paper/55">
          How it encodes the personality
        </p>
        <p className="relative mt-1 max-w-3xl font-semibold leading-relaxed">
          <HighlightTraits text={humanize(v.visualPersonality)} traits={state.personality.traits} />
        </p>
      </div>

      <DecisionField
        label="Color direction · click a swatch to copy"
        status={status('visualDirection.colors')}
        editValue={v.colors.join('\n')}
        multiline
        disabled={busy}
        onDecide={(s) => onDecide('visualDirection.colors', 'Color direction', s)}
        onEdit={(t) => onEdit('visualDirection.colors', 'Color direction', t)}
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
          <ul className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-3 xl:grid-cols-2">
            {swatches.map((s, i) => (
              <SwatchTile key={`${i}-${s.line}`} swatch={s} index={i} disabled={busy} onChange={() => setPicking(i)} />
            ))}
          </ul>
          <PalettePreview swatches={swatches} name={state.naming.selectedName} tagline={state.naming.tagline.selected} />
        </div>
      </DecisionField>

      <div className="grid gap-3 xl:grid-cols-2">
        {VISUAL_TEXT_FIELDS.map((f, i) => (
          <div
            key={f.key}
            style={{ animationDelay: `${i * 70}ms` }}
            className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-backwards duration-500"
          >
            <DecisionField
              label={f.label}
              status={status(`visualDirection.${f.key}`)}
              editValue={v[f.key]}
              disabled={busy}
              onDecide={(s) => onDecide(`visualDirection.${f.key}`, f.label, s)}
              onEdit={(t) => onEdit(`visualDirection.${f.key}`, f.label, t)}
            >
              <div className="group/f flex gap-3">
                {f.key === 'typography' ? (
                  // The type field gets a specimen: a big "Aa" that tilts and greens on hover.
                  <span
                    aria-hidden="true"
                    className={cn(
                      'shrink-0 font-display text-5xl leading-none transition-[transform,color] duration-500 group-hover/f:-rotate-6 group-hover/f:scale-110 group-hover/f:text-poster-green',
                      'motion-reduce:transition-none',
                      SPRING,
                    )}
                  >
                    Aa
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-poster-ink bg-poster-green/15 text-sm font-extrabold transition-[transform,background-color] duration-300 group-hover/f:rotate-12 group-hover/f:bg-poster-green',
                      SPRING,
                    )}
                  >
                    {GLYPHS[f.key]}
                  </span>
                )}
                <p className="text-sm font-semibold leading-snug">{v[f.key]}</p>
              </div>
            </DecisionField>
          </div>
        ))}
      </div>

      {v.avoid.length > 0 && (
        <div className="rounded-2xl border-2 border-[#e5484d]/50 bg-[#e5484d]/5 px-4 py-4">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#c4282d]">✗ Keep out of the brand</p>
          <div className="mt-3">
            <Chips items={v.avoid} tone="avoid" />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t-2 border-poster-ink/10 pt-4">
        <p className="text-sm font-bold text-poster-ink/60">See how every decision connects.</p>
        <button type="button" onClick={onContinue} className={cn(btnPrimary, 'ml-auto')}>
          View Brand DNA <Arrow />
        </button>
      </div>
    </div>
  )
}
