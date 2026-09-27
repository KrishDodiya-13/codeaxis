import { cn } from '@/lib/utils'

/*
 * Quirky poster stickers around the /new form, in the landing hero's language:
 * stamps, a taped note, a speech bubble, a starburst, the spinning flower and a
 * hand-drawn arrow. Purely decorative (aria-hidden) and only shown at xl widths,
 * where the page has empty margins. Every motion stops under prefers-reduced-motion.
 *
 * Positions are relative to the form (which is `relative`), so they track it.
 */

const SPRING = 'ease-[cubic-bezier(.3,1.6,.5,1)]'

/** A 14-point starburst centred in a 120x120 box. */
function starburstPath() {
  const points = 14
  let d = ''
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 58 : 46
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2
    d += `${i ? 'L' : 'M'}${(60 + Math.cos(a) * r).toFixed(1)} ${(60 + Math.sin(a) * r).toFixed(1)}`
  }
  return d + 'Z'
}

/** The hero's five-petal flower, as one closed outline. */
function flowerPath() {
  const n = 180
  const lens = [1, 0.84, 0.95, 0.78, 0.9]
  let d = ''
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const k = Math.floor(((a + Math.PI / 5) / (Math.PI * 2)) * 5) % 5
    const lobe = Math.pow(Math.abs(Math.cos((a * 5) / 2)), 0.9)
    const r = 50 * (0.3 + 0.7 * lobe * (lens[k] ?? 1))
    d += `${i ? 'L' : 'M'}${(60 + Math.cos(a - Math.PI / 2) * r).toFixed(1)} ${(60 + Math.sin(a - Math.PI / 2) * r).toFixed(1)}`
  }
  return d + 'Z'
}

const STARBURST = starburstPath()
const FLOWER = flowerPath()

export default function IdeaStickers() {
  return (
    <div aria-hidden="true" className="hidden xl:block">
      {/* Footnote for the stamp's asterisk. */}
      <p className="absolute right-3 top-[84px] rotate-[-4deg] text-xs font-bold italic text-poster-ink/60">
        *half-baked is our favourite kind.
      </p>

      {/* Hand-drawn arrow from the stamp down to the starburst, drawn after the swash. */}
      <svg
        viewBox="0 0 100 150"
        className="pointer-events-none absolute -right-[118px] top-[96px] h-[132px] w-[88px] overflow-visible"
      >
        <path
          pathLength={1}
          d="M8 6 C60 4 92 30 70 58 C54 78 30 64 44 46 C58 30 86 58 80 96 C77 114 70 126 62 138 M50 124 L62 140 L76 126"
          className="animate-draw fill-none stroke-poster-ink [animation-delay:1.4s] [stroke-dasharray:1] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.5px] motion-reduce:animate-none"
        />
      </svg>

      {/* Taped sticky note beside the headline; wiggles on hover like the hero's beanie tag. */}
      <div className="group absolute -left-[212px] top-[18px] w-[170px] cursor-default">
        <div
          className={cn(
            'origin-top rotate-[-6deg] rounded-sm border-2 border-poster-ink bg-white px-4 pb-4 pt-6 shadow-[4px_4px_0_#111111]',
            'group-hover:animate-wiggle motion-reduce:group-hover:animate-none'
          )}
        >
          <span className="absolute -top-3 left-1/2 h-5 w-16 -translate-x-1/2 rotate-[4deg] border border-poster-ink/30 bg-poster-green/70" />
          <p className="font-display text-lg uppercase leading-[0.95] tracking-[-0.02em]">Napkin sketches welcome</p>
          <p className="mt-2 text-[11px] font-bold text-poster-ink/55">Coffee stains optional.</p>
        </div>
      </div>

      {/* Speech bubble pointing at the Speak button. Bobs gently. */}
      <div className="absolute -left-[218px] top-[372px] w-[180px] animate-bob motion-reduce:animate-none">
        <div className="relative rounded-2xl rounded-br-sm border-2 border-poster-ink bg-white px-4 py-3 shadow-[4px_4px_0_#5fb57a]">
          <p className="text-sm font-extrabold leading-tight">Hate typing? Just say it out loud.</p>
          <span className="absolute -bottom-[9px] right-4 h-4 w-4 rotate-45 border-b-2 border-r-2 border-poster-ink bg-white" />
        </div>
        <p className="mt-3 text-right text-2xl font-extrabold leading-none">↘</p>
      </div>

      {/* Green starburst beside the idea box. The star spins, the words hold still. */}
      <div
        className={cn(
          'group absolute -right-[182px] top-[248px] grid h-[138px] w-[138px] cursor-default place-items-center',
          'transition-transform duration-500 hover:scale-110',
          SPRING,
          'motion-reduce:transition-none motion-reduce:hover:scale-100'
        )}
      >
        <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full animate-spin-slower motion-reduce:animate-none">
          <path d={STARBURST} className="fill-poster-green stroke-poster-ink [stroke-linejoin:round] [stroke-width:2]" />
        </svg>
        <p className="relative rotate-[8deg] text-center font-display text-[13px] uppercase leading-[1] tracking-[-0.01em]">
          Zero
          <br />
          jargon
          <br />
          needed
        </p>
      </div>

      {/* The hero's flower, spinning by the buttons. Hover pops it. */}
      <div className="absolute -right-[150px] top-[560px] h-[92px] w-[92px] animate-spin-slow cursor-grab motion-reduce:animate-none">
        <svg
          viewBox="0 0 120 120"
          className={cn(
            'h-full w-full overflow-visible transition-transform duration-500 hover:rotate-[40deg] hover:scale-[1.18]',
            'ease-[cubic-bezier(.3,1.8,.5,1)] motion-reduce:transition-none'
          )}
        >
          <path d={FLOWER} className="fill-white stroke-poster-ink [stroke-linejoin:round] [stroke-width:2.6]" />
          <circle cx="60" cy="60" r="4" className="fill-none stroke-poster-ink [stroke-width:2]" />
        </svg>
      </div>
    </div>
  )
}
