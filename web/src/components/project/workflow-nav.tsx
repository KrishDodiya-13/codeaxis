import Link from 'next/link'
import { cn } from '@/lib/utils'

export const STEPS = [
  { key: 'discover', label: 'Discover' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'stress-test', label: 'Stress Test' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'brand-os', label: 'Brand OS' },
] as const

export type StepKey = (typeof STEPS)[number]['key']

export function Wordmark() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-3 rounded-md hover:text-poster-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-poster-green"
    >
      <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg border-2 border-poster-ink bg-white">
        <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-poster-green" />
      </span>
      <span className="font-display text-base uppercase tracking-tight">Brandos</span>
    </Link>
  )
}

/**
 * Persistent step navigation for every /project/[id]/* page.
 * Steps before `current` are done and clickable; steps after it are locked.
 */
export default function WorkflowNav({
  projectId,
  current,
  projectName,
  status,
}: {
  projectId: string
  current: StepKey
  projectName?: string
  status?: string
}) {
  const currentIndex = STEPS.findIndex((s) => s.key === current)

  return (
    <header className="relative z-10 flex flex-wrap items-center gap-x-8 gap-y-3 border-b-2 border-poster-ink bg-poster-paper px-6 py-3">
      <Wordmark />

      <nav aria-label="Workflow" className="order-3 w-full overflow-x-auto lg:order-none lg:w-auto">
        <ol className="flex items-center gap-2">
          {STEPS.map((step, i) => {
            const number = String(i + 1).padStart(2, '0')
            const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'locked'
            const pill = cn(
              'inline-flex items-center gap-2 whitespace-nowrap rounded-full border-2 py-1 pl-1 pr-3 text-xs font-extrabold uppercase tracking-wide',
              state === 'current' && 'border-poster-ink bg-white',
              state === 'done' && 'border-poster-ink/40 hover:text-poster-green',
              state === 'locked' && 'border-poster-ink/15 text-poster-ink/35'
            )
            const badge = cn(
              'rounded-full px-2 py-0.5',
              state === 'current' ? 'bg-poster-green' : 'bg-poster-ink/10'
            )
            const content = (
              <>
                <span className={badge}>{state === 'done' ? '✓' : number}</span>
                {step.label}
              </>
            )
            return (
              <li key={step.key}>
                {state === 'done' ? (
                  <Link href={`/project/${projectId}/${step.key}`} className={pill}>
                    {content}
                  </Link>
                ) : (
                  <span
                    className={pill}
                    aria-current={state === 'current' ? 'step' : undefined}
                    aria-disabled={state === 'locked' || undefined}
                    title={state === 'locked' ? 'Finish the previous step to unlock' : undefined}
                  >
                    {content}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="ml-auto min-w-0 text-right">
        {projectName && <p className="truncate text-sm font-extrabold">{projectName}</p>}
        {status && <p className="text-xs font-semibold text-poster-ink/50">{status}</p>}
      </div>
    </header>
  )
}
