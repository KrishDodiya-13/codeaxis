import { knownFacts, type DiscoverResult } from '@/lib/discovery'
import { Panel } from '@/components/project/panel'
import { SPRING } from '@/components/strategy/ui'
import { cn } from '@/lib/utils'

function Group({
  marker,
  markerClass,
  title,
  count,
  children,
}: {
  marker: string
  markerClass: string
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <details open className="group/g border-t-2 border-poster-ink/10 pt-4 first:border-t-0 first:pt-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-extrabold uppercase tracking-wide hover:text-poster-green">
        {/* The marker wiggles on hover, like the landing's tags. */}
        <span
          aria-hidden="true"
          className={`grid h-6 w-6 place-items-center rounded-full border-2 border-poster-ink text-xs group-hover/g:animate-wiggle motion-reduce:group-hover/g:animate-none ${markerClass}`}
        >
          {marker}
        </span>
        {title}
        {/* Keyed on the count, so it pops whenever the number changes. */}
        <span
          key={count}
          className="rounded-full border-2 border-poster-ink/20 px-2 text-xs text-poster-ink/60 animate-in zoom-in-50 duration-300"
        >
          {count}
        </span>
        <span
          aria-hidden="true"
          className={cn('ml-auto text-poster-ink/40 transition-transform duration-300 group-open/g:rotate-180', SPRING)}
        >
          ▾
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}

function None({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold text-poster-ink/40">{children}</p>
}

/** Stagger for list items, so a group fills in one line after another. */
const stagger = (i: number) => ({ animationDelay: `${Math.min(i, 10) * 50}ms` })
const itemIn = 'animate-in fade-in-0 slide-in-from-right-2 fill-mode-backwards duration-300'

/** Right panel: read-only view of what is known, still unknown, and assumed. */
export default function ContextPanel({
  discovery,
  canConfirm,
  onConfirm,
}: {
  discovery: DiscoverResult | null
  canConfirm: boolean
  onConfirm: (assumption: string) => void
}) {
  if (!discovery) {
    return (
      <Panel index="03" label="Known / Unknown / Assumed" delay={180}>
        <div className="grid place-items-center rounded-3xl border-2 border-dashed border-poster-ink/20 px-4 py-10 text-center">
          <span aria-hidden="true" className="inline-flex gap-1.5">
            {['bg-poster-green', 'bg-white', 'bg-[#f2c94c]'].map((bg, i) => (
              <span
                key={bg}
                style={{ animationDelay: `${i * 160}ms` }}
                className={`h-4 w-4 animate-bounce rounded-full border-2 border-poster-ink motion-reduce:animate-none ${bg}`}
              />
            ))}
          </span>
          <None>
            <span className="mt-3 block">Waiting for the first read of your idea.</span>
          </None>
        </div>
      </Panel>
    )
  }

  const known = knownFacts(discovery)

  return (
    <Panel index="03" label="Known / Unknown / Assumed" delay={180}>
      <div className="space-y-5">
        <Group marker="●" markerClass="bg-poster-green" title="Known" count={known.length}>
          <ul className="space-y-2 text-sm">
            {known.map((f, i) => (
              <li
                key={`${f.label}-${f.value}`}
                style={stagger(i)}
                className={cn('rounded-lg px-2 py-1 leading-snug transition-colors duration-200 hover:bg-poster-green/10', itemIn)}
              >
                <span className="font-extrabold">{f.label}:</span> <span className="font-semibold">{f.value}</span>
              </li>
            ))}
          </ul>
        </Group>

        <Group marker="○" markerClass="bg-white" title="Unknown" count={discovery.missingInformation.length}>
          {discovery.missingInformation.length === 0 ? (
            <None>Nothing missing.</None>
          ) : (
            <ul className="space-y-2 text-sm font-semibold leading-snug">
              {discovery.missingInformation.map((gap, i) => (
                <li
                  key={gap}
                  style={stagger(i)}
                  className={cn('flex gap-2 rounded-lg border-2 border-dashed border-poster-ink/20 px-3 py-2 transition-colors duration-200 hover:border-poster-ink/50', itemIn)}
                >
                  <span aria-hidden="true" className="text-poster-ink/40">○</span>
                  {gap}
                </li>
              ))}
            </ul>
          )}
        </Group>

        <Group marker="~" markerClass="bg-[#f2c94c]" title="Assumptions" count={discovery.assumptions.length}>
          {discovery.assumptions.length === 0 ? (
            <None>No assumptions — everything above came from you.</None>
          ) : (
            <ul className="space-y-3 text-sm">
              {discovery.assumptions.map((a, i) => (
                <li
                  key={a}
                  style={stagger(i)}
                  className={cn(
                    'group/a rounded-2xl border-2 border-[#f2c94c] bg-[#f2c94c]/15 px-3 py-2',
                    'transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-poster-ink hover:shadow-[4px_4px_0_0_#f2c94c]',
                    'motion-reduce:hover:translate-y-0',
                    SPRING,
                    itemIn,
                  )}
                >
                  <p className="font-semibold leading-snug">{a}</p>
                  <button
                    type="button"
                    disabled={!canConfirm}
                    onClick={() => onConfirm(a)}
                    className="group/c mt-2 inline-flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide underline decoration-poster-green decoration-2 underline-offset-4 transition-[text-underline-offset] duration-200 hover:text-poster-green hover:underline-offset-[6px] disabled:cursor-not-allowed disabled:text-poster-ink/35 disabled:no-underline"
                  >
                    Ask me to confirm
                    <span aria-hidden="true" className={cn('inline-block transition-transform duration-300 group-hover/c:translate-x-1', SPRING)}>
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Group>
      </div>
    </Panel>
  )
}
