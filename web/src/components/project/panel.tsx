import HoverLetters from '@/components/hover-letters'
import { cn } from '@/lib/utils'

/** A workspace column in the poster style: ink border, white card, pill label. */
export function Panel({
  index,
  label,
  title,
  children,
  footer,
  className,
  delay = 0,
  busy = false,
}: {
  index: string
  label: string
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  /** Entrance delay in ms, so a row of panels rises in one after another. */
  delay?: number
  /** The engine is working on this panel's content: shows the chasing ring and a tag. */
  busy?: boolean
}) {
  return (
    <section
      aria-label={label}
      aria-busy={busy || undefined}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        'relative flex min-h-0 flex-col rounded-3xl border-2 border-poster-ink bg-white/80 transition-shadow duration-500',
        // backwards fill: holds the start frame only during the delay, then lets go.
        'animate-in fade-in-0 slide-in-from-bottom-3 fill-mode-backwards duration-500',
        busy && 'shadow-[6px_6px_0_0_rgba(95,181,122,0.45)]',
        className,
      )}
    >
      {busy && (
        // Offset by the panel's stagger so neighbouring rings chase out of step.
        <span aria-hidden="true" className="engine-ring" style={{ animationDelay: `-${delay * 4}ms` }} />
      )}
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-poster-ink/10 px-5 py-4">
        {/* The number tag wiggles on hover, like the landing's tags. */}
        <span className="group inline-flex cursor-default items-center gap-3 rounded-full border-2 border-poster-ink p-[3px] pr-4 text-xs font-extrabold uppercase tracking-wide">
          <b className="rounded-full bg-poster-green px-3 py-0.5 group-hover:animate-wiggle motion-reduce:group-hover:animate-none">
            {index}
          </b>
          {label}
        </span>
        {busy && (
          <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-poster-ink px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-poster-paper animate-in fade-in-0 zoom-in-95 duration-300">
            <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-poster-green motion-reduce:animate-none" />
            Engine working
          </span>
        )}
        {title && (
          <h2 className="mt-0 w-full font-display text-2xl uppercase leading-none tracking-[-0.03em]">
            <HoverLetters text={title} />
          </h2>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      {footer && <div className="border-t-2 border-poster-ink/10 px-5 py-4">{footer}</div>}
    </section>
  )
}

/** Small uppercase field label used across project pages. */
export function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-xs font-extrabold uppercase tracking-wide text-poster-ink/60', className)}>{children}</p>
}
