import { cn } from '@/lib/utils'

/* The hero's one-point-perspective room, reused as the backdrop for every
   landing section so the page reads as one continuous poster. Same geometry
   as the room in components/ui/mascot-portfolio-hero.tsx. */

type Seg = [number, number, number, number]

function room(): { back: Seg[]; rays: Seg[]; depth: string[] } {
  const x0 = 95
  const x1 = 905
  const y0 = 85
  const y1 = 865
  const vx = (x0 + x1) / 2
  const vy = (y0 + y1) / 2
  const cols = 14
  const rows = 11
  const back: Seg[] = []
  const rays: Seg[] = []
  const out = (x: number, y: number): Seg => {
    const dx = x - vx
    const dy = y - vy
    const tx = dx > 0 ? (1000 - x) / dx : dx < 0 ? -x / dx : Infinity
    const ty = dy > 0 ? (1000 - y) / dy : dy < 0 ? -y / dy : Infinity
    const t = Math.min(tx, ty)
    return [x, y, x + dx * t, y + dy * t]
  }
  for (let i = 0; i <= cols; i++) {
    const x = x0 + ((x1 - x0) * i) / cols
    back.push([x, y0, x, y1])
    rays.push(out(x, y0), out(x, y1))
  }
  for (let j = 0; j <= rows; j++) {
    const y = y0 + ((y1 - y0) * j) / rows
    back.push([x0, y, x1, y])
    rays.push(out(x0, y), out(x1, y))
  }
  const depth = [1.07, 1.16, 1.28, 1.45, 1.7].map((s) => {
    const l = vx + (x0 - vx) * s
    const r = vx + (x1 - vx) * s
    const t = vy + (y0 - vy) * s
    const b = vy + (y1 - vy) * s
    return 'M' + l + ' ' + t + 'H' + r + 'V' + b + 'H' + l + 'Z'
  })
  return { back, rays, depth }
}

const ROOM = room()

export function PosterRoom() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full text-poster-ink"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="0.8" fill="none" opacity="0.13">
        {ROOM.back.map((s, i) => (
          <line key={'b' + i} x1={s[0]} y1={s[1]} x2={s[2]} y2={s[3]} vectorEffect="non-scaling-stroke" />
        ))}
        {ROOM.rays.map((s, i) => (
          <line key={'r' + i} x1={s[0]} y1={s[1]} x2={s[2]} y2={s[3]} vectorEffect="non-scaling-stroke" />
        ))}
        {ROOM.depth.map((d, i) => (
          <path key={'d' + i} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  )
}

export function PosterSection({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className="relative isolate flex min-h-[100svh] flex-col justify-center overflow-hidden bg-poster-paper text-poster-ink antialiased"
    >
      <PosterRoom />
      <div className={cn('relative z-10 w-full px-6 py-24 md:px-[8.8%] md:py-28', className)}>
        {children}
      </div>
    </section>
  )
}

/** The hero's index pill: green number, label beside it. */
export function SectionTag({ index, label }: { index: string; label: string }) {
  return (
    <span className="inline-flex self-start items-center gap-3 rounded-full border-2 border-poster-ink p-[3px] pr-4 text-xs font-extrabold uppercase tracking-wide">
      <b className="rounded-full bg-poster-green px-4 py-1">{index}</b>
      {label}
    </span>
  )
}
