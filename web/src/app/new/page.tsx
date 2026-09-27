import type { Metadata } from 'next'
import { PosterRoom } from '@/components/landing/poster-section'
import { STEPS, Wordmark } from '@/components/project/workflow-nav'
import NewProjectForm from '@/components/project/new-project-form'

export const metadata: Metadata = { title: 'New project · BRANDOS' }

/** Where the idea goes next, set like the hero's bottom row: green rule on hover. */
function StepStrip() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 pt-5">
      <span className="text-xs font-extrabold uppercase tracking-wide text-poster-ink/50">What happens next</span>
      <ol className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm font-extrabold">
        {STEPS.map((step, i) => (
          <li key={step.key} className="flex items-center gap-3">
            <span
              className="relative cursor-default pb-1 after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:origin-left after:scale-x-0 after:bg-poster-green after:transition-transform after:duration-300 hover:after:scale-x-100 motion-reduce:after:transition-none"
            >
              <span className="mr-1.5 text-poster-ink/40">{String(i + 1).padStart(2, '0')}</span>
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <span aria-hidden="true" className="text-poster-ink/30">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function NewProjectPage() {
  return (
    <main className="relative isolate min-h-[100svh] overflow-hidden bg-poster-paper text-poster-ink antialiased">
      <PosterRoom />
      <div className="relative z-10 flex min-h-[100svh] flex-col p-6 md:p-10">
        <Wordmark />
        <div className="flex flex-1 items-center justify-center py-12">
          <NewProjectForm />
        </div>
        <StepStrip />
      </div>
    </main>
  )
}
