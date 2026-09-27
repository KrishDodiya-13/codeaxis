'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { SPRING, btnPrimary, btnSecondary } from './ui'
import { cn } from '@/lib/utils'

/*
 * A colour picker people can use without knowing a hex code.
 *
 * Hue runs around the wheel, saturation from the grey centre to the rim, and lightness
 * sits on its own slider — the three things a person actually means by "a bit bluer",
 * "less washed out", "darker". The hex is still shown, small, for whoever needs it.
 */

type Hsl = { h: number; s: number; l: number }

export function hexToHsl(hex: string): Hsl {
  const full = hex.replace('#', '').replace(/^(.)(.)(.)$/, '$1$1$2$2$3$3')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s: s * 100, l: l * 100 }
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sat = s / 100
  const lig = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return (
    '#' +
    [f(0), f(8), f(4)]
      .map((x) => Math.round(x * 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  )
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export default function ColorWheel({
  name,
  initial,
  palette,
  onApply,
  onClose,
}: {
  /** The colour's name in the palette, e.g. "Signal Green". */
  name: string
  initial: string
  /** The rest of the palette, as quick picks. */
  palette: string[]
  onApply: (hex: string) => void
  onClose: () => void
}) {
  const [hsl, setHsl] = useState<Hsl>(() => hexToHsl(initial))
  const wheelRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const hex = hslToHex(hsl)

  // Esc closes; the wheel takes focus so arrow keys work straight away.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    wheelRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Pointer position → hue (angle, 0° at the top, clockwise) and saturation (distance). */
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const rect = wheelRef.current!.getBoundingClientRect()
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height / 2)
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
    const s = clamp((Math.hypot(dx, dy) / (rect.width / 2)) * 100, 0, 100)
    setHsl((c) => ({ ...c, h, s }))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 15 : 5
    if (e.key === 'ArrowLeft') setHsl((c) => ({ ...c, h: (c.h - step + 360) % 360 }))
    else if (e.key === 'ArrowRight') setHsl((c) => ({ ...c, h: (c.h + step) % 360 }))
    else if (e.key === 'ArrowUp') setHsl((c) => ({ ...c, s: clamp(c.s + step, 0, 100) }))
    else if (e.key === 'ArrowDown') setHsl((c) => ({ ...c, s: clamp(c.s - step, 0, 100) }))
    else if (e.key === 'Enter') onApply(hex)
    else return
    e.preventDefault()
  }

  // Marker position on the wheel, in percent from the centre.
  const rad = (hsl.h * Math.PI) / 180
  const mx = 50 + Math.sin(rad) * (hsl.s / 2)
  const my = 50 - Math.cos(rad) * (hsl.s / 2)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="presentation">
      <button type="button" aria-label="Close colour picker" onClick={onClose} className="absolute inset-0 bg-poster-ink/40 backdrop-blur-[2px] animate-in fade-in-0 duration-200" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Choose a colour for ${name}`}
        className="relative w-full max-w-md rounded-3xl border-2 border-poster-ink bg-poster-paper p-6 shadow-[8px_8px_0_0_#111] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-300"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-poster-ink/55">Change colour</p>
            <h2 className="mt-1 font-display text-2xl uppercase leading-none tracking-[-0.03em]">{name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={cn(btnSecondary, 'h-9 w-9 justify-center px-0')}>
            ✕
          </button>
        </div>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5">
          {/* The wheel: hue around the rim, greyed towards the centre. */}
          <div
            ref={wheelRef}
            role="slider"
            tabIndex={0}
            aria-label="Hue and saturation. Left and right change the hue, up and down the saturation."
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round(hsl.h)}
            aria-valuetext={`Hue ${Math.round(hsl.h)} degrees, saturation ${Math.round(hsl.s)} percent`}
            onPointerDown={(e) => {
              dragging.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
              pick(e)
            }}
            onPointerMove={(e) => dragging.current && pick(e)}
            onPointerUp={() => (dragging.current = false)}
            onKeyDown={onKeyDown}
            className="relative aspect-square w-full max-w-[240px] cursor-crosshair touch-none rounded-full border-2 border-poster-ink shadow-[4px_4px_0_0_#111] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/50"
            style={{
              background: `radial-gradient(closest-side, hsl(0 0% ${hsl.l}%), transparent), conic-gradient(from 0deg, hsl(0 100% ${hsl.l}%), hsl(60 100% ${hsl.l}%), hsl(120 100% ${hsl.l}%), hsl(180 100% ${hsl.l}%), hsl(240 100% ${hsl.l}%), hsl(300 100% ${hsl.l}%), hsl(360 100% ${hsl.l}%))`,
            }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_2px_#111]"
              style={{ left: `${mx}%`, top: `${my}%`, backgroundColor: hex }}
            />
          </div>

          {/* Before → after, big enough to judge. */}
          <div className="space-y-2 text-center">
            <div className="h-16 w-16 rounded-2xl border-2 border-poster-ink" style={{ backgroundColor: initial }} title="Current" />
            <span aria-hidden="true" className="block text-poster-ink/40">↓</span>
            <div
              key={hex}
              className="h-16 w-16 rounded-2xl border-2 border-poster-ink shadow-[3px_3px_0_0_#111] animate-in zoom-in-95 duration-150"
              style={{ backgroundColor: hex }}
              title="New"
            />
            <p className="font-mono text-[11px] font-bold text-poster-ink/50">{hex}</p>
          </div>
        </div>

        <label className="mt-6 block">
          <span className="text-xs font-extrabold uppercase tracking-wide text-poster-ink/60">Lightness</span>
          <input
            type="range"
            min={5}
            max={95}
            value={Math.round(hsl.l)}
            onChange={(e) => setHsl((c) => ({ ...c, l: Number(e.target.value) }))}
            className="mt-2 h-3 w-full cursor-pointer appearance-none rounded-full border-2 border-poster-ink accent-poster-ink"
            style={{ background: `linear-gradient(90deg, hsl(${hsl.h} ${hsl.s}% 5%), hsl(${hsl.h} ${hsl.s}% 50%), hsl(${hsl.h} ${hsl.s}% 95%))` }}
          />
        </label>

        {palette.length > 0 && (
          <div className="mt-5">
            <span className="text-xs font-extrabold uppercase tracking-wide text-poster-ink/60">From your palette</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {palette.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setHsl(hexToHsl(p))}
                  aria-label={`Use ${p}`}
                  className={cn(
                    'h-9 w-9 rounded-xl border-2 border-poster-ink transition-transform duration-300 hover:-translate-y-0.5 hover:rotate-[-6deg]',
                    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-poster-green/40',
                    SPRING,
                  )}
                  style={{ backgroundColor: p }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => onApply(hex)} className={cn(btnPrimary, 'h-10')}>
            ✓ Use this colour
          </button>
          <button type="button" onClick={onClose} className={cn(btnSecondary, 'h-10')}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
